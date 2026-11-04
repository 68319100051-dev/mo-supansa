// ทดสอบการคุยของโมกับ AI จริง: node scripts/scenario-test.mjs
// ใช้ Gemini key จาก mo-keys.local.js (ไม่พิมพ์คีย์ออกมา) — ใช้โควต้าประมาณ 1 ครั้งต่อสถานการณ์
// แต่ละสถานการณ์มีแชทย้อนหลัง + ข้อความล่าสุดของเอง + กฎที่คำตอบต้องผ่าน
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const ctx = { window: {}, console, fetch, AbortSignal, setTimeout, CustomEvent, localStorage: { getItem: () => null, setItem() {} } };
ctx.window.window = ctx.window;
vm.createContext(ctx);
for (const f of ['mo-keys.local.js', 'mo-llm.js', 'mo-care.js']) vm.runInContext(readFileSync(new URL(f, root), 'utf8'), ctx);
const keys = ctx.window.MO_KEYS || {};
if (!keys.gemini) { console.error('ไม่พบ Gemini key ใน mo-keys.local.js'); process.exit(1); }
const llm = new ctx.window.MoLLMService();
llm.config = { enabled: true, provider: 'gemini', apiKey: keys.gemini, model: 'gemini-3.8-flash' };
ctx.window.MO_KEYS = {};   // ทดสอบเฉพาะ Gemini (ไม่หลุดไป Groq)
// ระบบห่วงเอง (จับว่ายุ่ง/ไม่สบาย) เหมือนในแอปจริง
const care = new ctx.window.MoCare();
care.save = () => {};
ctx.window.MoCareInstance = care;

const now = Date.now();
const msg = (type, text, minsAgo) => ({ id: now - minsAgo * 60000, type, text, format: 'text', timestamp: now - minsAgo * 60000 });
const summary = { facts: ['งาน: เขียนโปรแกรม ฝึกงานบริษัทไอที'], events: [], longTerm: { userName: '' } };

const SCENARIOS = [
    {
        name: 'บอกแล้วว่าไปทำงาน → ห้ามถามตื่นยัง',
        history: [msg('sent', 'กินยาแล้วนะ ออกมาทำงานละด้วย', 40), msg('received', 'เก่งมากก กินข้าวด้วยนะ', 39)],
        say: 'เบื่องานจัง',
        bad: [/ตื่นยัง|ตื่นรึยัง/],
    },
    {
        name: 'ถาม "ทำไรอยู่" → ต้องเล่าว่าโมทำอะไร ไม่แนะนำเรื่องโค้ด',
        history: [msg('sent', 'อยู่บริษัทเลย', 30), msg('received', 'สู้ๆ นะ', 29)],
        say: 'แกทำไรอยู่',
        bad: [/performance|edge case|code|โค้ด|debug/i],
    },
    {
        name: 'เศร้า → ห้ามแซว/ห้าม 555',
        history: [],
        say: 'วันนี้โดนหัวหน้าด่าต่อหน้าคนอื่น รู้สึกแย่มาก',
        bad: [/5{3,}|ฮ่าๆ|ขำ/],
    },
    {
        name: 'ยุ่งอยู่ → ไม่ทวง ไม่งอน',
        history: [msg('received', 'เงียบไปเลยนะ', 20), msg('received', 'อ่านไม่ตอบอีกละ', 10)],
        say: 'ใจเย็นๆ ทำงานอยู่ค้าบ',
        bad: [/อ่านไม่ตอบ|ทำไมไม่ตอบ|เมิน|ลืมเค้า/],
    },
    {
        name: 'คำถามสั้นงงๆ "ห๊ะ" → อธิบายสิ่งที่เพิ่งพูด ไม่ถามกว้างๆ',
        history: [msg('sent', 'เย็นนี้ว่างมั้ย', 3), msg('received', 'ว่างดิ ไปกินหมูกระทะกัน\nเค้าเลี้ยงเองก็ได้', 2)],
        say: 'ห๊ะ',
        bad: [/มีอะไรสนุก|เล่าให้ฟังหน่อย/],
        good: [/หมูกระทะ|เลี้ยง|เย็นนี้/],
    },
    {
        name: 'ถามเวลา → ตอบตรงนาฬิกา',
        history: [],
        say: 'กี่โมงแล้ว',
        good: [new RegExp(`${new Date().getHours()}[:.]|${['เที่ยงคืน','ตีหนึ่ง','ตีสอง','ตีสาม','ตีสี่','ตีห้า','หกโมง','เจ็ดโมง','แปดโมง','เก้าโมง','สิบโมง','สิบเอ็ดโมง','เที่ยง','บ่ายโมง','บ่ายสอง','บ่ายสาม','สี่โมง','ห้าโมง','หกโมง','หนึ่งทุ่ม','สองทุ่ม','สามทุ่ม','สี่ทุ่ม','ห้าทุ่ม'][new Date().getHours()]}`)],
    },
];

const RULES = [
    // แท็กที่แอปซ่อนให้เองได้ (คิด/อารมณ์/สติกเกอร์/เพลง ฯลฯ) ไม่นับ — นอกนั้นห้ามมี [ ] หลุด
    ['ไม่มีแท็กแปลกหลุด', r => !/\[/.test(r.replace(/\[\s*(?:คิด|เองไม่โอเค|เองโอเคแล้ว|สติกเกอร์|เพลง|คลิป|รีแอค|ยกเลิก|เสียง|จำรูป|ถอดเสียง)[^\]]*\]/g, ''))],
    ['ไม่ใช้ เธอ/คุณ/แก/มึง/กู', r => !/เธอ|คุณ|มึง|กู(?![ก-๙])/.test(r)],
    ['ไม่เกิน 4 บรรทัด', r => r.split('\n').filter(Boolean).length <= 4],
];

let pass = 0, total = 0;
for (const sc of SCENARIOS) {
    total++;
    care.data = { signals: {}, asked: {} };
    for (const k of Object.keys(llm.cooldowns)) if (!/3\.8/.test(k)) delete llm.cooldowns[k];   // ทดสอบแต่ละข้อแยกกัน
    [...sc.history.filter(m => m.type === 'sent').map(m => m.text), sc.say].forEach(t => care.observe(t));
    let reply;
    try {
        reply = await llm.generateResponse(sc.say, [...sc.history], { name: 'โม' }, summary);
    } catch (e) {
        console.log(`\n❌ ${sc.name}\n   เรียก AI ไม่สำเร็จ: ${e.message}`);
        continue;
    }
    const clean = reply.replace(/\[[^\]]*\]/g, '').trim();
    const fails = [
        ...RULES.filter(([, ok]) => !ok(reply)).map(([n]) => n),
        ...(sc.bad || []).filter(re => re.test(clean)).map(re => `มีคำที่ห้าม ${re}`),
        ...(sc.good || []).filter(re => !re.test(clean)).map(re => `ไม่มีสิ่งที่ควรมี ${re}`),
    ];
    if (!fails.length) pass++;
    console.log(`\n${fails.length ? '❌' : '✅'} ${sc.name}\n   เอง: ${sc.say}\n   โม: ${clean.replace(/\n/g, ' / ')}${fails.length ? `\n   ไม่ผ่าน: ${fails.join(', ')}` : ''}`);
}
console.log(`\nผ่าน ${pass}/${total} • ตอบโดย ${llm.lastProvider || '-'}`);
