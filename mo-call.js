/* ============================================
   Mo Call 📞 - Voice Call System
   โทรหาโม / โมโทรหาเรา
   คุยด้วยเสียงจริง: ฟังผ่านไมค์ (SpeechRecognition) → โมตอบ → อ่านออกเสียง (speechSynthesis)
   ============================================ */

class MoCall {
    constructor(memory) {
        this.memory = memory;
        this.isInCall = false;
        this.callStartTime = null;
        this.callTimerInterval = null;
        this.callDuration = 0;

        // Voice
        this.responder = null;        // async (text) => คำตอบของโม (ตั้งจาก app.js)
        this.recognition = null;
        this.isListening = false;
        this.isMuted = false;
        this.isSpeakerOn = true;
        this.isBusy = false;          // กำลังคิด/กำลังพูด
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.voiceSupported = Boolean(SR && window.speechSynthesis);
        if (this.voiceSupported) this.setupRecognition(SR);

        // DOM elements
        this.callScreen = document.getElementById('call-screen');
        this.callStatus = document.getElementById('call-status');
        this.callTimer = document.getElementById('call-timer');
        this.callTranscript = document.getElementById('call-transcript');
        this.incomingCall = document.getElementById('incoming-call');
        this.callParticles = document.getElementById('call-particles');

        this.init();
    }

    init() {
        // User initiates call
        document.getElementById('btn-call').addEventListener('click', () => this.startOutgoingCall());
        document.getElementById('btn-video').addEventListener('click', () => this.startOutgoingCall());

        // End call
        document.getElementById('btn-end-call').addEventListener('click', () => this.endCall());

        // Mute = ปิดไมค์, Speaker = ปิด/เปิดเสียงโม
        document.getElementById('btn-mute').addEventListener('click', (e) => {
            e.currentTarget.classList.toggle('active');
            this.isMuted = e.currentTarget.classList.contains('active');
            if (this.isMuted) {
                this.stopListening();
                this.setStatus('ปิดไมค์อยู่ 🔇');
            } else {
                this.listen();
            }
        });
        document.getElementById('btn-speaker').addEventListener('click', (e) => {
            e.currentTarget.classList.toggle('active');
            this.isSpeakerOn = !e.currentTarget.classList.contains('active');
            if (!this.isSpeakerOn) window.speechSynthesis?.cancel();
        });

        // Incoming call buttons
        document.getElementById('btn-accept-call').addEventListener('click', () => this.acceptIncomingCall());
        document.getElementById('btn-decline-call').addEventListener('click', () => this.declineIncomingCall());

        // Generate particles
        this.generateParticles();
    }

    /**
     * ตั้งฟังก์ชันที่ใช้สร้างคำตอบของโม
     */
    setResponder(fn) {
        this.responder = fn;
    }

    /**
     * Generate floating particles for call background
     */
    generateParticles() {
        for (let i = 0; i < 30; i++) {
            const particle = document.createElement('div');
            particle.className = 'call-particle';
            particle.style.left = `${Math.random() * 100}%`;
            particle.style.top = `${Math.random() * 100}%`;
            particle.style.animationDelay = `${Math.random() * 8}s`;
            particle.style.animationDuration = `${6 + Math.random() * 6}s`;
            particle.style.width = `${2 + Math.random() * 4}px`;
            particle.style.height = particle.style.width;
            this.callParticles.appendChild(particle);
        }
    }

    /**
     * Start outgoing call
     */
    /**
     * โทรหาโม: opts.urgent = เรื่องด่วน (โมรับแน่นอน) — ปกติโมรับตามสถานการณ์ (canAnswer จาก app.js)
     */
    startOutgoingCall(opts = {}) {
        if (this.isInCall) return;

        this.callScreen.classList.remove('hidden');
        this.setStatus(opts.urgent ? '🚨 กำลังโทรด่วน...' : 'กำลังโทร...');
        this.callTimer.classList.add('hidden');
        this.showTranscript('');

        const plan = this.canAnswer ? this.canAnswer(opts) : { answer: true, delay: 2000 + Math.random() * 3000 };
        this.greetingOverride = plan.greeting || null;
        if (!plan.answer) {
            // ไม่มีคนรับ: ดังไปสักพักแล้วตัดสาย
            this._connectTimeout = setTimeout(() => {
                this.setStatus('โมไม่รับสาย 📵');
                setTimeout(() => {
                    this.callScreen.classList.add('hidden');
                    if (this.onMissed) this.onMissed();
                }, 1800);
            }, 20000);
            return;
        }
        this._connectTimeout = setTimeout(() => {
            this.connectCall();
        }, plan.delay);
    }

