package com.mosupansa.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * นาฬิกาปลุกในเครื่องสำหรับการเตือน/โทรปลุก (ไม่ต้องใช้เน็ต ไม่ต้องใช้ Firebase)
 * หน้าเว็บส่งรายการเตือนที่ค้างอยู่มาทั้งหมด → เก็บไว้ + ตั้งปลุกใหม่ทุกครั้ง
 * รายการ: { id, at (ms), kind: wake|date|remind|date-pre, text, daily }
 */
public final class AlarmScheduler {
    static final String PREFS = "mo_alarms";
    static final String KEY = "list";

    private AlarmScheduler() {}

    static JSONArray load(Context ctx) {
        try {
            return new JSONArray(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** แทนรายการทั้งหมด: ยกเลิกของเก่า ตั้งของใหม่ */
    static void replaceAll(Context ctx, JSONArray alarms) {
        JSONArray old = load(ctx);
        for (int i = 0; i < old.length(); i++) {
            JSONObject a = old.optJSONObject(i);
            if (a != null) am(ctx).cancel(pending(ctx, a));
        }
        save(ctx, alarms);
        scheduleAll(ctx);
    }

    /** ตั้งปลุกทุกอันที่เก็บไว้ (ใช้ตอนเปิดเครื่องใหม่ด้วย) — อันที่เลยเวลาไปแล้วไม่นานให้ดังเลย */
    static void scheduleAll(Context ctx) {
        JSONArray list = load(ctx);
        long now = System.currentTimeMillis();
        for (int i = 0; i < list.length(); i++) {
            JSONObject a = list.optJSONObject(i);
            if (a == null) continue;
            long at = a.optLong("at");
            if (at < now - 10 * 60_000L && !a.optBoolean("daily")) continue;   // เลยไปนานแล้ว ไม่ต้องดัง
            if (a.optBoolean("daily")) while (at < now) at += 86_400_000L;
            setExact(ctx, Math.max(at, now + 1000), pending(ctx, a));
        }
    }

    /** ดังแล้ว: อันเดียว → ลบทิ้ง / ทุกวัน → เลื่อนไปพรุ่งนี้ */
    static void fired(Context ctx, String id) {
        JSONArray list = load(ctx);
        JSONArray next = new JSONArray();
        for (int i = 0; i < list.length(); i++) {
            JSONObject a = list.optJSONObject(i);
            if (a == null) continue;
            if (id.equals(a.optString("id"))) {
                if (!a.optBoolean("daily")) continue;
                try {
                    long at = a.optLong("at");
                    while (at <= System.currentTimeMillis()) at += 86_400_000L;
                    a.put("at", at);
                    setExact(ctx, at, pending(ctx, a));
                } catch (Exception ignored) {}
            }
            next.put(a);
        }
        save(ctx, next);
    }

    static boolean canExact(Context ctx) {
        return Build.VERSION.SDK_INT < 31 || am(ctx).canScheduleExactAlarms();
    }

    private static void setExact(Context ctx, long at, PendingIntent pi) {
        if (canExact(ctx)) {
            // แบบนาฬิกาปลุก: ตรงเวลาที่สุด ไม่โดนโหมดประหยัดแบต (Doze) เลื่อน
            PendingIntent show = PendingIntent.getActivity(ctx, 0, new Intent(ctx, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
            am(ctx).setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), pi);
        } else if (Build.VERSION.SDK_INT >= 23) {
            am(ctx).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } else {
            am(ctx).set(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    private static PendingIntent pending(Context ctx, JSONObject a) {
        Intent i = new Intent(ctx, AlarmReceiver.class)
            .setAction(AlarmReceiver.ACTION_FIRE)
            .putExtra("id", a.optString("id"))
            .putExtra("kind", a.optString("kind"))
            .putExtra("text", a.optString("text"));
        return PendingIntent.getBroadcast(ctx, a.optString("id").hashCode(), i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void save(Context ctx, JSONArray list) {
        SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        e.putString(KEY, list.toString()).apply();
    }

    private static AlarmManager am(Context ctx) {
        return (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
    }
}
