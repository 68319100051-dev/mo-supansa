/* ============================================
   Mo Chat 💬 - Chat System Manager
   จัดการข้อความ, แสดงผลแชท, stickers
   ============================================ */

class MoChat {
    constructor(brain, memory, llmService = null) {
        this.brain = brain;
        this.memory = memory;
        this.llmService = llmService;
        this.messages = [];
        this.isTyping = false;

        // DOM elements
        this.container = document.getElementById('messages-container');
        this.input = document.getElementById('message-input');
        this.sendBtn = document.getElementById('btn-send');
        this.typingIndicator = document.getElementById('typing-indicator');
        this.chatArea = document.getElementById('chat-area');
        this.stickerPanel = document.getElementById('sticker-panel');
        this.stickerGrid = document.getElementById('sticker-grid');

        // Sticker list
        this.stickers = [
            '❤️', '💕', '😘', '🥰', '😍',
            '😊', '🤗', '😚', '💖', '🫶',
            '🥺', '😭', '😂', '🤣', '😜',
            '👋', '✌️', '🤝', '👍', '💪',
            '🌸', '🌹', '✨', '⭐', '🎀',
            '🎵', '🎶', '🎂', '🧋', '🍰',
        ];

        this.init();
    }

    init() {
        // Load chat history
        this.loadHistory();

        // Setup stickers
        this.setupStickers();

        // Event listeners
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        document.getElementById('btn-sticker').addEventListener('click', () => {
            this.stickerPanel.classList.toggle('hidden');
        });

        // ตอบกลับข้อความ: ปัดขวา (มือถือ) / ดับเบิลคลิก (คอม) / แตะข้อความที่อ้างถึงเพื่อเลื่อนไปดู
        this.replyTo = null;
        this.replyBar = document.getElementById('reply-bar');
        document.getElementById('reply-cancel').addEventListener('click', () => this.clearReply());
        this.setupReplyGestures();

        // ค้นหาแชทเก่า: กดผลลัพธ์เพื่อเลื่อนไปที่ข้อความนั้น
        this.setupSearch();

        // กดค้าง (มือถือ) / คลิกขวา (คอม) ที่ฟอง → รีแอคข้อความโม หรือแก้ไขข้อความของเอง
        this.editing = null;
        this.setupMessageMenu();

        // Close sticker panel when clicking outside
        this.chatArea.addEventListener('click', () => {
            if (!this.stickerPanel.classList.contains('hidden')) {
                this.stickerPanel.classList.add('hidden');
            }
        });

        // Auto scroll to bottom
        this.scrollToBottom();
    }

