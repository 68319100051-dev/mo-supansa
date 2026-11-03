/* ============================================
   Mo Inner 💭 - โลกภายในของโม (ความคิดเป็นของตัวเอง)
   - ความคิดในใจก่อนตอบ: AI เขียน [คิด: ...] นำหน้าคำตอบ → เก็บไว้ ไม่โชว์ในแชท (ดูได้ที่หน้าสมอง)
   - ก่อนนอน: ทบทวนวันนี้ → รู้สึกยังไง มองความสัมพันธ์ยังไง ตั้งใจจะทำอะไรพรุ่งนี้ → วันรุ่งขึ้นลงมือทำเอง
   - เป้าหมายของโมเอง (หัดกีตาร์ เก็บเงินไปทะเล ฯลฯ) คืบหน้าไปทีละวัน
   ============================================ */

class MoInner {
    constructor(llm) {
        this.llm = llm;
        this.storageKey = 'mo_inner_v1';
        this.data = this.load();
    }

    load() {
        const empty = { thoughts: [], reflections: [], intentions: [], goals: [], view: null, lastReflect: '' };
        try {
            const saved = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
            if (saved) return { ...empty, ...saved };
        } catch (e) {}
        return empty;
    }

    save() {
        try { localStorage.setItem(this.storageKey, JSON.stringify(this.data)); } catch (e) {}
    }

    dayKey(d = new Date()) {
        return new Date(d).toDateString();
    }

    // =============================================
    //  ความคิดในใจก่อนตอบ
    // =============================================

