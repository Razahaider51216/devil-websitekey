> Current deployment: Cloudflare D1 only, with a fresh database. Set Build Variable
> `CF_D1_DATABASE_ID` to the new database ID. The Worker binding is `DB`.
> Remove `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `TURSO_MIGRATION_VERIFIED`, and
> `DATABASE_PROVIDER` from dashboard variables. Build with `npm run build:cf`
> and deploy with `npm run deploy:cf`; D1 migrations run before deployment.
> The old Turso database is retained but is not used or imported.

# เปิด DEVIL KEY บน Cloudflare Workers

เว็บนี้มี API และฐานข้อมูล ใช้ **Cloudflare Workers + Turso (libSQL)** ใน production ปัจจุบัน

ย้ายจาก D1 เมื่อ 27 ต.ค. 2026 โดยตรวจเทียบครบ 7 ตารางก่อนสลับ รวมคีย์ 318 รายการและ HWID 167 รายการ เก็บ `KEY_SECRET` เดิมและ D1 เดิมไว้ ค่าผู้ให้บริการอยู่ใน `cloudflare.config.json`; ต้องมี runtime `TURSO_DATABASE_URL` และ Secret `TURSO_AUTH_TOKEN` ดูขั้นตอนย้ายและข้อจำกัดการย้อนกลับใน [TURSO-MIGRATION.md](TURSO-MIGRATION.md)

ขั้นตอน D1 ด้านล่างใช้สำหรับติดตั้ง D1 ใหม่หรือพัฒนา local เท่านั้น ไม่ต้องลง migration D1 เพื่อ deploy production ที่ย้ายแล้ว

## 1. สร้างฐานข้อมูล

ใน Cloudflare ไป Storage & Databases → D1 → Create database ตั้งชื่อ `devil-key-db` แล้วคัดลอก Database ID

## 2. เชื่อม GitHub

ไป Workers & Pages → Create application → Import a repository เลือก `Razahaider51216/devil-websitekey` สร้างเป็น **Worker**

| ค่า | กำหนดเป็น |
| --- | --- |
| Worker name | `devil-websitekey` |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm run build:cf` |
| Deploy command | `npm run deploy:cf` |

ใน **Build variables** เพิ่ม `NODE_VERSION=24`

Database ID ของ `devil-key-db` ตั้งไว้ใน `cloudflare.config.json` แล้ว จึงไม่ต้องเพิ่ม `CF_D1_DATABASE_ID` เพื่อ build หากใช้ฐานข้อมูลอื่นให้แก้ไฟล์นี้ หรือเพิ่ม `CF_D1_DATABASE_ID` ใน Build variables เพื่อแทนค่า (ตัวแปรใน Runtime ใช้แทนไม่ได้)

การ deploy จะใช้ binding `DB` และลง schema migration ที่ยังไม่เคยลงก่อนเผยแพร่ Worker โดยไม่ลบข้อมูลเดิม Token ที่ Workers Builds ใช้ต้องมีสิทธิ์ Workers Scripts: Edit และ D1: Edit สำหรับบัญชีที่เลือก

ไม่ต้องตั้ง build output directory แบบ static Pages เพราะ deploy command ใช้ Worker และ assets ที่ build แล้ว

## 3. ตั้งค่ารันไทม์

ใน Worker → Settings → Variables and Secrets เพิ่มค่าต่อไปนี้ แล้ว deploy ใหม่:

| ชื่อ | ประเภท | ค่า |
| --- | --- | --- |
| `ADMIN_ACCESS_KEY` | Secret | รหัสแอดมินสุ่มอย่างน้อย 24 ตัว |
| `KEY_SECRET` | Secret | ความลับสุ่มอย่างน้อย 32 ตัว ห้ามเปลี่ยนเมื่อมีคีย์ใช้งาน |
| `PUBLIC_KEY_HOURS` | Text | `24` หรือจำนวนชั่วโมงที่ต้องการ |

