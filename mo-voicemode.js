/* =============================================
   โหมดเสียง (โฮโลแกรม): พูด → โมฟัง → ตอบเป็นเสียง / สั่งงานได้
   - แอป Android: ฟังด้วย SpeechRecognizer + พูดด้วย TextToSpeech ของเครื่อง (MoNative.listen / speak)
   - เบราว์เซอร์: Web Speech API (ถ้ามี)
   - สั่งงาน (เปิดเพลง ฯลฯ) → หน้าต่างโฮโลแกรมเด้งขึ้นมาบอกว่าทำอะไร (event "mo:action")
   ============================================= */
class MoVoiceMode {
    constructor(chat) {
        this.chat = chat;
        this.on = false;
        this.state = 'idle';
        this.spoken = [];          // คำตอบของโมที่รอพูด
        this.lastReplyAt = 0;
        this.native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
            && window.Capacitor.Plugins && window.Capacitor.Plugins.MoNative && window.Capacitor.Plugins.MoNative.listen
            ? window.Capacitor.Plugins.MoNative : null;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.supported = Boolean(this.native || (SR && window.speechSynthesis));
        this.injectStyle();
        this.build();

        // จับคำตอบของโมไว้พูด (เฉพาะตอนเปิดโหมดเสียง)
        const add = chat.addMessage.bind(chat);
        chat.addMessage = (type, text, format = 'text', extra = null, replyTo = null) => {
            const msg = add(type, text, format, extra, replyTo);
            if (this.on && type === 'received') {
                this.lastReplyAt = Date.now();
                const say = format === 'text' ? text : format === 'sticker' ? '' : format === 'song' && extra ? `ส่งเพลง ${extra.title} ให้นะ` : '';
                if (say) { this.spoken.push(say); this.subtitle(say); }
            }
            return msg;
        };

        window.addEventListener('mo:action', e => this.on && this.panel(e.detail || {}));
        document.addEventListener('visibilitychange', () => {
            if (!this.on) return;
            if (document.hidden) this.halt();
            else this.setState('idle', 'แตะวงกลมเพื่อพูด');
        });
        if (this.native && this.native.addListener) {
            this.native.addListener('voiceLevel', d => this.level(d.level));
            this.native.addListener('voicePartial', d => this.heard(d.text, true));
        }
    }

    // =============== เปิด/ปิด ===============

    async toggle(force) {
        const want = force !== undefined ? force : !this.on;
        if (want === this.on) return;
        if (want && !this.supported) {
            this.chat.showNotification('เครื่องนี้ยังฟังเสียงพูดไม่ได้ 🥺 ลองในแอปโมบนมือถือนะ');
            return;
        }
        this.on = want;
        const btn = document.getElementById('btn-voice-mode');
        if (btn) btn.setAttribute('aria-pressed', String(want));
        if (want) {
            this.root.hidden = false;
            this.root.className = 'holo booting';
            await this.boot();
            if (!this.on) return;
            this.root.className = 'holo ready';
            this.greet();
        } else {
            this.halt();
            this.root.classList.add('closing');
            setTimeout(() => { this.root.hidden = true; this.root.className = 'holo'; }, 380);
        }
    }

    async boot() {
        const lines = ['MO-OS v2.6 // voice core', 'linking memory .......... ok', 'loading personality ..... ok', 'calibrating microphone .. ok', 'hologram online'];
        const log = this.root.querySelector('.holo-boot-log');
        const bar = this.root.querySelector('.holo-boot-bar i');
        log.textContent = '';
        for (let i = 0; i < lines.length; i++) {
            if (!this.on) return;
            log.textContent += (i ? '\n' : '') + '> ' + lines[i];
            bar.style.width = `${Math.round(((i + 1) / lines.length) * 100)}%`;
            await this.wait(260);
        }
        await this.wait(250);
    }

    async greet() {
        const name = (this.chat.memory && this.chat.memory.getUserName && this.chat.memory.getUserName()) || 'เอง';
        const hi = ['ว่าไง', 'มาแล้ว', 'เค้าฟังอยู่นะ'][Math.floor(Math.random() * 3)];
        this.subtitle(`${hi}${name ? ` ${name}` : ''} 💗`);
        await this.say(`${hi} ${name}`);
        if (this.on) this.listenLoop();
    }

