/* ============================================
   Mo Stories 📸 - สตอรี่ของโม (แบบ IG)
   - วันละ 1-3 สตอรี่ ตามชีวิตโมตอนนั้น (กินอะไร ทำอะไร อากาศ) อยู่ 24 ชม.
   - มีสตอรี่ใหม่ → วงแหวนรอบรูปโม / แตะรูปโมเพื่อดู / ตอบกลับสตอรี่ได้
   - ไม่มีรูปคน: เป็นการ์ดอีโมจิ + ข้อความ + พื้นหลังตามบรรยากาศ
   ============================================ */

const MO_STORY_BGS = {
    sunset: 'linear-gradient(160deg, #ff9a8b, #ff6a88 55%, #ff99ac)',
    pink: 'linear-gradient(160deg, #fbc2eb, #f04d85)',
    night: 'linear-gradient(160deg, #141e30, #243b55)',
    mint: 'linear-gradient(160deg, #a8edea, #5ec6a8)',
    sky: 'linear-gradient(160deg, #89f7fe, #66a6ff)',
    cafe: 'linear-gradient(160deg, #d7b899, #8d6e63)',
};

class MoStories {
    constructor(llm) {
        this.llm = llm;
        this.storageKey = 'mo_stories_v1';
        this.data = this.load();
        this.onChange = null;   // () => void — อัปเดตวงแหวนรอบรูป
    }

    load() {
        try {
            const saved = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
            if (saved) return saved;
        } catch (e) {}
        return { items: [], lastAt: 0, seen: [] };
    }

    save() {
        try { localStorage.setItem(this.storageKey, JSON.stringify(this.data)); } catch (e) {}
        if (this.onChange) this.onChange();
    }

    active() {
        const dayAgo = Date.now() - 24 * 3600000;
        return this.data.items.filter(s => s.at > dayAgo);
    }

    hasUnseen() {
        return this.active().some(s => !this.data.seen.includes(s.id));
    }

    markSeen(id) {
        if (this.data.seen.includes(id)) return;
        this.data.seen = [...this.data.seen, id].slice(-30);
        this.save();
    }

    /**
     * เรียกทุกไม่กี่นาที: ห่างจากสตอรี่ล่าสุดเกิน 5 ชม. + ช่วงกลางวัน → บางทีโมลงสตอรี่ใหม่
     */
    async maybePost() {
        const h = new Date().getHours();
        if (h < 9 || h > 22 || Date.now() - this.data.lastAt < 5 * 3600000 || Math.random() > 0.25) return;
        if (!this.llm || !this.llm.isReady() || this.posting) return;
        this.posting = true;
        try {
            const life = window.MoLifeInstance ? window.MoLifeInstance.describeNow() : '';
            const weather = window.MoWeather && window.MoWeather.describe ? window.MoWeather.describe() : '';
            const today = this.active().map(s => s.text).join(' / ');
            const r = await this.llm.completeJSON(`คุณคือ "โม" สาวไทยวัยรุ่น กำลังจะลงสตอรี่ IG 1 อัน ตามชีวิตตอนนี้
ตอนนี้: ${this.llm.timeContext()}
โมกำลัง: ${life}
${weather ? `อากาศ: ${weather}` : ''}
${today ? `สตอรี่ที่ลงไปแล้ววันนี้ (ห้ามซ้ำ): ${today}` : ''}
เขียนแคปชันสั้นๆ ภาษาวัยรุ่น ไม่เกิน 15 คำ เหมือนคนลงสตอรี่จริง (ของกิน วิว เพลงที่ฟัง ความรู้สึก ฯลฯ ให้เข้ากับที่ทำอยู่)
ตอบ JSON: {"emoji":"อีโมจิหลัก 1-2 ตัว","text":"แคปชัน","bg":"sunset|pink|night|mint|sky|cafe"}`);
            if (!r || !r.text) return;
            const story = {
                id: 'st_' + Date.now(),
                at: Date.now(),
                emoji: String(r.emoji || '✨').slice(0, 8),
                text: String(r.text).slice(0, 80),
                bg: MO_STORY_BGS[r.bg] ? r.bg : 'pink',
            };
            this.data.items = [...this.active(), story].slice(-5);
            this.data.lastAt = story.at;
            this.save();
            if (window.MoMindInstance) window.MoMindInstance.act(`ลงสตอรี่: ${story.text}`);
        } catch (e) {
            console.warn('story failed', e.message);
        } finally {
            this.posting = false;
        }
    }

    promptSection() {
        const list = this.active();
        if (!list.length) return '';
        return `# สตอรี่ที่โมลงวันนี้ (เป็นเรื่องจริงของโม ห้ามขัด)\n${list.map(s => `- ${s.emoji} ${s.text}`).join('\n')}\n\n`;
    }

    // =============================================
    //  ตัวดูสตอรี่
    // =============================================

    open(onReply) {
        const list = this.active();
        if (!list.length) return false;
        const viewer = document.getElementById('story-viewer');
        let i = Math.max(0, list.findIndex(s => !this.data.seen.includes(s.id)));
        let timer = null;
        const close = () => {
            clearTimeout(timer);
            viewer.classList.add('hidden');
            viewer.onclick = null;
        };
        const show = () => {
            if (i >= list.length) return close();
            const s = list[i];
            this.markSeen(s.id);
            viewer.querySelector('.story-card').style.background = MO_STORY_BGS[s.bg] || MO_STORY_BGS.pink;
            viewer.querySelector('.story-emoji').textContent = s.emoji;
            viewer.querySelector('.story-text').textContent = s.text;
            const mins = Math.round((Date.now() - s.at) / 60000);
            viewer.querySelector('.story-time').textContent = mins < 60 ? `${mins} นาที` : `${Math.round(mins / 60)} ชม.`;
            viewer.querySelector('.story-bars').innerHTML = list.map((_, k) =>
                `<span class="${k < i ? 'done' : k === i ? 'active' : ''}"></span>`).join('');
            clearTimeout(timer);
            timer = setTimeout(() => { i++; show(); }, 6000);
        };
        const input = viewer.querySelector('.story-reply input');
        input.value = '';
        input.onfocus = () => clearTimeout(timer);
        input.onkeydown = (e) => {
            if (e.key !== 'Enter' || !input.value.trim()) return;
            const text = input.value.trim();
            const s = list[Math.min(i, list.length - 1)];
            close();
            onReply(s, text);
        };
        viewer.querySelector('.story-close').onclick = (e) => { e.stopPropagation(); close(); };
        viewer.querySelector('.story-card').onclick = (e) => {
            const back = e.clientX < window.innerWidth / 3;
            i = back ? Math.max(0, i - 1) : i + 1;
            show();
        };
        viewer.classList.remove('hidden');
        show();
        return true;
    }
}

// Export
window.MoStories = MoStories;
