// สร้างคีย์ VAPID สำหรับ Push: node scripts/vapid-keys.mjs
// เอาค่าที่ได้ไปใส่ใน Cloudflare (VAPID_PRIVATE_KEY เป็นความลับ ห้าม commit / ห้ามส่งให้ใคร)
const { subtle } = globalThis.crypto;
const b64u = buf => Buffer.from(buf).toString('base64url');
const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = await subtle.exportKey('raw', pair.publicKey);
const jwk = await subtle.exportKey('jwk', pair.privateKey);
console.log(`VAPID_PUBLIC_KEY=${b64u(pub)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
