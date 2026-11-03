/* ============================================
   Mo Config 🔑 - คีย์ & ข้อมูลส่วนตัว แบบเก็บในเครื่อง
   - เวอร์ชันบนโฮสไม่มี mo-keys.local.js (ไม่อยู่ใน git) → กรอกคีย์ในหน้าตั้งค่าของแต่ละเครื่องแทน
   - คีย์อยู่ใน localStorage และซิงก์ผ่านบัญชี Supabase ของเอง (ไม่อยู่ในโค้ดบนโฮส)
     → มือถือแค่ใส่ Supabase + ล็อกอิน ก็ได้คีย์ AI ตามมาเอง
   - MO_PROFILE (เรื่องที่โมรู้ตั้งแต่แรก) ซิงก์ผ่าน Supabase → มือถือรู้เรื่องเดียวกับคอม
   ต้องโหลดหลัง mo-keys.local.js และก่อน mo-sync.js
   ============================================ */

const MoConfig = {
    keysKey: 'mo_device_keys_v1',
    profileKey: 'mo_profile_v1',
    fields: ['gemini', 'groq', 'supabaseUrl', 'supabaseAnonKey'],

    loadKeys() {
        try {
            return JSON.parse(localStorage.getItem(this.keysKey) || '{}');
        } catch (e) {
            return {};
        }
    },

    saveKeys(keys) {
        const merged = { ...this.loadKeys(), ...keys };
        this.fields.forEach(f => { if (!merged[f]) delete merged[f]; });
        try { localStorage.setItem(this.keysKey, JSON.stringify(merged)); } catch (e) {}
        window.MO_KEYS = { ...window.MO_KEYS, ...merged };
    },

    init() {
        // ค่าในไฟล์ (เครื่องที่มี mo-keys.local.js) ชนะ และจำไว้ในเครื่องนี้ด้วย
        const fileKeys = {};
        this.fields.forEach(f => { if (window.MO_KEYS && window.MO_KEYS[f]) fileKeys[f] = window.MO_KEYS[f]; });
        window.MO_KEYS = { ...this.loadKeys(), ...fileKeys };
        this.hasFileKeys = Object.keys(fileKeys).length > 0;
        if (this.hasFileKeys) this.saveKeys(fileKeys);

        if (window.MO_PROFILE) return;
        try {
            const saved = localStorage.getItem(this.profileKey);
            if (saved) window.MO_PROFILE = JSON.parse(saved);
        } catch (e) {}
    },

    /**
     * เรียกหลัง MoSync พร้อมแล้ว: เครื่องที่มีไฟล์โปรไฟล์ → บันทึก (ซิงก์ขึ้นไปให้เครื่องอื่น)
     */
    shareProfile() {
        if (!window.MO_PROFILE) return;
        const json = JSON.stringify(window.MO_PROFILE);
        try {
            if (localStorage.getItem(this.profileKey) !== json) localStorage.setItem(this.profileKey, json);
        } catch (e) {}
    },

    /**
     * เรียกหลัง MoSync พร้อมแล้ว: เครื่องที่มี mo-keys.local.js → ส่งคีย์ขึ้นบัญชีให้มือถือ
     */
    shareKeys() {
        if (!this.hasFileKeys) return;
        try { localStorage.setItem(this.keysKey, JSON.stringify(this.loadKeys())); } catch (e) {}
    },

    reloadProfile() {
        try {
            const saved = localStorage.getItem(this.profileKey);
            if (saved) window.MO_PROFILE = JSON.parse(saved);
        } catch (e) {}
    },
};

MoConfig.init();
window.MoConfig = MoConfig;
