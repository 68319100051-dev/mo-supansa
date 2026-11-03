/* ============================================
   Mo Sync ☁️ - ซิงก์ข้อมูลโมผ่าน Supabase (มือถือ ↔ คอม เห็นโมคนเดียวกัน)
   - ดักการเขียน localStorage ของคีย์ที่ต้องซิงก์ → อัปขึ้นตาราง mo_state (หน่วงไว้รวบหลายครั้ง)
   - เปิดแอป/กลับมาที่แอป/ทุก 30 วิ → ดึงของล่าสุดลงมา
   - แชท: รวมของทุกเครื่อง (ไม่ทับกัน) / คีย์อื่น: ของที่บันทึกล่าสุดชนะ
   ต้องมี: supabase-js (UMD) + MO_KEYS.supabaseUrl / supabaseAnonKey ใน mo-keys.local.js
   ============================================ */

const MO_SYNC_KEYS = [
    'mo_chat_history_v2', 'mo_memory_v2', 'mo_stats_v2', 'mo_memory_settings_v2',
    'mo_life_v1', 'mo_mind_v1', 'mo_diary_v1', 'mo_reminders_v1',
    'mo_clips_v1', 'mo_clips_sent_v1', 'mo_special_days_v1',
];
const MO_CHAT_KEY = 'mo_chat_history_v2';
const MO_DELETED = { __deleted: true };

class MoSync {
    constructor() {
        const keys = window.MO_KEYS || {};
        this.client = keys.supabaseUrl && keys.supabaseAnonKey && window.supabase
            ? window.supabase.createClient(keys.supabaseUrl, keys.supabaseAnonKey)
            : null;
        this.metaKey = 'mo_sync_meta';
        this.meta = this.loadMeta();   // { key: เวลาที่เครื่องนี้แก้ล่าสุด (ms) }
        this.dirty = new Set();
        this.applying = false;
        this.user = null;
        this.status = this.client ? 'ยังไม่ได้เข้าสู่ระบบ' : 'ยังไม่ได้ตั้งค่า Supabase';
        this.lastSync = null;
        this.listeners = [];
        this.onRemoteChange = null;    // (changedKeys) => void — ตั้งจาก app.js
        if (this.client) this.patchStorage();
    }

    loadMeta() {
        try {
            return JSON.parse(localStorage.getItem(this.metaKey) || '{}');
        } catch (e) {
            return {};
        }
    }

    saveMeta() {
        this.applying = true;
        try { localStorage.setItem(this.metaKey, JSON.stringify(this.meta)); } catch (e) {}
        this.applying = false;
    }

    onStatus(fn) {
        this.listeners.push(fn);
    }

    setStatus(text) {
        this.status = text;
        this.listeners.forEach(fn => fn(text));
    }

    // =============================================
    //  ดักการเขียน localStorage
    // =============================================

    patchStorage() {
        const self = this;
        const origSet = Storage.prototype.setItem;
        const origRemove = Storage.prototype.removeItem;
        Storage.prototype.setItem = function (k, v) {
            origSet.call(this, k, v);
            if (this === window.localStorage && !self.applying && MO_SYNC_KEYS.includes(k)) self.markDirty(k);
        };
        Storage.prototype.removeItem = function (k) {
            origRemove.call(this, k);
            if (this === window.localStorage && !self.applying && MO_SYNC_KEYS.includes(k)) self.markDirty(k);
        };
    }

    markDirty(key) {
        this.meta[key] = Date.now();
        this.saveMeta();
        this.dirty.add(key);
        clearTimeout(this._pushTimer);
        this._pushTimer = setTimeout(() => this.push(), 3000);
    }

    // =============================================
    //  บัญชี
    // =============================================

    async start() {
        if (!this.client) return;
        const { data } = await this.client.auth.getSession();
        this.user = data.session ? data.session.user : null;
        this.client.auth.onAuthStateChange((event, session) => {
            const was = this.user && this.user.id;
            this.user = session ? session.user : null;
            if (this.user && this.user.id !== was) this.syncNow();
            if (!this.user) this.setStatus('ยังไม่ได้เข้าสู่ระบบ');
        });
        if (this.user) await this.syncNow();
        setInterval(() => { if (this.user && document.visibilityState === 'visible') this.pull(); }, 30000);
        document.addEventListener('visibilitychange', () => {
            if (this.user && document.visibilityState === 'visible') this.pull();
        });
    }

