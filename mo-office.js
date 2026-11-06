/* ============================================
   Mo Office 🏢 - ห้องทำงานของโม
   แบ่งเป็นโซนแอป: ตอนนี้ต่อ Google Classroom ได้ (โมเช็กงานใหม่ อ่าน สรุป แล้วโทรมารายงาน แม้ปิดแอป)
   โซนอื่นๆ (Gmail, ปฏิทิน, Drive, สั่งงานโม) เตรียมที่ไว้ ค่อยต่อทีหลัง
   งานจริงทำที่หลังบ้าน (worker.js /api/office/*) — แอปนี้แค่เปิดดู สั่งเช็ก และเชื่อมต่อ
   ============================================ */

const MO_OFFICE_ZONES = [
    { id: 'classroom', icon: '📚', name: 'Google Classroom', desc: 'งานใหม่ / ประกาศ → โมอ่าน สรุป โทรมาบอก', live: true },
    { id: 'gmail', color: '#fee2e2', icon: '📧', name: 'Gmail', desc: 'อีเมลสำคัญ → โมคัด สรุปมาบอก', live: true },
    { id: 'calendar', color: '#dbeafe', icon: '📅', name: 'Google Calendar', desc: 'เตือนนัด ประชุม' },
    { id: 'drive', color: '#fef3c7', icon: '📁', name: 'Google Drive', desc: 'หาไฟล์ / สรุปเอกสาร' },
    { id: 'tasks', color: '#ede9fe', icon: '🗣️', name: 'สั่งงานโม', desc: 'พิมพ์สั่ง แล้วโมไปทำให้' },
];

class MoOffice {
    /**
     * deps = { sync, chat, mind }
     */
    constructor(deps) {
        this.sync = deps.sync;
        this.chat = deps.chat;
        this.mind = deps.mind;
        this.screen = document.getElementById('office-screen');
        this.content = document.getElementById('office-content');
        this.status = null;
        document.getElementById('close-office').addEventListener('click', () => this.hide());
        // กลับมาจากหน้าล็อกอิน Google
        const flag = new URLSearchParams(location.search).get('office');
        if (flag) {
            history.replaceState(null, '', location.pathname);
            setTimeout(() => {
                this.show();
                this.chat.showNotification(flag === 'connected' ? '🏢 ต่อ Google Classroom เสร็จแล้ว!' : 'เชื่อมต่อไม่สำเร็จ ลองใหม่อีกทีนะ');
            }, 3800);
        }
    }

