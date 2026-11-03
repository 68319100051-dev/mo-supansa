/* ============================================
   Mo Mind UI 🧠 - ความทรงจำของโม (สมองโฮโลแกรม)
   สมอง 3D เรืองแสงตามส่วนที่ทำงานจริง แตะแต่ละส่วนเพื่อดูความทรงจำ/ข้อมูลที่ส่วนนั้นดูแล
   ============================================ */

const MO_CHEM_COLORS = {
    dopamine: '#ffd166',
    oxytocin: '#ff7eb6',
    cortisol: '#ff6b6b',
    melatonin: '#9b8cff',
    serotonin: '#4dd9a6',
};

// สมองมุมมองด้านข้าง (หน้าผากอยู่ซ้าย) viewBox 0 0 320 240
const MO_BRAIN_PATHS = {
    frontal: 'M58,122 C52,72 98,36 150,36 L142,110 C116,121 86,126 58,122 Z',
    parietal: 'M150,36 C200,32 242,50 257,82 L192,106 L142,110 Z',
    occipital: 'M257,82 C277,102 281,136 263,156 L216,141 L192,106 Z',
    temporal: 'M58,122 C86,126 116,121 142,110 L192,106 L216,141 C190,170 140,178 100,170 C78,162 63,145 58,122 Z',
    cerebellum: 'M216,141 L263,156 C259,176 231,191 205,183 C194,175 199,151 216,141 Z',
    brainstem: 'M172,172 C186,184 186,204 181,224 L166,224 C168,204 166,188 156,176 Z',
    limbic: 'M128,118 C140,104 168,104 178,118 C182,130 170,142 152,140 C138,139 126,131 128,118 Z',
};

// รอยหยักของสมอง (ตกแต่ง)
const MO_BRAIN_GYRI = [
    'M80,100 C95,86 110,96 120,82', 'M70,118 C84,108 100,114 112,104', 'M100,62 C112,72 124,60 136,70',
    'M168,52 C180,64 196,56 206,68', 'M190,80 C204,90 220,84 232,96', 'M226,110 C240,116 250,108 258,120',
    'M100,148 C118,140 134,152 152,144', 'M160,154 C176,148 188,158 204,150', 'M222,166 C234,160 246,168 254,160',
];

// ส่วนของสมอง → ความทรงจำ/ข้อมูลที่ส่วนนั้นดูแล
const MO_REGION_MEMORY = {
    limbic: { icon: '💗', title: 'ความทรงจำระยะยาว & อารมณ์', hint: 'ฮิปโปแคมปัสเก็บความทรงจำ อะมิกดะลาคุมอารมณ์' },
    temporal: { icon: '💬', title: 'เรื่องที่คุยกัน & ไดอารี่', hint: 'กลีบขมับเข้าใจภาษา จำบทสนทนา' },
    frontal: { icon: '🧭', title: 'ความคิด & การตัดสินใจ', hint: 'สมองส่วนหน้าคิด วางแผน ตัดสินใจ' },
    parietal: { icon: '⏰', title: 'การเตือน & วันสำคัญ', hint: 'กลีบข้างรับรู้เวลาและสิ่งรอบตัว' },
    occipital: { icon: '👁️', title: 'ภาพที่เคยเห็น', hint: 'กลีบท้ายทอยประมวลภาพ รูป และคลิป' },
    cerebellum: { icon: '🎯', title: 'สถิติความสัมพันธ์', hint: 'สมองน้อยจำทักษะและสิ่งที่ทำซ้ำๆ' },
    brainstem: { icon: '🫀', title: 'ร่างกาย & การนอน', hint: 'ก้านสมองคุมระบบพื้นฐานของร่างกาย' },
};

class MoMindUI {
    /**
     * sources = { memory, diary, reminders, life, chat, reels, onClearMemory }
     */
    constructor(mind, sources) {
        this.mind = mind;
        this.src = sources;
        this.screen = document.getElementById('mind-screen');
        this.content = document.getElementById('mind-content');
        this.open = false;
        this.selected = 'limbic';
        this.onClose = null;
        document.getElementById('close-mind').addEventListener('click', () => this.hide());
        mind.onChange(region => { if (this.open) this.pulse(region); });
    }

    show() {
        this.mind.decay();
        this.render();
        this.screen.classList.remove('hidden');
        this.open = true;
        this.last = performance.now();
        this.loop();
        this.panelTimer = setInterval(() => this.renderLive(), 2000);
    }

    hide() {
        this.open = false;
        cancelAnimationFrame(this.raf);
        clearInterval(this.panelTimer);
        if (this.brain3d) this.brain3d.stop();
        this.screen.classList.add('hidden');
        if (this.onClose) this.onClose();
    }

