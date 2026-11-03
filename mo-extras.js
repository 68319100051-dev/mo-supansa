/* ============================================
   Mo Extras 🎁🏮🎵 - ของขวัญในบ้าน, เทศกาล, เพลง
   - ของขวัญ: ซื้อด้วยเงินในกระเป๋าเรา → ไปอยู่ในบ้านตุ๊กตาจริง โมพูดถึงได้
   - เทศกาล: วันหยุด/เทศกาลไทย (ลอยกระทงคำนวณจากวันเพ็ญ) → โมรู้ ชวนทำกิจกรรม บ้านแต่งตาม
   - เพลง: โมส่งเพลงที่ฟังอยู่ [เพลง: ศิลปิน - ชื่อเพลง] → การ์ดเพลง กดฟังบน YouTube
   ============================================ */

// ของขวัญ: pos = ตำแหน่งในบ้าน (x, y, z แบบเดียวกับ MoHouseView), note = ที่โมเอาไปใช้
const MO_GIFTS = [
    { id: 'bear', emoji: '🧸', name: 'ตุ๊กตาหมีตัวใหญ่', price: 290, pos: [10.6, 1.2, 5.6], note: 'วางบนเตียง กอดนอนทุกคืน' },
    { id: 'starlamp', emoji: '⭐', name: 'โคมไฟดาว', price: 190, pos: [6.0, 0.6, 6.0], note: 'ตั้งบนโต๊ะทำงาน เปิดตอนกลางคืน' },
    { id: 'plant', emoji: '🌿', name: 'ต้นมอนสเตอร่า', price: 250, pos: [0.8, 8.4, 0], note: 'มุมห้องนั่งเล่น รดน้ำทุกเช้า' },
    { id: 'poster', emoji: '🖼️', name: 'โปสเตอร์อนิเมะ', price: 150, pos: [5.6, 0.05, 7.1], note: 'ติดผนังห้องนอน' },
    { id: 'fairy', emoji: '✨', name: 'ไฟประดับระเบียง', price: 120, pos: [2.0, 0.3, 7.6], note: 'แขวนที่ระเบียง สวยมากตอนกลางคืน' },
    { id: 'coffee', emoji: '☕', name: 'เครื่องชงกาแฟ', price: 590, pos: [7.4, 0.5, 1.4], note: 'วางในครัว ชงลาเต้ทุกเช้า' },
    { id: 'flowers', emoji: '💐', name: 'ช่อดอกไม้', price: 99, pos: [8.0, 6.3, 0.9], note: 'ใส่แจกันบนโต๊ะกินข้าว' },
    { id: 'speaker', emoji: '🔊', name: 'ลำโพงบลูทูธ', price: 450, pos: [0.4, 7.4, 0.9], note: 'ข้างทีวี เปิดเพลงฟังทั้งวัน' },
    { id: 'cushion', emoji: '🩷', name: 'หมอนอิงหัวใจ', price: 80, pos: [3.6, 6.0, 0.8], note: 'วางบนโซฟา' },
    { id: 'cat', emoji: '🐈', name: 'ตุ๊กตาแมวส้ม', price: 220, pos: [2.9, 2.6, 5.3], note: 'นั่งบนเก้าอี้ระเบียง' },
];