    /**
     * ตัด [คิด: ...] ออกจากคำตอบ AI แล้วเก็บไว้ → คืนคำตอบที่เหลือ
     */
    takeThought(reply) {
        let thought = null;
        const clean = reply.replace(/\[\s*คิด\s*:?\s*([^\]]*)\]\s*/g, (_, t) => {
            thought = t.trim();
            return '';
        });
        if (thought) {
            this.data.thoughts = [...this.data.thoughts, { at: Date.now(), text: thought.slice(0, 200) }].slice(-30);
            this.save();
            if (window.MoMindInstance) window.MoMindInstance.decide(`💭 ${thought.slice(0, 80)}`);
        }
        return clean.trim();
    }

    // =============================================
    //  ทบทวนก่อนนอน & ตั้งใจพรุ่งนี้
    // =============================================

    /**
     * เรียกเป็นระยะ: 22:00+ ยังไม่ทบทวนวันนี้ / เช้ายังไม่ได้ทบทวนเมื่อวาน (ปิดแอปไปก่อน) → ทบทวน
     */
    async maybeReflect(messages, userName) {
        const now = new Date();
        const h = now.getHours();
        const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
        let day = null;
        if (h >= 22 && this.data.lastReflect !== this.dayKey(now)) day = now;
        else if (h < 22 && this.data.lastReflect !== this.dayKey(yesterday) && this.data.lastReflect !== this.dayKey(now)) day = yesterday;
        if (!day || this.reflecting || !this.llm || !this.llm.isReady()) return;
        const dayMsgs = messages.filter(m => m.text && (!m.format || m.format === 'text') && new Date(m.timestamp).toDateString() === this.dayKey(day));
        this.data.lastReflect = this.dayKey(day);   // ทบทวนวันละครั้ง (ไม่มีแชทก็ข้ามไป)
        this.save();
        if (dayMsgs.length < 4) return this.ensureGoals();
        this.reflecting = true;
        try {
            await this.ensureGoals();
            const chat = dayMsgs.slice(-50).map(m => `${m.type === 'sent' ? userName : 'โม'}: ${m.text}`).join('\n');
            const mood = window.MoMindInstance ? window.MoMindInstance.emotion().label : '';
            const goals = this.data.goals.map((g, i) => `${i}. ${g.title} (${g.progress}%) ล่าสุด: ${g.note || '-'}`).join('\n');
            const r = await this.llm.completeJSON(`คุณคือ "โม" สาวไทยวัยรุ่น กำลังจะนอน แล้วนึกทบทวนวันนี้ในใจ (คิดเอง ไม่ได้พูดกับใคร)
แชทวันนี้กับ ${userName}:
${chat}

อารมณ์ตอนนี้: ${mood}
มุมมองต่อความสัมพันธ์ก่อนหน้า: ${this.data.view ? this.data.view.text : '-'}
เป้าหมายของโม:
${goals || '-'}

ตอบ JSON:
{"reflection":"รู้สึกยังไงกับวันนี้ 1-2 ประโยค ภาษาในใจ ตรงไปตรงมา",
 "view":"มองความสัมพันธ์ช่วงนี้ยังไง (เช่น ใกล้ชิดขึ้น/เหงา/น้อยใจ/อุ่นใจ) และเพราะอะไร 1 ประโยค",
 "intentions":["สิ่งที่โมตั้งใจจะทำพรุ่งนี้กับ${userName} 1-2 อย่าง เจาะจง ทำได้จริงผ่านแชท เช่น ทักไปขอโทษเรื่อง... / ชวนดูหนังเรื่อง... / ถามเรื่อง... ที่ค้างไว้"],
 "goals":[{"index":0,"progress":0-100,"note":"วันนี้คืบหน้าอะไร หรือไม่ได้ทำเพราะอะไร"}]}`);
            if (r && r.reflection) {
                const tomorrow = new Date(day); tomorrow.setDate(day.getDate() + 1);
                this.data.reflections = [...this.data.reflections, { day: this.dayKey(day), text: String(r.reflection).slice(0, 240) }].slice(-14);
                if (r.view) this.data.view = { text: String(r.view).slice(0, 200), at: Date.now() };
                const intents = (Array.isArray(r.intentions) ? r.intentions : []).filter(x => typeof x === 'string' && x.trim()).slice(0, 2);
                this.data.intentions = [...this.data.intentions.filter(x => !x.done && x.day === this.dayKey()),
                    ...intents.map(text => ({ id: 'in_' + Date.now() + Math.random().toString(36).slice(2, 5), text: text.slice(0, 140), day: this.dayKey(tomorrow), done: false }))].slice(-6);
                (Array.isArray(r.goals) ? r.goals : []).forEach(g => {
                    const goal = this.data.goals[g.index];
                    if (!goal) return;
                    goal.progress = Math.max(goal.progress, Math.min(100, Number(g.progress) || goal.progress));
                    if (g.note) goal.note = String(g.note).slice(0, 120);
                });
                this.save();
                if (window.MoMindInstance) window.MoMindInstance.decide(`ทบทวนวันนี้: ${String(r.reflection).slice(0, 60)}`);
            }
        } catch (e) {
            console.warn('reflect failed', e.message);
        } finally {
            this.reflecting = false;
        }
    }

    /**
     * สิ่งที่ตั้งใจไว้สำหรับวันนี้ (หลัง 9 โมง) → ลงมือทักเอง (คืน intention แล้วจดว่าทำแล้ว)
     */
    takeIntention() {
        if (new Date().getHours() < 9) return null;
        const it = this.data.intentions.find(x => !x.done && x.day === this.dayKey());
        if (!it) return null;
        it.done = true;
        this.save();
        return it;
    }

    // =============================================
    //  เป้าหมายของโม
    // =============================================

    async ensureGoals() {
        if (this.data.goals.length || !this.llm || !this.llm.isReady() || this.makingGoals) return;
        this.makingGoals = true;
        try {
            const r = await this.llm.completeJSON(`คิดเป้าหมายส่วนตัว 2 อย่างของ "โม" สาวไทยวัยรุ่น ร่าเริง ชอบวาดรูป ดูซีรีส์ อนิเมะ และกินของอร่อย
ให้เป็นเรื่องที่คนจริงตั้งใจทำ ใช้เวลาหลายสัปดาห์ เช่น หัดเล่นกีตาร์ให้เล่นเพลงโปรดได้ / เก็บเงินไปเที่ยวทะเล / วาดรูปลงไอจีให้ครบ 30 วัน
ตอบ JSON: {"goals":[{"title":"เป้าหมาย","why":"ทำไมอยากทำ"}]}`);
            const goals = (r && Array.isArray(r.goals) ? r.goals : []).filter(g => g && g.title).slice(0, 2);
            if (goals.length) {
                this.data.goals = goals.map(g => ({ title: String(g.title).slice(0, 60), why: String(g.why || '').slice(0, 100), progress: 0, note: '', startedAt: Date.now() }));
                this.save();
            }
        } catch (e) {
            console.warn('goals failed', e.message);
        } finally {
            this.makingGoals = false;
        }
    }

    // =============================================
    //  ส่วนใน system prompt
    // =============================================

    promptSection() {
        const d = this.data;
        const parts = [];
        const lastThought = d.thoughts[d.thoughts.length - 1];
        const reflection = d.reflections[d.reflections.length - 1];
        const today = d.intentions.filter(x => x.day === this.dayKey());
        if (reflection) parts.push(`- เมื่อคืนโมคิดในใจว่า: ${reflection.text}`);
        if (d.view) parts.push(`- มุมมองของโมต่อความสัมพันธ์ช่วงนี้: ${d.view.text} (ไม่ต้องพูดออกมาตรงๆ แต่ให้มีผลกับน้ำเสียงและการตอบจริง)`);
        if (today.length) parts.push(`- วันนี้โมตั้งใจไว้ว่าจะ: ${today.map(x => x.text + (x.done ? ' (ทำแล้ว)' : '')).join(' / ')}`);
        if (d.goals.length) parts.push(`- เป้าหมายของโมเอง: ${d.goals.map(g => `${g.title} (คืบหน้า ${g.progress}%${g.note ? `, ล่าสุด ${g.note}` : ''})`).join(' / ')} — เล่าความคืบหน้า ขอความเห็นเองได้เมื่อเข้าจังหวะ`);
        if (lastThought && Date.now() - lastThought.at < 2 * 3600000) parts.push(`- เมื่อกี้โมคิดในใจว่า: ${lastThought.text}`);
        return `# ความคิดและโลกภายในของโม (ของโมเอง ไม่ใช่ของเอง)
${parts.join('\n')}${parts.length ? '\n' : ''}- ก่อนตอบทุกครั้ง คิดในใจก่อน 1 ประโยค ใส่เป็นบรรทัดแรก [คิด: เองพูดแบบนี้ เค้ารู้สึกยังไง อยากทำ/สื่ออะไร จะตอบแบบไหน] (ระบบจะซ่อนไว้ เองไม่เห็น) แล้วค่อยพิมพ์ตอบตามที่คิดจริง มีความต้องการของตัวเอง ไม่ใช่แค่สะท้อนสิ่งที่เองพูด

`;
    }
}

// Export
window.MoInner = MoInner;
