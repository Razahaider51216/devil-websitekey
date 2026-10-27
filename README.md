# DEVIL KEY

Production now uses **Turso/libSQL** on the existing Cloudflare Worker. Existing keys, expiry, revocations and HWID bindings were preserved. See [migration notes](TURSO-MIGRATION.md); D1 setup below remains available for local development.

เว็บรับคีย์ DEVIL HUB ธีมดำ–แดง พร้อม 4 ขั้นตอนและหลังบ้านแอดมิน

**เปิดบน Cloudflare:** ดู [คู่มือ Cloudflare Workers + D1](CLOUDFLARE.md) มีคำสั่ง build/deploy และรายการ Variables/Secrets ครบ

## เริ่มใช้งาน

ต้องใช้ Node.js 22.13 ขึ้นไป

1. รัน `npm ci`
2. คัดลอก `.env.example` เป็น `.env` แล้วกำหนดค่า รหัสแอดมินสุ่มอย่างน้อย 24 ตัว และ KEY_SECRET อย่างน้อย 32 ตัว
3. ตั้ง ADMIN_ACCESS_KEY และ KEY_SECRET แล้วแก้ลิงก์ภายหลังในหน้า `/admin` ได้ (ค่าลิงก์ใน `.env` เป็นค่าเริ่มต้นก่อนบันทึกหลังบ้านครั้งแรก)
4. รัน `npm run build`
5. ลง migration ฐานข้อมูล local: `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config dist/server/wrangler.json --persist-to .wrangler/state`
6. รัน `npm start -- --port 5184` แล้วเปิด http://127.0.0.1:5184

หลังบ้านอยู่ `/admin` ต้องล็อกอิน Discord ด้วย User ID ที่อยู่ใน `DISCORD_ADMIN_USER_IDS` แล้วใส่ `ADMIN_ACCESS_KEY` อีกครั้ง ผู้ใช้ทั่วไปไม่เห็นเมนู ADMIN และ API ปฏิเสธสิทธิ์ด้วย ฐานข้อมูล production ใช้ Turso; local ใช้ D1

## Discord Login และสิทธิ์แอดมิน

ตั้ง Runtime Variables/Secrets ใน Cloudflare Worker:

- `DISCORD_CLIENT_ID`: Application ID จาก Discord Developer Portal
- `DISCORD_CLIENT_SECRET`: Client Secret (ชนิด Secret)
- `DISCORD_ADMIN_USER_IDS`: Discord User ID ของแอดมิน คั่นหลายคนด้วยจุลภาค เช่น `123456789012345678,223456789012345678` ห้ามใส่ชื่อผู้ใช้ ไม่มี ID ที่ตรงหมายถึงไม่มีสิทธิ์หลังบ้าน
- `TURNSTILE_SITE_KEY` และ `TURNSTILE_SECRET_KEY`: Widget ที่อนุญาต hostname ของเว็บจริง
- `ADMIN_ACCESS_KEY`: รหัสผ่านแอดมินเดิม ไม่ต้องเปลี่ยน
- `KEY_SECRET`: เก็บค่าเดิมไว้ เพื่อให้คีย์และ HWID เดิมยังใช้ได้

ตั้ง Discord OAuth2 Redirect URI เป็น `https://devil-websitekey.waeeccvv.workers.dev/api/auth/discord/callback` ใช้ scope `identify` เท่านั้น ไม่มีการขอสิทธิ์บอทหรือจัดการเซิร์ฟเวอร์

production เปิด `DISCORD_LOGIN_REQUIRED=1` และ `REQUIRE_TURNSTILE=1` ผ่าน `cloudflare.config.json` หากตั้งค่าไม่ครบจะปฏิเสธการรับคีย์ ผู้ใช้ต้องยืนยัน Turnstile ก่อนเริ่ม OAuth และทำขั้นตอนรับคีย์บนเซสชันที่ผูกกับบัญชีตัวเอง คุกกี้ล็อกอินหมดอายุใน 8 ชั่วโมง ออกจากระบบจะเพิกถอนเซสชันบนเซิร์ฟเวอร์ด้วย

