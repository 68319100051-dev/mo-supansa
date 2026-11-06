/* =============================================
   โหมดเสียง (โฮโลแกรม): พูด → โมฟัง → ตอบเป็นเสียง / สั่งงานได้
   - แอป Android: ฟังด้วย SpeechRecognizer + พูดด้วย TextToSpeech ของเครื่อง (MoNative.listen / speak)
   - เบราว์เซอร์: Web Speech API (ถ้ามี)
   - สั่งงาน (เปิดเพลง ฯลฯ) → หน้าต่างโฮโลแกรมเด้งขึ้นมาบอกว่าทำอะไร (event "mo:action")
   ทนทาน: ทุกขั้นมีเวลาหมด, ไม่ส่งซ้อนตอนโมกำลังพิมพ์, กลับจากแอปอื่นแล้วฟังต่อ, ปุ่มย้อนกลับ = ออก
   ============================================= */
class MoVoiceMode {
    constructor(chat) {
        this.chat = chat;
        this.on = false;
        this.state = 'idle';
        this.spoken = [];          // คำตอบของโมที่รอพูด
        this.lastReplyAt = 0;
        this.loopId = 0;
        this.booted = false;       // บูตเต็มครั้งแรก ครั้งต่อไปเร็ว
        this.native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
            && window.Capacitor.Plugins && window.Capacitor.Plugins.MoNative && window.Capacitor.Plugins.MoNative.listen
            ? window.Capacitor.Plugins.MoNative : null;
        this.SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.supported = Boolean(this.native || (this.SR && window.speechSynthesis));
        this.injectStyle();
        this.build();

        // จับคำตอบของโมไว้พูด (เฉพาะตอนเปิดโหมดเสียง)
        const add = chat.addMessage.bind(chat);
        chat.addMessage = (type, text, format = 'text', extra = null, replyTo = null) => {
            const msg = add(type, text, format, extra, replyTo);
            try {
                if (this.on && type === 'received') {
                    this.lastReplyAt = Date.now();
                    const say = format === 'text' ? text
                        : format === 'voice' && extra ? extra.text
                        : format === 'song' && extra ? `ส่งเพลง ${extra.title || ''} ให้นะ` : '';
                    if (say) {
                        this.spoken.push(say);
                        this.subtitle(say);
                        // โมทักมาเองตอนไม่ได้คุยกัน → พูดเลย
                        if (this.state === 'idle') this.drainIdle();
                    }
                }
            } catch (e) {}
            return msg;
        };

        window.addEventListener('mo:action', e => this.on && this.panel(e.detail || {}));
        document.addEventListener('visibilitychange', () => {
            if (!this.on) return;
            if (document.hidden) {
                this.halt('idle');
                this.spoken = [];   // ไปแอปอื่นแล้ว ไม่ต้องพูดค้างตอนกลับมา
                this.resumeOnReturn = true;
            } else if (this.resumeOnReturn) {
                this.resumeOnReturn = false;
                setTimeout(() => this.on && this.state === 'idle' && this.listenLoop(), 700);
            }
        });
        // ปุ่มย้อนกลับ (Android / เบราว์เซอร์) = ออกจากโหมดเสียง
        window.addEventListener('popstate', () => { if (this.on) this.toggle(false, true); });
        if (this.native && this.native.addListener) {
            this.native.addListener('voiceLevel', d => this.level(d.level));
            this.native.addListener('voicePartial', d => this.state === 'listening' && this.heard(d.text, true));
        }
    }

    // =============== เปิด/ปิด ===============

    async toggle(force, fromBack) {
        const want = force !== undefined ? force : !this.on;
        if (want === this.on || this.switching) return;
        if (want && !this.supported) {
            this.chat.showNotification('เครื่องนี้ยังฟังเสียงพูดไม่ได้ 🥺 ลองใน Chrome หรือแอปโมบนมือถือนะ');
            return;
        }
        this.switching = true;
        try {
            const btn = document.getElementById('btn-voice-mode');
            if (btn) btn.setAttribute('aria-pressed', String(want));
            if (want) await this.open(btn);
            else await this.close(fromBack);
        } finally {
            this.switching = false;
        }
    }

