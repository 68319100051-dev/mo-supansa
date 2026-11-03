/* ============================================
   Mo Mind 🧠 - สมองของโม
   จำลองการทำงานแบบสมอง: ทุกอย่างที่โมรับรู้ → ส่วนต่างๆ ของสมองทำงาน → สารเคมีเปลี่ยน → อารมณ์ → การตัดสินใจ

   สารเคมี (0-100, ค่อยๆ กลับสู่ค่าพื้นฐานตามเวลา):
   - dopamine    โดพามีน   รางวัล ความตื่นเต้น (ได้เงิน โดนชม เรื่องสนุก)
   - oxytocin    ออกซิโทซิน ความผูกพัน (คำว่ารัก คิดถึง คุยกันนานๆ)
   - cortisol    คอร์ติซอล  ความเครียด (ถูกเมิน เห็นอีกฝ่ายเศร้า หิว)
   - melatonin   เมลาโทนิน  ความง่วง (เวลา + พลังงานร่างกาย)
   - serotonin   เซโรโทนิน  ความมั่นคงทางอารมณ์ (อิ่ม พักผ่อนพอ ได้คุยดีๆ)

   ส่วนของสมอง (activation 0-1 ใช้แสดงผล + บันทึกความคิด):
   - frontal     สมองส่วนหน้า   ตัดสินใจ บุคลิก การควบคุมตัวเอง
   - temporal    สมองกลีบขมับ   ภาษา เข้าใจ/สร้างประโยค
   - limbic      ระบบลิมบิก    อารมณ์ (อะมิกดะลา) + ความจำ (ฮิปโปแคมปัส)
   - parietal    สมองกลีบข้าง   ประสาทสัมผัส รับรู้ร่างกาย
   - occipital   สมองกลีบท้ายทอย การมองเห็น (รูป คลิป)
   - cerebellum  สมองน้อย      ทักษะการเคลื่อนไหว (พิมพ์ อัดเสียง)
   - brainstem   ก้านสมอง      ระบบพื้นฐาน (หลับ/ตื่น หิว หัวใจ)
   ============================================ */

const MO_CHEMICALS = {
    dopamine: { name: 'โดพามีน', desc: 'รางวัล/ตื่นเต้น', base: 50, halfLifeMin: 40 },
    oxytocin: { name: 'ออกซิโทซิน', desc: 'ความผูกพัน', base: 55, halfLifeMin: 120 },
    cortisol: { name: 'คอร์ติซอล', desc: 'ความเครียด', base: 25, halfLifeMin: 60 },
    melatonin: { name: 'เมลาโทนิน', desc: 'ความง่วง', base: 20, halfLifeMin: 30 },
    serotonin: { name: 'เซโรโทนิน', desc: 'ความมั่นคง', base: 60, halfLifeMin: 180 },
};

const MO_REGIONS = {
    frontal: { name: 'สมองส่วนหน้า', role: 'ตัดสินใจ' },
    temporal: { name: 'กลีบขมับ', role: 'ภาษา' },
    limbic: { name: 'ระบบลิมบิก', role: 'อารมณ์ & ความจำ' },
    parietal: { name: 'กลีบข้าง', role: 'ประสาทสัมผัส' },
    occipital: { name: 'กลีบท้ายทอย', role: 'การมองเห็น' },
    cerebellum: { name: 'สมองน้อย', role: 'ทักษะ' },
    brainstem: { name: 'ก้านสมอง', role: 'ระบบพื้นฐาน' },
};

