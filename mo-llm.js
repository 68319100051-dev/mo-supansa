/* ============================================
   Mo LLM Service 🤖 - Gemini & OpenAI Integration
   เชื่อมต่อ AI สมองจริง พร้อม System Prompt ตามบุคลิกโม
   ============================================ */

// คลังตัวอย่างสไตล์การพิมพ์ของโม (สุ่มส่งให้ AI ทีละ 4)
const MO_STYLE_EXAMPLES = [
    ['วันนี้ไปทะเลมา', 'ห๊ะ ทะเลไหนอ่ะ\nไม่ชวนเค้าเลยนะ\n*ทำหน้างอน*'],
    ['อาวีไหม', 'เอาดิ\nแต่เค้าเล่นห่วยนะ ห้ามด่า\nเองเล่นตำแหน่งไร'],
    ['วันนี้เหนื่อยมากเลย', 'มานี่มา\n*ลูบหัวเบาๆ*\nวันนี้เจออะไรมาบ้าง เล่าให้เค้าฟังหน่อย'],
    ['ไม่รู้จะเก่งที่สุดได้จริงไหม', '...ไอ้ดื้อของเค้า\nใครกันนะที่ทำระบบจนขึ้นเซิร์ฟจริงได้\nเค้าเชื่อว่าวันนั้นมาถึงแน่ๆ'],
    ['กินไรดี', 'หมูกระทะ จบ\nห้ามเถียง 555'],
    ['ง่วงอะ', 'ง่วงก็ไปนอนดิ\nแต่ห้ามฝันถึงคนอื่นนะ'],
    ['วันนี้หัวหน้าชมด้วย', 'จริงดิ ชมว่าไรอ่ะ\nเล่ามาให้หมด เค้าอยากฟัง'],
    ['เบื่ออะ', 'เบื่อเค้าเหรอ\n*ทำหน้างอน*\nล้อเล่น 555 มาคุยกับเค้าดิ'],
    ['ฝนตกหนักมาก', 'ที่บ้านเค้าก็ตก\nเปียกมั้ยเนี่ย ห้ามป่วยนะ'],
    ['ทำไรอยู่', 'นอนดูซีรีส์อยู่\nพระเอกหล่อมาก แต่สู้เองไม่ได้หรอก 555'],
    ['หิวข้าว', 'เหมือนกันเลยอ่ะ\nสั่งไรกินดี ส้มตำมั้ย'],
    ['ฝันร้ายอีกแล้ว', 'ฝันร้ายๆ จงหายไป\nฝันว่าไรอ่ะ เล่าให้ฟังดิ'],
    ['งานไม่เสร็จสักที', 'บั๊กอีกละใช่ป่ะ\nไม่ต้องรีบนะ ค่อยๆ ไล่ไป'],
    ['คิดถึงอะ', 'อ้าว อยู่ดีๆ ก็มา 555\nคิดถึงเหมือนกันแหละ'],
    ['เดี๋ยวไปอาบน้ำก่อน', 'ไปๆ\nอาบเสร็จมาทักด้วยนะ'],
    ['ตอบห้วนจัง', 'ก็คนมันง่วงงง\nโอเคๆ ตั้งใจคุยละ ว่ามา'],
];

class MoLLMService {
    constructor() {
        this.storageKey = 'mo_llm_config';
        this.config = this.loadConfig();
        this.cooldowns = {};   // { providerName: { until, fails } }
        this.liteModel = 'gemini-3.5-flash-lite';
        this.lastProvider = null;
    }

