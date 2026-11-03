/* ============================================
   Mo Life 🏠 - ชีวิตประจำวันของโม
   โมใช้ชีวิตตามเวลาจริง: นอน ตื่น กิน ออกไปข้างนอก ฯลฯ
   - กิจกรรมสุ่มจากสถานการณ์ + รายละเอียดสุ่ม (กินอะไร ดูอะไร ไปไหน กับใคร)
   - มือถือ: อยู่กับตัว / วางไว้ใกล้ๆ / ลืมไว้บ้าน / หลับ → กำหนดว่าโมเห็นแชทเมื่อไร
   - กระเป๋าเงิน (เงินเทียม) + สิ่งที่อยากได้
   ============================================ */

const MO_ROOMS = {
    bedroom: { name: 'ห้องนอน', emoji: '🛏️' },
    living: { name: 'ห้องนั่งเล่น', emoji: '🛋️' },
    kitchen: { name: 'ครัว', emoji: '🍳' },
    bathroom: { name: 'ห้องน้ำ', emoji: '🛁' },
    balcony: { name: 'ระเบียง', emoji: '🪴' },
    out: { name: 'ข้างนอก', emoji: '🚶‍♀️' },
};

// ของในแต่ละห้อง (แผนผังบ้าน) — ของชิ้นแรกที่ตรงกับ MO_SPOTS จะเป็นจุดที่โมอยู่
const MO_FURNITURE = {
    bedroom: ['🛏️', '💻', '🪞', '🧸', '👗'],
    living: ['🛋️', '📺', '🪟', '🎮', '📚'],
    kitchen: ['🍳', '🧊', '☕', '🍽️'],
    bathroom: ['🛁', '🪥', '🧴', '🪒'],
    balcony: ['🪴', '👕', '🪑'],
};

// กิจกรรม → ของที่โมกำลังใช้
const MO_SPOTS = {
    wake: '🛏️', sleep: '🛏️', nap: '🛏️', music: '🛏️', scroll: '🛏️', call_friend: '🛏️', game: '💻', draw: '💻',
    series: '📺', delivery: '🛋️', snack: '🛋️', bored: '🛋️', chore: '🛋️',
    breakfast: '🍽️', cook: '🍳',
    shower_am: '🛁', shower_pm: '🛁', skincare: '🪞',
    water_plants: '🪴', balcony_chill: '🪑', laundry: '👕', urgent: '📱',
};

// รายละเอียดสุ่มที่ใส่ในสถานการณ์ ({food} {show} ...)
const MO_VARIANTS = {
    food: ['ข้าวมันไก่', 'กะเพราไข่ดาว', 'ส้มตำ', 'ก๋วยเตี๋ยวเรือ', 'ข้าวผัดกุ้ง', 'มาม่าต้มยำ', 'ข้าวไข่เจียว', 'ราดหน้า', 'ผัดซีอิ๊ว', 'ข้าวขาหมู', 'สุกี้น้ำ', 'ข้าวมันไก่ทอด', 'ก๋วยจั๊บ', 'ข้าวต้มปลา', 'หมูปิ้งข้าวเหนียว'],
    snack: ['ชานมไข่มุก', 'ขนมปังปิ้ง', 'ไอติม', 'มันฝรั่งทอด', 'โรตีกล้วย', 'บิงซู', 'ชาเย็น', 'โกโก้เย็น', 'เค้กช็อกโกแลต', 'ลูกชิ้นปิ้ง'],
    show: ['อนิเมะ Fairy Tail ซ้ำรอบที่ล้าน', 'ซีรีส์เกาหลีเรื่องใหม่', 'ซีรีส์วายที่เพื่อนแนะนำ', 'อนิเมะเรื่องใหม่', 'คลิปแมวใน TikTok', 'สารคดีฆาตกรรม', 'หนังผีเก่าๆ', 'รายการเกมโชว์', 'ไลฟ์เกมของสตรีมเมอร์', 'การ์ตูนตอนเด็กๆ'],
    song: ['เพลง Tilly Birds', 'เพลงอนิเมะ', 'เพลงเกาหลี', 'เพลงเศร้าๆ', 'เพลงลูกทุ่งที่แม่ชอบ', 'เพลงเก่ายุค 2000', 'เพลย์ลิสต์ตอนฝนตก'],
    place: ['เซเว่นหน้าปากซอย', 'ตลาดนัด', 'ห้าง', 'ร้านกาแฟใกล้บ้าน', 'ร้านหนังสือ', 'ร้านเครื่องเขียน', 'สวนสาธารณะ', 'ร้านขายของจุกจิก'],
    friend: ['เพื่อนสมัยมัธยม', 'เพื่อนสนิท', 'พี่สาว', 'แม่', 'เพื่อนที่ชอบเม้าท์'],
    game: ['เกมมือถือ', 'อาวี', 'เกมปลูกผัก', 'เกมจับคู่', 'เกมแต่งตัว', 'หมากฮอสกับบอท', 'หมากฮอสกับบอท'],
    chore: ['ซักผ้า', 'กวาดห้อง', 'ล้างจาน', 'จัดตู้เสื้อผ้า', 'รดน้ำต้นไม้', 'พับผ้า'],
};

