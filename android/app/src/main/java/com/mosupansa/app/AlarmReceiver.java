package com.mosupansa.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * ถึงเวลาเตือน → โทรปลุก/นัดเดต = สายเรียกเข้าเต็มจอ, เรื่องอื่น = แจ้งเตือนเด้ง
 * เปิดเครื่องใหม่ → ตั้งปลุกที่ค้างไว้อีกรอบ
 */
public class AlarmReceiver extends BroadcastReceiver {
    static final String ACTION_FIRE = "com.mosupansa.app.ALARM";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        if (ACTION_FIRE.equals(action)) {
            String id = intent.getStringExtra("id");
            String kind = intent.getStringExtra("kind");
            String text = intent.getStringExtra("text");
            if ("wake".equals(kind)) {
                CallNotifier.showCall(ctx, "📞 โมโทรมาปลุก!", "ตื่นนน ได้เวลาแล้วว รับสายเค้าหน่อย ⏰", "wake");
            } else if ("date".equals(kind)) {
                CallNotifier.showCall(ctx, "📞 โมกำลังโทรมา...", "ถึงเวลานัด" + text + "แล้วนะ! รับสายเค้าหน่อย", null);
            } else if ("date-pre".equals(kind)) {
                CallNotifier.showChat(ctx, "โม 💕", "อีก 15 นาทีนัด" + text + "นะ เตรียมตัวยัง 💕");
            } else {
                CallNotifier.showChat(ctx, "⏰ โมเตือน", "ถึงเวลา" + text + "แล้วนะ!");
            }
            if (id != null) AlarmScheduler.fired(ctx, id);
        } else if (Intent.ACTION_BOOT_COMPLETED.equals(action) || "android.intent.action.QUICKBOOT_POWERON".equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            AlarmScheduler.scheduleAll(ctx);
            if (ChatHeadService.isWanted(ctx)) ChatHeadService.start(ctx, null);
        }
    }
}