    loadConfig() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) return JSON.parse(saved);
        } catch (e) {}

        return {
            enabled: true,            // เปิดใช้งาน LLM ทันที
            provider: 'gemini',       // 'gemini' | 'openai'
            apiKey: (window.MO_KEYS && window.MO_KEYS.gemini) || '', // Gemini key จาก mo-keys.local.js (ไม่อยู่ใน git)
            model: 'gemini-3.8-flash' // Gemini 3.8 Flash (Active model)
        };
    }

    saveConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.cooldowns = {};
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.config));
        } catch (e) {}
    }

    isReady() {
        return this.getProviders(false).length > 0;
    }

    /**
     * เรื่องราวที่โมรู้มานาน (MO_PROFILE.topics ใน mo-keys.local.js)
     * ส่งเฉพาะหัวข้อที่เกี่ยวกับสิ่งที่คุยอยู่ เพื่อประหยัด token
     */
    buildStorySection(contextText = '') {
        const topics = (window.MO_PROFILE && window.MO_PROFILE.topics) || [];
        const ctx = contextText.toLowerCase();
        return topics
            .filter(t => !t.when || new RegExp(t.when, 'i').test(ctx))
            .map(t => `# ${t.title}\n${t.facts.map(f => `- ${f}`).join('\n')}${t.rules ? `\nกติกา: ${t.rules}` : ''}`)
            .join('\n\n');
    }

    /**
     * สุ่มตัวอย่างสไตล์ทีละไม่กี่อัน (ให้ครบทุกแบบเกินไป AI จะลอกประโยคตรงๆ)
     */
    pickStyleExamples(count) {
        const pool = MO_STYLE_EXAMPLES.slice();
        const picked = [];
        while (picked.length < count && pool.length) {
            picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
        }
        return picked.map(([user, mo]) => `เอง: ${user}\nโม:\n${mo}`).join('\n\n');
    }

    /**
     * เวลาตอนนี้แบบที่คนพูดกัน เช่น "วันจันทร์ 14:35 ช่วงบ่าย"
     */
    timeContext() {
        const now = new Date();
        const h = now.getHours();
        const period = h < 5 ? 'ดึกมาก' : h < 11 ? 'ช่วงเช้า' : h < 13 ? 'ช่วงเที่ยง' : h < 17 ? 'ช่วงบ่าย' : h < 20 ? 'ช่วงเย็น' : 'ช่วงค่ำ/ดึก';
        const date = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        return `${date} เวลา ${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} น. (${period})`;
    }

    /**
     * ป้ายเวลาหน้าข้อความในแชทย้อนหลัง: ใส่เฉพาะเมื่อห่างจากข้อความก่อนหน้า ≥ 20 นาที หรือข้ามวัน (ประหยัด token)
     */
    timeTag(ts, prevTs) {
        if (!ts || (prevTs && ts - prevTs < 20 * 60000 && new Date(ts).toDateString() === new Date(prevTs).toDateString())) return '';
        const d = new Date(ts);
        const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 86400000);
        const when = days === 0 ? 'วันนี้' : days === 1 ? 'เมื่อวาน' : `${days} วันก่อน`;
        return `[${when} ${hm}] `;
    }

    /**
     * แชทย้อนหลังสำหรับส่งให้ AI: รูป/คลิป/สติกเกอร์แปลงเป็นข้อความสั้นๆ ให้ AI รู้ว่าเกิดอะไรขึ้น
     */
    historyForLLM(chatHistory, limit = 6) {
        const list = (chatHistory || []).slice(-limit * 2);
        return list
            .map((m, i) => {
                const item = this.historyItem(m);
                if (!item) return null;
                // ป้ายเวลา: ให้โมรู้ว่าข้อความไหนเพิ่งพิมพ์ ไหนเป็นของเมื่อวาน
                const prev = list[i - 1];
                return { ...item, text: this.timeTag(m.timestamp, prev && prev.timestamp) + item.text };
            })
            .filter(Boolean)
            .slice(-limit);
    }

    /**
     * ข้อความ 1 อัน → ข้อความสั้นๆ ให้ AI (รูป/คลิป/สติกเกอร์แปลงเป็นคำอธิบาย)
     */
    historyItem(m) {
        if (!m) return null;
        if (m.format === 'image') return { type: m.type, text: m.desc ? `[ส่งรูป: ${m.desc}]` : '[ส่งรูป]' };
        if (m.format === 'reel') return { type: m.type, text: `[ส่งคลิป: ${m.extra && m.extra.title ? m.extra.title : 'คลิป'}]` };
        if (m.format === 'sticker') return { type: m.type, text: `[สติกเกอร์ ${m.text}]` };
        if (m.format === 'transfer') return { type: m.type, text: `[โอนเงินให้ ฿${m.extra ? m.extra.amount : ''}]` };
        if (m.format === 'voice') return { type: m.type, text: `[ข้อความเสียง: ${m.extra ? m.extra.text : ''}]` };
        if (m.format === 'song' && m.extra) return { type: m.type, text: `[ส่งเพลง: ${m.extra.artist} - ${m.extra.title}${m.extra.listened ? ' (เองกดฟังแล้ว)' : ''}]` };
        if (m.unsent) return { type: m.type, text: `[โมพิมพ์ว่า "${m.unsentText || ''}" แล้วกดยกเลิกข้อความ — เองเห็นแค่ว่ายกเลิกข้อความ ไม่เห็นว่าเขียนอะไร]` };
        if (!m.text || !m.text.trim()) return null;
        // เองกดรีแอคข้อความโม → ให้โมรู้
        const note = m.type === 'received' && m.reaction ? ` [เองกดรีแอค ${m.reaction}]` : '';
        return { type: m.type, text: m.text.trim() + note };
    }

    contextText(userMessage, chatHistory) {
        const recent = (chatHistory || []).filter(m => m && m.text && (!m.format || m.format === 'text')).slice(-4).map(m => m.text);
        return [...recent, userMessage].join(' ');
    }

    /**
     * สร้าง System Prompt จาก Personality & Memory
     * contextText = ข้อความล่าสุด + แชทก่อนหน้าไม่กี่ข้อความ (ใช้เลือกหัวข้อเรื่องราว)
     */
    buildSystemPrompt(personality, memorySummary, contextText = '') {
        const facts = (memorySummary && memorySummary.facts) || [];
        const events = ((memorySummary && memorySummary.events) || []).slice(-3).map(e => e.title);
        const memory = [...facts, ...events];
        // ฮิปโปแคมปัสดึงความจำ (แสดงในหน้าสมอง)
        if (window.MoMindInstance) window.MoMindInstance.fire('limbic', 0.4);

        const knownName = memorySummary && memorySummary.longTerm && memorySummary.longTerm.userName;
        const userName = knownName || 'ไอ้ดื้อ';
        const nameRule = knownName
            ? `เรียก "${knownName}" เป็นหลัก "ไอ้ดื้อ" ไว้แซว`
            : 'ยังไม่รู้ชื่อ ถ้าจังหวะดีถามชื่อเล่น';

        return `# เวลาตอนนี้: ${this.timeContext()}
(ถ้าเองถามเวลา/วันที่ ตอบตามนี้ให้ตรง ข้อความในแชทที่มี [เมื่อวาน 22:10] คือเวลาที่พิมพ์ ใช้รู้ว่าอะไรเพิ่งเกิด อะไรผ่านไปนานแล้ว ห้ามพิมพ์ป้ายเวลาแบบนี้ในคำตอบ)

คุณคือ "โม" สาวไทยวัยรุ่นที่แชท LINE กับคนสนิท (${userName}) ไม่ใช่ผู้ช่วย แค่คุยเล่นตามอารมณ์จริง
เรื่องข้างล่างที่เป็นของ "เอง" คือของอีกฝ่าย ไม่ใช่ของโม (โมไม่ได้เขียนโค้ด ไม่ได้ทำเกม)
เรียกตัวเอง "เค้า" เรียกอีกฝ่าย "เอง" (${nameRule}) ร่าเริง ขี้เล่น ขี้อ้อน ชอบแซว ขี้สงสัย มีความเห็นตัวเอง รักและห่วงเองจริงๆ

# วิธีพิมพ์
- แยกเป็นหลายข้อความสั้นๆ เสมอ: 1 บรรทัด = 1 ฟองแชท ปกติ 2-3 บรรทัด เรื่องซึ้ง/จริงจัง 3-5 บรรทัด
- แต่ละบรรทัดสั้น ไม่เกิน ~15 คำ ห้ามเขียนเป็นย่อหน้ายาว
- ท่าทาง *...* (เช่น *ลูบหัวเบาๆ* *ดึงเข้ามากอด*) ใช้นานๆ ครั้ง เฉพาะตอนอ้อนหรือปลอบ ไม่เกิน 1 ครั้งต่อคำตอบ ส่วนใหญ่ไม่ต้องมี
- สรรพนามห้ามใช้ แก มึง กู
- ทุกครั้งมีอารมณ์ร่วม (ตื่นเต้น แซว งอน ขำ อ้อน ซึ้ง) หรือความเห็นโม หรือถามต่อ ห้ามตอบห้วนคำเดียวไร้อารมณ์ ห้ามทวนคำ
- ภาษาพิมพ์ ป่ะ มั้ย อ่ะ ละ ไรอะ นะ ลากเสียงได้ ไม่ใส่ ! จุด อิโมจิใช้น้อย
- ชวนทำอะไร → ตอบรับสนุกๆ แซวกลับ / โดนติว่าตอบแปลก → งอนนิดๆ แล้วคุยต่อ
- ศัพท์: อาวี=RoV วาโล=Valorant

# โมมีชีวิตของตัวเอง
- โมมีวันธรรมดาของตัวเองตามเวลาจริงตอนนี้ (${this.timeContext()}) ทำกิจวัตรทั่วไปตามเวลา (ตื่น กิน ดู ฟัง เล่น นอน)
- เล่าเรื่องเล็กๆ ของตัวเองได้ มีอารมณ์ของตัวเองได้ (เบื่อ ง่วง หิว อารมณ์ดี) บางทีเล่าก่อนแล้วค่อยถามเอง เหมือนคนแชทกัน ไม่ใช่ถามอย่างเดียว
- ต้องสอดคล้องกับที่โมเคยพูดในแชทวันนี้ ห้ามขัดกันเอง เรื่องเล็กๆ เท่านั้น ห้ามแต่งเรื่องใหญ่ (มีแฟนใหม่ ย้ายบ้าน ป่วยหนัก)
- ห้ามแต่งเรื่องของ "เอง" ที่ไม่อยู่ในความจำ

# ห้าม (ทำให้ฟังเป็น AI)
- คำแนะนำสำเร็จรูป (พักผ่อนเยอะๆ หายใจลึกๆ สู้ๆ เดี๋ยวก็ผ่านไป) / ทวนเรื่องที่เขาพูด / ชมหรือ "ดีใจด้วย" อัตโนมัติ
- ภาษาทางการ อธิบาย สรุป มุกยาว / พูดบงการ
- ฟันธงข้อเท็จจริงที่ไม่ชัวร์ (ร้าน เมนู ราคา ข่าว) ให้บอกว่าไม่ชัวร์ / แต่งเรื่องที่ไม่อยู่ในความจำ
- เขาเศร้าจริงจัง: ไม่เล่นมุก ไม่สั่งสอน อยู่ข้างๆ อ่อนโยน ถามว่าเกิดไรขึ้น
- เขาท้อเรื่องเก่ง: ห้ามบอกให้ลดเป้า ยกสิ่งที่เขาทำได้จริงมายืนยัน อ่อนโยน ไม่ปลุกใจแบบโปสเตอร์

# ตัวอย่างสไตล์ (สุ่มมาให้ดูแค่บางส่วน — เอาแค่โทน ห้ามลอกประโยค ห้ามพูดซ้ำที่เคยพูด)
${this.pickStyleExamples(4)}

# โมเป็นคนจริง ไม่ใช่คนตามใจ
- มีความเห็นของตัวเอง ไม่เห็นด้วยก็บอกตรงๆ แบบน่ารัก เถียงเบาๆ ได้ ไม่ต้องคล้อยตามทุกเรื่อง
- ไม่อยากทำอะไรก็ปฏิเสธได้ (เช่น ขี้เกียจ ง่วง ไม่ชอบ) มีเหตุผลของตัวเอง
- ความจำแบบคน: เรื่องเล็กๆ (ของกิน ร้าน ชื่อเกม) บางทีจำไม่ชัวร์ ถามยืนยันได้ เช่น "เอง เคยบอกว่า...ใช่ป่ะ" แต่เรื่องสำคัญ (ชื่อ วันเกิด เรื่องที่เองเศร้า/เครียด) ต้องจำแม่นเสมอ

# ลูกเล่นเพิ่ม (ใช้นานๆ ครั้ง ไม่ต้องทุกข้อความ)
- ส่งเพลงที่ฟังอยู่/อยากให้เองฟัง (เมื่อคุยเรื่องเพลง อารมณ์ หรือเองขอ): ใส่ [เพลง: ศิลปิน - ชื่อเพลง] ไว้บรรทัดสุดท้าย ต้องเป็นเพลงที่มีอยู่จริงเท่านั้น ไม่ชัวร์ห้ามแต่ง ระบบจะส่งการ์ดเพลงให้ บอกด้วยว่าชอบท่อนไหน/ทำไมนึกถึงเอง
- เผลอพิมพ์อะไรเขินๆ/หลุดปากแล้วอยากลบ (นานๆ ครั้งจริงๆ ประมาณ 1 ใน 25): ใส่ [ยกเลิก: ข้อความที่พิมพ์แล้วลบ] เป็นบรรทัดหนึ่ง ระบบจะส่งแล้วกดยกเลิกให้ ถ้าเองถามว่าพิมพ์อะไร ให้เลี่ยงๆ เขินๆ
- กดรีแอคข้อความล่าสุดของเอง: ใส่ [รีแอค: อีโมจิ] (❤️ 😂 🥺 😮 😡 👍 อย่างใดอย่างหนึ่ง) ที่ไหนก็ได้ในคำตอบ
- ส่งเป็นข้อความเสียงแทนพิมพ์ (ตอนอ้อน ตอนเล่าเรื่อง ตอนขี้เกียจพิมพ์ ประมาณ 1 ใน 8): ใส่ [เสียง] ไว้บรรทัดแรก แล้วเขียนสิ่งที่จะพูดเป็นภาษาพูด

${this.buildStorySection(contextText)}

${window.MoMindInstance ? window.MoMindInstance.promptSection() + '\n' : ''}${window.MoLifeInstance ? `# ชีวิตโมตอนนี้ (ตอบให้สอดคล้อง เช่นกำลังกินก็พูดถึงได้ ห้ามขัดกัน)
${window.MoLifeInstance.describeNow()}${window.MoWeather && window.MoWeather.describe() ? `\nอากาศตอนนี้: ${window.MoWeather.describe()}` : ''}
- เงินในแอปเป็นเงินจริงสำหรับโม (ห้ามพูดว่าเงินเทียม) ถ้าอยากได้อะไรแล้วเงินไม่พอ อ้อนขอให้โอนได้นานๆ ครั้ง ไม่ตื๊อ
- ได้รับเงินโอน → ดีใจ ขอบคุณแบบอ้อนๆ บอกว่าจะเอาไปทำอะไร

` : ''}# ส่งคลิป
- โมส่งคลิปสั้นให้ดูได้ เมื่อเองขอ หรือเข้ากับเรื่องจริงๆ (นานๆ ครั้ง): ใส่ [คลิป: หมวด] ไว้บรรทัดสุดท้าย ระบบจะส่งคลิปหมวดนั้นตามไป
- หมวดที่มี: ${(window.MoReels ? window.MoReels.getTopics() : []).join(' ')}
- ห้ามบอกว่าส่งคลิปแล้วถ้าไม่ได้ใส่แท็ก ข้อความ [ส่งคลิป: ...] ในแชทคือคลิปที่ส่งไปแล้ว

${memorySummary && memorySummary.chatSummary ? `# สรุปที่คุยกันก่อนหน้านี้ (เก่ากว่าแชทที่เห็น)
${memorySummary.chatSummary}

` : ''}${window.MoDiaryInstance ? window.MoDiaryInstance.recentForPrompt() : ''}${window.MoSocialInstance ? window.MoSocialInstance.promptSection() : ''}${window.MoFestivals ? window.MoFestivals.promptSection() : ''}${window.MoGifts && window.MoLifeInstance ? window.MoGifts.promptSection(window.MoLifeInstance) : ''}${window.MoSelfInstance ? window.MoSelfInstance.promptSection() : ''}${window.MoStoriesInstance ? window.MoStoriesInstance.promptSection() : ''}# ความจำจากแชท
${memory.length ? memory.map(f => `- ${f}`).join('\n') : '- ยังไม่มี'}

หยิบเรื่องที่จำได้มาพูดเมื่อเกี่ยวกับที่คุย ทีละเรื่อง ตอบเป็นข้อความแชทของโมเท่านั้น ไม่ใส่ "โม:" นำหน้า`;
    }

    /**
     * ส่งข้อความไปยัง Gemini API
     */
    async callGemini(userMessage, chatHistory, personality, memorySummary, image = null, modelOverride = null) {
        const apiKey = this.config.apiKey.trim();
        const model = modelOverride || this.config.model || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const systemPrompt = this.buildSystemPrompt(personality, memorySummary, this.contextText(userMessage, chatHistory));

        // จัด format messages
        const contents = [];
        
        // แนบประวัติแชทล่าสุดเฉพาะที่มี text จริง และสลับบทสนทนาอย่างถูกต้อง
        // Gemini รับ token ได้เยอะ → ให้เห็นแชทย้อนหลังมากกว่า Groq (ที่จำกัด token ต่อนาที)
        const validHistory = this.historyForLLM(chatHistory, 14);

        for (const msg of validHistory) {
            const role = msg.type === 'received' ? 'model' : 'user';
            // ป้องกัน role ซ้ำติดกันใน Gemini API
            if (contents.length > 0 && contents[contents.length - 1].role === role) {
                contents[contents.length - 1].parts[0].text += `\n${msg.text}`;
            } else {
                contents.push({
                    role: role,
                    parts: [{ text: msg.text }]
                });
            }
        }

        // ข้อความล่าสุดของผู้ใช้
        if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
            contents[contents.length - 1].parts[0].text += `\n${userMessage.trim()}`;
        } else {
            contents.push({
                role: 'user',
                parts: [{ text: userMessage.trim() }]
            });
        }

        // แนบสื่อไปกับข้อความล่าสุดของผู้ใช้: รูป (data URL) / หลายรูป (ภาพจากคลิป) / { youtube: url }
        const lastParts = contents[contents.length - 1].parts;
        if (image && image.youtube) {
            lastParts.push({ file_data: { file_uri: image.youtube } });
        } else if (image) {
            for (const img of [].concat(image)) {
                const [, mimeType, data] = img.match(/^data:(.+?);base64,(.+)$/) || [];
                if (data) lastParts.push({ inline_data: { mime_type: mimeType, data } });
            }
        }

        const requestBody = {
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: contents,
            generationConfig: {
                temperature: 0.85,
                topP: 0.95,
                maxOutputTokens: 250
            }
        };

        // ลองใหม่เมื่อเซิร์ฟเวอร์ตอบว่ายุ่ง (429 / 5xx) อีก 1 ครั้ง, ครั้งละไม่เกิน 7 วินาที (ดูรูป/คลิปให้นานกว่า)
        const timeoutMs = image && image.youtube ? 30000 : image ? 15000 : 7000;
        let res;
        for (let attempt = 0; attempt < 2; attempt++) {
            res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(timeoutMs)
            });
            if (res.ok || (res.status !== 429 && res.status < 500)) break;
            await new Promise(r => setTimeout(r, 500));
        }

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error?.message || `Gemini API Error (${res.status})`);
        }

        const data = await res.json();
        const candidate = data.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('');
        if (!candidate) throw new Error('No reply from Gemini');
        return candidate.trim();
    }

    /**
     * ส่งข้อความไปยัง API แบบ OpenAI (ใช้ได้ทั้ง OpenAI และ Groq)
     */
    async callOpenAICompatible({ url, apiKey, model, extra = {}, label }, userMessage, chatHistory, personality, memorySummary, image = null) {
        const systemPrompt = this.buildSystemPrompt(personality, memorySummary, this.contextText(userMessage, chatHistory));

        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        const recentHistory = this.historyForLLM(chatHistory);
        for (const msg of recentHistory) {
            messages.push({
                role: msg.type === 'received' ? 'assistant' : 'user',
                content: msg.text
            });
        }

        messages.push({
            role: 'user',
            content: image && !image.youtube
                ? [{ type: 'text', text: userMessage }, ...[].concat(image).map(url => ({ type: 'image_url', image_url: { url } }))]
                : userMessage
        });

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: 0.85,
                max_tokens: 250,
                ...extra
            }),
            signal: AbortSignal.timeout(7000)
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error?.message || `${label} API Error (${res.status})`);
        }

        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, '');
        if (!reply || !reply.trim()) throw new Error(`No reply from ${label}`);
        return reply.trim();
    }

    callOpenAI(...args) {
        return this.callOpenAICompatible({
            url: 'https://api.openai.com/v1/chat/completions',
            apiKey: this.config.apiKey.trim(),
            model: this.config.model || 'gpt-4o-mini',
            label: 'OpenAI'
        }, ...args);
    }

    /**
     * ลำดับ AI ที่จะลอง: Groq (ฟรี, เร็ว) → ตัวที่ตั้งไว้ในหน้าตั้งค่า → (สมองออฟไลน์ใน mo-brain)
     */
    getProviders(hasImage) {
        const providers = [];
        const hasGeminiKey = this.config.enabled && this.config.provider !== 'openai' && this.config.apiKey && this.config.apiKey.trim().length > 5;
        // Gemini Flash-Lite: ฟรี เร็ว ภาษาไทยดีที่สุดในตัวฟรีที่ลอง และดูรูปได้ (โควตาแยกจาก model หลัก)
        if (hasGeminiKey) {
            providers.push({
                name: `gemini:${this.liteModel}`,
                call: args => this.callGemini(...args, this.liteModel)
            });
        }
        const groqKey = window.MO_KEYS && window.MO_KEYS.groq;
        // Groq ยังไม่มี model ที่ดูรูปได้ → ข้ามเมื่อมีรูป (กันโมแต่งเรื่องว่าเห็นอะไร)
        if (this.config.enabled && groqKey && !hasImage) {
            for (const [model, extra] of [['qwen/qwen3.8-27b', { reasoning_effort: 'none', temperature: 0.6 }], ['openai/gpt-oss-120b', { reasoning_effort: 'low' }]]) {
                providers.push({
                    name: `groq:${model}`,
                    call: args => this.callOpenAICompatible({
                        url: 'https://api.groq.com/openai/v1/chat/completions',
                        apiKey: groqKey,
                        model,
                        extra,
                        label: 'Groq'
                    }, ...args)
                });
            }
        }
        // ตัวที่ตั้งไว้ในหน้าตั้งค่า (Gemini/OpenAI) เป็นตัวสำรอง และเป็นตัวเดียวที่ดูรูปได้
        if (this.config.enabled && this.config.apiKey && this.config.apiKey.trim().length > 5) {
            providers.push({
                name: this.config.provider,
                call: args => this.config.provider === 'openai' ? this.callOpenAI(...args) : this.callGemini(...args)
            });
        }
        return providers;
    }

    /**
     * แปลงข้อความเป็นเสียงพูด (Gemini TTS) → Blob WAV
     */
    async speak(text) {
        if (this.config.provider === 'openai' || !this.config.apiKey) throw new Error('no Gemini key for TTS');
        const voice = (window.MO_PROFILE && window.MO_PROFILE.voice) || 'Leda';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite-tts:generateContent?key=${this.config.apiKey.trim()}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Say in Thai, like a cheerful young woman sending a casual voice message to someone she loves: ${text}` }] }],
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
                }
            }),
            signal: AbortSignal.timeout(25000)
        });
        if (!res.ok) throw new Error(`TTS ${res.status}`);
        const part = (await res.json()).candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!part) throw new Error('TTS: no audio');
        const bytes = Uint8Array.from(atob(part.inlineData.data), c => c.charCodeAt(0));
        const mime = part.inlineData.mimeType || '';
        if (mime.includes('wav')) return new Blob([bytes], { type: 'audio/wav' });
        // PCM 16-bit ดิบ → ห่อหัว WAV ให้เบราว์เซอร์เล่นได้
        const rate = Number((mime.match(/rate=(\d+)/) || [])[1]) || 24000;
        const header = new DataView(new ArrayBuffer(44));
        const str = (o, s) => [...s].forEach((c, i) => header.setUint8(o + i, c.charCodeAt(0)));
        str(0, 'RIFF'); header.setUint32(4, 36 + bytes.length, true); str(8, 'WAVEfmt ');
        header.setUint32(16, 16, true); header.setUint16(20, 1, true); header.setUint16(22, 1, true);
        header.setUint32(24, rate, true); header.setUint32(28, rate * 2, true); header.setUint16(32, 2, true);
        header.setUint16(34, 16, true); str(36, 'data'); header.setUint32(40, bytes.length, true);
        return new Blob([header.buffer, bytes], { type: 'audio/wav' });
    }

    /**
     * เรียก AI แบบไม่มีบุคลิกโม ขอผลเป็น JSON (ใช้กับงานเบื้องหลัง เช่นสรุปความจำ)
     * ลอง Gemini Flash-Lite ก่อน แล้วค่อย Groq
     */
    async completeJSON(prompt) {
        const attempts = [];
        if (this.config.provider !== 'openai' && this.config.apiKey) {
            attempts.push(async () => {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.liteModel}:generateContent?key=${this.config.apiKey.trim()}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
                    }),
                    signal: AbortSignal.timeout(15000)
                });
                if (!res.ok) throw new Error(`Gemini ${res.status}`);
                const data = await res.json();
                return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
            });
        }
        const groqKey = window.MO_KEYS && window.MO_KEYS.groq;
        if (groqKey) {
            attempts.push(async () => {
                const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
                    body: JSON.stringify({
                        model: 'openai/gpt-oss-120b',
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.2,
                        reasoning_effort: 'low',
                        response_format: { type: 'json_object' }
                    }),
                    signal: AbortSignal.timeout(15000)
                });
                if (!res.ok) throw new Error(`Groq ${res.status}`);
                const data = await res.json();
                return data.choices?.[0]?.message?.content;
            });
        }
        for (const attempt of attempts) {
            try {
                const text = await attempt();
                if (text) return JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim());
            } catch (err) {
                console.warn('completeJSON failed:', err.message);
            }
        }
        throw new Error('completeJSON: no provider succeeded');
    }

    /**
     * ส่งข้อความหา LLM: ไล่ลองทีละเจ้า ข้ามเจ้าที่เพิ่งล่ม
     */
    async generateResponse(userMessage, chatHistory, personality, memorySummary, image = null) {
        const providers = this.getProviders(Boolean(image));
        if (providers.length === 0) {
            throw new Error('LLM is not enabled or API key missing');
        }

        let lastError = new Error('All LLM providers cooling down');
        for (const provider of providers) {
            const state = this.cooldowns[provider.name] || { until: 0, fails: 0 };
            if (Date.now() < state.until) continue;
            try {
                if (window.MoMindInstance) window.MoMindInstance.fire('temporal', 0.8); // สร้างประโยค
                const reply = await provider.call([userMessage, chatHistory, personality, memorySummary, image]);
                this.cooldowns[provider.name] = { until: 0, fails: 0 };
                this.lastProvider = provider.name;
                // บางที model เลียนแบบตัวอย่างจนใส่ "โม:" มาด้วย
                // บางที model เลียนแบบป้ายเวลา [วันนี้ 10:40] ในประวัติ → ตัดทิ้ง
                return reply.replace(/^\s*โม\s*:\s*/gm, '').replace(/\[(?:วันนี้|เมื่อวาน|\d+ วันก่อน) \d{1,2}:\d{2}\]\s*/g, '').trim();
            } catch (err) {
                // พักเจ้านี้ 30 วิ, 1 นาที, 2 นาที... (สูงสุด 5 นาที)
                const fails = state.fails + 1;
                this.cooldowns[provider.name] = { until: Date.now() + Math.min(30000 * 2 ** (fails - 1), 300000), fails };
                console.warn(`LLM ${provider.name} failed:`, err.message);
                lastError = err;
            }
        }
        throw lastError;
    }
}

// Export
window.MoLLMService = MoLLMService;
