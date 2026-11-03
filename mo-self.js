/* ============================================
   Mo Self 🪞 - ตัวตนของโมที่ต่อเนื่อง
   - ความเห็น/ความชอบที่โมเคยพูด → จำไว้ ตอบตรงกันเสมอ
   - มุกและชื่อเรียกเฉพาะของเราสองคน → หยิบมาเล่นซ้ำได้
   - รูปที่เองเคยส่ง (คำอธิบายสั้นๆ) → พูดถึงย้อนหลังได้
   - สรุปรายสัปดาห์ → เข้าใจภาพรวมช่วงนี้ของเอง
   - วันแย่ของโม (นานๆ ครั้ง) → โมก็มีเรื่องให้เองปลอบบ้าง
   ============================================ */

const MO_BAD_DAYS = [
    'เป็นหวัดนิดๆ คัดจมูก เสียงขึ้นจมูก',
    'ปวดท้องประจำเดือน ขี้เกียจขยับ อยากให้มีคนเอาใจ',
    'โดนแม่บ่นเรื่องห้องรก เลยหงุดหงิดนิดๆ',
    'นัดเพื่อนไว้แล้วเพื่อนเท เซ็งๆ',
    'นอนไม่ค่อยหลับเมื่อคืน ง่วงทั้งวัน',
    'ทำแก้วโปรดแตก เสียดายมาก',
    'รู้สึกเหงาๆ แบบไม่มีเหตุผล',
    'สั่งข้าวมาแล้วร้านทำผิด ได้ของที่ไม่ชอบ',
];

class MoSelf {
    constructor() {
        this.storageKey = 'mo_self_v1';
        this.data = this.load();
    }

