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
    async fetch(request, env, ctx) {
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
        if (url.pathname.startsWith('/api/office/')) {
            return handleOffice(request, env, url, ctx).catch(err => json({ error: String(err.message || err).slice(0, 200) }, 500));
        }
        return env.ASSETS.fetch(request);
    },

    async scheduled(event, env, ctx) {
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !(env.VAPID_PRIVATE_KEY || env.FCM_PRIVATE_KEY)) return;
        ctx.waitUntil(runChecks(env));
        ctx.waitUntil(officeRun(env));   // ห้องทำงานโม: เช็ก Classroom ทุก 15 นาที
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

    // เองไม่โอเคแล้วเงียบไป → ตามด้วยความห่วง (เหมือนในแอป: 10 ทัก / 20 รัวๆ / 35 โทร / 60 ข้อความสุดท้าย)
    const down = ((get('mo_care_v1') || {}).signals || {}).down;
    const worry = worryStep(chat, down, now);
    if (worry) {
        const name = (get('mo_profile_v1') || {}).userName || 'เอง';
        const intent = {
            msg: 'เองดูไม่โอเคแล้วเงียบไป ทักไปถามเบาๆ ด้วยความห่วง',
            burst: 'เองดูไม่โอเคแล้วเงียบไปนาน ทักรัวๆ 3 บรรทัดสั้นๆ เพราะเป็นห่วงมาก',
            call: 'เองดูไม่โอเคแล้วเงียบไปนาน กำลังจะโทรตาม บอกสั้นๆ',
            final: 'เองเงียบไปนาน บอกว่าจะไม่กวนแล้ว แต่รออยู่ตรงนี้เสมอ ไม่กดดัน',
        }[worry.step];
        const context = chat.filter(m => m.text && (!m.format || m.format === 'text')).slice(-6).map(m => `${m.type === 'sent' ? 'เอง' : 'โม'}: ${m.text}`).join(' / ');
        due.push({ key: worry.key, intent: `${intent} — คิดเองจากบทสนทนา: ${context}`, fallback: worryLines(worry.step, name).join('\n'), call: worry.step === 'call', burst: worry.step === 'burst' });
    }
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
    // ช่วงที่ทักได้: 09:00-22:00 เสมอ + ชั่วโมงอื่นที่เองเคยออนไลน์บ่อย (ไม่เข้มจนไม่เคยได้ทัก)
    const activeNow = (hourNow >= 9 && hourNow < 22) || (peak > 0 && hourCounts[hourNow] >= peak * 0.3);
    const why = [];   // เหตุผลที่ทัก/ไม่ทักรอบนี้ → บันทึกไว้ดูใน "สถานะหลังบ้าน"
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
    if (quiet) why.push('ช่วงเวลานอน (00:30-07:30)');
    else if (!activeNow) why.push(`นอกช่วงที่เองมักออนไลน์ (${hourNow}:00)`);
    if (!geminiKeyHb) why.push('ไม่มี Gemini key ในบัญชี (เปิดแอปบนคอมที่มีไฟล์คีย์แล้วซิงก์)');
    const busySig = (((get('mo_care_v1') || {}).signals || {}).busy);
    const busyNow = busySig && now - busySig.at < 2 * 3600000;
    if (busyNow) why.push('เองบอกว่ายุ่งอยู่ → ไม่ทักกวน');
    if (!due.length && !quiet && activeNow && geminiKeyHb && !busyNow) {
        const hbToday = chat.filter(m => m.dueKey && m.dueKey.startsWith(`hb:${localDate}`));
        const lastHb = Math.max(0, ...hbToday.map(m => m.timestamp || 0));
        const lastSentHb = Math.max(0, ...chat.filter(m => m.type === 'sent').map(m => m.timestamp || 0));
        if (hbToday.length >= 4) why.push('หัวใจเต้น: ทักครบ 4 ครั้งวันนี้แล้ว');
        else if (now - lastHb < 2 * 3600000) why.push(`หัวใจเต้น: เพิ่งทักไปเมื่อ ${Math.round((now - lastHb) / 60000)} นาทีที่แล้ว`);
        else if (now - lastSentHb < 1.5 * 3600000) why.push(`หัวใจเต้น: เองเพิ่งคุยเมื่อ ${Math.round((now - lastSentHb) / 60000)} นาทีที่แล้ว`);
        if (hbToday.length < 4 && now - lastHb > 2 * 3600000 && now - lastSentHb > 1.5 * 3600000 && Math.random() < 0.5) {
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
            why.push(decision ? `หัวใจเต้น: โมคิดว่า "${String(decision.thought || '').slice(0, 60)}" → ${decision.action === 'message' ? 'ทัก' : 'ไม่ทัก'}` : 'หัวใจเต้น: เรียก AI ไม่สำเร็จ');
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
    // บันทึกผลรอบนี้ (แอปอ่านไปแสดงในรายงาน "สถานะหลังบ้าน")
    await upsert(env, [{ user_id: userId, key: 'worker_status', value: {
        at: now, local: `${String(hourNow).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`,
        sent: due.slice(0, 3).map(d => d.key.split(':')[0]), why: why.slice(0, 5), subs: subs.length,
    }, updated_at: new Date().toISOString() }]).catch(() => {});
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
    const isBurst = due.slice(0, 3).some(d => d.burst);
    const inbox = {
        title: isCall ? '📞 โมกำลังโทรมา...' : 'โม 💕', body: fresh.map(m => m.text).join('\n').slice(0, 180), at: now,
        type: isCall ? 'call' : isBurst ? 'burst' : 'chat', lines: fresh.map(m => m.text).slice(0, 4),
    };
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

/** ขั้นตามด้วยความห่วง — กติกาเดียวกับ MoCare.worryStep ในแอป */
function worryStep(messages, down, now) {
    if (!down || now - down.at > 4 * 3600000) return null;
    const firstMo = messages.find(m => m.type === 'received' && m.timestamp >= down.at - 1000);
    if (!firstMo || messages.some(m => m.type === 'sent' && m.timestamp > firstMo.timestamp)) return null;
    const mins = (now - firstMo.timestamp) / 60000;
    const sent = new Set(messages.map(m => m.dueKey).filter(Boolean));
    for (const [step, at] of [['final', 60], ['call', 35], ['burst', 20], ['msg', 10]]) {
        if (mins >= at) {
            const key = `sad:${down.at}:${step}`;
            return sent.has(key) ? null : { step, key };
        }
    }
    return null;
}

function worryLines(step, name) {
    const pick = a => a[Math.floor(Math.random() * a.length)];
    if (step === 'msg') return [pick([`${name} เป็นไรรึเปล่า เค้าอยู่ตรงนี้นะ`, 'เงียบไปเลย เค้าเป็นห่วงนะ 🥺', 'ไม่ต้องพิมพ์ยาวก็ได้ บอกเค้าหน่อยว่าโอเคมั้ย'])];
    if (step === 'burst') return [`${name}~`, pick(['ตอบเค้าหน่อยยย', 'อยู่มั้ยย']), pick(['เค้าเป็นห่วงจริงๆ นะ 🥺', 'แค่พิมพ์มาคำเดียวก็ได้ ว่ายังโอเคอยู่'])];
    if (step === 'call') return ['📞 เค้าโทรหานะ รับหน่อย... เป็นห่วงมาก'];
    return [pick(['ไม่ตอบก็ไม่เป็นไรนะ ไม่ต้องรีบ', 'เค้าจะไม่กวนแล้ว']), 'แต่พร้อมเมื่อไหร่ทักมานะ เค้ารออยู่ตรงนี้เสมอ 💗'];
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

ถ้าไม่ได้คุยกันเกิน 2 ชม. และมีเรื่องอยากเล่า/คิดถึง ส่วนใหญ่ควรทัก (แต่ไม่ต้องทุกครั้ง)
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
เขียนข้อความแชทสั้นๆ (1-3 บรรทัด แยกบรรทัด = แยกฟอง) ภาษาพิมพ์ ตามอารมณ์จริงในสถานการณ์นี้ คิดเองว่าจะพูดอะไร ไม่ใส่ท่าทาง *...* ไม่ใช้ แก มึง กู เธอ ตอบเป็นข้อความแชทเท่านั้น`;
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

// =============================================
//  ตัวช่วยที่ใช้ร่วมกัน: อ่าน/เขียนแถวของผู้ใช้, ลายเซ็น, โมรายงานเจ้าของ
// =============================================

async function stateGet(env, userId, key) {
    const rows = await db(env, `mo_state?select=value&user_id=eq.${userId}&key=eq.${key}`);
    return rows && rows[0] ? rows[0].value : null;
}

function statePut(env, userId, key, value) {
    return upsert(env, [{ user_id: userId, key, value, updated_at: new Date().toISOString() }]);
}

async function signText(env, text) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('mo-sign:' + env.SUPABASE_SERVICE_ROLE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return b64u.encode(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}

async function signedToken(env, payload) {
    const body = b64u.encode(new TextEncoder().encode(JSON.stringify(payload)));
    return `${body}.${await signText(env, body)}`;
}

/** โมรายงานเจ้าของ: เขียนข้อความลงแชทของเรา + เด้งแจ้งเตือนทุกเครื่องที่สมัครไว้ */
async function moNotify(env, userId, text, opts = {}) {
    const rows = await db(env, `mo_state?select=key,value&user_id=eq.${userId}&or=(key.eq.mo_chat_history_v2,key.like.push_sub:*,key.like.fcm_token:*)`);
    const chatRow = rows.find(r => r.key === 'mo_chat_history_v2');
    const chat = chatRow && Array.isArray(chatRow.value) ? chatRow.value : [];
    const subs = rows.filter(r => r.key !== 'mo_chat_history_v2');
    const now = Date.now();
    const tz = subs[0] ? Number(subs[0].value.tz) || -420 : -420;
    const local = new Date(now - tz * 60000);
    const hhmm = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
    const msg = { id: now + Math.random(), type: 'received', text, format: 'text', time: hhmm, timestamp: now, dueKey: `${opts.tag || 'mo'}:${now}` };
    await upsert(env, [{ user_id: userId, key: 'mo_chat_history_v2', value: [...chat, msg].slice(-200), updated_at: new Date().toISOString() }]);
    // call = เด้งเป็นสายเรียกเข้า (ห้องทำงาน: งานใหม่) / กลางคืน 22:00-07:00 ไม่โทร ส่งเป็นแชทแทน
    const night = local.getUTCHours() >= 22 || local.getUTCHours() < 7;
    const call = opts.call && !night;
    const inbox = { title: call ? '📞 โมโทรมารายงาน...' : 'โม 💕', body: text.slice(0, 180), at: now, type: call ? 'call' : 'chat', lines: text.split('\n').filter(Boolean).slice(0, 4) };
    for (const sub of subs) {
        if (sub.key.startsWith('fcm_token:')) {
            if (env.FCM_PRIVATE_KEY) await sendFcm(env, sub.value.token, inbox).catch(() => 0);
            continue;
        }
        if (!env.VAPID_PRIVATE_KEY) continue;
        await upsert(env, [{ user_id: userId, key: sub.key, value: { ...sub.value, inbox }, updated_at: new Date().toISOString() }]);
        await sendPush(env, sub.value.endpoint).catch(() => 0);
    }
}

// =============================================
//  ห้องทำงานโม 🏢 — ต่อโมกับแอปต่างๆ (ตอนนี้: Google Classroom)
//  - เจ้าของล็อกอิน Google ผ่านหลังบ้าน (OAuth) → เก็บ refresh token แบบเข้ารหัส (ถอดได้เฉพาะหลังบ้าน)
//  - ทุก 15 นาที (และเมื่อสั่ง) เช็กงาน/ประกาศใหม่ → AI สรุป → โมเขียนลงแชท + โทรมารายงาน
//  - ต้องตั้ง Cloudflare secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (ดู docs/office-setup.md)
// =============================================

const GOOGLE_SCOPES = [
    'openid', 'email',
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
    'https://www.googleapis.com/auth/classroom.announcements.readonly',
];
const OFFICE_EVERY_MS = 15 * 60000;

/** คำขอจากแอปเจ้าของ: ยืนยันด้วย session ของ Supabase (ไม่ใช่รหัสของขวัญ) */
async function officeUser(env, request) {
    const tok = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
    if (!tok) return null;
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: request.headers.get('x-sb-apikey') || env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${tok}` },
    });
    if (!res.ok) return null;
    const u = await res.json().catch(() => null);
    return u && u.id ? u : null;
}

