/* ============================================
   Mo Status 🩺 - โมเช็คระบบหลังบ้านของตัวเอง
   - เองถาม "สถานะหลังบ้านเป็นไง" / "เช็คระบบหน่อย" → โมไล่เช็คแล้วรายงานทีละข้อ
   - เช็คจริง: ping Gemini / Groq (ดูรายชื่อ model ไม่กิน token), Supabase, สภาพอากาศ
   - ไม่ใช้ AI ตอบ → รายงานได้แม้ AI ล่มทุกเจ้า
   - ไม่แสดง API key ในรายงาน
   ============================================ */

const MoStatus = {
    isAsking(text) {
        return /สถานะ\s*(?:หลังบ้าน|ระบบ|เซิร์ฟ|api)|หลังบ้าน\s*(?:เป็นไง|โอเค|ปกติ|ยัง)|เช็ค\s*(?:ระบบ|หลังบ้าน|api|เซิร์ฟ)|ระบบ\s*(?:เป็นไง|โอเคมั้ย|โอเคไหม|ปกติมั้ย|ปกติไหม)|system\s*status/i.test(text);
    },

    async timed(fn) {
        const t0 = performance.now();
        try {
            const detail = await fn();
            return { ok: true, ms: Math.round(performance.now() - t0), detail };
        } catch (e) {
            return { ok: false, ms: Math.round(performance.now() - t0), detail: e.message };
        }
    },

    async pingGemini(llm) {
        const key = llm.config.apiKey && llm.config.apiKey.trim();
        if (!key || llm.config.provider === 'openai') return null;
        return this.timed(async () => {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${llm.liteModel}`, {
                headers: { 'x-goog-api-key': key },
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return llm.liteModel;
        });
    },

    async pingGroq() {
        const key = window.MO_KEYS && window.MO_KEYS.groq;
        if (!key) return null;
        return this.timed(async () => {
            const res = await fetch('https://api.groq.com/openai/v1/models', {
                headers: { Authorization: `Bearer ${key}` },
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return 'models ok';
        });
    },

    async pingSupabase(sync) {
        if (!sync || !sync.client) return null;
        if (!sync.user) return { ok: null, detail: 'ยังไม่ได้เข้าสู่ระบบ (ใช้เครื่องเดียวอยู่)' };
        return this.timed(async () => {
            const { error } = await sync.client.from('mo_state').select('key').limit(1);
            if (error) throw new Error(error.message);
            return sync.status;
        });
    },

    storageKB() {
        let bytes = 0;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                bytes += (k.length + (localStorage.getItem(k) || '').length) * 2;
            }
        } catch (e) {}
        return Math.round(bytes / 1024);
    },

    ago(ts) {
        if (!ts) return 'ยังไม่เคย';
        const m = Math.round((Date.now() - ts) / 60000);
        return m < 1 ? 'เมื่อกี้' : m < 60 ? `${m} นาทีที่แล้ว` : `${Math.round(m / 60)} ชม.ที่แล้ว`;
    },

    /**
     * ไล่เช็คทุกระบบ → ข้อความรายงานทีละบรรทัด (1 บรรทัด = 1 ฟองแชท)
     */
    async report({ llm, sync, memory, routines, reminders, self }) {
        const [gemini, groq, supa] = await Promise.all([this.pingGemini(llm), this.pingGroq(), this.pingSupabase(sync)]);
        const mark = r => (r.ok === null ? '⚪' : r.ok ? '✅' : '❌');
        const lines = ['โอเค เดี๋ยวเค้าไล่เช็คให้นะ 🩺'];

        const ai = [];
        if (gemini) ai.push(`${mark(gemini)} Gemini ${gemini.ok ? `${gemini.ms}ms` : `ล่ม (${gemini.detail})`}`);
        else ai.push('⚪ Gemini ยังไม่ได้ใส่ key');
        if (groq) ai.push(`${mark(groq)} Groq ${groq.ok ? `${groq.ms}ms` : `ล่ม (${groq.detail})`}`);
        else ai.push('⚪ Groq ยังไม่ได้ใส่ key');
        const cooling = Object.entries(llm.cooldowns || {}).filter(([, s]) => s.until > Date.now()).map(([n]) => n.split(':')[0]);
        lines.push(`🧠 สมอง AI\n${ai.join('\n')}${cooling.length ? `\n⏳ พักอยู่: ${cooling.join(', ')}` : ''}${llm.lastProvider ? `\nตอบล่าสุดด้วย ${llm.lastProvider}` : ''}`);

        if (!supa) lines.push('☁️ ซิงก์: ⚪ ยังไม่ได้ตั้งค่า Supabase (ใช้เครื่องเดียว)');
        else lines.push(`☁️ ซิงก์: ${mark(supa)} ${supa.ok ? `${supa.ms}ms · ${supa.detail}` : supa.detail} · ซิงก์ล่าสุด ${this.ago(sync.lastSync)}`);

        const w = window.MoWeather && window.MoWeather.describe();
        lines.push(`🌤️ สภาพอากาศ: ${w ? `✅ ${w}` : '❌ ยังดึงไม่ได้'}`);

        const facts = (memory.data.longTerm.aiFacts || []).length;
        const kb = this.storageKB();
        lines.push(`💾 ความจำ: ${facts} เรื่องเกี่ยวกับเอง · ${self ? self.data.opinions.length : 0} เรื่องของเค้า · ${self ? self.data.jokes.length : 0} มุกของเรา\nพื้นที่ในเครื่อง ${kb} KB${kb > 4000 ? ' ⚠️ ใกล้เต็มแล้ว (ประมาณ 5MB)' : ''}`);

        const usage = Object.entries(llm.usageToday ? llm.usageToday() : {});
        if (usage.length) {
            const total = usage.reduce((n, [, u]) => n + u.calls, 0);
            lines.push(`📊 ใช้ AI วันนี้ (เครื่องนี้) ${total} ครั้ง\n${usage.map(([name, u]) => `• ${name}: ${u.calls} ครั้ง${u.tokens ? ` · ~${Math.round(u.tokens / 1000)}k token` : ''}`).join('\n')}`);
        }
        // หลังบ้าน (ปิดแอปแล้วโมทักได้ไหม): อ่านบันทึกล่าสุดจาก worker
        if (sync && sync.client && sync.user) {
            try {
                const { data } = await sync.client.from('mo_state').select('value').eq('user_id', sync.user.id).eq('key', 'worker_status').maybeSingle();
                const w = data && data.value;
                if (!w) lines.push('📡 หลังบ้านทักตอนปิดแอป: ❌ ยังไม่เคยทำงาน (ยังไม่ได้กด 🔔 เปิดแจ้งเตือน หรือ Cloudflare ยังไม่ได้ตั้ง Secrets)');
                else {
                    const ago = Math.round((Date.now() - w.at) / 60000);
                    lines.push(`📡 หลังบ้านทักตอนปิดแอป: ${ago <= 10 ? '✅' : '⚠️'} เช็คล่าสุด ${ago} นาทีที่แล้ว (${w.local}) · เครื่องรับแจ้งเตือน ${w.subs} เครื่อง${w.sent && w.sent.length ? `
รอบนั้นส่ง: ${w.sent.join(', ')}` : ''}${w.why && w.why.length ? `
เหตุผล: ${w.why.join(' / ')}` : ''}`);
                }
            } catch (e) {}
            // แอคเคานต์ของขวัญ: เขาเข้ามาแล้วหรือยัง
            try {
                const { data } = await sync.client.from('mo_state').select('key,value').eq('user_id', sync.user.id).in('key', ['mo_gift_v1', 'gift_visits']);
                const get = k => ((data || []).find(r => r.key === k) || {}).value;
                const gift = get('mo_gift_v1'), v = get('gift_visits');
                const when = ts => new Date(ts).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                if (gift) lines.push(`💌 แอคเคานต์ของขวัญ: ${!v || !v.count ? 'เขายังไม่เคยเข้ามา' : `เข้ามาแล้ว ${v.count} ครั้ง (แรก ${when(v.first)} · ล่าสุด ${when(v.last)})${v.letterDone ? ' · อ่านจดหมายจบแล้ว ✅' : ''}${v.messages ? ` · คุยไป ${v.messages}/${gift.chatLimit || 10} ข้อความ` : ''}`}`);
            } catch (e) {}
        }
        lines.push(`⏰ งานที่รออยู่: เตือน ${reminders.getPending().length} · กิจวัตร ${routines.routines.length} · รอถามผล ${routines.followUps.length}`);

        const bad = [gemini, groq, supa].filter(r => r && r.ok === false).length;
        const noAI = !(gemini && gemini.ok) && !(groq && groq.ok);
        lines.push(noAI
            ? 'สรุปคือ สมองเค้าติดต่อไม่ได้เลย ตอนนี้ตอบได้แค่แบบออฟไลน์นะ 🥺'
            : bad
                ? `สรุปคือ มีพังอยู่ ${bad} อย่าง แต่ยังคุยกันได้ปกติ`
                : 'สรุปคือ ทุกอย่างปกติดี เค้าแข็งแรง 💪');
        return lines;
    },
};

// Export
window.MoStatus = MoStatus;