    /**
     * โหลดสมองโฮโลแกรม 3D (Three.js) — เปิดไม่ได้ (ไม่มี WebGL/เน็ต) ใช้สมองแบบ 2D แทน
     */
    mount3D(el) {
        import('./mo-brain3d.js')
            .then(({ Brain3D }) => {
                if (!this.open) return;
                if (!this.brain3d) {
                    this.brain3d = new Brain3D(el);
                    this.brain3d.enablePicking(region => this.select(region));
                } else {
                    el.appendChild(this.brain3d.renderer.domElement);
                    this.brain3d.container = el;
                    this.brain3d.resizeObserver.disconnect();
                    this.brain3d.resizeObserver.observe(el);
                    this.brain3d.resize();
                }
                el.classList.add('ready');
                this.brain3d.select(this.selected);
                this.brain3d.start();
            })
            .catch(err => {
                console.warn('3D brain unavailable, using 2D:', err.message);
                this.brain3d = null;
                el.outerHTML = this.svgBrainHTML();
                this.regionEls = Object.fromEntries([...this.content.querySelectorAll('.mind-region')].map(r => [r.dataset.region, r]));
                Object.entries(this.regionEls).forEach(([k, r]) => r.addEventListener('click', () => this.select(k)));
                this.sparks = this.content.querySelector('.mind-sparks');
            });
    }

    // =============================================
    //  โครงหน้า
    // =============================================

    render() {
        this.regionEls = {};
        this.sparks = null;
        this.content.innerHTML = `
            <div class="mind-hero">
                <div class="mind-3d" id="mind-3d"><div class="mind-3d-loading">กำลังเชื่อมต่อสมอง...</div></div>
                <p class="mind-tap-hint">แตะส่วนของสมองเพื่อดูความทรงจำ • ลากเพื่อหมุน</p>
                <div class="mind-emotion" id="mind-emotion"></div>
            </div>
            <div class="mind-regions" id="mind-regions"></div>
            <div class="mind-panel mind-detail" id="mind-detail"></div>
            <button class="mind-clear" id="mind-clear">🗑️ ล้างความทรงจำทั้งหมด</button>`;
        document.getElementById('mind-clear').addEventListener('click', () => this.src.onClearMemory && this.src.onClearMemory());
        this.renderLive();
        this.renderDetail();
        this.mount3D(document.getElementById('mind-3d'));
    }

