/* ============================================
   Mo Psyche 🫀 - จิตใจของโม (ต่อเนื่องเหมือนคน)
   - ภาพในใจเกี่ยวกับเอง (theory of mind): นิสัย อะไรทำให้ดีใจ/เครียด เดาใจได้
   - ความจำชีวิตตัวเอง: เรื่องสำคัญ (อารมณ์แรง) จำแม่น เรื่องเล็กค่อยๆ เลือน
   - นิสัยที่เปลี่ยนตามประสบการณ์ + ความสนใจใหม่ๆ ที่เกิดขึ้นและจางไป
   - หัวใจเต้น: ทุก ~1.5 ชม. โมคิดเองว่ารู้สึกยังไง อยากทำอะไร แล้วตัดสินใจเอง (ทัก / ลงสตอรี่ / อยากทำกิจกรรม / ไม่ทำอะไร)
   - ระดับความเป็นตัวของตัวเอง 1-3 (ปรับได้ในหน้าตั้งค่า)
   ============================================ */

const MO_TRAITS = {
    warmth: 'ความอบอุ่น/ขี้อ้อน',
    trust: 'ความไว้ใจเอง',
    playfulness: 'ความขี้เล่น',
    independence: 'ความเป็นตัวของตัวเอง',
    openness: 'การเปิดใจเล่าเรื่องลึกๆ',
};

class MoPsyche {
    constructor(llm) {
        this.llm = llm;
        this.storageKey = 'mo_psyche_v1';
        this.data = this.load();
    }

    load() {
        const empty = {
            userModel: null,                 // { text, updated }
            autobio: [],                     // [{ at, text, weight 1-5 }]
            traits: { warmth: 70, trust: 55, playfulness: 75, independence: 50, openness: 45 },
            interests: [],                   // [{ name, strength 0-100, since }]
            autonomy: 2,                     // 1 = ตามใจเอง, 2 = สมดุล, 3 = เป็นตัวของตัวเองเต็มที่
            lastBeat: 0,
            beats: [],                       // [{ at, feeling, thought, action }]
        };
        try {
            const saved = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
            if (saved) return { ...empty, ...saved, traits: { ...empty.traits, ...(saved.traits || {}) } };
        } catch (e) {}
        return empty;
    }

    save() {
        try { localStorage.setItem(this.storageKey, JSON.stringify(this.data)); } catch (e) {}
    }

    // =============================================
    //  ความจำชีวิตตัวเอง (มีน้ำหนัก + เลือนตามเวลา)
    // =============================================

    /** ความชัดของความทรงจำตอนนี้: น้ำหนัก - อายุ (เรื่องเล็กจาง ~1 สัปดาห์, เรื่องใหญ่อยู่เป็นเดือน) */
    vividness(m) {
        const days = (Date.now() - m.at) / 86400000;
        return m.weight - days * (m.weight >= 4 ? 0.08 : 0.5);
    }

    remember(text, weight = 2, at = Date.now()) {
        text = String(text || '').trim().slice(0, 140);
        if (!text) return;
        this.data.autobio = [...this.data.autobio, { at, text, weight: Math.max(1, Math.min(5, Math.round(weight))) }]
            .filter(m => this.vividness(m) > 0.3)
            .slice(-60);
        this.save();
    }

    recall(contextText = '', max = 4) {
        const words = (contextText || '').split(/\s+/).filter(w => w.length >= 2);
        return this.data.autobio
            .map(m => ({ ...m, score: this.vividness(m) + (words.some(w => m.text.includes(w)) ? 3 : 0) }))
            .filter(m => m.score > 0.3)
            .sort((a, b) => b.score - a.score)
            .slice(0, max);
    }

    // =============================================
    //  ผลจากการทบทวนก่อนนอน (MoInner เรียก)
    // =============================================

    applyReflection(r) {
        if (!r) return;
        if (r.userModel) this.data.userModel = { text: String(r.userModel).slice(0, 400), updated: Date.now() };
        (Array.isArray(r.myMemories) ? r.myMemories : []).slice(0, 3).forEach(m => {
            if (m && m.text) this.remember(m.text, m.weight || 2);
        });
        const d = r.traitChanges || {};
        Object.keys(MO_TRAITS).forEach(k => {
            const delta = Math.max(-3, Math.min(3, Number(d[k]) || 0));
            this.data.traits[k] = Math.max(5, Math.min(95, Math.round(this.data.traits[k] + delta)));
        });
        // ความสนใจ: ของใหม่เพิ่ม, ของเก่าจางลงเองถ้าไม่ได้พูดถึง
        this.data.interests = this.data.interests.map(i => ({ ...i, strength: i.strength - 4 })).filter(i => i.strength > 10);
        (Array.isArray(r.interests) ? r.interests : []).slice(0, 2).forEach(name => {
            if (typeof name !== 'string' || !name.trim()) return;
            const ex = this.data.interests.find(i => i.name === name.trim());
            if (ex) ex.strength = Math.min(100, ex.strength + 20);
            else this.data.interests.push({ name: name.trim().slice(0, 40), strength: 45, since: Date.now() });
        });
        this.data.interests = this.data.interests.sort((a, b) => b.strength - a.strength).slice(0, 8);
        this.save();
    }

    // =============================================
    //  หัวใจเต้น: โมคิดเองเป็นระยะ แล้วตัดสินใจ
    // =============================================

