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

    // =============== โมคิดเองว่าจะกดอะไร (AI ดูจอ → ตัดสินใจทีละขั้น) ===============

    interface Progress { void step(int n, String say); }
    interface AgentDone { void done(boolean ok, String reason, String summary); }

    private volatile boolean agentCancel;

    void cancelAgent() { agentCancel = true; }

    /**
     * goal = สิ่งที่เจ้าของสั่ง (ภาษาไทยตามที่พูด) / pkg = แอปที่เพิ่งเปิด
     * แต่ละขั้น: อ่านรายการบนจอ (+ภาพจอ) → ถาม Gemini → กด/พิมพ์/เลื่อน/ย้อน → วนจน done หรือ 8 ขั้น
     */
    void agent(String pkg, String goal, String apiKey, String model, Progress progress, AgentDone cb) {
        agentCancel = false;
        worker.post(() -> {
            if (isFinance(pkg)) { cb.done(false, "finance", ""); return; }
            ChatHeadService.collapseNow();
            target = pkg;
            if (!waitFor(() -> appRoot() != null, 8000)) { cb.done(false, "app", ""); return; }
            sleep(1200);
            org.json.JSONArray history = new org.json.JSONArray();
            String lastSay = "";
            for (int step = 1; step <= 8; step++) {
                if (agentCancel) { cb.done(false, "cancel", lastSay); return; }
                AccessibilityNodeInfo root = screenRoot();
                if (root == null) { sleep(800); root = screenRoot(); }
                if (root == null) { cb.done(false, "app", lastSay); return; }
                if (isFinance(String.valueOf(root.getPackageName()))) { cb.done(false, "finance", lastSay); return; }
                List<AccessibilityNodeInfo> nodes = new ArrayList<>();
                String screen = describe(root, nodes);
                String shot = Build.VERSION.SDK_INT >= 30 ? screenshotB64() : null;
                org.json.JSONObject act;
                try {
                    act = askGemini(apiKey, model, goal, String.valueOf(root.getPackageName()), step, history, screen, shot);
                } catch (Exception e) {
                    cb.done(false, step == 1 ? "llm" : "llm-mid", lastSay);
                    return;
                }
                String a = act.optString("action", "fail");
                String say = act.optString("say", "");
                if (!say.isEmpty()) { lastSay = say; progress.step(step, say); }
                if ("done".equals(a)) { cb.done(true, "done", say); return; }
                if ("fail".equals(a)) { cb.done(false, "ai:" + act.optString("why", say), say); return; }
                boolean ok = perform(a, act, nodes);
                history.put(step + ". " + a + (act.has("id") ? " #" + act.optInt("id") : "") + (act.has("text") ? " \"" + act.optString("text") + "\"" : "") + (ok ? "" : " (ทำไม่ได้)"));
                sleep("type".equals(a) ? 700 : 1600);
            }
            cb.done(false, "steps", lastSay);
        });
    }

    /** หน้าต่างแอปที่อยู่บนจอ (แอปเป้าหมาย หรือแอปที่มันพาไป) — ไม่ใช่หน้าต่างโม/คีย์บอร์ด/แถบระบบ */
    private AccessibilityNodeInfo screenRoot() {
        AccessibilityNodeInfo r = appRoot();
        if (r != null) return r;
        try {
            for (android.view.accessibility.AccessibilityWindowInfo w : getWindows()) {
                if (w.getType() != android.view.accessibility.AccessibilityWindowInfo.TYPE_APPLICATION) continue;
                AccessibilityNodeInfo x = w.getRoot();
                if (x == null || x.getPackageName() == null) continue;
                String p = x.getPackageName().toString();
                if (p.equals(getPackageName()) || p.contains("systemui") || p.contains("inputmethod") || p.contains("keyboard")) continue;
                target = p;
                return x;
            }
        } catch (Exception ignored) {}
        return null;
    }

    /** รายการบนจอเป็นข้อความสั้นๆ ให้ AI อ่าน: [id] ชนิด "ข้อความ" (คำอธิบาย) @x,y w x h ธง */
    private String describe(AccessibilityNodeInfo root, List<AccessibilityNodeInfo> out) {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        StringBuilder sb = new StringBuilder();
        List<AccessibilityNodeInfo> queue = new ArrayList<>();
        queue.add(root);
        int seen = 0;
        while (!queue.isEmpty() && out.size() < 140 && seen++ < 3000) {
            AccessibilityNodeInfo n = queue.remove(0);
            if (n == null) continue;
            for (int i = 0; i < n.getChildCount(); i++) queue.add(n.getChild(i));
            if (!n.isVisibleToUser()) continue;
            String text = n.getText() == null ? "" : n.getText().toString().replace('\n', ' ').trim();
            String d = n.getContentDescription() == null ? "" : n.getContentDescription().toString().replace('\n', ' ').trim();
            String hint = Build.VERSION.SDK_INT >= 26 && n.getHintText() != null ? n.getHintText().toString() : "";
            boolean useful = n.isClickable() || n.isEditable() || n.isScrollable() || n.isCheckable() || !text.isEmpty() || !d.isEmpty();
            if (!useful) continue;
            Rect r = new Rect();
            n.getBoundsInScreen(r);
            if (r.width() <= 2 || r.height() <= 2 || r.bottom < 0 || r.top > dm.heightPixels) continue;
            int id = out.size();
            out.add(n);
            String cls = n.getClassName() == null ? "" : n.getClassName().toString();
            cls = cls.substring(cls.lastIndexOf('.') + 1);
            if (n.isPassword()) text = "(ช่องรหัสผ่าน ห้ามแตะ)";
            sb.append('[').append(id).append("] ").append(cls);
            if (!text.isEmpty()) sb.append(" \"").append(text.length() > 70 ? text.substring(0, 70) + "…" : text).append('"');
            if (!d.isEmpty() && !d.equals(text)) sb.append(" (").append(d.length() > 60 ? d.substring(0, 60) + "…" : d).append(')');
            if (!hint.isEmpty()) sb.append(" hint:\"").append(hint).append('"');
            sb.append(" @").append(r.left * 100 / dm.widthPixels).append(',').append(r.top * 100 / dm.heightPixels)
              .append(' ').append(r.width() * 100 / dm.widthPixels).append('x').append(r.height() * 100 / dm.heightPixels);
            if (n.isClickable()) sb.append(" click");
            if (n.isEditable()) sb.append(" edit");
            if (n.isScrollable()) sb.append(" scroll");
            if (n.isFocused()) sb.append(" focused");
            if (n.isSelected() || n.isChecked()) sb.append(" selected");
            sb.append('\n');
        }
        return sb.toString();
    }

    /** ภาพจอย่อ (JPEG base64) ให้ AI เห็นไอคอนที่ไม่มีชื่อ */
    private String screenshotB64() {
        if (Build.VERSION.SDK_INT < 30) return null;
        final String[] out = { null };
        final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
        try {
            takeScreenshot(android.view.Display.DEFAULT_DISPLAY, getMainExecutor(), new TakeScreenshotCallback() {
                @Override
                public void onSuccess(ScreenshotResult res) {
                    try {
                        android.graphics.Bitmap hw = android.graphics.Bitmap.wrapHardwareBuffer(res.getHardwareBuffer(), res.getColorSpace());
                        android.graphics.Bitmap sw = hw.copy(android.graphics.Bitmap.Config.ARGB_8888, false);
                        res.getHardwareBuffer().close();
                        int w = 480, h = Math.round(sw.getHeight() * (480f / sw.getWidth()));
                        android.graphics.Bitmap small = android.graphics.Bitmap.createScaledBitmap(sw, w, h, true);
                        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                        small.compress(android.graphics.Bitmap.CompressFormat.JPEG, 55, bos);
                        out[0] = android.util.Base64.encodeToString(bos.toByteArray(), android.util.Base64.NO_WRAP);
                    } catch (Exception ignored) {}
                    latch.countDown();
                }

                @Override
                public void onFailure(int code) { latch.countDown(); }
            });
            latch.await(3, java.util.concurrent.TimeUnit.SECONDS);
        } catch (Exception ignored) {}
        return out[0];
    }

    private org.json.JSONObject askGemini(String key, String model, String goal, String pkg, int step, org.json.JSONArray history, String screen, String shot) throws Exception {
        String prompt = "คุณคือ \"โม\" ผู้ช่วยที่กำลังใช้มือถือ Android แทนเจ้าของ ดูจอแล้วเลือกทำ 1 อย่างต่อขั้น\n"
            + "เป้าหมาย (เจ้าของสั่ง): " + goal + "\n"
            + "แอปบนจอ: " + pkg + " / ขั้นที่ " + step + " จาก 8\n"
            + "ทำไปแล้ว: " + (history.length() == 0 ? "-" : history.toString()) + "\n\n"
            + "รายการบนจอ ([id] ชนิด \"ข้อความ\" (คำอธิบาย) @ซ้าย%,บน% กว้าง%xสูง% ธง):\n" + screen + "\n"
            + "ตอบ JSON เท่านั้น: {\"action\":\"tap|type|enter|scroll_down|scroll_up|back|wait|done|fail\",\"id\":เลข,\"text\":\"สำหรับ type\",\"say\":\"บอกสั้นๆ ว่ากำลังทำอะไร (ไทย ไม่เกิน 8 คำ)\",\"why\":\"ถ้า fail\"}\n"
            + "กติกา:\n"
            + "- tap/type ต้องใช้ id จากรายการ (type = พิมพ์ลงช่อง edit ทับข้อความเดิม แล้วขั้นต่อไปค่อย enter หรือกดคำแนะนำที่ขึ้น)\n"
            + "- ค้นหา: ถ้ายังไม่มีช่องพิมพ์ให้กดปุ่ม/ไอคอนค้นหาก่อน → type คำค้น → enter → กดผลที่ตรงที่สุด (ถ้าสั่ง \"อันแรก\" = ผลแรกที่ไม่ใช่โฆษณา)\n"
            + "- done เมื่อเป้าหมายสำเร็จแล้วจริง (เช่น คลิป/เพลงกำลังเล่น หรืออยู่หน้าที่ขอแล้ว) ถ้าสั่งแค่ค้นหา ผลค้นหาขึ้นแล้ว = done\n"
            + "- มีป๊อปอัป/โฆษณา/ขอสิทธิ์บัง → ปิดหรือข้าม (ข้าม ปิด ไม่ใช่ตอนนี้ X) ห้ามกดยอมรับเงื่อนไขหรือให้สิทธิ์\n"
            + "- ห้ามเด็ดขาด (ตอบ fail): ช่องรหัสผ่าน จ่ายเงิน/ซื้อ/โอน ส่งข้อความหาคนอื่น โพสต์/คอมเมนต์ ลบ เปลี่ยนการตั้งค่าบัญชี ล็อกอิน\n"
            + "- หาไม่เจอให้ scroll ก่อน 1-2 ครั้ง ถ้ายังไม่ได้หรือวนซ้ำ → fail พร้อมเหตุผล";
        org.json.JSONArray parts = new org.json.JSONArray();
        parts.put(new org.json.JSONObject().put("text", prompt));
        if (shot != null) parts.put(new org.json.JSONObject().put("inline_data", new org.json.JSONObject().put("mime_type", "image/jpeg").put("data", shot)));
        org.json.JSONObject body = new org.json.JSONObject()
            .put("contents", new org.json.JSONArray().put(new org.json.JSONObject().put("role", "user").put("parts", parts)))
            .put("generationConfig", new org.json.JSONObject().put("temperature", 0.1).put("responseMimeType", "application/json").put("maxOutputTokens", 300));
        java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent").openConnection();
        c.setRequestMethod("POST");
        c.setConnectTimeout(8000);
        c.setReadTimeout(20000);
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json");
        c.setRequestProperty("x-goog-api-key", key);
        try (java.io.OutputStream os = c.getOutputStream()) { os.write(body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
        int code = c.getResponseCode();
        java.io.InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
        String res = new String(readAll(in), java.nio.charset.StandardCharsets.UTF_8);
        if (code >= 400) throw new Exception("gemini " + code);
        org.json.JSONObject j = new org.json.JSONObject(res);
        org.json.JSONArray ps = j.getJSONArray("candidates").getJSONObject(0).getJSONObject("content").getJSONArray("parts");
        StringBuilder t = new StringBuilder();
        for (int i = 0; i < ps.length(); i++) if (!ps.getJSONObject(i).optBoolean("thought")) t.append(ps.getJSONObject(i).optString("text"));
        String s = t.toString().trim();
        int a = s.indexOf('{'), b = s.lastIndexOf('}');
        return new org.json.JSONObject(a >= 0 && b > a ? s.substring(a, b + 1) : s);
    }

    private static byte[] readAll(java.io.InputStream in) throws java.io.IOException {
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while (in != null && (n = in.read(buf)) > 0) bos.write(buf, 0, n);
        return bos.toByteArray();
    }

    private boolean perform(String a, org.json.JSONObject act, List<AccessibilityNodeInfo> nodes) {
        int id = act.optInt("id", -1);
        AccessibilityNodeInfo n = id >= 0 && id < nodes.size() ? nodes.get(id) : null;
        switch (a) {
            case "tap": {
                if (n == null || n.isPassword()) return false;
                AccessibilityNodeInfo c = n.isClickable() ? n : clickableOf(n);
                if (c != null && c.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
                Rect r = new Rect();
                n.getBoundsInScreen(r);
                return tap(r.centerX(), r.centerY());
            }
            case "type": {
                AccessibilityNodeInfo f = n != null && n.isEditable() ? n : findField();
                if (f == null || f.isPassword()) return false;
                f.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
                f.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                Bundle args = new Bundle();
                args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, act.optString("text", ""));
                return f.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
            }
            case "enter": {
                AccessibilityNodeInfo f = n != null && n.isEditable() ? n : findField();
                return f != null && Build.VERSION.SDK_INT >= 30 && f.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());
            }
            case "scroll_down":
            case "scroll_up": {
                boolean down = "scroll_down".equals(a);
                AccessibilityNodeInfo s = n != null && n.isScrollable() ? n : null;
                if (s == null) for (AccessibilityNodeInfo x : nodes) if (x.isScrollable()) { s = x; break; }
                if (s != null && s.performAction(down ? AccessibilityNodeInfo.ACTION_SCROLL_FORWARD : AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)) return true;
                return swipe(down);
            }
            case "back":
                return performGlobalAction(GLOBAL_ACTION_BACK);
            case "wait":
                sleep(1500);
                return true;
            default:
                return false;
        }
    }

    private boolean swipe(boolean down) {
        if (Build.VERSION.SDK_INT < 24) return false;
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int x = dm.widthPixels / 2, y1 = (int) (dm.heightPixels * (down ? 0.72 : 0.32)), y2 = (int) (dm.heightPixels * (down ? 0.32 : 0.72));
        Path p = new Path();
        p.moveTo(x, y1);
        p.lineTo(x, y2);
        return dispatchGesture(new GestureDescription.Builder().addStroke(new GestureDescription.StrokeDescription(p, 0, 350)).build(), null, null);
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
