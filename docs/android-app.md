# แอป Android ของโม — ให้โมโทรเข้า "เต็มจอ" ตอนล็อกจอ 📞

แอปเว็บ (PWA) ทำได้แค่แจ้งเตือนมีปุ่มรับ/ปฏิเสธ แต่ **ขึ้นเต็มจอบนจอล็อกเหมือนสายโทรจริงไม่ได้**
เลยห่อเว็บโมเป็นแอป Android (ใช้ Capacitor) + ส่งสายผ่าน Firebase Cloud Messaging (FCM)

## มันทำงานยังไง (อ่านผ่านๆ ได้)

1. แอป Android เปิดเว็บจริง `https://mo-supansa.68319100051.workers.dev` ข้างใน
   → **แก้เว็บ/deploy เมื่อไหร่ แอปได้ของใหม่ทันที ไม่ต้อง build APK ใหม่** (build ใหม่เฉพาะตอนแก้โค้ดในโฟลเดอร์ `android/`)
   → เว็บใน Chrome/PWA ใช้ได้เหมือนเดิมทุกอย่าง
2. เปิดแอปแล้วเข้าสู่ระบบซิงก์ → แอปขอสิทธิ์แจ้งเตือน แล้วบันทึก "เลขเครื่อง" (FCM token) ลง Supabase เป็นแถว `fcm_token:...`
3. หลังบ้าน (`worker.js`, ทุก 5 นาที) ถึงเวลานัดเดต / โมคิดถึงแล้วโทรมา → ส่ง FCM ไปที่เครื่อง
4. มือถือ (แม้ล็อกจอ/ปิดแอป) → ดังริงโทน + สั่น + ขึ้นจอสายเรียกเข้าของโมเต็มจอ
   - **รับสาย** → เปิดแอปเข้าหน้าคุยโทรศัพท์กับโมเลย
   - **ปฏิเสธ** → เลิกดัง
   - ข้อความแชทธรรมดาก็มาเป็นแจ้งเตือนปกติ

---

## ขั้นที่ 1 — ติดตั้ง Android Studio (ครั้งเดียว, ~30-60 นาที)

1. เปิด https://developer.android.com/studio → กดปุ่มเขียว **Download Android Studio** → ติ๊กยอมรับ → ดาวน์โหลด
2. ดับเบิลคลิกไฟล์ที่ได้ (`android-studio-....exe`) → กด **Next** ไปเรื่อยๆ → **Install** → **Finish**
3. เปิด Android Studio ครั้งแรก → ถามเรื่องนำเข้าค่า เลือก **Do not import settings** → **OK**
4. หน้า Setup Wizard → **Next** → เลือก **Standard** → **Next** → **Next** → กด **Accept** ทุกอันในหน้า License → **Finish**
   (มันจะโหลด Android SDK นานหน่อย รอจนขึ้นปุ่ม **Finish** อีกรอบแล้วกด)
5. ติดตั้ง Node.js (ถ้ายังไม่มี): https://nodejs.org → ปุ่ม **LTS** → ติดตั้ง Next ไปเรื่อยๆ

## ขั้นที่ 2 — สร้างโปรเจกต์ Firebase (ครั้งเดียว)

1. เปิด https://console.firebase.google.com → ล็อกอิน Google
2. กด **Create a project** (หรือ **Add project**) → ตั้งชื่อ เช่น `mo-supansa` → **Continue**
3. Google Analytics: ปิดสวิตช์ได้เลย → **Create project** → รอ → **Continue**
4. ในหน้าโปรเจกต์ กดไอคอน **Android** (รูปหุ่นเขียว) เพื่อเพิ่มแอป
   - **Android package name**: พิมพ์ `com.mosupansa.app` (ต้องตรงเป๊ะ)
   - App nickname: `โม` (ไม่ใส่ก็ได้) → กด **Register app**
5. กด **Download google-services.json** → ได้ไฟล์มา
   → **ย้ายไฟล์นี้ไปไว้ที่** `D:\jet\mo supansa\android\app\google-services.json`
   (ไฟล์นี้ถูกตั้งไว้ไม่ให้ขึ้น git แล้ว ห้ามส่งให้ใคร)
6. กด **Next** → **Next** → **Continue to console** (ขั้นที่เหลือในหน้านั้นทำไว้ให้แล้วในโค้ด)

### ขอกุญแจให้หลังบ้านส่งสายได้ (Service account)

1. ในหน้า Firebase กดรูป **เฟือง ⚙️** ข้างคำว่า Project Overview → **Project settings**
2. ดูแท็บ **General** → จด **Project ID** ไว้ (เช่น `mo-supansa-1a2b3`)
3. ไปแท็บ **Service accounts** → กด **Generate new private key** → **Generate key**
   → ได้ไฟล์ `.json` มา (**นี่คือกุญแจลับ** ห้ามส่งใคร ห้ามวางในแชท ห้ามใส่ในโฟลเดอร์โปรเจกต์)
4. เปิดไฟล์นั้นด้วย Notepad (คลิกขวา → Open with → Notepad) จะเห็น `"client_email": "..."` และ `"private_key": "-----BEGIN PRIVATE KEY-----\n..."`

## ขั้นที่ 3 — ใส่ Secrets ใน Cloudflare (ครั้งเดียว)