    /**
     * Mo calls user (incoming call)
     */
    startIncomingCall() {
        if (this.isInCall) return;
        this.incomingCall.classList.remove('hidden');

        // Auto-decline after 30 seconds
        this._incomingTimeout = setTimeout(() => {
            this.declineIncomingCall();
        }, 30000);
    }

    /**
     * Accept incoming call
     */
    acceptIncomingCall() {
        clearTimeout(this._incomingTimeout);
        this.incomingCall.classList.add('hidden');
        this.callScreen.classList.remove('hidden');
        this.setStatus('กำลังเชื่อมต่อ...');
        this.callTimer.classList.add('hidden');
        this.showTranscript('');

        this._connectTimeout = setTimeout(() => {
            this.connectCall();
        }, 1000);
    }

    /**
     * Decline incoming call
     */
    declineIncomingCall() {
        clearTimeout(this._incomingTimeout);
        this.incomingCall.classList.add('hidden');
    }

    /**
     * Connect call (Mo answers)
     */
    connectCall() {
        this.isInCall = true;
        this.callStartTime = Date.now();
        this.callDuration = 0;

        // Update status
        this.setStatus('เชื่อมต่อแล้ว');
        this.callTimer.classList.remove('hidden');
        this.callTimer.textContent = '00:00';

        // Show Mo's greeting
        const greetings = [
            'โย่ววว~ ว่าไงไอ้ดื้อ 55555',
            'เฮ้~ มีอะไรเล่าให้ฟังเหรอ',
            'อ้าวว โทรมาพอดีเลย ว่าไงง',
            'ฮัลโหลลล~ กำลังคิดถึงอยู่พอดี',
        ];

        this._greetingTimeout = setTimeout(() => {
            const name = this.memory.data.longTerm.userName;
            const greeting = this.greetingOverride || greetings[Math.floor(Math.random() * greetings.length)];
            const text = name ? greeting.replace('ไอ้ดื้อ', name) : greeting;
            if (this.voiceSupported) {
                this.moSays(text);
            } else {
                this.setStatus(text);
                this.showTranscript('เบราว์เซอร์นี้ฟังเสียงไม่ได้ ลองเปิดด้วย Chrome นะ');
            }
        }, 1500);

        // Start timer
        this.callTimerInterval = setInterval(() => {
            this.callDuration++;
            this.updateTimerDisplay();

            // ไม่มีระบบเสียง → โมพูดแทรกแบบสุ่มเหมือนเดิม
            if (!this.voiceSupported && this.callDuration % 15 === 0 && Math.random() < 0.5) {
                this.showCallChat();
            }
        }, 1000);

        this.memory.incrementCalls();
    }

    // =============================================
    //  Voice: ฟัง → คิด → พูด
    // =============================================

