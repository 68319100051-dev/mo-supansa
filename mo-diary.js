/* ============================================
   Mo Diary 📔 - ไดอารี่ของโม
   โมเขียนสรุปแต่ละวันที่ได้คุยกัน จากบทสนทนาจริงของวันนั้น
   (มีสมอง AI → ให้ AI เขียน, ไม่มี → เขียนจากข้อมูลที่มี ไม่แต่งเรื่องเพิ่ม)
   ============================================ */

class MoDiary {
    constructor(memory, brain, llmService = null) {
        this.memory = memory;
        this.brain = brain;
        this.llmService = llmService;
        this.storageKey = 'mo_diary_v1';
        this.entries = this.load();   // { 'YYYY-MM-DD': { text, messageCount, writtenAt } }
        this.writing = new Set();
    }

    load() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return {};
    }

    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.entries));
        } catch (e) {}
    }

    clear() {
        this.entries = {};
        this.save();
    }

    dateKey(ts) {
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    groupByDay(messages) {
        const days = {};
        for (const m of messages) {
            if (!m.timestamp) continue;
            (days[this.dateKey(m.timestamp)] ||= []).push(m);
        }
        return days;
    }

    /**
     * เขียนไดอารี่ของวันที่ยังไม่มี (วันนี้จะเขียนใหม่ถ้ามีข้อความเพิ่ม)
     * onUpdate จะถูกเรียกทุกครั้งที่เขียนเสร็จหนึ่งวัน
     */
    async update(messages, onUpdate) {
        const days = this.groupByDay(messages);
        const today = this.dateKey(Date.now());
        for (const [key, msgs] of Object.entries(days)) {
            const userMsgs = msgs.filter(m => m.type === 'sent');
            if (userMsgs.length === 0) continue;
            const existing = this.entries[key];
            const stale = key === today && existing && existing.messageCount !== msgs.length;
            if ((existing && !stale) || this.writing.has(key)) continue;

            this.writing.add(key);
            try {
                const text = await this.write(key, msgs);
                this.entries[key] = { text, messageCount: msgs.length, writtenAt: Date.now() };
                this.save();
            } finally {
                this.writing.delete(key);
            }
            if (onUpdate) onUpdate();
        }
    }

    async write(key, msgs) {
        const name = this.memory.getUserName();
        const lines = msgs
            .filter(m => m.format !== 'reel')
            .map(m => {
                const who = m.type === 'sent' ? name : 'โม';
                const text = m.format === 'image' ? '[ส่งรูป]' : m.format === 'sticker' ? `[สติกเกอร์ ${m.text}]` : m.text;
                return `${who}: ${text}`;
            })
            .slice(-40)
            .join('\n');

        if (this.llmService && this.llmService.isReady()) {
            try {
                const prompt = `เขียนไดอารี่ส่วนตัวของโม 3-5 ประโยค สรุปวันที่ได้คุยกับ${name} จากบทสนทนาด้านล่าง ` +
                    `เขียนแบบเล่าความรู้สึกของโมเอง (เช่น "วันนี้${name}...") ใช้เฉพาะเรื่องที่อยู่ในบทสนทนา ห้ามแต่งเพิ่ม ` +
                    `ไม่ต้องขึ้นต้นด้วยวันที่ ไม่ต้องใช้หัวข้อ\n\n${lines}`;
                const reply = await this.llmService.generateResponse(prompt, [], this.brain.personality, this.memory.getSummary());
                if (reply && reply.trim()) return reply.trim();
            } catch (e) {
                console.warn('Diary LLM failed, fallback:', e);
            }
        }
        return this.writeOffline(msgs, name);
    }

    /**
     * ไดอารี่แบบไม่ใช้ AI: ใช้แค่สิ่งที่เกิดขึ้นจริงในวันนั้น
     */
    writeOffline(msgs, name) {
        const userMsgs = msgs.filter(m => m.type === 'sent');
        const texts = userMsgs.filter(m => m.format === 'text' || !m.format).map(m => m.text);
        const images = userMsgs.filter(m => m.format === 'image').length;
        const hours = msgs.map(m => new Date(m.timestamp).getHours());
        const period = (() => {
            const h = hours[0];
            if (h < 11) return 'ตอนเช้า';
            if (h < 16) return 'ตอนบ่าย';
            if (h < 20) return 'ตอนเย็น';
            return 'ตอนดึก';
        })();

        const parts = [`วันนี้${name}มาคุยกับเค้า${period} ทั้งหมด ${userMsgs.length} ข้อความ`];

        // เรื่องที่เล่า: เอาประโยคที่ยาวที่สุดสองอันมาเป็นตัวแทน
        const notable = texts.filter(t => t.length >= 6 && !/เตือน/.test(t)).sort((a, b) => b.length - a.length).slice(0, 2);
        if (notable.length) parts.push(`มีเล่าว่า "${notable.join('" กับ "')}"`);
        if (images) parts.push(`ส่งรูปมาให้ดูด้วย ${images} รูป 📸`);

        const sad = texts.some(t => /เหนื่อย|เศร้า|เครียด|ท้อ|ไม่ไหว|ร้องไห้/.test(t));
        const happy = texts.some(t => /555|ดีใจ|สำเร็จ|เย้|สนุก|ผ่าน/.test(t));
        if (sad) parts.push(`ดูเหนื่อยๆ ไปนิด หวังว่าพรุ่งนี้จะดีขึ้นนะ 🥺`);
        else if (happy) parts.push(`ดูอารมณ์ดีมาก เค้าก็ยิ้มตามเลย 😊`);
        else parts.push(`ดีใจที่ได้คุยกันอีกวันนะ 💕`);

        return parts.join(' ');
    }

    /**
     * รายการไดอารี่ ใหม่สุดก่อน
     */
    getEntries() {
        return Object.entries(this.entries)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([key, e]) => ({ key, ...e }));
    }

    /**
     * ไดอารี่ 2 วันล่าสุด (ไม่รวมวันนี้) ให้ AI รู้ว่าวันก่อนๆ คุยอะไรกัน
     */
    recentForPrompt() {
        const today = this.dateKey(Date.now());
        const recent = this.getEntries().filter(e => e.key !== today).slice(0, 2);
        if (!recent.length) return '';
        return `# ไดอารี่ของโมวันก่อนๆ (ใช้จำว่าเคยคุยอะไร)\n${recent.map(e => `- ${this.formatDate(e.key)}: ${e.text}`).join('\n')}\n\n`;
    }

    formatDate(key) {
        const [y, m, d] = key.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        const isToday = key === this.dateKey(Date.now());
        const label = date.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        return isToday ? `วันนี้ (${label})` : label;
    }
}

// Export
window.MoDiary = MoDiary;
