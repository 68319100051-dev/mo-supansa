/* ============================================
   Mo Reminders ⏰ - การเตือน & วันสำคัญ
   - "เตือนกินยาอีก 30 นาที" / "อีก 1 ชม. เตือนโทรหาแม่" / "เตือนประชุมตอน 15:30"
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
        return null;
    }

    add(text, dueAt) {
        const reminder = { id: 'rm_' + Date.now(), text, dueAt, done: false };
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
        else when = `พรุ่งนี้ ${this.formatTime(reminder.dueAt)}`;
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
                r.done = true;
                this.save();
                if (this.onDue) this.onDue(r);
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
