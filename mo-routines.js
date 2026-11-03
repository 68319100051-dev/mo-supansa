/* ============================================
   Mo Routines 🗓️ - กิจวัตรของเอง ที่โมจำเอง & ตัดสินใจทักเอง
   - เองเล่าว่า "เข้างาน 8 โมงทุกวัน" → โมจำเวลา แล้วเลือกเองว่าจะทักตอนไหน (เช่น ปลุก 7 โมง)
   - ให้ AI วิเคราะห์เฉพาะข้อความที่มีเวลา/ความถี่ (ประหยัด token)
   - ทักได้แม้ช่วงเวลานอนของแอป เพราะโมตั้งใจไว้แล้ว (เช่นปลุกตอนเช้า)
   - เรื่องครั้งเดียวที่ยังไม่จบ ("พรุ่งนี้สัมภาษณ์งาน") → โมจำไว้ แล้วทักถามผลหลังเรื่องนั้นผ่านไป
   ============================================ */

class MoRoutines {
    constructor(llm) {
        this.llm = llm;
        this.storageKey = 'mo_routines_v1';
        this.routines = this.load();
        this.followKey = 'mo_followups_v1';
        this.followUps = this.loadFollowUps();
        this.onFollowUp = null;     // (followUp) => boolean — ทักสำเร็จไหม (ตั้งจาก app.js)
        this.onDue = null;          // (routine) => boolean — ทักสำเร็จไหม (ตั้งจาก app.js)
        this.windowMs = 30 * 60000; // เลยเวลาเกิน 30 นาที = ข้ามวันนี้
    }