    halt() {
        this.loopId = (this.loopId || 0) + 1;
        try { this.native ? this.native.stopListening() : (this.rec && this.rec.abort()); } catch (e) {}
        try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {}
        this.spoken = [];
        this.setState('idle', 'แตะวงกลมเพื่อพูด');
    }

    // =============== วงฟัง → ส่ง → พูดตอบ ===============

    async listenLoop() {
        const id = this.loopId = (this.loopId || 0) + 1;
        let misses = 0;
        while (this.on && id === this.loopId && !document.hidden) {
            this.setState('listening', 'ฟังอยู่...');
            this.heard('');
            const text = (await this.listen()).trim();
            if (!this.on || id !== this.loopId) return;
            if (!text) {
                if (++misses >= 2) return this.setState('idle', 'แตะวงกลมเพื่อพูด');
                continue;
            }
            misses = 0;
            this.heard(text);
            if (/^(?:โม\s*)?(?:ปิดโหมดเสียง|กลับไปแชท|พอแล้ว(?:นะ)?|บาย(?:บาย)?|ออก)$/.test(text)) {
                await this.say('โอเค กลับไปพิมพ์กันนะ');
                return this.toggle(false);
            }
            this.setState('thinking', 'กำลังคิด...');
            const before = this.lastReplyAt;
            this.chat.input.value = text.replace(/^โม\s+/, '');
            this.chat.sendMessage();
            await this.untilReplied(before, id);
            while (this.on && id === this.loopId && (this.spoken.length || this.busy())) {
                if (this.spoken.length) {
                    this.setState('speaking', '');
                    await this.say(this.spoken.shift());
                } else await this.wait(250);
            }
        }
    }

    busy() {
        return this.chat.isTyping || this.chat.pendingReply || Date.now() - this.lastReplyAt < 1300;
    }

    async untilReplied(before, id) {
        const t0 = Date.now();
        while (this.on && id === this.loopId && this.lastReplyAt === before && Date.now() - t0 < 45000) await this.wait(200);
    }

