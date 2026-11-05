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
import android.os.IBinder;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.core.app.NotificationCompat;

/**
 * หัวแชทโม: รูปโมกลมๆ ลอยทับแอปอื่น
 * แตะ = เปิดแอปโม / ลาก = ย้าย / ลากไปที่ ✕ ด้านล่าง = ปิด / มีข้อความใหม่ = จุดแดงนับจำนวน
 * ซ่อนเองตอนแอปโมเปิดอยู่บนจอ
 */
public class ChatHeadService extends Service {
    static final String PREFS = "mo_chathead";
    static final String CHANNEL = "mo_chathead";
    static final String ACTION_BADGE = "badge";
    static final String ACTION_VISIBLE = "visible";

    private static ChatHeadService running;
    private static boolean appInFront;

    private WindowManager wm;
    private FrameLayout head;
    private TextView badge;
    private TextView trash;
    private WindowManager.LayoutParams headLp;
    private int unread;

    // ===== เรียกจากที่อื่น =====

    static boolean canOverlay(Context ctx) {
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(ctx);
    }

    static boolean isWanted(Context ctx) {
        return ctx.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("on", false);
    }

    static boolean isOn() {
        return running != null;
    }

    static void setWanted(Context ctx, boolean on) {
        ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("on", on).apply();
        if (on) start(ctx);
        else ctx.stopService(new Intent(ctx, ChatHeadService.class));
    }

    static void start(Context ctx) {
        if (!canOverlay(ctx)) return;
        Intent i = new Intent(ctx, ChatHeadService.class);
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
        else ctx.startService(i);
    }

    /** โมส่งข้อความมา → เพิ่มเลขบนหัวแชท */
    static void bump() {
        if (running != null) running.head.post(() -> running.setUnread(running.unread + 1));
    }

    /** แอปโมขึ้นจอ/ลงจอ → ซ่อน/โชว์หัวแชท (ขึ้นจอ = อ่านแล้ว) */
    static void appVisible(boolean visible) {
        appInFront = visible;
        if (running != null) running.head.post(() -> {
            if (visible) running.setUnread(0);
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
        buildTrash();
        buildHead();
        running = this;
        head.setVisibility(appInFront ? View.GONE : View.VISIBLE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = null;
        try {
            if (head != null) wm.removeView(head);
            if (trash != null) wm.removeView(trash);
        } catch (Exception ignored) {}
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
            .setContentText("แตะเพื่อคุยกับโม")
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

    private int overlayType() {
        return Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
    }

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
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        downX = e.getRawX();
                        downY = e.getRawY();
                        startX = headLp.x;
                        startY = headLp.y;
                        dragging = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = e.getRawX() - downX, dy = e.getRawY() - downY;
                        if (!dragging && Math.hypot(dx, dy) > dp(8)) {
                            dragging = true;
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
                        trash.setVisibility(View.GONE);
                        if (!dragging) {
                            openMo();
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
        int w = getResources().getDisplayMetrics().widthPixels;
        headLp.x = headLp.x + head.getWidth() / 2 < w / 2 ? 0 : w - head.getWidth();
        headLp.y = Math.max(0, headLp.y);
        wm.updateViewLayout(head, headLp);
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt("x", headLp.x).putInt("y", headLp.y).apply();
    }

    private void openMo() {
        setUnread(0);
        Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(i);
    }

    private void setUnread(int n) {
        unread = n;
        badge.setText(n > 9 ? "9+" : String.valueOf(n));
        badge.setVisibility(n > 0 ? View.VISIBLE : View.GONE);
    }
}