async function officeKey(env) {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mo-office:' + env.SUPABASE_SERVICE_ROLE_KEY));
    return crypto.subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function officeSeal(env, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await officeKey(env), new TextEncoder().encode(text));
    return `${b64u.encode(iv)}.${b64u.encode(ct)}`;
}

async function officeUnseal(env, sealed) {
    const [iv, ct] = sealed.split('.');
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64u.decode(iv) }, await officeKey(env), b64u.decode(ct));
    return new TextDecoder().decode(pt);
}

async function officeVerify(env, raw) {
    const [body, sig] = String(raw || '').split('.');
    if (!body || !sig || sig !== await signText(env, body)) return null;
    try {
        const p = JSON.parse(new TextDecoder().decode(b64u.decode(body)));
        return p.exp > Date.now() ? p : null;
    } catch (e) {
        return null;
    }
}

async function googleAccess(env, userId, g) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
            refresh_token: await officeUnseal(env, g.rt), grant_type: 'refresh_token',
        }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) {
        // ถูกถอนสิทธิ์/หมดอายุ → ทำเครื่องหมาย + บอกเจ้าของครั้งเดียว
        if (j.error === 'invalid_grant' && !g.broken) {
            await statePut(env, userId, 'office_google', { ...g, broken: true });
            await moNotify(env, userId, '🏢 การเชื่อม Google Classroom หลุดแล้วนะ เข้าห้องทำงานโมแล้วกดเชื่อมใหม่ทีนึง', { tag: 'office' }).catch(() => {});
        }
        throw new Error(`google token ${res.status} ${j.error || ''}`);
    }
    return j.access_token;
}