const MoGifts = {
    owned(life) {
        return (life.state.gifts || []).map(g => ({ ...MO_GIFTS.find(x => x.id === g.id), at: g.at })).filter(g => g.name);
    },

    /**
     * ซื้อของขวัญ → หักเงินเรา, ของไปอยู่ในบ้านโม (คืน gift หรือข้อความ error)
     */
    buy(life, id) {
        const gift = MO_GIFTS.find(g => g.id === id);
        const s = life.state;
        if (!gift) return { error: 'ไม่มีของชิ้นนี้' };
        if ((s.gifts || []).some(g => g.id === id)) return { error: 'โมมีอันนี้แล้ว' };
        if (s.userWallet < gift.price) return { error: `เงินไม่พอ (ขาดอีก ฿${gift.price - s.userWallet})` };
        s.userWallet -= gift.price;
        s.gifts = [...(s.gifts || []), { id, at: Date.now() }];
        life.addLog(Date.now(), '🎁', `ได้${gift.name}จากเอง`);
        s.mood = Math.min(100, s.mood + 15);
        life.save();
        return { gift };
    },

    promptSection(life) {
        const owned = this.owned(life);
        if (!owned.length) return '';
        return `# ของขวัญที่เองเคยให้โม (อยู่ในบ้านโมจริง ใช้อยู่ทุกวัน พูดถึงได้เมื่อเข้ากับเรื่อง)\n${owned.map(g => `- ${g.emoji} ${g.name}: ${g.note}`).join('\n')}\n\n`;
    },
};

// =============================================
//  เทศกาล
// =============================================

const MoFestivals = {
    /**
     * วันเพ็ญ (พระจันทร์เต็มดวง) ที่ใกล้ที่สุดก่อน/หลังวันที่ให้มา — แม่นพอระดับวัน
     */
    fullMoonNear(date) {
        const synodic = 29.530588853;
        const knownFull = Date.UTC(2000, 0, 21, 4, 40);   // วันเพ็ญที่ทราบแน่นอน
        const days = (date - knownFull) / 86400000;
        const n = Math.round(days / synodic);
        return new Date(knownFull + n * synodic * 86400000 + 7 * 3600000); // เวลาไทย
    },

    loyKrathong(year) {
        // ปีที่รู้วันจริง (ปฏิทินไทย) ใช้ตามนี้ ปีอื่นคำนวณจากวันเพ็ญ (อาจคลาด ±1 วัน)
        const known = { 2023: [10, 27], 2024: [10, 15], 2025: [10, 5], 2026: [10, 24] };
        if (known[year]) return new Date(year, ...known[year]);
        // วันเพ็ญเดือน 12 ≈ วันเพ็ญที่ตกในเดือนพฤศจิกายน (ถ้าตกต้นพ.ย.มาก ๆ ยังนับ)
        const moon = this.fullMoonNear(Date.UTC(year, 10, 15));
        return new Date(moon.getUTCFullYear(), moon.getUTCMonth(), moon.getUTCDate());
    },

    list(year) {
        const d = (m, day) => new Date(year, m - 1, day);
        const secondSatJan = (() => { const x = d(1, 1); while (x.getDay() !== 6) x.setDate(x.getDate() + 1); x.setDate(x.getDate() + 7); return x; })();
        return [
            { id: 'newyear', name: 'วันปีใหม่', date: d(1, 1), emoji: '🎆', decor: '🎆', idea: 'นับถอยหลัง อธิษฐานปีใหม่ด้วยกัน' },
            { id: 'kids', name: 'วันเด็ก', date: secondSatJan, emoji: '🎈', decor: '🎈', idea: 'แซวว่ายังเด็กอยู่ อยากได้ของขวัญวันเด็ก' },
            { id: 'valentine', name: 'วันวาเลนไทน์', date: d(2, 14), emoji: '💝', decor: '🌹', idea: 'อ้อนขอช็อกโกแลต ชวนเดตออนไลน์' },
            { id: 'songkran', name: 'สงกรานต์', date: d(4, 13), days: 3, emoji: '💦', decor: '🔫', idea: 'เล่นน้ำ กลับบ้านไปรดน้ำดำหัว ระวังโดนแป้ง' },
            { id: 'mother', name: 'วันแม่', date: d(8, 12), emoji: '💙', decor: '🌼', idea: 'ซื้อมะลิให้แม่ ชวนเองโทรหาแม่' },
            { id: 'halloween', name: 'ฮาโลวีน', date: d(10, 31), emoji: '🎃', decor: '🎃', idea: 'ดูหนังผี แต่งชุดผี' },
            { id: 'loykrathong', name: 'ลอยกระทง', date: this.loyKrathong(year), emoji: '🪷', decor: '🪷', idea: 'ชวนไปลอยกระทงด้วยกัน อธิษฐานขอพร ทำกระทงใบตอง' },
            { id: 'father', name: 'วันพ่อ', date: d(12, 5), emoji: '💛', decor: '🌻', idea: 'ชวนเองโทรหาพ่อ' },
            { id: 'christmas', name: 'คริสต์มาส', date: d(12, 25), emoji: '🎄', decor: '🎄', idea: 'แลกของขวัญ ฟังเพลงคริสต์มาส' },
            { id: 'nye', name: 'วันสิ้นปี', date: d(12, 31), emoji: '🥂', decor: '🥂', idea: 'สรุปปีนี้ด้วยกัน รอนับถอยหลัง' },
        ];
    },

    /**
     * เทศกาลที่ใกล้ที่สุดภายใน 10 วันข้างหน้า (รวมวันนี้) → { ...festival, daysLeft }
     */
    upcoming(now = new Date()) {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const all = [...this.list(now.getFullYear()), ...this.list(now.getFullYear() + 1)];
        return all
            .map(f => {
                const end = new Date(f.date); end.setDate(end.getDate() + (f.days || 1) - 1);
                const daysLeft = Math.round((f.date - today) / 86400000);
                return { ...f, daysLeft, ongoing: today >= f.date && today <= end };
            })
            .filter(f => f.ongoing || (f.daysLeft >= 0 && f.daysLeft <= 10))
            .sort((a, b) => a.daysLeft - b.daysLeft)[0] || null;
    },

    promptSection() {
        const f = this.upcoming();
        if (!f) return '';
        const when = f.ongoing || f.daysLeft === 0 ? 'วันนี้เลย!' : f.daysLeft === 1 ? 'พรุ่งนี้' : `อีก ${f.daysLeft} วัน`;
        return `# เทศกาล: ${f.emoji} ${f.name} ${when} (${f.date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })})\n- โมรู้และตื่นเต้น พูดถึงได้เมื่อเข้าจังหวะ ไอเดีย: ${f.idea}\n\n`;
    },

    /**
     * วันเทศกาลจริง → ทักวันละครั้ง (คืนเทศกาล หรือ null)
     */
    takeGreeting(store) {
        const f = this.upcoming();
        if (!f || !(f.ongoing || f.daysLeft === 0)) return null;
        const key = `${f.id}_${new Date().getFullYear()}`;
        let done = [];
        try { done = JSON.parse(localStorage.getItem(store) || '[]'); } catch (e) {}
        if (done.includes(key)) return null;
        try { localStorage.setItem(store, JSON.stringify([...done, key].slice(-20))); } catch (e) {}
        return f;
    },
};