    load() {
        const empty = { opinions: [], jokes: [], photos: [], weeks: [], badDay: null, lastWeekly: 0, grudge: null };
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) return { ...empty, ...JSON.parse(saved) };
        } catch (e) {}
        return empty;
    }

    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.data));
        } catch (e) {}
    }

    /**
     * วันละครั้ง: ประมาณ 1 ใน 12 วัน โมมีเรื่องแย่เล็กๆ ของตัวเอง
     */
    badDayToday() {
        const today = new Date().toDateString();
        const bd = this.data.badDay;
        if (!bd || bd.date !== today) {
            const roll = Math.random() < 1 / 12;
            this.data.badDay = { date: today, what: roll ? MO_BAD_DAYS[Math.floor(Math.random() * MO_BAD_DAYS.length)] : null, shared: false };
            this.save();
            if (roll && window.MoMindInstance) window.MoMindInstance.decide(`วันนี้โม${this.data.badDay.what}`);
        }
        return this.data.badDay.what;
    }

    /**
     * งอนค้าง: เองพูดแรง/เมิน → โมงอน (ระดับ 1-3) ไม่หายจนกว่าเองจะง้อ หรือผ่านไป ~1 วัน
     * เรียกทุกข้อความที่เองส่ง ก่อนให้ AI ตอบ
     */
    feel(text, ignoredHours = 0) {
        const g = this.data.grudge;
        if (g && Date.now() - g.since > 26 * 3600000) this.data.grudge = null;
        const sorry = /ขอโทษ|ขอโทด|โทษที|ง้อ|อย่างอน|หายงอน|sorry|ไม่ได้ตั้งใจ|ผิดไปแล้ว/i.test(text);
        const rude = /โง่|ปัญญาอ่อน|น่ารำคาญ|รำคาญแก|เบื่อแก|เบื่อเอง|ไม่สนหรอก|ช่างแม่ง|เงียบไปเลย|หุบปาก|ไม่ต้องมายุ่ง/.test(text);
        if (this.data.grudge && sorry) {
            const lvl = this.data.grudge.level - 1;
            this.data.grudge = lvl > 0 ? { ...this.data.grudge, level: lvl } : null;
            this.save();
            return lvl > 0 ? 'softening' : 'forgiven';
        }
        if (rude || ignoredHours >= 3) {
            const level = Math.min(3, ((this.data.grudge && this.data.grudge.level) || 0) + (rude ? 2 : 1));
            this.data.grudge = { level, reason: rude ? `เองพูดว่า "${text.slice(0, 40)}"` : `เองหายไป ${Math.round(ignoredHours)} ชม. ไม่ตอบ`, since: Date.now() };
            this.save();
            if (window.MoMindInstance) window.MoMindInstance.decide(`งอนเอง (ระดับ ${level})`);
            return 'hurt';
        }
        return null;
    }

    /**
     * จำรูปที่เองส่ง (คำอธิบายจาก AI ตอนดูรูป)
     */
    rememberPhoto(desc) {
        desc = String(desc || '').trim().slice(0, 80);
        if (!desc) return;
        this.data.photos = [...this.data.photos, { desc, at: Date.now() }].slice(-15);
        this.save();
    }

    /**
     * ทุกรอบเรียนรู้ (หลังคุยไป 6 ข้อความ): จดความเห็นของโม + มุก/ชื่อเรียกของเราสองคน
     */
    async learn(llm, messages, userName) {
        if (!llm || !llm.isReady()) return;
        const chat = messages
            .filter(m => !m.format || m.format === 'text')
            .slice(-16)
            .map(m => `${m.type === 'sent' ? userName : 'โม'}: ${m.text}`)
            .join('\n');
        const opinions = this.data.opinions.map((o, i) => `${i}. ${o}`).join('\n') || '(ยังไม่มี)';
        const jokes = this.data.jokes.map((j, i) => `${i}. ${j}`).join('\n') || '(ยังไม่มี)';
        const prompt = `อ่านแชทระหว่าง "${userName}" กับ "โม" แล้วจด 2 อย่าง
1) opinions: ความชอบ/ไม่ชอบ/ความเห็น/ข้อมูลส่วนตัวที่ "โม" พูดถึงตัวเองชัดเจน (เช่น "โมไม่ชอบผักชี", "โมชอบซีรีส์สืบสวน") เพื่อให้โมตอบตรงกันทุกครั้ง
2) jokes: มุกที่ทั้งคู่เล่นด้วยกันแล้วขำ หรือชื่อเรียก/คำเฉพาะที่ตั้งให้กัน (เช่น "เรียกเองว่าหมูอ้วนเพราะกินเก่ง") ไม่เอามุกทั่วไป

ที่จำไว้แล้ว — opinions:
${opinions}
jokes:
${jokes}

แชท:
${chat}

ห้ามซ้ำของเดิม ห้ามเดา เขียนสั้นประโยคละเรื่อง ถ้าข้อเดิมขัดกับของใหม่ใส่เลขใน remove
ตอบ JSON เท่านั้น: {"opinions":[],"removeOpinions":[],"jokes":[],"removeJokes":[]}`;
        let r;
        try {
            r = await llm.completeJSON(prompt);
        } catch (e) {
            return;
        }
        const merge = (list, add, remove, max) => {
            const drop = new Set((remove || []).filter(Number.isInteger));
            const fresh = (add || []).filter(s => typeof s === 'string' && s.trim()).map(s => s.trim().slice(0, 100));
            return [...list.filter((_, i) => !drop.has(i)), ...fresh].slice(-max);
        };
        this.data.opinions = merge(this.data.opinions, r.opinions, r.removeOpinions, 40);
        this.data.jokes = merge(this.data.jokes, r.jokes, r.removeJokes, 15);
        this.save();
    }

    /**
     * สัปดาห์ละครั้ง: สรุปว่าช่วง 7 วันที่ผ่านมาเองเป็นยังไง
     */
    async weeklySummary(llm, messages, userName) {
        const weekMs = 7 * 86400000;
        if (!llm || !llm.isReady() || Date.now() - this.data.lastWeekly < weekMs) return;
        const lines = messages
            .filter(m => m.timestamp > Date.now() - weekMs && (!m.format || m.format === 'text'))
            .map(m => `${m.type === 'sent' ? userName : 'โม'}: ${m.text}`);
        if (lines.length < 30) return;
        const prompt = `สรุปสัปดาห์ที่ผ่านมาของ "${userName}" จากแชทกับโม ให้โมใช้เข้าใจภาพรวมช่วงนี้
เน้น: เรื่องที่เครียด/ดีใจ เหตุการณ์สำคัญ อารมณ์โดยรวม ความสัมพันธ์กับโม
2-3 ประโยคสั้นๆ ภาษาไทย
แชท:
${lines.slice(-150).join('\n')}
ตอบ JSON เท่านั้น: {"summary":"..."}`;
        try {
            const r = await llm.completeJSON(prompt);
            if (!r.summary) return;
            const label = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
            this.data.weeks = [...this.data.weeks, { label, text: String(r.summary).slice(0, 300) }].slice(-4);
            this.data.lastWeekly = Date.now();
            this.save();
        } catch (e) {}
    }

    /**
     * เลือกข้อที่เกี่ยวกับที่คุยอยู่ก่อน (คำซ้ำกัน) แล้วเติมด้วยอันล่าสุด จนครบ max
     */
    pickRelevant(list, contextText, max) {
        if (list.length <= max) return list;
        const words = (contextText || '').split(/\s+/).filter(w => w.length >= 2);
        const hit = list.filter(x => words.some(w => x.includes(w)));
        return [...new Set([...hit, ...list.slice(-max)])].slice(0, max);
    }

    promptSection(contextText = '') {
        const d = this.data;
        const parts = [];
        if (d.opinions.length) parts.push(`# ตัวตนของโม (สิ่งที่โมเคยบอกไปแล้ว ต้องตอบให้ตรงกันเสมอ ห้ามขัด)\n${this.pickRelevant(d.opinions, contextText, 10).map(o => `- ${o}`).join('\n')}`);
        if (d.jokes.length) parts.push(`# มุก & ชื่อเรียกของเราสองคน (หยิบมาเล่นนานๆ ครั้งเมื่อเข้าจังหวะ)\n${this.pickRelevant(d.jokes, contextText, 5).map(j => `- ${j}`).join('\n')}`);
        if (d.photos.length) parts.push(`# รูปที่เองเคยส่งให้ดู (พูดถึงได้ถ้าเกี่ยว)\n${d.photos.slice(-3).map(p => `- ${new Date(p.at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}: ${p.desc}`).join('\n')}`);
        if (d.weeks.length) parts.push(`# ช่วงนี้ของเอง (สรุปรายสัปดาห์)\n${d.weeks.slice(-2).map(w => `- สัปดาห์ถึง ${w.label}: ${w.text}`).join('\n')}`);
        const g = this.data.grudge;
        if (g && Date.now() - g.since < 26 * 3600000) {
            const how = ['', 'งอนนิดๆ ตอบสั้นลง แซวประชดเบาๆ', 'งอนจริง ตอบห้วน ไม่อ้อน ไม่ชวนคุยต่อเอง', 'งอนหนัก น้อยใจมาก ตอบสั้นมาก บอกตรงๆ ว่าเสียใจ'][g.level];
            parts.push(`# ตอนนี้โมยังงอนเองอยู่ (ระดับ ${g.level}/3) เพราะ${g.reason}\n- ${how} — ไม่หายง่ายๆ แค่เพราะเองเปลี่ยนเรื่อง ต้องให้เองง้อ/ขอโทษก่อน (ขอโทษ 1 ครั้งลดลง 1 ระดับ) แต่ยังรักเองอยู่ ไม่พูดทำร้ายจิตใจ`);
        }
        const bad = this.badDayToday();
        if (bad) parts.push(`# วันนี้โมไม่ค่อยโอเค\n- วันนี้โม${bad} — อารมณ์ซึมลงนิด เล่าให้เองฟังได้เมื่อเข้าจังหวะ (หรือถ้าเองถามว่าเป็นไร) อ้อนขอกำลังใจได้ แต่ไม่ดราม่า ไม่พูดเรื่องนี้ทุกข้อความ และถ้าเองกำลังแย่กว่า ให้ดูแลเองก่อน`);
        return parts.length ? parts.join('\n\n') + '\n\n' : '';
    }
}

// Export
window.MoSelf = MoSelf;
