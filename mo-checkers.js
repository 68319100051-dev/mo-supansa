/* ============================================
   Mo Checkers ♟️ - หมากฮอส (กติกาไทย) เล่นกับโม
   - กระดาน 8x8 ฝั่งละ 8 ตัว (2 แถว) เดินทแยงหน้าทีละช่อง
   - มีตัวให้กินต้องกิน กินต่อหลายทอดได้ / ตัวธรรมดากินได้แค่ข้างหน้า
   - ถึงแถวสุดท้าย = ฮอส: เดินทแยงไกลได้ กินแล้วลงช่องติดหลังตัวที่ถูกกินพอดี
   - โมคิดเองในเครื่อง (minimax) ไม่ใช้โควต้า AI + แซว/บ่นระหว่างเล่น
   ============================================ */

const MoCheckers = {
    // ค่าในช่อง: 0 ว่าง, 1 = เรา (เดินขึ้น), 2 = โม (เดินลง), 3 = ฮอสเรา, 4 = ฮอสโม
    newBoard() {
        const b = Array.from({ length: 8 }, () => new Array(8).fill(0));
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 1) {
                if (r < 2) b[r][c] = 2;
                if (r > 5) b[r][c] = 1;
            }
        }
        return b;
    },

    owner(v) {
        return v === 1 || v === 3 ? 1 : v === 2 || v === 4 ? 2 : 0;
    },

    isKing(v) {
        return v === 3 || v === 4;
    },

    inside(r, c) {
        return r >= 0 && r < 8 && c >= 0 && c < 8;
    },

    /**
     * ตากินทั้งหมดของตัวนี้ (กินต่อหลายทอด) → [{ path:[[r,c],...], caps:[[r,c],...] }]
     */
    jumps(b, r, c, piece = b[r][c], caps = [], path = [[r, c]]) {
        const me = this.owner(piece);
        const king = this.isKing(piece);
        const dirs = king ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : me === 1 ? [[-1, 1], [-1, -1]] : [[1, 1], [1, -1]];
        const out = [];
        for (const [dr, dc] of dirs) {
            let rr = r + dr, cc = c + dc;
            // ฮอส: เลื่อนผ่านช่องว่างไปหาตัวที่จะกิน
            if (king) while (this.inside(rr, cc) && b[rr][cc] === 0) { rr += dr; cc += dc; }
            if (!this.inside(rr, cc) || this.owner(b[rr][cc]) !== 3 - me || caps.some(([a, d]) => a === rr && d === cc)) continue;
            const lr = rr + dr, lc = cc + dc;   // ลงช่องติดหลังตัวที่กินพอดี
            if (!this.inside(lr, lc) || b[lr][lc] !== 0) continue;
            const nb = b.map(row => row.slice());
            nb[r][c] = 0;
            nb[lr][lc] = piece;
            const nextCaps = [...caps, [rr, cc]];
            const promoted = !king && ((me === 1 && lr === 0) || (me === 2 && lr === 7));
            const more = promoted ? [] : this.jumps(nb, lr, lc, piece, nextCaps, [...path, [lr, lc]]);
            if (more.length) out.push(...more);
            else out.push({ path: [...path, [lr, lc]], caps: nextCaps });
        }
        return out;
    },

    steps(b, r, c) {
        const piece = b[r][c];
        const me = this.owner(piece);
        const king = this.isKing(piece);
        const dirs = king ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : me === 1 ? [[-1, 1], [-1, -1]] : [[1, 1], [1, -1]];
        const out = [];
        for (const [dr, dc] of dirs) {
            let rr = r + dr, cc = c + dc;
            while (this.inside(rr, cc) && b[rr][cc] === 0) {
                out.push({ path: [[r, c], [rr, cc]], caps: [] });
                if (!king) break;
                rr += dr; cc += dc;
            }
        }
        return out;
    },

    /** ตาเดินที่ถูกกติกาของฝ่ายนี้ (มีกินต้องกิน) */
    moves(b, side) {
        const jumps = [], steps = [];
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            if (this.owner(b[r][c]) !== side) continue;
            jumps.push(...this.jumps(b, r, c));
            steps.push(...this.steps(b, r, c));
        }
        return jumps.length ? jumps : steps;
    },

    apply(b, m) {
        const nb = b.map(row => row.slice());
        const [fr, fc] = m.path[0];
        const [tr, tc] = m.path[m.path.length - 1];
        let piece = nb[fr][fc];
        nb[fr][fc] = 0;
        m.caps.forEach(([r, c]) => { nb[r][c] = 0; });
        if (piece === 1 && tr === 0) piece = 3;
        if (piece === 2 && tr === 7) piece = 4;
        nb[tr][tc] = piece;
        return nb;
    },

    count(b, side) {
        let men = 0, kings = 0;
        b.forEach(row => row.forEach(v => {
            if (this.owner(v) === side) this.isKing(v) ? kings++ : men++;
        }));
        return { men, kings, total: men + kings };
    },

    /** คะแนนมุมมองโม: ตัว 10, ฮอส 30, เดินลึก +1 ต่อแถว */
    evaluate(b) {
        let s = 0;
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            const v = b[r][c];
            if (v === 2) s += 10 + r;
            if (v === 4) s += 30;
            if (v === 1) s -= 10 + (7 - r);
            if (v === 3) s -= 30;
        }
        return s;
    },

    minimax(b, depth, side, alpha, beta) {
        const ms = this.moves(b, side);
        if (!ms.length) return side === 2 ? -1000 - depth : 1000 + depth;
        if (depth === 0) return this.evaluate(b);
        if (side === 2) {
            let best = -Infinity;
            for (const m of ms) {
                best = Math.max(best, this.minimax(this.apply(b, m), depth - 1, 1, alpha, beta));
                alpha = Math.max(alpha, best);
                if (alpha >= beta) break;
            }
            return best;
        }
        let best = Infinity;
        for (const m of ms) {
            best = Math.min(best, this.minimax(this.apply(b, m), depth - 1, 2, alpha, beta));
            beta = Math.min(beta, best);
            if (alpha >= beta) break;
        }
        return best;
    },

    /** โมเลือกตาเดิน: level 1-3 (ลึก 2/4/6) + บางทีเดินพลาดนิดๆ แบบคน */
    bestMove(b, level = 2) {
        const ms = this.moves(b, 2);
        if (!ms.length) return null;
        const depth = [2, 4, 6][level - 1] || 4;
        const scored = ms.map(m => ({ m, s: this.minimax(this.apply(b, m), depth - 1, 1, -Infinity, Infinity) + Math.random() * 2 }));
        scored.sort((a, b2) => b2.s - a.s);
        const slip = level === 1 ? 0.35 : level === 2 ? 0.12 : 0.03;
        return (Math.random() < slip && scored[1] ? scored[1] : scored[0]).m;
    },
};

