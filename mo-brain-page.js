/* ============================================
   Mo Brain Page 🧠 - หน้าสมองของโมแบบเต็มจอ
   สมอง 3D ซูมเข้าออกได้ ความทรงจำเป็นดวงไฟอยู่ในส่วนที่เก็บมัน
   ซูมเข้าไปจะเห็นข้อความ แตะเพื่ออ่าน + รายงานสดว่าสมองกำลังทำอะไร
   ============================================ */

const MO_MOOD_COLORS = {
    loving: '#ff7eb6', excited: '#ffd166', sulky: '#ff9f6b', stressed: '#ff6b6b',
    sleepy: '#9b8cff', down: '#7aa2ff', happy: '#7dffcf', calm: '#5ff2ff',
};

class MoBrainPage {
    /**
     * sources = { memory, diary, reminders, life }
     */
    constructor(mind, sources) {
        this.mind = mind;
        this.src = sources;
        this.screen = document.getElementById('brain-page');
        this.open = false;
        this.filter = null;      // แสดงเฉพาะความทรงจำของส่วนนี้ (null = ทั้งหมด)
        this.onClose = null;
        document.getElementById('close-brain').addEventListener('click', () => this.hide());
        document.getElementById('brain-zoom-in').addEventListener('click', () => this.brain3d && this.brain3d.zoomBy(0.7));
        document.getElementById('brain-zoom-out').addEventListener('click', () => this.brain3d && this.brain3d.zoomBy(1.4));
        document.getElementById('brain-zoom-reset').addEventListener('click', () => {
            this.filter = null;
            if (this.brain3d) { this.brain3d.resetView(); this.brain3d.select(null); }
            this.renderLegend();
        });
        document.getElementById('brain-card').addEventListener('click', e => {
            if (e.target.closest('[data-close]')) e.currentTarget.classList.add('hidden');
        });
        mind.onChange(region => {
            if (!this.open) return;
            if (this.brain3d) this.brain3d.pulse(region, 8);
            this.renderFeed();
        });
    }

    show() {
        this.mind.decay();
        this.screen.classList.remove('hidden');
        this.open = true;
        this.memories = this.collect();
        this.renderLegend();
        this.renderFeed();
        this.renderReport();
        this.mount();
        this.last = performance.now();
        this.loop();
        this.reportTimer = setInterval(() => this.renderReport(), 1000);
    }

    hide() {
        this.open = false;
        cancelAnimationFrame(this.raf);
        clearInterval(this.reportTimer);
        if (this.brain3d) this.brain3d.stop();
        this.screen.classList.add('hidden');
        document.getElementById('brain-card').classList.add('hidden');
        if (this.onClose) this.onClose();
    }

    mount() {
        const el = document.getElementById('brain-3d');
        import('./mo-brain3d.js')
            .then(({ Brain3D }) => {
                if (!this.open) return;
                if (!this.brain3d) {
                    this.brain3d = new Brain3D(el);
                    this.brain3d.enableZoom();
                    this.brain3d.enablePicking(region => this.focus(region));
                    this.brain3d.onFrame = () => this.placeLabels();
                }
                el.classList.add('ready');
                this.brain3d.setMemories(this.memories);
                this.brain3d.start();
            })
            .catch(err => {
                el.innerHTML = `<p class="brain-fail">เปิดสมอง 3D ไม่ได้ (${this.esc(err.message)})<br>ต้องต่อเน็ตและเครื่องรองรับ WebGL</p>`;
            });
    }

    loop() {
        if (!this.open) return;
        const now = performance.now();
        this.mind.tickActivation((now - this.last) / 1000);
        this.last = now;
        if (this.brain3d) this.brain3d.setActivation(this.mind.activation);
        this.raf = requestAnimationFrame(() => this.loop());
    }