    async open(btn) {
        this.on = true;
        // วงเปิดขยายออกจากปุ่ม
        const r = btn ? btn.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight, width: 0, height: 0 };
        this.root.style.setProperty('--ox', `${r.left + r.width / 2}px`);
        this.root.style.setProperty('--oy', `${r.top + r.height / 2}px`);
        this.root.hidden = false;
        this.root.className = 'holo opening booting';
        document.body.classList.add('voice-mode');
        try { history.pushState({ moVoice: 1 }, ''); this.pushed = true; } catch (e) {}
        this.keepAwake(true);
        const micOk = await Promise.all([this.boot(), this.ensureMic()]).then(([, ok]) => ok);
        if (!this.on) return;
        this.root.className = 'holo ready';
        if (!micOk) return this.setState('error', 'ยังไม่ได้อนุญาตไมค์ — แตะวงกลมเพื่อลองใหม่');
        this.greet();
    }

    async close(fromBack) {
        this.on = false;
        this.halt('idle');
        this.keepAwake(false);
        if (this.pushed && !fromBack) { this.pushed = false; try { history.back(); } catch (e) {} }
        this.pushed = false;
        this.root.classList.add('closing');
        document.body.classList.remove('voice-mode');
        await this.wait(420);
        if (!this.on) { this.root.hidden = true; this.root.className = 'holo'; }
    }

    async boot() {
        const quick = this.booted;
        const lines = quick
            ? ['reconnecting voice core ... ok']
            : ['MO-OS v2.6 // voice core', 'linking memory .......... ok', 'loading personality ..... ok', 'calibrating microphone .. ok', 'hologram online'];
        const log = this.root.querySelector('.holo-boot-log');
        const bar = this.root.querySelector('.holo-boot-bar i');
        log.textContent = '';
        bar.style.width = '0%';
        this.skipBoot = false;
        for (let i = 0; i < lines.length && !this.skipBoot; i++) {
            if (!this.on) return;
            log.textContent += (i ? '\n' : '') + '> ' + lines[i];
            bar.style.width = `${Math.round(((i + 1) / lines.length) * 100)}%`;
            await this.wait(quick ? 380 : 240);
        }
        bar.style.width = '100%';
        this.booted = true;
        await this.wait(this.skipBoot ? 60 : 220);
    }

    /** ขอสิทธิ์ไมค์ก่อน (แอปจะเด้งถามครั้งแรก) */
    async ensureMic() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return true;
        try {
            const s = await this.timeout(navigator.mediaDevices.getUserMedia({ audio: true }), 15000, null);
            if (!s) return false;
            s.getTracks().forEach(t => t.stop());
            return true;
        } catch (e) {
            return false;
        }
    }

    async greet() {
        const name = (this.chat.memory && this.chat.memory.getUserName && this.chat.memory.getUserName()) || 'เอง';
        const hi = ['ว่าไง', 'มาแล้ว', 'เค้าฟังอยู่นะ'][Math.floor(Math.random() * 3)];
        const id = ++this.loopId;
        this.subtitle(`${hi} ${name} 💗`);
        this.setState('speaking', '');
        await this.say(`${hi} ${name}`);
        if (this.on && id === this.loopId) this.listenLoop();
    }

    halt(state = 'idle') {
        this.loopId++;
        try { this.native ? this.native.stopListening().catch(() => {}) : (this.rec && this.rec.abort()); } catch (e) {}
        try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {}
        this.root.classList.remove('talking');
        this.level(0);
        if (state) this.setState(state, 'แตะวงกลมเพื่อพูด');
    }

    // =============== วงฟัง → ส่ง → พูดตอบ ===============

    async listenLoop() {
        const id = ++this.loopId;
        const alive = () => this.on && id === this.loopId && !document.hidden;
        let misses = 0;
        while (alive()) {
            this.setState('listening', 'ฟังอยู่... พูดได้เลย');
            this.heard('');
            const r = await this.listen();
            if (!alive()) return;
            this.level(0);
            const text = (r.text || '').trim();
            if (!text) {
                if (r.error === 'permission') return this.setState('error', 'ยังไม่ได้อนุญาตไมค์ — แตะวงกลมเพื่อลองใหม่');
                if (r.error === 'unavailable') return this.setState('error', 'เครื่องนี้ไม่มีตัวฟังเสียง (ต้องมีแอป Google)');
                if (r.error === 'busy') { await this.wait(800); continue; }
                if (++misses >= 2) return this.setState('idle', 'ไม่ได้ยินเลย แตะวงกลมเพื่อพูดใหม่');
                await this.wait(250);
                continue;
            }
            misses = 0;
            this.heard(text);
            if (/^(?:โม\s*)?(?:ปิดโหมดเสียง|กลับไปแชท|พอแล้ว(?:นะ)?|บาย(?:บาย)?|ออก(?:ไป)?)$/.test(text)) {
                this.setState('speaking', '');
                await this.say('โอเค กลับไปพิมพ์กันนะ');
                return this.toggle(false);
            }
            this.setState('thinking', 'กำลังคิด...');
            // โมยังพิมพ์ข้อความก่อนหน้าอยู่ → รอก่อน ไม่งั้นข้อความหาย
            for (let t = 0; this.chat.isTyping && t < 60 && alive(); t++) await this.wait(250);
            if (!alive()) return;
            const before = this.lastReplyAt;
            this.chat.input.value = text.replace(/^โม\s+/, '');
            this.chat.sendMessage();
            if (this.chat.input.value) {   // ส่งไม่ออก (เช่น อยู่ในโหมดแก้ข้อความ)
                this.chat.input.value = '';
                return this.setState('idle', 'ส่งไม่ได้แฮะ แตะวงกลมเพื่อลองใหม่');
            }
            await this.untilReplied(before, alive);
            await this.speakAll(alive);
            if (alive()) await this.wait(250);   // ให้ตัวฟังเสียงพร้อมก่อนฟังรอบใหม่
        }
    }

    async speakAll(alive) {
        const t0 = Date.now();
        while (alive() && Date.now() - t0 < 120000 && (this.spoken.length || this.busy())) {
            if (this.spoken.length) {
                this.setState('speaking', '');
                await this.say(this.spoken.shift());
            } else await this.wait(250);
        }
    }

    /** โมทักมาเองตอนพักอยู่ → พูดออกเสียง (ไม่เริ่มฟังเอง) */
    async drainIdle() {
        if (this.draining || !this.on) return;
        this.draining = true;
        const id = this.loopId;
        await this.wait(400);
        while (this.on && id === this.loopId && this.state === 'idle' && this.spoken.length) await this.say(this.spoken.shift());
        this.draining = false;
    }

    busy() {
        return this.chat.isTyping || this.chat.pendingReply || Date.now() - this.lastReplyAt < 1500;
    }

    async untilReplied(before, alive) {
        const t0 = Date.now();
        while (alive() && this.lastReplyAt === before && Date.now() - t0 < 45000) await this.wait(200);
        if (alive() && this.lastReplyAt === before) this.subtitle('โมตอบช้าไปหน่อย ลองพูดใหม่นะ');
    }

    /** ฟัง 1 ประโยค → { text, error } (ไม่ค้างเกิน 20 วิ) */
    listen() {
        if (this.native) {
            return this.timeout(this.native.listen().then(r => {
                const e = r && r.error;
                // 8 = ตัวฟังยังไม่ว่าง, 9 = ไม่มีสิทธิ์
                return { text: (r && r.text) || '', error: e === '8' ? 'busy' : e === '9' ? 'permission' : e };
            }), 20000, { text: '', error: 'timeout' }).catch(() => ({ text: '', error: 'fail' }));
        }
        return new Promise(resolve => {
            let rec;
            try { rec = this.rec = new this.SR(); } catch (e) { return resolve({ text: '', error: 'unavailable' }); }
            rec.lang = 'th-TH';
            rec.interimResults = true;
            let final = '', interim = '', err = '';
            rec.onresult = e => {
                interim = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    if (e.results[i].isFinal) final += e.results[i][0].transcript;
                    else interim += e.results[i][0].transcript;
                }
                this.heard(final + interim, true);
                this.level(6);
            };
            rec.onerror = e => { err = e.error === 'not-allowed' ? 'permission' : e.error; };
            rec.onend = () => resolve({ text: final || interim, error: err });
            try { rec.start(); } catch (e) { resolve({ text: '', error: 'busy' }); }
            setTimeout(() => { try { rec.stop(); } catch (e) {} }, 15000);
        });
    }

    say(text) {
        const clean = String(text || '')
            .replace(/\[[^\]]*\]/g, '')
            .replace(/https?:\/\/\S+/g, '')
            .replace(/5{3,}/g, ' ฮ่าๆๆ ')
            .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
            .replace(/\s+/g, ' ').trim().slice(0, 400);
        if (!clean) return Promise.resolve();
        this.root.classList.add('talking');
        const end = () => this.root.classList.remove('talking');
        const limit = 4000 + clean.length * 180;   // ไม่ค้างถ้าตัวอ่านเสียงไม่ตอบ
        if (this.native && this.native.speak) return this.timeout(this.native.speak({ text: clean }), limit).catch(() => {}).then(end);
        return this.timeout(new Promise(resolve => {
            if (!window.speechSynthesis) return resolve();
            const u = new SpeechSynthesisUtterance(clean);
            u.lang = 'th-TH'; u.pitch = 1.2; u.rate = 1.05;
            const v = speechSynthesis.getVoices().find(x => x.lang && x.lang.startsWith('th'));
            if (v) u.voice = v;
            u.onend = u.onerror = () => resolve();
            speechSynthesis.cancel();
            speechSynthesis.speak(u);
        }), limit).then(end);
    }

    keepAwake(on) {
        try {
            if (on && navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { this.wake = l; }).catch(() => {});
            else if (this.wake) { this.wake.release().catch(() => {}); this.wake = null; }
        } catch (e) {}
    }

    // =============== หน้าจอ ===============

    setState(state, label) {
        this.state = state;
        this.root.dataset.state = state;
        if (label !== undefined) this.stateEl.textContent = label;
        const chip = { idle: 'STANDBY', listening: 'LISTENING', thinking: 'PROCESSING', speaking: 'SPEAKING', error: 'ATTENTION' }[state] || '';
        this.chipEl.textContent = chip;
        this.coreBtn.setAttribute('aria-label', state === 'idle' || state === 'error' ? 'แตะเพื่อพูด' : 'แตะเพื่อหยุด');
    }

    heard(text, partial) {
        this.heardEl.textContent = text ? `“${text}”` : '';
        this.heardEl.classList.toggle('partial', Boolean(partial));
    }

    subtitle(text) {
        this.subEl.textContent = String(text || '').replace(/\[[^\]]*\]/g, '').trim();
    }

    level(db) {
        const v = Math.max(0, Math.min(10, Number(db) || 0));
        this.root.style.setProperty('--lvl', (1 + v / 25).toFixed(3));
        this.root.style.setProperty('--lv', (v / 10).toFixed(2));
    }

    /** หน้าต่างโฮโลแกรมเด้งขึ้นมาตอนสั่งงาน: { icon, title, detail, kind } */
    panel({ icon = '◆', title = '', detail = '', kind = '' }) {
        const el = document.createElement('div');
        el.className = `holo-panel ${kind}`;
        el.innerHTML = `<div class="holo-panel-head"><span class="holo-panel-icon"></span><span class="holo-panel-title"></span><button class="holo-panel-x" type="button" aria-label="ปิด">×</button></div>
            <div class="holo-panel-body"></div>${kind === 'music' ? '<div class="holo-eq">' + '<i></i>'.repeat(14) + '</div>' : ''}
            <div class="holo-panel-foot">${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · EXEC OK</div>`;
        el.querySelector('.holo-panel-icon').textContent = icon;
        el.querySelector('.holo-panel-title').textContent = title;
        el.querySelector('.holo-panel-body').textContent = detail;
        el.querySelector('.holo-panel-x').addEventListener('click', () => this.closePanel(el));
        this.panels.prepend(el);
        [...this.panels.children].slice(2).forEach(p => this.closePanel(p));
        setTimeout(() => this.closePanel(el), 8000);
    }

    closePanel(el) {
        if (!el.isConnected || el.classList.contains('out')) return;
        el.classList.add('out');
        setTimeout(() => el.remove(), 350);
    }

    wait(ms) { return new Promise(r => setTimeout(r, ms)); }

    timeout(p, ms, fallback) {
        return Promise.race([p, new Promise(r => setTimeout(() => r(fallback), ms))]);
    }

    build() {
        const root = this.root = document.createElement('div');
        root.className = 'holo';
        root.hidden = true;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', 'โหมดพูดคุยด้วยเสียง');
        root.innerHTML = `
            <div class="holo-grid"></div><div class="holo-scan"></div>
            <div class="holo-boot">
                <div class="holo-boot-orb"><img src="mo_avatar.jpg" alt=""></div>
                <div class="holo-boot-title">MO // VOICE</div>
                <pre class="holo-boot-log"></pre>
                <div class="holo-boot-bar"><i></i></div>
                <div class="holo-boot-skip">แตะเพื่อข้าม</div>
            </div>
            <div class="holo-top">
                <div class="holo-switch" role="group" aria-label="สลับโหมด">
                    <button type="button" class="holo-switch-chat">💬 แชท</button>
                    <button type="button" class="holo-switch-voice" aria-pressed="true">🎙️ เสียง</button>
                </div>
                <span class="holo-chip">STANDBY</span>
            </div>
            <div class="holo-panels"></div>
            <div class="holo-stage">
                <button class="holo-core" type="button" aria-label="แตะเพื่อพูด">
                    <svg class="holo-rings" viewBox="0 0 200 200" aria-hidden="true">
                        <circle cx="100" cy="100" r="96" class="r1"/><circle cx="100" cy="100" r="84" class="r2"/><circle cx="100" cy="100" r="72" class="r3"/>
                    </svg>
                    <span class="holo-face"><img src="mo_avatar.jpg" alt=""></span>
                    <span class="holo-beam"></span>
                </button>
                <div class="holo-bars" aria-hidden="true">${'<i></i>'.repeat(9)}</div>
            </div>
            <div class="holo-info">
                <div class="holo-state">แตะวงกลมเพื่อพูด</div>
                <div class="holo-heard"></div>
                <div class="holo-sub"></div>
                <div class="holo-hint">ลองพูด: "เปิดเพลงรัก" · "ปิดเพลง" · "เสียงดังขึ้น" · "พอแล้ว"</div>
            </div>`;
        document.body.appendChild(root);
        this.stateEl = root.querySelector('.holo-state');
        this.chipEl = root.querySelector('.holo-chip');
        this.heardEl = root.querySelector('.holo-heard');
        this.subEl = root.querySelector('.holo-sub');
        this.panels = root.querySelector('.holo-panels');
        this.coreBtn = root.querySelector('.holo-core');
        root.querySelector('.holo-switch-chat').addEventListener('click', () => this.toggle(false));
        root.querySelector('.holo-boot').addEventListener('click', () => { this.skipBoot = true; });
        this.coreBtn.addEventListener('click', async () => {
            if (this.state === 'error') {
                if (!(await this.ensureMic())) return this.setState('error', 'ยังไม่ได้อนุญาตไมค์ — เปิดในตั้งค่าแอปนะ');
                return this.listenLoop();
            }
            if (this.state === 'idle') this.listenLoop();
            else this.halt('idle');
        });
    }

    injectStyle() {
        const css = `
.holo{--c:#5ff3ff;--c2:#ff7ad9;--lvl:1;--lv:0;--ox:50vw;--oy:100vh;position:fixed;inset:0;z-index:9000;overflow:hidden;color:#dffbff;
  background:radial-gradient(120% 80% at 50% 35%,#0b2a4a 0%,#06142a 55%,#020814 100%);font-family:inherit;
  display:flex;flex-direction:column;align-items:center;justify-content:space-between;
  padding:calc(14px + env(safe-area-inset-top,0px)) 16px calc(18px + env(safe-area-inset-bottom,0px))}
.holo[hidden]{display:none}
.holo.opening{animation:holo-reveal .55s cubic-bezier(.6,0,.2,1) both}
.holo.closing{animation:holo-unreveal .42s cubic-bezier(.6,0,.4,1) both}
.holo-grid{position:absolute;inset:-50% -20% 0;background-image:linear-gradient(rgba(95,243,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(95,243,255,.08) 1px,transparent 1px);
  background-size:36px 36px;transform:perspective(500px) rotateX(58deg) translateY(30%);transform-origin:bottom;animation:holo-grid 6s linear infinite;pointer-events:none}
.holo-scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.03) 0 1px,transparent 1px 3px);pointer-events:none}
.holo-boot{position:absolute;inset:0;display:none;flex-direction:column;justify-content:center;align-items:center;gap:14px;background:radial-gradient(80% 60% at 50% 40%,#08223d,#020814);z-index:4;cursor:pointer}
.holo.booting .holo-boot{display:flex}
.holo.booting>:not(.holo-boot):not(.holo-grid):not(.holo-scan){visibility:hidden}
.holo-boot-orb{width:96px;height:96px;border-radius:50%;overflow:hidden;border:2px solid var(--c);box-shadow:0 0 24px var(--c);animation:holo-materialize 1.4s ease both}
.holo-boot-orb img{width:100%;height:100%;object-fit:cover;filter:grayscale(.4) sepia(1) hue-rotate(150deg) saturate(2.2) brightness(1.1);mix-blend-mode:screen}
.holo-boot-title{font-size:20px;letter-spacing:.35em;color:var(--c);text-shadow:0 0 12px var(--c);animation:holo-flicker 1.2s infinite}
.holo-boot-log{margin:0;min-height:6.5em;width:min(320px,86vw);font:12px/1.6 ui-monospace,Consolas,monospace;color:#9feaff;white-space:pre-wrap}
.holo-boot-bar{width:min(320px,86vw);height:4px;background:rgba(95,243,255,.15);border-radius:4px;overflow:hidden}
.holo-boot-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--c),var(--c2));box-shadow:0 0 10px var(--c);transition:width .22s}
.holo-boot-skip{font-size:11px;opacity:.45;letter-spacing:.1em}
.holo-top{position:relative;z-index:2;width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px}
.holo-switch{display:inline-flex;padding:3px;border-radius:999px;border:1px solid rgba(95,243,255,.4);background:rgba(95,243,255,.06)}
.holo-switch button{border:0;background:transparent;color:#bfefff;font:inherit;font-size:13px;padding:7px 12px;border-radius:999px;cursor:pointer}
.holo-switch button[aria-pressed="true"]{background:linear-gradient(135deg,rgba(95,243,255,.35),rgba(255,122,217,.35));color:#fff;box-shadow:0 0 10px rgba(95,243,255,.4)}
.holo-switch button:focus-visible,.holo-core:focus-visible,.holo-panel-x:focus-visible{outline:2px solid var(--c);outline-offset:3px}
.holo-chip{font:11px ui-monospace,Consolas,monospace;letter-spacing:.15em;color:var(--c);border:1px solid rgba(95,243,255,.35);border-radius:4px;padding:4px 8px}
.holo[data-state="listening"] .holo-chip{color:#7dffb0;border-color:rgba(125,255,176,.5)}
.holo[data-state="speaking"] .holo-chip{color:var(--c2);border-color:rgba(255,122,217,.5)}
.holo[data-state="error"] .holo-chip{color:#ffcc66;border-color:rgba(255,204,102,.6)}
.holo-stage{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:14px;margin-top:2vh}
.holo-core{position:relative;width:min(60vw,250px);aspect-ratio:1;border:0;background:none;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
.holo-rings{position:absolute;inset:0;width:100%;height:100%;transform:scale(var(--lvl));transition:transform .08s linear}
.holo-rings circle{fill:none;stroke:var(--c);stroke-linecap:round;filter:drop-shadow(0 0 6px var(--c))}
.holo-rings .r1{stroke-width:1.5;stroke-dasharray:40 18;opacity:.7;transform-origin:center;animation:holo-spin 14s linear infinite}
.holo-rings .r2{stroke-width:3;stroke-dasharray:6 10;opacity:.5;transform-origin:center;animation:holo-spin 9s linear infinite reverse}
.holo-rings .r3{stroke-width:1;opacity:.35}
.holo-face{position:absolute;inset:22%;border-radius:50%;overflow:hidden;box-shadow:0 0 30px rgba(95,243,255,.55),inset 0 0 30px rgba(95,243,255,.6);animation:holo-flicker 4s infinite}
.holo-face img{width:100%;height:100%;object-fit:cover;filter:grayscale(.4) sepia(1) hue-rotate(150deg) saturate(2.2) brightness(1.1) contrast(1.05);opacity:.88;mix-blend-mode:screen}
.holo-face::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(95,243,255,.18) 0 2px,transparent 2px 4px);animation:holo-scanmove 3s linear infinite}
.holo-beam{position:absolute;left:30%;right:30%;bottom:-18%;height:22%;background:radial-gradient(50% 100% at 50% 100%,rgba(95,243,255,.55),transparent);filter:blur(4px)}
.holo-bars{display:flex;gap:4px;align-items:center;height:22px;opacity:.25;transition:opacity .2s}
.holo-bars i{width:4px;border-radius:2px;background:var(--c);height:calc(4px + 18px * var(--lv));transition:height .08s}
.holo-bars i:nth-child(odd){height:calc(4px + 12px * var(--lv))}
.holo[data-state="listening"] .holo-bars{opacity:1}
.holo[data-state="idle"] .holo-rings .r1,.holo[data-state="error"] .holo-rings .r1{animation-duration:30s;opacity:.4}
.holo[data-state="error"] .holo-rings circle{stroke:#ffcc66;filter:drop-shadow(0 0 6px #ffcc66)}
.holo[data-state="listening"] .holo-face{box-shadow:0 0 40px rgba(95,243,255,.9),inset 0 0 30px rgba(95,243,255,.7)}
.holo[data-state="thinking"] .holo-rings .r2{animation-duration:1.2s}
.holo[data-state="thinking"] .holo-rings .r1{animation-duration:3s}
.holo.talking .holo-face{animation:holo-talk .35s ease-in-out infinite alternate;box-shadow:0 0 44px rgba(255,122,217,.8),inset 0 0 30px rgba(255,122,217,.5)}
.holo-info{position:relative;z-index:2;text-align:center;max-width:520px;width:100%;display:flex;flex-direction:column;gap:8px}
.holo-state{font-size:14px;color:var(--c);min-height:1.2em}
.holo[data-state="error"] .holo-state{color:#ffcc66}
.holo-heard{font-size:17px;min-height:1.4em;opacity:.95;overflow-wrap:anywhere}
.holo-heard.partial{opacity:.6}
.holo-sub{font-size:15px;color:#ffd6f3;min-height:1.3em;text-shadow:0 0 8px rgba(255,122,217,.6);overflow-wrap:anywhere;max-height:4.2em;overflow:hidden}
.holo-hint{font-size:11px;opacity:.5;margin-top:4px}
.holo-panels{position:absolute;z-index:3;top:calc(64px + env(safe-area-inset-top,0px));right:12px;left:12px;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none}
.holo-panel{pointer-events:auto;width:min(270px,78%);border:1px solid rgba(95,243,255,.55);border-radius:10px;background:rgba(10,40,70,.62);backdrop-filter:blur(6px);
  box-shadow:0 0 18px rgba(95,243,255,.25),inset 0 0 18px rgba(95,243,255,.08);padding:9px 12px;clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px));
  animation:holo-panel-in .45s cubic-bezier(.2,.9,.3,1.2)}
.holo-panel.out{animation:holo-panel-out .35s ease forwards}
.holo-panel-head{display:flex;align-items:center;gap:8px;font:12px ui-monospace,Consolas,monospace;letter-spacing:.12em;color:var(--c);text-transform:uppercase}
.holo-panel-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.holo-panel-x{cursor:pointer;opacity:.75;padding:0 6px;border:0;background:none;color:inherit;font-size:16px}
.holo-panel-body{margin-top:5px;font-size:15px;color:#fff;overflow-wrap:anywhere}
.holo-panel-foot{margin-top:5px;font:10px ui-monospace,Consolas,monospace;opacity:.55;letter-spacing:.1em}
.holo-panel.music{border-color:rgba(255,122,217,.6)}
.holo-panel.music .holo-panel-head{color:var(--c2)}
.holo-eq{display:flex;align-items:flex-end;gap:3px;height:22px;margin-top:6px}
.holo-eq i{flex:1;background:linear-gradient(var(--c2),var(--c));border-radius:2px;animation:holo-eq .7s ease-in-out infinite alternate}
.holo-eq i:nth-child(3n){animation-duration:.5s}.holo-eq i:nth-child(4n){animation-duration:.9s}.holo-eq i:nth-child(5n){animation-duration:.6s}
@keyframes holo-reveal{from{clip-path:circle(0 at var(--ox) var(--oy));filter:brightness(2.2)}to{clip-path:circle(150vmax at var(--ox) var(--oy));filter:none}}
@keyframes holo-unreveal{from{clip-path:circle(150vmax at var(--ox) var(--oy));opacity:1}to{clip-path:circle(0 at var(--ox) var(--oy));opacity:.6}}
@keyframes holo-materialize{0%{opacity:0;transform:scale(.6);filter:blur(8px)}60%{opacity:1;filter:blur(0)}70%{opacity:.4}80%{opacity:1}to{transform:none}}
@keyframes holo-grid{to{background-position:0 36px}}
@keyframes holo-spin{to{transform:rotate(360deg)}}
@keyframes holo-flicker{0%,92%,100%{opacity:1}93%{opacity:.6}95%{opacity:.95}96%{opacity:.7}}
@keyframes holo-scanmove{to{background-position:0 40px}}
@keyframes holo-talk{from{transform:scale(1)}to{transform:scale(1.05)}}
@keyframes holo-panel-in{from{opacity:0;transform:translateX(40px) scaleY(.2)}60%{opacity:1;transform:translateX(-4px) scaleY(1.03)}to{transform:none}}
@keyframes holo-panel-out{to{opacity:0;transform:translateX(30px) scaleY(.3)}}
@keyframes holo-eq{from{height:12%}to{height:100%}}
@media (prefers-reduced-motion:reduce){.holo *,.holo{animation:none!important}}
@media (max-height:640px){.holo-core{width:min(46vw,190px)}.holo-hint{display:none}}
.voice-mode-btn[aria-pressed="true"]{color:#ec407a}`;
        const s = document.createElement('style');
        s.textContent = css;
        document.head.appendChild(s);
    }
}

window.MoVoiceMode = MoVoiceMode;
