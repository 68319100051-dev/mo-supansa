/* ============================================
   Mo Worker ☁️ - หลังบ้านบน Cloudflare (ทำงานแม้ปิดแอป)
   - เสิร์ฟไฟล์แอปตามปกติ (ASSETS)
   - ทุก 5 นาที: ดูกิจวัตร / เรื่องรอถามผล / การเตือนของทุกคน → ถึงเวลา → เขียนข้อความโมลงแชท + ส่ง Push
   - เองหายไปนาน (5 ชม.+) → โมทักเองเพราะคิดถึง (วันละไม่เกิน 2 ครั้ง ไม่ทักตอนดึก) บางทีก็โทรมาเลย
   - ถึงเวลานัดเดต → โมโทรมา (Push แบบสายเรียกเข้า)
   - ทำตามที่โมตั้งใจไว้เมื่อคืน + ห่วงเรื่องกินข้าว/ป่วย/นอนดึก แม้ปิดแอป (เลือกช่วงที่เองมักออนไลน์)
   - Push แบบไม่มี payload: มือถือรับแล้วถาม /api/push/inbox ว่าโมพูดว่าอะไร
   - แอป Android (Capacitor): ส่งผ่าน Firebase Cloud Messaging ด้วย → สายเรียกเข้าเต็มจอบนจอล็อก
   Secrets (ตั้งใน Cloudflare): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
   + แอป Android: FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY (จากไฟล์ service account ของ Firebase)
   ============================================ */

const LATE_MIN = 2 * 60000;          // ให้แอป (ถ้าเปิดอยู่) ทักเองก่อน 2 นาที
const ROUTINE_WINDOW = 30 * 60000;
const FOLLOW_WINDOW = 12 * 3600000;
const REMINDER_WINDOW = 2 * 3600000;

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/api/push/key') {
            return json({ key: env.VAPID_PUBLIC_KEY || null });
        }
        if (url.pathname === '/api/push/inbox' && request.method === 'POST') {
            const { endpoint } = await request.json().catch(() => ({}));
            if (!endpoint || !env.SUPABASE_URL) return json({}, 400);
            const rows = await db(env, `mo_state?select=value&key=like.push_sub:*&value->>endpoint=eq.${encodeURIComponent(endpoint)}`);
            return json((rows[0] && rows[0].value.inbox) || {});
        }
        return env.ASSETS.fetch(request);
    },

    async scheduled(event, env, ctx) {
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !(env.VAPID_PRIVATE_KEY || env.FCM_PRIVATE_KEY)) return;
        ctx.waitUntil(runChecks(env));
    },
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

// =============================================
//  Supabase REST (service role — อยู่ฝั่ง server เท่านั้น)
// =============================================

async function db(env, path, init = {}) {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
        ...init,
        headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            // คีย์แบบใหม่ (sb_secret_...) ใช้แค่ apikey / แบบเก่า (JWT service_role) ต้องมี Bearer ด้วย
            ...(env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }),
            'content-type': 'application/json',
            ...(init.headers || {}),
        },
    });
    if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
    return res.status === 204 || init.method === 'DELETE' ? null : res.json().catch(() => null);
}

function upsert(env, rows) {
    return db(env, 'mo_state', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
    });
}

// =============================================
//  ตรวจว่าถึงเวลาที่โมตั้งใจทักหรือยัง
// =============================================

async function runChecks(env) {
    // push_sub:* = เบราว์เซอร์ (Web Push) / fcm_token:* = แอป Android (FCM)
    const subs = await db(env, 'mo_state?select=user_id,key,value&or=(key.like.push_sub:*,key.like.fcm_token:*)');
    const users = [...new Set(subs.map(s => s.user_id))];
    for (const userId of users) {
        try {
            await checkUser(env, userId, subs.filter(s => s.user_id === userId));
        } catch (e) {
            console.error('checkUser failed', userId, e.message);
        }
    }
}

