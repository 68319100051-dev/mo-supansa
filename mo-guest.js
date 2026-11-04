/* ============================================
   Mo Guest 💌 - แอคเคานต์ของขวัญ (เปิดลิงก์ ?gift แล้วใส่รหัส)
   - ไม่มีรหัส/จดหมายในไฟล์นี้: หลังบ้านส่งให้หลังใส่รหัสถูกเท่านั้น
   - ใช้โมของเจ้าของ (อ่านอย่างเดียว ไม่ซิงก์กลับ) AI วิ่งผ่านหลังบ้าน คีย์ไม่ออกมาที่เครื่องนี้
   - ลำดับ: ใส่รหัส → คำเตือน → จดหมาย (เปิด/อ่าน) → แนะนำแอป → คุยได้ตามโควต้า (chatLimit ในไฟล์ส่วนตัว)
   ============================================ */

(function () {
    'use strict';

    const loadApp = () => {
        const s = document.createElement('script');
        s.src = 'app.js';
        document.body.appendChild(s);
    };
    const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

    // ทดสอบในเครื่อง (scripts/gift-preview.mjs): ?gift&reset = ล้างแล้วเริ่มใหม่ตั้งแต่ใส่รหัส
    if (location.hostname === 'localhost' && new URLSearchParams(location.search).has('reset')) {
        try { localStorage.clear(); } catch (e) {}
        history.replaceState(null, '', '/?gift');
    }
    let saved = read('mo_guest');
    const wantGift = new URLSearchParams(location.search).has('gift') || location.pathname === '/gift' || !!saved;
    if (!wantGift) return loadApp();

    document.documentElement.classList.add('guest');
    document.title = '💌';
    const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const $ = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };

    // =============================================
    //  เสียง (สังเคราะห์เอง ไม่ต้องโหลดไฟล์)
    // =============================================
    const Sound = {
        ctx: null, muted: false, bg: null,
        init() {
            if (this.ctx) return;
            try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
        },
        tone(freq, dur = 0.15, type = 'sine', vol = 0.08, when = 0) {
            if (!this.ctx || this.muted) return;
            const t = this.ctx.currentTime + when;
            const o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.type = type; o.frequency.value = freq;
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(vol, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g).connect(this.ctx.destination);
            o.start(t); o.stop(t + dur + 0.05);
        },
        tap() { this.tone(880, 0.08, 'triangle', 0.05); },
        tick() { this.tone(1400 + Math.random() * 300, 0.03, 'square', 0.012); },
        wrong() { this.tone(220, 0.18, 'sawtooth', 0.05); this.tone(180, 0.22, 'sawtooth', 0.05, 0.12); },
        ok() { [660, 880, 1320].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.06, i * 0.09)); },
        pop() { this.tone(1046, 0.12, 'sine', 0.07); this.tone(1568, 0.12, 'sine', 0.05, 0.06); },
        paper() {   // เสียงกระดาษ/เปิดซอง = noise กรองเสียง
            if (!this.ctx || this.muted) return;
            const len = this.ctx.sampleRate * 0.5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
            const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
            src.buffer = buf; f.type = 'bandpass'; f.frequency.value = 2200; g.gain.value = 0.25;
            src.connect(f).connect(g).connect(this.ctx.destination);
            src.start();
        },
        /** เพลงพื้นหลังเบาๆ: คอร์ด C - Am - F - G วนไป */
        music() {
            if (!this.ctx || this.bg) return;
            const chords = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
            let i = 0;
            const play = () => {
                if (!this.muted) chords[i % 4].forEach((f, k) => {
                    this.tone(f, 3.6, 'sine', 0.018);
                    this.tone(f * 2, 0.6, 'triangle', 0.012, k * 0.45 + 0.2);
                });
                i++;
            };
            play();
            this.bg = setInterval(play, 3600);
        },
        stopMusic() { clearInterval(this.bg); this.bg = null; },
    };

    // ตัวการ์ตูนลอยๆ (แมวน้อยสีชมพู)
    const mascotSVG = `<svg viewBox="0 0 120 120" class="gg-mascot-svg" aria-hidden="true">
        <path d="M28 46 L22 18 L48 34 Z" fill="#ff9cc5"/><path d="M92 46 L98 18 L72 34 Z" fill="#ff9cc5"/>
        <path d="M30 40 L27 26 L41 35 Z" fill="#ffd6e7"/><path d="M90 40 L93 26 L79 35 Z" fill="#ffd6e7"/>
        <ellipse cx="60" cy="68" rx="44" ry="38" fill="#ffb3d1"/>
        <ellipse cx="60" cy="78" rx="30" ry="22" fill="#ffe3ef"/>
        <g class="gg-eyes"><ellipse cx="44" cy="62" rx="5" ry="7" fill="#3b2433"/><ellipse cx="76" cy="62" rx="5" ry="7" fill="#3b2433"/>
        <circle cx="46" cy="59" r="2" fill="#fff"/><circle cx="78" cy="59" r="2" fill="#fff"/></g>
        <ellipse cx="34" cy="76" rx="7" ry="4" fill="#ff7eb6" opacity="0.6"/><ellipse cx="86" cy="76" rx="7" ry="4" fill="#ff7eb6" opacity="0.6"/>
        <path d="M54 74 Q60 80 66 74" stroke="#3b2433" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <path d="M16 70 L4 66 M16 76 L3 78 M104 70 L116 66 M104 76 L117 78" stroke="#e88bb0" stroke-width="2" stroke-linecap="round"/>
    </svg>`;

    const api = (path, body, token) => fetch(`/api/gift/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));

    const chatLimit = () => (saved && saved.gift && saved.gift.chatLimit) || 10;
    const event = (type, n) => saved && saved.token && api('event', { type, n }, saved.token).catch(() => {});

    // =============================================
    //  แชทเก่าของเจ็ทกับโมเวอร์ชั่นแรก (ดูอย่างเดียว)
    // =============================================
    function ownerChatButton() {
        const old = read('mo_guest_owner_chat') || [];
        const area = document.getElementById('chat-area');
        if (!old.length || !area || document.querySelector('.gg-oldchat-btn')) return;
        const btn = $(`<button class="gg-oldchat-btn" type="button">📜 ดูข้อความที่เจ็ทเคยคุยกับโมเวอร์ชั่นแรก</button>`);
        area.prepend(btn);
        btn.onclick = () => { Sound.init(); Sound.tap(); ownerChatViewer(old); };
    }

    function ownerChatViewer(old) {
        const label = m => {
            if (!m.format || m.format === 'text') return esc(m.text).replace(/\n/g, '<br>');
            if (m.format === 'sticker') return esc(m.text);
            if (m.format === 'image') return /^(data:image|https?:)/.test(m.text || '') ? `<img src="${esc(m.text)}" alt="" loading="lazy">` : '📷 รูป';
            return { voice: '🎤 ข้อความเสียง', reel: '🎬 คลิป', song: '🎵 เพลง', call: '📞 โทร' }[m.format] || '💬';
        };
        let day = '';
        const rows = old.filter(m => m.type === 'sent' || m.type === 'received').map(m => {
            const d = new Date(m.timestamp);
            const dl = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
            const head = dl !== day ? `<div class="gg-oc-day">${(day = dl)}</div>` : '';
            return `${head}<div class="gg-oc-msg ${m.type === 'sent' ? 'jet' : 'mo'}"><div class="gg-oc-bubble">${label(m)}</div>
                <time>${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</time></div>`;
        }).join('');
        const el = $(`<div class="gg-overlay gg-dim gg-oldchat">
            <div class="gg-oc-box">
                <div class="gg-oc-head"><div><b>📜 เจ็ท × โมเวอร์ชั่นแรก</b><small>${old.length} ข้อความ • ดูอย่างเดียว</small></div>
                    <button class="close-btn" type="button" aria-label="ปิด">&times;</button></div>
                <div class="gg-oc-list">${rows}</div>
            </div></div>`);
        document.body.appendChild(el);
        const list = el.querySelector('.gg-oc-list');
        list.scrollTop = list.scrollHeight;   // เริ่มที่ข้อความล่าสุด เลื่อนขึ้นดูย้อนหลัง
        el.querySelector('.close-btn').onclick = () => el.remove();
        el.addEventListener('click', e => { if (e.target === el) el.remove(); });
    }

    // =============================================
    //  โหมดแอคเคานต์ของขวัญ: AI ผ่านหลังบ้าน / ไม่ซิงก์ / ไม่มีตั้งค่า
    // =============================================
    function applyRuntime() {
        window.MO_GUEST = { mode: saved.mode, aiNote: (saved.gift && saved.gift.aiNote) || '' };
        window.MO_KEYS = { ...(window.MO_KEYS || {}), gemini: 'guest-proxy', groq: '', supabaseUrl: '', supabaseAnonKey: '' };
        const realFetch = window.fetch.bind(window);
        window.fetch = (input, init = {}) => {
            const url = typeof input === 'string' ? input : input.url;
            if (url.startsWith('https://generativelanguage.googleapis.com/v1beta/')) {
                const u = new URL(url);
                return realFetch('/api/gift/ai', {
                    method: 'POST',
                    signal: init.signal,
                    headers: { 'content-type': 'application/json', authorization: `Bearer ${saved.token}` },
                    body: JSON.stringify({ path: u.pathname.replace('/v1beta/', ''), method: init.method || 'GET', payload: init.body ? JSON.parse(init.body) : null }),
                }).then(r => { if (r.status === 403) closedScreen(); return r; });
            }
            if (url.startsWith('https://api.groq.com/')) return Promise.reject(new Error('guest: groq off'));
            return realFetch(input, init);
        };
        // จำกัดจำนวนข้อความ (mo-chat.js เรียกก่อนส่งทุกครั้ง)
        const limit = chatLimit();
        window.MoGuestGuard = () => {
            const n = Number(localStorage.getItem('mo_guest_sent') || 0);
            if (n >= limit) { showLimit(); return false; }
            localStorage.setItem('mo_guest_sent', String(n + 1));
            event('messages', n + 1);
            if (n + 1 >= limit) setTimeout(showLimit, 15000);   // รอโมตอบข้อความสุดท้ายก่อน
            return true;
        };
    }

    function showLimit() {
        if (document.querySelector('.gg-limit')) return;
        event('limit');
        const el = $(`<div class="gg-overlay gg-limit"><div class="gg-card gg-pop">
            <div class="gg-mascot small">${mascotSVG}</div>
            <h3>หมดโควต้าแล้วจ้าาา 🫣</h3>
            <p>${esc((saved.gift && saved.gift.limitMsg) || 'ใช้ได้แค่นี้แหละ')}</p>
            <button class="gg-btn" type="button">โอเคค 💗</button></div></div>`);
        document.body.appendChild(el);
        el.querySelector('button').onclick = () => { Sound.init(); Sound.tap(); el.remove(); ending(); };
        const input = document.getElementById('message-input');
        if (input) { input.disabled = true; input.placeholder = 'หมดโควต้าแล้ว 🫣'; }
    }

    // =============================================
    //  ฉากจบ: จอค่อยๆ มืด → ข้อความทีละบรรทัด (ข้ามไม่ได้) → ปุ่มบ้ายบายหนี 4 รอบ
    // =============================================
    async function ending() {
        if (document.querySelector('.gg-ending')) return;
        const g = saved.gift || {};
        // คลิปตอน ปวช.3 เป็นพื้นหลังจางๆ (หลังบ้านส่งให้เฉพาะคนที่มีรหัส / ไม่มีคลิปก็แค่ไม่โชว์)
        const el = $(`<div class="gg-ending">
            <video class="gg-end-video" src="/api/gift/video?t=${encodeURIComponent(saved.token)}" muted loop playsinline autoplay preload="auto"></video>
            <div class="gg-end-lines"></div>
            <button class="gg-bye" type="button">${esc(g.byeLabel || 'บ้ายบายย 👋')}</button>
            <p class="gg-end-last"></p>
            <div class="gg-end-heart">💗</div>
        </div>`);
        document.body.appendChild(el);
        void el.offsetWidth;
        el.classList.add('dark');
        const vid = el.querySelector('.gg-end-video');
        vid.addEventListener('error', () => vid.remove());
        vid.addEventListener('playing', () => vid.classList.add('on'));
        const tryPlay = () => vid.isConnected && vid.play && vid.play().catch(() => {});
        tryPlay();
        el.addEventListener('click', tryPlay, { once: true });   // บางเครื่องต้องแตะก่อนถึงเล่น
        Sound.music();
        await wait(4200);
        const box = el.querySelector('.gg-end-lines');
        for (const line of g.ending || []) {
            const p = document.createElement('p');
            p.textContent = line;
            box.appendChild(p);
            void p.offsetWidth;
            p.classList.add('in');
            Sound.tone(523 + Math.random() * 200, 0.6, 'sine', 0.025);
            await wait(Math.min(4200, 1600 + line.length * 70));
        }
        await wait(1200);
        const bye = el.querySelector('.gg-bye');
        bye.classList.add('show');
        let dodges = 0;
        bye.onclick = async () => {
            if (dodges < 4) {   // หนีไปที่อื่น 4 รอบ
                dodges++;
                Sound.pop();
                const w = bye.offsetWidth, h = bye.offsetHeight;
                bye.style.left = `${16 + Math.random() * (innerWidth - w - 32)}px`;
                bye.style.top = `${70 + Math.random() * (innerHeight - h - 140)}px`;
                bye.style.transform = `rotate(${Math.random() * 30 - 15}deg)`;
                return;
            }
            bye.classList.remove('show');
            bye.disabled = true;
            const last = el.querySelector('.gg-end-last');
            last.textContent = g.byeLast || 'ไปแล้วนะ';
            last.classList.add('in');
            event('bye');
            await wait(3500);
            Sound.stopMusic();
            el.classList.add('gone');
        };
    }

    /** หลังแนะนำแอป: บอกให้เล่นให้ครบโควต้า */
    function playNote(text) {
        if (!text) return;
        const el = $(`<div class="gg-overlay gg-dim"><div class="gg-card gg-pop">
            <div class="gg-mascot small">${mascotSVG}</div>
            <p>${esc(text)}</p>
            <button class="gg-btn" type="button">โอเค ลุยย 💬</button></div></div>`);
        document.body.appendChild(el);
        el.querySelector('button').onclick = () => { Sound.tap(); el.remove(); document.getElementById('message-input')?.focus(); };
    }

    /** เจ้าของปิดแอคของขวัญแล้ว → หน้าปิด (ทับทุกอย่าง) */
    function closedScreen() {
        if (document.querySelector('.gg-closed')) return;
        document.querySelectorAll('.gg-overlay, .gg-tour').forEach(e => e.remove());
        const el = $(`<div class="gg-overlay gg-gate gg-closed">
            <div class="gg-hearts">${'<i>💗</i>'.repeat(10)}</div>
            <div class="gg-lock">
                <div class="gg-mascot small">${mascotSVG}</div>
                <h2>แอคนี้ปิดแล้วนะ</h2>
                <p class="gg-sub">ขอบคุณที่แวะมาเล่นนะ 💗</p>
            </div>
        </div>`);
        document.body.appendChild(el);
        const input = document.getElementById('message-input');
        if (input) { input.disabled = true; input.placeholder = 'แอคนี้ปิดแล้ว'; }
    }

    // =============================================
    //  1) หน้าใส่รหัส + การ์ตูนใบ้รหัส
    // =============================================
    async function gate() {
        // กันเครื่องเจ้าของ: ข้อมูลจริงในเครื่องจะโดนทับ
        const isOwnerDevice = Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k)) || localStorage.getItem('mo_device_keys_v1');
        const el = $(`<div class="gg-overlay gg-gate">
            <div class="gg-hearts">${'<i>💗</i>'.repeat(10)}</div>
            <div class="gg-lock">
                <div class="gg-lock-icon">🔒</div>
                <h2>มีคนฝากของไว้ให้</h2>
                <p class="gg-sub">ใส่รหัส 4 ตัวเพื่อเปิดนะ</p>
                <div class="gg-pin-wrap"><div class="gg-faint"></div><div class="gg-dots">${'<span></span>'.repeat(4)}</div></div>
                <p class="gg-msg"></p>
                <div class="gg-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => `<button type="button" ${k === '' ? 'disabled class="gg-empty"' : ''} data-k="${k}">${k}</button>`).join('')}</div>
            </div>
            <div class="gg-mascot float" role="button" aria-label="ขอคำใบ้">
                <div class="gg-bubble">จำรหัสได้ป่าวว ให้ใบ้ไหมม 👀</div>${mascotSVG}
            </div>
        </div>`);
        document.body.appendChild(el);
        const msg = el.querySelector('.gg-msg'), dots = [...el.querySelectorAll('.gg-dots span')];
        const bubble = el.querySelector('.gg-bubble');
        if (isOwnerDevice) {
            msg.textContent = 'เครื่องนี้เป็นเครื่องเจ้าของ (มีข้อมูลจริงอยู่) เปิดลิงก์นี้ในหน้าต่างไม่ระบุตัวตน/เครื่องอื่นนะ';
            el.querySelector('.gg-pad').remove();
            return;
        }
        let hint = { hint: '', faint: '' };
        api('hint').then(r => { hint = r.data || hint; if (hint.closed) return closedScreen(); if (!hint.ready) msg.textContent = 'ของยังไม่พร้อม ลองใหม่ทีหลังนะ'; }).catch(() => {});

        el.querySelector('.gg-mascot').onclick = () => {
            Sound.init(); Sound.pop();
            bubble.textContent = hint.hint ? `ใบ้ให้: ${hint.hint}` : 'อืมม... ลองนึกดูดีๆ น้า 🤔';
            el.querySelector('.gg-faint').textContent = hint.faint || '';
            el.querySelector('.gg-faint').classList.add('show');
        };

        let pin = '';
        let busy = false;
        const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
        return new Promise(resolve => {
            el.querySelectorAll('[data-k]').forEach(b => b.onclick = async () => {
                Sound.init(); Sound.tap();
                if (busy) return;
                const k = b.dataset.k;
                if (k === '⌫') pin = pin.slice(0, -1);
                else if (pin.length < 4) pin += k;
                paint();
                if (pin.length < 4) return;
                busy = true;
                const r = await api('login', { pin }).catch(() => ({ status: 0, data: {} }));
                if (r.status === 200 && r.data.token) {
                    Sound.ok();
                    msg.textContent = 'ถูกต้องงง 🎉';
                    bubble.textContent = 'เก่งมากก จำได้ด้วย 🥹';
                    el.classList.add('gg-unlock');
                    await wait(900);
                    resolve({ token: r.data.token, mode: r.data.mode, el });
                    return;
                }
                if (r.status === 403 && r.data.closed) { closedScreen(); return; }
                Sound.wrong();
                el.querySelector('.gg-lock').classList.add('shake');
                setTimeout(() => el.querySelector('.gg-lock').classList.remove('shake'), 500);
                msg.textContent = r.data.locked ? `ใส่ผิดหลายครั้งไป รออีก ${r.data.mins} นาทีนะ` : r.status === 401 ? `ไม่ใช่น้าา ลองอีกที${r.data.left ? ` (เหลือ ${r.data.left} ครั้ง)` : ''}` : 'เชื่อมต่อไม่ได้ ลองใหม่นะ';
                bubble.textContent = r.status === 401 ? 'ผิดน้าา ให้ใบ้ไหมม? แตะเค้าสิ 👈' : bubble.textContent;
                pin = '';
                paint();
                busy = false;
            });
        });
    }

    // =============================================
    //  2) คำเตือน
    // =============================================
    function warning(gift) {
        return new Promise(resolve => {
            const el = $(`<div class="gg-overlay gg-dim"><div class="gg-card gg-pop">
                <div class="gg-warn-icon">⚠️</div>
                <h3>คำเตือนนน</h3>
                <p>${esc(gift.warning || '')}</p>
                <button class="gg-btn" type="button">เข้าใจแล้ว</button></div></div>`);
            document.body.appendChild(el);
            el.querySelector('button').onclick = () => { Sound.tap(); el.remove(); resolve(); };
        });
    }

    // =============================================
    //  3) จดหมาย: ข้อความค่อยๆ ขึ้น (กดข้ามไม่ได้) → แตะเปิด → อ่าน
    // =============================================
    async function typeLine(node, text) {
        for (const ch of [...text]) {
            node.textContent += ch;
            if (ch.trim()) Sound.tick();
            await wait(55);
        }
    }

    async function letter(gift) {
        Sound.music();
        const el = $(`<div class="gg-overlay gg-night">
            <div class="gg-stars">${'<i></i>'.repeat(30)}</div>
            <div class="gg-intro"></div>
            <div class="gg-envelope">
                <div class="gg-env-back"></div>
                <div class="gg-paper-peek"></div>
                <div class="gg-env-front"></div>
                <div class="gg-env-flap"></div>
                <div class="gg-seal">💗</div>
            </div>
            <p class="gg-tapme">แตะที่จดหมายเพื่อเปิด 💌</p>
            <button class="gg-mute" type="button" aria-label="ปิดเสียง">🔊</button>
        </div>`);
        document.body.appendChild(el);
        el.querySelector('.gg-mute').onclick = e => {
            e.stopPropagation();
            Sound.muted = !Sound.muted;
            e.currentTarget.textContent = Sound.muted ? '🔇' : '🔊';
        };
        const intro = el.querySelector('.gg-intro');
        const env = el.querySelector('.gg-envelope');
        await wait(500);
        env.classList.add('in');
        await wait(900);
        for (const line of gift.intro || []) {
            const p = document.createElement('p');
            intro.appendChild(p);
            await typeLine(p, line);
            await wait(700);
        }
        el.querySelector('.gg-tapme').classList.add('show');
        env.classList.add('ready');
        await new Promise(r => env.addEventListener('click', r, { once: true }));
        event('letter_open');
        el.querySelector('.gg-tapme').classList.remove('show');
        intro.classList.add('fade');
        env.classList.remove('ready');
        Sound.paper();
        env.classList.add('open');
        await wait(700);
        env.classList.add('rise');
        Sound.paper();
        await wait(1100);
        await reader(gift, el);
        Sound.stopMusic();
        el.classList.add('gg-out');
        await wait(600);
        el.remove();
    }

    /** แต่งข้อความ: 5555 เด้งๆ / อีโมจิกระดึ๊บ / คำพูดในเครื่องหมายคำพูดเป็นลายมือ */
    // เบราว์เซอร์เก่าอ่าน \p{...} ไม่ได้ → สร้างตอนรัน ถ้าพังก็แค่ไม่ทำอีโมจิเด้ง (ไม่ให้ทั้งไฟล์พัง)
    let emojiRe = null;
    try { emojiRe = new RegExp('(\\p{Extended_Pictographic}\\uFE0F?)', 'gu'); } catch (e) {}

    function decorate(text) {
        let html = esc(text)
            .replace(/\n/g, '<br>')
            .replace(/(5{4,})/g, '<span class="gg-laugh">$1</span>');
        if (emojiRe) html = html.replace(emojiRe, '<span class="gg-emo">$1</span>');
        return html.replace(/^"(.+)"$/, '<span class="gg-quote">"$1"</span>');
    }

    /** ระเบิดหัวใจ/คอนเฟตติ ณ จุดหนึ่งบนจอ */
    function burst(x, y, n = 16, chars = ['💗', '✨', '🌸', '💖', '⭐']) {
        for (let i = 0; i < n; i++) {
            const s = document.createElement('i');
            s.className = 'gg-burst';
            s.textContent = chars[i % chars.length];
            const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 110;
            s.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 40}px;--r:${Math.random() * 360 - 180}deg`;
            document.body.appendChild(s);
            setTimeout(() => s.remove(), 1400);
        }
    }

    function reader(gift, host) {
        return new Promise(resolve => {
            const sections = gift.letter || [];
            const doodles = ['🌸', '✨', '💌', '🌷', '⭐', '🍀', '💗'];
            const el = $(`<div class="gg-reader">
                <div class="gg-progress"><i></i><span>🐾</span></div>
                <div class="gg-petals">${'<i></i>'.repeat(14)}</div>
                <article class="gg-sheet">
                    <div class="gg-tape"></div>
                    ${sections.map((s, i) => `<section data-i="${i}">
                        ${s.title ? `<h3 class="gg-p gg-title"><span>${esc(s.title)}</span><b class="gg-doodle">${doodles[i % doodles.length]}</b></h3>` : ''}
                        ${s.paras.map(p => `<p class="gg-p">${decorate(p)}</p>`).join('')}
                    </section>`).join('<div class="gg-divider gg-p">✦ ✦ ✦</div>')}
                    <div class="gg-end gg-p"><button class="gg-btn big" type="button">จบแล่วว พร้อมเล่นได้เรยยยย 🎉</button></div>
                </article>
                <div class="gg-peeker">${mascotSVG}<div class="gg-tease"></div></div>
            </div>`);
            host.appendChild(el);
            void el.offsetWidth;   // ให้ transition เริ่มจากสถานะแรก (rAF ไม่ทำงานตอนแท็บอยู่เบื้องหลัง)
            setTimeout(() => el.classList.add('show'), 30);
            const tease = el.querySelector('.gg-tease'), peeker = el.querySelector('.gg-peeker');
            const bar = el.querySelector('.gg-progress i'), paw = el.querySelector('.gg-progress span');
            el.addEventListener('scroll', () => {
                const k = Math.min(1, el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight));
                bar.style.width = `${k * 100}%`;
                paw.style.left = `calc(${k * 100}% - 10px)`;
            }, { passive: true });
            let teaseTimer;
            const say = text => {
                if (!text) return;
                Sound.pop();
                tease.textContent = text;
                peeker.classList.remove('show');
                void peeker.offsetWidth;
                peeker.classList.add('show');
                clearTimeout(teaseTimer);
                teaseTimer = setTimeout(() => peeker.classList.remove('show'), 3400);
            };
            const told = new Set();
            const reveal = target => {
                if (target.classList.contains('in')) return;
                target.classList.add('in');
                if (target.classList.contains('gg-title')) Sound.tone(1318, 0.18, 'triangle', 0.04);
                const sec = target.closest('section');
                if (sec && !told.has(sec.dataset.i)) { told.add(sec.dataset.i); say(sections[sec.dataset.i].tease); }
                if (target.classList.contains('gg-end') && !told.has('end')) {
                    told.add('end');
                    say(gift.endTease);
                    event('letter_done');
                    const r = target.getBoundingClientRect();
                    burst(r.left + r.width / 2, r.top, 22);
                }
            };
            const items = [...el.querySelectorAll('.gg-p')];
            // ตัวหลัก: เช็กเองจากตำแหน่งบนจอทุกครั้งที่เลื่อน (ใช้ได้ทุกเบราว์เซอร์มือถือ)
            const check = () => {
                const h = window.innerHeight || document.documentElement.clientHeight;
                items.forEach(p => {
                    const r = p.getBoundingClientRect();
                    if (r.top < h * 0.92 && r.bottom > 0) reveal(p);
                });
            };
            el.addEventListener('scroll', check, { passive: true });
            window.addEventListener('resize', check);
            const ticker = setInterval(check, 400);   // เผื่อเลื่อนแบบที่ไม่ยิง scroll event
            setTimeout(check, 80);
            setTimeout(check, 1000);
            // กันพลาด: ผ่านไป 4 วิแล้วยังไม่มีอะไรขึ้นเลย → โชว์ทั้งหมด อย่างน้อยอ่านได้
            setTimeout(() => { if (!el.querySelector('.gg-p.in')) el.classList.add('fallback'); }, 4000);
            el.querySelector('.gg-end button').onclick = ev => {
                Sound.ok();
                burst(ev.clientX, ev.clientY, 30, ['🎉', '💗', '✨', '🎊', '💖']);
                clearInterval(ticker);
                window.removeEventListener('resize', check);
                setTimeout(resolve, 700);
            };
        });
    }

    // =============================================
    //  4) แนะนำแอปทีละจุด
    // =============================================
    const TOUR = [
        { sel: '#message-input', text: 'พิมพ์คุยกับโมตรงนี้ได้เลย (เวอร์ชั่นนี้ได้ {n} ข้อความนะ 🤫)' },
        { sel: '#mo-avatar', text: 'แตะรูปโมเพื่อดูสตอรี่ที่โมลงไว้' },
        { sel: '#btn-call', text: 'โทรหาโมได้ด้วยนะ 📞' },
        { sel: '#btn-games', text: 'มีเกมให้เล่นกับโมเยอะเลย 🎮' },
        { sel: '#nav-reels', text: 'คลิปที่โมชอบ เปิดดูด้วยกันได้' },
        { sel: '#nav-memory', text: 'ความจำของโม ว่าจำอะไรเกี่ยวกับเราได้บ้าง' },
        { sel: '#nav-brain', text: 'สมอง 3D ของโม ซูมเข้าไปดูความทรงจำได้ 🧠' },
        { sel: '#nav-house', text: 'บ้านของโม มีแมว ต้นไม้ ปฏิทิน แตะเล่นได้หมด 🏡' },
    ];

    async function tour() {
        await wait(3800);   // รอหน้าโหลดของแอปหาย
        for (let i = 0; i < TOUR.length; i++) {
            const step = TOUR[i];
            const target = document.querySelector(step.sel);
            if (!target || !target.getBoundingClientRect().width) continue;
            const r = target.getBoundingClientRect();
            const el = $(`<div class="gg-tour">
                <div class="gg-spot" style="left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div>
                <div class="gg-tip" style="${r.top > innerHeight / 2 ? `bottom:${innerHeight - r.top + 14}px` : `top:${r.bottom + 14}px`}">
                    <p>${esc(step.text.replace('{n}', chatLimit()))}</p>
                    <div><small>${i + 1}/${TOUR.length}</small><button class="gg-btn" type="button">${i === TOUR.length - 1 ? 'เริ่มเลย!' : 'ต่อไป'}</button></div>
                </div></div>`);
            document.body.appendChild(el);
            Sound.pop();
            await new Promise(res => { el.querySelector('button').onclick = res; });
            el.remove();
        }
        event('tour_done');
    }

    // =============================================
    //  เริ่ม
    // =============================================
    (async () => {
        if (saved && saved.ready) {   // เคยผ่านแล้ว → เข้าแอปเลย (เจ้าของปิดแล้ว = หน้าปิด)
            applyRuntime();
            loadApp();
            ownerChatButton();
            api('ping', null, saved.token).then(r => { if (r.status === 403) closedScreen(); }).catch(() => {});
            if (Number(localStorage.getItem('mo_guest_sent') || 0) >= chatLimit()) setTimeout(showLimit, 4000);
            return;
        }
        const ok = await gate();
        if (!ok) return;
        const st = await api('state', null, ok.token);
        if (st.status !== 200) { alert('โหลดข้อมูลไม่ได้ ลองเปิดใหม่อีกทีนะ'); return; }
        Object.entries(st.data.keys || {}).filter(([, v]) => !(v && v.__deleted)).forEach(([k, v]) => {
            try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {}
        });
        const gf = st.data.gift || {};
        saved = { token: ok.token, mode: ok.mode, gift: { chatLimit: gf.chatLimit, limitMsg: gf.limitMsg, ending: gf.ending, byeLabel: gf.byeLabel, byeLast: gf.byeLast, aiNote: gf.aiNote }, ready: false };
        write('mo_guest', saved);
        localStorage.setItem('mo_guest_sent', '0');
        ok.el.remove();
        await warning(st.data.gift);
        await letter(st.data.gift);
        saved.ready = true;
        write('mo_guest', saved);
        // แชทใหม่: แชทเก่าของเจ็ทเก็บแยกไว้ดูอย่างเดียว (ปุ่ม 📜) / แชทนี้เริ่มด้วยข้อความทักของโมตอน ปวช.3
        write('mo_guest_owner_chat', read('mo_chat_history_v2') || []);
        const now = Date.now();
        write('mo_chat_history_v2', st.data.gift.greeting ? [{ id: now, type: 'received', text: st.data.gift.greeting, format: 'text', timestamp: now }] : []);
        applyRuntime();
        loadApp();
        ownerChatButton();
        await tour();
        playNote(st.data.gift.playNote);
    })();
})();
