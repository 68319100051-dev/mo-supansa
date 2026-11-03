/* ============================================
   Mo Reels 🎬 - คลิปสั้น
   - คลังคลิปของโม (YouTube Shorts) + คลิปที่เองส่งมา (ลิงก์ YouTube / ไฟล์วิดีโอในเครื่อง)
   - กดแล้วเล่นในแอปได้เลย
   ============================================ */

// คลังเริ่มต้น: Shorts จริง (ตรวจแล้วว่าฝังได้) จัดหมวดไว้ให้โมเลือก
const MO_DEFAULT_CLIPS = [
    { yt: 'Mhl0nbv0n9o', title: 'แมวป่วนรวมมิตร', tags: ['แมว', 'ตลก'] },
    { yt: 'UHWi93JxSos', title: 'แมวทำตัวแปลกๆ 555', tags: ['แมว', 'ตลก'] },
    { yt: 'nVAtdOGUyc8', title: 'แมวรีแอคเกินจริง', tags: ['แมว', 'ตลก'] },
    { yt: 'f39cZDc_Htw', title: 'แมวน่ารักรวมๆ', tags: ['แมว', 'น่ารัก'] },
    { yt: 'x1WN14xL25Q', title: 'ลูกหมาตัวกลมๆ', tags: ['หมา', 'น่ารัก'] },
    { yt: 'ikl4oNUpPAU', title: 'ลูกหมาน่ารักเกิน', tags: ['หมา', 'น่ารัก'] },
    { yt: 'KSAq_j1L1FQ', title: 'ลูกหมาซนมาก', tags: ['หมา', 'ตลก'] },
    { yt: 'LqwyWbKszVQ', title: 'ฝรั่งกินส้มตำแล้วติดใจ', tags: ['ส้มตำ', 'อาหาร'] },
    { yt: '57Q4cs_6pSk', title: 'ตำปูปลาร้าแซ่บๆ', tags: ['ส้มตำ', 'อาหาร'] },
    { yt: 'E4kH2BVyE34', title: 'ตำทะเลไข่เยี่ยวม้า', tags: ['ส้มตำ', 'อาหาร'] },
    { yt: 'Sm9ws9xXrFw', title: 'หมูกระทะทะเลเผา', tags: ['หมูกระทะ', 'อาหาร'] },
    { yt: 'mhgqoPHRdjw', title: 'หมูกระทะบุฟเฟ่ต์คุ้มๆ', tags: ['หมูกระทะ', 'อาหาร'] },
    { yt: 'mnugqtmdz4o', title: 'จัดอันดับโมเมนต์ฮาวาโล', tags: ['เกม', 'วาโล', 'ตลก'] },
    { yt: '7TJIjN3W5yU', title: 'วาโลฮาๆ', tags: ['เกม', 'วาโล', 'ตลก'] },
    { yt: 'QCW66HgiGWY', title: 'วาโลโมเมนต์ปั่นๆ', tags: ['เกม', 'วาโล', 'ตลก'] },
    { yt: 'PDYeDd5nm0g', title: 'นัตสึไม่มีระยะห่างกับลูซี่', tags: ['อนิเมะ', 'แฟรี่เทล', 'ตลก'] },
    { yt: 'p3ii7pcPO_k', title: 'นัตสึตกหลุมรักลูซี่', tags: ['อนิเมะ', 'แฟรี่เทล', 'โรแมนติก'] },
    { yt: '3hsa7HtODcI', title: 'นัตสึเท่ๆ', tags: ['อนิเมะ', 'แฟรี่เทล'] },
    { yt: '0FI2wstwMLI', title: 'โปรแกรมเมอร์ตอนวันหยุดมาถึง', tags: ['โปรแกรมเมอร์', 'ตลก', 'งาน'] },
    { yt: 'VH1Jv2atXeA', title: 'เขียนโค้ดตอนตีสาม', tags: ['โปรแกรมเมอร์', 'ตลก', 'งาน'] },
    { yt: 'Fx44qK-GzPs', title: 'ซีเนียร์ vs จูเนียร์', tags: ['โปรแกรมเมอร์', 'ตลก', 'งาน'] },
    { yt: 'KWoaMJ8Odd0', title: 'ไวบ์โค้ดเดอร์', tags: ['โปรแกรมเมอร์', 'ตลก', 'งาน'] },
];

/**
 * เก็บไฟล์วิดีโอที่เองส่งมาไว้ใน IndexedDB (ใหญ่เกิน localStorage)
 */
const MoMediaStore = {
    db: null,
    open() {
        if (this.db) return Promise.resolve(this.db);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('mo_media', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('videos');
            req.onsuccess = () => { this.db = req.result; resolve(this.db); };
            req.onerror = () => reject(req.error);
        });
    },
    async put(id, blob) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('videos', 'readwrite');
            tx.objectStore('videos').put(blob, id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },
    async get(id) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const req = db.transaction('videos').objectStore('videos').get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    },
};

class MoReelsManager {
    constructor() {
        this.reelsScreen = document.getElementById('reels-screen');
        this.reelsContainer = document.getElementById('reels-container');
        this.player = document.getElementById('clip-player');
        this.playerFrame = document.getElementById('clip-player-frame');
        this.playerTitle = document.getElementById('clip-player-title');
        this.storageKey = 'mo_clips_v1';
        this.sentKey = 'mo_clips_sent_v1';

        this.reels = [
            ...MO_DEFAULT_CLIPS.map(c => this.fromYouTube(c.yt, c.title, c.tags, 'mo')),
            ...this.loadUserClips(),
        ];

        this.init();
    }

