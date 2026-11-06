package com.mosupansa.app;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.AccelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.CapConfig;

/**
 * หัวแชทโม (แบบ Messenger): รูปโมกลมๆ ลอยทับแอปอื่น
 * - แตะ = เด้งหน้าต่างแชทเล็กๆ (แชทข้อความอย่างเดียว ใช้สมองโม + ประวัติแชทเดียวกับแอป) / แตะอีกที หรือแตะข้างนอก = พับเก็บ
 * - ลาก = ย้าย / ลากไปที่ ✕ ด้านล่าง = ปิดหัวแชท
 * - โมส่งข้อความมาตอนปิดแอป → หัวแชทเด้งขึ้นมาพร้อมกล่องข้อความตัวอย่าง + เลขแจ้งเตือน
 * - ซ่อนเองตอนแอปโมเปิดอยู่บนจอ
 */
public class ChatHeadService extends Service {
    static final String PREFS = "mo_chathead";
    static final String CHANNEL = "mo_chathead";
    static final String EXTRA_PREVIEW = "preview";

    private static ChatHeadService running;
    private static boolean appInFront;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private WindowManager wm;
    private FrameLayout head;
    private TextView badge;
    private TextView trash;
    private TextView preview;
    private FrameLayout panel;
    private WebView web;
    private WindowManager.LayoutParams headLp, previewLp, panelLp;
    private int unread;
    private boolean expanded;
    private long lastHeadTouch;

    // ===== เรียกจากที่อื่น =====

    static boolean canOverlay(Context ctx) {
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(ctx);
    }

    static boolean isWanted(Context ctx) {
        return ctx.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("on", false);
    }

    static void setWanted(Context ctx, boolean on) {
        ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("on", on).apply();
        if (on) start(ctx, null);
        else ctx.stopService(new Intent(ctx, ChatHeadService.class));
    }

    static void start(Context ctx, String previewText) {
        if (!canOverlay(ctx)) return;
        Intent i = new Intent(ctx, ChatHeadService.class);
        if (previewText != null) i.putExtra(EXTRA_PREVIEW, previewText);
        // Android 12+ อาจไม่ให้เริ่มจากเบื้องหลัง → ไม่ให้แอปล่ม (แจ้งเตือนยังขึ้นตามปกติ)
        try {
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Exception e) {
            android.util.Log.w("MoChatHead", "start failed: " + e);
        }
    }

    /** โมส่งข้อความมา (ตอนแอปไม่ได้อยู่บนจอ) → หัวแชทเด้ง + กล่องข้อความตัวอย่าง + เลข */
    static void incoming(Context ctx, String text) {
        if (appInFront || !isWanted(ctx)) return;
        if (running != null) running.ui.post(() -> running.showIncoming(text));
        else start(ctx, text);
    }

    /** แค่เพิ่มเลข (เช่น สายเรียกเข้า) */
    static void bump() {
        if (running != null) running.ui.post(() -> running.setUnread(running.unread + 1));
    }

    /** แอปโมขึ้นจอ/ลงจอ → ซ่อน/โชว์หัวแชท (ขึ้นจอ = อ่านแล้ว) */
    /** โมกำลังกดแอปอื่นแทน → หุบหน้าต่างแชทเล็กก่อน ไม่ให้บังจอ/แย่งโฟกัส */
    static void collapseNow() {
        if (running != null) running.ui.post(() -> { if (running != null) { running.collapse(false); running.hidePreview(); } });
    }

    static void appVisible(boolean visible) {
        appInFront = visible;
        if (running != null) running.ui.post(() -> {
            // เปิดหัวแชทชั่วคราวตอนโมพาไปแอปอื่น (เจ้าของไม่ได้เปิดสวิตช์ไว้) → กลับมาแล้วปิดทิ้ง ไม่ค้างแจ้งเตือน
            if (visible && running != null && !isWanted(running)) {
                running.stopSelf();
                return;
            }
            if (visible) {
                running.setUnread(0);
                running.collapse(false);
                running.hidePreview();
            }
            running.head.setVisibility(visible ? View.GONE : View.VISIBLE);
        });
    }