เวลารอ 30 วินาทีตรวจจากฐานข้อมูลฝั่งเซิร์ฟเวอร์ การสร้างคีย์ตรวจเงื่อนไขและบันทึกใน SQL เดียว และมีคีย์ได้หนึ่งรายการต่อ flow การแก้ JavaScript/ส่งเวลาหรืออายุคีย์เองไม่ให้สิทธิ์เพิ่ม Turnstile ตรวจ hostname, action และ challenge ของเซสชัน OAuth state ใช้ได้ครั้งเดียวและตรวจคุกกี้ที่ลงลายเซ็นก่อนแลก token มีการจำกัดคำขอ ขนาด body และเวลาอ่าน body

การกดลิงก์พร้อมรอเวลาไม่สามารถยืนยันจริงว่าเข้าร่วม Discord หรือกดติดตาม/คอมเมนต์/ไลค์บน YouTube แล้ว ระบบนี้บังคับขั้นตอน เวลา และการยืนยันบอทเท่านั้น ไม่มีระบบที่รับประกันป้องกันช่องโหว่ทุกชนิด API `/api/validate` ยังใช้คีย์และ HWID โดยไม่ต้องล็อกอิน Discord เพื่อรองรับสคริปต์และคีย์เดิม

## การตั้งค่า

- PUBLIC_KEY_HOURS: อายุคีย์ที่ผู้ใช้ทำครบขั้นตอน ค่าเริ่มต้น 24 ชั่วโมง เริ่มนับเมื่อรับคีย์
- ADMIN_ACCESS_KEY: รหัสผ่านหลังบ้าน เปลี่ยนแล้วรหัสเดิมเข้าไม่ได้
- KEY_SECRET: ความลับสำหรับสร้างคีย์ ห้ามเปลี่ยนขณะมีคีย์ใช้งาน เพราะคีย์ที่แสดงจะเปลี่ยนและไม่ตรง hash เดิม
- ลิงก์แก้ได้ในหน้า `/admin` ส่วน “ตั้งค่าลิงก์ภารกิจ” บันทึกลง D1 และมีผลทันที ไม่ต้อง restart หรือ deploy
- ตั้ง Discord, ช่อง YouTube, คลิปล่าสุด และแยกคลิปคอมเมนต์/ไลค์ได้ ช่องคลิปแยกที่เว้นว่างจะใช้คลิปล่าสุด
- ก่อนบันทึกหลังบ้านครั้งแรก ระบบอ่านค่าเริ่มต้นจาก `.env` / runtime variables หลังบันทึกแล้วค่าหลังบ้านมีสิทธิ์เหนือกว่า รวมถึงการล้างช่องลิงก์ให้ว่าง
- ADMIN_ACCESS_KEY และ KEY_SECRET ยังตั้งใน runtime secrets เท่านั้น ไม่มีการแสดงหรือแก้ไขผ่านฟอร์มลิงก์
- การเปลี่ยนลิงก์ทำให้ขั้นตอนที่ใช้ลิงก์เก่าต้องทำใหม่ แต่ไม่กระทบคีย์ที่ออกไปแล้ว
- ขั้นตอนที่ยังไม่มีลิงก์จะไม่เปิดให้ทำ

## ระบบขั้นตอน

ทำตามลำดับ 1–4 เปิดลิงก์ในแท็บใหม่และกลับมารอ 30 วินาที หาก browser ไม่ส่งเหตุการณ์กลับแท็บ ให้กด “กลับมาแล้ว” เวลารอและการอนุญาตรับคีย์ตรวจฝั่งเซิร์ฟเวอร์ รีเฟรชหน้าแล้วยังทำต่อได้ภายในเซสชัน 24 ชั่วโมง การกดรับซ้ำหรือกดพร้อมกันคืนคีย์เดิม

