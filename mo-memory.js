/* ============================================
   Mo Memory 💾 - Persistent Memory System
   Version 2.0 — Structured 4-Category Memory Engine
   
   A. ข้อมูลระยะยาว (Long-term: ชื่อ, ความชอบ, โปรเจกต์, สิ่งที่ไม่ชอบ)
   B. ความทรงจำเกี่ยวกับเหตุการณ์ (Episodic: วันที่, เรื่อง, ความมั่นใจ)
   C. บริบทระยะสั้น (Short-term: หัวข้อสนทนาล่าสุด, งานที่ทำ)
   D. ความจำที่ผู้ใช้ควบคุมได้ (User Control: ดู, ลบ, ปิด/เปิดประเภทการจำ)
   ============================================ */

class MoMemory {
    constructor() {
        this.storageKey = 'mo_memory_v2';
        this.chatHistoryKey = 'mo_chat_history_v2';
        this.statsKey = 'mo_stats_v2';
        this.settingsKey = 'mo_memory_settings_v2';

        this.settings = this.loadSettings();
        this.data = this.load();
        // ชื่อที่ตั้งไว้ใน mo-keys.local.js → รู้ตั้งแต่แรกทุกเครื่อง
        const presetName = window.MO_PROFILE && window.MO_PROFILE.userName;
        if (presetName && !this.data.longTerm.userName) this.data.longTerm.userName = presetName;
        this.stats = this.loadStats();
        
        // บริบทระยะสั้น (เก็บใน Memory ไม่จำเป็นต้องลง localStorage ถาวรทั้งหมด หรือเก็บเฉพาะ session)
        this.shortTermContext = {
            currentTopic: null,
            recentTopics: [],
            lastUserIntent: null,
            activeProject: null,
        };
    }

    /**
     * การตั้งค่าการจดจำ (D. ควบคุมโดยผู้ใช้)
     */
    loadSettings() {
        try {
            const saved = localStorage.getItem(this.settingsKey);
            if (saved) return JSON.parse(saved);
        } catch (e) {}

        return {
            allowLongTerm: true,     // จำข้อมูลทั่วไป & ความชอบ
            allowEpisodic: true,     // จำเหตุการณ์สำคัญ
            allowShortTerm: true,    // ติดตามบริบทบทสนทนา
        };
    }

    saveSettings() {
        try {
            localStorage.setItem(this.settingsKey, JSON.stringify(this.settings));
        } catch (e) {}
    }