    async signIn(email, password) {
        const { error } = await this.client.auth.signInWithPassword({ email, password });
        if (error) throw error;
    }

    async signUp(email, password) {
        const { data, error } = await this.client.auth.signUp({ email, password });
        if (error) throw error;
        return Boolean(data.session); // false = ต้องยืนยันอีเมลก่อน
    }

    async signOut() {
        await this.push();
        await this.client.auth.signOut();
    }

    // =============================================
    //  อัปขึ้น / ดึงลง
    // =============================================

    readLocal(key) {
        const raw = localStorage.getItem(key);
        if (raw === null) return MO_DELETED;
        try {
            return JSON.parse(raw);
        } catch (e) {
            return raw;
        }
    }

    writeLocal(key, value) {
        this.applying = true;
        try {
            if (value && value.__deleted) localStorage.removeItem(key);
            else localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        } catch (e) {
            console.warn('sync: write local failed', key, e);
        }
        this.applying = false;
    }

    async push() {
        if (!this.user || !this.dirty.size) return;
        const keys = [...this.dirty];
        this.dirty.clear();
        const rows = keys.map(key => ({
            user_id: this.user.id,
            key,
            value: this.readLocal(key),
            updated_at: new Date(this.meta[key] || Date.now()).toISOString(),
        }));
        const { error } = await this.client.from('mo_state').upsert(rows);
        if (error) {
            keys.forEach(k => this.dirty.add(k));
            this.setStatus(`อัปโหลดไม่สำเร็จ: ${error.message}`);
            return;
        }
        this.lastSync = Date.now();
        this.setStatus('ซิงก์แล้ว ☁️');
    }

