package com.mosupansa.app;

import androidx.annotation.NonNull;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * รับ data message จากหลังบ้าน (worker.js): { type: call|chat, title, body }
 * เป็น data ล้วน (ไม่มี notification) เพื่อให้แอปวาดแจ้งเตือนเองได้แม้ปิดแอปอยู่
 */
public class MoMessagingService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage msg) {
        Map<String, String> d = msg.getData();
        if ("call".equals(d.get("type"))) {
            CallNotifier.showCall(this, d.get("title"), d.get("body"));
        } else if (d.get("body") != null) {
            CallNotifier.showChat(this, d.get("title"), d.get("body"));
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        // หน้าเว็บขอ token ใหม่เองทุกครั้งที่เปิดแอป แล้วบันทึกลง Supabase
    }
}