    setupRecognition(SR) {
        const rec = new SR();
        rec.lang = 'th-TH';
        rec.interimResults = true;
        rec.continuous = false;

        rec.onresult = (e) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const text = e.results[i][0].transcript;
                if (e.results[i].isFinal) {
                    this.handleUserSpeech(text.trim());
                    return;
                }
                interim += text;
            }
            this.showTranscript(`เอง: ${interim}`);
        };
        rec.onend = () => {
            this.isListening = false;
            this.callStatus.classList.remove('listening');
            // เงียบไป/จบประโยค → ฟังต่อถ้ายังไม่ได้ทำอย่างอื่น
            if (this.isInCall && !this.isBusy && !this.isMuted) {
                setTimeout(() => this.listen(), 300);
            }
        };
        rec.onerror = (e) => {
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                this.isMuted = true;
                this.setStatus('เค้าไม่ได้ยินเสียงเลย 🥺');
                this.showTranscript('อนุญาตให้ใช้ไมค์ก่อนนะ แล้วโทรใหม่อีกที');
            }
        };
        this.recognition = rec;
    }

    listen() {
        if (!this.recognition || !this.isInCall || this.isMuted || this.isListening || this.isBusy) return;
        try {
            this.recognition.start();
            this.isListening = true;
            this.setStatus('เค้าฟังอยู่นะ', true);
        } catch (e) {
            // start() ซ้อนกัน → ข้าม
        }
    }

    stopListening() {
        if (this.recognition && this.isListening) {
            this.recognition.abort();
        }
        this.isListening = false;
        this.callStatus.classList.remove('listening');
    }

    async handleUserSpeech(text) {
        if (!text || !this.isInCall) return;
        this.isBusy = true;
        this.stopListening();
        this.showTranscript(`เอง: ${text}`);
        this.setStatus('อืมม...');

        let reply = 'อื้ม เค้าฟังอยู่นะ';
        try {
            if (this.responder) reply = await this.responder(text);
        } catch (e) {
            console.warn('Call responder failed:', e);
        }
        if (!this.isInCall) return;
        this.moSays(reply);
    }

    /**
     * โมพูด: แสดงข้อความ + อ่านออกเสียง แล้วกลับไปฟังต่อ
     */
    moSays(text) {
        this.isBusy = true;
        this.setStatus(text);

        const done = () => {
            this.isBusy = false;
            if (this.isInCall) this.listen();
        };

        if (!this.isSpeakerOn) {
            setTimeout(done, 1200);
            return;
        }

        // เสียงโมจริง (Gemini TTS เดียวกับข้อความเสียง) — ไม่ได้ค่อยใช้เสียงเบราว์เซอร์
        if (this.tts) {
            const token = this._speakToken = Date.now();
            this.tts(this.toSpeakable(text)).then(blob => {
                if (this._speakToken !== token || !this.isInCall) return;
                const audio = new Audio(URL.createObjectURL(blob));
                this._audio = audio;
                audio.onended = audio.onerror = () => { URL.revokeObjectURL(audio.src); this._audio = null; done(); };
                audio.play().catch(() => this.speakBrowser(text, done));
            }).catch(() => this.speakBrowser(text, done));
            return;
        }
        this.speakBrowser(text, done);
    }

    speakBrowser(text, done) {
        if (!window.speechSynthesis) {
            setTimeout(done, 1200);
            return;
        }

        const utter = new SpeechSynthesisUtterance(this.toSpeakable(text));
        utter.lang = 'th-TH';
        const thaiVoice = speechSynthesis.getVoices().find(v => v.lang && v.lang.startsWith('th'));
        if (thaiVoice) utter.voice = thaiVoice;
        utter.pitch = 1.2;
        utter.rate = 1.05;
        utter.onend = done;
        utter.onerror = done;
        speechSynthesis.cancel();
        speechSynthesis.speak(utter);
    }

    /**
     * ตัด emoji และแปลง 555 ให้อ่านออกเสียงได้ธรรมชาติ
     */
    toSpeakable(text) {
        return text
            .replace(/\*[^*]*\*/g, '')
            .replace(/5{3,}/g, 'ฮ่าๆๆ')
            .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
            .replace(/~/g, '')
            .trim();
    }

    setStatus(text, listening = false) {
        this.callStatus.textContent = text;
        this.callStatus.classList.toggle('listening', listening);
    }

    showTranscript(text) {
        this.callTranscript.textContent = text;
        this.callTranscript.classList.toggle('hidden', !text);
    }

    /**
     * Show random chat during call
     */
    showCallChat() {
        const chats = [
            '555555 ไอ้บ้าเอ๊ย',
            'เห้ยยย จริงดิ!',
            'อืมม เค้าฟังอยู่นะ',
            'แล้วไงต่อ เล่าเพิ่มหน่อย',
            'โอ๊ยยย เองนี่นะ 55555',
            'อ๋ออ เข้าใจละ',
            'เดี๋ยวก่อนนน เค้าอยากรู้เรื่องนี้!',
            'อื้ม เค้าฟังอยู่',
        ];

        this.callStatus.textContent = chats[Math.floor(Math.random() * chats.length)];
    }

    /**
     * Update timer display
     */
    updateTimerDisplay() {
        const minutes = Math.floor(this.callDuration / 60).toString().padStart(2, '0');
        const seconds = (this.callDuration % 60).toString().padStart(2, '0');
        this.callTimer.textContent = `${minutes}:${seconds}`;
    }

    /**
     * End call
     */
    endCall() {
        this.isInCall = false;
        this.urgentNote = null;
        if (this._audio) { this._audio.pause(); this._audio = null; }
        // ยกเลิกการต่อสายที่ยังค้างอยู่ (กรณีวางสายก่อนโมรับ)
        clearTimeout(this._connectTimeout);
        clearTimeout(this._greetingTimeout);
        clearInterval(this.callTimerInterval);
        this.stopListening();
        this.isBusy = false;
        window.speechSynthesis?.cancel();

        // Show ending animation
        this.setStatus('วางสาย 💕');
        this.callTimer.classList.add('hidden');
        this.showTranscript('');

        setTimeout(() => {
            this.callScreen.classList.add('hidden');
        }, 1000);

        // Return call duration
        return this.callDuration;
    }

    /**
     * Check if currently in a call
     */
    getCallStatus() {
        return this.isInCall;
    }
}

// Export
window.MoCall = MoCall;
