# เปิด DEVIL KEY บน Cloudflare Workers

เว็บนี้มี API และฐานข้อมูล ใช้ **Workers + D1**

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