    // ===== Service =====

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        startAsForeground();
        if (!canOverlay(this)) {
            stopSelf();
            return;
        }
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        buildPanel();
        buildTrash();
        buildPreview();
        buildHead();
        running = this;
        head.setVisibility(appInFront ? View.GONE : View.VISIBLE);
        if (!appInFront) popIn();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String text = intent != null ? intent.getStringExtra(EXTRA_PREVIEW) : null;
        if (text != null && head != null) ui.postDelayed(() -> showIncoming(text), 350);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = null;
        ui.removeCallbacksAndMessages(null);
        for (View v : new View[] { head, trash, preview, panel }) {
            try {
                if (v != null) wm.removeView(v);
            } catch (Exception ignored) {}
        }
        if (web != null) web.destroy();
        super.onDestroy();
    }

    private void startAsForeground() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "หัวแชทโม", NotificationManager.IMPORTANCE_MIN);
            ch.setShowBadge(false);
            getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("หัวแชทโมเปิดอยู่")
            .setContentText("แตะรูปโมเพื่อคุยได้เลย")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setContentIntent(CallNotifier.openApp(this, null, 5))
            .setOngoing(true)
            .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(7, n);
    }

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private DisplayMetrics screen() {
        return getResources().getDisplayMetrics();
    }

    private int overlayType() {
        return Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
    }

    private GradientDrawable rounded(int color, float radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    // ===== ปุ่ม ✕ สำหรับลากไปทิ้ง =====

    private void buildTrash() {
        trash = new TextView(this);
        trash.setText("✕");
        trash.setTextSize(26);
        trash.setTextColor(Color.WHITE);
        trash.setGravity(Gravity.CENTER);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(0xCC333333);
        trash.setBackground(bg);
        trash.setVisibility(View.GONE);
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(dp(64), dp(64), overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE, PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        lp.y = dp(48);
        wm.addView(trash, lp);
    }

    // ===== กล่องข้อความตัวอย่างข้างหัวแชท =====

    private void buildPreview() {
        preview = new TextView(this);
        preview.setTextColor(0xFF333333);
        preview.setTextSize(14);
        preview.setMaxLines(3);
        preview.setEllipsize(TextUtils.TruncateAt.END);
        preview.setPadding(dp(14), dp(10), dp(14), dp(10));
        preview.setBackground(rounded(Color.WHITE, 18));
        preview.setElevation(dp(6));
        preview.setVisibility(View.GONE);
        preview.setOnClickListener(v -> expand());
        previewLp = new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType(), WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT);
        previewLp.gravity = Gravity.TOP | Gravity.START;
        wm.addView(preview, previewLp);
    }

    private void showIncoming(String text) {
        if (appInFront) return;
        head.setVisibility(View.VISIBLE);
        setUnread(unread + 1);
        popIn();
        if (expanded) {
            web.evaluateJavascript("window.dispatchEvent(new Event('mo-mini-open'))", null);
            return;
        }
        // วางกล่องข้อความไว้ฝั่งที่มีที่ว่าง (หัวแชทชิดซ้าย → กล่องอยู่ขวา)
        boolean headOnLeft = headLp.x + dp(30) < screen().widthPixels / 2;
        preview.setText(text);
        preview.setMaxWidth(screen().widthPixels - dp(100));
        preview.measure(View.MeasureSpec.makeMeasureSpec(screen().widthPixels - dp(100), View.MeasureSpec.AT_MOST), View.MeasureSpec.UNSPECIFIED);
        previewLp.x = headOnLeft ? headLp.x + dp(68) : Math.max(dp(8), headLp.x - preview.getMeasuredWidth() - dp(8));
        previewLp.y = headLp.y + dp(6);
        wm.updateViewLayout(preview, previewLp);
        preview.setVisibility(View.VISIBLE);
        preview.setPivotX(headOnLeft ? 0 : preview.getMeasuredWidth());
        preview.setPivotY(dp(20));
        preview.setScaleX(0.3f);
        preview.setScaleY(0.3f);
        preview.setAlpha(0f);
        preview.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(320).setInterpolator(new OvershootInterpolator(1.6f)).start();
        ui.removeCallbacks(this::hidePreview);
        ui.postDelayed(this::hidePreview, 7000);
    }

    private void hidePreview() {
        if (preview == null || preview.getVisibility() != View.VISIBLE) return;
        preview.animate().alpha(0f).scaleX(0.6f).scaleY(0.6f).setDuration(180)
            .withEndAction(() -> preview.setVisibility(View.GONE)).start();
    }

    // ===== หน้าต่างแชทเล็ก =====

    @SuppressLint({ "SetJavaScriptEnabled", "ClickableViewAccessibility" })
    private void buildPanel() {
        panel = new FrameLayout(this);
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(rounded(Color.WHITE, 22));
        card.setClipToOutline(true);
        card.setElevation(dp(10));

        // หัวการ์ด: ชื่อโม + ปุ่มเปิดแอปเต็ม + ปุ่มพับ
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(16), dp(10), dp(8), dp(10));
        bar.setBackgroundColor(0xFFFFE4EF);
        TextView title = new TextView(this);
        title.setText("โม 💕");
        title.setTextSize(16);
        title.setTextColor(0xFF8A2F5B);
        bar.addView(title, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        TextView full = barButton("⤢");
        full.setOnClickListener(v -> openFullApp());
        bar.addView(full);
        TextView close = barButton("—");
        close.setOnClickListener(v -> collapse(true));
        bar.addView(close);
        card.addView(bar);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        card.addView(web, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));

        FrameLayout.LayoutParams clp = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT);
        clp.setMargins(dp(8), dp(8), dp(8), dp(8));
        panel.addView(card, clp);
        panel.setVisibility(View.GONE);

        // แตะข้างนอกหน้าต่าง → พับเก็บ (ยกเว้นแตะที่หัวแชท ซึ่งจัดการเอง)
        panel.setOnTouchListener((v, e) -> {
            if (e.getAction() == MotionEvent.ACTION_OUTSIDE && expanded && System.currentTimeMillis() - lastHeadTouch > 400) collapse(true);
            return false;
        });

        panelLp = new WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT, dp(420), overlayType(),
            WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH, PixelFormat.TRANSLUCENT);
        panelLp.gravity = Gravity.TOP | Gravity.START;
        panelLp.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
        // ใส่หน้าต่างเข้าจอเฉพาะตอนเปิด (ตอนพับเอาออก ไม่งั้นจะบังการแตะแอปอื่น) — WebView ยังอยู่ ไม่ต้องโหลดใหม่
    }

    private TextView barButton(String label) {
        TextView b = new TextView(this);
        b.setText(label);
        b.setTextSize(18);
        b.setTextColor(0xFF8A2F5B);
        b.setGravity(Gravity.CENTER);
        b.setLayoutParams(new LinearLayout.LayoutParams(dp(40), dp(36)));
        return b;
    }

    private void toggle() {
        if (expanded) collapse(true);
        else expand();
    }

    private void expand() {
        if (expanded) return;
        expanded = true;
        hidePreview();
        setUnread(0);
        if (web.getUrl() == null) {
            String base = CapConfig.loadDefault(this).getServerUrl();
            web.loadUrl((base != null ? base.replaceAll("/+$", "") : "https://mo-supansa.68319100051.workers.dev") + "/?mini=1");
        } else {
            web.evaluateJavascript("window.dispatchEvent(new Event('mo-mini-open'))", null);
        }

        // หัวแชทไปอยู่มุมขวาบน หน้าต่างแชทอยู่ใต้หัวแชท
        int w = screen().widthPixels, h = screen().heightPixels;
        moveHead(w - dp(68), dp(36));
        panelLp.y = dp(36) + dp(64);
        panelLp.height = Math.min(dp(520), (int) (h * 0.62f));
        if (panel.getParent() == null) wm.addView(panel, panelLp);
        else wm.updateViewLayout(panel, panelLp);
        panel.setVisibility(View.VISIBLE);
        panel.setPivotX(w - dp(36));
        panel.setPivotY(0);
        panel.setScaleX(0.2f);
        panel.setScaleY(0.2f);
        panel.setAlpha(0f);
        panel.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(280).setInterpolator(new OvershootInterpolator(1.1f)).start();
    }

    private void collapse(boolean animate) {
        if (!expanded) return;
        expanded = false;
        Runnable done = () -> {
            panel.setVisibility(View.GONE);
            if (panel.getParent() != null) wm.removeView(panel);
            SharedPreferences pos = getSharedPreferences(PREFS, MODE_PRIVATE);
            moveHead(pos.getInt("x", 0), pos.getInt("y", dp(160)));
        };
        if (!animate) {
            done.run();
            return;
        }
        panel.animate().scaleX(0.2f).scaleY(0.2f).alpha(0f).setDuration(200).setInterpolator(new AccelerateInterpolator()).withEndAction(done).start();
    }

    private void openFullApp() {
        collapse(false);
        startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
    }

    // ===== หัวแชท =====

    @SuppressLint("ClickableViewAccessibility")
    private void buildHead() {
        int size = dp(60);
        head = new FrameLayout(this);

        ImageView face = new ImageView(this);
        face.setImageResource(R.drawable.mo_head);
        face.setScaleType(ImageView.ScaleType.CENTER_CROP);
        face.setClipToOutline(true);
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setColor(Color.WHITE);
        ring.setStroke(dp(2), 0xFFFF7EB3);
        face.setBackground(ring);
        face.setPadding(dp(2), dp(2), dp(2), dp(2));
        face.setElevation(dp(6));
        head.addView(face, new FrameLayout.LayoutParams(size, size));

        badge = new TextView(this);
        badge.setTextColor(Color.WHITE);
        badge.setTextSize(11);
        badge.setGravity(Gravity.CENTER);
        GradientDrawable dot = new GradientDrawable();
        dot.setShape(GradientDrawable.OVAL);
        dot.setColor(0xFFFF3B30);
        badge.setBackground(dot);
        badge.setElevation(dp(8));
        badge.setVisibility(View.GONE);
        FrameLayout.LayoutParams blp = new FrameLayout.LayoutParams(dp(20), dp(20));
        blp.gravity = Gravity.TOP | Gravity.END;
        head.addView(badge, blp);

        SharedPreferences pos = getSharedPreferences(PREFS, MODE_PRIVATE);
        headLp = new WindowManager.LayoutParams(size, size, overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, PixelFormat.TRANSLUCENT);
        headLp.gravity = Gravity.TOP | Gravity.START;
        headLp.x = pos.getInt("x", 0);
        headLp.y = pos.getInt("y", dp(160));

        head.setOnTouchListener(new View.OnTouchListener() {
            float downX, downY;
            int startX, startY;
            boolean dragging;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                lastHeadTouch = System.currentTimeMillis();
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        downX = e.getRawX();
                        downY = e.getRawY();
                        startX = headLp.x;
                        startY = headLp.y;
                        dragging = false;
                        head.animate().scaleX(0.9f).scaleY(0.9f).setDuration(80).start();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = e.getRawX() - downX, dy = e.getRawY() - downY;
                        if (!dragging && Math.hypot(dx, dy) > dp(8)) {
                            dragging = true;
                            if (expanded) collapse(true);
                            hidePreview();
                            trash.setVisibility(View.VISIBLE);
                        }
                        if (dragging) {
                            headLp.x = startX + (int) dx;
                            headLp.y = startY + (int) dy;
                            wm.updateViewLayout(head, headLp);
                            trash.setScaleX(overTrash() ? 1.3f : 1f);
                            trash.setScaleY(overTrash() ? 1.3f : 1f);
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                        head.animate().scaleX(1f).scaleY(1f).setDuration(120).start();
                        trash.setVisibility(View.GONE);
                        if (!dragging) {
                            toggle();
                        } else if (overTrash()) {
                            setWanted(ChatHeadService.this, false);
                        } else {
                            snapToEdge();
                        }
                        return true;
                }
                return false;
            }
        });
        wm.addView(head, headLp);
    }

    /** เด้งขึ้นมาแบบ Messenger */
    private void popIn() {
        head.setScaleX(0.2f);
        head.setScaleY(0.2f);
        head.animate().scaleX(1f).scaleY(1f).setDuration(380).setInterpolator(new OvershootInterpolator(2.2f)).start();
    }

    private void moveHead(int x, int y) {
        headLp.x = x;
        headLp.y = y;
        wm.updateViewLayout(head, headLp);
    }

    /** หัวแชทอยู่ทับปุ่ม ✕ ไหม */
    private boolean overTrash() {
        int[] t = new int[2];
        trash.getLocationOnScreen(t);
        int[] h = new int[2];
        head.getLocationOnScreen(h);
        float cx = h[0] + head.getWidth() / 2f, cy = h[1] + head.getHeight() / 2f;
        float tx = t[0] + trash.getWidth() / 2f, ty = t[1] + trash.getHeight() / 2f;
        return Math.hypot(cx - tx, cy - ty) < dp(70);
    }

    /** ปล่อยแล้วเด้งไปชิดขอบซ้าย/ขวา เหมือนหัวแชท Messenger */
    private void snapToEdge() {
        int w = screen().widthPixels;
        moveHead(headLp.x + head.getWidth() / 2 < w / 2 ? 0 : w - head.getWidth(), Math.max(0, headLp.y));
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt("x", headLp.x).putInt("y", headLp.y).apply();
    }

    private void setUnread(int n) {
        unread = n;
        badge.setText(n > 9 ? "9+" : String.valueOf(n));
        badge.setVisibility(n > 0 ? View.VISIBLE : View.GONE);
    }
}