ใช้ค่ารหัสเดิมจาก `.env` บนเครื่องได้ ไฟล์นี้ไม่ถูกอัปโหลด GitHub

ตั้งลิงก์ Discord/YouTube ในหน้า `/admin` ส่วน “ตั้งค่าลิงก์ภารกิจ” แล้วกด “บันทึกลิงก์” ได้ทันที ไม่ต้อง deploy ใหม่ ช่องวิดีโอล่าสุดใช้สำหรับคอมเมนต์และไลค์ หรือแยกคลิปแต่ละขั้นตอนในช่องไม่บังคับได้

ตัวแปรลิงก์เก่า DISCORD_URL, YOUTUBE_CHANNEL_URL, YOUTUBE_VIDEO_URL, COMMENT_VIDEO_URL และ LIKE_VIDEO_URL ยังใช้เป็นค่าเริ่มต้นได้จนกดบันทึกหลังบ้านครั้งแรก หลังจากนั้นใช้ค่าที่เก็บใน D1

เมื่ออัปเดตจากเวอร์ชันก่อน `npm run deploy:cf` จะลง migration `0001_calm_micromax.sql` เพื่อเพิ่มตารางตั้งค่า โดยไม่ลบคีย์เดิม มีปุ่ม TH / EN บนหัวเว็บสำหรับเลือกภาษาและจำค่าบน browser

หน้าผู้ใช้คือ `/` หลังบ้านคือ `/admin` ล็อกอินด้วย ADMIN_ACCESS_KEY

คีย์เลือกคัดลอกได้ทั้งคีย์ธรรมดาและโค้ดรันพร้อม `script_key` โดยเป็นคีย์เดียวกัน เมื่อใช้สคริปต์ครั้งแรก เซิร์ฟเวอร์ผูกคีย์กับค่าแฮช HWID ที่ตัวรันส่งมา เครื่องเดิมใช้ต่อได้จนหมดอายุ แต่ HWID อื่นถูกปฏิเสธ คีย์เก่าที่ไม่เคยผูกเครื่องจะผูกเมื่อใช้ครั้งแรกหลังอัปเดต ต้องรัน loader เวอร์ชันใหม่เพื่อส่ง HWID ตัวระบุนี้ขึ้นกับ executor/การติดตั้ง Roblox และไม่ใช่การรับรองตัวตนเครื่องจากฮาร์ดแวร์

เพิ่ม Step 5 ด้วย Cloudflare → Turnstile → Add widget → Managed ตั้ง hostname `devil-hub.dev` แล้วเพิ่ม Runtime variable `TURNSTILE_SITE_KEY` และ Runtime Secret `TURNSTILE_SECRET_KEY` (อย่าส่ง Secret ในแชตหรือ commit) เมื่อมีค่าทั้งสองเว็บจะเปิด Step 5 และบังคับตรวจผลที่ Siteverify ก่อนรับคีย์ ผ่านแล้วไม่ต้องรอเวลาอีก หากยังไม่ตั้งทั้งสอง เว็บยังใช้ 4 Step เดิม; ถ้าตั้งเพียงค่าเดียวจะรับคีย์ใหม่ไม่ได้จนตั้งครบ คีย์ที่รับไปแล้วไม่ได้ถูกยกเลิกจากการเพิ่ม Step 5

หน้ารับคีย์แสดงเวลาคงเหลือเป็นชั่วโมง นาที วินาที และนับถอยหลังตามเวลาของเซิร์ฟเวอร์อัตโนมัติ หลังบ้านแสดงตัวนับในแต่ละรายการด้วย ใช้วันหมดอายุเดิมใน D1 จึงรองรับคีย์ที่ออกไปแล้วโดยไม่ต้องรับคีย์ใหม่หรือย้ายฐานข้อมูล รีเฟรชหน้าเว็บไม่เพิ่มอายุคีย์ คีย์หมดอายุ/ยกเลิก/ถาวรจะแสดงสถานะแทนการนับถอยหลัง

