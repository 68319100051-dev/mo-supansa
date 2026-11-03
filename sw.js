/* ============================================
   Mo Service Worker 📲 - ให้ติดตั้งเป็นแอป & เปิดได้ตอนเน็ตหลุด
   - ไฟล์ของแอป: ดึงจากเน็ตก่อน (แก้โค้ดแล้วเห็นทันที) ไม่มีเน็ต → ใช้ของที่เก็บไว้
   - ไม่แตะ API ภายนอก (Gemini / Groq / Supabase) และไม่เก็บ mo-keys.local.js
   ============================================ */

const CACHE = 'mo-app-v1';
const SHELL = [
    './', 'index.html', 'style.css', 'manifest.json', 'mo_avatar.jpg', 'icons/icon-192.png', 'icons/icon-512.png',
    'mo-config.js', 'mo-sync.js', 'mo-llm.js', 'mo-brain.js', 'mo-brain3d.js', 'mo-memory.js', 'mo-chat.js',
    'mo-call.js', 'mo-reels.js', 'mo-life.js', 'mo-mind.js', 'mo-mind-ui.js', 'mo-reminders.js',
    'mo-routines.js', 'mo-self.js', 'mo-status.js', 'mo-diary.js', 'app.js',
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
        fetch(event.request)
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
