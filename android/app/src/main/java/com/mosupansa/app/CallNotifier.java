package com.mosupansa.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;

/**
 * แจ้งเตือนของโม
 * - สายเรียกเข้า: ช่อง high-priority + ริงโทน + สั่น + fullScreenIntent (จอล็อกอยู่ก็เด้งเต็มจอ)
 * - แชทปกติ: แจ้งเตือนธรรมดา แตะแล้วเปิดแอป
 */
public final class CallNotifier {
    static final String CHANNEL_CALL = "mo_calls";
    static final String CHANNEL_CHAT = "mo_chat";
    static final int ID_CALL = 1001;
    static final int ID_CHAT = 1002;
    static final long RING_MS = 45_000;
    static final long[] VIBRATE = { 0, 800, 600, 800, 600, 800 };

    private CallNotifier() {}

    static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        NotificationChannel call = new NotificationChannel(CHANNEL_CALL, "โมโทรมา", NotificationManager.IMPORTANCE_HIGH);
        call.setDescription("สายเรียกเข้าจากโม (เต็มจอ มีเสียงเรียกเข้า)");
        call.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build());
        call.enableVibration(true);
        call.setVibrationPattern(VIBRATE);
        call.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(call);

        NotificationChannel chat = new NotificationChannel(CHANNEL_CHAT, "ข้อความจากโม", NotificationManager.IMPORTANCE_HIGH);
        chat.enableVibration(true);
        nm.createNotificationChannel(chat);
    }

    /** เปิดแอป พร้อมบอกหน้าเว็บว่า ring (ขึ้นจอสายเข้าในแอป) หรือ answer (รับสายเลย) */
    static PendingIntent openApp(Context ctx, String call, int requestCode) {
        return openApp(ctx, call, null, requestCode);
    }

    static PendingIntent openApp(Context ctx, String call, String why, int requestCode) {
        Intent i = new Intent(ctx, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (call != null) i.putExtra(MainActivity.EXTRA_CALL, call);
        if (why != null) i.putExtra(MainActivity.EXTRA_WHY, why);
        return PendingIntent.getActivity(ctx, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void showCall(Context ctx, String title, String body) {
        showCall(ctx, title, body, null);
    }

    /** why = "wake" → รับสายแล้วโมทักแบบปลุก */
    static void showCall(Context ctx, String title, String body, String why) {
        ensureChannels(ctx);
        ChatHeadService.bump();
        PendingIntent ring = openApp(ctx, "ring", why, 1);
        PendingIntent answer = openApp(ctx, "answer", why, 2);
        PendingIntent decline = PendingIntent.getBroadcast(ctx, 3,
            new Intent(ctx, CallActionReceiver.class).setAction(CallActionReceiver.ACTION_DECLINE),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new NotificationCompat.Builder(ctx, CHANNEL_CALL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title != null ? title : "📞 โมกำลังโทรมา...")
            .setContentText(body != null && !body.isEmpty() ? body : "แตะเพื่อรับสาย")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))   // Android 7 ลงไป (8+ ใช้ของช่อง)
            .setVibrate(VIBRATE)
            .setOngoing(true)
            .setAutoCancel(true)
            .setTimeoutAfter(RING_MS)
            .setContentIntent(ring)
            .setFullScreenIntent(ring, true)
            .addAction(0, "ปฏิเสธ", decline)
            .addAction(0, "รับสาย", answer)
            .build();
        n.flags |= Notification.FLAG_INSISTENT;   // ดังวนจนกว่าจะรับ/ปฏิเสธ
        ctx.getSystemService(NotificationManager.class).notify(ID_CALL, n);
    }

    static void showChat(Context ctx, String title, String body) {
        ensureChannels(ctx);
        ChatHeadService.incoming(ctx, body);
        Notification n = new NotificationCompat.Builder(ctx, CHANNEL_CHAT)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title != null ? title : "โม 💕")
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(openApp(ctx, null, 4))
            .build();
        ctx.getSystemService(NotificationManager.class).notify(ID_CHAT, n);
    }

    static void cancelCall(Context ctx) {
        ctx.getSystemService(NotificationManager.class).cancel(ID_CALL);
    }
}