// =============================================
//  หน้าจอเล่น
// =============================================

class MoCheckersGame {
    constructor(opts = {}) {
        this.onEnd = opts.onEnd || (() => {});      // (result: 'win'|'lose'|'quit', stats) → แจ้งแชท
        this.userName = opts.userName || 'เอง';
        this.level = opts.level || 2;
        this.el = document.getElementById('checkers');
        this.boardEl = this.el.querySelector('.ck-board');
        this.sayEl = this.el.querySelector('.ck-say');
        this.statusEl = this.el.querySelector('.ck-status');
        this.el.querySelector('.ck-close').onclick = () => this.close('quit');
        this.el.querySelector('.ck-new').onclick = () => this.start();
        this.boardEl.onclick = (e) => this.tap(e);
    }

    start() {
        this.board = MoCheckers.newBoard();
        this.turn = 1;
        this.sel = null;
        this.caps = { 1: 0, 2: 0 };
        this.moves = 0;
        this.over = false;
        this.el.classList.remove('hidden');
        this.say(this.pick(['มาาา เค้าไม่ยอมแพ้ง่ายๆ นะ 😤', 'เล่นหมากฮอสกัน! ห้ามโกงนะ', 'เอาจริงแล้วนะ เตรียมตัวแพ้ได้เลย 😏']));
        this.render();
    }

    close(result) {
        this.el.classList.add('hidden');
        if (!this.over && result === 'quit' && this.moves > 0) this.onEnd('quit', this.stats());
    }

    stats() {
        return { moves: this.moves, userCaps: this.caps[1], moCaps: this.caps[2], userLeft: MoCheckers.count(this.board, 1).total, moLeft: MoCheckers.count(this.board, 2).total };
    }

    pick(a) {
        return a[Math.floor(Math.random() * a.length)];
    }

    say(t) {
        this.sayEl.textContent = t;
        this.sayEl.classList.remove('pop');
        void this.sayEl.offsetWidth;
        this.sayEl.classList.add('pop');
    }

    legalFrom(r, c) {
        return MoCheckers.moves(this.board, 1).filter(m => m.path[0][0] === r && m.path[0][1] === c);
    }

    tap(e) {
        const cell = e.target.closest('[data-r]');
        if (!cell || this.turn !== 1 || this.over) return;
        const r = +cell.dataset.r, c = +cell.dataset.c;
        if (MoCheckers.owner(this.board[r][c]) === 1) {
            const opts = this.legalFrom(r, c);
            if (!opts.length) {
                const forced = MoCheckers.moves(this.board, 1).some(m => m.caps.length);
                this.say(forced ? 'มีตัวให้กินอยู่นะ ต้องกินก่อน 😝' : 'ตัวนี้เดินไม่ได้อ่ะ');
                return;
            }
            this.sel = { r, c, opts };
            return this.render();
        }
        if (!this.sel) return;
        const m = this.sel.opts.find(o => { const [tr, tc] = o.path[o.path.length - 1]; return tr === r && tc === c; });
        if (!m) return;
        this.play(m, 1);
    }

