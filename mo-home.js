/* ============================================
   Mo Home 🏡 - ของในบ้านที่มีชีวิต
   - น้องแมวที่เลี้ยงด้วยกัน (หิว/รัก/ความสะอาด ลดลงตามเวลา โมดูแลให้ตอนอยู่บ้าน)
   - ต้นไม้ระเบียง โตตามจำนวนวันที่เราคุยกัน (ไม่รดน้ำ/หายไปนาน = เหี่ยว)
   - ปฏิทินของเราบนผนัง: วันครบรอบ นัด วันสำคัญ + นับถอยหลัง
   ============================================ */

const MO_PLANT_STAGES = [
    { days: 0, emoji: '🌱', name: 'ต้นอ่อน' },
    { days: 3, emoji: '🌿', name: 'แตกใบ' },
    { days: 7, emoji: '🪴', name: 'โตเป็นพุ่ม' },
    { days: 21, emoji: '🌷', name: 'ออกดอก' },
    { days: 60, emoji: '🌳', name: 'ต้นไม้ใหญ่' },
];

class MoHome {
    constructor(reminders) {
        this.reminders = reminders;
        this.storageKey = 'mo_home_v1';
        this.data = this.load();
        this.tick();
    }

    load() {
        const now = Date.now();
        const empty = {
            pet: { name: 'ขนมปัง', hunger: 30, love: 70, clean: 80, at: now, born: now, log: [] },
            plant: { water: 80, at: now },
            events: [],   // { id, title, emoji, date: 'YYYY-MM-DD', yearly }
        };
        try {
            const saved = JSON.parse(localStorage.getItem(this.storageKey));
            if (saved) return { ...empty, ...saved, pet: { ...empty.pet, ...saved.pet }, plant: { ...empty.plant, ...saved.plant } };
        } catch (e) {}
        return empty;
    }

    save() {
        try { localStorage.setItem(this.storageKey, JSON.stringify(this.data)); } catch (e) {}
    }

    clamp(v) {
        return Math.max(0, Math.min(100, Math.round(v)));
    }

    /** เวลาผ่านไป → แมวหิวขึ้น เหงาขึ้น ต้นไม้แห้ง / โมอยู่บ้านก็ดูแลให้ */
    tick(life) {
        const now = Date.now();
        const p = this.data.pet, pl = this.data.plant;
        const h = Math.min(48, (now - p.at) / 3600000);
        p.hunger = this.clamp(p.hunger + h * 5);
        p.love = this.clamp(p.love - h * 2.5);
        p.clean = this.clamp(p.clean - h * 1.5);
        p.at = now;
        pl.water = this.clamp(pl.water - Math.min(48, (now - pl.at) / 3600000) * 3);
        pl.at = now;
        const c = life && life.state.current;
        if (c && c.room !== 'out' && c.id !== 'sleep') {
            if (p.hunger > 65) this.petLog(this.feed(true));
            if (pl.water < 25) { pl.water = 85; this.petLog('🪴 โมรดน้ำต้นไม้ที่ระเบียง'); }
        }
        this.save();
    }

    petLog(text) {
        const p = this.data.pet;
        p.log = [...(p.log || []), { at: Date.now(), text }].slice(-12);
    }

    petMood() {
        const p = this.data.pet;
        const hour = new Date().getHours();
        if (hour >= 23 || hour < 6) return { emoji: '😴', label: 'หลับปุ๋ย', sleeping: true };
        if (p.hunger > 70) return { emoji: '😿', label: 'หิวมาก ร้องเหมียวๆ' };
        if (p.clean < 30) return { emoji: '🙀', label: 'ขนพันกัน อยากให้แปรง' };
        if (p.love < 30) return { emoji: '😾', label: 'งอน อยากให้เล่นด้วย' };
        if (p.love > 75 && p.hunger < 40) return { emoji: '😻', label: 'อารมณ์ดี คลอเคลีย' };
        return { emoji: '😺', label: 'ชิลๆ เดินเล่นในบ้าน' };
    }

    /** แมวอยู่ตรงไหนในบ้าน (พิกัด isometric ของบ้าน) */
    petSpot(life) {
        const mood = this.petMood();
        if (mood.sleeping) return [10.6, 2.6, 5.5];              // ขดบนเตียง
        if (this.data.pet.hunger > 70) return [7.6, 1.6, 0];      // นั่งรอที่ชามข้าวในครัว
        const room = life && life.state.current && life.state.current.room;
        return {
            bedroom: [7.6, 2.8, 4.8], living: [2.4, 6.2, 0.01], kitchen: [7.6, 1.6, 0],
            bathroom: [9.6, 3.2, 0], balcony: [1.8, 2.8, 4.8],
        }[room] || [2.4, 6.2, 0.01];                              // ไม่อยู่ = นอนบนพรมรอ
    }

    feed(byMo = false) {
        const p = this.data.pet;
        p.hunger = this.clamp(p.hunger - 60);
        p.love = this.clamp(p.love + 5);
        this.save();
        return byMo ? `🐟 โมให้อาหาร${p.name}` : `🐟 เองให้อาหาร${p.name}แล้ว กินหมดชามเลย`;
    }

