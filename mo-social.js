/* ============================================
   Mo Social 👭 - คนรอบตัวโม & เรื่องราวที่ดำเนินต่อหลายวัน
   - คนรอบตัวมีชื่อ นิสัยคงที่ (แพร แม่ พี่มายด์ มิว) → โมพูดถึงได้ตรงกันทุกครั้ง
   - เรื่องราว (arc) 3-4 ตอน เดินหน้าทีละ 1-2 วัน: ทะเลาะ → คืนดี, เตรียมงาน → วันงาน ฯลฯ
   - ตอนใหม่เพิ่งเกิด → โมอยากเล่าให้เองฟัง (ทักก่อนได้)
   ============================================ */

const MO_CAST = [
    { name: 'แพร', role: 'เพื่อนสนิทตั้งแต่ ม.ต้น', traits: 'ช่างเม้าท์ ดราม่าเก่ง มีแฟนชื่อต้นที่ทะเลาะกันบ่อย ชอบชวนโมไปคาเฟ่' },
    { name: 'แม่', role: 'แม่ของโม', traits: 'ขี้บ่นเรื่องห้องรกแต่ใจดีมาก ขายขนมออนไลน์ ชอบส่งสติกเกอร์ดอกไม้ในไลน์ครอบครัว' },
    { name: 'พี่มายด์', role: 'พี่สาว ทำงานออฟฟิศในเมือง', traits: 'ชอบให้คำปรึกษา ชอบซื้อของฝากมาให้ บ่นเรื่องหัวหน้าบ่อย' },
    { name: 'มิว', role: 'เพื่อนอีกคนในกลุ่ม', traits: 'ขี้แข่ง ชอบอวด ชอบนัดแล้วเท แต่ก็ตลก' },
];

class MoSocial {
    constructor(llm) {
        this.llm = llm;
        this.storageKey = 'mo_social_v1';
        this.data = this.load();
    }

    load() {
        try {
            const saved = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
            if (saved) return saved;
        } catch (e) {}
        return { arcs: [], done: [] };
    }

    save() {
        try { localStorage.setItem(this.storageKey, JSON.stringify(this.data)); } catch (e) {}
    }

    active() {
        return this.data.arcs.filter(a => a.step < a.beats.length);
    }

    /**
     * เรียกเป็นระยะ: เรื่องที่ถึงเวลาเดินหน้า → ตอนต่อไป / ไม่มีเรื่อง → บางทีเริ่มเรื่องใหม่
     */
    async tick() {
        const now = Date.now();
        let changed = false;
        for (const arc of this.active()) {
            if (now >= arc.nextAt && arc.step < arc.beats.length - 1) {
                arc.step++;
                arc.nextAt = now + (18 + Math.random() * 30) * 3600000;   // ตอนถัดไปอีก ~1-2 วัน
                arc.fresh = true;
                changed = true;
            } else if (now >= arc.nextAt && arc.step === arc.beats.length - 1) {
                arc.step++;                                              // จบเรื่อง
                this.data.done = [...this.data.done, `${arc.who}: ${arc.title}`].slice(-8);
                changed = true;
            }
        }
        this.data.arcs = this.data.arcs.filter(a => a.step < a.beats.length);
        if (changed) this.save();
        if (this.active().length < 2 && Math.random() < 0.3) await this.startArc();
    }

    async startArc() {
        if (!this.llm || !this.llm.isReady() || this.starting) return;
        this.starting = true;
        try {
            const busy = this.active().map(a => a.who);
            const cast = MO_CAST.filter(c => !busy.includes(c.name));
            const r = await this.llm.completeJSON(`คิดเรื่องราวเล็กๆ ในชีวิตประจำวันของ "โม" (สาวไทยวัยรุ่น) ที่เกี่ยวกับคนรอบตัว 1 เรื่อง ให้ดำเนินต่อ 3-4 ตอน ตอนละ 1-2 วัน
คนรอบตัวที่เลือกได้: ${cast.map(c => `${c.name} (${c.role}: ${c.traits})`).join(' / ')}
เรื่องที่จบไปแล้ว (ห้ามซ้ำ): ${this.data.done.join(' / ') || '-'}
ให้เป็นเรื่องธรรมดาสมจริง มีขึ้นมีลง เช่น ทะเลาะ-คืนดี, เตรียมงาน-วันงาน, ของหาย-เจอ, นัดเที่ยว ไม่ใช่เรื่องร้ายแรง (ป่วยหนัก ตาย อุบัติเหตุ)
แต่ละตอนเขียนสั้นๆ ว่าเกิดอะไรขึ้น และโมรู้สึกยังไง
ตอบ JSON: {"who":"ชื่อ","title":"ชื่อเรื่องสั้นๆ","beats":["ตอน1","ตอน2","ตอน3"]}`);
            const who = MO_CAST.find(c => c.name === (r && r.who));
            const beats = (r && Array.isArray(r.beats) ? r.beats : []).filter(b => typeof b === 'string' && b.trim()).slice(0, 4);
            if (!who || beats.length < 2) return;
            this.data.arcs.push({
                id: 'arc_' + Date.now(), who: who.name, title: String(r.title || '').slice(0, 40),
                beats: beats.map(b => b.slice(0, 160)), step: 0, fresh: true,
                startedAt: Date.now(), nextAt: Date.now() + (18 + Math.random() * 30) * 3600000,
            });
            this.save();
            if (window.MoMindInstance) window.MoMindInstance.decide(`เรื่องใหม่กับ${who.name}: ${r.title}`);
        } catch (e) {
            console.warn('social arc failed', e.message);
        } finally {
            this.starting = false;
        }
    }

    /**
     * ตอนที่เพิ่งเกิดและโมยังไม่ได้เล่า → คืนมาให้ทักเล่า (แล้วจดว่าเล่าแล้ว)
     */
    takeFresh() {
        const arc = this.active().find(a => a.fresh);
        if (!arc) return null;
        arc.fresh = false;
        this.save();
        return { who: arc.who, beat: arc.beats[arc.step], title: arc.title };
    }

    promptSection(contextText = '') {
        // ใส่นิสัยเฉพาะคนที่ถูกพูดถึง/มีเรื่องอยู่ — คนอื่นแค่ชื่อ (ประหยัด token)
        const busy = this.active().map(a => a.who);
        const lines = MO_CAST.map(c => (busy.includes(c.name) || contextText.includes(c.name.replace('พี่', ''))
            ? `- ${c.name}: ${c.role} — ${c.traits}` : `- ${c.name} (${c.role})`));
        const arcs = this.active().map(a => {
            const past = a.beats.slice(0, a.step).join(' → ');
            return `- เรื่อง${a.who} "${a.title}": ${past ? `ก่อนหน้านี้ ${past} → ` : ''}ตอนนี้ ${a.beats[a.step]}`;
        });
        return `# คนรอบตัวโม (ชื่อ/นิสัยต้องตรงกันทุกครั้ง ห้ามแต่งคนใหม่ขึ้นมาแทน)
${lines.join('\n')}
${arcs.length ? `# เรื่องที่กำลังเกิดในชีวิตโมช่วงนี้ (เล่าต่อจากนี้ได้ ห้ามขัด ห้ามข้ามไปตอนที่ยังไม่เกิด)\n${arcs.join('\n')}\n` : ''}
`;
    }
}

// Export
window.MoSocial = MoSocial;
window.MO_CAST = MO_CAST;
