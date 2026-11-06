package com.mosupansa.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * วิดเจ็ตหน้าจอโฮม: รูปโม + ข้อความล่าสุดที่โมส่งมา + เวลา / แตะ = เปิดแอปโม
 * อัปเดตเมื่อ: แอปได้ข้อความจากโม (MoNative.setWidget) หรือเครื่องเด้งแจ้งเตือนของโม (CallNotifier)
 */
public class MoWidget extends AppWidgetProvider {
    static final String PREFS = "mo_widget";

    /** เก็บข้อความล่าสุดแล้ววาดวิดเจ็ตทุกอันใหม่ */
    static void setLatest(Context ctx, String text) {
        if (text == null || text.trim().isEmpty()) return;
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("text", text.trim())
            .putLong("at", System.currentTimeMillis())
            .apply();
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] ids = m.getAppWidgetIds(new ComponentName(ctx, MoWidget.class));
        for (int id : ids) m.updateAppWidget(id, render(ctx));
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, render(ctx));
    }

    private static RemoteViews render(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long at = p.getLong("at", 0);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.mo_widget);
        v.setTextViewText(R.id.widget_text, p.getString("text", "แตะเพื่อคุยกับโม 💕"));
        v.setTextViewText(R.id.widget_time, at > 0 ? new SimpleDateFormat("HH:mm", Locale.US).format(new Date(at)) : "");
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.widget_root,
            PendingIntent.getActivity(ctx, 9, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }
}