คีย์ออกแยกต่อเซสชัน ไม่ได้ผูกกับเครื่องหรือบัญชี Roblox และยังไม่มี HWID binding การจำกัดหนึ่งคีย์ต่อเครื่องต้องเพิ่มเมื่อเชื่อมกับ loader

ระบบตรวจเฉพาะการเปิดลิงก์และเวลารอ ไม่ยืนยันว่าผู้ใช้ join/subscribe/comment/like จริง การยืนยันบัญชีจริงต้องออกแบบ integration แยก

## หลังบ้าน

มีปุ่ม TH / EN บนหัวเว็บทั้งหน้าผู้ใช้และแอดมิน เปลี่ยนข้อความ ปุ่ม ข้อผิดพลาด และรูปแบบวันที่ พร้อมจำภาษาที่เลือกใน browser หลังรีเฟรชหรือเปลี่ยนหน้า การสลับภาษาไม่เปลี่ยนคีย์หรือความคืบหน้าขั้นตอน

สร้างคีย์ถาวร กำหนดจำนวนวัน หรือเดือนปฏิทินได้ อายุเริ่มนับตอนสร้าง เดือนที่ไม่มีวันที่ตรงกันจะใช้วันสุดท้ายของเดือน แอดมินค้นหา คัดลอก และเพิกถอนคีย์ได้ ตารางแสดงล่าสุด 200 รายการ สถิตินับทั้งฐานข้อมูล

รหัสแอดมินอยู่ใน sessionStorage ของแท็บและถูกล้างเมื่อออกจากระบบ ฐานข้อมูลเก็บ hash ของคีย์; คีย์ฉบับเต็มสร้างกลับด้วย server secret และแสดงเฉพาะเจ้าของเซสชันหรือแอดมิน

## API ตรวจคีย์สำหรับเชื่อมสคริปต์ภายหลัง

POST `/api/validate` พร้อม JSON:

```json
{"key":"DEVIL-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX","hwid":"stable-device-identifier"}
```

ผลลัพธ์มี valid, status และ expiresAt (Unix milliseconds หรือ null สำหรับถาวร) สถานะคือ active, invalid, expired, revoked, hwid_required, hwid_mismatch มี rate limit ฝั่งเซิร์ฟเวอร์ คีย์ผูก HWID ครั้งแรกแบบ atomic และเก็บเป็นแฮช เครื่องเดิมตรวจซ้ำได้ เครื่องอื่นใช้คีย์เดียวกันไม่ได้

Climb for Eggs, Anime Dice และ Break and Steal an Egg ใช้ API นี้แล้ว รองรับกรอกคีย์เองหรือกำหนด `script_key` ก่อนเรียก loader หลัก ดูการตั้งค่า Cloudflare และ Turnstile Step 5 ใน CLOUDFLARE.md

## ทดสอบ

`npm test` ตรวจเวลารอ อายุวัน/เดือน การสร้างคีย์และการเพิกถอน

`npx tsc --noEmit` ตรวจ TypeScript

`python tests/local-integration.py` ใช้กับ local server port 5184 เท่านั้น ต้องกำหนดลิงก์ครบใน local fixture ก่อน รอเวลาจริง 30 วินาทีทุกขั้นตอน ทดสอบข้ามขั้นตอน รับก่อนเวลา รับพร้อมกัน สิทธิ์แอดมิน และสร้าง/เพิกถอนคีย์ทุกแบบ ไม่เปิดลิงก์ภายนอก ใช้ฐานข้อมูล local แยกจาก production

## การเผยแพร่

Site ID เก็บใน `.openai/hosting.json` ใช้ Site เดิมในการเผยแพร่ครั้งต่อไป การเผยแพร่ครั้งแรกเป็นแบบส่วนตัวสำหรับเจ้าของ ต้องเปลี่ยน audience เป็นสาธารณะก่อนเปิดให้ผู้ใช้ทั่วไป API ตรวจคีย์ก็อยู่ภายใต้ audience เดียวกัน

อย่า commit `.env`, `.dev.vars`, ฐานข้อมูล local หรือไฟล์ใน outputs