    esc(t) {
        return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // =============================================
    //  รวบรวมความทรงจำทุกอย่าง → ส่วนของสมองที่เก็บมัน
    // =============================================

    collect() {
        const out = [];
        const add = (region, icon, kind, text, at) => { if (text) out.push({ region, icon, kind, text: String(text), at }); };
        const tryAll = fn => { try { fn(); } catch (e) { console.warn('brain memories:', e.message); } };

        tryAll(() => {
            const s = this.src.memory.getSummary();
            (s.facts || []).forEach(f => add('limbic', '💕', 'เรื่องของเอง', f));
            (s.events || []).slice(-15).forEach(e => add('temporal', '📜', 'เหตุการณ์สำคัญ', e.title, e.date));
        });
        tryAll(() => {
            const self = window.MoSelfInstance;
            if (!self) return;
            self.data.opinions.forEach(o => add('frontal', '🪞', 'ความเห็นของโม', o));
            self.data.jokes.forEach(j => add('cerebellum', '😆', 'มุกของเรา', j));
            self.data.photos.forEach(p => add('occipital', '🖼️', 'รูปที่เองส่งมา', p.desc, new Date(p.at).toLocaleDateString('th-TH')));
        });
        tryAll(() => {
            const psyche = window.MoPsycheInstance;
            if (psyche) psyche.data.autobio.slice(-20).forEach(m => add('limbic', '🌸', 'ความทรงจำชีวิตโม', m.text, new Date(m.at).toLocaleDateString('th-TH')));
        });
        tryAll(() => {
            this.src.diary.getEntries().slice(0, 7).forEach(e => add('temporal', '📔', 'ไดอารี่', e.text, this.src.diary.formatDate(e.key)));
        });
        tryAll(() => {
            const r = this.src.reminders;
            r.getPending().forEach(x => add('parietal', '⏰', 'การเตือน', x.text, r.formatTime(x.dueAt)));
            r.getUpcoming().forEach(u => add('parietal', '📅', 'วันสำคัญ', u.title, u.daysLeft === 0 ? 'วันนี้' : `อีก ${u.daysLeft} วัน`));
        });
        tryAll(() => {
            const care = window.MoCareInstance;
            if (care) care.concerns().forEach(c => add('limbic', '💗', 'เรื่องที่ห่วง', c.ask.split(' ถาม')[0]));
        });
        tryAll(() => {
            const now = this.src.life && this.src.life.describeNow();
            if (now) add('brainstem', '🫀', 'ตอนนี้โม', now);
        });
        return out.slice(0, 120);
    }

    // =============================================
    //  ป้ายความทรงจำ: ซูมเข้าใกล้ถึงจะเห็นข้อความ
    // =============================================

    placeLabels() {
        const box = document.getElementById('brain-labels');
        if (!box || !this.brain3d) return;
        if (!this.labelEls || this.labelEls.length !== this.memories.length) {
            box.innerHTML = this.memories.map((m, i) =>
                `<button class="brain-mem" data-i="${i}">${m.icon} ${this.esc(m.text.length > 22 ? m.text.slice(0, 22) + '…' : m.text)}</button>`).join('');
            this.labelEls = [...box.children];
            this.labelEls.forEach(b => b.addEventListener('click', () => this.openCard(this.memories[b.dataset.i])));
        }
        const dist = this.brain3d.distance();
        // ไกล = ไม่มีป้าย / ใกล้ขึ้น = เห็นมากขึ้น
        const zoomIn = Math.max(0, Math.min(1, (3.3 - dist) / 1.4));
        const pos = this.brain3d.projectMemories();
        let shown = 0;
        pos.forEach((p, i) => {
            const el = this.labelEls[i];
            const m = this.memories[i];
            const ok = zoomIn > 0 && p.front > 0.15 && (!this.filter || m.region === this.filter) && shown < 14 + zoomIn * 16;
            if (!ok) { el.style.opacity = 0; el.style.pointerEvents = 'none'; return; }
            shown++;
            el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -130%)`;
            el.style.opacity = (zoomIn * Math.min(1, (p.front - 0.15) * 3)).toFixed(2);
            el.style.pointerEvents = 'auto';
            el.style.zIndex = Math.round(p.front * 100);
        });
        const hint = document.getElementById('brain-hint');
        if (hint) hint.textContent = zoomIn > 0 ? `ซูม ${Math.round(100 + zoomIn * 200)}% • แตะป้ายเพื่ออ่าน` : 'บีบนิ้ว/กด + เพื่อซูมเข้าไปดูความทรงจำ';
    }

    openCard(m) {
        const r = MO_REGIONS[m.region];
        const card = document.getElementById('brain-card');
        card.innerHTML = `<div class="brain-card-head"><b>${m.icon} ${this.esc(m.kind)}</b><button data-close="1" class="mind-x">&times;</button></div>
            <p>${this.esc(m.text)}</p>
            <small>เก็บไว้ที่ ${this.esc(r ? r.name : m.region)}${m.at ? ` • ${this.esc(m.at)}` : ''}</small>`;
        card.classList.remove('hidden');
        this.mind.fire(m.region, 0.7);
    }

    /** แตะส่วนของสมอง / ชิป → ไฮไลต์ส่วนนั้น ซูมเข้า โชว์เฉพาะความทรงจำของส่วนนั้น */
    focus(region) {
        this.filter = this.filter === region ? null : region;
        if (this.brain3d) {
            this.brain3d.select(this.filter);
            if (this.filter && this.brain3d.distance() > 2.4) this.brain3d.zoomBy(2.2 / this.brain3d.distance());
        }
        this.mind.fire(region, 0.6);
        this.renderLegend();
    }

    renderLegend() {
        const counts = {};
        this.memories.forEach(m => { counts[m.region] = (counts[m.region] || 0) + 1; });
        const box = document.getElementById('brain-legend');
        box.innerHTML = Object.entries(MO_REGIONS).map(([k, r]) =>
            `<button class="brain-chip ${this.filter === k ? 'on' : ''}" data-region="${k}">${MO_REGION_MEMORY[k].icon} ${r.name} <b>${counts[k] || 0}</b></button>`).join('');
        box.querySelectorAll('.brain-chip').forEach(b => b.addEventListener('click', () => this.focus(b.dataset.region)));
    }

    // =============================================
    //  รายงานสด
    // =============================================

    renderReport() {
        if (!this.open) return;
        const m = this.mind;
        const e = m.emotion();
        if (this.brain3d) this.brain3d.setMoodColor(MO_MOOD_COLORS[e.key] || '#5ff2ff');
        const top = Object.entries(m.activation).sort((a, b) => b[1] - a[1])[0];
        document.getElementById('brain-hud').innerHTML = `
            <span>${e.emoji} ${e.label} <b>${m.moodScore()}</b></span>
            <span>💡 ${this.memories.length} ความทรงจำ</span>
            <span>⚡ ${MO_REGIONS[top[0]].name} ${Math.round(top[1] * 100)}%</span>`;
        const chem = m.state.chem;
        document.getElementById('brain-meters').innerHTML =
            Object.entries(MO_REGIONS).map(([k, r]) => {
                const a = Math.round(m.activation[k] * 100);
                return `<div class="brain-meter"><span>${MO_REGION_MEMORY[k].icon} ${r.name}</span><i><em style="width:${a}%"></em></i><b>${a}%</b></div>`;
            }).join('')
            + `<div class="brain-chems">${Object.entries(MO_CHEMICALS).map(([k, c]) =>
                `<span style="--c:${MO_CHEM_COLORS[k]}">${c.name} <b>${Math.round(chem[k])}</b></span>`).join('')}</div>`;
    }

    renderFeed() {
        clearTimeout(this.feedTimer);
        this.feedTimer = setTimeout(() => {
            const list = this.mind.state.thoughts.slice().reverse().slice(0, 30);
            document.getElementById('brain-feed').innerHTML = list.length
                ? list.map(t => `<li><time>${new Date(t.t).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                    <span class="brain-feed-region">${MO_REGION_MEMORY[t.region] ? MO_REGION_MEMORY[t.region].icon : '🧠'} ${MO_REGIONS[t.region] ? MO_REGIONS[t.region].name : t.region}</span>
                    <p>${this.esc(t.text)}</p></li>`).join('')
                : '<li><p>ยังเงียบอยู่... คุยกับโมแล้วจะเห็นสมองทำงาน</p></li>';
        }, 150);
    }
}

window.MoBrainPage = MoBrainPage;
