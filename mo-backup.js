/* ============================================
   Mo Backup 💾 - สำรอง / กู้คืนข้อมูลโม เป็นไฟล์ในเครื่อง
   - เก็บทุกอย่างที่อยู่ใน localStorage ที่ขึ้นต้นด้วย mo_ (แชท ความจำ ชีวิต บ้าน สมอง ฯลฯ)
   - ไม่เก็บ API key (mo_device_keys_v1) — ไฟล์สำรองจะได้ส่งต่อ/เก็บบนคลาวด์ได้ไม่เสี่ยง
   - รูป/เสียงในแชท (IndexedDB) ไม่รวม ไฟล์จะใหญ่เกิน — ถ้าล็อกอินซิงก์ไว้ รูปอยู่บนคลาวด์อยู่แล้ว
   ============================================ */

const MoBackup = {
    SKIP: ['mo_device_keys_v1', 'mo_media_pending', 'mo_sync_meta'],

    keys() {
        return Object.keys(localStorage).filter(k => k.startsWith('mo_') && !this.SKIP.includes(k)).sort();
    },

    /** ดาวน์โหลดไฟล์ mo-backup-ปี-เดือน-วัน.json */
    download() {
        const data = {};
        this.keys().forEach(k => { data[k] = localStorage.getItem(k); });
        const d = new Date();
        const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const blob = new Blob([JSON.stringify({ app: 'mo-supansa', v: 1, at: d.toISOString(), keys: data }, null, 1)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `mo-backup-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        return { count: Object.keys(data).length, kb: Math.round(blob.size / 1024) };
    },

    /** อ่านไฟล์สำรอง → คืน { at, keys } หรือ throw ถ้าไม่ใช่ไฟล์ของโม */
    async read(file) {
        const j = JSON.parse(await file.text());
        if (!j || j.app !== 'mo-supansa' || !j.keys || typeof j.keys !== 'object') throw new Error('ไม่ใช่ไฟล์สำรองของโม');
        const keys = Object.fromEntries(Object.entries(j.keys).filter(([k, v]) => k.startsWith('mo_') && !this.SKIP.includes(k) && typeof v === 'string'));
        return { at: j.at, keys };
    },

    /** เขียนทับข้อมูลในเครื่องด้วยไฟล์สำรอง (ล็อกอินซิงก์อยู่ → ซิงก์ขึ้นคลาวด์ตามปกติ) */
    restore(keys) {
        Object.entries(keys).forEach(([k, v]) => localStorage.setItem(k, v));
        return Object.keys(keys).length;
    },
};

window.MoBackup = MoBackup;