/*
 * สถานการณ์: hours = ช่วงเวลาที่เกิดได้ [จาก, ถึง) (ข้ามเที่ยงคืนได้), dur = นาที [min, max]
 * phone: with = ถือมือถือ, near = วางไว้ใกล้ๆ (ตอบช้า), away = ไม่ได้อยู่กับมือถือ, home = ออกไปข้างนอกแล้วลืมไว้บ้าน (สุ่ม)
 * forgetPhone: โอกาสลืมมือถือไว้บ้านตอนออกไป, hunger/energy/mood: เปลี่ยนตอนจบ, cost: ใช้เงิน
 */
const MO_ACTIVITIES = [
    // ---- ตอนเช้า ----
    { id: 'wake', label: 'เพิ่งตื่น นอนเล่นมือถืออยู่บนเตียง', status: 'เพิ่งตื่น 🥱', emoji: '🥱', room: 'bedroom', hours: [7, 10], dur: [10, 30], phone: 'with', energy: 10, weight: 3 },
    { id: 'shower_am', label: 'อาบน้ำแต่งตัว', status: 'อาบน้ำอยู่ 🛁', emoji: '🛁', room: 'bathroom', hours: [7, 11], dur: [15, 35], phone: 'away', energy: 10, weight: 3 },
    { id: 'breakfast', label: 'กินข้าวเช้า {snack}', status: 'กินข้าวเช้า 🍞', emoji: '🍞', room: 'kitchen', hours: [7, 11], dur: [15, 30], phone: 'with', hunger: -35, weight: 3 },
    // ---- กิน ----
    { id: 'cook', label: 'ทำ{food}กินเอง', status: 'ทำกับข้าว 🍳', emoji: '🍳', room: 'kitchen', hours: [11, 21], dur: [20, 45], phone: 'near', hunger: -50, cost: 40, weight: 2, needHunger: true },
    { id: 'eat_out', label: 'ออกไปกิน{food}แถวบ้าน', status: 'ออกไปกินข้าว 🍜', emoji: '🍜', room: 'out', place: 'ร้านอาหารแถวบ้าน', hours: [11, 21], dur: [30, 60], phone: 'with', forgetPhone: 0.15, hunger: -60, cost: 60, weight: 2, needHunger: true },
    { id: 'delivery', label: 'สั่ง{food}มากินที่ห้อง', status: 'กินข้าว 🍱', emoji: '🍱', room: 'living', hours: [11, 23], dur: [20, 40], phone: 'with', hunger: -55, cost: 80, weight: 2, needHunger: true },
    { id: 'snack', label: 'กิน{snack}', status: 'กินขนม 🧋', emoji: '🧋', room: 'living', hours: [13, 23], dur: [10, 25], phone: 'with', hunger: -15, cost: 35, mood: 5, weight: 2 },
    // ---- อยู่บ้าน ----
    { id: 'series', label: 'ดู{show}', status: 'ดูซีรีส์ 📺', emoji: '📺', room: 'living', hours: [10, 25], dur: [30, 90], phone: 'with', mood: 5, weight: 4 },
    { id: 'music', label: 'นอนฟัง{song}', status: 'ฟังเพลง 🎧', emoji: '🎧', room: 'bedroom', hours: [9, 25], dur: [20, 50], phone: 'with', mood: 5, weight: 3 },
    { id: 'game', label: 'เล่น{game}', status: 'เล่นเกม 🎮', emoji: '🎮', room: 'bedroom', hours: [10, 25], dur: [20, 60], phone: 'with', mood: 5, energy: -5, weight: 3 },
    { id: 'draw', label: 'วาดรูปเล่นในสมุด', status: 'วาดรูป 🎨', emoji: '🎨', room: 'bedroom', hours: [10, 24], dur: [30, 70], phone: 'near', mood: 8, weight: 2 },
    { id: 'chore', label: '{chore}', status: 'ทำงานบ้าน 🧺', emoji: '🧺', room: 'living', hours: [9, 20], dur: [20, 45], phone: 'near', energy: -10, weight: 2 },
    { id: 'nap', label: 'งีบหลับ', status: 'งีบอยู่ 😪', emoji: '😪', room: 'bedroom', hours: [12, 19], dur: [30, 90], phone: 'away', energy: 35, weight: 1, needTired: true },
    { id: 'skincare', label: 'มาส์กหน้าทาครีม', status: 'มาส์กหน้า 🧖‍♀️', emoji: '🧖‍♀️', room: 'bathroom', hours: [19, 25], dur: [15, 30], phone: 'near', mood: 5, weight: 2 },
    { id: 'call_friend', label: 'คุยโทรศัพท์กับ{friend}', status: 'คุยโทรศัพท์ 📞', emoji: '📞', room: 'bedroom', hours: [10, 23], dur: [20, 50], phone: 'away', mood: 5, weight: 1 },
    { id: 'shower_pm', label: 'อาบน้ำ', status: 'อาบน้ำอยู่ 🛁', emoji: '🛁', room: 'bathroom', hours: [18, 24], dur: [15, 35], phone: 'away', mood: 5, weight: 3 },
    { id: 'water_plants', label: 'รดน้ำต้นไม้ที่ระเบียง คุยกับต้นไม้', status: 'รดน้ำต้นไม้ 🪴', emoji: '🪴', room: 'balcony', hours: [7, 10], dur: [10, 20], phone: 'near', mood: 4, weight: 1 },
    { id: 'balcony_chill', label: 'นั่งชิลที่ระเบียงดูฟ้า', status: 'นั่งเล่นระเบียง 🌇', emoji: '🌇', room: 'balcony', hours: [17, 24], dur: [15, 40], phone: 'with', mood: 7, weight: 2 },
    { id: 'laundry', label: 'ตากผ้าที่ระเบียง', status: 'ตากผ้า 👕', emoji: '👕', room: 'balcony', hours: [8, 17], dur: [10, 25], phone: 'near', energy: -5, weight: 1 },
    { id: 'scroll', label: 'นอนไถ TikTok', status: 'ไถมือถือ 📱', emoji: '📱', room: 'bedroom', hours: [9, 25], dur: [15, 45], phone: 'with', energy: -5, weight: 3 },
    { id: 'bored', label: 'นอนเบื่อๆ ไม่รู้จะทำไร', status: 'ว่างๆ 😶', emoji: '😶', room: 'living', hours: [9, 24], dur: [15, 30], phone: 'with', mood: -3, weight: 2 },
    // ---- ออกไปข้างนอก ----
    { id: 'shop', label: 'ไป{place}', status: 'ไม่อยู่บ้าน 🚶‍♀️', emoji: '🚶‍♀️', room: 'out', place: '{place}', hours: [10, 21], dur: [30, 90], phone: 'with', forgetPhone: 0.25, cost: 50, energy: -10, mood: 5, weight: 2 },
    { id: 'cafe', label: 'นั่งร้านกาแฟคนเดียว', status: 'อยู่ร้านกาแฟ ☕', emoji: '☕', room: 'out', place: 'ร้านกาแฟ', hours: [10, 19], dur: [40, 90], phone: 'with', cost: 70, mood: 8, weight: 1 },
    { id: 'friend_out', label: 'ออกไปเจอ{friend}', status: 'ไปเจอเพื่อน 👭', emoji: '👭', room: 'out', place: 'ข้างนอกกับ{friend}', hours: [11, 22], dur: [90, 180], phone: 'near', forgetPhone: 0.1, cost: 120, mood: 12, energy: -15, weight: 1 },
    { id: 'walk', label: 'ออกไปเดินเล่นแถวบ้าน', status: 'ไปเดินเล่น 🌳', emoji: '🌳', room: 'out', place: 'สวนแถวบ้าน', hours: [16, 20], dur: [20, 45], phone: 'with', forgetPhone: 0.35, mood: 6, energy: -5, weight: 1 },
    { id: 'help_mom', label: 'ไปช่วยแม่ทำธุระ', status: 'ไปธุระกับแม่ 🚗', emoji: '🚗', room: 'out', place: 'ไปธุระกับแม่', hours: [9, 18], dur: [60, 150], phone: 'near', forgetPhone: 0.2, energy: -10, weight: 1 },
];