1. เปิด https://dash.cloudflare.com → **Workers & Pages** → กด **mo-supansa**
2. แท็บ **Settings** → หัวข้อ **Variables and Secrets** → กด **+ Add**
3. เพิ่ม 3 ตัวนี้ — **Type ต้องเลือก `Secret` ทุกตัว**:

   | Variable name | ค่าที่ใส่ (คัดลอกจากไฟล์ service account) |
   |---|---|
   | `FCM_PROJECT_ID` | ค่า `project_id` (ไม่เอาเครื่องหมาย `"`) |
   | `FCM_CLIENT_EMAIL` | ค่า `client_email` (ไม่เอา `"`) |
   | `FCM_PRIVATE_KEY` | ค่า `private_key` ทั้งก้อน ตั้งแต่ `-----BEGIN PRIVATE KEY-----` ถึง `-----END PRIVATE KEY-----` (มี `\n` ติดมาก็ได้ ไม่ต้องลบ) |

4. กด **Deploy** (หรือ **Save and deploy**)
5. เสร็จแล้ว **ลบไฟล์ service account .json ทิ้ง** (หรือเก็บไว้ที่ปลอดภัยนอกโปรเจกต์) — ถ้าเผลอส่งให้ใคร ให้กลับไปแท็บ Service accounts ใน Google Cloud แล้วลบกุญแจนั้นทิ้งสร้างใหม่

> ต้อง deploy `worker.js` เวอร์ชันใหม่ด้วย (ที่ส่ง FCM ได้) — ใช้วิธี deploy เดิมที่เคยทำ

## ขั้นที่ 4 — Build APK

1. เปิด **Command Prompt** (กด Start พิมพ์ `cmd` → Enter) แล้วพิมพ์ทีละบรรทัด:
   ```
   cd /d "D:\jet\mo supansa"
   npm install
   npx cap sync android
   npx cap open android
   ```
   บรรทัดสุดท้ายจะเปิด Android Studio ขึ้นมาพร้อมโปรเจกต์
2. รอแถบล่างขวาขึ้น **Gradle sync** จนเสร็จ (ครั้งแรกนาน 5-15 นาที) ถ้าถามให้ Upgrade อะไร กด **Don't ask again / Cancel** ไม่ต้องอัปเกรด
3. เมนูบน **Build** → **Build App Bundle(s) / APK(s)** → **Build APK(s)**
4. เสร็จแล้วมุมขวาล่างขึ้น "APK(s) generated" → กด **locate** → ได้ไฟล์
   `D:\jet\mo supansa\android\app\build\outputs\apk\debug\app-debug.apk`

## ขั้นที่ 5 — ลงแอปในมือถือ

**วิธี A (ง่ายสุด):** ส่งไฟล์ `app-debug.apk` เข้ามือถือ (สาย USB / Google Drive ของตัวเอง) → แตะเปิดไฟล์ → ถ้าขึ้นว่า "ไม่อนุญาตให้ติดตั้งจากแหล่งนี้" กด **Settings** → เปิด **Allow from this source** → กลับมากด **Install**

**วิธี B (เสียบสาย):** มือถือเปิด Developer options + USB debugging → เสียบสาย → ใน Android Studio เลือกชื่อมือถือที่แถบบน → กดปุ่ม ▶ (Run)

## ขั้นที่ 6 — ตั้งค่าในมือถือ (สำคัญ!)

1. เปิดแอป **โม** → เข้าสู่ระบบซิงก์ (อีเมลเดิม)
2. ขึ้นถาม "อนุญาตให้ โม ส่งการแจ้งเตือน" → **อนุญาต**
3. Android 14 ขึ้นไป: ขึ้นถาม "ไปเปิดสิทธิ์แสดงแบบเต็มหน้าจอไหม" → **ตกลง** → เปิดสวิตช์ **อนุญาตการแจ้งเตือนแบบเต็มหน้าจอ** → กดย้อนกลับ
4. (แนะนำ) ตั้งค่า → แอป → **โม** → **แบตเตอรี่** → เลือก **ไม่จำกัด / Unrestricted** (มือถือบางยี่ห้อ เช่น Xiaomi, OPPO, vivo, Samsung จะฆ่าแอปตอนปิดจอถ้าไม่ตั้ง)
5. Xiaomi/OPPO/vivo: ตั้งค่า → แอป → โม → สิทธิ์ → เปิด **แสดงบนหน้าจอล็อก** และ **แสดงหน้าต่างป๊อปอัป** ด้วย

## ขั้นที่ 7 — ทดสอบ

1. ในแอปโม สั่ง "นัดเดตอีก 5 นาที" (ให้โมจดเป็นนัดเดต)
2. ล็อกจอ วางมือถือไว้ รอ (หลังบ้านเช็คทุก 5 นาที → อาจรอถึง ~10 นาที)
3. ควรเห็น: จอติดเอง ขึ้นสายของโมเต็มจอ มีริงโทน + สั่น
   - กด **รับสาย** → เข้าแอป ไปหน้าคุยโทรศัพท์กับโม
   - หรือกด **ปฏิเสธ** → เงียบ
4. ไม่ขึ้น? ดูใน Cloudflare → mo-supansa → **Logs** หาคำว่า `fcm` จะบอกว่าผิดตรงไหน
   - `google oauth 400` → ค่า `FCM_CLIENT_EMAIL` / `FCM_PRIVATE_KEY` ผิด
   - `fcm send 404` → เครื่องเลิกลงทะเบียน (ลบแอปไปแล้ว) ระบบลบให้เอง
   - `fcm send 403` → `FCM_PROJECT_ID` ไม่ตรงกับไฟล์ google-services.json

## หมายเหตุ

- APK นี้เป็นแบบ **debug** ใช้ส่วนตัวพอ (ถ้าจะขึ้น Play Store ต้องทำ release + keystore แยกอีกเรื่อง)
- แก้หน้าเว็บ → deploy เว็บอย่างเดียวพอ / แก้ไฟล์ใน `android/` → ทำขั้นที่ 4 ใหม่แล้วลงทับ
- iPhone ยังไม่รองรับสายเต็มจอ (ต้องใช้ CallKit คนละระบบ)