    load() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return [];
    }

    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.routines));
        } catch (e) {}
    }

    loadFollowUps() {
        try {
            const saved = localStorage.getItem(this.followKey);
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return [];
    }

    saveFollowUps() {
        try {
            localStorage.setItem(this.followKey, JSON.stringify(this.followUps));
        } catch (e) {}
    }

    start() {
        this.tick();
        setInterval(() => this.tick(), 30000);
    }

    /**
     * ข้อความนี้น่าจะเล่ากิจวัตร/ตารางเวลาไหม (กรองก่อนส่ง AI)
     */
    mightBeRoutine(text) {
        if (/เตือน/.test(text)) return false; // ขอให้เตือนครั้งเดียว → MoReminders จัดการ
        return /\d{1,2}\s*(?:โมง|ทุ่ม|นาฬิกา|[:.]\d{2})|ตี\s*\d|เที่ยง|ทุกวัน|ทุกเช้า|ทุกเย็น|ทุกคืน|ทุกวันจันทร์|วันธรรมดา|เสาร์อาทิตย์|ประจำ|เลิกงาน|เข้างาน|ตื่น|นอน|พรุ่งนี้|มะรืน|วันนี้|เช้านี้|บ่ายนี้|เย็นนี้|คืนนี้|เดี๋ยว|อาทิตย์หน้า|สัมภาษณ์|สอบ|หาหมอ|ประชุม|นัด|พรีเซนต์|ส่งงาน|เดินทาง|บิน/.test(text);
    }

    /**
     * โมคิดเองว่าข้อความนี้บอกกิจวัตรอะไร และจะทักตอนไหน
     */
    async learn(text) {
        if (!this.mightBeRoutine(text) || !this.llm || !this.llm.isReady()) return null;
        const existing = this.routines.map(r => ({ id: r.id, what: r.what, time: r.time, days: r.days }));
        const pendingFollow = this.followUps.map(f => ({ id: f.id, topic: f.topic }));
        const now = new Date();
        const nowText = `${now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' })} ${now.toTimeString().slice(0, 5)} (ISO ${now.toISOString()})`;
        const prompt = `คุณคือส่วนความคิดของ "โม" แฟน/เพื่อนสนิทที่ใส่ใจ อ่านข้อความที่อีกฝ่ายเพิ่งพิมพ์ แล้วตัดสินใจว่ามีกิจวัตรประจำ (ทำซ้ำเป็นประจำ ไม่ใช่ครั้งเดียว) ที่ควรจำไหม
ข้อความ: "${text}"
กิจวัตรที่จำไว้แล้ว: ${JSON.stringify(existing)}

ถ้ามีกิจวัตรใหม่หรือเปลี่ยนเวลา ให้โมเลือกเองว่าจะทักตอนไหนให้มีเหตุผล เช่น เข้างาน 08:00 → ปลุก 07:00, เลิกงาน 17:00 → ทักถามว่าเหนื่อยไหม 17:15, นอน 23:00 → บอกฝันดี 22:50

และดูว่ามีเรื่องครั้งเดียวที่กำลังจะเกิด/กำลังทำ ที่คนใส่ใจจะอยากถามผลทีหลังไหม (สัมภาษณ์งาน สอบ หาหมอ ประชุมสำคัญ เดินทาง ฯลฯ — ไม่เอาเรื่องเล็กมาก เช่น ไปอาบน้ำ)
ตอนนี้: ${nowText}
เรื่องที่รอถามผลอยู่แล้ว: ${JSON.stringify(pendingFollow)}
ให้เลือก askAt = เวลาที่เหมาะจะถามผล (หลังเรื่องนั้นน่าจะจบแล้ว เช่น สัมภาษณ์บ่ายสอง → ถาม 16:00, ไม่อยู่ช่วง 00:30-07:30) เป็น ISO พร้อม timezone

ตอบเป็น JSON เท่านั้น:
{"add":[{"what":"เข้างาน","time":"08:00","days":[1,2,3,4,5],"checkIn":"07:00","intent":"ปลุกให้ตื่นไปทำงาน ไม่ให้สาย"}],"remove":["id ของกิจวัตรเดิมที่ถูกแทนหรือเลิกทำแล้ว"],
 "followUps":[{"topic":"สัมภาษณ์งาน","askAt":"2026-11-04T16:00:00+07:00","intent":"ถามว่าสัมภาษณ์เป็นไงบ้าง ให้กำลังใจ"}],"doneFollowUps":["id ของเรื่องที่เองเล่าผลแล้วในข้อความนี้"]}
days: 0=อาทิตย์ ... 6=เสาร์ ("ทุกวัน" = [0,1,2,3,4,5,6], ไม่บอกวัน = ทุกวัน)
ไม่มีอะไร ให้ตอบ {"add":[],"remove":[],"followUps":[],"doneFollowUps":[]}`;

        let result;
        try {
            result = await this.llm.completeJSON(prompt);
        } catch (e) {
            return null;
        }
        const valid = t => typeof t === 'string' && /^\d{1,2}:\d{2}$/.test(t);
        const removed = Array.isArray(result.remove) ? result.remove : [];
        const added = (Array.isArray(result.add) ? result.add : [])
            .filter(r => r && r.what && valid(r.time) && valid(r.checkIn))
            .map(r => ({
                id: 'rt_' + Date.now() + Math.random().toString(36).slice(2, 6),
                what: String(r.what).slice(0, 60),
                time: r.time,
                days: Array.isArray(r.days) && r.days.length ? r.days.filter(d => d >= 0 && d <= 6) : [0, 1, 2, 3, 4, 5, 6],
                checkIn: r.checkIn,
                intent: String(r.intent || `ทักเรื่อง${r.what}`).slice(0, 120),
                lastDone: null,
            }));
        this.addFollowUps(result);
        if (!added.length && !removed.length) return null;

        // กิจวัตรเดิมเรื่องเดียวกัน → แทนที่
        const sameWhat = new Set(added.map(r => r.what));
        this.routines = this.routines.filter(r => !removed.includes(r.id) && !sameWhat.has(r.what)).concat(added);
        this.save();
        return added;
    }

    addFollowUps(result) {
        const done = Array.isArray(result.doneFollowUps) ? result.doneFollowUps : [];
        const fresh = (Array.isArray(result.followUps) ? result.followUps : [])
            .map(f => f && f.topic && { topic: String(f.topic).slice(0, 60), askAt: Date.parse(f.askAt), intent: String(f.intent || `ถามว่า${f.topic}เป็นไงบ้าง`).slice(0, 120) })
            .filter(f => f && f.askAt > Date.now() && f.askAt < Date.now() + 14 * 86400000)
            .map(f => ({ id: 'fu_' + Date.now() + Math.random().toString(36).slice(2, 6), ...f }));
        if (!fresh.length && !done.length) return;
        const topics = new Set(fresh.map(f => f.topic));
        this.followUps = this.followUps.filter(f => !done.includes(f.id) && !topics.has(f.topic)).concat(fresh);
        this.saveFollowUps();
        if (fresh.length && window.MoMindInstance) window.MoMindInstance.decide(`จำไว้ว่าจะถามเรื่อง${fresh.map(f => f.topic).join(', ')}`);
    }

    removeFollowUp(id) {
        this.followUps = this.followUps.filter(f => f.id !== id);
        this.saveFollowUps();
    }

    remove(id) {
        this.routines = this.routines.filter(r => r.id !== id);
        this.save();
    }

    checkInDate(routine, base = new Date()) {
        const [hh, mm] = routine.checkIn.split(':').map(Number);
        const d = new Date(base);
        d.setHours(hh, mm, 0, 0);
        return d;
    }

    tick() {
        const now = new Date();
        const today = now.toDateString();
        for (const r of this.routines) {
            if (r.lastDone === today || !r.days.includes(now.getDay())) continue;
            const late = now - this.checkInDate(r, now);
            if (late < 0 || late > this.windowMs) continue;
            // ทักไม่ได้ตอนนี้ (กำลังพิมพ์/อยู่ในสาย) → ลองใหม่รอบหน้า ภายใน 30 นาที
            if (this.onDue && this.onDue(r) !== false) {
                r.lastDone = today;
                this.save();
            }
        }
        this.tickFollowUps();
    }

    tickFollowUps() {
        const now = Date.now();
        // เลยมาเกิน 12 ชม.แล้ว ถามไปก็ไม่เป็นธรรมชาติ → ทิ้ง
        const stale = this.followUps.filter(f => now - f.askAt > 12 * 3600000);
        if (stale.length) {
            this.followUps = this.followUps.filter(f => !stale.includes(f));
            this.saveFollowUps();
        }
        const due = this.followUps.find(f => f.askAt <= now);
        if (due && this.onFollowUp && this.onFollowUp(due) !== false) this.removeFollowUp(due.id);
    }

    describe(routine) {
        const names = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
        const days = routine.days.length === 7 ? 'ทุกวัน'
            : routine.days.join() === '1,2,3,4,5' ? 'จ-ศ'
            : routine.days.map(d => names[d]).join(' ');
        return `${routine.what} ${routine.time} (${days}) → โมจะทัก ${routine.checkIn}: ${routine.intent}`;
    }
}

// Export
window.MoRoutines = MoRoutines;