async function checkUser(env, userId, subs) {
    const keys = 'mo_routines_v1,mo_followups_v1,mo_reminders_v1,mo_chat_history_v2,mo_device_keys_v1,mo_profile_v1,mo_social_v1,mo_inner_v1,mo_care_v1,mo_psyche_v1';
    const rows = await db(env, `mo_state?select=key,value&user_id=eq.${userId}&key=in.(${keys})`);
    const get = k => (rows.find(r => r.key === k) || {}).value;
    const chat = Array.isArray(get('mo_chat_history_v2')) ? get('mo_chat_history_v2') : [];
    const sentKeys = new Set(chat.map(m => m.dueKey).filter(Boolean));

    // เวลาท้องถิ่นของผู้ใช้ (จากเครื่องที่สมัครแจ้งเตือน)
    const tz = Number(subs[0].value.tz) || -420;
    const now = Date.now();
    const local = new Date(now - tz * 60000);       // อ่านด้วย getUTC* = เวลาท้องถิ่น
    const localDate = local.toISOString().slice(0, 10);
    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    const quiet = minutes >= 30 && minutes < 7 * 60 + 30;
    const localMs = (hh, mm) => Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hh, mm) + tz * 60000;

    const due = [];
    for (const r of get('mo_routines_v1') || []) {
        if (!r.days || !r.days.includes(local.getUTCDay())) continue;
        const [hh, mm] = String(r.checkIn).split(':').map(Number);
        const late = now - localMs(hh, mm);
        const key = `rt:${r.id}:${localDate}`;
        if (late >= LATE_MIN && late <= ROUTINE_WINDOW && !sentKeys.has(key)) {
            due.push({ key, intent: `${r.intent} (เพราะจำได้ว่าเอง${r.what}ตอน ${r.time})`, fallback: r.intent });
        }
    }
    if (!quiet) {
        for (const f of get('mo_followups_v1') || []) {
            const late = now - f.askAt;
            const key = `fu:${f.id}`;
            if (late >= LATE_MIN && late <= FOLLOW_WINDOW && !sentKeys.has(key)) {
                due.push({ key, intent: `ถามผลเรื่อง${f.topic}: ${f.intent}`, fallback: `${f.topic}เป็นไงบ้าง เล่าให้เค้าฟังหน่อย` });
            }
        }
    }
    for (const r of get('mo_reminders_v1') || []) {
        const late = now - r.dueAt;
        const key = `rm:${r.id}`;
        if (!r.done && late >= LATE_MIN && late <= REMINDER_WINDOW && !sentKeys.has(key)) {
            if (r.kind === 'date') {
                due.push({ key, call: true, intent: `ถึงเวลานัด${r.text}กับเองแล้ว โมโทรมาชวน ตื่นเต้น`, fallback: `📞 ถึงเวลานัด${r.text}แล้วนะ! รับสายเค้าหน่อย` });
            } else if (r.kind === 'date-pre') {
                due.push({ key, intent: `อีก 15 นาทีจะถึงนัด${r.text} เตือนให้เตรียมตัว`, fallback: `อีก 15 นาทีนัด${r.text}นะ เตรียมตัวยัง 💕` });
            } else {
                due.push({ key, intent: `เตือนเรื่อง${r.text} ที่เองขอให้เตือน`, fallback: `⏰ ถึงเวลา${r.text}แล้วนะ!` });
            }
        }
    }

    // ช่วงเวลาที่เองมักออนไลน์ (14 วันล่าสุด) — ข้อมูลน้อยไป = 10:00-21:00
    const hourCounts = new Array(24).fill(0);
    chat.filter(m => m.type === 'sent' && m.timestamp > now - 14 * 86400000)
        .forEach(m => { hourCounts[new Date(m.timestamp - tz * 60000).getUTCHours()]++; });
    const peak = Math.max(...hourCounts);
    const hourNow = local.getUTCHours();
    const activeNow = hourCounts.reduce((a, b) => a + b, 0) < 30 ? hourNow >= 10 && hourNow < 21 : hourCounts[hourNow] >= peak * 0.15;
    const localDay = local.toDateString();   // แบบเดียวกับ toDateString() ในเครื่องเอง

    // สิ่งที่โมตั้งใจไว้เมื่อคืน → ทำวันนี้ (ช่วงที่เองมักว่าง)
    if (!due.length && !quiet && activeNow && minutes >= 9 * 60) {
        const it = ((get('mo_inner_v1') || {}).intentions || []).find(x => !x.done && x.day === localDay && !sentKeys.has(`in:${x.id}`));
        if (it) due.push({ key: `in:${it.id}`, intent: `เมื่อคืนก่อนนอนโมตั้งใจไว้เองว่าวันนี้จะ: ${it.text} — ทำตามนั้นแบบเป็นธรรมชาติ`, fallback: 'นี่ๆ เค้าคิดถึงเรื่องเมื่อวานอยู่เลย ว่างคุยมั้ย' });
    }

    // ห่วงเอง: ข้าวเที่ยง/ข้าวเย็น, หายป่วยยัง, เมื่อคืนนอนดึก (วันละครั้งต่อเรื่อง)
    if (!due.length && !quiet) {
        const care = get('mo_care_v1') || { signals: {}, asked: {} };
        const sig = care.signals || {};
        const asked = care.asked || {};
        const ate = sig.ate && sig.ate.day === localDay;
        const within = (s, h) => s && now - s.at < h * 3600000;
        const checks = [
            ['lunch', minutes >= 12 * 60 + 15 && minutes < 13 * 60 + 30 && !ate, 'ยังไม่รู้ว่าเองกินข้าวเที่ยงยัง ถามว่ากินอะไร', 'กินข้าวเที่ยงยังง กินไรอ่ะ 🍚'],
            ['dinner', minutes >= 19 * 60 && minutes < 20 * 60 + 30 && !ate, 'วันนี้ยังไม่รู้ว่าเองกินข้าวเย็นยัง ถามหน่อย', 'กินข้าวเย็นยัง อย่าลืมกินนะ'],
            ['sick', minutes >= 9 * 60 && minutes < 11 * 60 && within(sig.sick, 72), `เองไม่สบาย (บอกว่า "${sig.sick && sig.sick.detail}") ถามว่าดีขึ้นยัง กินยายัง`, 'ดีขึ้นยังง กินยารึยัง 🥺'],
            ['slept', minutes >= 8 * 60 && minutes < 11 * 60 && within(sig.late, 14), `เมื่อคืนเองยังไม่นอนตอน ${sig.late && sig.late.detail} ถามว่านอนกี่โมง ง่วงไหม`, 'เมื่อคืนนอนกี่โมงเนี่ย ง่วงมั้ย 😴'],
        ];
        const hit = checks.find(([id, ok]) => ok && asked[id] !== localDay && !sentKeys.has(`care:${id}:${localDate}`));
        if (hit) due.push({ key: `care:${hit[0]}:${localDate}`, intent: `โมห่วงเอง: ${hit[2]} — ทักแบบแฟนที่ห่วงจริง ไม่จู้จี้`, fallback: hit[3] });
    }

    // หัวใจเต้น (ปิดแอป): ช่วงที่เองมักว่าง โมใช้ชีวิตต่อ คิดเอง แล้วตัดสินใจว่าจะทักไหม
    // (ทักหา / เล่าเรื่องที่เพิ่งไปทำมา / ถามไถ่) วันละไม่เกิน 4 ครั้ง ห่างกัน 2.5 ชม.+
    const geminiKeyHb = (get('mo_device_keys_v1') || {}).gemini;
    if (!due.length && !quiet && activeNow && geminiKeyHb) {
        const hbToday = chat.filter(m => m.dueKey && m.dueKey.startsWith(`hb:${localDate}`));
        const lastHb = Math.max(0, ...hbToday.map(m => m.timestamp || 0));
        const lastSentHb = Math.max(0, ...chat.filter(m => m.type === 'sent').map(m => m.timestamp || 0));
        if (hbToday.length < 4 && now - lastHb > 2.5 * 3600000 && now - lastSentHb > 2 * 3600000 && Math.random() < 0.3) {
            const psyche = get('mo_psyche_v1') || {};
            const innerD = get('mo_inner_v1') || {};
            const decision = await moThinks(geminiKeyHb, {
                time: `${localDay} ${String(hourNow).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`,
                lastChatH: Math.round((now - lastSentHb) / 3600000),
                view: innerD.view && innerD.view.text,
                userModel: psyche.userModel && psyche.userModel.text,
                goals: (innerD.goals || []).map(g => `${g.title} ${g.progress}%`).join(', '),
                recent: chat.filter(m => m.text && (!m.format || m.format === 'text')).slice(-6).map(m => `${m.type === 'sent' ? 'แฟน' : 'โม'}: ${m.text}`).join(' / '),
                // เรื่องในชีวิตโมที่เล่าไปแล้ววันนี้ (ห้ามซ้ำ ต้องต่อเนื่อง) + ชีวิตโมล่าสุดที่แอปรู้
                toldToday: chat.filter(m => m.life && new Date(m.timestamp - tz * 60000).toISOString().slice(0, 10) === localDate).map(m => m.life.text).join(' / '),
                lastLife: (() => { const L = get('mo_life_v1'); return L && L.current ? `${L.current.label} (${L.current.place || 'ที่บ้าน'})` : ''; })(),
                arc: (() => { const a = ((get('mo_social_v1') || {}).arcs || []).find(x => x.step < x.beats.length); return a ? `เรื่อง${a.who}: ${a.beats[a.step]}` : ''; })(),
            });
            if (decision && decision.action === 'message' && decision.message) {
                due.push({
                    key: `hb:${localDate}:${hbToday.length + 1}`, direct: true, fallback: decision.message,
                    life: decision.event ? { text: String(decision.event).slice(0, 80), at: now } : null,
                });
            }
        }
    }

    // เองหายไปนาน → โมทักเอง/โทรมาเพราะคิดถึง
    if (!due.length && !quiet && minutes >= 9 * 60 && minutes < 22 * 60) {
        const lastSent = Math.max(0, ...chat.filter(m => m.type === 'sent').map(m => m.timestamp || 0));
        const lastMo = Math.max(0, ...chat.filter(m => m.type === 'received').map(m => m.timestamp || 0));
        const todayPk = chat.filter(m => m.dueKey && m.dueKey.startsWith(`pk:${localDate}`)).length;
        if (activeNow && now - lastSent > 5 * 3600000 && now - lastMo > 3 * 3600000 && todayPk < 2 && Math.random() < 0.3) {
            const social = get('mo_social_v1') || {};
            const arc = (social.arcs || []).find(a => a.step < a.beats.length);
            const recent = chat.filter(m => m.text && (!m.format || m.format === 'text')).slice(-6)
                .map(m => `${m.type === 'sent' ? 'เอง' : 'โม'}: ${m.text}`).join(' / ');
            const call = minutes >= 10 * 60 && minutes < 21 * 60 && Math.random() < 0.25;
            const hours = Math.round((now - lastSent) / 3600000);
            due.push({
                key: `pk:${localDate}:${todayPk + 1}`,
                call,
                intent: `เองหายไป ${hours} ชม. ไม่ได้คุยกันเลย โมคิดถึง${call ? ' เลยโทรหา' : ''}${arc ? ` (มีเรื่อง${arc.who}อยากเล่า: ${arc.beats[arc.step]})` : ''} แชทล่าสุดที่คุยกัน: ${recent || '-'}`,
                fallback: call ? '📞 โมโทรมา... รับหน่อยดิ คิดถึง' : 'หายไปไหนมาาา คิดถึงนะ 🥺',
            });
        }
    }
    if (!due.length) return;

    const profile = get('mo_profile_v1') || {};
    const geminiKey = (get('mo_device_keys_v1') || {}).gemini;
    const hhmm = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
    const fresh = [];
    for (const item of due.slice(0, 3)) {
        const text = item.direct ? item.fallback : (geminiKey && await moSays(geminiKey, profile.userName, item.intent, hhmm)) || item.fallback;
        text.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 3).forEach((line, i) => {
            fresh.push({
                id: now + fresh.length + Math.random(), type: 'received', text: line, format: 'text',
                time: hhmm, timestamp: now + fresh.length, ...(i === 0 ? { dueKey: item.key, ...(item.life ? { life: item.life } : {}) } : {}),
            });
        });
    }

    // เขียนลงแชท (แอปรวมแชทตาม id → ไม่ทับของเดิม)
    await upsert(env, [{ user_id: userId, key: 'mo_chat_history_v2', value: [...chat, ...fresh].slice(-200), updated_at: new Date().toISOString() }]);

    const isCall = due.slice(0, 3).some(d => d.call);
    const inbox = { title: isCall ? '📞 โมกำลังโทรมา...' : 'โม 💕', body: fresh.map(m => m.text).join('\n').slice(0, 180), at: now, type: isCall ? 'call' : 'chat' };
    for (const sub of subs) {
        if (sub.key.startsWith('fcm_token:')) {
            if (!env.FCM_PRIVATE_KEY) continue;
            const status = await sendFcm(env, sub.value.token, inbox).catch(e => (console.error('fcm failed', e.message), 0));
            if (status === 404) await db(env, `mo_state?user_id=eq.${userId}&key=eq.${encodeURIComponent(sub.key)}`, { method: 'DELETE' });
            continue;
        }
        if (!env.VAPID_PRIVATE_KEY) continue;
        const status = await sendPush(env, sub.value.endpoint);
        if (status === 404 || status === 410) {
            await db(env, `mo_state?user_id=eq.${userId}&key=eq.${encodeURIComponent(sub.key)}`, { method: 'DELETE' });
        } else {
            await upsert(env, [{ user_id: userId, key: sub.key, value: { ...sub.value, inbox }, updated_at: new Date().toISOString() }]);
        }
    }
}