function officeDue(w, tz) {
    if (!w.dueDate) return '';
    const d = w.dueDate, t = w.dueTime || {};
    const utc = Date.UTC(d.year, d.month - 1, d.day, t.hours || 0, t.minutes || 0);
    const local = new Date(utc - tz * 60000);
    const date = `${local.getUTCDate()}/${local.getUTCMonth() + 1}`;
    return w.dueTime ? `${date} ${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}` : date;
}

/** ให้ AI (Lite) อ่านงานแล้วสรุปแบบโม — ล้มเหลวก็ใช้ข้อความงานตรงๆ */
async function officeSummarize(apiKey, it) {
    const fallback = { summary: String(it.text || it.title).slice(0, 160), todo: '', size: '' };
    if (!apiKey) return fallback;
    const prompt = `คุณคือ "โม" ผู้ช่วยสาวที่สรุปงานใน Google Classroom ให้แฟน อ่านแล้วสรุปเป็นภาษาไทยกันเอง สั้น ชัด ไม่เวิ่น
วิชา: ${it.course}
ประเภท: ${it.kind === 'work' ? 'งานที่ต้องส่ง' : 'ประกาศ'}
หัวข้อ: ${it.title}
รายละเอียด: ${String(it.text || '-').slice(0, 2500)}
${it.due ? `กำหนดส่ง: ${it.due}` : ''}${it.materials && it.materials.length ? `\nไฟล์/ลิงก์แนบ: ${it.materials.join(', ')}` : ''}

ตอบ JSON เท่านั้น: {"summary":"งานนี้คืออะไร 1-2 ประโยค","todo":"ต้องทำอะไรบ้าง สั้นๆ (ไม่มีก็ว่าง)","size":"เล็ก|กลาง|ใหญ่ (ประเมินความยากเวลาที่ใช้)"}`;
    try {
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 400 } }),
            signal: AbortSignal.timeout(15000),
        });
        const j = await res.json();
        const out = JSON.parse(j.candidates[0].content.parts.map(p => p.text || '').join(''));
        return { summary: String(out.summary || fallback.summary).slice(0, 300), todo: String(out.todo || '').slice(0, 300), size: String(out.size || '').slice(0, 10) };
    } catch (e) {
        return fallback;
    }
}

