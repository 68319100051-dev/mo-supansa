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
        const empty = { opinions: [], jokes: [], photos: [], weeks: [], badDay: null, lastWeekly: 0 };
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

    promptSection() {
        const d = this.data;
        const parts = [];
        if (d.opinions.length) parts.push(`# ตัวตนของโม (สิ่งที่โมเคยบอกไปแล้ว ต้องตอบให้ตรงกันเสมอ ห้ามขัด)\n${d.opinions.map(o => `- ${o}`).join('\n')}`);
        if (d.jokes.length) parts.push(`# มุก & ชื่อเรียกของเราสองคน (หยิบมาเล่นนานๆ ครั้งเมื่อเข้าจังหวะ)\n${d.jokes.map(j => `- ${j}`).join('\n')}`);
        if (d.photos.length) parts.push(`# รูปที่เองเคยส่งให้ดู (พูดถึงได้ถ้าเกี่ยว)\n${d.photos.slice(-6).map(p => `- ${new Date(p.at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}: ${p.desc}`).join('\n')}`);
        if (d.weeks.length) parts.push(`# ช่วงนี้ของเอง (สรุปรายสัปดาห์)\n${d.weeks.slice(-2).map(w => `- สัปดาห์ถึง ${w.label}: ${w.text}`).join('\n')}`);
        const bad = this.badDayToday();
        if (bad) parts.push(`# วันนี้โมไม่ค่อยโอเค\n- วันนี้โม${bad} — อารมณ์ซึมลงนิด เล่าให้เองฟังได้เมื่อเข้าจังหวะ (หรือถ้าเองถามว่าเป็นไร) อ้อนขอกำลังใจได้ แต่ไม่ดราม่า ไม่พูดเรื่องนี้ทุกข้อความ และถ้าเองกำลังแย่กว่า ให้ดูแลเองก่อน`);
        return parts.length ? parts.join('\n\n') + '\n\n' : '';
    }
}

// Export
window.MoSelf = MoSelf;
