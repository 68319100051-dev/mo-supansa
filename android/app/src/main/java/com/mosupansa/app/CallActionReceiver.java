package com.mosupansa.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** ปุ่ม "ปฏิเสธ" บนแจ้งเตือนสายเรียกเข้า → เลิกดัง */
public class CallActionReceiver extends BroadcastReceiver {
    static final String ACTION_DECLINE = "com.mosupansa.app.DECLINE_CALL";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (ACTION_DECLINE.equals(intent.getAction())) CallNotifier.cancelCall(ctx);
    }
}