/**
 * เช็ก Classroom: งาน/ประกาศที่ยังไม่เคยเห็น → สรุป → รายงาน
 * seed = ครั้งแรกหลังเชื่อม (จำของเดิมไว้ ไม่รายงานย้อนหลังทั้งหมด) / manual = เจ้าของสั่งเช็กเดี๋ยวนี้
 */
async function officeClassroom(env, userId, { seed = false, manual = false } = {}) {
    const g = await stateGet(env, userId, 'office_google');
    if (!g || g.broken) return { ok: false, reason: g ? 'broken' : 'not_connected' };
    const st = (await stateGet(env, userId, 'office_classroom')) || { seen: {}, lastCheck: 0 };
    const now = Date.now();
    if (!seed && !manual && now - (st.lastCheck || 0) < OFFICE_EVERY_MS) return { ok: true, skipped: true };
    const seeding = seed || !st.lastCheck;
    try {
        const access = await googleAccess(env, userId, g);
        const api = async path => {
            const r = await fetch(`https://classroom.googleapis.com/v1/${path}`, { headers: { Authorization: `Bearer ${access}` } });
            if (!r.ok) throw new Error(`classroom ${r.status}: ${(await r.text()).slice(0, 160)}`);
            return r.json();
        };
        const courses = (await api('courses?courseStates=ACTIVE&pageSize=30')).courses || [];
        const subs = await db(env, `mo_state?select=value&user_id=eq.${userId}&key=like.push_sub:*&limit=1`);
        const tz = subs[0] ? Number(subs[0].value.tz) || -420 : -420;
        const fresh = [];
        const consider = it => {
            if (st.seen[it.id]) return;
            st.seen[it.id] = now;
            if (!seeding) fresh.push(it);
        };
        for (const c of courses) {
            const [cw, an] = await Promise.all([
                api(`courses/${c.id}/courseWork?orderBy=updateTime%20desc&pageSize=10`).catch(() => ({})),
                api(`courses/${c.id}/announcements?orderBy=updateTime%20desc&pageSize=5`).catch(() => ({})),
            ]);
            for (const w of cw.courseWork || []) {
                consider({
                    kind: 'work', id: `w${w.id}`, course: c.name, title: w.title || 'งานใหม่', text: w.description || '',
                    due: officeDue(w, tz), link: w.alternateLink,
                    materials: (w.materials || []).map(m => (m.driveFile && m.driveFile.driveFile && m.driveFile.driveFile.title) || (m.link && m.link.title) || (m.youtubeVideo && m.youtubeVideo.title) || (m.form && m.form.title)).filter(Boolean),
                });
            }
            for (const a of an.announcements || []) {
                consider({ kind: 'post', id: `a${a.id}`, course: c.name, title: String(a.text || 'ประกาศใหม่').split('\n')[0].slice(0, 80), text: a.text || '', link: a.alternateLink });
            }
        }
        // จำแค่ 600 อันล่าสุด
        st.seen = Object.fromEntries(Object.entries(st.seen).sort((a, b) => b[1] - a[1]).slice(0, 600));

        const keys = (await stateGet(env, userId, 'mo_device_keys_v1')) || {};
        const reports = [];
        for (const it of fresh.slice(0, 6)) {
            const s = await officeSummarize(keys.gemini, it);
            reports.push({ id: it.id, app: 'classroom', kind: it.kind, course: it.course, title: it.title, due: it.due, link: it.link, ...s, at: now });
        }
        if (reports.length) {
            const old = (await stateGet(env, userId, 'office_reports')) || [];
            await statePut(env, userId, 'office_reports', [...reports, ...old].slice(0, 60));
            const works = reports.filter(r => r.kind === 'work');
            const lines = reports.map(r => `${r.kind === 'work' ? '📝' : '📢'} ${r.course}: ${r.title}${r.due ? ` (ส่ง ${r.due})` : ''}\n${r.summary}${r.todo ? `\n👉 ${r.todo}` : ''}`);
            const head = works.length ? `📚 เจ็ทๆ มีงานใหม่ใน Classroom ${works.length} งาน` : '📢 มีประกาศใหม่ใน Classroom';
            await moNotify(env, userId, `${head}\n\n${lines.join('\n\n')}`.slice(0, 1500), { tag: 'office', call: works.length > 0 });
        }
        if (reports.length) await db(env, `mo_state?user_id=eq.${userId}&key=eq.office_snapshot`, { method: 'DELETE' }).catch(() => {});
        Object.assign(st, { lastCheck: now, courses: courses.length, error: null, email: g.email });
        await statePut(env, userId, 'office_classroom', st);
        return { ok: true, courses: courses.length, fresh: reports, seeded: seeding };
    } catch (e) {
        Object.assign(st, { lastCheck: now, error: String(e.message || e).slice(0, 200) });
        await statePut(env, userId, 'office_classroom', st);
        return { ok: false, reason: 'error', error: st.error };
    }
}