    play(m, side) {
        const before = this.board[m.path[0][0]][m.path[0][1]];
        this.board = MoCheckers.apply(this.board, m);
        const [tr, tc] = m.path[m.path.length - 1];
        const crowned = !MoCheckers.isKing(before) && MoCheckers.isKing(this.board[tr][tc]);
        this.caps[side] += m.caps.length;
        this.moves++;
        this.sel = null;
        this.last = m;
        this.turn = 3 - side;
        this.react(side, m, crowned);
        this.render();
        if (this.checkEnd()) return;
        if (this.turn === 2) {
            this.statusEl.textContent = 'โมกำลังคิด... 🤔';
            setTimeout(() => {
                const mm = MoCheckers.bestMove(this.board, this.level);
                if (mm) this.play(mm, 2);
                else this.checkEnd();
            }, 600 + Math.random() * 900);
        }
    }

    react(side, m, crowned) {
        const n = m.caps.length;
        if (side === 1) {
            if (crowned) return this.say(this.pick(['เฮ้ยย ได้ฮอสแล้วเหรอ 😱', 'ไม่นะ ฮอสมาแล้ว ไม่ยุติธรรม 😭']));
            if (n >= 2) return this.say(this.pick([`กินทีเดียว ${n} ตัวเลยหรอ 😭😭`, 'โหดเกินนน เค้าจะร้องไห้']));
            if (n === 1) return this.say(this.pick(['เฮ้ยย กินเค้าอีกแล้ว 😤', 'อ๊าก ไม่ทันเห็นเลย', 'จำไว้นะ เดี๋ยวเอาคืน 😠']));
            if (Math.random() < 0.25) this.say(this.pick(['อืมม เดินตรงนั้นเหรอ...', 'คิดนานจัง 555', 'เค้าเห็นแผนเองนะ 👀']));
        } else {
            if (crowned) return this.say(this.pick(['ฮอสมาแล้วว 👑 กลัวยัง', 'เย้ ได้ฮอส! 😎']));
            if (n >= 2) return this.say(this.pick(['หึหึ กินรวดเลย 😏', `${n} ตัว! ว่าแล้วเชียว`]));
            if (n === 1) return this.say(this.pick(['หม่ำ 😋', 'เสร็จเค้าละ', 'ขอบคุณที่ส่งมาให้กินนะ 555']));
            if (Math.random() < 0.2) this.say(this.pick(['ตาเองแล้ว', 'เอ้า เดินสิ', 'ลองมาดิ']));
        }
    }

    checkEnd() {
        const side = this.turn;
        if (MoCheckers.moves(this.board, side).length) {
            this.statusEl.textContent = side === 1 ? `ตาเอง • กินโมไป ${this.caps[1]} ตัว` : 'โมกำลังคิด... 🤔';
            return false;
        }
        this.over = true;
        const userWin = side === 2;
        this.statusEl.textContent = userWin ? '🎉 เองชนะ!' : '😏 โมชนะ!';
        this.say(userWin ? this.pick(['ไม่จริงงง แพ้ได้ไง 😭 ขอแก้มือ!', 'ยอมก็ได้ เองเก่งแหละ... รอบหน้าไม่ยอมแล้วนะ']) : this.pick(['เย้ ชนะแล้ว! 😎 ใครเก่งกว่า', 'ง่ายไป 555 เอาใหม่มั้ย']));
        setTimeout(() => this.onEnd(userWin ? 'win' : 'lose', this.stats()), 1200);
        return true;
    }

    render() {
        const targets = this.sel ? this.sel.opts.map(o => o.path[o.path.length - 1].join(',')) : [];
        const lastCells = this.last ? this.last.path.map(p => p.join(',')) : [];
        let html = '';
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            const v = this.board[r][c];
            const dark = (r + c) % 2 === 1;
            const key = `${r},${c}`;
            const cls = ['ck-cell', dark ? 'dark' : 'light',
                this.sel && this.sel.r === r && this.sel.c === c ? 'sel' : '',
                targets.includes(key) ? 'target' : '', lastCells.includes(key) ? 'last' : ''].join(' ');
            const piece = v ? `<span class="ck-piece ${MoCheckers.owner(v) === 1 ? 'me' : 'mo'} ${MoCheckers.isKing(v) ? 'king' : ''}">${MoCheckers.isKing(v) ? '👑' : ''}</span>` : '';
            html += `<div class="${cls}" data-r="${r}" data-c="${c}">${piece}</div>`;
        }
        this.boardEl.innerHTML = html;
        const me = MoCheckers.count(this.board, 1), mo = MoCheckers.count(this.board, 2);
        this.el.querySelector('.ck-score').textContent = `เอง ${me.total} ตัว • โม ${mo.total} ตัว`;
    }
}

// Export
window.MoCheckers = MoCheckers;
window.MoCheckersGame = MoCheckersGame;