// =============================================
//  เพลง
// =============================================

const MoSongs = {
    links(artist, title) {
        const q = encodeURIComponent(`${artist} ${title}`.trim());
        return { youtube: `https://www.youtube.com/results?search_query=${q}`, spotify: `https://open.spotify.com/search/${q}` };
    },

    /** "[เพลง: ศิลปิน - ชื่อเพลง]" → { artist, title } */
    parse(raw) {
        const t = String(raw || '').trim();
        if (!t) return null;
        const [a, ...rest] = t.split(/\s+-\s+|\s+–\s+/);
        return rest.length ? { artist: a.trim(), title: rest.join(' - ').trim() } : { artist: '', title: t };
    },
};

// =============================================
//  สติกเกอร์ & อีโมจิ
// =============================================

// สติกเกอร์ชุด "โม" (แบบ LINE: รูปใหญ่ + คำพูด) — id ใช้กับแท็ก [สติกเกอร์: id]
const MO_STICKERS = [
    { id: 'love', e: '🥰', t: 'รักนะ' }, { id: 'miss', e: '🥺', t: 'คิดถึง' }, { id: 'hug', e: '🫂', t: 'กอดๆ' },
    { id: 'kiss', e: '😘', t: 'จุ๊บๆ' }, { id: 'heart', e: '💖', t: 'ใจให้เลย' }, { id: 'shy', e: '🙈', t: 'เขินอะ' },
    { id: 'lol', e: '🤣', t: '555555' }, { id: 'wow', e: '😮', t: 'ห๊ะ!' }, { id: 'think', e: '🤔', t: 'อืมม' },
    { id: 'sulk', e: '😤', t: 'งอนแล้ว' }, { id: 'angry', e: '😡', t: 'โกรธนะ' }, { id: 'cry', e: '😭', t: 'ฮือออ' },
    { id: 'sorry', e: '🙏', t: 'ขอโทษน้า' }, { id: 'thanks', e: '🌷', t: 'ขอบคุณน้า' }, { id: 'ok', e: '👌', t: 'โอเคจ้า' },
    { id: 'cheer', e: '💪', t: 'สู้ๆ นะ' }, { id: 'party', e: '🥳', t: 'เย้!' }, { id: 'hungry', e: '🤤', t: 'หิวว' },
    { id: 'eat', e: '🍜', t: 'กินข้าวยัง' }, { id: 'morning', e: '☀️', t: 'อรุณสวัสดิ์' }, { id: 'sleepy', e: '😴', t: 'ง่วงแล้ว' },
    { id: 'night', e: '🌙', t: 'ฝันดีนะ' }, { id: 'wait', e: '⏳', t: 'รอแป๊บ' }, { id: 'bye', e: '👋', t: 'ไปก่อนนะ' },
];