ตัวนับ Step ทำงานบน browser และอ่านสถานะจากเซิร์ฟเวอร์เมื่อครบกำหนด แทนการอ่านทุก 2.5 วินาทีระหว่างรอ หน้าคีย์นับเวลาบน browser เช่นเดิม และตรวจสถานะเบื้องหลังทุก 2 นาทีขณะมองเห็นหน้า หาก API ล้มเหลวจะพักคำขออัตโนมัติ 30 วินาที ปุ่มลองอีกครั้งยังเรียกตรวจได้ทันที ตัวสคริปต์ยังตรวจคีย์/HWID กับเซิร์ฟเวอร์ตามเดิม ไม่มีการอนุญาตผ่านเมื่อฐานข้อมูลล้มเหลว

Migration `0004_fresh_agent_zero.sql` เพิ่มดัชนีสำหรับ `steps.flow_id`, `rate_limits.expires_at` และ `access_keys.created_at` โดยไม่ลบคีย์หรือความคืบหน้า ลดการสแกนทั้งตารางสำหรับขั้นตอน ล้าง rate limit และแสดงคีย์ล่าสุด ทดสอบแผนคำค้นได้ด้วย `python tests/query-plan.py` และจำนวนคำขอระหว่างนับถอยหลังด้วย `python tests/polling-browser.py`

หากชนโควตา D1 Free รายวัน การลดคำค้นไม่คืนโควตาที่ใช้ไปแล้ว โควตารีเซ็ต 00:00 UTC / 07:00 น. ไทย การ deploy ที่ต้องลง migration อาจต้องรอจนฐานข้อมูลรับคำขอได้อีกครั้ง ไม่ต้องสร้างฐานข้อมูลใหม่หรือลบคีย์เดิม

## Deploy จากเครื่องด้วย Wrangler

```powershell
npm ci
npx wrangler login
npm run build:cf
npm run deploy:cf
npx wrangler secret put ADMIN_ACCESS_KEY --config dist/server/wrangler.json
npx wrangler secret put KEY_SECRET --config dist/server/wrangler.json
```

จากนั้นตั้งลิงก์และอายุคีย์ใน Dashboard ตามข้อ 3

## ตรวจหลัง deploy

- `/api/flow` ต้องตอบ JSON และแสดงรายการขั้นตอน หาก 503 ให้ตรวจ binding DB และ migration
- `/admin` ต้องเข้าได้เฉพาะเมื่อกรอกรหัสแอดมินถูกต้อง
- ทำครบ 4 ขั้นตอนจึงรับคีย์ได้; แต่ละขั้นรอ 30 วินาทีหลังกลับเว็บ
- สร้างคีย์ในหลังบ้านและตรวจ POST `/api/validate` ตาม README

Cloudflare ใช้ฐานข้อมูลใหม่แยกจากเว็บตัวอย่างบน Sites ไม่มีการย้ายคีย์หรือข้อมูลจาก Sites อัตโนมัติ

เอกสารอ้างอิง: [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

## Custom domain: devil-hub.dev

- Bind `devil-hub.dev` to this Worker under Settings ? Domains & Routes ? Add ? Custom Domain.
- Discord Developer Portal ? your application ? OAuth2 ? Redirects: add `https://devil-hub.dev/api/auth/discord/callback` and save. The server derives this callback from the request origin; no redirect URI environment variable is needed. Log in again on the new domain.
- Turnstile ? existing widget ? Hostname Management: add `devil-hub.dev` (no protocol or path). Keep existing site/secret keys when using the same widget.
- The supported script key gates use `https://devil-hub.dev` for Get Key and `/api/validate` for verification. Ensure Cloudflare security rules allow legitimate executor API requests; do not put an interactive browser challenge on this endpoint. The endpoint still verifies keys and binds devices on the server.
