TUNNEL_TOKEN เป็นเหรียญยืนยันตัวตนสำหรับดึงการตั้งค่าอุโมงค์ของคุณ (จากเว็บไซต์ Cloudflare) มาใช้โดยอัตโนมัติบน Docker ที่เรารันครับ

ในการเอา Token มา คุณจะต้องไปสร้าง Tunnel บนเว็บไซต์ Cloudflare Zero Trust (ฟรี 100%) ครับ ทำตามขั้นตอนนี้ได้เลยครับ:

### วิธีเอา TUNNEL_TOKEN จาก Cloudflare

**1. สมัคร/เข้าสู่ระบบ Cloudflare Zero Trust**
- ไปที่เว็บไซต์ Cloudflare Zero Trust Dashboard
- ล็อกอินด้วยบัญชี Cloudflare ที่คุณผูกชื่อโดเมน (Domain Name) ของคุณไว้
- (ถ้าเพิ่งเคยเข้าครั้งแรก ระบบจะให้เลือกแพ็กเกจ ให้เลือกแบบ Free นะครับ)

**2. เริ่มสร้าง Tunnel**
- ที่เมนูซ้ายมือ ไปที่เมนู Networks > Tunnels
- กดปุ่ม "Create a tunnel"
- ใส่ชื่อที่คุณจำได้ง่ายลงไป เช่น docklab-tunnel หรือ database-tunnel แล้วกด Save tunnel
- เลือกประเภท Environment เป็น Docker

**3. หาค่า TUNNEL_TOKEN**
- มันจะโชว์โค้ดคำสั่งหน้าตาประมาณนี้ขึ้นมาเพื่อให้เราก๊อปลงไปรัน (ดูตรงกรอบสีดำๆ ครับ):
  `docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token eyJhbGciOiJIUzI1NiIsIn...`
- สังเกตตัวอักษรยาวๆ สีน้ำเงินที่อยู่หลังคำว่า `--token` ครับ ... นั่นแหละคือ TUNNEL_TOKEN ของจริงที่คุณต้องก๊อปมาใช้! 🎉

**4. เชื่อมโดเมนผ่าน Tunnel (Public Hostname)**
- ยังอยู่หน้าเดียวกัน กด Next เพื่อมาตั้งค่าว่าเราจะเชื่อมอะไร
- **Subdomain:** ตั้งชื่อ Subdomain ย่อยให้มัน (เช่น: `docklab`)
- **Domain:** เลือกโดเมนหลักของคุณที่มี (เช่น: `example.com`)
  - ท่อนี้จะเป็น: `docklab.example.com`

**5. ชี้เป้าไปที่ Container ภายในเครื่องเรา (Service)**
- **Type:** (ถ้าต่อเว็บเลือก HTTP, ถ้าต่อ Database Postgres/MySQL/SSH เลือก TCP)
- **URL:** ตรงนี้สำคัญมาก ถ้าระบบของเราอยู่วง Network กันแล้ว เราแค่พิมพ์ว่า ชื่อคอนเทนเนอร์:พอร์ต ได้เลย เช่นพิมพ์ `my-db:5432` หรือ `my-api:3000` (ไม่ต้องจำและหา IP เองเลย)
- กด **Save hostname** ได้เลย เป็นอันเสร็จพิธีตั้งเป้าบน Cloudflare

### ทีนี้นำ Token กลับมาใส่ Docker ของเราต่อ:
1. ไปที่แอป Docklab วันนี้ของเราเข้าหน้า Containers > กดปุ่ม Create Container
2. ตั้งค่าการรันแอพ Cloudflare:
   - **Image:** `cloudflare/cloudflared:latest`
   - **Environment Variables:** `TUNNEL_TOKEN=eyJhbGciOi.......(วางโค้ดเมื่อกี้)`
   - **Network:** เลือก Network `my-secure-net` เดียวกับ Database
   - **Restart Policy:** เลือก `unless-stopped` เผื่อไฟตก มันจะได้ต่ออัตโนมัติให้ 
   *(สำคัญมาก: คุณต้องมีคอนเทนเนอร์ ฐานข้อมูล หรือแอพอื่นๆ เข้าไปจอยวง Network นี้ล่วงหน้าให้ชื่อตรงกันกับที่ตั้งมาข้างต้นด้วยนะครับ)*

พอสั่ง Create & Start ปุ๊บ Tunnels ในเว็บ Cloudflare Zero Trust ก็จะขึ้นสถานะ 🟢 Active (แปลว่าเชื่อมสำเร็จและพร้อมใช้งานผ่าน `docklab.example.com` แล้วครับ!)"# docklab" 
"# docklab" 
