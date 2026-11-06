package com.mosupansa.app;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Context;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.DisplayMetrics;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * โมกดหน้าจอแทน (ระบบช่วยการเข้าถึง): หาช่องค้นหาในแอป → พิมพ์ → ค้นหา → กดผลแรก
 * ทำเฉพาะตอนเจ้าของสั่งเท่านั้น ไม่อ่าน/ไม่เก็บหน้าจอเอง
 * กันพลาด: ไม่พิมพ์ลงช่องรหัสผ่าน และไม่แตะแอปธนาคาร/กระเป๋าเงิน
 */
public class MoAccessibilityService extends AccessibilityService {

    static MoAccessibilityService instance;

    interface Done { void done(boolean ok, String step); }

    private Handler worker;

    // แอปการเงิน: โมไม่แตะเด็ดขาด (กันกดผิดตอนเงินจริง)
    private static final String[] FINANCE = { "bank", "kbank", "kplus", "scb", "krungthai", "ktb", "bualuang", "bbl", "krungsri", "kma", "ttb", "gsb", "baac",
        "truemoney", "wallet", "paypal", "promptpay", "pay.", ".pay", "shopeepay", "linepay", "rabbit", "binance", "bitkub", "crypto", "stock", "settrade" };

    static boolean isEnabled(Context ctx) {
        String list = Settings.Secure.getString(ctx.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        return list != null && list.toLowerCase(Locale.ROOT).contains((ctx.getPackageName() + "/").toLowerCase(Locale.ROOT)) && instance != null;
    }

    static boolean isFinance(String pkg) {
        String p = pkg == null ? "" : pkg.toLowerCase(Locale.ROOT);
        for (String f : FINANCE) if (p.contains(f)) return true;
        return false;
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        HandlerThread t = new HandlerThread("mo-a11y");
        t.start();
        worker = new Handler(t.getLooper());
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {}

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }

    // =============== งานหลัก ===============

    /** อยู่ในแอป pkg แล้ว: ค้นหา query → (pickFirst) กดผลแรก */
    void search(String pkg, String query, boolean pickFirst, Done cb) {
        worker.post(() -> {
            String step = "app";
            try {
                if (isFinance(pkg)) { cb.done(false, "finance"); return; }
                ChatHeadService.collapseNow();
                target = pkg;
                if (!waitFor(() -> appRoot() != null, 8000)) { cb.done(false, "app"); return; }
                sleep(900);

                // 1) ช่องพิมพ์ (ถ้ายังไม่มี กดปุ่มค้นหาก่อน)
                step = "searchbox";
                AccessibilityNodeInfo field = findField();
                if (field == null) {
                    AccessibilityNodeInfo btn = findSearchButton();
                    if (btn == null) { cb.done(false, step); return; }
                    click(btn);
                    final AccessibilityNodeInfo[] got = { null };
                    waitFor(() -> (got[0] = findField()) != null, 4000);
                    field = got[0];
                }
                if (field == null) { cb.done(false, step); return; }
                if (field.isPassword()) { cb.done(false, "password"); return; }

                // 2) พิมพ์ + ค้นหา
                step = "type";
                field.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
                field.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                Bundle args = new Bundle();
                args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, query);
                if (!field.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) { cb.done(false, step); return; }
                sleep(500);
                Rect fieldBox = new Rect();
                field.getBoundsInScreen(fieldBox);
                step = "submit";
                boolean submitted = false;
                if (Build.VERSION.SDK_INT >= 30) {
                    AccessibilityNodeInfo f = findField();
                    if (f != null) submitted = f.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());
                }
                if (!submitted) {
                    AccessibilityNodeInfo sug = findText(query, fieldBox.bottom);
                    if (sug != null) submitted = click(sug);
                }
                if (!submitted) {
                    AccessibilityNodeInfo btn = findSearchButton();
                    if (btn != null) submitted = click(btn);
                }
                if (!submitted) { cb.done(false, step); return; }
                if (!pickFirst) { cb.done(true, "searched"); return; }

                // 3) ผลแรก
                step = "result";
                sleep(2600);
                if (!tapFirstResult(fieldBox.bottom)) {
                    sleep(1500);
                    if (!tapFirstResult(fieldBox.bottom)) { cb.done(false, step); return; }
                }
                cb.done(true, "played");
            } catch (Exception e) {
                cb.done(false, step);
            }
        });
    }

    /** หน้าที่เปิดอยู่เป็นรายการผลค้นหาแล้ว → กดผลแรก (ใช้ต่อจากเปิดหน้าค้นหา YouTube) */
    void pickFirst(String pkg, Done cb) {
        worker.post(() -> {
            if (isFinance(pkg)) { cb.done(false, "finance"); return; }
            ChatHeadService.collapseNow();
            target = pkg;
            if (!waitFor(() -> appRoot() != null, 8000)) { cb.done(false, "app"); return; }
            sleep(2800);
            AccessibilityNodeInfo f = findField();
            Rect r = new Rect();
            if (f != null) f.getBoundsInScreen(r);
            boolean ok = tapFirstResult(r.bottom) || (sleepTrue(1500) && tapFirstResult(r.bottom));
            cb.done(ok, ok ? "played" : "result");
        });
    }

    // =============== หา node ===============

    private volatile String target = "";

    /** หน้าต่างของแอปเป้าหมาย (ไม่ใช่หน้าต่างลอยของโม/คีย์บอร์ด ที่อาจเป็นหน้าต่าง active อยู่) */
    private AccessibilityNodeInfo appRoot() {
        try {
            for (android.view.accessibility.AccessibilityWindowInfo w : getWindows()) {
                if (w.getType() != android.view.accessibility.AccessibilityWindowInfo.TYPE_APPLICATION) continue;
                AccessibilityNodeInfo r = w.getRoot();
                if (r != null && r.getPackageName() != null && r.getPackageName().toString().equals(target)) return r;
            }
        } catch (Exception ignored) {}
        AccessibilityNodeInfo r = getRootInActiveWindow();
        return r != null && r.getPackageName() != null && r.getPackageName().toString().equals(target) ? r : null;
    }

    private List<AccessibilityNodeInfo> all() {
        List<AccessibilityNodeInfo> out = new ArrayList<>();
        AccessibilityNodeInfo root = appRoot();
        if (root == null) return out;
        List<AccessibilityNodeInfo> stack = new ArrayList<>();
        stack.add(root);
        while (!stack.isEmpty() && out.size() < 4000) {
            AccessibilityNodeInfo n = stack.remove(stack.size() - 1);
            if (n == null) continue;
            out.add(n);
            for (int i = n.getChildCount() - 1; i >= 0; i--) stack.add(n.getChild(i));
        }
        return out;
    }

    private static String desc(AccessibilityNodeInfo n) {
        StringBuilder s = new StringBuilder();
        if (n.getText() != null) s.append(n.getText()).append(' ');
        if (n.getContentDescription() != null) s.append(n.getContentDescription()).append(' ');
        if (n.getViewIdResourceName() != null) s.append(n.getViewIdResourceName()).append(' ');
        if (Build.VERSION.SDK_INT >= 26 && n.getHintText() != null) s.append(n.getHintText());
        return s.toString().toLowerCase(Locale.ROOT);
    }

    private AccessibilityNodeInfo findField() {
        AccessibilityNodeInfo best = null;
        for (AccessibilityNodeInfo n : all()) {
            if (!n.isEditable() || !n.isVisibleToUser() || n.isPassword()) continue;
            if (best == null || n.isFocused()) best = n;
            String d = desc(n);
            if (d.contains("search") || d.contains("ค้นหา") || d.contains("query")) return n;
        }
        return best;
    }

    private AccessibilityNodeInfo findSearchButton() {
        for (AccessibilityNodeInfo n : all()) {
            if (!n.isVisibleToUser()) continue;
            String d = desc(n);
            if (d.contains("search") || d.contains("ค้นหา") || d.contains("สำรวจ") || d.contains("discover")) {
                AccessibilityNodeInfo c = clickableOf(n);
                if (c != null) return c;
            }
        }
        return null;
    }

    private AccessibilityNodeInfo findText(String text, int belowY) {
        String q = text.toLowerCase(Locale.ROOT).trim();
        for (AccessibilityNodeInfo n : all()) {
            if (!n.isVisibleToUser() || n.isEditable() || n.getText() == null) continue;
            Rect r = new Rect();
            n.getBoundsInScreen(r);
            if (r.top < belowY) continue;
            if (n.getText().toString().toLowerCase(Locale.ROOT).trim().equals(q)) return clickableOf(n);
        }
        return null;
    }

    private static AccessibilityNodeInfo clickableOf(AccessibilityNodeInfo n) {
        for (int i = 0; n != null && i < 6; i++, n = n.getParent()) if (n.isClickable()) return n;
        return null;
    }

    /**
     * ผลแรก = ช่องที่กดได้ "ขนาดใหญ่" (คลิป/เพลง ไม่ใช่ปุ่ม/แท็บ) ที่อยู่บนสุด-ซ้ายสุด ใต้ช่องค้นหา
     */
    private boolean tapFirstResult(int belowY) {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int w = dm.widthPixels, h = dm.heightPixels;
        int top = Math.max(belowY, (int) (h * 0.08));
        AccessibilityNodeInfo best = null;
        Rect bestR = null;
        for (AccessibilityNodeInfo n : all()) {
            if (!n.isClickable() || !n.isVisibleToUser() || n.isEditable()) continue;
            Rect r = new Rect();
            n.getBoundsInScreen(r);
            if (r.top < top || r.top > h * 0.85) continue;
            // ผล = แผ่นคลิป (กว้าง ≥ 40% สูง ≥ 18%) หรือแถวรายการเพลง (กว้าง ≥ 70% สูง ≥ 9%) — เล็กกว่านี้ = ปุ่ม/แท็บ/ชิป
            boolean tile = r.width() >= w * 0.40 && r.height() >= w * 0.18;
            boolean row = r.width() >= w * 0.70 && r.height() >= w * 0.09 && r.height() <= w * 0.45;
            if (!tile && !row) continue;
            if (r.width() > w * 0.98 && r.height() > h * 0.7) continue;      // ทั้งจอ = ตัวรายการ ไม่ใช่ผล
            String d = desc(n);
            if (d.contains("ad ") || d.contains("โฆษณา") || d.contains("sponsored")) continue;
            if (best == null || r.top < bestR.top - 8 || (Math.abs(r.top - bestR.top) <= 8 && r.left < bestR.left)) { best = n; bestR = r; }
        }
        if (best == null) {
            // แอปเว็บบางตัวไม่บอกว่ากดได้ → หาแถวที่มีชื่อเพลง/คลิป (ข้อความ) อันบนสุด แล้วแตะตรงข้อความ
            for (AccessibilityNodeInfo n : all()) {
                if (!n.isVisibleToUser() || n.isEditable() || n.getText() == null || n.getText().length() < 2) continue;
                Rect r = new Rect();
                n.getBoundsInScreen(r);
                if (r.top < top + w * 0.08 || r.top > h * 0.8 || r.left > w * 0.6) continue;
                String d = n.getText().toString();
                if (d.matches(".*(ผลการค้นหา|results|[0-9]+ *เพลง).*")) continue;
                if (bestR == null || r.top < bestR.top) { bestR = r; }
            }
            return bestR != null && tap(bestR.centerX(), bestR.centerY());
        }
        if (best.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
        return tap(bestR.centerX(), bestR.centerY());
    }

    private boolean click(AccessibilityNodeInfo n) {
        if (n.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
        Rect r = new Rect();
        n.getBoundsInScreen(r);
        return tap(r.centerX(), r.centerY());
    }

    private boolean tap(int x, int y) {
        if (Build.VERSION.SDK_INT < 24) return false;
        Path p = new Path();
        p.moveTo(x, y);
        GestureDescription g = new GestureDescription.Builder().addStroke(new GestureDescription.StrokeDescription(p, 0, 60)).build();
        return dispatchGesture(g, null, null);
    }

    // =============== ตัวช่วย ===============

    interface Cond { boolean ok(); }

    private boolean waitFor(Cond c, long ms) {
        long end = System.currentTimeMillis() + ms;
        while (System.currentTimeMillis() < end) {
            try { if (c.ok()) return true; } catch (Exception ignored) {}
            sleep(250);
        }
        return false;
    }

    private static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException ignored) {}
    }

    private static boolean sleepTrue(long ms) {
        sleep(ms);
        return true;
    }
}