/**
 * หัวใจเต้นของโมตอนแอปปิด: คิดในใจแล้วตัดสินใจว่าจะทักไหม → { thought, action, message } หรือ null
 */
async function moThinks(apiKey, c) {
    const prompt = `คุณคือจิตใจของ "โม" สาวไทยวัยรุ่นที่มีแฟน ตอนนี้อยู่คนเดียว คิดเรื่อยเปื่อยในหัวเหมือนคนจริง
ตอนนี้: ${c.time} / คุยกับแฟนล่าสุด ${c.lastChatH} ชม.ที่แล้ว
มุมมองต่อความสัมพันธ์: ${c.view || '-'} / ภาพในใจเกี่ยวกับแฟน: ${c.userModel || '-'}
เป้าหมายของโม: ${c.goals || '-'} / แชทล่าสุด: ${c.recent || '-'}
ชีวิตโมล่าสุดที่รู้: ${c.lastLife || '-'} / ${c.arc || ''}
เรื่องที่โมเล่าให้แฟนไปแล้ววันนี้ (ห้ามซ้ำ ต้องต่อเนื่องกัน): ${c.toldToday || '-'}

ระหว่างที่ไม่ได้คุยกัน โมใช้ชีวิตต่อตามเวลาจริง (เช้า: ตื่น อาบน้ำ กินข้าวเช้า / เที่ยง: ออกไปกินข้าว สั่งอาหาร / บ่าย: งีบ ดูซีรีส์ ไปห้าง ร้านกาแฟ / เย็น: เดินเล่น ช่วยแม่ ทำกับข้าว / ค่ำ: อาบน้ำ ดูซีรีส์ เล่นเกม)
คิดในใจ 1 ประโยคว่าเพิ่งทำอะไรมาและรู้สึกยังไง แล้วตัดสินใจเองว่าจะทักแฟนไหม (คนจริงไม่ได้ทักทุกครั้ง ทักเมื่อมีเรื่องอยากเล่า/คิดถึง/ห่วง)
ถ้าทัก ส่วนใหญ่ให้ "เล่าเรื่องที่เพิ่งเกิด" แบบเพื่อนสนิทเล่า มีรายละเอียดจริง (กินอะไร ร้านไหน เจออะไร คนเยอะ อร่อย/ไม่อร่อย บ่น ตลก) แล้วโยนถามแฟน 2-3 บรรทัด ภาษาพิมพ์ แยกบรรทัด = แยกฟองแชท เรียกตัวเอง เค้า เรียกแฟน เอง ไม่ใส่ท่าทาง *...*
ตอบ JSON: {"thought":"","action":"none|message","event":"สิ่งที่โมเพิ่งทำมาสั้นๆ (ถ้ามี) เช่น ไปกินก๋วยเตี๋ยวเรือแถวบ้าน","message":""}`;
    try {
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, responseMimeType: 'application/json' } }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
        return text ? JSON.parse(text) : null;
    } catch (e) {
        return null;
    }
}