// คำที่กระตุ้นอารมณ์ (อะมิกดะลาประเมินข้อความแบบเร็วๆ ก่อนภาษาจะเข้าใจเต็มที่)
const MO_STIMULI = [
    { re: /รัก|คิดถึง|กอด|หอม|อยากเจอ|ของเค้า|ที่รัก|💕|❤️|🥰/, effect: { oxytocin: 14, dopamine: 6, serotonin: 4 }, feel: 'ความผูกพัน', emotion: 'love' },
    { re: /น่ารัก|เก่ง|สวย|ใจดี|ขอบคุณ|ดีใจที่มี/, effect: { dopamine: 12, oxytocin: 6, serotonin: 4 }, feel: 'ถูกชม', emotion: 'joy' },
    { re: /555|ฮา|ขำ|ตลก|😂|🤣/, effect: { dopamine: 8, serotonin: 3 }, feel: 'ขำ', emotion: 'joy' },
    { re: /เหนื่อย|เศร้า|ท้อ|ร้องไห้|ไม่ไหว|เครียด|เหงา|เสียใจ|ฝันร้าย/, effect: { cortisol: 10, oxytocin: 6 }, feel: 'เป็นห่วง', emotion: 'worry' },
    { re: /เบื่อเธอ|รำคาญ|เงียบไป|ไม่ต้อง|ช่างมัน|ไปไกลๆ|น่าเบื่อ/, effect: { cortisol: 14, serotonin: -8, dopamine: -6 }, feel: 'น้อยใจ', emotion: 'hurt' },
    { re: /สำเร็จ|ผ่าน|ได้แล้ว|เสร็จแล้ว|โบนัส|เลื่อนขั้น|ชนะ/, effect: { dopamine: 14, serotonin: 4 }, feel: 'ดีใจด้วย', emotion: 'joy' },
    { re: /กิน|หิว|ส้มตำ|หมูกระทะ|ชาบู|ข้าว/, effect: { dopamine: 4 }, feel: 'นึกถึงของกิน', emotion: null },
    { re: /ง่วง|นอน|ฝันดี/, effect: { melatonin: 6 }, feel: 'ง่วงตาม', emotion: null },
];

class MoMind {
    constructor() {
        this.storageKey = 'mo_mind_v1';
        this.state = this.load();
        this.activation = Object.fromEntries(Object.keys(MO_REGIONS).map(k => [k, 0.15]));
        this.listeners = [];
        this.decay();
    }

