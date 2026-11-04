// ทดสอบแอคเคานต์ของขวัญในเครื่อง (ไม่ต้อง push): node scripts/gift-preview.mjs → เปิด http://localhost:8766/?gift
// - เสิร์ฟไฟล์แอป + จำลองหลังบ้าน /api/gift/* (รหัส/จดหมายจาก mo-gift.local.js)
// - AI ตอบจริง: ใช้ Gemini key จาก mo-keys.local.js (คีย์อยู่ฝั่งเซิร์ฟเวอร์นี้ ไม่ส่งไปที่หน้าเว็บ)
// - ข้อมูลโม = ว่างเปล่า (ไม่ดึงจาก Supabase) / เริ่มใหม่: http://localhost:8766/?gift&reset
import http from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8766;
const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ['mo-keys.local.js', 'mo-gift.local.js']) {
    if (existsSync(join(ROOT, f))) vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx);
}
const GIFT = ctx.window.MO_GIFT;
const KEY = ctx.window.MO_KEYS && ctx.window.MO_KEYS.gemini;
if (!GIFT) { console.error('ไม่พบ mo-gift.local.js'); process.exit(1); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const send = (res, code, data) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
let fails = 0;

http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/gift/')) {
        let body = '';
        for await (const c of req) body += c;
        const j = body ? JSON.parse(body) : {};
        const route = url.pathname.slice('/api/gift/'.length);
        if (route === 'hint') return send(res, 200, { ready: true, hint: GIFT.hint, faint: GIFT.faint });
        if (route === 'login') {
            const mode = j.pin === GIFT.guestPin ? 'guest' : j.pin === GIFT.ownerPin ? 'owner' : null;
            if (!mode) { fails++; return send(res, 401, { wrong: true, left: Math.max(0, 8 - fails) }); }
            fails = 0;
            console.log(`🔓 เข้าด้วยรหัส${mode === 'guest' ? 'ของเขา' : 'เจ้าของ'}`);
            return send(res, 200, { token: `local.${mode}`, mode });
        }
        if (route === 'state') {
            const { guestPin, ownerPin, hint, faint, ...open } = GIFT;
            return send(res, 200, { keys: {}, gift: open, mode: 'owner' });
        }
        if (route === 'event') { console.log('📝', j.type, j.n ?? ''); return send(res, 200, { ok: true }); }
        if (route === 'video') {   // คลิปฉากจบจากไฟล์ส่วนตัว (รองรับ Range เหมือนของจริง — iPhone ต้องใช้)
            const file = GIFT.endingVideo && join(ROOT, GIFT.endingVideo);
            if (!url.searchParams.get('t') || !file || !existsSync(file)) return send(res, 404, {});
            const size = statSync(file).size;
            const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
            const start = m && m[1] ? Number(m[1]) : 0;
            const end = m && m[2] ? Number(m[2]) : size - 1;
            res.writeHead(m ? 206 : 200, {
                'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': end - start + 1,
                ...(m ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}),
            });
            return createReadStream(file, { start, end }).pipe(res);
        }
        if (route === 'ai') {
            if (!KEY) return send(res, 200, { candidates: [{ content: { parts: [{ text: 'ว่าไงงง (ไม่มี Gemini key ในเครื่อง ตอบแทนไว้ก่อน)' }] } }] });
            if (!/^models\/[\w.-]+(:(generateContent|batchEmbedContents))?$/.test(j.path || '')) return send(res, 400, {});
            try {
                const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${j.path}`, {
                    method: j.method === 'GET' ? 'GET' : 'POST',
                    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
                    ...(j.method === 'GET' ? {} : { body: JSON.stringify(j.payload || {}) }),
                });
                res.writeHead(r.status, { 'content-type': 'application/json' });
                return res.end(await r.text());
            } catch (err) {   // เน็ตหลุด/ต่อ Gemini ไม่ได้ → ให้แอปลองตัวสำรอง ไม่ให้เซิร์ฟเวอร์ล่ม
                console.log('⚠️ ต่อ Gemini ไม่ได้:', err.cause ? err.cause.code : err.message);
                return send(res, 502, { error: { message: 'gemini unreachable' } });
            }
        }
        return send(res, 404, {});
    }
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const p = join(ROOT, rel);
    // เหมือนเว็บจริง: ไม่เสิร์ฟไฟล์ส่วนตัว
    if (!p.startsWith(ROOT) || /\.local\.\w+$/.test(rel) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(p));
}).listen(PORT, () => console.log(`💌 เปิด http://localhost:${PORT}/?gift  (เริ่มใหม่: ?gift&reset)  AI: ${KEY ? 'Gemini จริง' : 'ข้อความจำลอง'}`));
