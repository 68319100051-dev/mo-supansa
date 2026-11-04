/* ============================================
   Mo Quests ✅ - ภารกิจรายวันที่ทำด้วยกัน
   - วันละ 3 ข้อ (ดื่มน้ำทุกวัน + สุ่มอีก 2 ตามวันที่)
   - กดติ๊กเองได้ หรือพิมพ์เล่าในแชท ("ดื่มน้ำแล้ว", "กินข้าวแล้ว") ระบบนับให้
   - ครบทุกข้อ = ต้นไม้ได้น้ำ แมวอารมณ์ดี โมชม + ต่อสตรีค
   ============================================ */

const MO_QUEST_POOL = [
    { id: 'water', emoji: '💧', title: 'ดื่มน้ำ 8 แก้ว', goal: 8, re: /ดื่มน้ำ|กินน้ำ|น้ำเปล่า|ดื่มแล้ว/ },
    { id: 'meals', emoji: '🍚', title: 'กินข้าวครบ 3 มื้อ', goal: 3, re: /กินข้าว|กินแล้ว|อิ่มแล้ว|ข้าวเช้า|ข้าวเที่ยง|ข้าวเย็น/ },
    { id: 'move', emoji: '🏃', title: 'ขยับตัว/ออกกำลังกาย 15 นาที', goal: 1, re: /ออกกำลัง|วิ่ง|ยิม|เดินเล่น|โยคะ|ปั่นจักรยาน|ว่ายน้ำ/ },
    { id: 'eyes', emoji: '👀', title: 'พักสายตาจากจอ ยืดเส้นสักหน่อย', goal: 1, re: /พักสายตา|ยืดเส้น|พักจอ/ },
    { id: 'fruit', emoji: '🥦', title: 'กินผักหรือผลไม้', goal: 1, re: /ผัก|ผลไม้|สลัด|แอปเปิ้ล|กล้วย|ส้ม/ },
    { id: 'sleep', emoji: '😴', title: 'เข้านอนก่อนเที่ยงคืน', goal: 1, re: /ไปนอนแล้ว|ฝันดี|นอนแล้ว/ },
    { id: 'good', emoji: '🌟', title: 'เล่าเรื่องดีๆ ของวันนี้ให้โมฟัง', goal: 1, re: /ดีใจ|มีความสุข|วันนี้ดี|เรื่องดี/ },
    { id: 'tidy', emoji: '🧹', title: 'เก็บโต๊ะ/ห้องให้เรียบร้อย', goal: 1, re: /เก็บห้อง|ทำความสะอาด|เก็บโต๊ะ|กวาดบ้าน/ },
];

class MoQuests {
    constructor() {
        this.storageKey = 'mo_quests_v1';
        this.data = this.load();
        this.onAllDone = null;
        this.today();
    }

    load() {
        try {
            const saved = JSON.parse(localStorage.getItem(this.storageKey));
            if (saved) return saved;
        } catch (e) {}
        return { day: '', quests: [], streak: 0, best: 0, lastDone: '', history: [] };
    }

    save() {
        try { localStorage.setItem(this.storageKey, JSON.stringify(this.data)); } catch (e) {}
    }

    key(d = new Date()) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    /** ภารกิจของวันนี้ (วันใหม่ = สุ่มใหม่ ตามวันที่ ทุกเครื่องได้ชุดเดียวกัน) */
    today() {
        const k = this.key();
        if (this.data.day !== k) {
            let seed = [...k].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
            const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
            const rest = MO_QUEST_POOL.slice(1).sort(() => rnd() - 0.5).slice(0, 2);
            this.data.day = k;
            this.data.quests = [MO_QUEST_POOL[0], ...rest].map(q => ({ id: q.id, n: 0 }));
            // เมื่อวานไม่ครบ = สตรีคขาด
            const y = new Date(); y.setDate(y.getDate() - 1);
            if (this.data.lastDone !== this.key(y) && this.data.lastDone !== k) this.data.streak = 0;
            this.save();
        }
        return this.data.quests.map(q => ({ ...MO_QUEST_POOL.find(p => p.id === q.id), n: q.n }));
    }

    allDone() {
        return this.today().every(q => q.n >= q.goal);
    }

    /** +1 ให้ภารกิจ → คืน true ถ้าเพิ่งครบทุกข้อ */
    bump(id, by = 1) {
        this.today();
        const q = this.data.quests.find(x => x.id === id);
        const def = MO_QUEST_POOL.find(p => p.id === id);
        if (!q || !def || q.n >= def.goal) return false;
        const wasDone = this.allDone();
        q.n = Math.min(def.goal, q.n + by);
        if (!wasDone && this.allDone()) {
            this.data.lastDone = this.data.day;
            this.data.streak++;
            this.data.best = Math.max(this.data.best, this.data.streak);
            this.data.history = [...(this.data.history || []), { day: this.data.day, streak: this.data.streak }].slice(-60);
            this.save();
            if (this.onAllDone) this.onAllDone(this.data.streak);
            return true;
        }
        this.save();
        return false;
    }

    /** เองเล่าในแชท → นับให้เอง (กันนับซ้ำ: ข้อความเดียวนับข้อละครั้ง) */
    observe(text) {
        const t = String(text || '');
        if (/ยัง(ไม่)?|ไม่ได้|ลืม/.test(t)) return;
        this.today().forEach(q => { if (q.re.test(t)) this.bump(q.id); });
    }

    promptSection() {
        const list = this.today();
        const left = list.filter(q => q.n < q.goal);
        const status = list.map(q => `${q.emoji} ${q.title} ${q.n}/${q.goal}`).join(', ');
        return `# ภารกิจวันนี้ที่ทำด้วยกัน (สตรีค ${this.data.streak} วัน)
- ${status}
- ${left.length ? 'เชียร์ได้เป็นบางครั้งเมื่อเข้ากับที่คุย (เช่น ถามว่าดื่มน้ำยัง) ไม่ต้องทวงทุกข้อความ' : 'วันนี้ทำครบแล้ว ชมได้'}

`;
    }
}

window.MoQuests = MoQuests;
window.MO_QUEST_POOL = MO_QUEST_POOL;