    /**
     * รวมแชทจากสองเครื่อง: เอาข้อความทั้งหมดที่ id ไม่ซ้ำ เรียงตามเวลา (เก็บ 200 ล่าสุดเหมือนเดิม)
     */
    mergeChat(local, remote) {
        const byId = new Map();
        [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])].forEach(m => {
            const prev = byId.get(String(m.id));
            // ข้อความเดียวกัน: เก็บอันที่มีข้อมูลมากกว่า (เช่นมีรีแอค/อ่านแล้ว)
            byId.set(String(m.id), prev ? { ...prev, ...m } : m);
        });
        return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-200);
    }

    async pull() {
        if (!this.user) return [];
        const { data, error } = await this.client.from('mo_state').select('key, value, updated_at');
        if (error) {
            this.setStatus(`ดึงข้อมูลไม่สำเร็จ: ${error.message}`);
            return [];
        }
        const changed = [];
        const remoteKeys = new Set();
        // ซิงก์ครั้งแรกของบัญชีนี้บนเครื่องนี้: ข้อมูลในเครื่องเพิ่งสร้างใหม่ ไม่ควรทับของจริงบนคลาวด์
        const firstSync = this.meta.__user !== this.user.id;
        for (const row of data) {
            if (!MO_SYNC_KEYS.includes(row.key)) continue;
            remoteKeys.add(row.key);
            const remoteTs = new Date(row.updated_at).getTime();
            const localTs = this.meta[row.key] || 0;

            if (row.key === MO_CHAT_KEY) {
                const local = this.readLocal(MO_CHAT_KEY);
                const merged = this.mergeChat(local.__deleted ? [] : local, row.value.__deleted ? [] : row.value);
                const localJson = JSON.stringify(local.__deleted ? [] : local);
                if (JSON.stringify(merged) !== localJson) {
                    this.writeLocal(MO_CHAT_KEY, merged);
                    changed.push(MO_CHAT_KEY);
                }
                // เครื่องนี้มีข้อความที่บนคลาวด์ยังไม่มี → อัปของที่รวมแล้วกลับขึ้นไป
                if (JSON.stringify(merged) !== JSON.stringify(row.value)) {
                    this.meta[MO_CHAT_KEY] = Date.now();
                    this.dirty.add(MO_CHAT_KEY);
                } else {
                    this.meta[MO_CHAT_KEY] = Math.max(localTs, remoteTs);
                }
                continue;
            }

            if (firstSync || remoteTs > localTs) {
                this.writeLocal(row.key, row.value);
                this.meta[row.key] = remoteTs;
                this.dirty.delete(row.key);
                changed.push(row.key);
            } else if (localTs > remoteTs) {
                this.dirty.add(row.key);
            }
        }
        // ข้อมูลที่มีในเครื่องแต่บนคลาวด์ยังไม่มี (ซิงก์ครั้งแรก) → อัปขึ้น
        for (const key of MO_SYNC_KEYS) {
            if (!remoteKeys.has(key) && localStorage.getItem(key) !== null) {
                if (!this.meta[key]) this.meta[key] = Date.now();
                this.dirty.add(key);
            }
        }
        this.meta.__user = this.user.id;
        this.saveMeta();
        if (changed.length && this.onRemoteChange) this.onRemoteChange(changed);
        await this.push();
        this.lastSync = Date.now();
        if (!this.status.startsWith('อัปโหลดไม่สำเร็จ')) this.setStatus('ซิงก์แล้ว ☁️');
        return changed;
    }

    async syncNow() {
        this.setStatus('กำลังซิงก์...');
        await this.pull();
        await this.drainMedia();
    }

    // =============================================
    //  ไฟล์เสียง/วิดีโอ (Supabase Storage: mo-media/<user_id>/<id>)
    // =============================================

    mediaPath(id) {
        return `${this.user.id}/${id}`;
    }

    pendingMedia() {
        try { return JSON.parse(localStorage.getItem('mo_media_pending') || '[]'); } catch (e) { return []; }
    }

    setPendingMedia(list) {
        this.applying = true;
        try { localStorage.setItem('mo_media_pending', JSON.stringify(list)); } catch (e) {}
        this.applying = false;
    }

    /** อัปไฟล์ขึ้นคลาวด์ — ยังไม่ล็อกอิน/อัปไม่ผ่านเก็บคิวไว้อัปทีหลัง */
    async uploadMedia(id, blob) {
        if (!this.client) return;
        if (!this.user) {
            this.setPendingMedia([...new Set([...this.pendingMedia(), id])]);
            return;
        }
        const { error } = await this.client.storage.from('mo-media')
            .upload(this.mediaPath(id), blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
        if (error) {
            console.warn('sync: media upload failed', id, error.message);
            this.setPendingMedia([...new Set([...this.pendingMedia(), id])]);
        }
    }

    /** ดาวน์โหลดไฟล์ที่เครื่องอื่นอัปไว้ (null ถ้าไม่มี) */
    async downloadMedia(id) {
        if (!this.client || !this.user) return null;
        const { data, error } = await this.client.storage.from('mo-media').download(this.mediaPath(id));
        return error ? null : data;
    }

    /** อัปไฟล์ที่ค้างคิว (สร้างตอนยังไม่ล็อกอิน) — ครั้งแรกของบัญชีนี้ สแกนไฟล์เก่าที่อยู่ในแชทด้วย */
    async drainMedia() {
        if (!this.user || !window.MoMediaStore) return;
        if (this.meta.__mediaScanned !== this.user.id) {
            let chat = [];
            try { chat = JSON.parse(localStorage.getItem(MO_CHAT_KEY) || '[]'); } catch (e) {}
            const ids = chat.map(m => m.extra && m.extra.mediaId).filter(Boolean);
            this.setPendingMedia([...new Set([...this.pendingMedia(), ...ids])]);
            this.meta.__mediaScanned = this.user.id;
            this.saveMeta();
        }
        const pending = this.pendingMedia();
        if (!pending.length) return;
        this.setPendingMedia([]);
        for (const id of pending) {
            const blob = await window.MoMediaStore.getLocal(id).catch(() => null);
            if (blob) await this.uploadMedia(id, blob);
        }
    }
}

window.MoSync = MoSync;
// สร้างทันทีที่โหลด เพื่อดักการเขียน localStorage ตั้งแต่ก่อนระบบอื่นเริ่มบันทึก
window.MoSyncInstance = new MoSync();