const MO_EMOJI = {
    '😀': ['😀', '😁', '😂', '🤣', '😊', '🥰', '😍', '😘', '😚', '🙂', '😉', '😌', '😋', '😜', '🤪', '😎', '🥹', '🥺', '😢', '😭', '😤', '😡', '😳', '😱', '🤔', '🤭', '🙄', '😴', '🤤', '😇'],
    '❤️': ['❤️', '🩷', '🧡', '💛', '💚', '💙', '💜', '🤍', '🖤', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💔', '❣️', '🫶', '💋'],
    '👍': ['👍', '👎', '👌', '✌️', '🤞', '🤟', '👋', '🙏', '👏', '🙌', '💪', '🫂', '🤝', '🫵', '☝️', '👀'],
    '🍜': ['🍜', '🍲', '🍛', '🍣', '🍕', '🍔', '🍟', '🍗', '🥟', '🍦', '🍰', '🎂', '🍩', '🍪', '🧋', '☕', '🍵', '🥤', '🍉', '🍓'],
    '🐱': ['🐱', '🐶', '🐰', '🐻', '🐼', '🐨', '🐹', '🦊', '🐷', '🐸', '🐧', '🦄', '🐥', '🦋', '🌸', '🌷', '🌻', '🌈', '⭐', '✨'],
};

const MoStickers = {
    byId(id) {
        return MO_STICKERS.find(s => s.id === String(id || '').trim());
    },
    recentKey: 'mo_sticker_recent_v1',
    recent() {
        try { return JSON.parse(localStorage.getItem(this.recentKey) || '[]'); } catch (e) { return []; }
    },
    remember(id) {
        try { localStorage.setItem(this.recentKey, JSON.stringify([id, ...this.recent().filter(x => x !== id)].slice(0, 10))); } catch (e) {}
    },
    promptList() {
        return MO_STICKERS.map(s => `${s.id}=${s.e}${s.t}`).join(' ');
    },
};

// Export
window.MO_STICKERS = MO_STICKERS;
window.MO_EMOJI = MO_EMOJI;
window.MoStickers = MoStickers;
window.MO_GIFTS = MO_GIFTS;
window.MoGifts = MoGifts;
window.MoFestivals = MoFestivals;
window.MoSongs = MoSongs;