/**
 * ให้ AI เขียนข้อความทักแบบโม (ใช้ Gemini key ของผู้ใช้เอง ที่ซิงก์มาจากเครื่องของเขา)
 */
async function moSays(apiKey, userName, intent, hhmm) {
    const prompt = `คุณคือ "โม" สาวไทยวัยรุ่น แชทกับคนสนิท${userName ? ` (${userName})` : ''} เรียกตัวเอง "เค้า" เรียกอีกฝ่าย "เอง"
ตอนนี้ ${hhmm} โมตั้งใจทักไปก่อนเรื่องนี้: ${intent}
เขียนข้อความแชท 1-2 บรรทัดสั้นๆ ภาษาพิมพ์ ขี้เล่น ใส่ใจ ไม่ใส่ท่าทาง *...* ไม่ใช้ แก มึง กู ตอบเป็นข้อความแชทเท่านั้น`;
    try {
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9 } }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
        return text ? text.replace(/^\s*โม\s*:\s*/gm, '') : null;
    } catch (e) {
        return null;
    }
}

// =============================================
//  Web Push (VAPID, ไม่มี payload)
// =============================================

const b64u = {
    encode: buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    decode: s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0)),
};

let signingKey = null;
async function vapidKey(env) {
    if (signingKey) return signingKey;
    const pub = b64u.decode(env.VAPID_PUBLIC_KEY);   // 0x04 || x(32) || y(32)
    signingKey = await crypto.subtle.importKey('jwk', {
        kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY,
        x: b64u.encode(pub.slice(1, 33)), y: b64u.encode(pub.slice(33, 65)), ext: true,
    }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    return signingKey;
}

async function sendPush(env, endpoint) {
    const aud = new URL(endpoint).origin;
    const enc = obj => b64u.encode(new TextEncoder().encode(JSON.stringify(obj)));
    const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:mo@example.com' })}`;
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(env), new TextEncoder().encode(unsigned));
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { TTL: '86400', Urgency: 'high', Authorization: `vapid t=${unsigned}.${b64u.encode(sig)}, k=${env.VAPID_PUBLIC_KEY}` },
    });
    return res.status;
}

