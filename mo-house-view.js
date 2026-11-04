/* ============================================
   Mo House View 🏡 - บ้านโมแบบตุ๊กตาเปิดหน้า (isometric SVG)
   - บ้าน 2 ชั้น: ล่าง = นั่งเล่น / ครัว+โต๊ะกิน / ห้องน้ำ, บน = ห้องนอน + ระเบียงต้นไม้ (ขึ้นบันได)
   - โมนั่ง/นอนอยู่ตรงของที่กำลังใช้จริง, มือถือวางอยู่ห้องที่ลืมไว้
   - กลางคืน: บ้านมืดลง ห้องที่โมอยู่เปิดไฟ (หลับ = ปิดไฟ)
   ============================================ */

const MoHouseView = {
    S: 21,          // ขนาด 1 หน่วยบนจอ
    OX: 202,        // จุดเริ่ม (มุมหลังบ้าน) บนจอ
    OY: 206,

    iso(x, y, z = 0) {
        const c = 0.866 * this.S, s = 0.5 * this.S;
        return [this.OX + (x - y) * c, this.OY + (x + y) * s - z * this.S];
    },

    pts(list) {
        return list.map(([x, y, z]) => this.iso(x, y, z).map(n => n.toFixed(1)).join(',')).join(' ');
    },

    poly(list, fill, extra = '') {
        return `<polygon points="${this.pts(list)}" fill="${fill}" ${extra}/>`;
    },

    shade(hex, k) {
        const n = parseInt(hex.slice(1), 16);
        const ch = sh => Math.max(0, Math.min(255, Math.round(((n >> sh) & 255) * k)));
        return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    },

    // กล่อง: บน / ด้านหน้าซ้าย (y+d) / ด้านหน้าขวา (x+w)
    box(x, y, z, w, d, h, color, dim = 1) {
        const c = k => this.shade(color, k * dim);
        return this.poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], c(1.08))
            + this.poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], c(0.86))
            + this.poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], c(0.72));
    },

    // สี่เหลี่ยมแบนบนพื้น (พรม)
    flat(x, y, z, w, d, fill) {
        return this.poly([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]], fill);
    },

    // หน้าต่าง/รูปบนผนังหลัง (ระนาบ y = 0)
    wallBack(x, z, w, h, fill, stroke = '') {
        return this.poly([[x, 0.02, z], [x + w, 0.02, z], [x + w, 0.02, z + h], [x, 0.02, z + h]], fill, stroke);
    },

    // หน้าต่าง/รูปบนผนังซ้าย (ระนาบ x = 0)
    wallLeft(y, z, d, h, fill, stroke = '') {
        return this.poly([[0.02, y, z], [0.02, y + d, z], [0.02, y + d, z + h], [0.02, y, z + h]], fill, stroke);
    },

    // จุดที่โมอยู่ตามของที่ใช้ (x, y, z ของ "ก้น" โม)
    spots: {
        '🛏️': [9.4, 1.9, 5.5], '💻': [5.9, 1.6, 4.8], '🪞': [9.9, 2.2, 0], '🧸': [9.4, 1.9, 5.5], '👗': [7.4, 1.6, 4.8],
        '🛋️': [3.4, 6.6, 0.8], '📺': [3.4, 6.6, 0.8], '🎮': [3.4, 6.6, 0.8], '📚': [3.4, 6.6, 0.8], '🪟': [3.4, 6.6, 0.8],
        '🍳': [6.2, 1.9, 0], '🧊': [8.4, 1.8, 0], '☕': [6.2, 1.9, 0], '🍽️': [8.6, 7.9, 0.9],
        '🛁': [10.9, 1.9, 0.8], '🪥': [9.9, 2.2, 0], '🧴': [9.9, 2.2, 0], '🪒': [9.9, 2.2, 0],
        '🪴': [1.2, 2.6, 4.8], '🪑': [2.9, 2.2, 5.3], '👕': [1.1, 1.6, 4.8], '📱': null,
    },
    centers: {
        bedroom: [8.6, 2.4, 4.8], living: [3.4, 6.6, 0], kitchen: [7, 2.6, 0], bathroom: [10.6, 2.4, 0], balcony: [2.2, 2.4, 4.8],
    },

    avatar(x, y, z, sleeping) {
        const [sx, sy] = this.iso(x, y, z);
        const r = 12;
        return `<ellipse cx="${sx}" cy="${sy + 2}" rx="11" ry="4" fill="rgba(0,0,0,0.18)"/>
            <circle cx="${sx}" cy="${sy - r}" r="${r + 2}" fill="#fff"/>
            <circle cx="${sx}" cy="${sy - r}" r="${r + 2}" fill="none" stroke="#f04d85" stroke-width="2"/>
            <image href="mo_avatar.jpg" x="${sx - r}" y="${sy - 2 * r}" width="${2 * r}" height="${2 * r}" clip-path="url(#mo-clip)" preserveAspectRatio="xMidYMid slice" transform="translate(0 0)"/>
            ${sleeping ? `<text x="${sx + 12}" y="${sy - 26}" class="hv-zzz">z z</text>` : ''}`;
    },

    render(life, opts = {}) {
        const c = life.state.current || {};
        const night = opts.night;
        const dim = night ? 0.62 : 1;
        const asleep = c.id === 'sleep';
        const B = (...a) => this.box(...a, dim);
        const wood = '#e8cfa8', wall = night ? '#7c7891' : '#f6efe6', wall2 = night ? '#6c6a85' : '#ece2d6';
        const glass = night ? 'rgba(40,52,96,0.9)' : 'rgba(170,215,240,0.85)';
        const sky = opts.rain ? '🌧️' : night ? '🌙' : '☀️';
        let g = '';

        // ---- ผนังหลัง 2 ชั้น + พื้นล่าง ----
        g += this.poly([[0, 0, 0], [12, 0, 0], [12, 0, 9], [0, 0, 9]], wall);
        g += this.poly([[0, 0, 0], [0, 9, 0], [0, 9, 9], [0, 0, 9]], wall2);
        g += this.flat(0, 0, 0, 12, 9, this.shade(wood, dim));
        g += this.flat(1.4, 5, 0.01, 3.4, 3.4, night ? '#8a7f8f' : '#f3e8ef');                  // พรม
        g += this.wallLeft(5.6, 1.9, 2.4, 1.6, glass, 'stroke="#fff" stroke-width="2"');        // หน้าต่างนั่งเล่น
        g += this.wallBack(9.4, 1.6, 1.6, 1.2, night ? '#9aa' : '#dff1f5', 'stroke="#fff" stroke-width="1.5"'); // กระจกห้องน้ำ
        g += this.wallBack(4.8, 2.2, 2.6, 1.3, night ? '#a99' : '#fff');                         // ชั้นวางครัว

        // ---- ชั้นล่าง (เรียงจากหลังไปหน้า) ----
        g += B(4.6, 0, 0, 3.4, 1.2, 1.4, '#a8d5c8');                    // เคาน์เตอร์ครัว
        g += this.flat(5.6, 0.3, 1.41, 0.9, 0.6, '#555');               // เตา
        g += B(8, 0, 0, 1, 1.1, 2.7, '#f4ecd8');                        // ตู้เย็น
        g += B(10, 0.3, 0, 1.8, 3.2, 0.9, '#ffffff');                   // อ่างอาบน้ำ
        g += this.flat(10.2, 0.5, 0.91, 1.4, 2.8, night ? '#7aa' : '#bfe6f2');
        g += this.poly([[9.2, 0, 0], [9.2, 4, 0], [9.2, 4, 2.3], [9.2, 0, 2.3]], 'rgba(255,255,255,0.45)', 'stroke="#fff"'); // ฉากกั้นห้องน้ำ (กระจก)
        g += B(0, 5, 0, 0.8, 2.6, 0.9, '#8a5a3c');                      // ชั้นวางทีวี
        g += B(0.15, 5.3, 0.9, 0.2, 2, 1.3, '#222831');                 // ทีวี
        g += B(7.4, 5.6, 0.75, 2.6, 1.8, 0.15, '#d9b88f');              // โต๊ะกินข้าว
        g += B(8.5, 6.2, 0.9, 0.5, 0.5, 0.3, '#ffffff');                // เค้กบนโต๊ะ
        [[7.6, 7.5], [9.2, 7.5]].forEach(([x, y]) => { g += B(x, y, 0, 0.6, 0.6, 0.9, '#f1ece6'); }); // เก้าอี้
        g += B(3, 5.2, 0, 1.2, 3, 0.75, '#b5653a');                     // โซฟา
        g += B(4.1, 5.2, 0, 0.45, 3, 1.5, '#a65a33');                   // พนักโซฟา
        g += B(1.8, 8.2, 0, 0.12, 0.12, 2.2, '#c9a227');                // เสาโคมไฟ
        const [lx, ly] = this.iso(1.86, 8.26, 2.5);
        g += `<circle cx="${lx}" cy="${ly}" r="${night && !asleep ? 16 : 7}" fill="${night && !asleep ? 'rgba(255,214,120,0.55)' : '#fff6c9'}"/>`;
        // บันได
        for (let i = 0; i < 8; i++) g += B(10.8, 8 - (i + 1) * 0.5, 0, 1.2, 0.5, (i + 1) * 0.56, '#f2f2f2');

        // ---- พื้นชั้นบน ----
        g += B(0, 0, 4.5, 12, 4, 0.3, '#d9b88f');
        g += this.wallBack(5, 6, 1.4, 1.2, night ? '#86a' : '#fde4ef');                           // รูปติดผนัง
        g += this.wallLeft(0.6, 5.6, 2.6, 1.8, glass, 'stroke="#fff" stroke-width="2"');          // หน้าต่างระเบียง
        // ห้องนอน
        g += B(8, 0, 4.8, 3.4, 0.35, 1.8, '#5fa8a0');                   // หัวเตียง
        g += B(8, 0.35, 4.8, 3.4, 3, 0.7, '#ffffff');                   // เตียง
        g += B(8.3, 0.5, 5.5, 1.2, 0.8, 0.25, '#f6f6f6');               // หมอน
        g += B(9.8, 0.5, 5.5, 1.2, 0.8, 0.25, '#f6f6f6');
        g += B(8, 2.2, 5.5, 3.4, 1.15, 0.08, asleep ? '#c9b6e4' : '#d8d8e0'); // ผ้าห่ม
        g += B(5, 0.1, 4.8, 1.7, 0.9, 1.1, '#f0e6da');                  // โต๊ะทำงาน
        g += B(5.4, 0.25, 5.9, 0.9, 0.55, 0.06, '#7a7f8a');             // โน้ตบุ๊ก
        // สมุดไดอารี่ของโมบนโต๊ะ (แตะเพื่ออ่าน)
        {
            const [nx, ny] = this.iso(6.35, 0.75, 5.95);
            g += `<g class="hv-diary" data-open="diary" role="button" aria-label="อ่านไดอารี่ของโม">
                <circle cx="${nx}" cy="${ny - 4}" r="16" fill="rgba(240,77,133,0.18)" class="hv-diary-glow"/>
                <text x="${nx}" y="${ny}" class="hv-gift" style="font-size:17px">📔</text></g>`;
        }
        g += B(6.9, 0.1, 4.8, 0.9, 0.8, 2.6, '#e8ddd0');                // ตู้เสื้อผ้า
        // ระเบียง
        g += this.poly([[4, 0, 4.8], [4, 4, 4.8], [4, 4, 8.4], [4, 0, 8.4]], 'rgba(255,255,255,0.35)', 'stroke="#fff"'); // กระจกกั้น
        [[0.4, 0.4], [0.4, 3.0], [3.2, 0.4]].forEach(([x, y]) => {
            g += B(x, y, 4.8, 0.6, 0.6, 0.6, '#c8794d');
            const [px, py] = this.iso(x + 0.3, y + 0.3, 6.1);
            g += `<circle cx="${px}" cy="${py}" r="9" fill="${this.shade('#4f9d5c', dim)}"/>`;
        });
        g += B(2.4, 1.8, 4.8, 0.9, 0.9, 0.5, '#9b6b4a');                // เก้าอี้ระเบียง
        g += B(2.4, 1.8, 5.3, 0.25, 0.9, 0.8, '#9b6b4a');
        g += B(0.9, 1.3, 4.8, 0.08, 0.08, 1.8, '#bbb');                 // ราวตากผ้า
        g += B(1.8, 1.3, 4.8, 0.08, 0.08, 1.8, '#bbb');
        g += B(0.9, 1.3, 6.55, 0.98, 0.06, 0.06, '#bbb');
        g += B(1.1, 1.33, 5.9, 0.35, 0.05, 0.6, '#f4a6c1');
        // ราวกันตกชั้นบน
        for (let x = 0.3; x < 10.8; x += 0.75) g += B(x, 3.9, 4.8, 0.06, 0.06, 1.1, '#2d2d2d');
        g += B(0, 3.88, 5.9, 10.8, 0.1, 0.08, '#2d2d2d');

        // ---- รายละเอียดบ้าน (ของแต่ง + ของที่แตะได้) ----
        g += this.details(opts, { B, night, asleep });

        // ---- ของขวัญจากเอง + ของแต่งตามเทศกาล ----
        const item = (x, y, z, emoji, size = 15, cls = 'hv-gift') => {
            const [sx, sy] = this.iso(x, y, z);
            return `<text x="${sx}" y="${sy}" class="${cls}" style="font-size:${size}px">${emoji}</text>`;
        };
        (opts.gifts || []).forEach(gf => { g += item(...gf.pos, gf.emoji); });
        if (opts.festival) {
            g += item(1.0, 8.6, 0, opts.festival.decor, 20, 'hv-decor') + item(3.6, 3.6, 4.8, opts.festival.decor, 18, 'hv-decor');
        }

        // ---- ไฟห้องที่โมอยู่ (กลางคืน) ----
        if (night && !asleep && this.centers[c.room]) {
            const [gx, gy] = this.iso(...this.centers[c.room]);
            g += `<circle cx="${gx}" cy="${gy - 20}" r="70" fill="url(#hv-glow)"/>`;
        }

        // ---- มือถือที่วางทิ้งไว้ ----
        if (opts.phoneRoom && c.phone !== 'with' && this.centers[opts.phoneRoom]) {
            const [x, y, z] = this.centers[opts.phoneRoom];
            const [px, py] = this.iso(x + 0.8, y + 0.8, z);
            g += `<text x="${px}" y="${py}" class="hv-phone">📱</text>`;
        }

        // ---- โม ----
        if (c.room === 'out') {
            g += `<g class="hv-out"><rect x="272" y="12" width="140" height="44" rx="12" fill="#fff" stroke="#f04d85"/>
                <image href="mo_avatar.jpg" x="280" y="19" width="30" height="30" clip-path="url(#mo-clip-out)"/>
                <text x="316" y="32" class="hv-out-t">ไม่อยู่บ้าน</text>
                <text x="316" y="47" class="hv-out-s">${this.esc((c.place || 'ข้างนอก').slice(0, 14))}</text></g>`;
        } else {
            const spot = (this.spots[opts.spot] || this.centers[c.room] || this.centers.bedroom);
            const [mx, my] = this.iso(...spot);
            g += `<g class="hv-mo" data-sx="${mx.toFixed(1)}" data-sy="${my.toFixed(1)}" data-up="${spot[2] >= 4 ? 1 : 0}">${this.avatar(...spot, asleep)}</g>`;
        }

        // ---- ป้ายห้อง ----
        const label = (x, y, z, t) => { const [sx, sy] = this.iso(x, y, z); return `<text x="${sx}" y="${sy}" class="hv-label">${t}</text>`; };
        g += label(2.6, 8.9, 0, '🛋️ นั่งเล่น') + label(8.6, 8.9, 0, '🍽️ ครัว') + label(10.8, 3.6, 0, '🛁 ห้องน้ำ')
            + label(9.6, 3.9, 4.8, '🛏️ ห้องนอน') + label(2, 3.9, 4.8, '🪴 ระเบียง');

        const [wx, wy] = this.iso(0, 0.8, 8.2);
        g += `<text x="${wx + 6}" y="${wy}" class="hv-sky">${sky}</text>`;

        return `<svg class="house-view ${night ? 'night' : ''}" viewBox="0 0 424 432" role="img" aria-label="บ้านโม">
            <defs>
                <clipPath id="mo-clip" clipPathUnits="objectBoundingBox"><circle cx="0.5" cy="0.5" r="0.5"/></clipPath>
                <clipPath id="mo-clip-out"><circle cx="295" cy="34" r="15"/></clipPath>
                <radialGradient id="hv-glow"><stop offset="0" stop-color="rgba(255,210,120,0.55)"/><stop offset="1" stop-color="rgba(255,210,120,0)"/></radialGradient>
            </defs>
            ${g}
        </svg>`;
    },

    /** จุดบนจอของบันได (ล่าง/บน) ให้โมเดินขึ้นลง */
    stairs() {
        const [bx, by] = this.iso(11.4, 8.2, 0), [tx, ty] = this.iso(11.4, 4.1, 4.8);
        return { bottom: { x: bx, y: by }, top: { x: tx, y: ty } };
    },

    /** แตะได้: ห่อของด้วย <g data-obj> + วงแสงให้รู้ว่ากดได้ */
    tap(obj, x, y, z, inner, label) {
        const [sx, sy] = this.iso(x, y, z);
        return `<g class="hv-obj" data-obj="${obj}" role="button" aria-label="${label}">
            <circle cx="${sx}" cy="${sy - 5}" r="14" class="hv-obj-glow"/>${inner}</g>`;
    },

    details(opts, { B, night, asleep }) {
        const home = opts.home || {};
        const now = new Date();
        let g = '';
        const emo = (x, y, z, e, size = 14, cls = 'hv-gift') => {
            const [sx, sy] = this.iso(x, y, z);
            return `<text x="${sx}" y="${sy}" class="${cls}" style="font-size:${size}px">${e}</text>`;
        };

        // ---- ชั้นล่าง ----
        // นาฬิกาแขวน (เวลาจริง)
        {
            const [cx, cy] = this.iso(0.02, 4.9, 3.5);
            const hA = ((now.getHours() % 12) + now.getMinutes() / 60) * 30 * Math.PI / 180;
            const mA = now.getMinutes() * 6 * Math.PI / 180;
            g += `<g class="hv-clock"><ellipse cx="${cx}" cy="${cy}" rx="11" ry="12" fill="#fff" stroke="#c98" stroke-width="2"/>
                <line x1="${cx}" y1="${cy}" x2="${(cx + Math.sin(hA) * 5).toFixed(1)}" y2="${(cy - Math.cos(hA) * 6).toFixed(1)}" stroke="#333" stroke-width="2" stroke-linecap="round"/>
                <line x1="${cx}" y1="${cy}" x2="${(cx + Math.sin(mA) * 8).toFixed(1)}" y2="${(cy - Math.cos(mA) * 9).toFixed(1)}" stroke="#f04d85" stroke-width="1.3" stroke-linecap="round"/></g>`;
        }
        // ปฏิทินของเรา (แตะเพื่อเปิด) — มีวันสำคัญใน 7 วัน = จุดเหลืองนับถอยหลัง
        {
            const [px, py] = this.iso(0.02, 8.6, 3.1);
            const soon = home.nextEvent;
            g += `<g class="hv-obj" data-obj="calendar" role="button" aria-label="ปฏิทินของเรา">
                <circle cx="${px + 9}" cy="${py + 10}" r="15" class="hv-obj-glow"/>
                <rect x="${px}" y="${py}" width="18" height="20" rx="2" fill="#fff" stroke="#e7a"/>
                <rect x="${px}" y="${py}" width="18" height="6" rx="2" fill="#f04d85"/>
                <text x="${px + 9}" y="${py + 17}" text-anchor="middle" class="hv-cal-day">${now.getDate()}</text>
                ${soon && soon.daysLeft <= 7 ? `<circle cx="${px + 18}" cy="${py}" r="5" fill="#ffd166"/><text x="${px + 18}" y="${py + 2.5}" text-anchor="middle" class="hv-cal-badge">${soon.daysLeft}</text>` : ''}</g>`;
        }
        // รูปคู่บนผนังนั่งเล่น
        g += this.wallLeft(2.2, 2.2, 1.1, 0.9, night ? '#a89' : '#ffe1ec', 'stroke="#c98" stroke-width="2"');
        g += emo(0.05, 2.9, 2.35, '💑', 10);
        // ชั้นหนังสือ
        g += B(0, 3.2, 0, 0.6, 1.4, 2.4, '#c9a27a');
        ['#e76f51', '#2a9d8f', '#e9c46a', '#8ab6d6', '#f4a6c1', '#6d597a'].forEach((col, i) => {
            g += B(0.08, 3.3 + (i % 3) * 0.42, 0.9 + Math.floor(i / 3) * 0.75, 0.42, 0.3, 0.6, col);
        });
        g += this.tap('album', 0.3, 3.9, 2.45, emo(0.3, 3.9, 2.45, '📸', 13), 'อัลบั้มของเรา');
        // พรมลาย + โต๊ะกลาง + ของว่าง
        g += this.flat(1.7, 5.3, 0.012, 2.8, 2.8, night ? 'rgba(160,140,170,0.6)' : 'rgba(240,77,133,0.13)');
        g += B(1.9, 6.1, 0, 0.9, 1.2, 0.45, '#9b6b4a');
        g += emo(2.3, 6.6, 0.5, '☕', 9) + emo(2.35, 7.1, 0.5, '🍪', 9);
        // ทีวี: จอสว่างตอนโมดูทีวี/เล่นเกม
        if (home.tvOn) g += B(0.37, 5.4, 1.0, 0.02, 1.8, 1.1, night ? '#7cc6ff' : '#9fd8ff');
        g += this.tap('tv', 0.3, 6.3, 2.0, '', 'ทีวี');
        // ครัว
        g += emo(5.9, 0.6, 1.45, '🍲', 12) + emo(7.2, 0.5, 1.45, '🫖', 11) + emo(4.9, 0.5, 1.45, '🧂', 9);
        g += this.tap('fridge', 8.5, 1.1, 1.8, emo(8.5, 1.12, 1.8, '🧲', 9), 'ตู้เย็น');
        g += emo(7.1, 1.9, 0, '🥣', 10);
        // ห้องน้ำ
        g += B(9.5, 0, 0, 0.6, 0.6, 1, '#ffffff');
        g += B(11.7, 0.3, 1, 0.06, 0.8, 0.9, '#f9c6d6');
        g += emo(10.9, 1.8, 0.95, '🦆', 9);
        // ไฟเพดาน (กลางคืนเปิด)
        [[3.2, 6.4], [7, 2.4], [8.6, 6.4]].forEach(([x, y]) => {
            const [sx, sy] = this.iso(x, y, 4.2);
            g += `<line x1="${sx}" y1="${sy - 10}" x2="${sx}" y2="${sy}" stroke="#bbb"/><circle cx="${sx}" cy="${sy + 3}" r="4" fill="${night && !asleep ? '#ffe08a' : '#eee'}"/>`;
        });

        // ---- ชั้นบน ----
        g += B(11.45, 0.4, 4.8, 0.5, 0.6, 0.8, '#d9b88f');                       // โต๊ะข้างเตียง
        g += emo(11.7, 0.7, 5.65, night && !asleep ? '🪔' : '💡', 10);
        g += emo(6.0, 0.4, 5.95, '🖊️', 8);
        if (home.laptopOn) g += B(5.45, 0.22, 5.96, 0.8, 0.05, 0.45, '#9fe3ff');  // จอโน้ตบุ๊กสว่าง
        g += emo(7.35, 1.0, 7.5, '👒', 10);
        g += this.flat(8.4, 3.45, 4.81, 2.4, 0.4, night ? '#8a7f8f' : '#f7d6e0');  // พรมข้างเตียง
        // ต้นไม้ของเรา (โตตามวันที่คุยกัน — แตะเพื่อรดน้ำ)
        const pl = home.plant;
        if (pl) {
            g += B(1.0, 2.9, 4.8, 0.7, 0.7, 0.5, '#d98c5f');
            g += this.tap('plant', 1.35, 3.25, 5.4, emo(1.35, 3.25, 5.35, pl.emoji, 22), 'ต้นไม้ของเรา');
        }
        g += emo(3.4, 0.6, 4.85, '🧺', 11);

        // น้องแมว
        if (home.pet) {
            const [x, y, z] = home.pet.spot;
            g += this.tap('pet', x, y, z, emo(x, y, z, '🐈', 18, 'hv-pet' + (home.pet.sleeping ? ' sleeping' : '')), 'น้องแมว')
                + (home.pet.badge ? emo(x + 0.3, y - 0.3, z + 1.3, home.pet.badge, 10) : '');
        }
        return g;
    },

    esc(t) {
        return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
};

// Export
window.MoHouseView = MoHouseView;
