# ☸️ Docklab - Docker Management Dashboard

**Docklab** คือแดชบอร์ดจัดการ Docker ที่ทันสมัย สวยงาม และปลอดภัย ออกแบบมาเพื่อให้การบริหารจัดการคอนเทนเนอร์ (Containers), อิมเมจ (Images), วอลลุ่ม (Volumes) และเน็ตเวิร์ก (Networks) แบบรวบรวมไว้ในที่เดียว (Unified Interface) รองรับการจัดการหลายโฮสต์พร้อมกันอย่างมีประสิทธิภาพ

---

## ✨ ฟีเจอร์ทั้งหมด (All Features) 

### 🖥️ การจัดการโฮสต์ (Host Management)
- **Multi-Host Support**: เชื่อมต่อและสลับการทำงานระหว่าง Docker Host หลายตัวได้ทันทีจากแถบเมนูด้านบน
- **Connection Types**: รองรับทั้งการเชื่อมต่อแบบ **TCP (Direct)** และ **Docklab-server Agent (Secure Proxy)**
- **Host Editing**: สามารถตั้งชื่อเรียก (Display Name) ของโฮสต์แต่ละตัวได้เพื่อให้ง่ายต่อการจดจำ
- **Auto-Sync**: ระบบจะดึงข้อมูลโฮสต์ตัวที่เลือกไว้มาแสดงผลโดยอัตโนมัติในทุกหน้า

### 🛡️ ความปลอดภัยขั้นสูง (Security)
- **Docklab-server Secure Agent**: เชื่อมต่อรีโมทโฮสต์ผ่าน Agent ส่วนตัว ไม่ต้องเปิดพอร์ต Docker (2375) สู่โลกภายนอก
- **API Key Authentication**: ระบบรักษาความปลอดภัยด้วย Key เฉพาะตัวที่เก็บรูปแบบ Hash (SHA256)
- **IP/Domain Whitelist**: (ใหม่!) ระบบจำกัดการเข้าถึง Docklab-server เฉพาะ IP หรือ Domain ที่กำหนดเท่านั้น รองรับ Wildcard (เช่น `192.168.1.*`)
- **Role-Based Access (RBAC)**: แบ่งสิทธิ์ผู้ใช้งานชัดเจน:
    - 👑 **Admin**: จัดการทุกอย่าง รวมถึงผู้ใช้และโฮสต์
    - 🛠️ **Developer**: จัดการคอนเทนเนอร์และทรัพยากรต่างๆ
    - 👁️ **Viewer**: ดูสถานะได้อย่างเดียว ไม่สามารถสั่งการได้

### 📊 การตรวจสอบสถานะ (Monitoring)
- **Real-time Host Stats**: แสดงผล CPU, RAM และ Storage ของโฮสต์แบบเรียลไทม์
- **High-Precision CPU**: ระบบคำนวณ CPU Usage แบบ Delta (Instantaneous) ให้ความแม่นยำสูงกว่าค่าเฉลี่ยปกติ
- **Container Stats**: ดูการใช้ทรัพยากรของแต่ละคอนเทนเนอร์แยกกันได้
- **Event Feed**: ติดตามกิจกรรมที่เกิดขึ้นใน Docker (Pull, Start, Stop) แบบสดๆ ผ่าน SSE

### 🐳 การจัดการ Docker ทรัพยากร (Resources)
- **Container Lifecycle**: สั่ง Start, Stop, Restart, Remove ได้อย่างรวดเร็ว
- **Web Terminal**: เข้าถึง Console ของคอนเทนเนอร์ได้ผ่านหน้าเว็บโดยตรง (รองรับ Bash/Sh)
- **Container Logs**: ดู Log ย้อนหลังของคอนเทนเนอร์ได้ทันที
- **Snapshot (Commit)**: สร้าง Image ใหม่จากคอนเทนเนอร์ที่กำลังรันอยู่ได้ในคลิกเดียว
- **Image Management**: ดึง (Pull) อิมเมจใหม่จาก Docker Hub หรือลบ (Remove) อิมเมจที่ไม่ใช้แล้ว
- **Volume & Network**: ตรวจสอบและจัดการพื้นที่เก็บข้อมูลและเครือข่ายของ Docker

### 📁 Stack & Compose
- **Docker Compose Support**: สามารถเขียนและรัน Stack (docker-compose.yml) ได้โดยตรงจาก Dashboard
- **Stack Management**: ดูสถานะและสั่งหยุด/ลบ Stack ได้ง่ายๆ

---

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

- **Framework**: [Next.js 15+](https://nextjs.org/) (App Router & Server Actions)
- **Database**: [MySQL](https://www.mysql.com/) + [Prisma ORM](https://www.prisma.io/)
- **UI Architecture**: Tailwind CSS 4, Radix UI Primitives, Lucide Icons
- **Real-time Core**: WebSockets, Server-Sent Events (SSE)
- **Terminal Engine**: [Xterm.js](https://xtermjs.org/)
- **Security**: [NextAuth.js](https://next-auth.js.org/), Docklabet, Express-Rate-Limit

---

## 🚀 เริ่มต้นใช้งาน (Getting Started)

### 1. ติดตั้ง Docklab Dashboard
1. คัดลอกโฟลเดอร์โปรเจกต์
2. ตั้งค่าไฟล์ `.env` (ใช้ `.env.example` เป็นแม่แบบ)
3. รันคำสั่งติดตั้ง:
   ```bash
   npm install
   npx prisma generate
   npx prisma db push
   npm run dev
   ```

### 2. ติดตั้ง Docklab-server Agent (บน VPS)
หากต้องการจัดการเครื่องรีโมท แนะนำให้ใช้ **Docklab-server** เพื่อความปลอดภัย:
1. ไปที่โฟลเดอร์ `docklab-server` บนเครื่องปลายทาง
2. รัน `docker compose up -d`
3. ดู API Key จาก `docker logs docklab-server`
4. นำไปเพิ่มใน **Settings -> Add Host** บนหน้าเว็บ Docklab

---

## 📄 ใบอนุญาต (License)

โปรเจกต์นี้เป็นซอฟต์แวร์ส่วนตัวและพัฒนาขึ้นเพื่อใช้งานภายในองค์กร

---
*Created with ❤️ by Warakorn*