    /**
     * Setup sticker grid
     */
    setupStickers() {
        // แผง: แท็บสติกเกอร์โม / ล่าสุด / อีโมจิแต่ละหมวด (อีโมจิ = ใส่ลงช่องพิมพ์)
        if (window.MO_STICKERS) {
            const tabs = [['mo', '🐰'], ['recent', '🕘'], ...Object.keys(MO_EMOJI).map(k => [k, k])];
            const panel = this.stickerPanel;
            panel.innerHTML = `<div class="sticker-tabs">${tabs.map(([k, label], i) =>
                `<button class="sticker-tab ${i === 0 ? 'active' : ''}" data-tab="${k}">${label}</button>`).join('')}</div>
                <div class="sticker-grid" id="sticker-grid"></div>`;
            this.stickerGrid = panel.querySelector('#sticker-grid');
            const show = (tab) => {
                panel.querySelectorAll('.sticker-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
                const isEmoji = Boolean(MO_EMOJI[tab]);
                this.stickerGrid.className = `sticker-grid ${isEmoji ? 'emoji-grid' : 'pack-grid'}`;
                const ids = tab === 'recent' ? MoStickers.recent() : MO_STICKERS.map(s => s.id);
                this.stickerGrid.innerHTML = isEmoji
                    ? MO_EMOJI[tab].map(e => `<button class="emoji-item" data-emoji="${e}">${e}</button>`).join('')
                    : ids.map(id => MoStickers.byId(id)).filter(Boolean).map(s =>
                        `<button class="sticker-item pack" data-sticker="${s.id}"><span>${s.e}</span><small>${s.t}</small></button>`).join('')
                        || '<p class="sticker-empty">ยังไม่มีสติกเกอร์ที่ใช้ล่าสุด</p>';
            };
            panel.addEventListener('click', (e) => {
                e.stopPropagation();
                const tab = e.target.closest('.sticker-tab');
                if (tab) return show(tab.dataset.tab);
                const emoji = e.target.closest('[data-emoji]');
                if (emoji) {
                    this.input.value += emoji.dataset.emoji;
                    this.input.dispatchEvent(new Event('input'));
                    return;
                }
                const st = e.target.closest('[data-sticker]');
                if (st) {
                    MoStickers.remember(st.dataset.sticker);
                    this.stickerPanel.classList.add('hidden');
                    this.sendSticker(MoStickers.byId(st.dataset.sticker));
                }
            });
            show('mo');
            return;
        }
        this.stickerGrid.innerHTML = '';
        this.stickers.forEach(sticker => {
            const btn = document.createElement('button');
            btn.className = 'sticker-item';
            btn.textContent = sticker;
            btn.addEventListener('click', () => {
                this.sendSticker(sticker);
                this.stickerPanel.classList.add('hidden');
            });
            this.stickerGrid.appendChild(btn);
        });
    }

    /**
     * Load chat history from memory
     */
    loadHistory() {
        const history = this.memory.loadChatHistory();
        if (history.length > 0) {
            this.messages = history;
            this.renderAllMessages();
        }
    }

    /**
     * Save current chat to memory
     */
    saveHistory() {
        this.memory.saveChatHistory(this.messages);
    }

    /**
     * Send a user message
     */
    sendMessage() {
        const text = this.input.value.trim();
        if (this.editing) return text && this.applyEdit(text);
        if (!text || this.isTyping) return;

        // Add user message (พร้อมข้อความที่ตอบกลับ ถ้ามี)
        const replyTo = this.replyTo;
        this.mind && this.mind.perceive(text);
        // งอนค้าง: เองพูดแรง/เมินนาน → งอน, ขอโทษ → ค่อยๆ หาย
        const ignoredH = this.awaitingReply && this.awaitingSince ? (Date.now() - this.awaitingSince) / 3600000 : 0;
        const feeling = this.self ? this.self.feel(text, ignoredH) : null;
        const feelNote = feeling === 'forgiven' ? '[ข้อความระบบ: เองง้อแล้ว โมหายงอนแล้ว แต่ยังแอบแซวได้นิดนึง แล้วกลับมาอ้อนเหมือนเดิม]\n'
            : feeling === 'softening' ? '[ข้อความระบบ: เองขอโทษแล้ว โมใจอ่อนลงนิดนึงแต่ยังไม่หายสนิท]\n' : '';
        const sulkNote = this.sulkNote() + feelNote + this.userMoodNote(text) + this.unwatchedReelNote();
        this.awaitingReply = false;

        // ลิงก์ YouTube → ส่งเป็นคลิปให้โมดู
        const ytId = window.MoReelsManager && MoReelsManager.parseYouTube(text);
        if (ytId) {
            this.input.value = '';
            this.clearReply();
            const caption = text.replace(/\S*(?:youtube\.com|youtu\.be)\S*/gi, '').trim();
            this.sendYouTube(ytId, caption);
            return;
        }
        this.addMessage('sent', text, 'text', null, replyTo);
        this.input.value = '';
        this.clearReply();

        // Memory: extract facts, update stats
        this.memory.extractFacts(text);
        // โมสังเกตเรื่องที่ควรห่วง (ป่วย กินข้าว นอนดึก เครียด ออกไปข้างนอก)
        if (this.care) this.care.observe(text);
        // กิจวัตรประจำ (เช่น เข้างาน 8 โมงทุกวัน) → โมจำและวางแผนทักเองเบื้องหลัง
        if (this.routines) this.routines.learn(text).then(added => {
            if (added && added.length && this.mind) this.mind.decide(`จำกิจวัตรของเอง: ${added.map(r => r.what).join(', ')}`);
        });
        this.memory.incrementMessages();
        this.memory.updateLastChat();
        this.memory.increaseAffection(1);

        // เร่งให้กลับบ้าน (โมอยู่ข้างนอก) → โมยอมรีบกลับจริงในชีวิตโม แล้วตอบตามนั้น
        let homeNote = '';
        if (this.life && /กลับบ้าน|รีบกลับ|กลับมาได้แล้ว|กลับได้แล้ว|มาหาหน่อย|อย่าเพิ่งเที่ยว/.test(text)) {
            const r = this.life.hurryHome();
            if (r.ok) {
                this.mind && this.mind.decide(`เองเร่งให้กลับบ้าน → รีบกลับจาก${r.from}`);
                homeNote = `[ข้อความระบบ: เองเร่งให้โมกลับบ้าน — โมยอมกลับแล้ว ตอนนี้${r.already ? 'อยู่บนรถอยู่แล้ว' : `เพิ่งออกจาก${r.from}`} อีกประมาณ ${r.eta} นาทีถึงบ้าน ตอบตามนี้ (อาจบ่นนิดๆ หรือถามว่ามีอะไรรึเปล่า)]\n`;
            }
        }
        // ขอให้หยุดสิ่งที่ทำอยู่แล้วมาคุยกันก่อน → โมหยุดจริงในชีวิตโม (หรือขอรอแป๊บ)
        if (this.life && !homeNote && /หยุด.{0,12}(?:ก่อน|มาคุย)|มาคุยกัน(?:ก่อน)?|วาง.{0,10}ก่อน|พักก่อน|ว่างคุยมั้ย|ว่างคุยไหม|คุยกับเค้าก่อน|คุยกับเราก่อน|สนใจเค้าหน่อย|สนใจเราหน่อย/.test(text)) {
            const r = this.life.callToChat(window.MoPsycheInstance ? window.MoPsycheInstance.data.autonomy : 2);
            if (r.ok && !r.already) {
                this.mind && this.mind.decide(r.wait ? `เองชวนคุย ขอ${r.from}อีก ${r.wait} นาที` : `หยุด${r.from}มาคุยกับเอง`);
                homeNote = r.wait
                    ? `[ข้อความระบบ: เองขอให้หยุด${r.from}มาคุยกันก่อน — โมกำลังติดอยู่ ขออีกประมาณ ${r.wait} นาทีแล้วจะมาคุยเต็มที่ บอกแบบอ้อนๆ ไม่ใช่ปฏิเสธ]
`
                    : `[ข้อความระบบ: เองขอให้หยุด${r.from}มาคุยกันก่อน — โมหยุดแล้ว วางสิ่งที่ทำอยู่ ถือมือถือมาคุยเต็มที่ บอกแบบเต็มใจ (อาจบ่นนิดๆ ว่ากำลังสนุกอยู่เลย)]
`;
            }
        }
        // นัดกันแล้ว: ส่งข้อความหลังเวลานัด = มาตามนัด
        if (this.dateWaiting) this.dateWaiting = null;

        // ถามสถานะหลังบ้าน → โมไล่เช็คระบบจริงแล้วรายงาน (ไม่ใช้ AI ตอบ)
        if (window.MoStatus && this.statusContext && MoStatus.isAsking(text)) {
            this.queueReply(() => this.reportStatus());
            return;
        }

        // ขอให้เตือน → โมรับเรื่องแทนการคุยปกติ
        const reminder = this.reminders && this.reminders.parse(text);
        if (reminder) {
            const confirm = this.reminders.confirmMessage(reminder);
            this.queueReply(() => {
                this.showTyping();
                setTimeout(() => {
                    this.hideTyping();
                    this.addMessage('received', confirm);
                }, 900);
            });
            return;
        }

        // ขอให้เตือนแต่อ่านเวลาไม่ออก → ให้ AI ช่วยอ่าน (อ่านไม่ได้ก็คุยปกติ)
        if (this.reminders && /เตือน/.test(text) && this.llmService && this.llmService.isReady()) {
            this.queueReply(async note => {
                this.showTyping();
                const r = await this.reminders.parseWithAI(text, this.llmService);
                if (r) {
                    this.hideTyping();
                    this.addMessage('received', this.reminders.confirmMessage(r));
                    return;
                }
                return this.moRespond(note + sulkNote + text);
            });
            return;
        }

        // Mo thinks and responds — บอกโมด้วยว่าตอบกลับข้อความไหน
        const forMo = sulkNote + (replyTo
            ? `(ตอบกลับข้อความของ${replyTo.type === 'received' ? 'โม' : 'ตัวเอง'}ที่ว่า "${replyTo.text}")\n${text}`
            : text);
        // ถามเวลา/วันที่ → ส่งเวลาจริงจากนาฬิกาเครื่อง ณ วินาทีนั้น ให้ตอบเป๊ะถึงนาที
        let timeNote = '';
        if (/กี่โมง|กี่ทุ่ม|เวลาเท่า|ตอนนี้เวลา|ตีกี่|วันที่เท่า|วันที่อะไร|วันอะไร|วันนี้วันที่|เดือนอะไร|ปีอะไร/.test(text) && this.llmService) {
            const n = new Date();
            const hm = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
            timeNote = `[ข้อความระบบ: นาฬิกาตอนนี้ ${hm} น. (${this.llmService.spokenTime(n.getHours(), n.getMinutes())}) ${n.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} — ถ้าเองถามเวลา/วันที่ ตอบตามนี้ให้ตรงเป๊ะถึงนาที ห้ามปัดเศษ ห้ามเดา]
`;
        }
        const gameNote = (this.games ? this.games.noteFor(text) : '') + homeNote + timeNote;
        this.queueReply(async note => {
            // นึกเรื่องเก่าที่ความหมายใกล้กัน (ไม่เกิน ~2 วิ)
            const recall = window.MoRecall
                ? await Promise.race([MoRecall.noteFor(text, this.messages), new Promise(r => setTimeout(() => r(''), 2500))])
                : '';
            return this.moRespond(note + recall + gameNote + forMo).then(() => this.maybeLearn());
        });
    }

    /**
     * โมงอนไหม: ทักไปแล้วเงียบนาน หรือหายไปทั้งวัน → บอก AI ให้งอนนิดๆ แบบน่ารัก (ต้องเรียกก่อนเพิ่มข้อความใหม่)
     */
    sulkNote() {
        const lastSent = [...this.messages].reverse().find(m => m.type === 'sent');
        const goneH = lastSent ? (Date.now() - lastSent.timestamp) / 3600000 : 0;
        const ignoredH = this.awaitingReply && this.awaitingSince ? (Date.now() - this.awaitingSince) / 3600000 : 0;
        const threshold = this.mind ? this.mind.behavior().sulkThresholdHours : 1.5;
        if (ignoredH >= threshold) {
            this.mind && this.mind.decide(`ทักไป ${ignoredH.toFixed(1)} ชม.แล้วเพิ่งได้คำตอบ → งอนนิดๆ`);
            return `[ข้อความระบบ: โมทักไปตั้งแต่ ${Math.round(ignoredH)} ชม.ที่แล้วแต่เองเพิ่งตอบ — โมงอนนิดๆ แบบน่ารัก แซวว่าอ่านแล้วไม่ตอบ/หายไปไหน แล้วค่อยหายงอนถ้าเองง้อ ห้ามประชดแรง]\n`;
        }
        if (goneH >= 20) {
            return `[ข้อความระบบ: เองหายไป ${goneH >= 48 ? Math.round(goneH / 24) + ' วัน' : 'ทั้งวัน'} ไม่ได้ทักมาเลย — โมคิดถึงและงอนนิดๆ แบบน่ารัก ถามว่าหายไปไหนมา]\n`;
        }
        return '';
    }

    async reportStatus() {
        this.showTyping();
        this.mind && this.mind.decide('เช็คระบบหลังบ้านให้เอง');
        let lines;
        try {
            lines = await MoStatus.report(this.statusContext());
        } catch (e) {
            lines = [`เช็คไม่สำเร็จอ่ะ ${e.message} 🥺`];
        }
        for (let i = 0; i < lines.length; i++) {
            this.hideTyping();
            this.addMessage('received', lines[i]);
            if (i + 1 < lines.length) {
                this.showTyping();
                await new Promise(r => setTimeout(r, 600));
            }
        }
    }

    /**
     * โมสังเกตอารมณ์ของเอง: คำที่ใช้ + ข้อความสั้นผิดปกติ + ตอบห้วนติดกัน (ต้องเรียกก่อนเพิ่มข้อความใหม่)
     */
    userMoodNote(text) {
        const t = text.trim();
        const signals = [];
        const moods = [
            [/เหนื่อย|ล้า|หมดแรง|ไม่ไหว|เพลีย/, 'เหนื่อย', 'ให้กำลังใจ อ่อนโยน ไม่แซวแรง ไม่ชวนทำอะไรเพิ่ม'],
            [/เครียด|กดดัน|กังวล|ปวดหัว|งานเยอะ|โดนด่า/, 'เครียด', 'รับฟังก่อน ถามว่าเกิดอะไรขึ้น ไม่รีบแนะนำ ไม่ทำเป็นเรื่องตลก'],
            [/เศร้า|ร้องไห้|เสียใจ|น้อยใจ|เหงา|ท้อ|แย่มาก|😢|😭|🥺/, 'เศร้า', 'อยู่ข้างๆ ปลอบแบบจริงใจ ไม่เปลี่ยนเรื่อง ห้ามแซว'],
            [/โกรธ|หงุดหงิด|โมโห|รำคาญ|เซ็ง|😡|😤/, 'หงุดหงิด', 'เข้าข้างเองก่อน ให้ระบาย ไม่สอน ไม่ทำเสียงร่าเริงเกิน'],
            [/ดีใจ|เย้|ได้แล้ว|ผ่านแล้ว|สำเร็จ|ปัง|555|😆|🥳/, 'อารมณ์ดี', 'ดีใจด้วยเต็มที่ ถามรายละเอียด ตื่นเต้นไปด้วย'],
        ];
        const hit = moods.find(([re]) => re.test(t));
        if (hit) signals.push(`เองดู${hit[1]} → ${hit[2]}`);

        // ตอบห้วนหลายข้อความติดกัน ทั้งที่ปกติพิมพ์ยาว → อาจไม่โอเค
        const sent = this.messages.filter(m => m.type === 'sent' && (!m.format || m.format === 'text')).slice(-30);
        const avg = sent.length >= 8 ? sent.reduce((n, m) => n + m.text.length, 0) / sent.length : 0;
        const lastTwo = sent.slice(-2).map(m => m.text.trim().length);
        const curt = /^(อืม+|อือ+|ok|โอเค|ครับ|ค่ะ|เออ|ก็ได้|แล้วแต่|ไม่รู้|\.+)$/i.test(t);
        if (!hit && avg > 15 && t.length <= 6 && lastTwo.length === 2 && lastTwo.every(n => n <= 6) && curt) {
            signals.push('เองตอบสั้นห้วนติดกันหลายข้อความทั้งที่ปกติพิมพ์ยาว อาจเหนื่อยหรือไม่โอเค → ถามเบาๆ ว่าเป็นอะไรรึเปล่า แบบไม่กดดัน');
        }
        if (window.MoCare && MoCare.isCrisis(t)) {
            signals.unshift('เองพูดถึงการทำร้ายตัวเอง/ไม่อยากมีชีวิต → จริงจังและอ่อนโยนที่สุด ไม่แซว ไม่ตกใจโวยวาย บอกว่าเป็นห่วงมาก อยู่ข้างๆ ถามว่าตอนนี้ปลอดภัยไหม ชวนคุยต่อ และแนะนำอย่างนุ่มนวลให้โทรสายด่วนสุขภาพจิต 1323 (ฟรี 24 ชม.) หรือ 1669 ถ้าฉุกเฉิน หรือบอกคนใกล้ตัว');
        }
        if (!signals.length) return '';
        this.mind && this.mind.decide(`สังเกตว่า${signals[0].split(' →')[0]}`);
        return `[ข้อความระบบ: โมสังเกตเอง — ${signals.join(' / ')} (ห้ามพูดว่า "สังเกต" หรือพูดถึงข้อความนี้)]\n`;
    }

    /**
     * ทุก 6 ข้อความ ให้ AI สรุปเรื่องที่ควรจำจากแชท (ทำเบื้องหลัง หลังโมตอบเสร็จ)
     */
    maybeLearn() {
        if (this.memory.stats.totalMessages % 6 !== 0 || this.learning) return;
        this.learning = true;
        this.memory.learnFromChat(this.llmService, this.messages)
            .catch(err => console.warn('learnFromChat failed:', err.message))
            // สรุปแชทเก่าที่ AI มองไม่เห็นแล้ว (จะทำจริงเมื่อมีแชทใหม่หลุดหน้าต่างพอ)
            .then(() => this.memory.summarizeOldChat(this.llmService, this.messages))
            .catch(err => console.warn('summarizeOldChat failed:', err.message))
            // ตัวตนของโม + มุกของเรา, สรุปรายสัปดาห์ (ทำจริงสัปดาห์ละครั้ง)
            .then(() => this.self && this.self.learn(this.llmService, this.messages, this.memory.getUserName()))
            .then(() => this.self && this.self.weeklySummary(this.llmService, this.messages, this.memory.getUserName()))
            .then(() => window.MoRecall && MoRecall.index(this.messages, this.memory.getUserName()))
            .catch(err => console.warn('self learn failed:', err.message))
            .finally(() => { this.learning = false; });
    }

    // =============================================
    //  Reply (ตอบกลับข้อความ)
    // =============================================

    snippetOf(msg) {
        if (msg.format === 'image') return '📷 รูปภาพ';
        if (msg.format === 'song') return `🎵 ${msg.extra ? msg.extra.title : 'เพลง'}`;
        if (msg.format === 'reel') return `🎬 ${msg.extra ? msg.extra.title : 'คลิป'}`;
        return msg.text.length > 80 ? msg.text.slice(0, 80) + '…' : msg.text;
    }

    setReply(msgId) {
        const msg = this.messages.find(m => String(m.id) === String(msgId));
        if (!msg) return;
        this.replyTo = { id: msg.id, type: msg.type, text: this.snippetOf(msg) };
        document.getElementById('reply-bar-who').textContent =
            msg.type === 'received' ? 'ตอบกลับโม' : 'ตอบกลับตัวเอง';
        document.getElementById('reply-bar-snippet').textContent = this.replyTo.text;
        this.replyBar.classList.remove('hidden');
        if (navigator.vibrate) navigator.vibrate(15);
        this.input.focus();
    }

    clearReply() {
        this.replyTo = null;
        if (this.editing) this.input.value = '';
        this.editing = null;
        this.replyBar.classList.add('hidden');
    }

    scrollToMessage(msgId) {
        const el = this.container.querySelector(`.message[data-id="${CSS.escape(String(msgId))}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
    }

    setupSearch() {
        const bar = document.getElementById('search-bar');
        const input = document.getElementById('search-input');
        const results = document.getElementById('search-results');
        const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const close = () => {
            bar.classList.add('hidden');
            results.classList.add('hidden');
            input.value = '';
        };

        document.getElementById('btn-search').addEventListener('click', () => {
            if (!bar.classList.contains('hidden')) return close();
            bar.classList.remove('hidden');
            input.focus();
        });
        document.getElementById('search-close').addEventListener('click', close);
        input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

        input.addEventListener('input', () => {
            const q = input.value.trim().toLowerCase();
            if (!q) return results.classList.add('hidden');
            const hits = this.messages
                .filter(m => typeof m.text === 'string' && m.format !== 'sticker' && m.text.toLowerCase().includes(q))
                .slice(-50).reverse();
            results.innerHTML = hits.length
                ? hits.map(m => {
                    const i = m.text.toLowerCase().indexOf(q);
                    const from = Math.max(0, i - 20);
                    const snippet = (from ? '…' : '') + esc(m.text.slice(from, i)) +
                        `<mark>${esc(m.text.slice(i, i + q.length))}</mark>` + esc(m.text.slice(i + q.length, i + q.length + 60));
                    const date = new Date(Math.floor(m.id)).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                    return `<button class="search-hit" data-id="${esc(m.id)}">
                        <span class="search-hit-meta"><strong>${m.type === 'received' ? 'โม' : 'เรา'}</strong> · ${esc(date)} ${esc(m.time || '')}</span>
                        <span class="search-hit-text">${snippet}</span>
                    </button>`;
                }).join('')
                : '<div class="search-empty">ไม่เจอข้อความนี้เลย 🥺</div>';
            results.classList.remove('hidden');
        });

        results.addEventListener('click', (e) => {
            const hit = e.target.closest('.search-hit');
            if (!hit) return;
            results.classList.add('hidden');
            this.scrollToMessage(hit.dataset.id);
        });
    }

    setupMessageMenu() {
        const menu = document.createElement('div');
        menu.className = 'message-menu hidden';
        document.body.appendChild(menu);
        const hide = () => menu.classList.add('hidden');
        const emojis = ['❤️', '😂', '🥺', '😮', '😡', '👍'];

        const open = (msgEl, x, y) => {
            const msg = this.messages.find(m => String(m.id) === msgEl.dataset.id);
            if (!msg) return;
            const isText = (!msg.format || msg.format === 'text') && !msg.unsent;
            const reacts = msg.type === 'received'
                ? `<div class="menu-row">${emojis.map(e => `<button data-react="${e}" class="${msg.reaction === e ? 'active' : ''}">${e}</button>`).join('')}</div>` : '';
            const actions = [
                '<button data-reply="1" class="menu-text">↩️ ตอบกลับ</button>',
                isText ? '<button data-copy="1" class="menu-text">📋 คัดลอก</button>' : '',
                msg.type === 'sent' && isText ? '<button data-edit="1" class="menu-text">✏️ แก้ไข</button>' : '',
            ].join('');
            menu.innerHTML = `${reacts}<div class="menu-row">${actions}</div>`;
            menu.dataset.id = msg.id;
            menu.classList.remove('hidden');
            const w = menu.offsetWidth;
            menu.style.left = `${Math.max(8, Math.min(x - w / 2, innerWidth - w - 8))}px`;
            menu.style.top = `${Math.max(8, y - menu.offsetHeight - 12)}px`;
            if (navigator.vibrate) navigator.vibrate(15);
        };

        this.container.addEventListener('contextmenu', (e) => {
            const msgEl = e.target.closest('.message');
            if (!msgEl || !e.target.closest('.message-bubble')) return;
            e.preventDefault();
            open(msgEl, e.clientX, e.clientY);
        });

        // กดค้าง 450ms (ยกเลิกถ้าเลื่อน/ปัด)
        let press = null;
        this.container.addEventListener('touchstart', (e) => {
            const bubble = e.target.closest('.message-bubble');
            if (!bubble) return;
            const t = e.touches[0];
            press = { x: t.clientX, y: t.clientY, timer: setTimeout(() => {
                press.fired = true;
                open(bubble.closest('.message'), press.x, press.y);
            }, 450) };
        }, { passive: true });
        this.container.addEventListener('touchmove', (e) => {
            if (!press) return;
            const t = e.touches[0];
            if (Math.abs(t.clientX - press.x) > 10 || Math.abs(t.clientY - press.y) > 10) clearTimeout(press.timer);
        }, { passive: true });
        const release = (e) => {
            if (!press) return;
            clearTimeout(press.timer);
            if (press.fired) e.preventDefault(); // ไม่ให้กลายเป็นคลิก/เลือกข้อความ
            press = null;
        };
        this.container.addEventListener('touchend', release);
        this.container.addEventListener('touchcancel', release);

        menu.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            if (btn.dataset.react) this.reactToMo(menu.dataset.id, btn.dataset.react);
            if (btn.dataset.edit) this.startEdit(menu.dataset.id);
            if (btn.dataset.reply) this.setReply(menu.dataset.id);
            if (btn.dataset.copy) {
                const m = this.messages.find(x => String(x.id) === menu.dataset.id);
                if (m && navigator.clipboard) navigator.clipboard.writeText(m.text).then(() => this.showNotification('คัดลอกแล้ว 📋')).catch(() => {});
            }
            hide();
        });
        document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target)) hide(); });
        this.container.addEventListener('scroll', hide, { passive: true });
    }

    /**
     * เองกดรีแอคข้อความของโม (กดซ้ำ = เอาออก) — โมเห็นในแชทย้อนหลังที่ส่งให้ AI
     */
    reactToMo(msgId, emoji) {
        const msg = this.messages.find(m => String(m.id) === String(msgId));
        if (!msg) return;
        msg.reaction = msg.reaction === emoji ? null : emoji;
        if (msg.reaction && this.mind) this.mind.perceive(emoji);
        this.saveHistory();
        const el = this.container.querySelector(`.message[data-id="${CSS.escape(String(msg.id))}"] .message-bubble`);
        if (!el) return;
        let badge = el.parentElement.querySelector('.message-reaction');
        if (!msg.reaction) return badge && badge.remove();
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'message-reaction';
            el.insertAdjacentElement('afterend', badge);
        }
        badge.textContent = msg.reaction;
    }

    startEdit(msgId) {
        const msg = this.messages.find(m => String(m.id) === String(msgId));
        if (!msg || msg.type !== 'sent') return;
        this.replyTo = null;
        this.editing = msg;
        document.getElementById('reply-bar-who').textContent = '✏️ แก้ไขข้อความ';
        document.getElementById('reply-bar-snippet').textContent = msg.text;
        this.replyBar.classList.remove('hidden');
        this.input.value = msg.text;
        this.input.focus();
    }

    applyEdit(text) {
        const msg = this.editing;
        this.clearReply();
        this.input.value = '';
        if (text === msg.text) return;
        msg.text = text;
        msg.edited = true;
        this.saveHistory();
        this.renderAllMessages();
        this.scrollToMessage(msg.id);
        this.memory.extractFacts(text);
        if (this.routines) this.routines.learn(text);
    }

    setupReplyGestures() {
        let start = null;

        this.container.addEventListener('touchstart', (e) => {
            const bubble = e.target.closest('.message-bubble');
            if (!bubble) return;
            start = { x: e.touches[0].clientX, y: e.touches[0].clientY, bubble, dx: 0, locked: null };
        }, { passive: true });

        this.container.addEventListener('touchmove', (e) => {
            if (!start) return;
            const dx = e.touches[0].clientX - start.x;
            const dy = e.touches[0].clientY - start.y;
            if (start.locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
                start.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            }
            if (start.locked !== 'x') return;
            start.dx = Math.max(0, Math.min(dx, 80));
            start.bubble.classList.add('swiping');
            start.bubble.style.transform = `translateX(${start.dx}px)`;
        }, { passive: true });

        const end = () => {
            if (!start) return;
            const { bubble, dx } = start;
            bubble.classList.remove('swiping');
            bubble.style.transform = '';
            if (dx >= 60) this.setReply(bubble.closest('.message').dataset.id);
            start = null;
        };
        this.container.addEventListener('touchend', end);
        this.container.addEventListener('touchcancel', end);

        this.container.addEventListener('dblclick', (e) => {
            const msgEl = e.target.closest('.message');
            if (msgEl) {
                window.getSelection()?.removeAllRanges();
                this.setReply(msgEl.dataset.id);
            }
        });

        this.container.addEventListener('click', (e) => {
            const quote = e.target.closest('.reply-quote');
            if (quote) this.scrollToMessage(quote.dataset.replyId);

            // กดฟังเพลงที่โมส่ง
            const songLink = e.target.closest('[data-song]');
            if (songLink) {
                this.songOpened(this.messages.find(m => String(m.id) === songLink.closest('.message').dataset.id));
            }

            // กดเล่นข้อความเสียง
            const voiceBtn = e.target.closest('.voice-play');
            if (voiceBtn) {
                const msg = this.messages.find(m => String(m.id) === voiceBtn.closest('.message').dataset.id);
                if (msg) this.playVoice(msg, voiceBtn);
            }

            // กดคลิปในแชท → เปิดเล่น
            const reel = e.target.closest('.reel-preview');
            if (reel && window.MoReels) {
                const msg = this.messages.find(m => String(m.id) === reel.closest('.message').dataset.id);
                if (msg && msg.extra) {
                    this.watchingReel = msg;
                    window.MoReels.play(msg.extra);
                }
            }
        });
    }

    /**
     * Send an image: ย่อรูปก่อน (เก็บใน localStorage ได้) แล้วให้โมดู
     */
    async sendImage(file) {
        if (this.isTyping) return;
        if (file.type.startsWith('video/')) return this.sendVideo(file);
        let dataUrl;
        try {
            dataUrl = await this.resizeImage(file, 640);
        } catch (e) {
            this.showNotification('เปิดรูปนี้ไม่ได้ ลองรูปอื่นนะ 🥺');
            return;
        }

        const caption = this.input.value.trim();
        this.input.value = '';
        this.addMessage('sent', dataUrl, 'image');
        if (caption) this.addMessage('sent', caption);
        this.memory.incrementMessages();
        this.memory.updateLastChat();
        this.memory.increaseAffection(1);
        this.awaitingReply = false;

        this.queueReply(note => this.mediaReply(
            `${note}${caption || 'ส่งรูปนี้ให้ดู'}\n(ผู้ใช้ส่งรูปมา ดูรูปแล้วคอมเมนต์สั้นๆ แบบโม 1-3 ประโยค พูดถึงสิ่งที่เห็นในรูปจริงๆ แล้วใส่ [จำรูป: รูปอะไร สั้นๆ ไม่เกิน 12 คำ] ไว้บรรทัดสุดท้าย)`,
            dataUrl, this.brain.imageResponses));
    }

    /**
     * โมตอบรูป/คลิป (ใช้ AI ที่ดูภาพได้ ไม่ได้ก็ตอบแบบกลางๆ)
     */
    async mediaReply(prompt, media, fallbackPool) {
        this.mind && this.mind.see(media && media.youtube ? 'คลิป YouTube' : Array.isArray(media) ? 'คลิป' : 'รูป');
        this.showTyping();
        let reply = null;
        if (this.llmService && this.llmService.isReady()) {
            try {
                reply = await this.llmService.generateResponse(prompt, this.messages, this.brain.personality, this.memory.getSummary(), media);
            } catch (err) {
                console.warn('LLM media reply failed, fallback:', err.message);
            }
        }
        if (!reply) reply = this.brain.pickRandom(fallbackPool);
        await this.deliverBubbles(this.brain.sanitizeResponse(reply.trim(), 'chat'));
    }

    /**
     * เองโอนเงินเทียมให้โม → สลิปในแชท แล้วโมตอบตอนเห็น
     */
    sendTransfer(amount, note = '') {
        if (!this.life || !this.life.transfer(amount)) {
            this.showNotification('เงินในกระเป๋าไม่พอ 🥲');
            return false;
        }
        amount = Math.floor(amount);
        this.mind && this.mind.reward(amount);
        this.addMessage('sent', '', 'transfer', { amount, note });
        this.memory.incrementMessages();
        this.memory.updateLastChat();
        this.awaitingReply = false;

        const s = this.life.state;
        const wishNote = s.wish ? (s.wallet >= s.wish.cost ? ` ตอนนี้เงินพอซื้อ${s.wish.item}แล้ว` : ` ยังขาดอีก ฿${s.wish.cost - s.wallet} ถึงจะพอซื้อ${s.wish.item}`) : '';
        this.queueReply(n => this.moRespond(`${n}[เองโอนเงินให้โม ฿${amount}${note ? ` พร้อมโน้ตว่า "${note}"` : ''} — ตอนนี้โมมีเงิน ฿${s.wallet}${wishNote}]`));
        return true;
    }

    // =============================================
    //  โมเห็นแชทเมื่อไร (ขึ้นกับว่ามือถืออยู่กับโมไหม — MoLife)
    // =============================================

    /**
     * respond(note) จะถูกเรียกตอนโมเห็นแชท — note บอกโมว่าเพิ่งกลับมาเห็น (ว่างถ้าเห็นทันที)
     * หลายข้อความระหว่างที่โมไม่อยู่ → ตอบครั้งเดียวตอนกลับมา (แชทย้อนหลังมีครบอยู่แล้ว)
     */
    queueReply(respond) {
        const delay = this.life ? this.life.replyDelay() : 0;
        if (delay === 0 && !this.pendingReply) {
            // ถือมือถืออยู่: ส่วนใหญ่ตอบเลย บางทีขึ้น "อ่านแล้ว" ก่อนแล้วค่อยพิมพ์ (กำลังคิด/ทำอย่างอื่นอยู่)
            if (Math.random() < 0.25) {
                this.mind && this.mind.decide('อ่านแล้ว แต่ขอคิดแป๊บก่อนตอบ');
                this.markUnread();
                this.markRead();
                setTimeout(() => respond(''), 4000 + Math.random() * 14000);
            } else {
                this.mind && this.mind.decide('ถือมือถืออยู่ → ตอบทันที');
                respond('');
            }
            return;
        }
        this.mind && this.mind.decide(delay === Infinity
            ? `ยังไม่เห็นแชท (ตอนนี้${this.life.state.current.label})`
            : 'มือถือวางอยู่ใกล้ๆ เดี๋ยวค่อยเห็น');
        this.markUnread();
        this.pendingReply = { respond, since: this.pendingReply ? this.pendingReply.since : Date.now(), activity: this.life.state.current };
        if (delay !== Infinity) {
            clearTimeout(this._readTimer);
            this._readTimer = setTimeout(() => this.flushPending(), delay);
        }
    }

    /**
     * โมหยิบมือถือขึ้นมาเห็นแชท → อ่าน แล้วตอบ
     */
    flushPending() {
        const pending = this.pendingReply;
        if (!pending || (this.life && !this.life.canSeePhone()) || this.isTyping) return;
        this.pendingReply = null;
        clearTimeout(this._readTimer);
        this.mind && this.mind.decide('หยิบมือถือขึ้นมา เห็นแชทแล้ว');
        this.markRead();

        const mins = Math.round((Date.now() - pending.since) / 60000);
        const was = pending.activity;
        const note = mins >= 2
            ? `[ข้อความระบบ: โมเพิ่งเห็นแชทนี้ หลังผ่านไป ${mins} นาที เพราะตอนนั้น${was ? was.label : 'ไม่ได้ดูมือถือ'}${was && was.phone === 'home' ? ' และลืมมือถือไว้บ้าน' : ''} ให้ตอบแบบคนเพิ่งเห็นแชท บอกสั้นๆ ว่าหายไปไหนมา]\n`
            : '';
        setTimeout(() => pending.respond(note), 1500 + Math.random() * 2500);
    }

    markUnread() {
        this.messages.filter(m => m.type === 'sent' && m.read === undefined).slice(-5).forEach(m => { m.read = false; });
        this.refreshReadMarks();
    }

    markRead() {
        this.messages.forEach(m => { if (m.read === false) m.read = true; });
        this.refreshReadMarks();
        this.saveHistory();
    }

    refreshReadMarks() {
        this.messages.forEach(m => {
            if (m.read === undefined) return;
            const el = this.container.querySelector(`.message[data-id="${CSS.escape(String(m.id))}"] .message-time`);
            if (el) el.textContent = `${m.time}${m.read ? ' · อ่านแล้ว' : ' · ส่งแล้ว'}`;
        });
    }

    // =============================================
    //  คลิป: เองส่งคลิปให้โมดู / โมส่งคลิปให้เอง
    // =============================================

    /**
     * เองส่งไฟล์วิดีโอ: เก็บไฟล์ในเครื่อง (IndexedDB) แล้วดึงภาพ 4 ช่วงให้โมดู
     */
    async sendVideo(file) {
        if (file.size > 200 * 1024 * 1024) {
            this.showNotification('คลิปใหญ่เกิน 200MB ส่งไม่ได้ 🥺');
            return;
        }
        let frames;
        try {
            frames = await this.extractFrames(file, 4);
        } catch (e) {
            this.showNotification('เปิดคลิปนี้ไม่ได้ ลองคลิปอื่นนะ 🥺');
            return;
        }
        const mediaId = 'vid_' + Date.now();
        await window.MoMediaStore.put(mediaId, file);
        const clip = {
            id: 'local_' + mediaId, kind: 'local', mediaId,
            title: 'คลิปจากเอง', tags: [], from: 'user', thumbnail: frames[0],
        };
        window.MoReels && window.MoReels.addUserClip(clip);
        await this.sendClipFromUser(clip, frames, 'ดูภาพจากหลายช่วงของคลิปที่ผู้ใช้ถ่าย/ส่งมา (เรียงตามเวลา)');
    }

    /**
     * ดึงภาพจากหลายช่วงของคลิป (ย่อให้เล็ก ส่งให้ AI ดูแทนทั้งคลิป)
     */
    extractFrames(file, count) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.preload = 'auto';
            video.src = url;
            const frames = [];
            const done = (err) => { URL.revokeObjectURL(url); err ? reject(err) : resolve(frames); };
            video.onerror = () => done(new Error('bad video'));
            video.onloadedmetadata = async () => {
                try {
                    const duration = isFinite(video.duration) ? video.duration : 1;
                    for (let i = 0; i < count; i++) {
                        video.currentTime = Math.min(duration - 0.05, duration * (i + 0.5) / count);
                        await new Promise((res, rej) => {
                            video.onseeked = res;
                            setTimeout(() => rej(new Error('seek timeout')), 5000);
                        });
                        const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
                        const canvas = document.createElement('canvas');
                        canvas.width = Math.round(video.videoWidth * scale);
                        canvas.height = Math.round(video.videoHeight * scale);
                        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                        frames.push(canvas.toDataURL('image/jpeg', 0.7));
                    }
                    done();
                } catch (e) {
                    frames.length ? done() : done(e);
                }
            };
        });
    }

    /**
     * เองแปะลิงก์ YouTube: ส่งเป็นคลิป และให้โมดูคลิปจริงผ่าน Gemini
     */
    async sendYouTube(ytId, caption) {
        const url = `https://www.youtube.com/watch?v=${ytId}`;
        let title = 'คลิปจากเอง';
        try {
            const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { signal: AbortSignal.timeout(4000) });
            if (res.ok) title = (await res.json()).title || title;
        } catch (e) {}
        const clip = window.MoReels.fromYouTube(ytId, title, [], 'user');
        window.MoReels.addUserClip(clip);
        await this.sendClipFromUser(clip, { youtube: url }, `ดูคลิป YouTube ที่ผู้ใช้ส่งมา (ชื่อคลิป: ${title})`, caption);
    }

    async sendClipFromUser(clip, media, howToWatch, caption = '') {
        this.addMessage('sent', '', 'reel', clip);
        if (caption) this.addMessage('sent', caption);
        this.memory.incrementMessages();
        this.memory.updateLastChat();
        this.awaitingReply = false;

        this.queueReply(note => this.mediaReply(
            `${note}${caption || 'ส่งคลิปนี้ให้ดู'}\n(${howToWatch} ดูแล้วรีแอคแบบโม 1-3 บรรทัด พูดถึงสิ่งที่เกิดขึ้นในคลิปจริงๆ ห้ามเดา)`,
            media, this.brain.clipResponses));
    }

    /**
     * โมส่งคลิปจากคลัง (เลือกตามหมวด)
     */
    /**
     * เองเปิดดูคลิปที่โมส่ง (ดูนานพอ) → ติดป้าย "ดูแล้ว" แล้วโมรีแอคถึงฉากในคลิปจริงๆ
     */
    reelWatched(seconds) {
        const msg = this.watchingReel;
        this.watchingReel = null;
        if (!msg || msg.type !== 'received' || msg.watched || seconds < 4) return;
        msg.watched = true;
        this.saveHistory();
        const el = this.container.querySelector(`.message[data-id="${CSS.escape(String(msg.id))}"] .message-reel`);
        if (el) el.classList.add('watched');
        this.mind && this.mind.perceive('ดูคลิปที่ส่งให้แล้ว');
        const clip = msg.extra;
        const media = clip.kind === 'youtube' ? { youtube: `https://www.youtube.com/watch?v=${clip.yt}` } : null;
        this.queueReply(note => this.mediaReply(
            `${note}[ข้อความระบบ: เองเพิ่งเปิดดูคลิป "${clip.title}" ที่โมส่งไป ดูไป ${Math.round(seconds)} วิ — โมถามแบบลุ้นว่าเป็นไง ขำมั้ย/น่ารักมั้ย พูดถึงฉากหรือมุกในคลิปจริงๆ สั้นๆ 1-2 บรรทัด เหมือนเพื่อนที่ส่งคลิปแล้วรอดูรีแอค]`,
            media, ['ดูจบยังง 555', 'เป็นไงๆ ขำป่ะ', 'น่ารักป่ะ บอกแล้ว']));
    }

    /**
     * คลิปที่โมส่งแล้วเองยังไม่เปิด (และพิมพ์อย่างอื่นมาแทน) → บอก AI ให้แซวได้ ครั้งเดียวต่อคลิป
     */
    unwatchedReelNote() {
        const since = Date.now() - 2 * 3600000;
        const msg = [...this.messages].reverse().find(m => m.type === 'received' && m.format === 'reel' && m.timestamp > since);
        if (!msg || msg.watched || msg.nudged) return '';
        const repliedAfter = this.messages.some(m => m.type === 'sent' && m.timestamp > msg.timestamp);
        if (!repliedAfter) return '';
        msg.nudged = true;
        return `[ข้อความระบบ: เองยังไม่ได้เปิดดูคลิป "${msg.extra && msg.extra.title}" ที่โมส่งไป — ถ้าเข้าจังหวะ แซวหรืองอนนิดๆ ว่าไม่ดูคลิปเค้า (ไม่ต้องทุกครั้ง)]\n`;
    }

    // =============================================
    //  เสียง & สั่น เมื่อโมส่งข้อความ (แบบแอปแชทจริง)
    // =============================================

    alertsOn() {
        try { return localStorage.getItem('mo_alerts_v1') !== 'off'; } catch (e) { return true; }
    }

    /**
     * เสียงสั้นๆ สร้างเอง (ไม่ต้องมีไฟล์): 'receive' = ติ๊งสองโน้ต, 'send' = ฟิ้วเบาๆ
     */
    playTone(kind) {
        if (!this.alertsOn()) return;
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            this._audioCtx = this._audioCtx || new Ctx();
            const ctx = this._audioCtx;
            if (ctx.state === 'suspended') ctx.resume();
            const notes = kind === 'send' ? [[660, 0, 0.06, 0.05]] : [[880, 0, 0.09, 0.12], [1320, 0.1, 0.12, 0.1]];
            notes.forEach(([freq, at, dur, vol]) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, ctx.currentTime + at);
                gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + at + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
                osc.connect(gain).connect(ctx.destination);
                osc.start(ctx.currentTime + at);
                osc.stop(ctx.currentTime + at + dur + 0.02);
            });
        } catch (e) {}
    }

    /**
     * โมส่งข้อความมา: เปิดแอปอยู่ → ติ๊ง + สั่น / ย่อแอปไว้ → แจ้งเตือนของระบบ (เด้ง + สั่น + เสียงเครื่อง)
     * หลายฟองติดกัน → เตือนครั้งเดียว
     */
    alert(message) {
        if (!this.alertsOn() || Date.now() - (this._lastAlert || 0) < 2500) return;
        this._lastAlert = Date.now();
        const body = message.format === 'sticker' ? `ส่งสติกเกอร์ ${message.text}` : (this.snippetOf ? this.snippetOf(message) : message.text) || 'ส่งข้อความมา';
        if (document.visibilityState === 'hidden') {
            if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) {
                navigator.serviceWorker.ready.then(reg => reg.showNotification('โม 💕', {
                    body: String(body).slice(0, 140), icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
                    tag: 'mo-chat', renotify: true, vibrate: [120, 60, 120],
                })).catch(() => {});
            }
            return;
        }
        this.playTone('receive');
        try { if (navigator.vibrate) navigator.vibrate([60, 40, 60]); } catch (e) {}
    }

    sendSong(song) {
        this.mind && this.mind.act(`แชร์เพลง ${song.artist} - ${song.title}`);
        this.addMessage('received', '', 'song', { ...song, ...MoSongs.links(song.artist, song.title) });
    }

    /**
     * เองกดฟังเพลงที่โมส่ง → สักพักโมถามว่าเป็นไง (ครั้งเดียวต่อเพลง)
     */
    songOpened(msg) {
        if (!msg || msg.type !== 'received' || msg.extra.listened) return;
        msg.extra.listened = true;
        this.saveHistory();
        setTimeout(() => {
            if (this.isTyping) return;
            this.queueReply(note => this.moRespond(`${note}[ข้อความระบบ: เองเพิ่งกดไปฟังเพลง "${msg.extra.artist} - ${msg.extra.title}" ที่โมส่ง — ถามว่าเป็นไง ชอบมั้ย ท่อนไหน แล้วเล่าว่าโมชอบท่อนไหน สั้นๆ 1-2 บรรทัด]`));
        }, 3 * 60000);
    }

    /**
     * โมส่งแล้วกดยกเลิกข้อความ (หลังไม่กี่วิ) — เองเห็นแค่ว่า "โมยกเลิกข้อความ"
     */
    sendAndUnsend(text) {
        const msg = this.addMessage('received', text);
        if (!msg) return;
        setTimeout(() => {
            msg.unsent = true;
            msg.unsentText = msg.text;
            msg.text = '';
            this.saveHistory();
            const el = this.container.querySelector(`.message[data-id="${CSS.escape(String(msg.id))}"] .message-bubble`);
            if (el) {
                el.classList.add('message-unsent');
                el.textContent = '🚫 โมยกเลิกข้อความ';
            }
            this.mind && this.mind.act('กดยกเลิกข้อความ (เขิน)');
        }, 2200 + Math.random() * 1800);
    }

    /**
     * เองส่งข้อความเสียง → โมฟังเสียงจริง (Gemini) ตอบตามน้ำเสียง แล้วถอดความเก็บไว้
     */
    async sendUserVoice(blob, duration) {
        const mediaId = 'myvoice_' + Date.now();
        await window.MoMediaStore.put(mediaId, blob);
        this.addMessage('sent', '', 'voice', { mediaId, duration, text: '' });
        this.memory.incrementMessages();
        this.memory.updateLastChat();
        this.awaitingReply = false;
        const dataUrl = await MoVoice.blobToDataUrl(blob);
        const sulk = this.sulkNote();
        this.queueReply(note => this.mediaReply(
            `${note}${sulk}[ข้อความระบบ: เองส่งข้อความเสียง ${duration} วิ — ฟังเสียงแล้วตอบแบบโมตามเรื่องที่พูด และจับน้ำเสียง/อารมณ์ด้วย (เหนื่อย ดีใจ ง่วง ฯลฯ) จะตอบกลับเป็นเสียงด้วย [เสียง] ก็ได้ แล้วใส่ [ถอดเสียง: สิ่งที่เองพูดแบบคำต่อคำ] ไว้บรรทัดสุดท้าย]`,
            dataUrl, ['ฟังไม่ค่อยชัดอ่ะ พิมพ์มาหน่อยได้มั้ย 🥺', 'เสียงเองน่ารักดีนะ 555 แต่เน็ตเค้ากากฟังไม่ทัน']));
    }

    /**
     * ตอบกลับสตอรี่ของโม (แสดงเหมือนตอบกลับข้อความ)
     */
    replyToStory(story, text) {
        this.replyTo = { id: story.id, type: 'received', text: `📸 สตอรี่: ${story.emoji} ${story.text}` };
        this.input.value = text;
        this.sendMessage();
    }

    /**
     * เริ่มเกมกับโม: โมเป็นฝ่ายเปิดเกม
     */
    startGame(id) {
        if (!this.games || this.isTyping) return;
        const game = this.games.start(id);
        this.addSystemMessage(`${game.emoji} เล่น ${game.name} กับโม`);
        this.mind && this.mind.decide(`เองชวนเล่น ${game.name}`);
        this.queueReply(note => this.moRespond(`${note}[ข้อความระบบ: เองชวนเล่นเกม "${game.name}" — กติกา: ${game.rules} — ตื่นเต้นที่ได้เล่น อธิบายกติกาสั้นๆ 1 บรรทัดแล้วเริ่มเลย โมเป็นฝ่ายเริ่ม]`));
    }

    /**
     * ดูคลิปด้วยกัน: โมดูคลิปเดียวกัน (Gemini) แล้วพิมพ์คอมเมนต์สดลอยบนคลิป
     */
    async watchTogether(clip) {
        const box = document.getElementById('watch-comments');
        box.innerHTML = '';
        if (clip.kind !== 'youtube' || !this.llmService || !this.llmService.isReady()) return;
        const token = this._watchToken = Date.now();
        this._watchCache = this._watchCache || {};
        let lines = this._watchCache[clip.id];
        if (!lines) {
            try {
                const reply = await this.llmService.generateResponse(
                    `[ข้อความระบบ: ตอนนี้โมกับเองกำลังเปิดคลิป "${clip.title}" ดูพร้อมกัน — ดูคลิปแล้วเขียนคอมเมนต์สดแบบพิมพ์ระหว่างดู 3 บรรทัด เรียงตามเวลาในคลิป บรรทัดละไม่เกิน 8 คำ พูดถึงฉากจริงในคลิป ขำ/กรี๊ด/แซวได้ ไม่ใส่แท็กใดๆ]`,
                    this.messages, this.brain.personality, this.memory.getSummary(),
                    { youtube: `https://www.youtube.com/watch?v=${clip.yt}` });
                lines = reply.replace(/\*[^*\n]+\*/g, '').split('\n').map(s => s.replace(/^[-•\d.\s]+/, '').trim()).filter(Boolean).slice(0, 3);
                this._watchCache[clip.id] = lines;
            } catch (e) {
                return;
            }
        }
        lines.forEach((line, i) => setTimeout(() => {
            if (this._watchToken !== token || document.getElementById('clip-player').classList.contains('hidden')) return;
            const el = document.createElement('div');
            el.className = 'watch-comment';
            el.innerHTML = '<img src="mo_avatar.jpg" alt="">';
            el.appendChild(document.createTextNode(line));
            box.appendChild(el);
        }, 2500 + i * 4500));
    }

    sendMoClip(topic = '') {
        if (!window.MoReels) return;
        const clip = window.MoReels.pickClip(topic);
        this.mind && this.mind.decide(`อยากแชร์คลิป → เลือก "${clip ? clip.title : ''}"`);
        if (clip) this.addMessage('received', '', 'reel', clip);
    }

    resizeImage(file, maxSize) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
            img.src = url;
        });
    }

    /**
     * Send a sticker
     */
    sendSticker(sticker) {
        // สติกเกอร์ชุดโม (มีคำพูด) → โมเข้าใจความหมายแล้วตอบด้วย AI
        if (sticker && typeof sticker === 'object') {
            this.addMessage('sent', sticker.e, 'sticker', { id: sticker.id, caption: sticker.t });
            this.memory.incrementMessages();
            this.awaitingReply = false;
            if (this.llmService && this.llmService.isReady()) {
                this.queueReply(note => this.moRespond(`${note}[ข้อความระบบ: เองส่งสติกเกอร์ ${sticker.e} "${sticker.t}" มา — ตอบสั้นๆ ตามความหมาย อาจตอบกลับเป็นสติกเกอร์ด้วย [สติกเกอร์: id] ก็ได้]`));
                return;
            }
            sticker = sticker.e;
            return this.sendStickerFallback();
        }
        this.addMessage('sent', sticker, 'sticker');
        this.memory.incrementMessages();
        this.sendStickerFallback();
    }

    sendStickerFallback() {
        // Mo responds to sticker
        setTimeout(() => {
            this.showTyping();
            setTimeout(() => {
                this.hideTyping();
                const response = this.brain.getStickerResponse();
                this.addMessage('received', response, 'sticker');
            }, 800);
        }, 500);
    }

    /**
     * แบ่งคำตอบเป็นฟองแชทสั้นๆ: ตามบรรทัด และหั่นบรรทัดที่ยาวเกินตรงช่องว่าง (สูงสุด 3 ฟอง)
     */
    splitBubbles(text) {
        const MAX = 5;
        const parts = [];
        // แยกตามบรรทัด (และ ⏎ ที่ model บางทีพิมพ์มา) แล้วแยก *ท่าทาง* ออกเป็นฟองของตัวเอง
        const lines = text.split(/\n+|⏎/)
            .flatMap(l => l.split(/(\*[^*\n]+\*)/))
            .map(l => l.trim())
            .filter(Boolean);
        for (const line of lines) {
            let rest = line;
            while (rest.length > 60 && !rest.startsWith('*')) {
                const cut = rest.indexOf(' ', 25);
                if (cut === -1 || cut > 60) break;
                parts.push(rest.slice(0, cut).trim());
                rest = rest.slice(cut + 1).trim();
            }
            if (rest) parts.push(rest);
        }
        // ท่าทางเก็บไว้แค่อันแรก (เยอะไปแล้วดูเป็นบทละคร)
        for (let i = parts.length - 1; i > 0; i--) {
            const isAction = p => /^\*[^*]+\*$/.test(p);
            if (isAction(parts[i]) && parts.slice(0, i).some(isAction)) parts.splice(i, 1);
        }
        if (parts.length <= MAX) return parts.length ? parts : [text];
        return [...parts.slice(0, MAX - 1), parts.slice(MAX - 1).join(' ')];
    }

    /**
     * Mo generates and sends a response
     */
    async moRespond(userMessage) {
        // Show typing indicator immediately
        this.showTyping();

        try {
            const response = await this.brain.generateResponse(
                userMessage,
                this.memory,
                this.messages,
                this.llmService
            );

            await this.deliverBubbles(response);

        } catch (err) {
            console.error('Error generating response:', err);
            this.hideTyping();
            this.addMessage('received', 'อื้ม เค้าฟังอยู่นะ');
        }
    }

    /**
     * ส่งคำตอบทีละฟองเหมือนคนพิมพ์: ฟองแรกเร็ว ฟองต่อไปรอตามความยาว
     * (ต้อง showTyping ก่อนเรียก) — resolve เมื่อส่งครบ
     */
    deliverBubbles(response, { notify = false } = {}) {
        // [คลิป: หมวด] = โมอยากส่งคลิป → ตัดแท็กออก ส่งคลิปตามหลังข้อความ
        let clipTopic = null;
        // (AI บางทีเลียนแบบรูปแบบในประวัติแชทเป็น [ส่งคลิป: ...] → รับทั้งสองแบบ)
        response = response.replace(/\[\s*(?:ส่ง)?คลิป\s*:?\s*([^\]]*)\]/g, (_, topic) => {
            clipTopic = topic.trim();
            return '';
        });

        // [ถอดเสียง: ...] = สิ่งที่เองพูดในข้อความเสียงล่าสุด → เก็บไว้ (ค้นหา/ความจำ/AI รอบหน้าเห็น)
        response = response.replace(/\[\s*ถอดเสียง\s*:?\s*([^\]]*)\]/g, (_, said) => {
            const voice = [...this.messages].reverse().find(m => m.type === 'sent' && m.format === 'voice');
            if (voice && said.trim() && !voice.extra.text) {
                voice.extra.text = said.trim().slice(0, 500);
                voice.text = voice.extra.text;
                this.saveHistory();
                this.memory.extractFacts(voice.extra.text);
                if (this.routines) this.routines.learn(voice.extra.text);
                const t = this.container.querySelector(`.message[data-id="${CSS.escape(String(voice.id))}"] .voice-transcript`);
                if (t) t.lastChild.textContent = voice.extra.text;
            }
            return '';
        });

        // [สติกเกอร์: id] = โมส่งสติกเกอร์ชุดโม (ตามหลังข้อความ)
        let moSticker = null;
        response = response.replace(/\[\s*สติกเกอร์\s*:?\s*([^\]]*)\]/g, (_, id) => {
            moSticker = window.MoStickers && MoStickers.byId(id);
            return '';
        });
        if (moSticker) setTimeout(() => this.addMessage('received', moSticker.e, 'sticker', { id: moSticker.id, caption: moSticker.t }), 1200 + Math.random() * 1000);

        // [เพลง: ศิลปิน - ชื่อเพลง] = โมส่งการ์ดเพลง (ส่งตามหลังข้อความ)
        let song = null;
        response = response.replace(/\[\s*เพลง\s*:?\s*([^\]]*)\]/g, (_, raw) => {
            song = window.MoSongs && MoSongs.parse(raw);
            return '';
        });
        if (song) setTimeout(() => this.sendSong(song), 1800 + Math.random() * 1200);

        // [ยกเลิก: ...] = โมส่งข้อความนี้แล้วกดยกเลิก (เหลือแค่ "ยกเลิกข้อความ")
        let unsendText = null;
        response = response.replace(/\[\s*ยกเลิก\s*:?\s*([^\]]*)\]/g, (_, said) => {
            if (said.trim()) unsendText = said.trim().slice(0, 120);
            return '';
        });
        if (unsendText) setTimeout(() => this.sendAndUnsend(unsendText), 1500 + Math.random() * 2500);

        // [จำรูป: ...] = คำอธิบายรูปที่เองเพิ่งส่ง → จำไว้พูดถึงทีหลัง
        response = response.replace(/\[\s*จำรูป\s*:?\s*([^\]]*)\]/g, (_, desc) => {
            const img = [...this.messages].reverse().find(m => m.type === 'sent' && m.format === 'image');
            if (img && desc.trim()) {
                img.desc = desc.trim().slice(0, 80);
                this.saveHistory();
                if (this.self) this.self.rememberPhoto(img.desc);
            }
            return '';
        });

        // [รีแอค: ❤️] = กดรีแอคข้อความล่าสุดของเอง
        response = response.replace(/\[\s*รีแอค\s*:?\s*([^\]]*)\]/g, (_, emoji) => {
            this.reactToLastSent(emoji.trim());
            return '';
        });

        // [เสียง] = ส่งเป็นข้อความเสียง
        let asVoice = false;
        response = response.replace(/\[\s*(?:ข้อความ)?เสียง\s*:?\s*\]/g, () => {
            asVoice = true;
            return '';
        }).trim() || 'นี่ๆ ดูอันนี้';

        if (asVoice) {
            return this.sendVoiceNote(response, notify).then(() => {
                if (clipTopic !== null) setTimeout(() => this.sendMoClip(clipTopic), 900);
            });
        }

        const parts = this.splitBubbles(response);
        if (this.care) this.care.noticeReply(response);
        this.mind && this.mind.act(`พิมพ์ตอบ ${parts.length} ข้อความ`);
        return new Promise(resolve => {
            const finish = () => {
                if (clipTopic === null) return resolve();
                this.showTyping();
                setTimeout(() => {
                    this.hideTyping();
                    this.sendMoClip(clipTopic);
                    resolve();
                }, 900);
            };
            let typoUsed = false;
            const sendPart = (i) => {
                this.hideTyping();
                // บางทีพิมพ์ผิดแล้วส่ง *คำที่ถูก ตามไปแก้ (ไม่เกินครั้งเดียวต่อคำตอบ)
                const typo = !typoUsed && Math.random() < 0.1 ? this.makeTypo(parts[i]) : null;
                this.addMessage('received', typo ? typo.text : parts[i]);
                if (notify && i === 0) this.showNotification(parts[i]);
                const next = () => {
                    if (i + 1 < parts.length) {
                        this.showTyping();
                        const delay = Math.min(this.brain.getTypingDelay(parts[i + 1].length), 2000);
                        // บางทีพิมพ์ๆ หยุดๆ (กำลังพิมพ์... หายไปแป๊บแล้วกลับมา)
                        if (Math.random() < 0.2) {
                            setTimeout(() => this.hideTyping(), delay * 0.5);
                            setTimeout(() => this.showTyping(), delay * 0.5 + 900);
                            setTimeout(() => sendPart(i + 1), delay + 1400);
                        } else {
                            setTimeout(() => sendPart(i + 1), delay);
                        }
                    } else {
                        finish();
                    }
                };
                if (typo) {
                    typoUsed = true;
                    this.mind && this.mind.act(`พิมพ์ผิด "${typo.fix}" ต้องแก้`);
                    this.showTyping();
                    setTimeout(() => {
                        this.hideTyping();
                        this.addMessage('received', `*${typo.fix}`);
                        next();
                    }, 1100);
                } else {
                    next();
                }
            };
            setTimeout(() => sendPart(0), Math.min(this.brain.getTypingDelay(parts[0].length), 1800));
        });
    }

    /**
     * ทำให้คำหนึ่งในข้อความพิมพ์ผิด (ตกพยัญชนะตัวท้าย) → { text, fix } หรือ null ถ้าไม่มีคำเหมาะๆ
     */
    makeTypo(text) {
        if (text.length < 8 || /^\*|\[|https?:/.test(text) || typeof Intl.Segmenter !== 'function') return null;
        const words = [...new Intl.Segmenter('th', { granularity: 'word' }).segment(text)]
            .filter(s => s.isWordLike && /^[ก-๎]{3,}$/.test(s.segment) && /[ก-ฮ]$/.test(s.segment));
        if (!words.length) return null;
        const w = words[Math.floor(Math.random() * words.length)];
        const wrong = w.segment.slice(0, -1);
        return { text: text.slice(0, w.index) + wrong + text.slice(w.index + w.segment.length), fix: w.segment };
    }

    // =============================================
    //  รีแอค & ข้อความเสียง
    // =============================================

    reactToLastSent(emoji) {
        const allowed = ['❤️', '😂', '🥺', '😮', '😡', '👍'];
        const pick = allowed.find(e => emoji.includes(e.replace('️', ''))) || '❤️';
        const msg = [...this.messages].reverse().find(m => m.type === 'sent');
        if (!msg) return;
        msg.reaction = pick;
        this.mind && this.mind.decide(`กดรีแอค ${pick} ข้อความของเอง`);
        this.saveHistory();
        const el = this.container.querySelector(`.message[data-id="${CSS.escape(String(msg.id))}"] .message-bubble`);
        if (!el) return;
        let badge = el.parentElement.querySelector('.message-reaction');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'message-reaction';
            el.insertAdjacentElement('afterend', badge);
        }
        badge.textContent = pick;
    }

    /**
     * โมส่งข้อความเสียง: สร้างเสียงด้วย Gemini TTS เก็บไฟล์ในเครื่อง — ทำไม่ได้ก็ส่งเป็นข้อความธรรมดา
     */
    async sendVoiceNote(text, notify = false) {
        const spoken = text.replace(/\*[^*\n]+\*/g, '').replace(/\n+/g, ' ').trim();
        this.hideTyping();
        this.isTyping = true;
        document.getElementById('user-status').textContent = 'กำลังอัดเสียง... 🎙️';
        this.mind && this.mind.act('อัดข้อความเสียง');

        let blob = null;
        try {
            blob = await this.llmService.speak(spoken);
        } catch (err) {
            console.warn('TTS failed, send as text:', err.message);
        }
        this.isTyping = false;
        if (!blob) {
            this.showTyping();
            return this.deliverBubbles(text, { notify });
        }

        const mediaId = 'voice_' + Date.now();
        await window.MoMediaStore.put(mediaId, blob);
        const duration = Math.max(1, Math.round((blob.size - 44) / (24000 * 2)));
        this.hideTyping();
        this.addMessage('received', '', 'voice', { mediaId, text: spoken, duration });
        if (notify) this.showNotification('🎤 ข้อความเสียง');
    }

    async playVoice(msg, button) {
        if (this._voice) {
            this._voice.pause();
            this._voiceBtn && this._voiceBtn.classList.remove('playing');
            const same = this._voiceBtn === button;
            this._voice = null;
            this._voiceBtn = null;
            if (same) return;
        }
        const blob = await window.MoMediaStore.get(msg.extra.mediaId).catch(() => null);
        if (!blob) {
            this.showNotification('ไฟล์เสียงนี้ไม่อยู่ในเครื่องนี้แล้ว 🥺');
            return;
        }
        const audio = new Audio(URL.createObjectURL(blob));
        this._voice = audio;
        this._voiceBtn = button;
        button.classList.add('playing');
        audio.onended = () => {
            button.classList.remove('playing');
            URL.revokeObjectURL(audio.src);
            this._voice = null;
            this._voiceBtn = null;
        };
        audio.play().catch(() => button.classList.remove('playing'));
    }

    /**
     * โมทักเองก่อน — ให้ AI คิดข้อความแบบคนจริงจากเวลา เหตุผลที่ทัก และแชทล่าสุด
     * reason: บริบทว่าทำไมถึงทัก เช่น "เงียบไป 40 นาที"
     */
    async sendProactiveMessage(reason = 'ไม่ได้คุยกันสักพัก', customStyle = null) {
        if (this.isTyping) return;
        this.nudged = false;
        this.showTyping();

        let message = null;
        if (this.llmService && this.llmService.isReady()) {
            const today = new Date().toDateString();
            const moToday = this.messages
                .filter(m => m.type === 'received' && (!m.format || m.format === 'text') && new Date(m.timestamp).toDateString() === today)
                .slice(-8).map(m => m.text);
            const lastUser = [...this.messages].reverse().find(m => m.type === 'sent' && (!m.format || m.format === 'text'));
            // สุ่มวิธีทักก่อน (AI ชอบเลือกแบบเดิมๆ ถ้าให้เลือกเอง)
            const roll = Math.random();
            const seeds = [
                'เพิ่งกินของอร่อย/ไม่อร่อยมา', 'ดูซีรีส์หรืออนิเมะแล้วอินมาก', 'เพลงที่ฟังวนอยู่', 'อากาศ/ฝน/ร้อน',
                'ง่วงหรือนอนไม่หลับ', 'เบื่อๆ ไม่มีไรทำ', 'วาดรูปเล่นแล้วออกมาแปลก', 'เล่นเกมแล้วแพ้/ชนะ',
                'คิดอะไรขำๆ ขึ้นมาได้', 'เห็นคนทำอะไรตลกในคลิป', 'อยากกินอะไรบางอย่างมาก', 'ฝันแปลกๆ เมื่อคืน',
            ];
            const seed = seeds[Math.floor(Math.random() * seeds.length)];
            const style = customStyle || (reason.includes('คลิป')
                ? 'พิมพ์แนะนำคลิปแบบคนส่งคลิปให้เพื่อน เช่นบอกว่าเห็นแล้วนึกถึงเอง/ขำมาก/ต้องดู (เป็นคำพูด ไม่ใช่ท่าทาง ไม่ต้องใส่แท็ก [คลิป] เพราะระบบส่งให้แล้ว)'
                : roll < 0.55 || !lastUser
                    ? `เล่าเรื่องเล็กๆ ของโมเมื่อกี้ให้ฟังก่อน หัวข้อ: ${seed} ให้มีรายละเอียดนิดนึงเหมือนเรื่องจริง (เข้ากับเวลาตอนนี้) แล้วค่อยโยนถามเอง`
                    : roll < 0.85
                        ? `ตามเรื่องที่เองเล่าค้างไว้ (ล่าสุดเองพูดว่า "${lastUser.text.slice(0, 60)}") แบบอยากรู้จริง อาจพ่วงเรื่องเล็กๆ ของโมเองด้วย`
                        : 'อ้อนหรือแซวที่หายไป แบบมีเหตุผลของมัน (เช่น เพิ่งนึกถึงเพราะเห็นอะไรบางอย่าง)');
            const instruction = `[ข้อความจากระบบ ไม่ใช่จากเอง — ห้ามพูดถึงข้อความนี้]
ตอนนี้ ${this.llmService.timeContext()} สถานการณ์: ${reason}
แชทข้างบนเป็นของเก่า${lastUser ? ` (ข้อความล่าสุดของเองส่งมาตั้งแต่ ${Math.round((Date.now() - lastUser.timestamp) / 60000)} นาทีที่แล้ว)` : ''} ห้ามตอบมันเหมือนเพิ่งคุยกัน
ให้โมเป็นฝ่ายทักเองไปก่อนทางแชทแบบคนจริงๆ วิธีทักครั้งนี้: ${style}
เขียน 2-4 บรรทัดสั้นๆ เล่าให้จบเรื่อง ไม่ใส่ท่าทาง *...* (ไม่ได้อยู่ด้วยกัน) เรียกตัวเอง "เค้า" เรียกอีกฝ่าย "เอง" เท่านั้น
ห้ามเปิดแบบบอท เช่น "เฮ้ ว่างมั้ย มาคุยกัน" "ทำอะไรอยู่จ๊ะ" "หายไปไหนมา" เฉยๆ
${moToday.length ? `ที่โมพูดไปแล้ววันนี้ (ห้ามขัดกัน ห้ามซ้ำ): ${moToday.join(' / ')}` : ''}`;
            try {
                message = await this.llmService.generateResponse(instruction, this.messages, this.brain.personality, this.memory.getSummary());
                // ทักทางแชท ไม่ได้อยู่ด้วยกัน → ไม่มีท่าทาง
                message = this.brain.sanitizeResponse(message.replace(/\*[^*\n]+\*/g, '').replace(/\n{2,}/g, '\n'), 'chat') || null;
            } catch (err) {
                console.warn('Proactive LLM failed, fallback:', err.message);
            }
        }
        if (!message) {
            message = this.brain.sanitizeResponse(
                this.brain.enrichWithMemory(this.brain.getProactiveMessage(this.memory), '', this.memory, 'chat'), 'chat');
        }

        if (!this.awaitingReply) this.awaitingSince = Date.now();
        this.awaitingReply = true;
        await this.deliverBubbles(message, { notify: true });
    }

    /**
     * Send a reel/clip message
     */
    sendReelMessage() {
        const reels = window.MoReels ? window.MoReels.getReelsList() : [];
        if (reels.length === 0) return;

        const reel = reels[Math.floor(Math.random() * reels.length)];
        this.addMessage('received', '', 'reel', reel);
    }

    /**
     * Add a message to the chat
     */
    addMessage(type, text, format = 'text', extra = null, replyTo = null) {
        const message = {
            id: Date.now() + Math.random(),
            type, // 'sent' or 'received'
            text,
            format, // 'text', 'sticker', 'reel', 'image'
            extra,
            replyTo, // { id, type, text } ข้อความที่ตอบกลับ
            timestamp: Date.now(),
            time: this.formatTime(new Date())
        };

        this.messages.push(message);
        this.renderMessage(message);
        this.scrollToBottom();
        this.saveHistory();
        if (type === 'received') this.alert(message);
        else if (type === 'sent') this.playTone('send');

        return message;
    }

    /**
     * Add a system message
     */
    addSystemMessage(text) {
        const el = document.createElement('div');
        el.className = 'system-message';
        el.innerHTML = `<span>${text}</span>`;
        this.container.appendChild(el);
        this.scrollToBottom();
    }

    /**
     * Render a single message
     */
    /** ป้ายวัน: วันนี้ / เมื่อวาน / วันจันทร์ที่ 2 พ.ย. */
    dayLabel(ts) {
        const d = new Date(ts);
        const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 86400000);
        if (days === 0) return 'วันนี้';
        if (days === 1) return 'เมื่อวาน';
        return d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short', ...(days > 300 ? { year: 'numeric' } : {}) });
    }

    /**
     * ฟองติดกันจากคนเดียวกัน (ห่างไม่เกิน 3 นาที) → รวมเป็นกลุ่ม: รูปโปรไฟล์และเวลาโชว์แค่ฟองสุดท้าย
     */
    regroup(from = null) {
        const els = [...this.container.querySelectorAll('.message')];
        const start = from ? Math.max(0, els.indexOf(from) - 1) : 0;
        for (let i = start; i < els.length; i++) {
            const el = els[i], next = els[i + 1], prev = els[i - 1];
            const same = (a, b) => a && b && a.classList.contains('sent') === b.classList.contains('sent')
                && Math.abs(Number(b.dataset.ts) - Number(a.dataset.ts)) < 3 * 60000
                && a.nextElementSibling === b;
            el.classList.toggle('grouped-next', Boolean(same(el, next)));
            el.classList.toggle('grouped-prev', Boolean(same(prev, el)));
        }
    }

    renderMessage(msg) {
        // ขึ้นวันใหม่ → ตัวคั่นวัน
        const ts = msg.timestamp || Math.floor(msg.id) || Date.now();
        const dayKey = new Date(ts).toDateString();
        if (this._lastDay !== dayKey) {
            this._lastDay = dayKey;
            const sep = document.createElement('div');
            sep.className = 'day-divider';
            sep.innerHTML = `<span>${this.dayLabel(ts)}</span>`;
            this.container.appendChild(sep);
        }
        const wrapper = document.createElement('div');
        wrapper.className = `message ${msg.type}`;
        wrapper.dataset.id = msg.id;
        wrapper.dataset.ts = ts;
        wrapper.style.animationDelay = '0s';

        let bubbleContent = '';

        if (msg.format === 'sticker') {
            const cap = msg.extra && msg.extra.caption ? `<span class="sticker-caption">${String(msg.extra.caption).replace(/</g, '&lt;')}</span>` : '';
            bubbleContent = `<div class="message-bubble message-sticker${cap ? ' with-caption' : ''}">${msg.text}${cap}</div>`;
        } else if (msg.format === 'reel' && msg.extra) {
            const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            bubbleContent = `
                <div class="message-bubble message-reel${msg.watched ? ' watched' : ''}">
                    <div class="reel-preview">
                        <img src="${esc(msg.extra.thumbnail)}" alt="" loading="lazy">
                        <span class="reel-badge">▶ Shorts</span>
                        <span class="reel-seen">ดูแล้ว</span>
                        <div class="reel-play-btn">
                            <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                        <div class="reel-caption">${esc(msg.extra.title)}</div>
                    </div>
                </div>
            `;
        } else if (msg.format === 'voice' && msg.extra) {
            const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const bars = Array.from({ length: 18 }, (_, i) => `<i style="height:${30 + Math.round(60 * Math.abs(Math.sin(i * 1.7 + msg.extra.duration)))}%"></i>`).join('');
            bubbleContent = `
                <div class="message-bubble message-voice">
                    <button class="voice-play" aria-label="เล่นข้อความเสียง"></button>
                    <div class="voice-wave">${bars}</div>
                    <span class="voice-dur">0:${String(msg.extra.duration).padStart(2, '0')}</span>
                </div>
                <details class="voice-transcript"><summary>ดูข้อความ</summary>${esc(msg.extra.text)}</details>
            `;
        } else if (msg.format === 'transfer' && msg.extra) {
            const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            bubbleContent = `
                <div class="message-bubble message-transfer">
                    <div class="transfer-head">💸 โอนเงินสำเร็จ</div>
                    <div class="transfer-amount">฿${Number(msg.extra.amount).toLocaleString()}</div>
                    ${msg.extra.note ? `<div class="transfer-note">${esc(msg.extra.note)}</div>` : ''}
                </div>
            `;
        } else if (msg.format === 'song' && msg.extra) {
            const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            bubbleContent = `
                <div class="message-bubble message-song">
                    <div class="song-art">🎵</div>
                    <div class="song-info"><strong>${esc(msg.extra.title)}</strong><span>${esc(msg.extra.artist)}</span></div>
                    <div class="song-links">
                        <a href="${esc(msg.extra.youtube)}" target="_blank" rel="noopener" data-song="yt">▶ YouTube</a>
                        <a href="${esc(msg.extra.spotify)}" target="_blank" rel="noopener" data-song="sp">Spotify</a>
                    </div>
                </div>`;
        } else if (msg.unsent) {
            bubbleContent = '<div class="message-bubble message-unsent">🚫 โมยกเลิกข้อความ</div>';
        } else if (msg.format === 'image') {
            bubbleContent = `<div class="message-bubble message-image"><img src="${msg.text}" alt="image"></div>`;
        } else {
            // Text message - handle newlines
            const escapedText = msg.text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            // *ท่าทาง* → ตัวเอียง ถ้าทั้งฟองเป็นท่าทาง แสดงแบบไม่มีกรอบ
            const isAction = msg.type === 'received' && /^\*[^*]+\*$/.test(msg.text.trim());
            const withActions = escapedText.replace(/\*([^*<]+)\*/g, '<em class="message-action-text">$1</em>');
            bubbleContent = `<div class="message-bubble${isAction ? ' message-action' : ''}">${withActions}</div>`;
        }

        // รีแอคของโม (ใต้ฟองของเอง)
        if (msg.reaction) bubbleContent += `<div class="message-reaction">${msg.reaction}</div>`;

        // ข้อความที่ตอบกลับ แสดงเหนือฟอง
        if (msg.replyTo) {
            const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const who = msg.replyTo.type === 'received' ? 'โม' : 'เรา';
            bubbleContent = `<div class="reply-quote" data-reply-id="${esc(msg.replyTo.id)}"><strong>${who}</strong>${esc(msg.replyTo.text)}</div>` + bubbleContent;
        }

        if (msg.type === 'received') {
            wrapper.innerHTML = `
                <div class="message-avatar">
                    <img src="mo_avatar.jpg" alt="Mo">
                </div>
                <div>
                    ${bubbleContent}
                    <div class="message-time">${msg.time}</div>
                </div>
            `;
        } else {
            const readMark = msg.read === true ? ' · อ่านแล้ว' : msg.read === false ? ' · ส่งแล้ว' : '';
            wrapper.innerHTML = `
                <div>
                    ${bubbleContent}
                    <div class="message-time">${msg.time}${msg.edited ? ' · แก้ไขแล้ว' : ''}${readMark}</div>
                </div>
            `;
        }

        this.container.appendChild(wrapper);
        this.regroup(wrapper);
    }

    /**
     * Render all messages (for loading history)
     */
    renderAllMessages() {
        this.container.innerHTML = '';
        this._lastDay = null;
        this.messages.forEach(msg => this.renderMessage(msg));
        this.scrollToBottom();
    }

    /**
     * Show typing indicator
     */
    showTyping() {
        this.isTyping = true;
        this.typingIndicator.classList.remove('hidden');
        document.getElementById('user-status').textContent = 'กำลังพิมพ์...';
        this.scrollToBottom();
    }

    /**
     * Hide typing indicator
     */
    hideTyping() {
        this.isTyping = false;
        this.typingIndicator.classList.add('hidden');
        document.getElementById('user-status').textContent = this.life ? this.life.headerStatus() : 'ออนไลน์';
    }

    /**
     * Scroll to bottom of chat
     */
    scrollToBottom() {
        requestAnimationFrame(() => {
            this.chatArea.scrollTop = this.chatArea.scrollHeight;
        });
    }

    /**
     * Format time for display
     */
    formatTime(date) {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    /**
     * Show notification toast
     */
    showNotification(message) {
        const toast = document.getElementById('notification-toast');
        const toastMsg = document.getElementById('toast-message');
        toastMsg.textContent = message.substring(0, 50);
        
        toast.classList.remove('hidden');
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.classList.add('hidden');
            }, 500);
        }, 3000);
    }

    /**
     * Get message count
     */
    getMessageCount() {
        return this.messages.length;
    }
}

// Export
window.MoChat = MoChat;
