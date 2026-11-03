/* ============================================
   Mo Care 💗 - โมสังเกตและเป็นห่วงเอง (แบบแฟนจริง)
   - อ่านจากแชท: ไม่สบาย / เหนื่อย-เครียดงาน / กินข้าวยัง / นอนดึก / ออกไปข้างนอก / มีเรื่องสำคัญ
   - รวมเป็น "เรื่องที่โมห่วงตอนนี้" → ส่งให้ AI หยิบมาถามทีละเรื่องเมื่อเข้าจังหวะ
   - ถึงเวลาเหมาะ → โมทักถามเองก่อน (กินข้าวยัง ตอนเที่ยง/ค่ำ, หายป่วยยัง ตอนเช้า, ฝนตกเอาร่มไปยัง, ดึกแล้วไปนอน)
   - ห่วงแต่ไม่จู้จี้: แต่ละเรื่องถามไม่เกินวันละครั้ง
   ============================================ */

class MoCare {
    constructor() {
        this.storageKey = 'mo_care_v1';
        this.data = this.load();
    }

    load() {
        try {
            const saved = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
            if (saved) return saved;
        } catch (e) {}
        return { signals: {}, asked: {} };
    }

    save() {
        try { localStorage.setItem(this.storageKey, JSON.stringify(this.data)); } catch (e) {}
    }

    today() {
        return new Date().toDateString();
    }

    set(kind, detail = '') {
        this.data.signals[kind] = { at: Date.now(), day: this.today(), detail: String(detail).slice(0, 60) };
    }

    has(kind, withinH) {
        const s = this.data.signals[kind];
        return s && Date.now() - s.at < withinH * 3600000 ? s : null;
    }

    /**
     * ช่วงเวลาที่เองมักออนไลน์ (จากข้อความ 14 วันล่าสุด) → Set ของชั่วโมง / ข้อมูลน้อยไป → null
     */
    static activeHours(messages) {
        const since = Date.now() - 14 * 86400000;
        const counts = new Array(24).fill(0);
        messages.filter(m => m.type === 'sent' && m.timestamp > since).forEach(m => { counts[new Date(m.timestamp).getHours()]++; });
        const total = counts.reduce((a, b) => a + b, 0);
        if (total < 30) return null;
        const max = Math.max(...counts);
        return new Set(counts.map((c, h) => (c >= max * 0.15 ? h : -1)).filter(h => h >= 0));
    }

    /**
     * อ่านข้อความของเอง → จดสัญญาณที่โมควรห่วง
     */
    observe(text) {
        const t = text;
        const h = new Date().getHours();
        if (/ไม่สบาย|ป่วย|เป็นไข้|ไข้ขึ้น|ปวดหัว|ปวดท้อง|เจ็บคอ|ไอ|เป็นหวัด|มีน้ำมูก|ท้องเสีย|เวียนหัว/.test(t)) this.set('sick', t);
        if (/หายแล้ว|ดีขึ้นแล้ว|หายป่วย|ไม่เป็นไรแล้ว/.test(t)) delete this.data.signals.sick;
        if (/กิน(?:ข้าว)?(?:แล้ว|อิ่ม)|อิ่มแล้ว|เพิ่งกิน|กินเสร็จ/.test(t)) this.set('ate', t);
        if (/ยังไม่(?:ได้)?กิน|ไม่ได้กินข้าว|หิว/.test(t)) this.set('hungry', t);
        if (/เหนื่อย|เครียด|งานเยอะ|โดนด่า|ท้อ|ไม่ไหว|หมดแรง/.test(t)) this.set('tired', t);
        if (/ออกไป|ไปทำงาน|ไปเรียน|เดินทาง|ขับรถ|นั่งรถ|ออกจากบ้าน/.test(t)) this.set('out', t);
        if (/ถึงบ้าน|กลับถึง|ถึงแล้ว/.test(t)) delete this.data.signals.out;
        if (/นอนไม่หลับ|ตาค้าง|ยังไม่นอน|นอนดึก/.test(t)) this.set('nosleep', t);
        // คุยกันตอนดึกมาก = นอนดึก
        if (h >= 0 && h < 5) this.set('late', `${h}:${String(new Date().getMinutes()).padStart(2, '0')}`);
        this.save();
    }

