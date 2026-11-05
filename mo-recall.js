/* ============================================
   Mo Recall 🔎 - ความจำตามความหมาย (semantic memory)
   - เก็บ embedding ของข้อความเก่าไว้ใน IndexedDB ของเครื่องนี้ (Gemini embedding)
   - เองพิมพ์มา → หาเรื่องเก่าที่ความหมายใกล้กัน (แม้คนละคำ) ส่งให้โมนึกออก
   - ใช้เฉพาะแชทที่หลุดหน้าต่างที่ AI เห็นแล้ว และมีเวลาจำกัด ไม่ให้ตอบช้า
   ============================================ */

const MoRecall = {
    model: 'gemini-embedding-001',
    dims: 256,
    db: null,

    key() {
        const llm = window.MoLLMService && window.MoLLMInstance;
        const k = (llm && llm.config.provider !== 'openai' && llm.config.apiKey) || (window.MO_KEYS && window.MO_KEYS.gemini);
        return k ? k.trim() : null;
    },

    open() {
        if (this.db) return Promise.resolve(this.db);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('mo_recall', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('vecs', { keyPath: 'id' });
            req.onsuccess = () => { this.db = req.result; resolve(this.db); };
            req.onerror = () => reject(req.error);
        });
    },

    async all() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const req = db.transaction('vecs').objectStore('vecs').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    },

    async putMany(items) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('vecs', 'readwrite');
            items.forEach(it => tx.objectStore('vecs').put(it));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    async embed(texts, task) {
        const key = this.key();
        if (!key) throw new Error('no gemini key');
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:batchEmbedContents`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({
                requests: texts.map(text => ({
                    model: `models/${this.model}`,
                    content: { parts: [{ text }] },
                    taskType: task,
                    outputDimensionality: this.dims,
                })),
            }),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`embed ${res.status}`);
        const data = await res.json();
        if (window.MoLLMInstance) window.MoLLMInstance.track('Gemini ความจำ');
        return (data.embeddings || []).map(e => this.normalize(e.values));
    },

    normalize(v) {
        const n = Math.hypot(...v) || 1;
        return v.map(x => x / n);
    },

    textOf(m, userName) {
        if (!m || !m.text || (m.format && m.format !== 'text' && m.format !== 'voice')) return null;
        const t = (m.format === 'voice' ? m.extra && m.extra.text : m.text) || '';
        if (t.trim().length < 12) return null;
        return `${m.type === 'sent' ? userName : 'โม'}: ${t.trim().slice(0, 300)}`;
    },

    /**
     * เก็บ embedding ของข้อความที่ยังไม่มี (ทีละไม่เกิน 40 ข้อความ เรียกเบื้องหลังตอนเรียนรู้)
     */
    async index(messages, userName) {
        if (!this.key() || this.indexing) return;
        this.indexing = true;
        try {
            const have = new Set((await this.all()).map(v => v.id));
            const todo = messages
                .map(m => ({ m, text: this.textOf(m, userName) }))
                .filter(x => x.text && !have.has(String(x.m.id)))
                .slice(-40);
            if (!todo.length) return;
            const vecs = await this.embed(todo.map(x => x.text), 'RETRIEVAL_DOCUMENT');
            await this.putMany(todo.map((x, i) => ({ id: String(x.m.id), text: x.text, at: x.m.timestamp, vec: vecs[i] })).filter(x => x.vec));
        } catch (e) {
            console.warn('recall index failed:', e.message);
        } finally {
            this.indexing = false;
        }
    },

    /**
     * หาเรื่องเก่าที่เกี่ยวกับข้อความนี้ → โน้ตให้ AI (ไม่เจอ/ช้าเกิน → '')
     */
    async noteFor(text, messages, keepRecent = 14) {
        if (!this.key() || text.trim().length < 6) return '';
        try {
            const recentIds = new Set(messages.slice(-keepRecent).map(m => String(m.id)));
            const stored = (await this.all()).filter(v => !v.mem && !recentIds.has(v.id));
            if (stored.length < 5) return '';
            const [q] = await this.embed([text], 'RETRIEVAL_QUERY');
            const hits = stored
                .map(v => ({ ...v, score: v.vec.reduce((s, x, i) => s + x * q[i], 0) }))
                .filter(v => v.score > 0.62)
                .sort((a, b) => b.score - a.score)
                .slice(0, 3);
            if (!hits.length) return '';
            if (window.MoMindInstance) window.MoMindInstance.fire('limbic', 0.7);
            const lines = hits.map(h => `- (${new Date(h.at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}) ${h.text}`);
            return `[ข้อความระบบ: เรื่องเก่าที่โมนึกออก อาจเกี่ยวกับที่เองพูด (หยิบมาพูดเฉพาะถ้าเข้ากันจริงๆ ห้ามยัดเยียด):\n${lines.join('\n')}]\n`;
        } catch (e) {
            return '';
        }
    },

    hash(s) {
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return (h >>> 0).toString(36);
    },

    /**
     * ความจำอื่นๆ (เรื่องของเอง / ความเห็น มุก ความทรงจำชีวิตโม / ไดอารี่) ที่ความหมายใกล้กับที่เองพิมพ์
     * items = [{ kind, text }] → คืน [{ kind, text, score }] ไม่เกิน 4 อัน
     * embedding ของแต่ละความจำเก็บไว้ (ฝังครั้งเดียว) ความจำใหม่ค่อยฝังเพิ่ม
     */
    async memoryHits(text, items) {
        if (!this.key() || text.trim().length < 4 || !items.length) return [];
        try {
            const cache = new Map((await this.all()).filter(v => v.mem).map(v => [v.id, v]));
            const list = items
                .filter(it => it.text && String(it.text).trim().length >= 4)
                .map(it => ({ ...it, id: `mem:${this.hash(`${it.kind}|${it.text}`)}` }));
            const todo = list.filter(it => !cache.has(it.id)).slice(0, 90);
            if (todo.length) {
                const vecs = await this.embed(todo.map(it => String(it.text).slice(0, 300)), 'RETRIEVAL_DOCUMENT');
                const fresh = todo.map((it, i) => ({ id: it.id, mem: true, text: it.text, at: Date.now(), vec: vecs[i] })).filter(x => x.vec);
                await this.putMany(fresh);
                fresh.forEach(v => cache.set(v.id, v));
            }
            const [q] = await this.embed([text], 'RETRIEVAL_QUERY');
            const scored = list
                .filter(it => cache.has(it.id))
                .map(it => ({ kind: it.kind, text: it.text, score: cache.get(it.id).vec.reduce((s, x, i) => s + x * q[i], 0) }))
                .sort((a, b) => b.score - a.score);
            // ภาษาไทยคะแนนพื้นฐานสูง (เรื่องไม่เกี่ยวก็ ~0.7) → เอาแค่อันที่ใกล้อันดับหนึ่งจริงๆ
            const best = scored.length ? scored[0].score : 0;
            return scored.filter(it => it.score >= Math.max(0.72, best - 0.04)).slice(0, 3);
        } catch (e) {
            console.warn('recall memory failed:', e.message);
            return [];
        }
    },
};

// Export
window.MoRecall = MoRecall;