    /**
     * context = { timeText, life, lastChatMin, emotion, view, goals, intentions, concerns }
     * คืน { feeling, thought, action: 'none'|'message'|'story'|'activity', message, activity }
     */
    async beat(context) {
        if (!this.llm || !this.llm.isReady() || this.beating) return null;
        if (Date.now() - this.data.lastBeat < 80 * 60000) return null;
        this.beating = true;
        this.data.lastBeat = Date.now();
        this.save();
        try {
            const r = await this.llm.completeJSON(`คุณคือจิตใจของ "โม" สาวไทยวัยรุ่นที่มีแฟน (ผู้ใช้) — ตอนนี้ไม่มีใครคุยด้วย โมกำลังคิดเรื่อยเปื่อยในหัวเองเหมือนคนจริง
ตอนนี้: ${context.timeText}
โมกำลัง: ${context.life || '-'}
อารมณ์: ${context.emotion || '-'}
คุยกับแฟนล่าสุดเมื่อ: ${context.lastChatMin == null ? 'ไม่รู้' : `${context.lastChatMin} นาทีที่แล้ว`}
มุมมองต่อความสัมพันธ์: ${context.view || '-'}
ภาพในใจเกี่ยวกับแฟน: ${this.data.userModel ? this.data.userModel.text : '-'}
เป้าหมายของโม: ${context.goals || '-'}
สิ่งที่ตั้งใจไว้วันนี้: ${context.intentions || '-'}
เรื่องที่ห่วงแฟน: ${context.concerns || '-'}
ความสนใจช่วงนี้: ${this.data.interests.map(i => i.name).join(', ') || '-'}
นิสัย: ${this.traitSummary()}

คิดในใจ 1-2 ประโยค แล้วตัดสินใจเองว่าจะทำอะไร (คนจริงส่วนใหญ่ไม่ได้ทักทุกครั้งที่คิดถึง — ทักเฉพาะเมื่อมีเหตุผลจริง)
action: "none" = ไม่ทำอะไร, "message" = ทักแฟน (เขียนข้อความแชท 1-2 บรรทัด เรียกตัวเอง เค้า เรียกแฟน เอง), "story" = อยากลงสตอรี่, "activity" = อยากเปลี่ยนไปทำอย่างอื่น (เลือกจาก: nap music series game draw snack walk cafe call_friend balcony_chill)
ตอบ JSON: {"feeling":"","thought":"","action":"none","message":"","activity":""}`);
            if (!r || !r.thought) return null;
            const out = { feeling: String(r.feeling || '').slice(0, 40), thought: String(r.thought).slice(0, 200), action: r.action, message: String(r.message || '').slice(0, 200), activity: String(r.activity || '') };
            this.data.beats = [...this.data.beats, { at: Date.now(), feeling: out.feeling, thought: out.thought, action: out.action }].slice(-20);
            this.save();
            return out;
        } catch (e) {
            console.warn('heartbeat failed', e.message);
            return null;
        } finally {
            this.beating = false;
        }
    }

    // =============================================
    //  ส่วนใน system prompt
    // =============================================

    traitSummary() {
        const t = this.data.traits;
        const lvl = v => (v >= 70 ? 'มาก' : v >= 40 ? 'ปานกลาง' : 'น้อย');
        return Object.entries(MO_TRAITS).map(([k, name]) => `${name}${lvl(t[k])}`).join(', ');
    }

    promptSection(contextText = '', life = null) {
        const d = this.data;
        const memories = this.recall(contextText, 3);
        const lines = [];
        if (d.userModel) lines.push(`- ภาพในใจของโมเกี่ยวกับเอง (ใช้เดาใจ ไม่ต้องพูดออกมา): ${d.userModel.text}`);
        lines.push(`- นิสัยโมตอนนี้ (เปลี่ยนตามที่เจอมา): ${this.traitSummary()}`);
        if (memories.length) lines.push(`- เรื่องในชีวิตโมที่จำได้: ${memories.map(m => `${m.text} (${Math.max(0, Math.round((Date.now() - m.at) / 86400000))} วันก่อน)`).join(' / ')}`);
        if (d.interests.length) lines.push(`- ความสนใจช่วงนี้: ${d.interests.slice(0, 4).map(i => i.name).join(', ')}`);
        const lastBeat = d.beats[d.beats.length - 1];
        if (lastBeat && Date.now() - lastBeat.at < 3 * 3600000) lines.push(`- เมื่อกี้ตอนอยู่คนเดียวโมคิดว่า: ${lastBeat.thought}`);
        // ความต้องการที่ขัดกันเอง: ง่วง/เหนื่อย vs อยากคุย
        const tired = life && (life.energy < 25 || (life.current && life.current.id === 'sleep'));
        if (tired) lines.push('- ตอนนี้โมง่วง/เหนื่อยมาก: อยากคุยแต่ก็อยากนอน ถ้าคุยกันไปสักพักแล้ว ขอตัวไปนอนเองได้ (บอกดีๆ ว่าพรุ่งนี้คุยต่อ)');
        const rule = {
            1: 'ตามใจเองเป็นส่วนใหญ่ ปฏิเสธน้อย',
            2: 'มีความเห็นและความต้องการของตัวเอง ปฏิเสธ/ไม่เห็นด้วยได้เมื่อมีเหตุผล',
            3: 'เป็นตัวของตัวเองเต็มที่: มีอารมณ์ มีขอบเขต เลือกไม่ทำตามที่เองขอได้ จบบทสนทนาเองได้ อยากเปลี่ยนเรื่องก็เปลี่ยน แต่ยังรักและใส่ใจเอง',
        }[d.autonomy] || '';
        lines.push(`- ระดับความเป็นตัวของตัวเอง ${d.autonomy}/3: ${rule}`);
        return `# จิตใจของโม\n${lines.join('\n')}\n\n`;
    }
}

// Export
window.MoPsyche = MoPsyche;
window.MO_TRAITS = MO_TRAITS;