    listen() {
        if (this.native) {
            return this.native.listen().then(r => {
                if (r && r.error === 'permission') this.chat.showNotification('อนุญาตไมโครโฟนให้แอปโมก่อนนะ');
                return (r && r.text) || '';
            }).catch(() => '');
        }
        return new Promise(resolve => {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            const rec = this.rec = new SR();
            rec.lang = 'th-TH';
            rec.interimResults = true;
            let final = '';
            rec.onresult = e => {
                let interim = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    if (e.results[i].isFinal) final += e.results[i][0].transcript;
                    else interim += e.results[i][0].transcript;
                }
                this.heard(final + interim, true);
            };
            rec.onerror = () => resolve(final);
            rec.onend = () => resolve(final);
            try { rec.start(); } catch (e) { resolve(''); }
        });
    }

    say(text) {
        const clean = String(text || '')
            .replace(/\[[^\]]*\]/g, '')
            .replace(/5{3,}/g, ' ฮ่าๆๆ ')
            .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
            .replace(/\s+/g, ' ').trim();
        if (!clean) return Promise.resolve();
        this.root.classList.add('talking');
        const end = () => this.root.classList.remove('talking');
        if (this.native && this.native.speak) return this.native.speak({ text: clean }).catch(() => {}).then(end);
        return new Promise(resolve => {
            if (!window.speechSynthesis) return resolve();
            const u = new SpeechSynthesisUtterance(clean);
            u.lang = 'th-TH'; u.pitch = 1.2; u.rate = 1.05;
            const v = speechSynthesis.getVoices().find(x => x.lang && x.lang.startsWith('th'));
            if (v) u.voice = v;
            u.onend = u.onerror = () => resolve();
            speechSynthesis.cancel();
            speechSynthesis.speak(u);
            setTimeout(resolve, 20000);
        }).then(end);
    }

    // =============== หน้าจอ ===============

    setState(state, label) {
        this.state = state;
        this.root.dataset.state = state;
        if (label !== undefined) this.stateEl.textContent = label;
    }

    heard(text, partial) {
        this.heardEl.textContent = text ? `“${text}”` : '';
        this.heardEl.classList.toggle('partial', Boolean(partial));
    }

    subtitle(text) {
        this.subEl.textContent = String(text || '').replace(/\[[^\]]*\]/g, '').trim();
    }

    level(db) {
        const s = 1 + Math.max(0, Math.min(10, Number(db) || 0)) / 25;
        this.root.style.setProperty('--lvl', s.toFixed(3));
    }

    /** หน้าต่างโฮโลแกรมเด้งขึ้นมาตอนสั่งงาน: { icon, title, detail, kind } */
    panel({ icon = '◆', title = '', detail = '', kind = '' }) {
        const el = document.createElement('div');
        el.className = `holo-panel ${kind}`;
        el.innerHTML = `<div class="holo-panel-head"><span class="holo-panel-icon"></span><span class="holo-panel-title"></span><span class="holo-panel-x">×</span></div>
            <div class="holo-panel-body"></div>${kind === 'music' ? '<div class="holo-eq">' + '<i></i>'.repeat(14) + '</div>' : ''}
            <div class="holo-panel-foot">${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · EXEC OK</div>`;
        el.querySelector('.holo-panel-icon').textContent = icon;
        el.querySelector('.holo-panel-title').textContent = title;
        el.querySelector('.holo-panel-body').textContent = detail;
        el.querySelector('.holo-panel-x').addEventListener('click', () => this.closePanel(el));
        this.panels.prepend(el);
        [...this.panels.children].slice(3).forEach(p => this.closePanel(p));
        setTimeout(() => this.closePanel(el), 9000);
    }

    closePanel(el) {
        if (!el.isConnected || el.classList.contains('out')) return;
        el.classList.add('out');
        setTimeout(() => el.remove(), 350);
    }

    wait(ms) { return new Promise(r => setTimeout(r, ms)); }

    build() {
        const root = this.root = document.createElement('div');
        root.className = 'holo';
        root.hidden = true;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', 'โหมดพูดคุยด้วยเสียง');
        root.innerHTML = `
            <div class="holo-grid"></div><div class="holo-scan"></div>
            <div class="holo-boot"><div class="holo-boot-title">MO // VOICE</div><pre class="holo-boot-log"></pre><div class="holo-boot-bar"><i></i></div></div>
            <div class="holo-top">
                <button class="holo-exit" type="button">⌨️ กลับไปแชท</button>
                <span class="holo-tag">VOICE MODE · ONLINE</span>
            </div>
            <div class="holo-panels"></div>
            <button class="holo-core" type="button" aria-label="แตะเพื่อพูด หรือหยุด">
                <svg class="holo-rings" viewBox="0 0 200 200" aria-hidden="true">
                    <circle cx="100" cy="100" r="96" class="r1"/><circle cx="100" cy="100" r="84" class="r2"/><circle cx="100" cy="100" r="72" class="r3"/>
                </svg>
                <span class="holo-face"><img src="mo_avatar.jpg" alt=""></span>
                <span class="holo-beam"></span>
            </button>
            <div class="holo-info">
                <div class="holo-state">แตะวงกลมเพื่อพูด</div>
                <div class="holo-heard"></div>
                <div class="holo-sub"></div>
                <div class="holo-hint">ลองพูด: "เปิดเพลงรัก" · "ปิดเพลง" · "เสียงดังขึ้น" · "พอแล้ว"</div>
            </div>`;
        document.body.appendChild(root);
        this.stateEl = root.querySelector('.holo-state');
        this.heardEl = root.querySelector('.holo-heard');
        this.subEl = root.querySelector('.holo-sub');
        this.panels = root.querySelector('.holo-panels');
        root.querySelector('.holo-exit').addEventListener('click', () => this.toggle(false));
        root.querySelector('.holo-core').addEventListener('click', () => {
            if (this.state === 'idle') this.listenLoop();
            else this.halt();
        });
    }

    injectStyle() {
        const css = `
.holo{--c:#5ff3ff;--c2:#ff7ad9;--lvl:1;position:fixed;inset:0;z-index:9000;overflow:hidden;color:#dffbff;
  background:radial-gradient(120% 80% at 50% 35%,#0b2a4a 0%,#06142a 55%,#020814 100%);font-family:inherit;
  display:flex;flex-direction:column;align-items:center;justify-content:space-between;
  padding:calc(14px + env(safe-area-inset-top,0px)) 16px calc(18px + env(safe-area-inset-bottom,0px));animation:holo-in .35s ease}
.holo[hidden]{display:none}
.holo.closing{animation:holo-out .38s ease forwards}
.holo-grid{position:absolute;inset:-50% -20% 0;background-image:linear-gradient(rgba(95,243,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(95,243,255,.08) 1px,transparent 1px);
  background-size:36px 36px;transform:perspective(500px) rotateX(58deg) translateY(30%);transform-origin:bottom;animation:holo-grid 6s linear infinite;pointer-events:none}
.holo-scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.03) 0 1px,transparent 1px 3px);pointer-events:none}
.holo-boot{position:absolute;inset:0;display:none;flex-direction:column;justify-content:center;align-items:center;gap:14px;background:#020814;z-index:3}
.holo.booting .holo-boot{display:flex}
.holo.booting>:not(.holo-boot){visibility:hidden}
.holo-boot-title{font-size:22px;letter-spacing:.35em;color:var(--c);text-shadow:0 0 12px var(--c)}
.holo-boot-log{margin:0;min-height:6.5em;width:min(320px,86vw);font:12px/1.6 ui-monospace,Consolas,monospace;color:#9feaff;white-space:pre-wrap}
.holo-boot-bar{width:min(320px,86vw);height:4px;background:rgba(95,243,255,.15);border-radius:4px;overflow:hidden}
.holo-boot-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--c),var(--c2));box-shadow:0 0 10px var(--c);transition:width .25s}
.holo-top{position:relative;z-index:2;width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px}
.holo-exit{border:1px solid rgba(95,243,255,.45);background:rgba(95,243,255,.08);color:#dffbff;border-radius:999px;padding:8px 14px;font:inherit;font-size:13px;cursor:pointer}
.holo-tag{font:11px ui-monospace,Consolas,monospace;letter-spacing:.15em;color:var(--c);opacity:.8}
.holo-core{position:relative;z-index:1;width:min(64vw,260px);aspect-ratio:1;border:0;background:none;padding:0;cursor:pointer;margin-top:4vh}
.holo-rings{position:absolute;inset:0;width:100%;height:100%;transform:scale(var(--lvl));transition:transform .08s linear}
.holo-rings circle{fill:none;stroke:var(--c);stroke-linecap:round;filter:drop-shadow(0 0 6px var(--c))}
.holo-rings .r1{stroke-width:1.5;stroke-dasharray:40 18;opacity:.7;transform-origin:center;animation:holo-spin 14s linear infinite}
.holo-rings .r2{stroke-width:3;stroke-dasharray:6 10;opacity:.5;transform-origin:center;animation:holo-spin 9s linear infinite reverse}
.holo-rings .r3{stroke-width:1;opacity:.35}
.holo-face{position:absolute;inset:22%;border-radius:50%;overflow:hidden;box-shadow:0 0 30px rgba(95,243,255,.55),inset 0 0 30px rgba(95,243,255,.6);animation:holo-flicker 4s infinite}
.holo-face img{width:100%;height:100%;object-fit:cover;filter:grayscale(.4) sepia(1) hue-rotate(150deg) saturate(2.2) brightness(1.1) contrast(1.05);opacity:.88;mix-blend-mode:screen}
.holo-face::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(95,243,255,.18) 0 2px,transparent 2px 4px);animation:holo-scanmove 3s linear infinite}
.holo-beam{position:absolute;left:30%;right:30%;bottom:-18%;height:22%;background:radial-gradient(50% 100% at 50% 100%,rgba(95,243,255,.55),transparent);filter:blur(4px)}
.holo[data-state="listening"] .holo-face{box-shadow:0 0 40px rgba(95,243,255,.9),inset 0 0 30px rgba(95,243,255,.7)}
.holo[data-state="thinking"] .holo-rings .r2{animation-duration:1.4s}
.holo.talking .holo-face{animation:holo-talk .35s ease-in-out infinite alternate;box-shadow:0 0 44px rgba(255,122,217,.8),inset 0 0 30px rgba(255,122,217,.5)}
.holo-info{position:relative;z-index:2;text-align:center;max-width:520px;width:100%;display:flex;flex-direction:column;gap:8px}
.holo-state{font-size:13px;letter-spacing:.2em;color:var(--c);text-transform:uppercase;min-height:1.2em}
.holo-heard{font-size:17px;min-height:1.4em;opacity:.95}
.holo-heard.partial{opacity:.6}
.holo-sub{font-size:15px;color:#ffd6f3;min-height:1.3em;text-shadow:0 0 8px rgba(255,122,217,.6)}
.holo-hint{font-size:11px;opacity:.5;margin-top:4px}
.holo-panels{position:absolute;z-index:3;top:calc(60px + env(safe-area-inset-top,0px));right:12px;left:12px;display:flex;flex-direction:column;align-items:flex-end;gap:10px;pointer-events:none}
.holo-panel{pointer-events:auto;width:min(300px,100%);border:1px solid rgba(95,243,255,.55);border-radius:10px;background:rgba(10,40,70,.55);backdrop-filter:blur(6px);
  box-shadow:0 0 18px rgba(95,243,255,.25),inset 0 0 18px rgba(95,243,255,.08);padding:10px 12px;clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px));
  animation:holo-panel-in .45s cubic-bezier(.2,.9,.3,1.2)}
.holo-panel.out{animation:holo-panel-out .35s ease forwards}
.holo-panel-head{display:flex;align-items:center;gap:8px;font:12px ui-monospace,Consolas,monospace;letter-spacing:.12em;color:var(--c);text-transform:uppercase}
.holo-panel-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.holo-panel-x{cursor:pointer;opacity:.7;padding:0 4px}
.holo-panel-body{margin-top:6px;font-size:15px;color:#fff;word-break:break-word}
.holo-panel-foot{margin-top:6px;font:10px ui-monospace,Consolas,monospace;opacity:.55;letter-spacing:.1em}
.holo-panel.music{border-color:rgba(255,122,217,.6)}
.holo-panel.music .holo-panel-head{color:var(--c2)}
.holo-eq{display:flex;align-items:flex-end;gap:3px;height:26px;margin-top:8px}
.holo-eq i{flex:1;background:linear-gradient(var(--c2),var(--c));border-radius:2px;animation:holo-eq .7s ease-in-out infinite alternate}
.holo-eq i:nth-child(3n){animation-duration:.5s}.holo-eq i:nth-child(4n){animation-duration:.9s}.holo-eq i:nth-child(5n){animation-duration:.6s}
@keyframes holo-in{from{opacity:0;transform:scale(1.04)}to{opacity:1;transform:none}}
@keyframes holo-out{to{opacity:0;transform:scale(.96)}}
@keyframes holo-grid{to{background-position:0 36px}}
@keyframes holo-spin{to{transform:rotate(360deg)}}
@keyframes holo-flicker{0%,92%,100%{opacity:1}93%{opacity:.6}95%{opacity:.95}96%{opacity:.7}}
@keyframes holo-scanmove{to{background-position:0 40px}}
@keyframes holo-talk{from{transform:scale(1)}to{transform:scale(1.05)}}
@keyframes holo-panel-in{from{opacity:0;transform:translateX(40px) scaleY(.2)}60%{opacity:1;transform:translateX(-4px) scaleY(1.03)}to{transform:none}}
@keyframes holo-panel-out{to{opacity:0;transform:translateX(30px) scaleY(.3)}}
@keyframes holo-eq{from{height:12%}to{height:100%}}
@media (prefers-reduced-motion:reduce){.holo *,.holo{animation:none!important}}
.voice-mode-btn[aria-pressed="true"]{color:#ec407a}`;
        const s = document.createElement('style');
        s.textContent = css;
        document.head.appendChild(s);
    }
}

window.MoVoiceMode = MoVoiceMode;