    load() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return {
            chem: Object.fromEntries(Object.entries(MO_CHEMICALS).map(([k, c]) => [k, c.base])),
            lastDecay: Date.now(),
            history: [],   // { t, dopamine, oxytocin, cortisol, melatonin, serotonin, mood }
            thoughts: [],  // { t, region, text }
            seen: 0,       // จำนวนข้อความที่รับรู้
        };
    }

    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.state));
        } catch (e) {}
    }

    onChange(fn) {
        this.listeners.push(fn);
    }

    emit(region) {
        this.listeners.forEach(fn => fn(region));
    }

    // =============================================
    //  เคมีในสมอง
    // =============================================

    clamp(v) {
        return Math.max(0, Math.min(100, v));
    }

    change(effect) {
        for (const [k, v] of Object.entries(effect)) {
            if (k in this.state.chem) this.state.chem[k] = this.clamp(this.state.chem[k] + v);
        }
    }

    /**
     * สารเคมีค่อยๆ กลับสู่ค่าพื้นฐาน (half-life) + เมลาโทนินตามนาฬิการ่างกาย
     */
    decay() {
        const now = Date.now();
        const mins = Math.min(24 * 60, (now - this.state.lastDecay) / 60000);
        if (mins < 0.5) return;
        for (const [k, c] of Object.entries(MO_CHEMICALS)) {
            const v = this.state.chem[k];
            this.state.chem[k] = c.base + (v - c.base) * Math.pow(0.5, mins / c.halfLifeMin);
        }
        // นาฬิการ่างกาย: เมลาโทนินขึ้นตอนดึก ลดตอนเช้า + ร่างกายเหนื่อยก็ง่วง
        const h = new Date().getHours() + new Date().getMinutes() / 60;
        const circadian = h >= 22 || h < 6 ? 75 : h >= 20 ? 45 : h < 8 ? 40 : 15;
        const life = window.MoLifeInstance && window.MoLifeInstance.state;
        const tired = life ? (100 - life.energy) * 0.4 : 0;
        const target = this.clamp(circadian + tired);
        this.state.chem.melatonin += (target - this.state.chem.melatonin) * Math.min(1, mins / 30);
        // หิวมาก → เครียด, อิ่ม+พักพอ → มั่นคง
        if (life) {
            if (life.hunger > 70) this.state.chem.cortisol = this.clamp(this.state.chem.cortisol + mins * 0.15);
            if (life.hunger < 40 && life.energy > 50) this.state.chem.serotonin = this.clamp(this.state.chem.serotonin + mins * 0.05);
        }
        this.state.lastDecay = now;
        this.sampleHistory();
        this.save();
    }

    /** เก็บค่าทุก 15 นาทีไว้ทำกราฟ 24 ชม. */
    sampleHistory() {
        const h = this.state.history;
        const last = h[h.length - 1];
        if (last && Date.now() - last.t < 15 * 60000) return;
        h.push({ t: Date.now(), ...Object.fromEntries(Object.entries(this.state.chem).map(([k, v]) => [k, Math.round(v)])), mood: this.moodScore() });
        this.state.history = h.filter(x => Date.now() - x.t < 24 * 3600000);
    }

    // =============================================
    //  อารมณ์ & การตัดสินใจ (ได้จากเคมี)
    // =============================================

    /** คะแนนอารมณ์รวม 0-100 */
    moodScore() {
        const c = this.state.chem;
        return Math.round(this.clamp(50 + (c.dopamine - 50) * 0.35 + (c.serotonin - 60) * 0.4 + (c.oxytocin - 55) * 0.25 - (c.cortisol - 25) * 0.5));
    }

    /** อารมณ์เด่นตอนนี้ */
    emotion() {
        const c = this.state.chem;
        if (c.melatonin > 70) return { key: 'sleepy', label: 'ง่วงมาก', emoji: '😪' };
        if (c.cortisol > 60 && c.oxytocin > 60) return { key: 'sulky', label: 'งอน/น้อยใจ', emoji: '😤' };
        if (c.cortisol > 60) return { key: 'stressed', label: 'เครียด/กังวล', emoji: '😟' };
        if (c.oxytocin > 75) return { key: 'loving', label: 'อยากอ้อน คิดถึง', emoji: '🥰' };
        if (c.dopamine > 70) return { key: 'excited', label: 'ตื่นเต้น ดีใจ', emoji: '🤩' };
        if (c.serotonin < 40) return { key: 'down', label: 'ซึมๆ', emoji: '😔' };
        if (this.moodScore() > 60) return { key: 'happy', label: 'อารมณ์ดี', emoji: '😊' };
        return { key: 'calm', label: 'ชิลๆ', emoji: '😌' };
    }

    /**
     * ตัวปรับพฤติกรรมที่ได้จากเคมี (ใช้ในการตัดสินใจจริง)
     */
    behavior() {
        const c = this.state.chem;
        return {
            // คิดถึงมาก → ทักเร็วขึ้น, ง่วง/เครียด → ทักช้าลง
            proactiveGapFactor: Math.max(0.4, Math.min(1.8, 1 - (c.oxytocin - 55) / 80 + (c.melatonin - 20) / 120 + (c.cortisol - 25) / 150)),
            // ง่วง → ตอบสั้น
            short: c.melatonin > 60,
            // งอนเมื่อเครียดและผูกพันสูง (น้อยใจคนที่รัก)
            sulkThresholdHours: c.cortisol > 50 ? 0.75 : c.oxytocin > 70 ? 1 : 1.5,
            // อยากอ้อน → ส่งเสียงบ่อยขึ้น
            voiceBoost: c.oxytocin > 70 || c.dopamine > 75,
        };
    }

    // =============================================
    //  การรับรู้ (input → สมองแต่ละส่วน)
    // =============================================

    fire(region, amount = 0.6) {
        this.activation[region] = Math.min(1, (this.activation[region] || 0) + amount);
        this.emit(region);
    }

    think(region, text) {
        this.state.thoughts.push({ t: Date.now(), region, text });
        if (this.state.thoughts.length > 40) this.state.thoughts = this.state.thoughts.slice(-40);
        this.fire(region, 0.5);
        this.save();
    }

    /**
     * รับรู้ข้อความจากเอง: กลีบข้าง (เห็นแจ้งเตือน) → กลีบขมับ (อ่าน) → ลิมบิก (รู้สึก)
     */
    perceive(text) {
        this.decay();
        this.state.seen++;
        this.fire('parietal', 0.4);
        this.fire('temporal', 0.7);
        const hits = MO_STIMULI.filter(s => s.re.test(text));
        if (hits.length) {
            hits.forEach(s => this.change(s.effect));
            this.think('limbic', `รู้สึก${hits.map(s => s.feel).join(' + ')} จาก "${text.slice(0, 30)}"`);
        } else {
            this.change({ oxytocin: 2, dopamine: 2 }); // แค่ได้คุยกันก็ดีขึ้นนิดนึง
            this.think('temporal', `อ่านข้อความ "${text.slice(0, 30)}"`);
        }
        this.save();
    }

    /** ได้รับเงิน → รางวัล */
    reward(amount) {
        this.decay();
        this.change({ dopamine: Math.min(30, 8 + amount / 10), oxytocin: 6 });
        this.think('limbic', `ได้รับเงิน ฿${amount} โดพามีนพุ่ง`);
    }

    /** ถูกเมิน (ทักไปแล้วไม่ตอบ) */
    ignored(hours) {
        this.decay();
        this.change({ cortisol: Math.min(25, hours * 8), serotonin: -4 });
        this.think('limbic', `ทักไป ${hours.toFixed(1)} ชม. ยังไม่ตอบ เริ่มน้อยใจ`);
    }

    /** เห็นรูป/คลิป */
    see(what) {
        this.fire('occipital', 0.9);
        this.change({ dopamine: 5 });
        this.think('occipital', `ดู${what}`);
    }

    /** ร่างกายเปลี่ยนกิจกรรม (จาก MoLife) */
    bodyChanged(activity) {
        if (!activity) return;
        this.fire('brainstem', 0.5);
        if (activity.id === 'sleep') this.change({ melatonin: 30, cortisol: -10 });
        if (activity.id === 'wake') this.change({ melatonin: -30, serotonin: 5 });
        if (activity.effects && activity.effects.hunger < 0) this.change({ serotonin: 4, dopamine: 4 });
        this.think('brainstem', `ร่างกาย: ${activity.label}`);
    }

    /** การตัดสินใจของสมองส่วนหน้า (บันทึกเหตุผลไว้ดูในหน้าสมอง) */
    decide(text) {
        this.think('frontal', text);
    }

    /** ลงมือ: พิมพ์/อัดเสียง (สมองน้อย) */
    act(text) {
        this.fire('cerebellum', 0.7);
        this.fire('temporal', 0.5);
        this.think('cerebellum', text);
    }

    /**
     * ส่งให้ AI: สภาวะสมองตอนนี้ (ให้มีผลกับน้ำเสียง)
     */
    promptSection() {
        this.decay();
        const c = this.state.chem;
        const e = this.emotion();
        const b = this.behavior();
        const lines = Object.entries(MO_CHEMICALS).map(([k, m]) => `${m.name}(${m.desc}) ${Math.round(c[k])}`).join(', ');
        const tone = {
            sleepy: 'ง่วงมาก ตอบสั้นๆ งัวเงีย พิมพ์ช้า',
            sulky: 'งอน/น้อยใจนิดๆ ตอบสั้นลง ประชดเบาๆ แต่ยังรัก ถ้าอีกฝ่ายง้อก็หายงอน',
            stressed: 'กังวล เป็นห่วง ไม่ค่อยเล่นมุก',
            loving: 'อยากอ้อน คิดถึงมาก หวานกว่าปกติ',
            excited: 'ตื่นเต้น พลังเยอะ ลากเสียง ใช้ 555 ได้',
            down: 'ซึมๆ เงียบกว่าปกติ แต่ยังใส่ใจ',
            happy: 'อารมณ์ดี ขี้เล่น',
            calm: 'ชิลๆ สบายๆ',
        }[e.key];
        return `# สภาวะสมองของโมตอนนี้ (ใช้กำหนดน้ำเสียง ห้ามพูดถึงตัวเลขหรือชื่อสาร)
สารเคมี: ${lines}
อารมณ์เด่น: ${e.label} → ${tone}${b.short ? '\n- ง่วงอยู่: ตอบ 1-2 บรรทัดพอ' : ''}${b.voiceBoost ? '\n- อยากอ้อน: ส่งข้อความเสียงได้บ่อยขึ้น' : ''}
`;
    }

    /**
     * activation ค่อยๆ ดับลง (ใช้กับแอนิเมชันในหน้าสมอง) + ค่าพื้นฐานจากเคมี
     */
    tickActivation(dtSec) {
        const c = this.state.chem;
        const baseline = {
            frontal: 0.15 + (100 - c.melatonin) / 600,
            temporal: 0.12,
            limbic: 0.12 + (Math.abs(c.dopamine - 50) + c.cortisol + c.oxytocin - 55) / 500,
            parietal: 0.1,
            occipital: 0.08,
            cerebellum: 0.08,
            brainstem: 0.15 + c.melatonin / 500,
        };
        for (const k of Object.keys(this.activation)) {
            const b = Math.max(0.05, Math.min(0.5, baseline[k]));
            this.activation[k] = b + (this.activation[k] - b) * Math.pow(0.5, dtSec / 2.5);
        }
    }
}

// Export
window.MoMind = MoMind;
window.MO_CHEMICALS = MO_CHEMICALS;
window.MO_REGIONS = MO_REGIONS;
