/* ============================================
   Mo Office 🏢 - ห้องทำงานของโม
   แบ่งเป็นโซนแอป: ตอนนี้ต่อ Google Classroom ได้ (โมเช็กงานใหม่ อ่าน สรุป แล้วโทรมารายงาน แม้ปิดแอป)
   โซนอื่นๆ (Gmail, ปฏิทิน, Drive, สั่งงานโม) เตรียมที่ไว้ ค่อยต่อทีหลัง
   งานจริงทำที่หลังบ้าน (worker.js /api/office/*) — แอปนี้แค่เปิดดู สั่งเช็ก และเชื่อมต่อ
   ============================================ */

const MO_OFFICE_ZONES = [
    { id: 'classroom', icon: '📚', name: 'Google Classroom', desc: 'งานใหม่ / ประกาศ → โมอ่าน สรุป โทรมาบอก', live: true },
    { id: 'gmail', icon: '📧', name: 'Gmail', desc: 'สรุปอีเมลสำคัญ' },
    { id: 'calendar', icon: '📅', name: 'Google Calendar', desc: 'เตือนนัด ประชุม' },
    { id: 'drive', icon: '📁', name: 'Google Drive', desc: 'หาไฟล์ / สรุปเอกสาร' },
    { id: 'tasks', icon: '🗣️', name: 'สั่งงานโม', desc: 'พิมพ์สั่ง แล้วโมไปทำให้' },
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

    /** ฉากโมนั่งโต๊ะทำงาน */
    sceneHTML(loading) {
        const s = this.status;
        const busy = loading ? 'กำลังเปิดไฟ...' : s && s.google.connected && !s.google.broken ? 'นั่งเฝ้าแอปให้อยู่ 👀' : 'ว่างอยู่ รอเองต่อแอปให้';
        return `<div class="office-scene">
            <div class="office-window">🌤️</div>
            <div class="office-shelf">📚📎🗂️</div>
            <div class="office-desk">
                <span class="office-monitor"><i></i></span>
                <img src="mo_avatar.jpg" alt="โม" class="office-mo">
                <span class="office-mug">☕</span>
            </div>
            <p class="office-status">💼 โม${busy}</p>
        </div>`;
    }

    zonesHTML() {
        const s = this.status;
        return `<div class="office-zones">${MO_OFFICE_ZONES.map(z => z.live ? this.classroomHTML() : `
            <div class="office-zone soon"><span class="office-zone-icon">${z.icon}</span>
                <div><b>${z.name}</b><small>${z.desc}</small></div><em>เร็วๆ นี้</em></div>`).join('')}</div>
            ${s.reports.length ? `<div class="house-card"><h3>🗂️ รายงานล่าสุด</h3>${s.reports.map(r => this.reportHTML(r)).join('')}</div>` : ''}`;
    }

    classroomHTML() {
        const s = this.status;
        const g = s.google, c = s.classroom;
        let body;
        if (!s.ready) {
            body = `<p class="setting-hint">หลังบ้านยังไม่ได้ตั้งค่า Google (GOOGLE_CLIENT_ID / SECRET) — ดูวิธีใน docs/office-setup.md</p>`;
        } else if (!g.connected || g.broken) {
            body = `<p class="setting-hint">${g.broken ? '⚠️ การเชื่อมหลุดแล้ว กดเชื่อมใหม่' : 'ล็อกอินบัญชี Google ที่ใช้ Classroom แล้วโมจะคอยดูให้ (อ่านอย่างเดียว ไม่แก้ ไม่ส่งงานแทน)'}</p>
                <button class="btn-primary" data-act="connect">🔗 เชื่อม Google Classroom</button>`;
        } else {
            body = `<p class="setting-hint">✅ ${this.esc(g.email || 'เชื่อมแล้ว')} · ${c ? `${c.courses} วิชา · เช็กล่าสุด ${this.ago(c.lastCheck)}` : ''}</p>
                ${c && c.error ? `<p class="office-error">⚠️ ${this.esc(c.error)}</p>` : ''}
                <div class="settings-actions">
                    <button class="btn-primary" data-act="check">🔎 ให้โมเช็กตอนนี้</button>
                    <button class="btn-secondary" data-act="disconnect">ตัดการเชื่อม</button>
                </div>`;
        }
        return `<div class="office-zone live"><span class="office-zone-icon">📚</span>
            <div class="office-zone-body"><b>Google Classroom</b><small>งานใหม่ / ประกาศ → โมอ่าน สรุป โทรมาบอก (เช็กทุก 15 นาที)</small>${body}</div></div>`;
    }

    reportHTML(r) {
        return `<div class="office-report">
            <div class="office-report-head"><span>${r.kind === 'work' ? '📝' : '📢'} <b>${this.esc(r.title)}</b></span><small>${this.esc(r.course)}</small></div>
            <p>${this.esc(r.summary)}</p>
            ${r.todo ? `<p class="office-todo">👉 ${this.esc(r.todo)}</p>` : ''}
            <div class="office-report-foot">
                ${r.due ? `<span>⏰ ส่ง ${this.esc(r.due)}</span>` : ''}${r.size ? `<span>งาน${this.esc(r.size)}</span>` : ''}
                <span>${this.ago(r.at)}</span>
                ${r.link ? `<a href="${this.esc(r.link)}" target="_blank" rel="noopener">เปิดใน Classroom ↗</a>` : ''}
            </div></div>`;
    }

    bind() {
        this.content.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
            const act = b.dataset.act;
            b.disabled = true;
            if (act === 'connect') {
                const r = await this.api('google/start', {});
                if (r.data.url) { location.href = r.data.url; return; }
                this.chat.showNotification(r.data.error || 'เปิดหน้าล็อกอินไม่ได้');
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
        if (r.status === 401) return 'ต้องล็อกอินซิงก์ก่อนนะ ห้องทำงานถึงจะเปิดได้';
        if (r.status === 503) return 'หลังบ้านยังไม่ได้ตั้งค่า Google เลย (ดู docs/office-setup.md)';
        if (!d.ok) {
            if (d.reason === 'not_connected') return 'ยังไม่ได้เชื่อม Google Classroom เลยนะ เข้าห้องทำงานเค้า (บ้านโม → 🏢) แล้วกดเชื่อมก่อน';
            if (d.reason === 'broken') return 'การเชื่อม Classroom หลุดแล้ว เข้าห้องทำงานแล้วกดเชื่อมใหม่ทีนึงนะ';
            return `เข้า Classroom ไม่ได้แฮะ 😵 (${d.error || 'ไม่รู้สาเหตุ'})`;
        }
        if (d.fresh && d.fresh.length) {
            return `เจองานใหม่ ${d.fresh.length} อัน! เค้าส่งสรุปไว้ในแชทแล้วนะ 📚\n${d.fresh.map(x => `• ${x.course}: ${x.title}${x.due ? ` (ส่ง ${x.due})` : ''}`).join('\n')}`;
        }
        // ไม่มีงานใหม่ → เล่างานล่าสุดที่ยังไม่เลยกำหนด
        const st = await this.api('status');
        const recent = ((st.data && st.data.reports) || []).filter(x => x.kind === 'work').slice(0, 3);
        return `เช็กครบ ${d.courses} วิชาแล้ว ยังไม่มีงานใหม่นะ 😌${recent.length ? `\nงานล่าสุดที่เค้าเคยรายงาน:\n${recent.map(x => `• ${x.course}: ${x.title}${x.due ? ` (ส่ง ${x.due})` : ''}`).join('\n')}` : ''}`;
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