    play() {
        const p = this.data.pet;
        p.love = this.clamp(p.love + 25);
        p.hunger = this.clamp(p.hunger + 5);
        this.save();
        return `🧶 เล่นไม้ตกแมวกับ${p.name} กระโดดใหญ่เลย`;
    }

    brush() {
        const p = this.data.pet;
        p.clean = this.clamp(p.clean + 45);
        p.love = this.clamp(p.love + 8);
        this.save();
        return `🪮 แปรงขนให้${p.name} ขนนุ่มฟูแล้ว`;
    }

    rename(name) {
        const n = String(name || '').trim().slice(0, 16);
        if (n) { this.data.pet.name = n; this.save(); }
    }

    water() {
        this.data.plant.water = 100;
        this.save();
        return '💧 รดน้ำต้นไม้ที่ระเบียงแล้ว';
    }

    /** ต้นไม้โตตามจำนวน "วันที่ได้คุยกัน" — หายไป 3 วันหรือไม่มีน้ำ = เหี่ยว */
    plant(messages) {
        const days = new Set((messages || []).filter(m => m.type === 'sent').map(m => new Date(m.timestamp).toDateString())).size;
        const lastSent = [...(messages || [])].reverse().find(m => m.type === 'sent');
        const gone = lastSent ? (Date.now() - lastSent.timestamp) / 86400000 : 0;
        const bonus = this.getBonus ? this.getBonus() : 0;   // วันที่ทำภารกิจครบ = โตเร็วขึ้น
        const grown = days + bonus;
        const stage = [...MO_PLANT_STAGES].reverse().find(s => grown >= s.days);
        const next = MO_PLANT_STAGES.find(s => s.days > grown);
        const wilted = this.data.plant.water < 15 || gone > 3;
        return { ...stage, days: grown, next, wilted, water: this.data.plant.water, emoji: wilted ? '🥀' : stage.emoji };
    }

    // =============================================
    //  ปฏิทินของเรา
    // =============================================

    /** วันที่ครั้งถัดไปของ event (yearly = วนทุกปี) */
    nextDate(ev) {
        const [y, m, d] = ev.date.split('-').map(Number);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        let when = new Date(y, m - 1, d);
        if (ev.yearly) {
            when = new Date(today.getFullYear(), m - 1, d);
            if (when < today) when = new Date(today.getFullYear() + 1, m - 1, d);
        }
        return { when, daysLeft: Math.round((when - today) / 86400000) };
    }

    addEvent(title, date, yearly = false, emoji = '📌') {
        const ev = { id: 'ev_' + Date.now().toString(36), title: String(title).slice(0, 60), emoji, date, yearly };
        this.data.events.push(ev);
        this.save();
        // ถึงวัน 9 โมงเช้า → โมทักเอง (ใช้ระบบเตือนเดิม ทำงานตอนปิดแอปด้วย)
        const { when, daysLeft } = this.nextDate(ev);
        if (this.reminders && daysLeft >= 0) {
            when.setHours(9, 0, 0, 0);
            if (when > Date.now()) this.reminders.add(`วันนี้คือวัน "${ev.title}" ${ev.emoji} ของเรา`, when.getTime(), false, 'calendar');
        }
        return ev;
    }

    removeEvent(id) {
        this.data.events = this.data.events.filter(e => e.id !== id);
        this.save();
    }

    /** วันสำคัญทั้งหมดที่ยังไม่ผ่าน (ของเรา + วันเกิด/ครบรอบที่ระบบรู้เอง) เรียงใกล้สุดก่อน */
    upcoming() {
        const own = this.data.events.map(e => ({ ...e, ...this.nextDate(e) })).filter(e => e.daysLeft >= 0);
        const auto = this.reminders ? this.reminders.getUpcoming().map(u => ({ id: null, title: u.title, emoji: '', daysLeft: u.daysLeft })) : [];
        return [...own, ...auto].sort((a, b) => a.daysLeft - b.daysLeft);
    }

    // =============================================
    //  ให้ AI รู้
    // =============================================

    promptSection(contextText = '') {
        const p = this.data.pet;
        const mood = this.petMood();
        const lines = [`- น้องแมว "${p.name}" ที่เลี้ยงด้วยกัน ตอนนี้${mood.label} (หิว ${p.hunger}/100) — เล่าเรื่องน้องได้บางครั้ง ไม่ต้องทุกข้อความ`];
        const soon = this.upcoming().filter(e => e.daysLeft <= 7).slice(0, 3);
        if (soon.length) lines.push(`- วันสำคัญใกล้ๆ: ${soon.map(e => `${e.title} (${e.daysLeft === 0 ? 'วันนี้!' : `อีก ${e.daysLeft} วัน`})`).join(', ')}`);
        if (/ต้นไม้|ระเบียง|ปลูก/.test(contextText)) {
            const pl = this.plant(this.getMessages ? this.getMessages() : []);
            lines.push(`- ต้นไม้ที่ระเบียง: ${pl.wilted ? 'เหี่ยวเพราะขาดน้ำ/เราหายไป' : pl.name} (คุยกันมา ${pl.days} วัน)`);
        }
        return `# บ้านของเรา\n${lines.join('\n')}\n\n`;
    }
}

window.MoHome = MoHome;
window.MO_PLANT_STAGES = MO_PLANT_STAGES;