    /**
     * เรื่องที่โมห่วงตอนนี้ (ตามเวลาและสัญญาณ) → [{ id, ask }]
     */
    concerns() {
        const h = new Date().getHours();
        const list = [];
        const sick = this.has('sick', 72);
        if (sick) list.push({ id: 'sick', ask: `เองไม่สบาย (บอกว่า "${sick.detail}") ถามว่าดีขึ้นยัง กินยาหรือยัง พักผ่อนบ้างไหม` });
        const ateToday = this.data.signals.ate && this.data.signals.ate.day === this.today();
        if (!ateToday && h >= 12 && h < 15) list.push({ id: 'lunch', ask: 'ยังไม่รู้ว่าเองกินข้าวเที่ยงยัง ถามว่ากินอะไร' });
        if (!ateToday && h >= 19 && h < 22) list.push({ id: 'dinner', ask: 'วันนี้ยังไม่รู้ว่าเองกินข้าวเย็นยัง ถามหน่อย' });
        if (this.has('hungry', 3)) list.push({ id: 'hungry', ask: 'เองบอกว่าหิว/ยังไม่ได้กิน ถามว่าได้กินยัง ชวนหาอะไรกิน' });
        const tired = this.has('tired', 10);
        if (tired && h >= 17) list.push({ id: 'tired', ask: `วันนี้เองเหนื่อย/เครียด ("${tired.detail}") ถามว่าเป็นไงบ้าง ให้กำลังใจแบบไม่สำเร็จรูป` });
        const late = this.has('late', 14);
        if (late && h >= 7 && h < 13) list.push({ id: 'slept', ask: `เมื่อคืนเองยังไม่นอนตอน ${late.detail} ถามว่านอนกี่โมง ง่วงไหม แซวนิดๆ` });
        if (h >= 0 && h < 4) list.push({ id: 'bedtime', ask: 'ดึกมากแล้ว บอกให้ไปนอนแบบอ้อนๆ ห่วงสุขภาพ (ไม่บังคับ ไม่ดุ)' });
        const rain = window.MoWeather && window.MoWeather.isRaining();
        if (rain && (this.has('out', 8) || (h >= 7 && h < 19))) list.push({ id: 'rain', ask: 'ฝนตกอยู่ ถามว่าเปียกไหม พกร่มยัง ระวังไม่สบาย' });
        const w = window.MoWeather && window.MoWeather.data;
        if (w && w.temp >= 35 && h >= 11 && h < 17) list.push({ id: 'heat', ask: 'อากาศร้อนมาก บอกให้ดื่มน้ำเยอะๆ แบบห่วงๆ' });
        if (this.has('out', 6) && h >= 18) list.push({ id: 'home', ask: 'เองออกไปข้างนอก ถามว่าถึงบ้านยัง ให้บอกด้วยตอนถึง' });
        return list;
    }

    /**
     * ส่วนใน system prompt — ให้ AI รู้ว่าโมห่วงเรื่องไหนอยู่ (หยิบมาถามเองเมื่อเข้ากับที่คุย)
     */
    promptSection() {
        const list = this.concerns().filter(c => !this.askedToday(c.id));
        if (!list.length) return '';
        return `# เรื่องที่โมห่วงเองตอนนี้ (แฟนที่ใส่ใจจะถามเอง — หยิบมาถามแค่ 1 เรื่องเมื่อเข้าจังหวะ ไม่ต้องทุกข้อความ)\n${list.slice(0, 3).map(c => `- ${c.ask}`).join('\n')}\n\n`;
    }

    // ป้ายกันทักซ้ำกับหลังบ้าน (worker.js ใช้ชื่อเดียวกัน)
    dueKey(id) {
        return `care:${id}:${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)}`;
    }

    askedToday(id) {
        return this.data.asked[id] === this.today();
    }

    markAsked(id) {
        this.data.asked[id] = this.today();
        this.save();
    }

    /**
     * โมพูดถึงเรื่องที่ห่วงไปแล้วในคำตอบ → จดว่าถามแล้ววันนี้ (กันถามซ้ำจนจู้จี้)
     */
    noticeReply(text) {
        const words = { sick: /ป่วย|ยา|ดีขึ้น|ไม่สบาย/, lunch: /กินข้าว|กินอะไร|กินไร|ข้าวเที่ยง|มื้อเที่ยง/, dinner: /กินข้าว|กินอะไร|กินไร|ข้าวเย็น|มื้อเย็น/, hungry: /กินข้าว|กินอะไร|กินไร|หิว/, tired: /เหนื่อย|เครียด|วันนี้เป็นไง/, slept: /นอน|ง่วง/, bedtime: /นอน/, rain: /ฝน|ร่ม|เปียก/, heat: /น้ำ|ร้อน/, home: /ถึงบ้าน/ };
        let changed = false;
        for (const c of this.concerns()) {
            if (!this.askedToday(c.id) && words[c.id] && words[c.id].test(text)) {
                this.data.asked[c.id] = this.today();
                changed = true;
            }
        }
        if (changed) this.save();
    }

    /**
     * ทักก่อนเพราะห่วง: เรื่องที่ยังไม่ได้ถามวันนี้ → { reason, style } (แล้วจดว่าถามแล้ว)
     */
    takeProactive(alreadySent = () => false) {
        const c = this.concerns().find(x => !this.askedToday(x.id) && x.id !== 'bedtime' && !alreadySent(this.dueKey(x.id)));
        if (!c) return null;
        this.markAsked(c.id);
        return {
            key: this.dueKey(c.id),
            reason: `โมนึกขึ้นมาว่าห่วงเอง: ${c.ask}`,
            style: `ทักมาถามเรื่องนี้ตรงๆ แบบแฟนที่ห่วงจริง (${c.ask}) สั้นๆ 1-3 บรรทัด อาจเล่าว่าโมเองทำอะไรอยู่นิดนึง ไม่จู้จี้ ไม่สั่งสอน`,
        };
    }
}

// Export
window.MoCare = MoCare;
