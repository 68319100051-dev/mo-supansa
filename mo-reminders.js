/* ============================================
   Mo Reminders ⏰ - การเตือน & วันสำคัญ
   - "เตือนกินยาอีก 30 นาที" / "อีก 1 ชม. เตือนโทรหาแม่" / "เตือนประชุมตอน 15:30"
   - ภาษาพูด: "ตอนเที่ยงเตือนกินข้าว" "บ่ายสองเตือนประชุม" "สองทุ่มครึ่ง" "พรุ่งนี้เช้า" "ตีห้า"
   - "ทุกวัน" → เตือนซ้ำทุกวัน (เก็บเป็นกิจวัตร) / ประโยคแปลกๆ → ให้ AI ช่วยอ่าน
   - วันเกิด (จากความจำ) และวันครบรอบที่รู้จักกัน
   ============================================ */

class MoReminders {
    constructor(memory) {
        this.memory = memory;
        this.storageKey = 'mo_reminders_v1';
        this.specialKey = 'mo_special_days_v1';
        this.reminders = this.load();
        this.onDue = null;          // (reminder) => void — ตั้งจาก app.js
        this.onSpecialDay = null;   // (message) => void

        this.thaiMonths = [
            ['มกรา', 'ม.ค'], ['กุมภา', 'ก.พ'], ['มีนา', 'มี.ค'], ['เมษา', 'เม.ย'],
            ['พฤษภา', 'พ.ค'], ['มิถุนา', 'มิ.ย'], ['กรกฎา', 'ก.ค'], ['สิงหา', 'ส.ค'],
            ['กันยา', 'ก.ย'], ['ตุลา', 'ต.ค'], ['พฤศจิกา', 'พ.ย'], ['ธันวา', 'ธ.ค'],
        ];
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
            localStorage.setItem(this.storageKey, JSON.stringify(this.reminders));
        } catch (e) {}
    }

    start() {
        this.tick();
        this.checkSpecialDays();
        setInterval(() => this.tick(), 15000);
        setInterval(() => this.checkSpecialDays(), 60 * 60 * 1000);
    }

    // =============================================
    //  แปลงข้อความเป็นการเตือน
    // =============================================

    /**
     * คืนค่า reminder ถ้าข้อความเป็นการขอให้เตือน, ไม่ใช่ → null
     */
    parse(message) {
        if (!/เตือน/.test(message)) return null;
        const units = { 'วิ': 1000, 'วินาที': 1000, 'นาที': 60000, 'ชม': 3600000, 'ชั่วโมง': 3600000 };
        const clean = s => s.replace(/^(?:เรา|ผม|ฉัน|หนู|หน่อย|ด้วย|ให้)+/, '').replace(/(?:หน่อย|ด้วย|นะ|ที|ครับ|ค่ะ|จ้า|\s)+$/, '').trim();

        // "เตือน X อีก 10 นาที" / "อีก 10 นาที เตือน X"
        let m = message.match(/เตือน\s*(.+?)\s*(?:ใน)?อีก\s*(\d+)\s*(วินาที|วิ|นาที|ชั่วโมง|ชม)\.?/)
            || message.match(/(?:ใน)?อีก\s*(\d+)\s*(วินาที|วิ|นาที|ชั่วโมง|ชม)\.?\s*เตือน\s*(.+)/);
        if (m) {
            const [text, n, unit] = m[0].startsWith('เตือน') ? [m[1], m[2], m[3]] : [m[3], m[1], m[2]];
            return this.add(clean(text) || 'เรื่องที่ให้เตือน', Date.now() + Number(n) * units[unit]);
        }

        // "เตือน X ตอน 15:30" / "พรุ่งนี้ 8 โมง ... " (รองรับ HH:MM หรือ HH.MM)
        m = message.match(/เตือน\s*(.+?)\s*(?:ตอน|เวลา)\s*(\d{1,2})[:.](\d{2})/)
            || message.match(/(?:ตอน|เวลา)\s*(\d{1,2})[:.](\d{2})\s*(?:น\.?)?\s*เตือน\s*(.+)/);
        if (m) {
            const [text, hh, mm] = m[0].startsWith('เตือน') ? [m[1], m[2], m[3]] : [m[3], m[1], m[2]];
            const due = new Date();
            due.setHours(Number(hh), Number(mm), 0, 0);
            if (/พรุ่งนี้/.test(message) || due.getTime() <= Date.now()) due.setDate(due.getDate() + 1);
            return this.add(clean(text.replace('พรุ่งนี้', '')) || 'เรื่องที่ให้เตือน', due.getTime());
        }

        // ภาษาพูด: "ตอนเที่ยงเตือนกินข้าว" "เตือนประชุมบ่ายสอง" "พรุ่งนี้แปดโมงเช้า" "ทุกวันสองทุ่ม"
        const t = this.parseThaiTime(message);
        if (t) {
            const what = this.reminderText(message, t.match) || 'เรื่องที่ให้เตือน';
            return this.add(what, this.resolveTime(t, message), /ทุกวัน|ทุกเช้า|ทุกเย็น|ทุกคืน/.test(message));
        }
        return null;
    }

    /**
     * อ่านเวลาภาษาพูดไทย → { h, m, match, ambiguous } (ไม่เจอ → null)
     */
    parseThaiTime(message) {
        const nums = { 'หนึ่ง': 1, 'สอง': 2, 'สาม': 3, 'สี่': 4, 'ห้า': 5, 'หก': 6, 'เจ็ด': 7, 'แปด': 8, 'เก้า': 9, 'สิบ': 10, 'สิบเอ็ด': 11, 'สิบสอง': 12 };
        const N = '(\\d{1,2}|สิบเอ็ด|สิบสอง|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ)';
        const num = v => (/^\d+$/.test(v) ? Number(v) : nums[v]);
        const half = s => (/ครึ่ง/.test(s) ? 30 : Number((s.match(/(\d{1,2})\s*นาที/) || [])[1]) || 0);
        const rules = [
            [new RegExp(`(\\d{1,2})\\s*[:.]\\s*(\\d{2})\\s*(?:น\\.?)?`), m => ({ h: +m[1], m: +m[2] })],
            [/เที่ยงคืน/, () => ({ h: 0, m: 0 })],
            [/เที่ยง(?:วัน|ตรง)?(?:ครึ่ง)?/, m => ({ h: 12, m: half(m[0]) })],
            [new RegExp(`ตี\\s*${N}(?:\\s*ครึ่ง)?`), m => ({ h: num(m[1]) % 24, m: half(m[0]) })],
            [new RegExp(`${N}\\s*ทุ่ม(?:\\s*ครึ่ง)?`), m => ({ h: 18 + num(m[1]), m: half(m[0]) })],
            [new RegExp(`บ่าย\\s*${N}?\\s*(?:โมง)?(?:\\s*ครึ่ง)?`), m => ({ h: 12 + (m[1] ? num(m[1]) : 1), m: half(m[0]) })],
            [new RegExp(`${N}\\s*โมง\\s*เย็น(?:\\s*ครึ่ง)?`), m => ({ h: 12 + num(m[1]), m: half(m[0]) })],
            [new RegExp(`${N}\\s*โมง\\s*เช้า(?:\\s*ครึ่ง)?`), m => ({ h: num(m[1]), m: half(m[0]) })],
            [new RegExp(`${N}\\s*โมง(?:\\s*ครึ่ง)?`), m => { const n = num(m[1]); return { h: n, m: half(m[0]), ambiguous: n <= 6 }; }],
            [/ก่อนนอน/, () => ({ h: 22, m: 0 })],
            [/พรุ่งนี้เช้า|ตอนเช้านี้|เช้านี้|ตอนเช้า/, () => ({ h: 8, m: 0 })],
            [/ตอนบ่ายนี้|บ่ายนี้|ตอนบ่าย/, () => ({ h: 13, m: 0 })],
            [/ตอนเย็นนี้|เย็นนี้|ตอนเย็น/, () => ({ h: 18, m: 0 })],
            [/ตอนค่ำ|คืนนี้/, () => ({ h: 20, m: 0 })],
        ];
        for (const [re, fn] of rules) {
            const m = message.match(re);
            if (!m) continue;
            const t = fn(m);
            if (t.h > 23 || t.m > 59 || Number.isNaN(t.h)) continue;
            return { ...t, match: m[0] };
        }
        return null;
    }

    /**
     * วันที่/เวลาจริงจากเวลาที่อ่านได้: พรุ่งนี้/มะรืน, เลยเวลาแล้ว → พรุ่งนี้, "6 โมง" กำกวม → เลือกอันที่ใกล้ข้างหน้า
     */
    resolveTime(t, message) {
        const due = new Date();
        const dayShift = /มะรืน/.test(message) ? 2 : /พรุ่งนี้/.test(message) ? 1 : 0;
        due.setDate(due.getDate() + dayShift);
        due.setHours(t.h, t.m, 0, 0);
        if (t.ambiguous && !dayShift) {
            const pm = new Date(due); pm.setHours(t.h + 12);
            if (due.getTime() <= Date.now() && pm.getTime() > Date.now()) return pm.getTime();
        }
        if (!dayShift && due.getTime() <= Date.now()) due.setDate(due.getDate() + 1);
        return due.getTime();
    }

    /**
     * ตัดคำเวลา/คำเติมออก เหลือเรื่องที่ต้องเตือน
     */
    reminderText(message, timeMatch) {
        return message
            .replace(timeMatch || '', ' ')
            .replace(/โม|เค้า|ช่วย|เตือน|หน่อย|ด้วย|ให้|ที|นะ|ครับ|ค่ะ|จ้า|น้า|ตอน|เวลา|พรุ่งนี้|มะรืน|วันนี้|ทุกวัน|ประมาณ|ราวๆ|สัก|เรา|ผม|หนู|ฉัน/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * ประโยคที่ regex อ่านไม่ออก → ให้ AI อ่าน (คืน reminder หรือ null)
     */
    async parseWithAI(message, llm) {
        if (!llm || !llm.isReady()) return null;
        try {
            const r = await llm.completeJSON(`ผู้ใช้พิมพ์ขอให้ช่วยเตือน: "${message}"
ตอนนี้: ${new Date().toString()} (ISO ${new Date().toISOString()})
หาว่าเตือนเรื่องอะไร เมื่อไหร่ ตอบ JSON: {"text":"เรื่องที่ต้องเตือนสั้นๆ","dueAt":"ISO พร้อม timezone","daily":false}
daily=true ถ้าขอให้เตือนทุกวัน / ถ้าไม่ได้ขอให้เตือนจริงๆ หรือไม่บอกเวลา ตอบ {"text":"","dueAt":""}`);
            const at = Date.parse(r && r.dueAt);
            if (!r || !r.text || !at || at < Date.now() - 60000 || at > Date.now() + 60 * 86400000) return null;
            return this.add(String(r.text).slice(0, 80), at, Boolean(r.daily));
        } catch (e) {
            return null;
        }
    }

    add(text, dueAt, daily = false) {
        const reminder = { id: 'rm_' + Date.now(), text, dueAt, done: false, ...(daily ? { daily: true } : {}) };
        this.reminders.push(reminder);
        this.save();
        return reminder;
    }

    remove(id) {
        this.reminders = this.reminders.filter(r => r.id !== id);
        this.save();
    }

    getPending() {
        return this.reminders.filter(r => !r.done).sort((a, b) => a.dueAt - b.dueAt);
    }

    /**
     * ข้อความยืนยันตอนรับเรื่องเตือน
     */
    confirmMessage(reminder) {
        const diff = reminder.dueAt - Date.now();
        const mins = Math.round(diff / 60000);
        let when;
        if (diff < 60000) when = `อีก ${Math.max(1, Math.round(diff / 1000))} วิ`;
        else if (mins < 60) when = `อีก ${mins} นาที`;
        else if (mins < 24 * 60 && new Date(reminder.dueAt).getDate() === new Date().getDate()) when = `ตอน ${this.formatTime(reminder.dueAt)}`;
        else when = `${new Date(reminder.dueAt).getDate() - new Date().getDate() > 1 ? new Date(reminder.dueAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : 'พรุ่งนี้'} ${this.formatTime(reminder.dueAt)}`;
        if (reminder.daily) when = `ทุกวันตอน ${this.formatTime(reminder.dueAt)}`;
        return this.pick([
            `โอเคค ${when} เค้าเตือนเรื่อง${reminder.text}ให้นะ ⏰`,
            `รับทราบบ ${when} จะทักไปเตือน${reminder.text}เอง 💕`,
        ]);
    }

    formatTime(ts) {
        const d = new Date(ts);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    tick() {
        const now = Date.now();
        for (const r of this.reminders) {
            if (!r.done && r.dueAt <= now) {
                if (this.onDue) this.onDue(r);
                // เตือนทุกวัน → เลื่อนไปวันถัดไป (ใช้ id ใหม่ให้หลังบ้านส่ง Push ได้อีก)
                if (r.daily) {
                    while (r.dueAt <= now) r.dueAt += 86400000;
                    r.id = 'rm_' + Date.now() + Math.random().toString(36).slice(2, 5);
                } else {
                    r.done = true;
                }
                this.save();
            }
        }
        // เก็บที่เตือนแล้วไว้แค่ 20 รายการล่าสุด
        const done = this.reminders.filter(r => r.done);
        if (done.length > 20) {
            const drop = new Set(done.slice(0, done.length - 20).map(r => r.id));
            this.reminders = this.reminders.filter(r => !drop.has(r.id));
            this.save();
        }
    }

    dueMessage(reminder) {
        const name = this.memory.getUserName();
        const late = Date.now() - reminder.dueAt > 5 * 60000;
        if (late) return `${name}~ เมื่อกี้ถึงเวลา${reminder.text}แล้วนะ ทำยัง 👀`;
        return this.pick([
            `⏰ ${name}~ ถึงเวลา${reminder.text}แล้วนะ!`,
            `⏰ เตือนแล้วนะ ${reminder.text}! อย่าลืมล่ะ 💕`,
        ]);
    }

    // =============================================
    //  วันสำคัญ
    // =============================================

    /**
     * อ่านวันเกิดจากความจำ เช่น "วันเกิด: 12 มีนา" หรือ "12/3" → { day, month(0-11) }
     */
    getBirthday() {
        const fact = this.memory.data.longTerm.keyedFacts?.birthday;
        if (!fact) return null;
        const raw = fact.replace('วันเกิด:', '').trim();
        let m = raw.match(/^(\d{1,2})\/(\d{1,2})$/);
        if (m) return { day: Number(m[1]), month: Number(m[2]) - 1 };
        m = raw.match(/^(\d{1,2})\s*(.+)$/);
        if (!m) return null;
        const month = this.thaiMonths.findIndex(names => names.some(n => m[2].startsWith(n.replace('.', '')) || m[2].startsWith(n)));
        return month >= 0 ? { day: Number(m[1]), month } : null;
    }

    daysUntil(day, month) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const next = new Date(today.getFullYear(), month, day);
        if (next < today) next.setFullYear(next.getFullYear() + 1);
        return Math.round((next - today) / 86400000);
    }

    /**
     * รายการวันสำคัญที่กำลังจะมาถึง (สำหรับหน้าความจำ)
     */
    getUpcoming() {
        const list = [];
        const bd = this.getBirthday();
        if (bd) {
            const d = this.daysUntil(bd.day, bd.month);
            list.push({ title: `🎂 วันเกิด${this.memory.getUserName()}`, daysLeft: d });
        }
        const known = this.memory.getDaysKnown();
        const milestone = [7, 30, 100, 365, 500, 730, 1000, 1095].find(n => n > known);
        if (milestone) {
            list.push({ title: `💞 รู้จักกันครบ ${milestone} วัน`, daysLeft: milestone - known });
        }
        return list.sort((a, b) => a.daysLeft - b.daysLeft);
    }

    /**
     * วันละครั้ง: ถ้าวันนี้เป็นวันสำคัญ → โมทัก
     */
    checkSpecialDays() {
        const todayKey = new Date().toDateString();
        let last = null;
        try { last = localStorage.getItem(this.specialKey); } catch (e) {}
        if (last === todayKey) return;

        const name = this.memory.getUserName();
        const messages = [];
        const bd = this.getBirthday();
        if (bd) {
            const d = this.daysUntil(bd.day, bd.month);
            if (d === 0) messages.push(`🎂 สุขสันต์วันเกิดนะ${name}!! ขอให้มีความสุขมากๆ เจอแต่เรื่องดีๆ เค้าดีใจที่ได้รู้จักเองนะ 💖`);
            else if (d === 1) messages.push(`พรุ่งนี้วันเกิดเองแล้วนะ! อยากได้อะไรอ่ะ 55555 🎁`);
        }
        const known = this.memory.getDaysKnown();
        if ([7, 30, 100, 500, 1000].includes(known) || (known > 0 && known % 365 === 0)) {
            messages.push(`💞 วันนี้ครบ ${known} วันที่เรารู้จักกันแล้วนะ${name} ขอบคุณที่มาคุยกับเค้าตลอดเลย`);
        }

        try { localStorage.setItem(this.specialKey, todayKey); } catch (e) {}
        if (this.onSpecialDay) messages.forEach(msg => this.onSpecialDay(msg));
    }

    pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }
}

// Export
window.MoReminders = MoReminders;