/** รอบ cron: ทุกบัญชีที่ต่อ Google ไว้ */
async function officeRun(env) {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return;
    const rows = await db(env, 'mo_state?select=user_id&key=eq.office_google');
    for (const r of rows || []) {
        await officeClassroom(env, r.user_id).catch(e => console.error('office failed', r.user_id, e.message));
    }
}

async function handleOffice(request, env, url, ctx) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'ยังไม่ได้ตั้งค่าหลังบ้าน' }, 503);
    const route = url.pathname.slice('/api/office/'.length);
    const ready = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
    const redirectUri = `${url.origin}/api/office/google/callback`;

    // Google ส่งกลับมาหลังล็อกอิน (เบราว์เซอร์มาเอง ไม่มี header) → ยืนยันด้วย state ที่เราเซ็นไว้
    if (route === 'google/callback') {
        const state = await officeVerify(env, url.searchParams.get('state'));
        const code = url.searchParams.get('code');
        if (!state || state.p !== 'office' || !code) return Response.redirect(`${url.origin}/?office=failed`, 302);
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.refresh_token) return Response.redirect(`${url.origin}/?office=failed`, 302);
        let email = '';
        try { email = JSON.parse(new TextDecoder().decode(b64u.decode(j.id_token.split('.')[1]))).email || ''; } catch (e) {}
        await statePut(env, state.u, 'office_google', { rt: await officeSeal(env, j.refresh_token), email, at: Date.now(), scope: j.scope || '' });
        await statePut(env, state.u, 'office_classroom', { seen: {}, lastCheck: 0 });
        const first = officeClassroom(env, state.u, { seed: true }).then(r => r.ok && moNotify(env, state.u,
            `🏢 ต่อ Google Classroom เสร็จแล้ว! เจอ ${r.courses} วิชา\nต่อไปมีงานหรือประกาศใหม่ เค้าจะอ่านแล้วสรุปมาบอก (งานใหม่จะโทรมารายงานเลย 📞)`, { tag: 'office' }));
        ctx ? ctx.waitUntil(first) : await first;
        return Response.redirect(`${url.origin}/?office=connected`, 302);
    }

    const user = await officeUser(env, request);
    if (!user) return json({ error: 'ต้องล็อกอินซิงก์ก่อน' }, 401);

    if (route === 'status') {
        const [g, st, reports] = await Promise.all([
            stateGet(env, user.id, 'office_google'), stateGet(env, user.id, 'office_classroom'), stateGet(env, user.id, 'office_reports'),
        ]);
        return json({
            ready,
            google: g ? { connected: true, email: g.email, broken: Boolean(g.broken), at: g.at } : { connected: false },
            classroom: st ? { lastCheck: st.lastCheck, courses: st.courses || 0, error: st.error || null } : null,
            reports: (reports || []).slice(0, 30),
        });
    }

    if (!ready) return json({ error: 'ยังไม่ได้ตั้ง GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET ใน Cloudflare' }, 503);

    if (route === 'google/start' && request.method === 'POST') {
        const state = await signedToken(env, { u: user.id, p: 'office', exp: Date.now() + 10 * 60000 });
        const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        Object.entries({
            client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code',
            scope: GOOGLE_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
        }).forEach(([k, v]) => auth.searchParams.set(k, v));
        return json({ url: auth.toString() });
    }

    if (route === 'classroom/ask' && request.method === 'POST') {
        const { q } = await request.json().catch(() => ({}));
        return json(await officeAsk(env, user.id, q || 'มีงานอะไรค้างบ้าง'));
    }

    if (route === 'classroom/courses') {
        try {
            const data = await classroomSnapshot(env, user.id);
            return json({ ok: true, courses: data.map(c => ({ name: c.name, section: c.section, link: c.link, pending: c.works.filter(w => w.status.startsWith('ยังไม่ส่ง')).length })) });
        } catch (e) {
            return json({ ok: false, reason: e.reason || 'error', error: String(e.message || e).slice(0, 200) });
        }
    }

    if (route === 'classroom/check' && request.method === 'POST') {
        return json(await officeClassroom(env, user.id, { manual: true }));
    }

    if (route === 'google/disconnect' && request.method === 'POST') {
        const g = await stateGet(env, user.id, 'office_google');
        if (g && g.rt) {
            const rt = await officeUnseal(env, g.rt).catch(() => '');
            if (rt) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(rt)}`, { method: 'POST' }).catch(() => {});
        }
        for (const key of ['office_google', 'office_classroom', 'office_snapshot']) {
            await db(env, `mo_state?user_id=eq.${user.id}&key=eq.${key}`, { method: 'DELETE' });
        }
        return json({ ok: true });
    }

    return json({ error: 'ไม่พบ' }, 404);
}

/** สถานะการส่งของเรา (studentSubmissions.state) → ภาษาคน */
const OFFICE_SUB_STATE = {
    NEW: 'ยังไม่ส่ง', CREATED: 'ยังไม่ส่ง', RECLAIMED_BY_STUDENT: 'ดึงกลับมาแก้ ยังไม่ส่ง',
    TURNED_IN: 'ส่งแล้ว', RETURNED: 'ครูคืนงานแล้ว',
};

/**
 * ดึงข้อมูล Classroom สดๆ: วิชา / งาน + สถานะการส่งของเรา / ประกาศล่าสุด
 * เก็บแคชไว้ 3 นาที (ถามติดๆ กันไม่ต้องยิง Google ซ้ำ)
 */
async function classroomSnapshot(env, userId) {
    const cached = await stateGet(env, userId, 'office_snapshot');
    if (cached && Date.now() - cached.at < 3 * 60000) return cached.data;
    const g = await stateGet(env, userId, 'office_google');
    if (!g || g.broken) throw Object.assign(new Error(g ? 'broken' : 'not_connected'), { reason: g ? 'broken' : 'not_connected' });
    const access = await googleAccess(env, userId, g);
    const api = async path => {
        const r = await fetch(`https://classroom.googleapis.com/v1/${path}`, { headers: { Authorization: `Bearer ${access}` } });
        if (!r.ok) throw new Error(`classroom ${r.status}: ${(await r.text()).slice(0, 160)}`);
        return r.json();
    };
    const subs = await db(env, `mo_state?select=value&user_id=eq.${userId}&key=like.push_sub:*&limit=1`);
    const tz = subs[0] ? Number(subs[0].value.tz) || -420 : -420;
    const courses = ((await api('courses?courseStates=ACTIVE&pageSize=30')).courses || []).slice(0, 15);
    const data = await Promise.all(courses.map(async c => {
        const [cw, mine, an] = await Promise.all([
            api(`courses/${c.id}/courseWork?orderBy=updateTime%20desc&pageSize=15`).catch(() => ({})),
            api(`courses/${c.id}/courseWork/-/studentSubmissions?userId=me&pageSize=60`).catch(() => ({})),
            api(`courses/${c.id}/announcements?orderBy=updateTime%20desc&pageSize=4`).catch(() => ({})),
        ]);
        const subOf = Object.fromEntries((mine.studentSubmissions || []).map(s => [s.courseWorkId, s]));
        return {
            name: c.name, section: c.section || '', room: c.room || '', link: c.alternateLink,
            works: (cw.courseWork || []).map(w => {
                const s = subOf[w.id] || {};
                return {
                    title: w.title || '', type: w.workType === 'ASSIGNMENT' ? 'งาน' : w.workType === 'SHORT_ANSWER_QUESTION' ? 'คำถาม' : w.workType === 'MULTIPLE_CHOICE_QUESTION' ? 'ปรนัย' : 'งาน',
                    due: officeDue(w, tz), points: w.maxPoints || null,
                    status: OFFICE_SUB_STATE[s.state] || (s.state ? s.state : 'ไม่ทราบ'), late: Boolean(s.late),
                    grade: s.assignedGrade != null ? s.assignedGrade : null,
                    detail: String(w.description || '').slice(0, 220), link: w.alternateLink,
                };
            }),
            posts: (an.announcements || []).map(a => ({ text: String(a.text || '').slice(0, 240), at: String(a.updateTime || a.creationTime || '').slice(0, 10) })),
        };
    }));
    await statePut(env, userId, 'office_snapshot', { at: Date.now(), data });
    return data;
}

