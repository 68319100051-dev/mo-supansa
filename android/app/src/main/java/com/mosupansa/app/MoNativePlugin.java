package com.mosupansa.app;

import android.Manifest;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONArray;

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

    /** ขอ "ไม่จำกัดแบตเตอรี่" (ถ้าระบบไม่ยอมเปิดกล่องถาม → เปิดหน้าข้อมูลแอปแทน) */
    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        String pkg = getContext().getPackageName();
        if (Build.VERSION.SDK_INT >= 23 && !getContext().getSystemService(PowerManager.class).isIgnoringBatteryOptimizations(pkg)
            && launch(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg)))) {
            call.resolve();
            return;
        }
        launch(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)));
        call.resolve();
    }

    /** หน้า "เริ่มอัตโนมัติ" ของ Infinix/Tecno/itel (XOS Phone Master) — ไม่มีก็เปิดหน้าข้อมูลแอป */
    @PluginMethod
    public void openAutoStart(PluginCall call) {
        String[][] screens = {
            { "com.transsion.phonemaster", "com.cyin.himgr.autostart.AutoStartActivity" },
            { "com.transsion.phonemaster", "com.cyin.himgr.widget.activity.MainSettingGpActivity" },
            { "com.transsion.phonemaster", "com.transsion.phonemaster.MainActivity" },
        };
        for (String[] s : screens) {
            if (launch(new Intent().setComponent(new ComponentName(s[0], s[1])))) {
                call.resolve();
                return;
            }
        }
        launch(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())));
        call.resolve();
    }

    private boolean launch(Intent i) {
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // ===== การเตือน / โทรปลุก (นาฬิกาปลุกในเครื่อง) =====

    @PluginMethod
    public void setAlarms(PluginCall call) {
        try {
            AlarmScheduler.replaceAll(getContext(), new JSONArray(call.getArray("alarms", new JSArray()).toString()));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void alarmStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("exact", AlarmScheduler.canExact(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31) launch(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName())));
        call.resolve();
    }

    // ===== หัวแชทโม =====

    @PluginMethod
    public void chatHeadStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("on", ChatHeadService.isWanted(getContext()) && ChatHeadService.canOverlay(getContext()));
        ret.put("canOverlay", ChatHeadService.canOverlay(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void setChatHead(PluginCall call) {
        ChatHeadService.setWanted(getContext(), Boolean.TRUE.equals(call.getBoolean("on", false)));
        call.resolve();
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 23) launch(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName())));
        call.resolve();
    }

    @PluginMethod
    public void stopRinging(PluginCall call) {
        CallNotifier.cancelCall(getContext());
        call.resolve();
    }
}
