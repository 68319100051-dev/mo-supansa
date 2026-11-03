package com.mosupansa.app;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * สะพานให้หน้าเว็บคุยกับ Android: window.Capacitor.Plugins.MoNative
 * - setup(): ขอสิทธิ์แจ้งเตือน → คืน FCM token + สถานะสิทธิ์เต็มจอ
 * - openFullScreenSettings(): เปิดหน้าตั้งค่า "แสดงเต็มจอ" (Android 14+)
 * - stopRinging(): เลิกดังเมื่อรับสายในแอปแล้ว
 */
@CapacitorPlugin(
    name = "MoNative",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class MoNativePlugin extends Plugin {

    @PluginMethod
    public void setup(PluginCall call) {
        CallNotifier.ensureChannels(getContext());
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterPermission");
        } else {
            sendToken(call);
        }
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        sendToken(call);
    }

    private void sendToken(PluginCall call) {
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful() || task.getResult() == null) {
                    call.reject("ขอ FCM token ไม่สำเร็จ: " + (task.getException() != null ? task.getException().getMessage() : "?"));
                    return;
                }
                JSObject ret = new JSObject();
                ret.put("token", task.getResult());
                ret.put("notifications", Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED);
                ret.put("fullScreen", canFullScreen());
                call.resolve(ret);
            });
        } catch (IllegalStateException e) {
            // ตอน build ยังไม่ได้ใส่ google-services.json
            call.reject("แอปนี้ยังไม่ได้ตั้งค่า Firebase (google-services.json)");
        }
    }

    private boolean canFullScreen() {
        if (Build.VERSION.SDK_INT < 34) return true;
        return getContext().getSystemService(NotificationManager.class).canUseFullScreenIntent();
    }

    @PluginMethod
    public void openFullScreenSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 34) {
            Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void stopRinging(PluginCall call) {
        CallNotifier.cancelCall(getContext());
        call.resolve();
    }
}
