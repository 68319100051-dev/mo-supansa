/* ============================================
   Mo Service Worker 📲 - ให้ติดตั้งเป็นแอป & เปิดได้ตอนเน็ตหลุด
   - ไฟล์ของแอป: ดึงจากเน็ตก่อน (แก้โค้ดแล้วเห็นทันที) ไม่มีเน็ต → ใช้ของที่เก็บไว้
   - ไม่แตะ API ภายนอก (Gemini / Groq / Supabase) และไม่เก็บ mo-keys.local.js
   - Push จากหลังบ้าน (ไม่มี payload) → ถาม /api/push/inbox ว่าโมพูดอะไร แล้วเด้งแจ้งเตือน
   ============================================ */

const CACHE = 'mo-app-v11';
const SHELL = [
    './', 'index.html', 'style.css', 'manifest.json', 'mo_avatar.jpg', 'icons/icon-192.png', 'icons/icon-512.png',
    'mo-config.js', 'mo-sync.js', 'mo-llm.js', 'mo-brain.js', 'mo-brain3d.js', 'mo-memory.js', 'mo-chat.js',
    'mo-call.js', 'mo-reels.js', 'mo-life.js', 'mo-house-view.js', 'mo-extras.js', 'mo-mind.js', 'mo-mind-ui.js', 'mo-reminders.js',
    'mo-routines.js', 'mo-self.js', 'mo-status.js', 'mo-voice.js', 'mo-stories.js', 'mo-games.js', 'mo-recall.js', 'mo-social.js', 'mo-care.js', 'mo-inner.js',
    'mo-diary.js', 'app.js',
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('mo-keys.local.js')) return;
    event.respondWith(
        // no-cache = ถามเซิร์ฟเวอร์ทุกครั้งว่าไฟล์เปลี่ยนไหม (ไม่ใช้ของเก่าใน HTTP cache)
        // (ใช้ URL แทน Request เพราะ request แบบ navigate ใส่ cache option ไม่ได้)
        fetch(event.request.url, { cache: 'no-cache' })
            .then(res => {
                if (res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE).then(cache => cache.put(event.request, copy));
                }
                return res;
            })
            .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
});

self.addEventListener('push', (event) => {
    event.waitUntil((async () => {
        let msg = {};
        try {
            const sub = await self.registration.pushManager.getSubscription();
            const res = await fetch('/api/push/inbox', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ endpoint: sub && sub.endpoint }),
            });
            msg = await res.json();
        } catch (e) {}
        // โมโทรมา → แจ้งเตือนแบบสายเรียกเข้า: ค้างไว้ สั่นยาว มีปุ่มรับ/ปฏิเสธ
        if (msg.type === 'call') {
            await self.registration.showNotification('📞 โมกำลังโทรมา...', {
                body: msg.body || 'แตะเพื่อรับสาย',
                icon: 'icons/icon-192.png',
                badge: 'icons/icon-192.png',
                tag: 'mo-call',
                renotify: true,
                requireInteraction: true,
                vibrate: [600, 300, 600, 300, 600, 300, 600, 300, 600],
                actions: [{ action: 'answer', title: '📞 รับสาย' }, { action: 'decline', title: '❌ ปฏิเสธ' }],
                data: { type: 'call' },
            });
            return;
        }
        await self.registration.showNotification(msg.title || 'โม 💕', {
            body: msg.body || 'โมทักมา~ เปิดดูหน่อยสิ',
            icon: 'icons/icon-192.png',
            badge: 'icons/icon-192.png',
            tag: 'mo-chat',
            renotify: true,
            vibrate: [120, 60, 120],
        });
    })());
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const isCall = event.notification.data && event.notification.data.type === 'call';
    if (isCall && event.action === 'decline') return;
    event.waitUntil((async () => {
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        // สายจากโม → เปิดแอปเข้าหน้าสายเรียกเข้า (กดรับสาย = รับเลย)
        if (wins.length) {
            if (isCall) wins[0].postMessage({ type: 'mo-call', answer: event.action === 'answer' });
            return wins[0].focus();
        }
        return self.clients.openWindow(isCall ? `./?call=${event.action === 'answer' ? 'answer' : 'ring'}` : './');
    })());
});
