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
        document.getElementById('btn-video').addEventListener('click', () => this.startOutgoingCall({ video: true }));
        document.getElementById('btn-camera-toggle').addEventListener('click', () => this.toggleCamera());

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

        // วิดีโอคอล: เห็นหน้าเองมุมจอ + โมมองเห็นเองผ่านกล้อง
        this.videoMode = Boolean(opts.video);
        this.callScreen.classList.toggle('video-mode', this.videoMode);
        if (this.videoMode) this.startCamera();
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
        this.startRingtone();

        // Auto-decline after 30 seconds
        this._incomingTimeout = setTimeout(() => {
            this.declineIncomingCall();
        }, 30000);
    }

    /**
     * Accept incoming call
     */
    // =============================================
    //  วิดีโอคอล: กล้องหน้า + ภาพให้โมดู
    // =============================================

    async startCamera() {
        try {
            this.camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false });
            let v = document.getElementById('self-view');
            if (!v) {
                v = document.createElement('video');
                v.id = 'self-view';
                v.autoplay = true;
                v.muted = true;
                v.playsInline = true;
                this.callScreen.appendChild(v);
            }
            v.srcObject = this.camStream;
            v.classList.remove('off');
        } catch (e) {
            this.showTranscript('เปิดกล้องไม่ได้ (ลองอนุญาตกล้องก่อนนะ) — คุยแบบเสียงไปก่อน');
        }
    }

    stopCamera() {
        if (this.camStream) this.camStream.getTracks().forEach(t => t.stop());
        this.camStream = null;
        const v = document.getElementById('self-view');
        if (v) v.srcObject = null;
    }

    toggleCamera() {
        if (!this.videoMode) return;
        const v = document.getElementById('self-view');
        if (this.camStream) {
            this.stopCamera();
            if (v) v.classList.add('off');
        } else {
            this.startCamera();
        }
    }

    // =============================================
    //  โมดูกล้องตลอด: ภาพเปลี่ยนชัดๆ (ยกแมวมา หันกล้องไปที่อื่น) → ให้ AI ดูแล้วโมทักเอง
    // =============================================

    /** ภาพย่อ 32x24 ขาวดำ ไว้เทียบว่าภาพเปลี่ยนไปแค่ไหน */
    thumb() {
        const v = document.getElementById('self-view');
        if (!this.camStream || !v || !v.videoWidth) return null;
        this._thumbCanvas = this._thumbCanvas || Object.assign(document.createElement('canvas'), { width: 32, height: 24 });
        const g = this._thumbCanvas.getContext('2d', { willReadFrequently: true });
        g.drawImage(v, 0, 0, 32, 24);
        const px = g.getImageData(0, 0, 32, 24).data;
        const out = new Uint8Array(32 * 24);
        for (let i = 0; i < out.length; i++) out[i] = (px[i * 4] * 3 + px[i * 4 + 1] * 6 + px[i * 4 + 2]) / 10;
        return out;
    }

    sceneChange(a, b) {
        if (!a || !b) return 1;
        let changed = 0;
        for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 28) changed++;
        return changed / a.length;
    }

    startWatching() {
        this.stopWatching();
        this._lastSeen = null;
        this._lastLook = Date.now();
        this._watch = setInterval(async () => {
            if (!this.isInCall || !this.videoMode || this.isBusy || this._looking || !this.onLook) return;
            const now = this.thumb();
            if (!now) return;
            const change = this.sceneChange(this._lastSeen, now);
            // ภาพเปลี่ยน ≥ 25% (มีอะไรเข้ามาในกล้อง) และห่างจากครั้งก่อน ≥ 6 วิ / หรือเงียบนาน 45 วิ ก็ชำเลืองดูบ้าง
            const quietLong = Date.now() - this._lastLook > 45000;
            if ((change < 0.25 && !quietLong) || Date.now() - this._lastLook < 6000) {
                if (!this._lastSeen) this._lastSeen = now;
                return;
            }
            this._lastSeen = now;
            this._lastLook = Date.now();
            const frame = this.captureFrame();
            if (!frame) return;
            this._looking = true;
            try {
                const say = await this.onLook(frame, { change, quietLong });
                if (say && this.isInCall && !this.isBusy) {
                    this.stopListening();
                    this.showTranscript('👀');
                    this.moSays(say);
                }
            } catch (e) {
                // ดูไม่สำเร็จ → ข้าม
            } finally {
                this._looking = false;
            }
        }, 1500);
    }

    stopWatching() {
        clearInterval(this._watch);
        this._watch = null;
    }

    /**
     * ภาพจากกล้องตอนนี้ (JPEG เล็กๆ) ให้โมดูว่าเห็นอะไร — ไม่มีกล้อง → null
     */
    captureFrame() {
        const v = document.getElementById('self-view');
        if (!this.videoMode || !this.camStream || !v || !v.videoWidth) return null;
        const w = 384;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = Math.round(v.videoHeight * (w / v.videoWidth));
        canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.7);
    }

    /**
     * เสียงเรียกเข้า (สร้างเอง) + สั่นเป็นจังหวะ จนกว่าจะรับ/ปฏิเสธ
     */
    startRingtone() {
        this.stopRingtone();
        const ring = () => {
            try {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                this._ringCtx = this._ringCtx || new Ctx();
                const ctx = this._ringCtx;
                if (ctx.state === 'suspended') ctx.resume();
                [0, 0.18, 0.5, 0.68].forEach((at, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.frequency.value = i % 2 ? 784 : 988;
                    gain.gain.setValueAtTime(0, ctx.currentTime + at);
                    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + at + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.16);
                    osc.connect(gain).connect(ctx.destination);
                    osc.start(ctx.currentTime + at);
                    osc.stop(ctx.currentTime + at + 0.18);
                });
            } catch (e) {}
            try { if (navigator.vibrate) navigator.vibrate([500, 250, 500]); } catch (e) {}
        };
        ring();
        this._ringTimer = setInterval(ring, 2000);
    }

    stopRingtone() {
        clearInterval(this._ringTimer);
        this._ringTimer = null;
        try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {}
        // แอป Android: เลิกดังสายเรียกเข้าของระบบด้วย (หน้าเว็บดังแทนแล้ว / รับหรือวางแล้ว)
        try { window.Capacitor?.Plugins?.MoNative?.stopRinging(); } catch (e) {}
    }

    acceptIncomingCall() {
        this.stopRingtone();
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
        this.stopRingtone();
        clearTimeout(this._incomingTimeout);
        this.incomingCall.classList.add('hidden');
    }

    /**
     * Connect call (Mo answers)
     */
    connectCall() {
        this.isInCall = true;
        if (this.videoMode) this.startWatching();
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
                this.callScreen.classList.add('speaking');
                audio.onended = audio.onerror = () => { URL.revokeObjectURL(audio.src); this._audio = null; this.callScreen.classList.remove('speaking'); done(); };
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
        this.callScreen.classList.add('speaking');
        utter.onend = utter.onerror = () => { this.callScreen.classList.remove('speaking'); done(); };
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
        this.stopWatching();
        this.stopCamera();
        this.videoMode = false;
        this.callScreen.classList.remove('video-mode', 'speaking');
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
