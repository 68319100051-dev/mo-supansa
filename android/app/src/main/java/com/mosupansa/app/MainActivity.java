package com.mosupansa.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    static final String EXTRA_CALL = "mo_call";   // "ring" | "answer"
    static final String EXTRA_WHY = "mo_why";     // "wake" = โทรปลุก

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MoNativePlugin.class);
        super.onCreate(savedInstanceState);
        String why = getIntent().getStringExtra(EXTRA_WHY);
        String call = takeCall(getIntent());
        if (call != null) {
            // เปิดจากสายเรียกเข้า → โหลดหน้าเว็บพร้อม ?call= (app.js รู้จักอยู่แล้ว)
            bridge.getWebView().loadUrl(bridge.getAppUrl().replaceAll("/+$", "") + "/?call=" + call + (why != null ? "&why=" + why : ""));
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String why = intent.getStringExtra(EXTRA_WHY);
        String call = takeCall(intent);
        if (call != null && bridge != null) {
            // แอปเปิดอยู่แล้ว → บอกหน้าเว็บตรงๆ ไม่ต้องโหลดใหม่
            bridge.getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('mo-native-call',{detail:{answer:" + "answer".equals(call)
                    + (why != null ? ",why:'" + why + "'" : "") + "}}))", null);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        ChatHeadService.appVisible(true);
    }

    @Override
    public void onPause() {
        super.onPause();
        ChatHeadService.appVisible(false);
    }

    @Override
    public void onStop() {
        super.onStop();
        showOverLockScreen(false);
    }

    /** เปิดมาเพราะสายเรียกเข้าไหม → ให้จอติดและขึ้นทับจอล็อก */
    private String takeCall(Intent intent) {
        String call = intent != null ? intent.getStringExtra(EXTRA_CALL) : null;
        if (call == null) return null;
        intent.removeExtra(EXTRA_CALL);
        showOverLockScreen(true);
        // "ring" ให้ดังต่อจนกดรับ/วางในแอป (หน้าเว็บเรียก MoNative.stopRinging)
        if ("answer".equals(call)) CallNotifier.cancelCall(this);
        return call;
    }

    private void showOverLockScreen(boolean on) {
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(on);
            setTurnScreenOn(on);
        } else if (on) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
    }
}