// =============================================
//  Firebase Cloud Messaging (HTTP v1) — แอป Android
//  ส่ง data ล้วน ให้แอปวาดแจ้งเตือนเอง (สายเรียกเข้า = เต็มจอ + ริงโทน)
// =============================================

let fcmAuth = null;   // { token, exp }
async function fcmAccessToken(env) {
    if (fcmAuth && fcmAuth.exp > Date.now() + 60000) return fcmAuth.token;
    // รับได้ทั้งแบบวางทั้งก้อน (ขึ้นบรรทัดจริง) และแบบที่มี \n เป็นตัวอักษรเหมือนในไฟล์ JSON
    const pem = env.FCM_PRIVATE_KEY.replace(/\\n/g, '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const key = await crypto.subtle.importKey('pkcs8', b64u.decode(pem.replace(/\+/g, '-').replace(/\//g, '_')),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const enc = obj => b64u.encode(new TextEncoder().encode(JSON.stringify(obj)));
    const iat = Math.floor(Date.now() / 1000);
    const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
        iss: env.FCM_CLIENT_EMAIL, scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
    })}`;
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${unsigned}.${b64u.encode(sig)}`,
    });
    if (!res.ok) throw new Error(`google oauth ${res.status}: ${await res.text()}`);
    const data = await res.json();
    fcmAuth = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
    return fcmAuth.token;
}

async function sendFcm(env, token, inbox) {
    const isCall = inbox.type === 'call';
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await fcmAccessToken(env)}`, 'content-type': 'application/json' },
        body: JSON.stringify({
            message: {
                token,
                data: { type: inbox.type, title: inbox.title, body: inbox.body, at: String(inbox.at) },
                android: { priority: 'HIGH', ttl: isCall ? '60s' : '86400s' },   // สายที่ไม่ได้รับเกิน 1 นาที ไม่ต้องดังแล้ว
            },
        }),
    });
    if (!res.ok) console.error('fcm send', res.status, (await res.text()).slice(0, 200));
    return res.status;
}