    esc(t) {
        return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    async api(path, body) {
        const client = this.sync && this.sync.client;
        const session = client ? (await client.auth.getSession()).data.session : null;
        if (!session) return { status: 401, data: { error: 'ต้องล็อกอินซิงก์ก่อน' } };
        const res = await fetch(`/api/office/${path}`, {
            method: body ? 'POST' : 'GET',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${session.access_token}`,
                ...(window.MO_KEYS && window.MO_KEYS.supabaseAnonKey ? { 'x-sb-apikey': window.MO_KEYS.supabaseAnonKey } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        }).catch(() => null);
        if (!res) return { status: 0, data: { error: 'ต่อหลังบ้านไม่ได้' } };
        return { status: res.status, data: await res.json().catch(() => ({})) };
    }

    show() {
        this.screen.classList.remove('hidden');
        this.render();
    }

    hide() {
        this.screen.classList.add('hidden');
    }

    ago(ts) {
        if (!ts) return 'ยังไม่เคย';
        const m = Math.round((Date.now() - ts) / 60000);
        return m < 1 ? 'เมื่อกี้' : m < 60 ? `${m} นาทีที่แล้ว` : m < 1440 ? `${Math.round(m / 60)} ชม.ที่แล้ว` : `${Math.round(m / 1440)} วันที่แล้ว`;
    }

    async render() {
        this.content.innerHTML = `${this.sceneHTML(true)}<p class="office-loading">กำลังเปิดห้อง...</p>`;
        const r = await this.api('status');
        this.status = r.status === 200 ? r.data : null;
        this.content.innerHTML = this.sceneHTML(false) + (this.status ? this.zonesHTML() : `
            <div class="house-card"><p>${this.esc(r.data.error || 'เปิดห้องทำงานไม่ได้')}</p>
            <p class="setting-hint">ห้องทำงานต้องล็อกอินซิงก์ (ตั้งค่า → ซิงก์ข้อมูล) เพราะโมทำงานที่หลังบ้านแม้ปิดแอป</p></div>`);
        this.bind();
    }

    /** ฉากห้องทำงาน (SVG) — ท้องฟ้านอกหน้าต่าง/ไฟโต๊ะเปลี่ยนตามเวลาจริง */
    sceneHTML(loading) {
        const s = this.status;
        const now = new Date();
        const h = now.getHours();
        const night = h >= 19 || h < 6, dusk = h >= 17 && h < 19;
        const working = !loading && s && s.google.connected && !s.google.broken;
        const bubble = loading ? 'แป๊บนะ เปิดไฟก่อน 💡' : working ? 'เฝ้า Classroom ให้อยู่นะ 👀' : 'ว่างอยู่~ ต่อแอปให้เค้าทำงานหน่อย';
        const wall = night ? ['#3a3157', '#2a2342'] : dusk ? ['#ffe2d1', '#f8d5e6'] : ['#fff1f6', '#f4ecff'];
        const sky = night ? ['#1b2350', '#3b3570'] : dusk ? ['#ffb48a', '#f78fb3'] : ['#9fd8ff', '#d9f1ff'];
        const hA = ((h % 12) + now.getMinutes() / 60) * 30, mA = now.getMinutes() * 6;
        return `<div class="office-scene ${night ? 'night' : ''}">
            <svg viewBox="0 0 360 200" class="office-svg" aria-hidden="true">
                <defs>
                    <linearGradient id="ofWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${wall[0]}"/><stop offset="1" stop-color="${wall[1]}"/></linearGradient>
                    <linearGradient id="ofSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
                    <linearGradient id="ofFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${night ? '#5b4636' : '#d9b48f'}"/><stop offset="1" stop-color="${night ? '#46362a' : '#c79f78'}"/></linearGradient>
                    <linearGradient id="ofScreen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fd3ff"/><stop offset="1" stop-color="#c9b6ff"/></linearGradient>
                    <radialGradient id="ofLamp"><stop offset="0" stop-color="rgba(255,214,130,0.75)"/><stop offset="1" stop-color="rgba(255,214,130,0)"/></radialGradient>
                    <clipPath id="ofMoClip"><circle cx="252" cy="98" r="21"/></clipPath>
                </defs>
                <rect width="360" height="150" fill="url(#ofWall)"/>
                <rect y="150" width="360" height="50" fill="url(#ofFloor)"/>
                <rect y="148" width="360" height="4" fill="${night ? '#2a2033' : '#e9cdb2'}"/>
                <!-- หน้าต่าง -->
                <g transform="translate(22 22)">
                    <rect width="88" height="64" rx="6" fill="url(#ofSky)" stroke="#fff" stroke-width="4"/>
                    <line x1="44" y1="0" x2="44" y2="64" stroke="#fff" stroke-width="3"/>
                    ${night
                        ? '<circle cx="66" cy="18" r="8" fill="#fff6c9"/><circle cx="62" cy="15" r="7" fill="url(#ofSky)"/><circle class="of-star" cx="18" cy="14" r="1.6" fill="#fff"/><circle class="of-star s2" cx="30" cy="34" r="1.2" fill="#fff"/><circle class="of-star s3" cx="78" cy="44" r="1.4" fill="#fff"/>'
                        : `<circle cx="66" cy="20" r="9" fill="${dusk ? '#ffd27a' : '#ffe27a'}"/><g class="of-cloud"><ellipse cx="22" cy="40" rx="13" ry="6" fill="#fff"/><ellipse cx="31" cy="36" rx="9" ry="6" fill="#fff"/></g>`}
                    <path d="M-6 -4 Q8 30 -2 70 L-10 70 L-10 -4 Z" fill="#f9a8c9"/>
                    <path d="M94 -4 Q80 30 90 70 L98 70 L98 -4 Z" fill="#f9a8c9"/>
                </g>
                <!-- ชั้นหนังสือ + ต้นไม้ -->
                <g transform="translate(250 30)">
                    <rect y="26" width="92" height="5" rx="2" fill="#a37c55"/>
                    <rect x="6" y="6" width="8" height="20" fill="#f472b6"/><rect x="15" y="9" width="7" height="17" fill="#60a5fa"/><rect x="23" y="4" width="9" height="22" fill="#fbbf24"/><rect x="33" y="10" width="7" height="16" fill="#34d399"/>
                    <rect x="58" y="14" width="16" height="12" rx="3" fill="#e9a273"/>
                    <path d="M66 14 C58 4 60 -2 66 4 C70 -4 76 2 70 14 Z" fill="#4ade80"/>
                </g>
                <!-- นาฬิกา (เวลาจริง) -->
                <g transform="translate(176 40)">
                    <circle r="15" fill="#fff" stroke="#f9a8c9" stroke-width="3"/>
                    <line x1="0" y1="0" x2="0" y2="-7" stroke="#334155" stroke-width="2.4" stroke-linecap="round" transform="rotate(${hA})"/>
                    <line x1="0" y1="0" x2="0" y2="-11" stroke="#f04d85" stroke-width="1.6" stroke-linecap="round" transform="rotate(${mA})"/>
                    <circle r="1.8" fill="#334155"/>
                </g>
                <!-- รูปติดผนัง -->
                <g transform="translate(130 28) rotate(-4)"><rect width="26" height="22" rx="2" fill="#fff" stroke="#e7c6d3" stroke-width="2"/><text x="13" y="16" font-size="11" text-anchor="middle">💕</text></g>
                ${night ? '<circle cx="104" cy="118" r="60" fill="url(#ofLamp)"/>' : ''}
                <!-- โม + เก้าอี้ -->
                <rect x="232" y="104" width="40" height="34" rx="10" fill="${night ? '#6b4f8a' : '#c4b5fd'}"/>
                <g class="of-mo">
                    <circle cx="252" cy="98" r="24" fill="#fff"/>
                    <image href="mo_avatar.jpg" x="231" y="77" width="42" height="42" clip-path="url(#ofMoClip)" preserveAspectRatio="xMidYMid slice"/>
                    <path d="M230 96 Q230 72 252 72 Q274 72 274 96" fill="none" stroke="#334155" stroke-width="3" stroke-linecap="round"/>
                    <rect x="226" y="92" width="7" height="12" rx="3" fill="#f04d85"/><rect x="271" y="92" width="7" height="12" rx="3" fill="#f04d85"/>
                    <path d="M229 103 Q236 112 246 110" fill="none" stroke="#334155" stroke-width="2"/>
                </g>
                <!-- โต๊ะ -->
                <rect x="70" y="128" width="236" height="12" rx="4" fill="#8a6440"/>
                <rect x="78" y="140" width="8" height="34" fill="#6d4e31"/><rect x="290" y="140" width="8" height="34" fill="#6d4e31"/>
                <!-- จอคอม -->
                <g transform="translate(118 84)">
                    <rect width="74" height="44" rx="5" fill="#2f3446"/>
                    <rect x="4" y="4" width="66" height="34" rx="3" fill="url(#ofScreen)" class="of-screen"/>
                    <rect x="9" y="9" width="30" height="3" rx="1.5" fill="rgba(255,255,255,0.85)" class="of-code c1"/>
                    <rect x="9" y="16" width="44" height="3" rx="1.5" fill="rgba(255,255,255,0.7)" class="of-code c2"/>
                    <rect x="9" y="23" width="22" height="3" rx="1.5" fill="rgba(255,255,255,0.8)" class="of-code c3"/>
                    <rect x="9" y="30" width="36" height="3" rx="1.5" fill="rgba(255,255,255,0.6)" class="of-code c4"/>
                    <rect x="32" y="44" width="10" height="6" fill="#2f3446"/>
                </g>
                <rect x="132" y="122" width="48" height="6" rx="2" fill="#e5e7eb"/>
                <!-- โคมไฟ -->
                <g transform="translate(92 92)"><path d="M0 36 L6 36 L6 8" stroke="#475569" stroke-width="3" fill="none"/><path d="M-6 10 L14 0 L18 10 Z" fill="${night ? '#fde68a' : '#f9a8c9'}"/></g>
                <!-- แก้วกาแฟ -->
                <g transform="translate(206 112)"><rect width="14" height="16" rx="3" fill="#fff" stroke="#e7c6d3" stroke-width="1.5"/><path d="M14 4 Q20 8 14 12" stroke="#e7c6d3" stroke-width="1.5" fill="none"/><path class="of-steam" d="M4 -2 Q1 -7 5 -11" stroke="#cbd5e1" stroke-width="1.4" fill="none"/><path class="of-steam s2" d="M10 -2 Q7 -8 11 -12" stroke="#cbd5e1" stroke-width="1.4" fill="none"/></g>
                <!-- โพสต์อิท -->
                <rect x="296" y="96" width="16" height="16" fill="#fde68a" transform="rotate(8 304 104)"/><rect x="314" y="100" width="14" height="14" fill="#bbf7d0" transform="rotate(-6 321 107)"/>
            </svg>
            <div class="office-bubble">${bubble}</div>
        </div>`;
    }

    /** วันเหลือก่อนส่ง จาก "12/11 23:00" (ปีนี้/ปีหน้า) */
    dueInfo(due) {
        const m = /^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(due || '');
        if (!m) return null;
        const now = new Date();
        let d = new Date(now.getFullYear(), m[2] - 1, m[1], m[3] ? +m[3] : 23, m[4] ? +m[4] : 59);
        if (d - now < -180 * 86400000) d = new Date(now.getFullYear() + 1, m[2] - 1, m[1], d.getHours(), d.getMinutes());
        // นับเป็นวันตามปฏิทิน (ส่ง 23:00 พรุ่งนี้ = "พรุ่งนี้" ไม่ใช่ "อีก 2 วัน")
        const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate());
        const days = Math.round((day(d) - day(now)) / 86400000);
        const level = d < now ? 'late' : days <= 1 ? 'hot' : days <= 4 ? 'soon' : 'ok';
        const text = d < now ? 'เลยกำหนดแล้ว' : days <= 0 ? 'ส่งวันนี้!' : days === 1 ? 'ส่งพรุ่งนี้' : `อีก ${days} วัน`;
        return { level, text };
    }

    zonesHTML() {
        const s = this.status;
        const tiles = MO_OFFICE_ZONES.filter(z => !z.live).map(z => `
            <div class="office-tile soon" style="--tile:${z.color}">
                <span class="office-tile-icon">${z.icon}</span>
                <b>${z.name}</b><small>${z.desc}</small>
                <em>เร็วๆ นี้</em>
            </div>`).join('');
        const works = s.reports.filter(r => r.kind === 'work');
        const mails = s.reports.filter(r => r.kind === 'mail');
        return `${this.classroomHTML()}
            ${this.gmailHTML()}
            <h3 class="office-section">🧩 โซนแอปอื่นๆ <small>ค่อยมาต่อเพิ่มทีหลัง</small></h3>
            <div class="office-tiles">${tiles}</div>
            <h3 class="office-section">🗂️ โต๊ะรายงาน <small>${s.reports.length ? `${works.length} งาน · ${mails.length} อีเมล · ${s.reports.length - works.length - mails.length} ประกาศ` : 'ยังไม่มี'}</small></h3>
            ${s.reports.length
                ? `<div class="office-reports">${s.reports.map(r => this.reportHTML(r)).join('')}</div>`
                : '<div class="office-empty">📭 ยังไม่มีรายงาน พอมีงานใหม่เค้าจะสรุปวางไว้ตรงนี้ให้</div>'}`;
    }

    classroomHTML() {
        const s = this.status;
        const g = s.google, c = s.classroom;
        const state = !s.ready ? ['setup', '⚙️ รอตั้งค่า'] : g.broken ? ['broken', '⚠️ หลุด'] : g.connected ? ['on', '🟢 ทำงานอยู่'] : ['off', '⚪ ยังไม่เชื่อม'];
        let body;
        if (!s.ready) {
            body = `<p class="office-note">หลังบ้านยังไม่ได้ใส่ GOOGLE_CLIENT_ID / SECRET — ทำตาม <b>docs/office-setup.md</b> ครั้งเดียวจบ</p>`;
        } else if (!g.connected || g.broken) {
            body = `<p class="office-note">${g.broken ? 'การเชื่อมหลุดแล้ว กดเชื่อมใหม่ได้เลย' : 'ล็อกอินบัญชี Google ที่ใช้ Classroom แล้วเค้าจะคอยดูให้ (อ่านอย่างเดียว ไม่แก้ ไม่ส่งงานแทน)'}</p>
                <button class="office-btn primary" data-act="connect"><span>🔗</span> เชื่อม Google Classroom</button>`;
        } else {
            body = `<div class="office-stats">
                    <div><b>${c ? c.courses : 0}</b><small>วิชา</small></div>
                    <div><b>${c ? this.ago(c.lastCheck) : '-'}</b><small>เช็กล่าสุด</small></div>
                    <div><b>${s.reports.length}</b><small>รายงาน</small></div>
                </div>
                <p class="office-account">✉️ ${this.esc(g.email || 'เชื่อมแล้ว')}</p>
                ${c && c.error ? `<p class="office-error">⚠️ ${this.esc(c.error)}</p>` : ''}
                <div class="office-courses" id="office-courses"><span class="office-course-chip loading">กำลังดูวิชา...</span></div>
                <form class="office-ask" id="office-ask">
                    <input type="text" name="q" placeholder="ถามโม เช่น งานไหนใกล้ส่ง / วิชาคอมมีงานค้างไหม" autocomplete="off" maxlength="200">
                    <button type="submit" aria-label="ถาม">💬</button>
                </form>
                <div class="office-answer hidden" id="office-answer"></div>
                <div class="office-actions">
                    <button class="office-btn primary" data-act="check"><span>🔎</span> ให้โมเช็กงานใหม่</button>
                    <button class="office-btn ghost" data-act="disconnect">ตัดการเชื่อม</button>
                </div>`;
        }
        return `<div class="office-main ${state[0]}">
            <div class="office-main-head">
                <span class="office-app-icon">📚</span>
                <div><b>Google Classroom</b><small>งานใหม่ / ประกาศ → โมอ่าน สรุป โทรมาบอก · ทุก 15 นาที</small></div>
                <span class="office-chip ${state[0]}">${state[1]}</span>
            </div>
            ${body}
        </div>`;
    }

    /** การ์ด Gmail: ใช้การเชื่อม Google เดียวกับ Classroom (ต้องอนุญาตสิทธิ์อ่านอีเมลเพิ่ม) */
    gmailHTML() {
        const s = this.status;
        const g = s.google, m = s.gmail;
        if (!s.ready || !g.connected || g.broken) return '';
        const state = g.gmail ? ['on', '🟢 ทำงานอยู่'] : ['off', '⚪ ยังไม่อนุญาต'];
        const body = g.gmail
            ? `<div class="office-stats">
                    <div><b>${m ? m.unread : 0}</b><small>ยังไม่อ่าน</small></div>
                    <div><b>${m ? this.ago(m.lastCheck) : '-'}</b><small>เช็กล่าสุด</small></div>
                    <div><b>${s.reports.filter(r => r.kind === 'mail').length}</b><small>สำคัญ</small></div>
                </div>
                ${m && m.error ? `<p class="office-error">⚠️ ${this.esc(m.error)}</p>` : ''}
                <div class="office-actions"><button class="office-btn primary" data-act="gmail"><span>📧</span> ให้โมเช็กเมลตอนนี้</button></div>`
            : `<p class="office-note">ให้โมอ่านอีเมลได้ (อ่านอย่างเดียว) โมจะคัดเฉพาะเมลสำคัญจากครู โรงเรียน ที่ทำงาน แล้วสรุปมาบอก ทิ้งโฆษณาให้</p>
                <button class="office-btn primary" data-act="connect"><span>🔗</span> อนุญาตให้อ่าน Gmail</button>`;
        return `<div class="office-main ${state[0]}">
            <div class="office-main-head">
                <span class="office-app-icon gmail">📧</span>
                <div><b>Gmail</b><small>อีเมลใหม่ที่สำคัญ → โมคัด สรุปมาบอก · ทุก 1 ชั่วโมง</small></div>
                <span class="office-chip ${state[0]}">${state[1]}</span>
            </div>
            ${body}
        </div>`;
    }

    /** เช็ก Gmail เดี๋ยวนี้ → ข้อความรายงานแบบโม */
    async checkGmail() {
        this.mind && this.mind.think('frontal', 'เปิด Gmail ไปดูเมลใหม่ให้เอง');
        const r = await this.api('gmail/check', {});
        const problem = this.problemText(r);
        if (problem) return problem;
        const d = r.data;
        if (d.seeded) return `เชื่อม Gmail แล้ว ตอนนี้มีเมลยังไม่อ่าน ${d.unread} ฉบับ ต่อไปมีเมลสำคัญเข้ามาเค้าจะสรุปมาบอกนะ 📧`;
        if (d.fresh && d.fresh.length) return `มีเมลสำคัญ ${d.fresh.length} ฉบับ! เค้าสรุปไว้ในแชทแล้วนะ 📧\n${d.fresh.map(x => `• ${x.course}: ${x.title}`).join('\n')}`;
        return `เช็กแล้ว ไม่มีเมลสำคัญใหม่นะ 😌 (ยังไม่อ่าน ${d.unread} ฉบับ เป็นพวกโฆษณาหรือเคยรายงานไปแล้ว)`;
    }

    reportHTML(r) {
        const due = r.kind === 'work' ? this.dueInfo(r.due) : null;
        return `<article class="office-report ${r.kind}">
            <div class="office-report-top">
                <span class="office-course">${r.kind === 'work' ? '📝' : r.kind === 'mail' ? '✉️' : '📢'} ${this.esc(r.course)}</span>
                <time>${this.ago(r.at)}</time>
            </div>
            <h4>${this.esc(r.title)}</h4>
            <p>${this.esc(r.summary)}</p>
            ${r.todo ? `<div class="office-todo">👉 ${this.esc(r.todo)}</div>` : ''}
            <div class="office-report-foot">
                ${due ? `<span class="office-due ${due.level}">⏰ ${this.esc(r.due)} · ${due.text}</span>` : ''}
                ${r.size ? `<span class="office-size">งาน${this.esc(r.size)}</span>` : ''}
                ${r.link ? `<a href="${this.esc(r.link)}" target="_blank" rel="noopener">${r.kind === 'mail' ? 'เปิดเมล ↗' : 'เปิดงาน ↗'}</a>` : ''}
            </div>
        </article>`;
    }

    bind() {
        // รายชื่อวิชา (ดึงสด แคช 3 นาทีที่หลังบ้าน)
        const box = this.content.querySelector('#office-courses');
        if (box) this.api('classroom/courses').then(r => {
            const list = (r.data && r.data.courses) || [];
            box.innerHTML = list.length
                ? list.map(c => `<a class="office-course-chip" href="${this.esc(c.link || '#')}" target="_blank" rel="noopener">${this.esc(c.name)}${c.pending ? ` <b>${c.pending}</b>` : ''}</a>`).join('')
                : `<span class="office-course-chip loading">${this.esc(this.problemText(r) || 'ไม่มีวิชาที่เปิดอยู่')}</span>`;
        });
        const form = this.content.querySelector('#office-ask');
        if (form) form.addEventListener('submit', async e => {
            e.preventDefault();
            const q = form.q.value.trim();
            if (!q) return;
            const out = this.content.querySelector('#office-answer');
            out.classList.remove('hidden');
            out.textContent = 'เค้ากำลังเปิด Classroom ดูให้... 👀';
            form.q.value = '';
            const answer = await this.ask(q);
            out.innerHTML = `<b>เอง:</b> ${this.esc(q)}<br><br>${this.esc(answer).replace(/\n/g, '<br>')}`;
        });
        this.content.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
            const act = b.dataset.act;
            b.disabled = true;
            if (act === 'connect') {
                const r = await this.api('google/start', {});
                if (r.data.url) { location.href = r.data.url; return; }
                this.chat.showNotification(r.data.error || 'เปิดหน้าล็อกอินไม่ได้');
            }
            if (act === 'gmail') {
                b.textContent = 'โมกำลังอ่านเมล...';
                const text = await this.checkGmail();
                this.chat.showNotification(text.split('\n')[0]);
            }
            if (act === 'check') {
                b.textContent = 'โมกำลังดู...';
                const text = await this.checkNow();
                this.chat.showNotification(text.split('\n')[0]);
            }
            if (act === 'disconnect' && confirm('ตัดการเชื่อม Google Classroom? โมจะเลิกเช็กงานให้')) {
                await this.api('google/disconnect', {});
                this.mind && this.mind.decide('เลิกเฝ้า Classroom ตามที่เองสั่ง');
            }
            this.render();
        }));
    }

    /** เช็กเดี๋ยวนี้ → ข้อความรายงานแบบโม (ใช้ทั้งในห้องและคำสั่งในแชท) */
    async checkNow() {
        const r = await this.api('classroom/check', {});
        const d = r.data || {};
        this.mind && this.mind.think('frontal', 'เข้าห้องทำงาน ไปเช็ก Classroom ให้เอง');
        const problem = this.problemText(r);
        if (problem) return problem;
        if (d.fresh && d.fresh.length) {
            return `เจองานใหม่ ${d.fresh.length} อัน! เค้าส่งสรุปไว้ในแชทแล้วนะ 📚\n${d.fresh.map(x => `• ${x.course}: ${x.title}${x.due ? ` (ส่ง ${x.due})` : ''}`).join('\n')}`;
        }
        // ไม่มีงานใหม่ → เล่างานล่าสุดที่ยังไม่เลยกำหนด
        const st = await this.api('status');
        const recent = ((st.data && st.data.reports) || []).filter(x => x.kind === 'work').slice(0, 3);
        return `เช็กครบ ${d.courses} วิชาแล้ว ยังไม่มีงานใหม่นะ 😌${recent.length ? `\nงานล่าสุดที่เค้าเคยรายงาน:\n${recent.map(x => `• ${x.course}: ${x.title}${x.due ? ` (ส่ง ${x.due})` : ''}`).join('\n')}` : ''}`;
    }

    /** ข้อความเมื่อทำไม่ได้ (ยังไม่ล็อกอิน / ยังไม่ตั้งค่า / ยังไม่เชื่อม / หลุด) — null = ไม่มีปัญหา */
    problemText(r) {
        const d = r.data || {};
        if (r.status === 401) return 'ต้องล็อกอินซิงก์ก่อนนะ ห้องทำงานถึงจะเปิดได้';
        if (r.status === 503) return 'หลังบ้านยังไม่ได้ตั้งค่า Google เลย (ดู docs/office-setup.md)';
        if (r.status === 0) return 'ต่อหลังบ้านไม่ได้ เน็ตหลุดป่าว ลองใหม่อีกทีนะ';
        if (d.ok) return null;
        if (d.reason === 'not_connected') return 'ยังไม่ได้เชื่อม Google Classroom เลยนะ เข้าห้องทำงานเค้า (บ้านโม → 🏢) แล้วกดเชื่อมก่อน';
        if (d.reason === 'broken') return 'การเชื่อม Classroom หลุดแล้ว เข้าห้องทำงานแล้วกดเชื่อมใหม่ทีนึงนะ';
        if (d.reason === 'need_gmail') return 'ยังไม่ได้อนุญาตให้เค้าอ่าน Gmail นะ เข้าห้องทำงาน (บ้านโม → 🏢) แล้วกด "อนุญาตให้อ่าน Gmail" ทีนึง';
        return `เข้า Classroom ไม่ได้แฮะ 😵 (${d.error || 'ไม่รู้สาเหตุ'})`;
    }

    /** ถามอะไรก็ได้เรื่อง Classroom → โมไปดูข้อมูลจริงแล้วตอบ */
    async ask(question) {
        this.mind && this.mind.think('frontal', `เปิด Classroom ไปหาคำตอบ: "${String(question).slice(0, 40)}"`);
        const r = await this.api('classroom/ask', { q: question });
        return this.problemText(r) || r.data.answer || 'หาไม่เจอแฮะ ลองถามใหม่อีกทีนะ';
    }

    /** โทรมาจากแจ้งเตือนรายงานงาน → ให้โมเล่าเรื่องนั้นในสาย */
    callTopic(messages) {
        const now = Date.now();
        const m = [...messages].reverse().find(x => x.type === 'received' && String(x.dueKey || '').startsWith('office:') && now - x.timestamp < 30 * 60000);
        return m ? `[ข้อความระบบ: โมโทรมารายงานงานจากห้องทำงาน เรื่องนี้: "${String(m.text).slice(0, 600)}" — เล่าสรุปสั้นๆ แบบคุยโทรศัพท์ ว่างานอะไร ส่งเมื่อไหร่ ต้องทำอะไร แล้วถามว่าจะให้ช่วยอะไรต่อ]\n` : '';
    }
}

window.MoOffice = MoOffice;
window.MO_OFFICE_ZONES = MO_OFFICE_ZONES;