    init() {
        document.getElementById('close-reels').addEventListener('click', () => this.close());
        document.getElementById('clip-player-close').addEventListener('click', () => this.closePlayer());
        this.player.addEventListener('click', (e) => {
            if (e.target === this.player) this.closePlayer();
        });
        this.renderReels();
    }

    // =============================================
    //  Clip objects
    // =============================================

    fromYouTube(ytId, title, tags = [], from = 'user') {
        return {
            id: `yt_${ytId}`,
            kind: 'youtube',
            yt: ytId,
            title,
            tags,
            from,
            thumbnail: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
        };
    }

    /**
     * ดึง video id จากลิงก์ YouTube (watch / shorts / youtu.be) — ไม่ใช่ลิงก์ YouTube คืน null
     */
    static parseYouTube(text) {
        const m = text.match(/(?:youtube\.com\/(?:watch\?(?:[^\s]*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/i);
        return m ? m[1] : null;
    }

    loadUserClips() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
        } catch (e) {
            return [];
        }
    }

    /**
     * เก็บคลิปที่เองส่งมาไว้ในคลัง (โมเอาไปส่งต่อ/พูดถึงได้)
     */
    addUserClip(clip) {
        if (this.reels.some(r => r.id === clip.id)) return;
        this.reels.push(clip);
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.reels.filter(r => r.from === 'user')));
        } catch (e) {}
        this.renderReels();
    }

    /**
     * โมเลือกคลิปจากหมวด (ไม่ซ้ำกับที่เพิ่งส่ง) — หาไม่เจอสุ่มจากของโมทั้งหมด
     */
    pickClip(topic = '') {
        let sent = [];
        try { sent = JSON.parse(localStorage.getItem(this.sentKey) || '[]'); } catch (e) {}
        const moClips = this.reels.filter(r => r.from === 'mo');
        const words = topic.split(/[\s,/]+/).filter(Boolean);
        const matched = moClips.filter(c => words.some(w => c.tags.some(t => t.includes(w) || w.includes(t)) || c.title.includes(w)));
        const pool = (matched.length ? matched : moClips);
        const fresh = pool.filter(c => !sent.includes(c.id));
        const choice = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
        try {
            localStorage.setItem(this.sentKey, JSON.stringify([...sent.filter(id => id !== choice.id), choice.id].slice(-12)));
        } catch (e) {}
        return choice;
    }

    getTopics() {
        return [...new Set(this.reels.filter(r => r.from === 'mo').flatMap(r => r.tags))];
    }

    // =============================================
    //  UI
    // =============================================

    renderReels() {
        this.reelsContainer.innerHTML = '';
        [...this.reels].reverse().forEach(reel => {
            const card = document.createElement('div');
            card.className = 'reel-card';
            card.innerHTML = `
                <img src="${reel.thumbnail}" alt="" loading="lazy">
                <div class="reel-card-overlay">
                    <div class="reel-card-play">
                        <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </div>
                    <div class="reel-card-title"></div>
                </div>
            `;
            card.querySelector('.reel-card-title').textContent = (reel.from === 'user' ? '📎 ' : '') + reel.title;
            card.addEventListener('click', () => this.play(reel));
            this.reelsContainer.appendChild(card);
        });
    }

    open() {
        this.reelsScreen.classList.remove('hidden');
    }

    close() {
        this.reelsScreen.classList.add('hidden');
    }

    toggle() {
        this.reelsScreen.classList.toggle('hidden');
    }

    /**
     * เปิดเล่นคลิป: YouTube → iframe, ไฟล์ในเครื่อง → <video>
     */
    async play(clip) {
        if (!clip) return;
        this.playerTitle.textContent = clip.title || 'คลิป';
        this.playerFrame.innerHTML = '';

        if (clip.kind === 'youtube') {
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube-nocookie.com/embed/${clip.yt}?autoplay=1&playsinline=1&loop=1&playlist=${clip.yt}&rel=0`;
            iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
            iframe.allowFullscreen = true;
            this.playerFrame.appendChild(iframe);
        } else if (clip.kind === 'local') {
            const blob = await MoMediaStore.get(clip.mediaId).catch(() => null);
            if (!blob) {
                this.playerFrame.innerHTML = '<p class="clip-player-missing">ไฟล์คลิปนี้ไม่อยู่ในเครื่องนี้แล้ว 🥺</p>';
            } else {
                const video = document.createElement('video');
                video.src = URL.createObjectURL(blob);
                video.controls = true;
                video.autoplay = true;
                video.playsInline = true;
                video.loop = true;
                this.playerFrame.appendChild(video);
            }
        } else {
            this.playerFrame.innerHTML = '<p class="clip-player-missing">คลิปเก่านี้เปิดไม่ได้แล้ว 🥺</p>';
        }
        this.player.classList.remove('hidden');
    }

    closePlayer() {
        const video = this.playerFrame.querySelector('video');
        if (video && video.src.startsWith('blob:')) URL.revokeObjectURL(video.src);
        this.playerFrame.innerHTML = '';
        this.player.classList.add('hidden');
    }

    /**
     * เปิดคลิปจากข้อความในแชท (คลิปเก่าแบบเดิมที่ไม่มีวิดีโอจะขึ้นว่าเปิดไม่ได้)
     */
    openReel(reelId) {
        this.play(this.reels.find(r => r.id === reelId) || { title: 'คลิป' });
    }

    getRandomReel() {
        return this.pickClip();
    }

    getReelsList() {
        return this.reels;
    }
}

// Export
window.MoReelsManager = MoReelsManager;
window.MoMediaStore = MoMediaStore;
