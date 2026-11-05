# ตั้งค่าห้องทำงานโม 🏢 — ต่อ Google Classroom

โมเช็ก Classroom ที่หลังบ้าน (Cloudflare Worker) ทุก 15 นาที แม้ปิดแอป
เจองานใหม่ → อ่าน → สรุป → เขียนลงแชท + โทรมารายงาน (กลางคืน 22:00–07:00 ส่งเป็นแชทแทนโทร)

ต้องทำ **ครั้งเดียว** ตามนี้ (ประมาณ 10 นาที)

## 1. สร้าง OAuth client ใน Google Cloud

1. เข้า <https://console.cloud.google.com/> ด้วยบัญชี Google ส่วนตัว (ไม่ต้องเป็นบัญชีโรงเรียน)
2. สร้างโปรเจกต์ใหม่ เช่น `mo-office`
3. **APIs & Services → Library** → ค้น **Google Classroom API** → กด **Enable**
4. **APIs & Services → OAuth consent screen**
   - User type: **External**
   - ชื่อแอป: อะไรก็ได้ เช่น `Mo Office`, อีเมลติดต่อ: อีเมลตัวเอง
   - Scopes: ข้ามได้ (แอปขอเองตอนล็อกอิน)
   - **Test users:** เพิ่มอีเมลบัญชีที่ใช้ Classroom (เช่นบัญชีโรงเรียน)
   - กลับมาหน้า OAuth consent screen แล้วกด **Publish app** (ให้เป็น *In production*)
     ไม่งั้นการเชื่อมจะหลุดเองทุก 7 วัน — ตอนล็อกอินจะเจอหน้าเตือน "Google hasn't verified this app" ให้กด *Advanced → Go to Mo Office (unsafe)* ได้ เพราะเป็นแอปของเราเอง
5. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized redirect URIs:** ใส่
     ```
     https://mo-supansa.68319100051.workers.dev/api/office/google/callback
     ```
   - กด Create → ได้ **Client ID** กับ **Client secret**

## 2. ใส่ใน Cloudflare (ห้ามใส่ในโค้ด / ห้ามส่งในแชท)

ทางเว็บ: Cloudflare Dashboard → Workers & Pages → **mo-supansa** → Settings → Variables and Secrets → Add
- `GOOGLE_CLIENT_ID` (Secret) = Client ID
- `GOOGLE_CLIENT_SECRET` (Secret) = Client secret

หรือทางคอม (ในโฟลเดอร์โปรเจกต์):
```bash
npx wrangler secret put GOOGLE_CLIENT_ID
```
```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```
(มันจะถามค่า ให้วางแล้วกด Enter)

## 3. เชื่อมในแอป

แอปโม (ล็อกอินซิงก์แล้ว) → บ้านโม → **🏢 ห้องทำงานโม** → **🔗 เชื่อม Google Classroom** → ล็อกอินบัญชีที่ใช้ Classroom → อนุญาต

เสร็จแล้วโมจะทักว่า "ต่อ Google Classroom เสร็จแล้ว! เจอ N วิชา" — งานที่มีอยู่แล้วจะไม่รายงานย้อนหลัง รายงานเฉพาะของใหม่

## ใช้งาน

- พิมพ์ในแชท: **"เช็คคลาสรูมหน่อย"**, **"มีงานในคลาสรูมไหม"** → โมไปดูเดี๋ยวนั้นแล้วตอบ
- **"เข้าห้องทำงาน"** → เปิดห้องทำงาน
- ในห้องทำงาน: ดูรายงานล่าสุด / ให้โมเช็กตอนนี้ / ตัดการเชื่อม

## สิทธิ์ที่ขอ (อ่านอย่างเดียว)

| สิทธิ์ | ใช้ทำอะไร |
|---|---|
| `classroom.courses.readonly` | รายชื่อวิชา |
| `classroom.coursework.me.readonly` | งานที่ต้องส่ง (ของเราเอง) |
| `classroom.announcements.readonly` | ประกาศในวิชา |
| `openid`, `email` | รู้ว่าเชื่อมบัญชีไหน |

โมแก้ ส่ง หรือลบงานไม่ได้ — refresh token เก็บแบบเข้ารหัสใน Supabase ถอดได้เฉพาะหลังบ้าน

## ถ้าเชื่อมไม่ได้

- **"Access blocked / admin_policy_enforced"** — บัญชีโรงเรียนบางแห่งปิดไม่ให้แอปภายนอกเข้าถึง ต้องขอแอดมินโรงเรียน (หรือใช้บัญชีส่วนตัวที่เข้า Classroom ได้)
- **กลับมาแล้วขึ้น "เชื่อมต่อไม่สำเร็จ"** — เช็ก redirect URI ให้ตรงทุกตัวอักษร และกด Publish app แล้ว
- **เคยเชื่อมแล้วหลุด** — โมจะทักบอกเอง กดเชื่อมใหม่ในห้องทำงาน