/** ถามโมเรื่อง Classroom → โมดูข้อมูลจริงแล้วตอบ (ไม่แต่ง) */
async function officeAsk(env, userId, question) {
    let data;
    try {
        data = await classroomSnapshot(env, userId);
    } catch (e) {
        if (e.reason) return { ok: false, reason: e.reason };
        return { ok: false, reason: 'error', error: String(e.message || e).slice(0, 200) };
    }
    const keys = (await stateGet(env, userId, 'mo_device_keys_v1')) || {};
    const subs = await db(env, `mo_state?select=value&user_id=eq.${userId}&key=like.push_sub:*&limit=1`);
    const tz = subs[0] ? Number(subs[0].value.tz) || -420 : -420;
    const local = new Date(Date.now() - tz * 60000);
    const today = `${local.getUTCDate()}/${local.getUTCMonth() + 1}/${local.getUTCFullYear()} ${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
    // ส่งให้ AI แบบย่อ: งานที่ส่งแล้ว/เก่า ตัดรายละเอียดออก ประหยัดโทเคน
    const compact = data.map(c => ({
        วิชา: c.name + (c.section ? ` (${c.section})` : ''),
        งาน: c.works.map(w => ({
            ชื่อ: w.title, ส่ง: w.due || '-', สถานะ: w.status + (w.late ? ' (เลยกำหนด)' : ''),
            ...(w.grade != null ? { คะแนน: `${w.grade}${w.points ? `/${w.points}` : ''}` } : w.points ? { คะแนนเต็ม: w.points } : {}),
            ...(w.status.startsWith('ยังไม่ส่ง') && w.detail ? { รายละเอียด: w.detail } : {}),
        })),
        ประกาศ: c.posts.slice(0, 3),
    }));
    const fallback = () => {
        const pending = data.flatMap(c => c.works.filter(w => w.status.startsWith('ยังไม่ส่ง')).map(w => `• ${c.name}: ${w.title}${w.due ? ` (ส่ง ${w.due})` : ''}`));
        return `มี ${data.length} วิชา: ${data.map(c => c.name).join(', ')}${pending.length ? `\nงานที่ยังไม่ส่ง:\n${pending.slice(0, 8).join('\n')}` : '\nไม่มีงานค้างเลย 🎉'}`;
    };
    if (!keys.gemini) return { ok: true, answer: fallback(), courses: data.length };
    const prompt = `คุณคือ "โม" แฟนสาวที่ช่วยเช็ก Google Classroom ให้ "เจ็ท" ตอบคำถามจากข้อมูลจริงข้างล่างเท่านั้น
ตอนนี้: ${today}
คำถามของเจ็ท: "${String(question).slice(0, 300)}"

ข้อมูล Classroom (สดจากระบบ):
${JSON.stringify(compact).slice(0, 24000)}

วิธีตอบ:
- ภาษาไทยกันเองแบบโม เรียกตัวเองว่า "เค้า" เรียกอีกฝ่ายว่า "เอง" สั้น ชัด อ่านง่ายในแชท
- ตอบให้ครบทุกส่วนที่ถาม (ถามว่ามีวิชาอะไร = บอกชื่อทุกวิชา, ถามหลายเรื่อง = ตอบทุกเรื่อง) งานที่ส่งแล้วไม่ต้องพูดถึงถ้าไม่ได้ถาม
- ตอบตรงคำถาม ถ้าหลายรายการให้ขึ้นบรรทัดละอัน ขึ้นต้นด้วย "•" เรียงตามกำหนดส่งที่ใกล้สุดก่อน
- บอกวันส่งเป็น "วันนี้/พรุ่งนี้/อีก N วัน" เทียบกับตอนนี้ งานเลยกำหนดที่ยังไม่ส่งให้เตือนชัดๆ
- ห้ามแต่งข้อมูลที่ไม่มี ถ้าหาไม่เจอให้บอกตรงๆ ว่าไม่เจอในวิชาที่มี
- ไม่เกิน 12 บรรทัด ไม่ใส่ markdown หัวข้อ/ตัวหนา`;
    try {
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': keys.gemini },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 700 } }),
            signal: AbortSignal.timeout(20000),
        });
        const j = await res.json();
        const answer = (j.candidates && j.candidates[0].content.parts.map(p => p.text || '').join('').trim()) || '';
        return { ok: true, answer: answer.replace(/\*\*/g, '') || fallback(), courses: data.length };
    } catch (e) {
        return { ok: true, answer: fallback(), courses: data.length };
    }
}
