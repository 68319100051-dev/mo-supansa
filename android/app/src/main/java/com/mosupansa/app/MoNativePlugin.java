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

    // ===== โหมดเสียง: ฟังพูด (SpeechRecognizer) + โมพูดออกเสียง (TextToSpeech) =====
    private android.speech.SpeechRecognizer recognizer;
    private android.speech.tts.TextToSpeech tts;
    private boolean ttsReady;
    private final java.util.List<Runnable> ttsQueue = new java.util.ArrayList<>();
    private final android.os.Handler main = new android.os.Handler(android.os.Looper.getMainLooper());

    /** ฟัง 1 ประโยค → { text } (หรือ { text: "", error }) ; ระหว่างพูดส่ง event "voicePartial" { text } / "voiceLevel" { level } */
    @PluginMethod
    public void listen(PluginCall call) {
        if (androidx.core.content.ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            JSObject r = new JSObject(); r.put("text", ""); r.put("error", "permission"); call.resolve(r); return;
        }
        main.post(() -> {
            try {
                if (!android.speech.SpeechRecognizer.isRecognitionAvailable(getContext())) {
                    JSObject r = new JSObject(); r.put("text", ""); r.put("error", "unavailable"); call.resolve(r); return;
                }
                if (recognizer != null) { recognizer.destroy(); recognizer = null; }
                recognizer = android.speech.SpeechRecognizer.createSpeechRecognizer(getContext());
                final boolean[] done = { false };
                recognizer.setRecognitionListener(new android.speech.RecognitionListener() {
                    public void onReadyForSpeech(android.os.Bundle b) { notifyListeners("voiceState", new JSObject().put("state", "listening")); }
                    public void onBeginningOfSpeech() {}
                    public void onRmsChanged(float db) { JSObject o = new JSObject(); o.put("level", db); notifyListeners("voiceLevel", o); }
                    public void onBufferReceived(byte[] b) {}
                    public void onEndOfSpeech() { notifyListeners("voiceState", new JSObject().put("state", "thinking")); }
                    public void onError(int code) {
                        if (done[0]) return; done[0] = true;
                        JSObject r = new JSObject(); r.put("text", ""); r.put("error", String.valueOf(code)); call.resolve(r);
                    }
                    public void onResults(android.os.Bundle b) {
                        if (done[0]) return; done[0] = true;
                        java.util.ArrayList<String> list = b.getStringArrayList(android.speech.SpeechRecognizer.RESULTS_RECOGNITION);
                        JSObject r = new JSObject(); r.put("text", list != null && !list.isEmpty() ? list.get(0) : ""); call.resolve(r);
                    }
                    public void onPartialResults(android.os.Bundle b) {
                        java.util.ArrayList<String> list = b.getStringArrayList(android.speech.SpeechRecognizer.RESULTS_RECOGNITION);
                        if (list != null && !list.isEmpty()) { JSObject o = new JSObject(); o.put("text", list.get(0)); notifyListeners("voicePartial", o); }
                    }
                    public void onEvent(int t, android.os.Bundle b) {}
                });
                Intent i = new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, "th-TH");
                i.putExtra(android.speech.RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                i.putExtra(android.speech.RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L);
                recognizer.startListening(i);
            } catch (Exception e) {
                JSObject r = new JSObject(); r.put("text", ""); r.put("error", e.toString()); call.resolve(r);
            }
        });
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        main.post(() -> { if (recognizer != null) { recognizer.cancel(); recognizer.destroy(); recognizer = null; } });
        if (tts != null) tts.stop();
        call.resolve();
    }

    /** โมพูดออกเสียง → resolve เมื่อพูดจบ */
    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (text == null || text.trim().isEmpty()) { call.resolve(); return; }
        Runnable go = () -> {
            String id = "mo" + System.nanoTime();
            tts.setOnUtteranceProgressListener(new android.speech.tts.UtteranceProgressListener() {
                public void onStart(String u) {}
                public void onDone(String u) { if (id.equals(u)) call.resolve(); }
                public void onError(String u) { if (id.equals(u)) call.resolve(); }
                public void onStop(String u, boolean interrupted) { if (id.equals(u)) call.resolve(); }
            });
            tts.setSpeechRate(call.getFloat("rate", 1.05f));
            tts.setPitch(call.getFloat("pitch", 1.15f));
            tts.speak(text, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, id);
        };
        if (tts != null && ttsReady) { go.run(); return; }
        if (tts != null) { ttsQueue.add(go); return; }   // กำลังเตรียมตัวอ่านเสียงอยู่ → รอคิว ไม่สร้างซ้ำ
        ttsQueue.add(go);
        tts = new android.speech.tts.TextToSpeech(getContext(), status -> {
            ttsReady = status == android.speech.tts.TextToSpeech.SUCCESS;
            if (ttsReady) {
                int lang = tts.setLanguage(new java.util.Locale("th", "TH"));
                if (lang == android.speech.tts.TextToSpeech.LANG_MISSING_DATA || lang == android.speech.tts.TextToSpeech.LANG_NOT_SUPPORTED) tts.setLanguage(java.util.Locale.getDefault());
            }
            java.util.List<Runnable> q = new java.util.ArrayList<>(ttsQueue);
            ttsQueue.clear();
            if (!ttsReady) { tts = null; return; }   // JS มีเวลาหมดของตัวเอง
            for (Runnable r : q) r.run();
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (recognizer != null) recognizer.destroy();
        if (tts != null) tts.shutdown();
    }

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

    // ===== เปิดแอปในเครื่องตามชื่อ =====

    private static String norm(String s) {
        return s == null ? "" : s.toLowerCase(java.util.Locale.ROOT).replaceAll("[\\s._\\-]+", "");
    }

    /**
     * หาแอปที่มีไอคอนบนหน้าจอจากชื่อ (ลองทีละชื่อใน names) → เปิด แล้วโมย่อเป็นหัวแชทรออยู่ (ไม่ดับ)
     * คืน { ok, label, pkg }
     */
    @PluginMethod
    public void launchApp(PluginCall call) {
        android.content.Context ctx = getContext();
        android.content.pm.PackageManager pm = ctx.getPackageManager();
        java.util.List<String> names = new java.util.ArrayList<>();
        try {
            JSArray arr = call.getArray("names", new JSArray());
            for (int i = 0; i < arr.length(); i++) names.add(arr.getString(i));
        } catch (Exception ignored) {}
        Intent q = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        java.util.List<android.content.pm.ResolveInfo> apps = pm.queryIntentActivities(q, 0);
        android.content.pm.ResolveInfo best = null;
        int bestScore = 0;
        for (String raw : names) {
            String n = norm(raw);
            if (n.isEmpty()) continue;
            for (android.content.pm.ResolveInfo ri : apps) {
                if (ri.activityInfo.packageName.equals(ctx.getPackageName())) continue;
                String label = norm(String.valueOf(ri.loadLabel(pm)));
                String pkg = ri.activityInfo.packageName.toLowerCase(java.util.Locale.ROOT);
                int score = label.equals(n) ? 100 : pkg.equals(n) ? 95
                    : label.startsWith(n) ? 80 : label.contains(n) ? 60
                    : n.length() >= 4 && pkg.contains(n) ? 50 : 0;
                if (score > bestScore) { bestScore = score; best = ri; }
            }
            if (bestScore >= 80) break;
        }
        JSObject ret = new JSObject();
        if (best == null) { ret.put("ok", false); call.resolve(ret); return; }
        Intent launch = pm.getLaunchIntentForPackage(best.activityInfo.packageName);
        if (launch == null) { ret.put("ok", false); call.resolve(ret); return; }
        // ย่อเป็นหัวแชทก่อนออกไป (ตอนแอปยังอยู่บนจอ Android ยอมให้เริ่ม) → โมไม่ดับ กดหัวกลับมาได้
        boolean bubble = Boolean.TRUE.equals(call.getBoolean("bubble", true)) && ChatHeadService.canOverlay(ctx);
        if (bubble) ChatHeadService.start(ctx, call.getString("note", null));
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(launch);
        ret.put("ok", true);
        ret.put("label", String.valueOf(best.loadLabel(pm)));
        String pkg = best.activityInfo.packageName;
        ret.put("pkg", pkg);
        ret.put("bubble", bubble);
        // สั่งต่อ: ค้นหาในแอปนั้น (+ กดผลแรก) ด้วยระบบช่วยการเข้าถึง
        String query = call.getString("query", "");
        if (query == null || query.trim().isEmpty()) { call.resolve(ret); return; }
        if (MoAccessibilityService.isFinance(pkg)) { ret.put("search", "finance"); call.resolve(ret); return; }
        if (!MoAccessibilityService.isEnabled(ctx)) { ret.put("search", "off"); call.resolve(ret); return; }
        MoAccessibilityService.instance.search(pkg, query.trim(), Boolean.TRUE.equals(call.getBoolean("pickFirst", true)), (ok, step) -> {
            ret.put("search", ok ? step : "fail:" + step);
            call.resolve(ret);
        });
    }

    // ===== ระบบช่วยการเข้าถึง (โมกดหน้าจอแทน) =====

    @PluginMethod
    public void accessibilityStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("on", MoAccessibilityService.isEnabled(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        launch(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
        call.resolve();
    }

    /** Android 13+: แอปที่ลงเองต้อง "อนุญาตการตั้งค่าที่ถูกจำกัด" ในหน้าข้อมูลแอปก่อน */
    @PluginMethod
    public void openAppInfo(PluginCall call) {
        launch(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())));
        call.resolve();
    }

    // ===== สั่งเพลงด้วยเสียง/ข้อความ =====

    /** เปิดเพลง: YouTube Music (เล่นเลย) → ถ้าไม่มี เปิดหน้าค้นหาใน YouTube → ถ้าไม่มี เปิดเว็บ */
    @PluginMethod
    public void playMusic(PluginCall call) {
        String q = call.getString("query", "");
        android.content.Context ctx = getContext();
        android.content.pm.PackageManager pm = ctx.getPackageManager();
        JSObject ret = new JSObject();
        if (ChatHeadService.canOverlay(ctx)) ChatHeadService.start(ctx, null);   // ย่อรอ ไม่ดับ
        try {
            Intent i = new Intent(android.provider.MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH);
            i.setPackage("com.google.android.apps.youtube.music");
            i.putExtra(android.app.SearchManager.QUERY, q);
            i.putExtra(android.provider.MediaStore.EXTRA_MEDIA_FOCUS, "vnd.android.cursor.item/*");
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (i.resolveActivity(pm) != null) { ctx.startActivity(i); ret.put("app", "ytmusic"); call.resolve(ret); return; }
        } catch (Exception ignored) {}
        try {
            Intent i = new Intent(Intent.ACTION_SEARCH);
            i.setPackage("com.google.android.youtube");
            i.putExtra("query", q);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (i.resolveActivity(pm) != null) {
                ctx.startActivity(i);
                ret.put("app", "youtube");
                // เปิดระบบช่วยการเข้าถึงไว้ → กดคลิปแรกให้เล่นเลย
                if (Boolean.TRUE.equals(call.getBoolean("pickFirst", true)) && MoAccessibilityService.isEnabled(ctx)) {
                    MoAccessibilityService.instance.pickFirst("com.google.android.youtube", (ok, step) -> { ret.put("played", ok); call.resolve(ret); });
                    return;
                }
                call.resolve(ret);
                return;
            }
        } catch (Exception ignored) {}
        Intent web = new Intent(Intent.ACTION_VIEW, Uri.parse("https://m.youtube.com/results?search_query=" + Uri.encode(q)));
        web.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(web);
        ret.put("app", "web");
        call.resolve(ret);
    }

    /** กดปุ่มเพลงแทน: pause / play / next / previous / volup / voldown */
    @PluginMethod
    public void mediaKey(PluginCall call) {
        String key = call.getString("key", "pause");
        android.media.AudioManager am = (android.media.AudioManager) getContext().getSystemService(android.content.Context.AUDIO_SERVICE);
        if ("volup".equals(key) || "voldown".equals(key)) {
            int dir = "volup".equals(key) ? android.media.AudioManager.ADJUST_RAISE : android.media.AudioManager.ADJUST_LOWER;
            for (int n = 0; n < 3; n++) am.adjustStreamVolume(android.media.AudioManager.STREAM_MUSIC, dir, n == 0 ? android.media.AudioManager.FLAG_SHOW_UI : 0);
            call.resolve();
            return;
        }
        int code = "play".equals(key) ? android.view.KeyEvent.KEYCODE_MEDIA_PLAY
            : "next".equals(key) ? android.view.KeyEvent.KEYCODE_MEDIA_NEXT
            : "previous".equals(key) ? android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS
            : android.view.KeyEvent.KEYCODE_MEDIA_PAUSE;
        am.dispatchMediaKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, code));
        am.dispatchMediaKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, code));
        JSObject ret = new JSObject();
        ret.put("playing", am.isMusicActive());
        call.resolve(ret);
    }

    /** โมส่งข้อความตอนแอปอยู่เบื้องหลัง (สมองในหน้าเว็บคิดเอง) → แจ้งเตือน + หัวแชทเด้งพร้อมข้อความ */
    @PluginMethod
    public void moMessage(PluginCall call) {
        String body = call.getString("body", "");
        if (body != null && !body.isEmpty()) CallNotifier.showChat(getContext(), call.getString("title", "โม 💕"), body);
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