    /**
     * โหลดข้อมูลความทรงจำ
     */
    load() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Could not load memory:', e);
        }

        return {
            // A. ข้อมูลระยะยาว
            longTerm: {
                userName: null,
                callName: 'ไอ้ดื้อ',       // วิธีที่โมเรียกผู้ใช้
                preferences: {
                    food: [],
                    hobbies: [],
                    music: [],
                },
                projects: [],              // โครงการที่กำลังพัฒนา
                dislikes: [],              // สิ่งที่ไม่ชอบให้ทำ/พูด
                customFacts: []            // ข้อเท็จจริงอื่นๆ
            },

            // B. ความทรงจำเกี่ยวกับเหตุการณ์ (Episodic)
            events: [
                /*
                {
                    id: 'ev_1',
                    date: '2026-11-02',
                    timestamp: 123456789,
                    title: 'เริ่มพัฒนาโปรเจกต์',
                    confidence: 0.95,
                    source: 'user_explicit'
                }
                */
            ],

            firstMeet: null,
            lastChat: null,
            relationship: {
                level: 1,
                affection: 50,
                daysKnown: 0
            }
        };
    }

    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.data));
        } catch (e) {
            console.warn('Could not save memory:', e);
        }
    }

    /**
     * Stats
     */
    loadStats() {
        try {
            const saved = localStorage.getItem(this.statsKey);
            if (saved) return JSON.parse(saved);
        } catch (e) {}

        return {
            totalMessages: 0,
            totalCalls: 0,
            totalDays: 0,
            longestStreak: 0,
            currentStreak: 0,
            lastActiveDate: null
        };
    }

    saveStats() {
        try {
            localStorage.setItem(this.statsKey, JSON.stringify(this.stats));
        } catch (e) {}
    }

    // ==========================================
    // A. ข้อมูลระยะยาว (Long-Term Memory)
    // ==========================================

    setUserName(name) {
        if (!this.settings.allowLongTerm) return;
        this.data.longTerm.userName = name;
        this.addEvent(`บอกชื่อว่า "${name}"`, 1.0, 'user_explicit');
        this.save();
    }

    getUserName() {
        return this.data.longTerm.userName || 'ไอ้ดื้อ';
    }

    addPreference(category, item) {
        if (!this.settings.allowLongTerm) return;
        if (!this.data.longTerm.preferences[category]) {
            this.data.longTerm.preferences[category] = [];
        }
        if (!this.data.longTerm.preferences[category].includes(item)) {
            this.data.longTerm.preferences[category].push(item);
            this.save();
        }
    }

    addProject(projectName) {
        if (!this.settings.allowLongTerm) return;
        if (!this.data.longTerm.projects.includes(projectName)) {
            this.data.longTerm.projects.push(projectName);
            this.shortTermContext.activeProject = projectName;
            this.addEvent(`กำลังพัฒนาโปรเจกต์ "${projectName}"`, 0.9, 'user_conversation');
            this.save();
        }
    }

    addDislike(item) {
        if (!this.settings.allowLongTerm) return;
        if (!this.data.longTerm.dislikes.includes(item)) {
            this.data.longTerm.dislikes.push(item);
            this.save();
        }
    }

    addCustomFact(fact) {
        if (!this.settings.allowLongTerm) return;
        if (!this.data.longTerm.customFacts.includes(fact)) {
            this.data.longTerm.customFacts.push(fact);
            if (this.data.longTerm.customFacts.length > 50) {
                this.data.longTerm.customFacts = this.data.longTerm.customFacts.slice(-50);
            }
            this.save();
        }
    }

    // ==========================================
    // B. เหตุการณ์สำคัญ (Episodic Memory)
    // ==========================================

    addEvent(title, confidence = 0.8, source = 'conversation') {
        if (!this.settings.allowEpisodic) return;
        
        const now = new Date();
        const dateStr = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
        
        // ตรวจสอบไม่ให้จำซ้ำเรื่องเดิมติดกัน
        const exists = this.data.events.some(e => e.title === title);
        if (exists) return;

        this.data.events.push({
            id: 'ev_' + Date.now(),
            date: dateStr,
            timestamp: Date.now(),
            title: title,
            confidence: confidence, // ป้องกันการสับสนระหว่างสิ่งที่ผู้ใช้พูดจริงกับการคาดเดา
            source: source
        });

        // เก็บล่าสุด 40 เหตุการณ์
        if (this.data.events.length > 40) {
            this.data.events = this.data.events.slice(-40);
        }
        this.save();
    }

    // ==========================================
    // C. บริบทระยะสั้น (Short-Term Context)
    // ==========================================

    updateShortTermTopic(topic) {
        if (!this.settings.allowShortTerm || !topic) return;
        this.shortTermContext.currentTopic = topic;
        this.shortTermContext.recentTopics.push(topic);
        if (this.shortTermContext.recentTopics.length > 5) {
            this.shortTermContext.recentTopics.shift();
        }
    }

    getShortTermContext() {
        return this.shortTermContext;
    }

    // ==========================================
    // Natural Memory Extraction (การคัดกรองข้อมูล)
    // ==========================================

    extractFacts(message) {
        if (!message) return;
        const lowerMsg = message.toLowerCase();

        // 1. ตรวจจับชื่อ (ไม่นับประโยคที่ถามชื่อ หรือพูดถึงชื่อคนอื่น)
        const namePatterns = [
            /(?<!แฟน|แม่|พ่อ|พี่|น้อง|เพื่อน|สนิท)(?:^|ผม|ฉัน|เรา|เค้า|หนู|กู)\s*ชื่อ\s*(?:เล่น\s*)?(?:ว่า\s*)?([a-zA-Zก-๙0-9_]{2,20})/i,
            /เรียก\s*(?:เรา|ผม|ฉัน|หนู)\s*ว่า\s*([a-zA-Zก-๙0-9_]{2,20})/i
        ];
        for (const pattern of namePatterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                const name = this.cleanName(match[1]);
                const invalidNames = ['อะไร', 'ไร', 'ว่า', 'นะ', 'ดี', 'โม'];
                if (name.length >= 2 && !invalidNames.some(w => name.startsWith(w))) {
                    this.setUserName(name);
                    break;
                }
            }
        }

        // 2. ตรวจจับโปรเจกต์/งานที่ทำ
        const projectPatterns = [
            /(?:ทำ|เขียน|สร้าง|พัฒนา)(?:เกม|ระบบ|แอพ|app|เว็บ|บอท|bot|โปรเจกต์|project)\s*([a-zA-Zก-๙0-9_]+)?/i,
            /(?:กำลังทำ|โปรเจกต์)\s*([a-zA-Zก-๙0-9_]+)/i
        ];
        for (const pattern of projectPatterns) {
            const match = message.match(pattern);
            if (match) {
                const proj = match[0].trim();
                this.addProject(proj);
                this.updateShortTermTopic(proj);
                break;
            }
        }

        // 3. ตรวจจับความสำเร็จสำคัญ
        if (/(แก้บั๊กได้|deploy ผ่าน|ส่งงานแล้ว|ทำสำเร็จ|เสร็จแล้ว|ได้เลื่อนขั้น)/i.test(message)) {
            this.addEvent(`ทำสำเร็จ: "${message.substring(0, 50)}"`, 0.95, 'user_explicit');
        }

        // 4. ตรวจจับความชอบอาหาร
        if (/(ชอบกิน|ชอบทาน|ของโปรดคือ)\s*([a-zA-Zก-๙0-9_ ]{2,20})/i.test(message)) {
            const m = message.match(/(?:ชอบกิน|ชอบทาน|ของโปรดคือ)\s*([a-zA-Zก-๙0-9_ ]{2,20})/i);
            if (m && m[1]) this.addPreference('food', m[1].trim());
        }

        // 5. สิ่งที่ไม่ชอบ
        if (/(ไม่ชอบให้|อย่าเรียก|ห้ามพูด|ไม่ชอบเวลา)\s*([a-zA-Zก-๙0-9_ ]{2,25})/i.test(message)) {
            const m = message.match(/(?:ไม่ชอบให้|อย่าเรียก|ห้ามพูด|ไม่ชอบเวลา)\s*([a-zA-Zก-๙0-9_ ]{2,25})/i);
            if (m && m[1]) this.addDislike(m[1].trim());
        }

        // 6. งานอดิเรก & เพลง
        const hobby = message.match(/(?:ชอบเล่น|ชอบดู|ชอบไป|งานอดิเรก(?:คือ)?)\s*([a-zA-Zก-๙0-9_ ]{2,20})/i);
        if (hobby) this.addPreference('hobbies', this.cleanPhrase(hobby[1]));
        const music = message.match(/(?:ชอบฟัง|เพลงโปรด(?:คือ)?|ชอบเพลง)\s*([a-zA-Zก-๙0-9_ ]{2,25})/i);
        if (music) this.addPreference('music', this.cleanPhrase(music[1]));

        // 7. วันเกิด / ที่เรียน / ที่ทำงาน / คนสำคัญ → เก็บเป็นข้อเท็จจริง
        const birthday = message.match(/วันเกิด(?:เรา|ผม|ฉัน)?(?:คือ|วันที่)?\s*([0-9]{1,2}\s*[a-zA-Zก-๙.]+|[0-9]{1,2}\/[0-9]{1,2})/i);
        if (birthday) this.setFact('birthday', `วันเกิด: ${birthday[1].trim()}`);
        const study = message.match(/(?:เรียน(?:อยู่)?ที่|เรียนอยู่)\s*([a-zA-Zก-๙0-9_ .]{2,30})/i);
        if (study) this.setFact('study', `เรียนที่: ${this.cleanPhrase(study[1])}`);
        const work = message.match(/(?:ทำงาน(?:อยู่)?ที่|ทำงานเป็น|อาชีพ(?:คือ)?)\s*([a-zA-Zก-๙0-9_ .]{2,30})/i);
        if (work) this.setFact('work', `งาน: ${this.cleanPhrase(work[1])}`);
        const person = message.match(/(แฟน|แม่|พ่อ|พี่|น้อง|เพื่อนสนิท)(?:เรา|ผม|ฉัน)?ชื่อ\s*([a-zA-Zก-๙0-9_]{2,20})/i);
        if (person) this.setFact(`person_${person[1]}`, `${person[1]}ชื่อ ${this.cleanName(person[2])}`);
    }

    /**
     * ให้ AI อ่านแชทล่าสุดแล้วสรุปสิ่งที่ควรจำ (เพิ่ม/ลบ) — จำได้มากกว่าการจับคำแบบตายตัว
     */
    async learnFromChat(llmService, messages) {
        if (!this.settings.allowLongTerm || !llmService) return false;
        const lt = this.data.longTerm;
        const known = lt.aiFacts || [];
        const name = this.getUserName();
        const chat = messages
            .filter(m => !m.format || m.format === 'text')
            .slice(-16)
            .map(m => `${m.type === 'sent' ? name : 'โม'}: ${m.text}`)
            .join('\n');

        const prompt = `คุณช่วยจดความจำให้ "โม" (AI) เกี่ยวกับ "${name}" (ผู้ใช้)
ความจำที่มีอยู่แล้ว (ลำดับเลข):
${known.length ? known.map((f, i) => `${i}. ${f}`).join('\n') : '(ยังไม่มี)'}

แชทล่าสุด:
${chat}

ดึงเฉพาะเรื่องเกี่ยวกับ ${name} ที่ควรจำระยะยาวและ ${name} พูดเองชัดเจน: งาน/โปรเจกต์ที่ทำอยู่ ปัญหาที่กำลังเจอ คนรอบตัว แผน/นัด ความชอบ ไม่ชอบ เหตุการณ์สำคัญ อารมณ์ช่วงนี้
- ห้ามจดเรื่องของโม ห้ามเดา ห้ามซ้ำกับที่มีอยู่ เขียนสั้นๆ ประโยคละเรื่อง ภาษาไทย
- ถ้าความจำเดิมข้อไหนไม่จริงแล้ว/มีข้อมูลใหม่แทน ให้ใส่เลขข้อนั้นใน remove
ตอบ JSON เท่านั้น: {"add": ["..."], "remove": [เลข]}  ไม่มีอะไรใหม่ก็ {"add": [], "remove": []}`;

        const result = await llmService.completeJSON(prompt);
        const remove = new Set((result.remove || []).filter(Number.isInteger));
        const add = (result.add || []).filter(f => typeof f === 'string' && f.trim()).map(f => f.trim().slice(0, 120));
        if (!remove.size && !add.length) return false;

        lt.aiFacts = [...known.filter((_, i) => !remove.has(i)), ...add].slice(-40);
        this.save();
        return true;
    }

    /**
     * สรุปแชทเก่าที่หลุดจากหน้าต่างแชทที่ AI เห็น (เก็บต่อยอดจากสรุปเดิม)
     * keepRecent = จำนวนข้อความล่าสุดที่ AI เห็นอยู่แล้ว ไม่ต้องสรุป
     */
    async summarizeOldChat(llmService, messages, keepRecent = 14) {
        const prev = this.data.chatSummary || { text: '', upTo: 0 };
        const older = messages.slice(0, -keepRecent).filter(m => m.timestamp > prev.upTo);
        if (older.length < 8) return false;

        const name = this.getUserName();
        const lines = older
            .map(m => {
                const who = m.type === 'sent' ? name : 'โม';
                if (m.format === 'image') return `${who}: [ส่งรูป]`;
                if (m.format === 'reel') return `${who}: [ส่งคลิป ${m.extra && m.extra.title ? m.extra.title : ''}]`;
                if (m.format === 'transfer') return `${who}: [โอนเงิน ฿${m.extra ? m.extra.amount : ''}]`;
                return m.text ? `${who}: ${m.text}` : null;
            })
            .filter(Boolean)
            .slice(-60)
            .join('\n');

        const prompt = `สรุปบทสนทนาระหว่าง "${name}" กับ "โม" ให้โมใช้จำว่าคุยอะไรกันไปแล้ว
สรุปเดิม: ${prev.text || '(ยังไม่มี)'}

แชทใหม่ที่ต้องรวมเข้าไป:
${lines}

เขียนสรุปรวมใหม่ (รวมของเดิม) ไม่เกิน 8 บรรทัด ภาษาไทยสั้นๆ: เรื่องที่คุย สิ่งที่ค้างไว้ สัญญา/นัดที่พูดถึง อารมณ์ของ ${name} เน้นเรื่องล่าสุดมากกว่า ไม่ต้องจดรายละเอียดเล็กๆ
ตอบ JSON: {"summary": "..."}`;

        const result = await llmService.completeJSON(prompt);
        if (!result || typeof result.summary !== 'string' || !result.summary.trim()) return false;
        this.data.chatSummary = { text: result.summary.trim().slice(0, 1200), upTo: older[older.length - 1].timestamp };
        this.save();
        return true;
    }

    /**
     * ตัดคำลงท้ายที่ติดมากับชื่อ เช่น "เจ็ทนะครับ" → "เจ็ท"
     */
    cleanName(raw) {
        return raw.trim().replace(/(นะ|น้า|ครับ|คับ|ค่ะ|คะ|จ้า|จ้ะ|เด้อ|เลย|อะ|อ่ะ|แหละ)+$/u, '');
    }

    cleanPhrase(raw) {
        return this.cleanName(raw.trim().split(/\s+(?:แล้ว|และ|แต่|เพราะ)/)[0]);
    }

    /**
     * เก็บข้อเท็จจริงแบบมี key (ข้อมูลใหม่แทนที่ของเดิม)
     */
    setFact(key, text) {
        if (!this.settings.allowLongTerm) return;
        const facts = this.data.longTerm.keyedFacts || (this.data.longTerm.keyedFacts = {});
        if (facts[key] === text) return;
        facts[key] = text;
        this.addEvent(`เล่าว่า ${text}`, 0.9, 'user_explicit');
        this.save();
    }

    /**
     * เลือกเรื่องเก่ามาชวนคุย (ไม่แต่งเรื่องเพิ่ม ใช้แค่สิ่งที่ผู้ใช้เคยบอก)
     */
    getRecallTopic() {
        const lt = this.data.longTerm;
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];
        const options = [];
        if (lt.projects.length) options.push({ type: 'project', value: pick(lt.projects) });
        if (lt.preferences.food.length) options.push({ type: 'food', value: pick(lt.preferences.food) });
        if (lt.preferences.hobbies?.length) options.push({ type: 'hobby', value: pick(lt.preferences.hobbies) });
        if (lt.preferences.music?.length) options.push({ type: 'music', value: pick(lt.preferences.music) });
        if (lt.keyedFacts?.work) options.push({ type: 'work', value: lt.keyedFacts.work.replace('งาน: ', '') });
        if (lt.keyedFacts?.study) options.push({ type: 'study', value: lt.keyedFacts.study.replace('เรียนที่: ', '') });
        return options.length ? pick(options) : null;
    }

    // ==========================================
    // Interaction & Stats Helpers
    // ==========================================

    recordFirstMeet() {
        if (!this.data.firstMeet) {
            this.data.firstMeet = Date.now();
            this.save();
        }
    }

    updateLastChat() {
        this.data.lastChat = Date.now();
        this.save();
    }

    getDaysKnown() {
        if (!this.data.firstMeet) return 0;
        const diff = Date.now() - this.data.firstMeet;
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    increaseAffection(amount = 1) {
        this.data.relationship.affection = Math.min(100, this.data.relationship.affection + amount);
        const level = Math.floor(this.data.relationship.affection / 20) + 1;
        this.data.relationship.level = Math.min(5, level);
        this.save();
    }

    getRelationshipStatus() {
        const level = this.data.relationship.level;
        const statuses = ['เพื่อนใหม่', 'เพื่อนสนิท', 'คนรู้ใจ', 'คนพิเศษ 💕', 'คู่ใจที่รู้ใจที่สุด ✨'];
        return statuses[Math.min(level - 1, statuses.length - 1)];
    }

    incrementMessages() {
        this.stats.totalMessages++;
        const today = new Date().toDateString();
        if (this.stats.lastActiveDate !== today) {
            if (this.stats.lastActiveDate === new Date(Date.now() - 86400000).toDateString()) {
                this.stats.currentStreak++;
            } else {
                this.stats.currentStreak = 1;
            }
            this.stats.longestStreak = Math.max(this.stats.longestStreak, this.stats.currentStreak);
            this.stats.lastActiveDate = today;
        }
        this.saveStats();
    }

    incrementCalls() {
        this.stats.totalCalls++;
        this.saveStats();
    }

    saveChatHistory(messages) {
        try {
            const toSave = messages.slice(-200);
            localStorage.setItem(this.chatHistoryKey, JSON.stringify(toSave));
        } catch (e) {
            console.warn('Could not save chat history:', e);
        }
    }

    loadChatHistory() {
        try {
            const saved = localStorage.getItem(this.chatHistoryKey);
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return [];
    }

    // ==========================================
    // D. User Controls (ดู, ลบ, แก้ไข)
    // ==========================================

    deleteEvent(eventId) {
        this.data.events = this.data.events.filter(e => e.id !== eventId);
        this.save();
    }

    deleteFact(type, item) {
        if (type === 'project') {
            this.data.longTerm.projects = this.data.longTerm.projects.filter(p => p !== item);
        } else if (type === 'food') {
            this.data.longTerm.preferences.food = this.data.longTerm.preferences.food.filter(f => f !== item);
        } else if (type === 'dislike') {
            this.data.longTerm.dislikes = this.data.longTerm.dislikes.filter(d => d !== item);
        }
        this.save();
    }

    clearAll() {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.chatHistoryKey);
        localStorage.removeItem(this.statsKey);
        this.data = this.load();
        const presetName = window.MO_PROFILE && window.MO_PROFILE.userName;
        if (presetName) this.data.longTerm.userName = presetName;
        this.stats = this.loadStats();
        this.shortTermContext = {
            currentTopic: null,
            recentTopics: [],
            lastUserIntent: null,
            activeProject: null,
        };
    }

    getSummary() {
        // จัดรวมข้อมูลให้ UI นำไปแสดงผลอย่างเป็นหมวดหมู่
        const facts = [];
        if (this.data.longTerm.userName) facts.push(`ชื่อ: ${this.data.longTerm.userName}`);
        if (this.data.longTerm.projects.length) facts.push(`โปรเจกต์: ${this.data.longTerm.projects.join(', ')}`);
        if (this.data.longTerm.preferences.food.length) facts.push(`ของกินที่ชอบ: ${this.data.longTerm.preferences.food.join(', ')}`);
        if (this.data.longTerm.preferences.hobbies?.length) facts.push(`งานอดิเรก: ${this.data.longTerm.preferences.hobbies.join(', ')}`);
        if (this.data.longTerm.preferences.music?.length) facts.push(`เพลงที่ชอบ: ${this.data.longTerm.preferences.music.join(', ')}`);
        if (this.data.longTerm.dislikes.length) facts.push(`สิ่งที่ไม่ชอบ: ${this.data.longTerm.dislikes.join(', ')}`);
        facts.push(...Object.values(this.data.longTerm.keyedFacts || {}));
        facts.push(...(this.data.longTerm.aiFacts || []).slice(-20));

        return {
            facts: facts,
            chatSummary: this.data.chatSummary ? this.data.chatSummary.text : '',
            userName: this.getUserName(),
            longTerm: this.data.longTerm,
            events: this.data.events,
            daysKnown: this.getDaysKnown(),
            affection: this.data.relationship.affection,
            level: this.data.relationship.level,
            status: this.getRelationshipStatus(),
            stats: this.stats,
            settings: this.settings,
            shortTerm: this.shortTermContext
        };
    }
}

// Export
window.MoMemory = MoMemory;