    select(region) {
        if (!MO_REGIONS[region]) return;
        this.selected = region;
        if (this.brain3d) this.brain3d.select(region);
        this.mind.fire(region, 0.6);
        this.renderLive();
        this.renderDetail();
        const detail = document.getElementById('mind-detail');
        if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /** สมองแบบ 2D (ใช้เมื่อเปิด 3D ไม่ได้) */
    svgBrainHTML() {
        this.neurons = [];
        const rand = (a, b) => a + Math.random() * (b - a);
        while (this.neurons.length < 34) {
            const x = rand(70, 265), y = rand(45, 175);
            if (((x - 160) / 105) ** 2 + ((y - 108) / 70) ** 2 < 1) this.neurons.push({ x, y });
        }
        const links = [];
        this.neurons.forEach((a, i) => this.neurons.forEach((b, j) => {
            if (j > i && Math.hypot(a.x - b.x, a.y - b.y) < 42) links.push([i, j]);
        }));
        this.links = links;
        return `
                <svg class="mind-brain" viewBox="0 0 320 250" aria-label="สมองของโม">
                    <defs>
                        <filter id="mindGlow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="4" result="b"/>
                            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                    </defs>
                    <ellipse class="mind-ring" cx="160" cy="236" rx="86" ry="8"/>
                    <ellipse class="mind-ring mind-ring-2" cx="160" cy="236" rx="60" ry="5"/>
                    <g filter="url(#mindGlow)">
                        ${Object.entries(MO_BRAIN_PATHS).map(([k, d]) =>
                            `<path class="mind-region" data-region="${k}" d="${d}"><title>${MO_REGIONS[k].name} — ${MO_REGIONS[k].role}</title></path>`).join('')}
                        ${MO_BRAIN_GYRI.map(d => `<path class="mind-gyrus" d="${d}"/>`).join('')}
                    </g>
                    <g class="mind-net">
                        ${links.map(([i, j]) => `<line x1="${this.neurons[i].x}" y1="${this.neurons[i].y}" x2="${this.neurons[j].x}" y2="${this.neurons[j].y}"/>`).join('')}
                    </g>
                    <g class="mind-sparks"></g>
                </svg>`;
    }

    /** มีอะไรเกิดขึ้นในสมอง → กระแสประสาทวิ่งในส่วนนั้น */
    pulse(region) {
        if (this.brain3d) {
            this.brain3d.pulse(region, 8);
        } else if (this.links && this.sparks) {
            for (let k = 0; k < 4; k++) {
                const [i, j] = this.links[Math.floor(Math.random() * this.links.length)];
                const a = this.neurons[i], b = this.neurons[j];
                const spark = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                spark.setAttribute('r', '2.6');
                spark.setAttribute('class', 'mind-spark');
                spark.innerHTML = `<animate attributeName="cx" from="${a.x}" to="${b.x}" dur="0.7s" fill="freeze"/>
                    <animate attributeName="cy" from="${a.y}" to="${b.y}" dur="0.7s" fill="freeze"/>
                    <animate attributeName="opacity" from="1" to="0" dur="0.7s" fill="freeze"/>`;
                this.sparks.appendChild(spark);
                setTimeout(() => spark.remove(), 800);
            }
        }
    }

    /** ส่งระดับการทำงานจริงของแต่ละส่วนไปที่ภาพสมอง */
    loop() {
        if (!this.open) return;
        const now = performance.now();
        this.mind.tickActivation((now - this.last) / 1000);
        this.last = now;
        if (this.brain3d) {
            this.brain3d.setActivation(this.mind.activation);
        } else {
            for (const [k, el] of Object.entries(this.regionEls)) {
                const a = this.mind.activation[k] + (k === this.selected ? 0.4 : 0);
                el.style.fillOpacity = (0.08 + a * 0.55).toFixed(3);
                el.style.strokeOpacity = (0.35 + a * 0.65).toFixed(3);
            }
        }
        this.raf = requestAnimationFrame(() => this.loop());
    }

    // =============================================
    //  ส่วนที่อัปเดตตลอด: อารมณ์ + ชิปส่วนของสมอง
    // =============================================

    esc(t) {
        return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    fmt(ts) {
        return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    }

    renderLive() {
        if (!document.getElementById('mind-emotion')) return;
        const m = this.mind;
        const e = m.emotion();
        const score = m.moodScore();
        if (this.brain3d) {
            this.brain3d.setMoodColor({
                loving: '#ff7eb6', excited: '#ffd166', sulky: '#ff9f6b', stressed: '#ff6b6b',
                sleepy: '#9b8cff', down: '#7aa2ff', happy: '#7dffcf', calm: '#5ff2ff',
            }[e.key] || '#5ff2ff');
        }

        const circ = 2 * Math.PI * 26;
        document.getElementById('mind-emotion').innerHTML = `
            <svg viewBox="0 0 64 64" class="mind-gauge">
                <circle cx="32" cy="32" r="26" class="mind-gauge-track"/>
                <circle cx="32" cy="32" r="26" class="mind-gauge-fill" stroke-dasharray="${(score / 100) * circ} ${circ}"/>
                <text x="32" y="37" text-anchor="middle">${score}</text>
            </svg>
            <div><span class="mind-emo-emoji">${e.emoji}</span><strong>${e.label}</strong><small>อารมณ์รวม / 100</small></div>`;

        const chips = document.getElementById('mind-regions');
        chips.innerHTML = Object.entries(MO_REGIONS).map(([k, r]) => {
            const a = Math.round(m.activation[k] * 100);
            return `<button class="mind-region-chip ${k === this.selected ? 'selected' : ''} ${a > 45 ? 'active' : ''}" data-region="${k}">
                <b>${MO_REGION_MEMORY[k].icon} ${r.name}</b><span>${MO_REGION_MEMORY[k].title}</span><i style="width:${a}%"></i></button>`;
        }).join('');
        chips.querySelectorAll('.mind-region-chip').forEach(btn => btn.addEventListener('click', () => this.select(btn.dataset.region)));

        // ส่วนที่ข้อมูลเปลี่ยนตลอด: อัปเดตรายละเอียดด้วย
        if (this.selected === 'frontal' || this.selected === 'limbic') this.renderDetail(true);
    }

    // =============================================
    //  รายละเอียดของส่วนที่เลือก (ความทรงจำ)
    // =============================================

    renderDetail(liveOnly = false) {
        const box = document.getElementById('mind-detail');
        if (!box) return;
        const info = MO_REGION_MEMORY[this.selected];
        const html = `
            <h3>${info.icon} ${MO_REGIONS[this.selected].name} — ${info.title}</h3>
            <p class="mind-note">${info.hint}</p>
            ${this['detail_' + this.selected]()}`;
        if (liveOnly && box.dataset.region === this.selected && box.dataset.html === html) return;
        box.dataset.region = this.selected;
        box.dataset.html = html;
        box.innerHTML = html;
        this.bindDetail(box);
    }

    section(title, inner) {
        return `<div class="mind-section"><h4>${title}</h4>${inner}</div>`;
    }

    list(items, empty) {
        return items.length
            ? `<div class="mind-list">${items.map(t => `<div class="mind-item">${t}</div>`).join('')}</div>`
            : `<p class="mind-note">${empty}</p>`;
    }

    detail_limbic() {
        const m = this.mind;
        const c = m.state.chem;
        const summary = this.src.memory.getSummary();
        const profile = window.MO_PROFILE || {};
        const facts = [...summary.facts, ...(profile.topics || []).flatMap(t => t.facts)];
        const events = (summary.events || []).slice().reverse().slice(0, 12);

        const chem = Object.entries(MO_CHEMICALS).map(([k, chemDef]) => `
            <div class="mind-chem-row">
                <span class="mind-chem-name" style="color:${MO_CHEM_COLORS[k]}">${chemDef.name}<small>${chemDef.desc}</small></span>
                <div class="mind-chem-track"><div class="mind-chem-fill" style="width:${Math.round(c[k])}%;background:${MO_CHEM_COLORS[k]}"></div>
                    <div class="mind-chem-base" style="left:${chemDef.base}%"></div></div>
                <span class="mind-chem-val">${Math.round(c[k])}</span>
            </div>`).join('');

        return this.section('สารเคมีในสมองตอนนี้', chem)
            + this.section('24 ชั่วโมงที่ผ่านมา', this.chartHTML())
            + this.section(`ความทรงจำระยะยาว (${facts.length})`, this.list(facts.map(f => this.esc(f)), 'ยังไม่มีความทรงจำระยะยาว'))
            + this.section('เหตุการณ์สำคัญ', this.list(events.map(e => `<b>${this.esc(e.title)}</b><small>${this.esc(e.date)}</small>`), 'ยังไม่มีเหตุการณ์สำคัญ'));
    }

    chartHTML() {
        const m = this.mind;
        const hist = [...m.state.history, { t: Date.now(), ...m.state.chem }];
        const W = 300, H = 100, t0 = Date.now() - 24 * 3600000;
        const x = t => ((t - t0) / (24 * 3600000)) * W;
        const y = v => H - (v / 100) * H;
        const lines = Object.keys(MO_CHEMICALS).map(k => {
            const pts = hist.filter(p => p.t >= t0).map(p => `${x(p.t).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
            return `<polyline points="${pts}" stroke="${MO_CHEM_COLORS[k]}"/>`;
        }).join('');
        const ticks = [0, 6, 12, 18, 24].map(hh => {
            const tx = (hh / 24) * W;
            return `<line x1="${tx}" y1="0" x2="${tx}" y2="${H}" class="mind-grid"/><text x="${Math.min(W - 16, Math.max(0, tx - 12))}" y="${H + 12}">${this.fmt(t0 + hh * 3600000)}</text>`;
        }).join('');
        return `<svg viewBox="0 0 ${W} ${H + 16}" class="mind-chart">${ticks}${lines}</svg>
            ${hist.length < 3 ? '<p class="mind-note">กราฟจะค่อยๆ เต็มขึ้นทุก 15 นาที</p>' : ''}`;
    }

    detail_temporal() {
        const summary = this.src.memory.getSummary();
        const diary = this.src.diary;
        diary.update(this.src.chat.messages, () => { if (this.selected === 'temporal') this.renderDetail(); });
        const entries = diary.getEntries();
        return this.section('สรุปเรื่องที่คุยกันมา', summary.chatSummary
                ? `<p class="mind-text">${this.esc(summary.chatSummary)}</p>`
                : '<p class="mind-note">ยังไม่มีบทสรุป (จะสรุปเมื่อคุยกันยาวขึ้น)</p>')
            + this.section('📔 ไดอารี่ของโม', (diary.writing.size ? '<p class="mind-note">✍️ โมกำลังเขียนไดอารี่...</p>' : '')
                + this.list(entries.map(e => `<b>${this.esc(diary.formatDate(e.key))}</b><span>${this.esc(e.text)}</span>`), 'ยังไม่มีไดอารี่ คุยกับโมก่อนนะ'));
    }

    detail_frontal() {
        const thoughts = this.mind.state.thoughts.slice(-25).reverse();
        return this.section('ความคิดล่าสุด', thoughts.length
            ? `<div class="mind-thoughts">${thoughts.map(th => `<div class="mind-thought"><time>${this.fmt(th.t)}</time><span class="mind-thought-region">${MO_REGIONS[th.region] ? MO_REGIONS[th.region].name : th.region}</span><span>${this.esc(th.text)}</span></div>`).join('')}</div>`
            : '<p class="mind-note">ยังไม่มีความคิดที่บันทึกไว้ ลองคุยกับโมดู</p>');
    }

    detail_parietal() {
        const r = this.src.reminders;
        const pending = r.getPending().map(rem => {
            const d = new Date(rem.dueAt);
            const sameDay = d.toDateString() === new Date().toDateString();
            const when = (sameDay ? '' : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ' ') + r.formatTime(rem.dueAt);
            return `<span>⏰ ${this.esc(rem.text)} <small>${when}</small></span><button class="mind-x" data-reminder="${rem.id}" title="ยกเลิก">&times;</button>`;
        });
        const upcoming = r.getUpcoming().map(u => `<span>${this.esc(u.title)} <small>${u.daysLeft === 0 ? 'วันนี้!' : `อีก ${u.daysLeft} วัน`}</small></span>`);
        return this.section('การเตือนที่ตั้งไว้', this.list(pending, 'ยังไม่มี ลองพิมพ์ "เตือนกินยาอีก 30 นาที"'))
            + this.section('วันสำคัญที่กำลังมา', this.list(upcoming, 'ยังไม่มี ลองบอกวันเกิดกับโมดู'));
    }

    detail_occipital() {
        const seen = this.src.chat.messages.filter(m => m.format === 'image' || (m.format === 'reel' && m.extra)).slice(-18).reverse();
        if (!seen.length) return '<p class="mind-note">โมยังไม่เคยเห็นรูปหรือคลิปเลย ลองส่งให้ดูสิ</p>';
        return `<div class="mind-seen">${seen.map(m => {
            const src = m.format === 'image' ? m.text : m.extra.thumbnail;
            const label = m.format === 'image' ? (m.type === 'sent' ? 'รูปจากเอง' : 'รูป') : (m.type === 'sent' ? '🎬 คลิปจากเอง' : '🎬 ' + m.extra.title);
            return `<button class="mind-seen-item" data-msg="${m.id}"><img src="${this.esc(src)}" alt="" loading="lazy"><span>${this.esc(label)}</span></button>`;
        }).join('')}</div>`;
    }

    detail_cerebellum() {
        const s = this.src.memory.getSummary();
        const stats = [
            [s.stats.totalMessages, 'ข้อความทั้งหมด'], [s.stats.totalCalls, 'การโทร'],
            [s.daysKnown, 'วันที่รู้จักกัน'], [s.stats.currentStreak, 'คุยติดกัน (วัน)'],
            [s.level, 'เลเวลความสัมพันธ์'], [s.status, 'สถานะ'],
        ];
        return `<div class="mind-stats">${stats.map(([v, l]) => `<div class="mind-stat"><b>${this.esc(v)}</b><span>${l}</span></div>`).join('')}</div>`;
    }

    detail_brainstem() {
        const L = this.src.life.state;
        const c = L.current;
        const bar = (label, v) => `<div class="mind-chem-row"><span class="mind-chem-name">${label}</span>
            <div class="mind-chem-track"><div class="mind-chem-fill" style="width:${v}%;background:#5ff2ff"></div></div><span class="mind-chem-val">${v}</span></div>`;
        const weather = window.MoWeather && window.MoWeather.describe();
        return this.section('ตอนนี้', `<p class="mind-text">${c ? `${c.emoji} ${this.esc(c.label)}<br><small>ตั้งแต่ ${this.fmt(c.startedAt)}</small>` : '-'}</p>`)
            + this.section('ร่างกาย', bar('อิ่ม', 100 - L.hunger) + bar('พลังงาน', L.energy) + bar('อารมณ์', L.mood))
            + (weather ? this.section('อากาศที่โมรู้สึก', `<p class="mind-text">🌤️ ${this.esc(weather)}</p>`) : '');
    }

    bindDetail(box) {
        box.querySelectorAll('[data-reminder]').forEach(btn => btn.addEventListener('click', () => {
            this.src.reminders.remove(btn.dataset.reminder);
            this.renderDetail();
        }));
        box.querySelectorAll('[data-msg]').forEach(btn => btn.addEventListener('click', () => {
            const msg = this.src.chat.messages.find(m => String(m.id) === btn.dataset.msg);
            if (!msg) return;
            if (msg.format === 'reel') this.src.reels.play(msg.extra);
            else window.open(msg.text, '_blank');
        }));
    }
}

// Export
window.MoMindUI = MoMindUI;