// กิจกรรมพิเศษ (ไม่สุ่ม เลือกโดยระบบ)
const MO_SPECIAL = {
    sleep: { id: 'sleep', label: 'นอนหลับ', status: 'หลับอยู่ 😴', emoji: '😴', room: 'bedroom', phone: 'asleep' },
    commute: { id: 'commute', label: 'นั่งรถกลับบ้าน', status: 'กำลังกลับบ้าน 🚕', emoji: '🚕', room: 'out', place: 'บนรถกลับบ้าน', dur: [15, 30], phone: 'with', energy: -3 },
    urgent: { id: 'urgent', label: 'รับสายด่วนจากเอง', status: 'คุยเรื่องด่วน 📞', emoji: '📞', phone: 'with', dur: [15, 30], energy: -5 },
    wish: { id: 'wish', label: 'ออกไปกิน{wish}', status: 'ไปกิน{wish} 🤤', emoji: '🤤', room: 'out', place: 'ร้าน{wish}', dur: [60, 100], phone: 'with', hunger: -70, mood: 15 },
};

// สิ่งที่โมอยากได้ (ราคาเงินเทียม)
const MO_WISHES = [
    { item: 'หมูกระทะ', cost: 250 }, { item: 'ชาบู', cost: 300 }, { item: 'บิงซู', cost: 120 },
    { item: 'ชานมไข่มุกแก้วใหญ่', cost: 60 }, { item: 'ส้มตำปูปลาร้า', cost: 80 }, { item: 'ซูชิ', cost: 350 },
    { item: 'ไก่ทอดเกาหลี', cost: 200 }, { item: 'พิซซ่า', cost: 280 }, { item: 'หนังโรง', cost: 220 },
];

