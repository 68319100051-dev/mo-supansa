/* ============================================
   Mo Voice 🎙️ - อัดข้อความเสียงส่งให้โม
   - กดไมค์ = เริ่มอัด, กดอีกที = ส่ง (สูงสุด 60 วิ)
   - แปลงเป็น WAV 16kHz mono ก่อนส่ง (Gemini รับ WAV แน่นอน ทุกเบราว์เซอร์)
   - โมฟังเสียงจริง → จับน้ำเสียง/อารมณ์ได้ แล้วถอดความเก็บไว้ในแชท
   ============================================ */

const MoVoice = {
    maxSeconds: 60,
    recorder: null,
    chunks: [],
    startedAt: 0,

    supported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    },

    async start() {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.chunks = [];
        this.recorder = new MediaRecorder(stream);
        this.recorder.ondataavailable = e => e.data.size && this.chunks.push(e.data);
        this.recorder.start();
        this.startedAt = Date.now();
        this.autoStop = setTimeout(() => this.onAutoStop && this.onAutoStop(), this.maxSeconds * 1000);
    },

    /**
     * หยุดอัด → { blob: WAV, duration: วินาที } (สั้นกว่า 1 วิ → null)
     */
    stop() {
        clearTimeout(this.autoStop);
        const rec = this.recorder;
        this.recorder = null;
        if (!rec) return Promise.resolve(null);
        return new Promise(resolve => {
            rec.onstop = async () => {
                rec.stream.getTracks().forEach(t => t.stop());
                const duration = (Date.now() - this.startedAt) / 1000;
                if (duration < 1) return resolve(null);
                try {
                    const raw = new Blob(this.chunks, { type: rec.mimeType });
                    resolve({ blob: await this.toWav(raw), duration: Math.round(duration) });
                } catch (e) {
                    console.warn('voice convert failed', e);
                    resolve(null);
                }
            };
            rec.stop();
        });
    },

    cancel() {
        clearTimeout(this.autoStop);
        if (!this.recorder) return;
        this.recorder.onstop = () => this.recorder && this.recorder.stream.getTracks().forEach(t => t.stop());
        this.recorder.stream.getTracks().forEach(t => t.stop());
        this.recorder.stop();
        this.recorder = null;
    },

    async toWav(blob, rate = 16000) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
        ctx.close();
        const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
        const src = offline.createBufferSource();
        src.buffer = decoded;
        src.connect(offline.destination);
        src.start();
        const pcm = (await offline.startRendering()).getChannelData(0);

        const view = new DataView(new ArrayBuffer(44 + pcm.length * 2));
        const str = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
        str(0, 'RIFF'); view.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVEfmt ');
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
        view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, pcm.length * 2, true);
        for (let i = 0; i < pcm.length; i++) {
            const s = Math.max(-1, Math.min(1, pcm[i]));
            view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        }
        return new Blob([view.buffer], { type: 'audio/wav' });
    },

    blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(r.error);
            r.readAsDataURL(blob);
        });
    },
};

// Export
window.MoVoice = MoVoice;