/**
 * อากาศจริงตอนนี้ (Open-Meteo ฟรี ไม่ต้องใช้ key) — ตั้งพิกัดได้ที่ MO_PROFILE.location ใน mo-keys.local.js
 */
const MoWeather = {
    data: null,
    codes: {
        0: 'ฟ้าใส', 1: 'แดดจ้า', 2: 'มีเมฆบางส่วน', 3: 'ฟ้าครึ้ม', 45: 'มีหมอก', 48: 'มีหมอก',
        51: 'ฝนปรอยๆ', 53: 'ฝนปรอยๆ', 55: 'ฝนปรอยๆ', 61: 'ฝนตกเบาๆ', 63: 'ฝนตก', 65: 'ฝนตกหนัก',
        80: 'ฝนตกเป็นพักๆ', 81: 'ฝนตกเป็นพักๆ', 82: 'ฝนตกหนักมาก', 95: 'พายุฝนฟ้าคะนอง', 96: 'พายุฝนฟ้าคะนอง', 99: 'พายุฝนฟ้าคะนอง',
    },

    async refresh() {
        const loc = (window.MO_PROFILE && window.MO_PROFILE.location) || { lat: 13.75, lon: 100.5, name: 'กรุงเทพ' };
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code,is_day,precipitation&timezone=Asia%2FBangkok`;
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) return;
            const cur = (await res.json()).current;
            this.data = { temp: cur.temperature_2m, code: cur.weather_code, isDay: cur.is_day, place: loc.name || '', at: Date.now() };
        } catch (e) {}
    },

    start() {
        this.refresh();
        setInterval(() => this.refresh(), 30 * 60000);
    },

    isRaining() {
        return Boolean(this.data && this.data.code >= 51);
    },

    describe() {
        if (!this.data) return '';
        const d = this.data;
        const hot = d.temp >= 33 ? ' ร้อนมาก' : d.temp <= 22 ? ' เย็นๆ' : '';
        return `${d.place ? d.place + ' ' : ''}${Math.round(d.temp)}°C ${this.codes[d.code] || ''}${hot}${d.isDay ? '' : ' (กลางคืน)'}`;
    },
};

class MoLife {
    constructor() {
        this.storageKey = 'mo_life_v1';
        this.state = this.load();
        this.listeners = [];
        this.catchUp();
    }

    load() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return {
            current: null,
            hunger: 40,     // 0 อิ่ม - 100 หิวมาก
            energy: 70,     // 0 หมดแรง - 100 สดชื่น
            mood: 70,       // 0 แย่ - 100 ดีมาก
            wallet: 150,    // เงินโม (เงินเทียม)
            userWallet: 1000,
            wish: null,     // { item, cost, since }
            log: [],        // กิจกรรมวันนี้ { at, emoji, text }
        };
    }

    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.state));
        } catch (e) {}
    }

    onChange(fn) {
        this.listeners.push(fn);
    }

    emit(prev) {
        this.listeners.forEach(fn => fn(this.state.current, prev));
    }

    // =============================================
    //  เวลา & การเลือกกิจกรรม
    // =============================================

    /** ชั่วโมงแบบนับต่อหลังเที่ยงคืน (00:30 = 24.5) เพื่อให้ช่วง [20, 25] ครอบคลุมหลังเที่ยงคืน */
    hourOf(ts) {
        const d = new Date(ts);
        const h = d.getHours() + d.getMinutes() / 60;
        return h < 5 ? h + 24 : h;
    }

    isSleepTime(ts) {
        const h = this.hourOf(ts);
        return h >= 24.75 || h < 7.5; // ~00:45 - 07:30
    }

    rand(min, max) {
        return min + Math.random() * (max - min);
    }

    pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    fill(text, vars) {
        return (text || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] || '');
    }

    /**
     * เลือกกิจกรรมถัดไปตามเวลา ความหิว ความเหนื่อย และสิ่งที่อยากได้
     */
    chooseNext(ts, prevId) {
        if (this.isSleepTime(ts)) {
            const wake = new Date(ts);
            if (wake.getHours() >= 12) wake.setDate(wake.getDate() + 1);
            wake.setHours(7, 30 + Math.floor(Math.random() * 90), 0, 0);
            return this.makeActivity(MO_SPECIAL.sleep, ts, Math.max(wake.getTime(), ts + 30 * 60000));
        }

        const s = this.state;
        // เงินพอแล้ว + ช่วงเวลาเหมาะ → ไปทำสิ่งที่อยากได้
        const h = this.hourOf(ts);
        if (s.wish && s.wallet >= s.wish.cost && h >= 11 && h < 21 && Math.random() < 0.6) {
            return this.makeActivity(MO_SPECIAL.wish, ts, null, { wish: s.wish.item }, s.wish.cost);
        }

        // โมอยากทำอะไรเอง (จากหัวใจเต้น) → ทำอันนั้นถ้าเวลาเหมาะ
        if (s.nextWish) {
            const want = MO_ACTIVITIES.find(a => a.id === s.nextWish && h >= a.hours[0] && h < a.hours[1] && !(a.cost && s.wallet < a.cost));
            s.nextWish = null;
            if (want) return this.makeActivity(want, ts);
        }
        const candidates = MO_ACTIVITIES.filter(a => {
            if (a.id === prevId) return false;
            if (h < a.hours[0] || h >= a.hours[1]) return false;
            if (a.cost && s.wallet < a.cost) return false;
            return true;
        });
        const weighted = candidates.map(a => {
            let w = a.weight;
            if (a.needHunger) w *= s.hunger > 60 ? 4 : s.hunger > 35 ? 1 : 0.1;
            if (a.needTired) w *= s.energy < 35 ? 5 : 0.2;
            if (a.room === 'out' && s.energy < 25) w *= 0.3;
            if (a.room === 'out' && MoWeather.isRaining()) w *= 0.25; // ฝนตกไม่ค่อยอยากออกไปไหน
            return { a, w };
        });
        const total = weighted.reduce((sum, x) => sum + x.w, 0);
        let r = Math.random() * total;
        const chosen = (weighted.find(x => (r -= x.w) <= 0) || weighted[0] || { a: MO_ACTIVITIES.find(a => a.id === 'scroll') }).a;
        return this.makeActivity(chosen, ts);
    }

    makeActivity(def, startedAt, endsAt = null, extraVars = {}, costOverride = null) {
        const vars = { ...extraVars };
        for (const key of Object.keys(MO_VARIANTS)) vars[key] = this.pick(MO_VARIANTS[key]);
        let phone = def.phone;
        if (def.room === 'out' && def.forgetPhone && Math.random() < def.forgetPhone) phone = 'home';
        const dur = def.dur ? this.rand(def.dur[0], def.dur[1]) * 60000 : 60 * 60000;
        return {
            id: def.id,
            label: this.fill(def.label, vars),
            status: this.fill(def.status, vars),
            emoji: def.emoji,
            room: def.room,
            place: def.place ? this.fill(def.place, vars) : null,
            phone,
            startedAt,
            endsAt: endsAt || startedAt + dur,
            effects: { hunger: def.hunger || 0, energy: def.energy || 0, mood: def.mood || 0, cost: costOverride ?? def.cost ?? 0 },
            isWish: def.id === 'wish',
        };
    }

    // =============================================
    //  เล่นเกมตอนว่าง: มีผลแพ้ชนะเกิดขึ้นเรื่อยๆ ให้เองมาดู/ชวนเล่นได้
    // =============================================

    gameSession() {
        const c = this.state.current;
        if (!c || c.id !== 'game') return null;
        if (!c.game) c.game = { name: c.label.replace(/^เล่น/, ''), wins: 0, losses: 0, log: [], next: c.startedAt + this.rand(3, 7) * 60000 };
        return c.game;
    }

    /** ทุก tick: ถึงเวลาจบตา → สุ่มผล (อารมณ์ดีชนะง่ายขึ้นนิดหน่อย) */
    tickGame(now = Date.now()) {
        const g = this.gameSession();
        if (!g || now < g.next) return null;
        const win = Math.random() < 0.42 + this.state.mood / 500;
        const name = g.name;
        const lines = win
            ? ['ชนะแบบเฉียดฉิว', 'ชนะสบายๆ', 'แบกทีมชนะ', 'คัมแบ็กได้!']
            : ['แพ้เพราะเน็ตกาก', 'แพ้แบบน่าเจ็บใจ', 'เพื่อนร่วมทีมป่วน', 'โดนบอทหลอก'];
        const note = /ปลูกผัก|แต่งตัว/.test(name) ? (win ? 'ปลดล็อกของใหม่' : 'ทำภารกิจไม่ทัน') : this.pick(lines);
        win ? g.wins++ : g.losses++;
        g.log = [...g.log, { at: now, win, note }].slice(-6);
        g.next = now + this.rand(3, 7) * 60000;
        this.state.mood = Math.max(0, Math.min(100, this.state.mood + (win ? 2 : -2)));
        this.save();
        return { win, note };
    }

    /**
     * จบกิจกรรมปัจจุบัน → เริ่มกิจกรรมถัดไป (ใช้ทั้งตอน tick และตอนย้อนเวลาที่ไม่ได้เปิดแอป)
     */
    advance(ts) {
        const s = this.state;
        const prev = s.current;
        if (prev) {
            if (prev.phone === 'with' || prev.phone === 'near') s.lastSeen = ts;
            const mins = (prev.endsAt - prev.startedAt) / 60000;
            const e = prev.effects;
            const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
            s.hunger = clamp(s.hunger + mins * 0.12 + e.hunger);
            s.energy = clamp(prev.id === 'sleep' ? 95 : s.energy - mins * 0.06 + e.energy);
            s.mood = clamp(s.mood + e.mood + (s.hunger > 75 ? -5 : 0));
            if (e.cost) s.wallet = Math.max(0, s.wallet - e.cost);
            if (prev.isWish && s.wish) {
                this.addLog(prev.endsAt, '💕', `ได้กิน${s.wish.item}แล้ว (จ่าย ฿${e.cost})`);
                s.wish = null;
            }
        }
        // บางทีก็อยากได้อะไรขึ้นมา
        if (!s.wish && Math.random() < 0.12) {
            s.wish = { ...this.pick(MO_WISHES), since: ts };
        }
        // ออกไปข้างนอกแล้ว → ต้องเดินทางกลับบ้านก่อน (ไม่วาร์ป) ยกเว้นจะไปต่อที่อื่น
        if (prev && prev.room === 'out' && prev.id !== 'commute' && prev.id !== 'urgent' && Math.random() < 0.85) {
            s.current = this.makeActivity(MO_SPECIAL.commute, ts);
            if (prev.phone === 'home') s.current.phone = 'home';
            s.current.place = `บนรถกลับจาก${prev.place || 'ข้างนอก'}`;
        } else {
            s.current = this.chooseNext(ts, prev && prev.id);
        }
        const where = s.current.room === 'out' ? (s.current.place || 'ข้างนอก') : MO_ROOMS[s.current.room].name;
        const phoneNote = s.current.phone === 'home' ? ' (ลืมมือถือไว้บ้าน)' : '';
        this.addLog(ts, s.current.emoji, `${s.current.label} — ${where}${phoneNote}`);
        return prev;
    }

    addLog(at, emoji, text) {
        const today = new Date().toDateString();
        this.state.log = this.state.log.filter(l => new Date(l.at).toDateString() === today || at - l.at < 12 * 3600000);
        this.state.log.push({ at, emoji, text });
        if (this.state.log.length > 60) this.state.log = this.state.log.slice(-60);
    }

    /**
     * ไม่ได้เปิดแอปนาน → จำลองย้อนหลังให้ถึงตอนนี้
     */
    catchUp() {
        const now = Date.now();
        if (!this.state.current) {
            this.advance(now);
        } else {
            let guard = 0;
            while (this.state.current.endsAt <= now && guard++ < 60) {
                this.advance(this.state.current.endsAt);
            }
            if (this.state.current.endsAt <= now) this.advance(now);
        }
        this.save();
    }

    /**
     * เองโทรเรียกด่วน → โมทิ้งสิ่งที่ทำอยู่ (หลับอยู่ก็สะดุ้งตื่น) มารับสาย อยู่ห้องเดิม/ที่เดิม
     */
    interruptUrgent() {
        const s = this.state;
        const prev = s.current;
        const wasAsleep = prev && prev.id === 'sleep';
        if (prev) {
            prev.endsAt = Date.now();
            if (wasAsleep) s.energy = Math.max(0, s.energy - 10);
        }
        const call = this.makeActivity(MO_SPECIAL.urgent, Date.now());
        call.room = prev ? prev.room : 'bedroom';
        call.place = prev ? prev.place : null;
        s.current = call;
        s.lastSeen = Date.now();
        this.addLog(Date.now(), '🚨', wasAsleep ? 'สะดุ้งตื่นเพราะเองโทรมาด่วน' : `หยุด${prev ? prev.label : ''}มารับสายด่วนจากเอง`);
        this.save();
        this.emit(prev);
        return { wasAsleep, prevLabel: prev ? prev.label : '' };
    }

    /**
     * เองเร่งให้กลับบ้าน (โมอยู่ข้างนอก) → โมยอมกลับ: ตัดกิจกรรมข้างนอกให้จบเร็ว แล้วนั่งรถกลับ
     * คืน { ok, from, eta } หรือ { ok: false } ถ้าอยู่บ้านอยู่แล้ว
     */
    hurryHome() {
        const s = this.state;
        const c = s.current;
        if (!c || c.room !== 'out') return { ok: false };
        if (c.id === 'commute') {
            c.endsAt = Math.min(c.endsAt, Date.now() + 10 * 60000);
            this.save();
            return { ok: true, from: c.place, eta: Math.round((c.endsAt - Date.now()) / 60000), already: true };
        }
        const from = c.place || 'ข้างนอก';
        c.endsAt = Date.now();
        const ride = this.makeActivity(MO_SPECIAL.commute, Date.now(), Date.now() + this.rand(10, 20) * 60000);
        ride.place = `บนรถกลับจาก${from}`;
        ride.phone = c.phone === 'home' ? 'home' : 'with';
        s.current = ride;
        this.addLog(Date.now(), '🚕', `เองเร่งให้กลับ เลยรีบออกจาก${from}`);
        this.save();
        this.emit(c);
        return { ok: true, from, eta: Math.round((ride.endsAt - Date.now()) / 60000) };
    }

    /**
     * เองโทรมา (ปกติ): โมรับไหม รับช้าแค่ไหน ตามสถานการณ์จริง
     */
    answerCall() {
        const c = this.state.current;
        if (!c) return { answer: true, delay: 3000 };
        switch (c.phone) {
            case 'with': return { answer: true, delay: this.rand(2, 5) * 1000 };
            case 'near': return Math.random() < 0.6 ? { answer: true, delay: this.rand(8, 16) * 1000 } : { answer: false };
            default: return { answer: false };
        }
    }

    /**
     * เรียกทุก 20 วิ: ถึงเวลาเปลี่ยนกิจกรรมหรือยัง
     */
    tick() {
        this.tickGame();
        const c = this.state.current;
        if (c && Date.now() < c.endsAt) return;
        // กำลังคุยกันอยู่ → ยังไม่ไปไหน ขอคุยต่ออีกแป๊บ (ไม่เกิน 3 รอบ ~30 นาที, ยกเว้นถึงเวลานอนจริง)
        if (c && this.isChatting && this.isChatting() && (c.delays || 0) < 3 && !this.isSleepTime(Date.now())) {
            c.endsAt = Date.now() + 10 * 60000;
            c.delays = (c.delays || 0) + 1;
            this.save();
            return;
        }
        const prev = this.advance(Date.now());
        this.save();
        this.emit(prev);
    }

    // =============================================
    //  มือถือ & การตอบแชท
    // =============================================

    /**
     * โมจะเห็นแชทในอีกกี่ ms (Infinity = ยังไม่เห็นจนกว่าจะเปลี่ยนกิจกรรม)
     */
    replyDelay() {
        const c = this.state.current;
        if (!c) return 0;
        switch (c.phone) {
            case 'with': return Math.random() < 0.85 ? 0 : this.rand(20, 90) * 1000;
            case 'near': return this.rand(1, 6) * 60000;
            default: return Infinity; // away / home / asleep
        }
    }

    canSeePhone() {
        return this.replyDelay() !== Infinity;
    }

    /**
     * สถานะบนหัวแชท
     */
    headerStatus() {
        // เหมือนแอปแชทจริง: ถือมือถืออยู่ = ออนไลน์, ไม่ได้ถือ = ใช้งานล่าสุดเมื่อไร (อยากรู้ว่าทำอะไรต้องไปดูที่บ้านโม)
        const c = this.state.current;
        if (!c || c.phone === 'with') return 'ออนไลน์';
        const mins = Math.floor((Date.now() - this.lastSeen()) / 60000);
        if (mins < 1) return 'ใช้งานเมื่อสักครู่';
        if (mins < 60) return `ใช้งานล่าสุด ${mins} นาทีที่แล้ว`;
        return `ใช้งานล่าสุด ${Math.floor(mins / 60)} ชั่วโมงที่แล้ว`;
    }

    /** ครั้งล่าสุดที่โมจับมือถือ */
    lastSeen() {
        const c = this.state.current;
        if (c && c.phone === 'with') return Date.now();
        if (c && c.phone === 'near') return c.startedAt;
        return this.state.lastSeen || (c ? c.startedAt : Date.now());
    }

    /**
     * บอก AI ว่าตอนนี้โมกำลังทำอะไร (ให้ตอบสอดคล้อง)
     */
    describeNow() {
        const s = this.state;
        const c = s.current;
        if (!c) return '';
        const where = c.room === 'out' ? (c.place || 'ข้างนอก') : `ที่บ้าน (${MO_ROOMS[c.room].name})`;
        const mins = Math.max(1, Math.round((Date.now() - c.startedAt) / 60000));
        const feel = [
            s.hunger > 70 ? 'หิวมาก' : s.hunger > 45 ? 'เริ่มหิว' : 'อิ่มอยู่',
            s.energy < 30 ? 'ง่วง/เหนื่อย' : s.energy > 75 ? 'สดชื่น' : '',
            s.mood < 40 ? 'อารมณ์ไม่ค่อยดี' : s.mood > 80 ? 'อารมณ์ดีมาก' : '',
        ].filter(Boolean).join(' ');
        const recent = s.log.slice(-4, -1).map(l => l.text.split(' — ')[0]).join(', ');
        const g = this.gameSession();
        const gameText = g ? `\nเล่น${g.name}ไป ชนะ ${g.wins} แพ้ ${g.losses}${g.log.length ? ` ตาล่าสุด: ${g.log[g.log.length - 1].win ? 'ชนะ' : 'แพ้'} (${g.log[g.log.length - 1].note})` : ''} — เล่าได้ อารมณ์ตามผลเกม ถ้าเองชวนเล่นด้วย ตอบตามจริง (กำลังเล่นตานี้อยู่ก็ขอจบตานี้ก่อน)` : '';
        return `ตอนนี้โมกำลัง${c.label} ${where} (มา ${mins} นาทีแล้ว) รู้สึก: ${feel}${gameText}`
            + (recent ? `\nก่อนหน้านี้วันนี้: ${recent}` : '')
            + `\nเงินโม: ฿${s.wallet}` + (s.wish ? ` อยากได้${s.wish.item} (฿${s.wish.cost})` : '');
    }

    // =============================================
    //  เงิน
    // =============================================

    transfer(amount) {
        const s = this.state;
        amount = Math.floor(amount);
        if (!(amount > 0) || amount > s.userWallet) return false;
        s.userWallet -= amount;
        s.wallet += amount;
        s.mood = Math.min(100, s.mood + 5);
        this.addLog(Date.now(), '💸', `ได้รับเงินโอน ฿${amount}`);
        this.save();
        return true;
    }

    /** เติมเงินเทียมให้เองวันละ 200 (กันเงินหมด) */
    dailyAllowance() {
        const s = this.state;
        const today = new Date().toDateString();
        if (s.lastAllowance === today) return;
        if (s.lastAllowance) s.userWallet += 200;
        s.lastAllowance = today;
        this.save();
    }
}

// Export
window.MoLife = MoLife;
window.MoWeather = MoWeather;
window.MO_ROOMS = MO_ROOMS;
