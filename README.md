# GunWaree (FloodSense)

ทีม KaNaIYuRi · U-Hackathon 2026

เริ่มสร้างโปรเจกต์ 15 ต.ค. 2026 เวลา 11:30

## วิธีรัน

```bash
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r backend/requirements.txt
cp .env.example .env              # แล้วเปิด .env ใส่ค่าเอง
cd backend
uvicorn main:app --reload
```

ตัวแปรใน `.env`: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `DEVICE_KEY` และ `DB_PATH` (ไม่บังคับ ไม่ตั้งจะใช้ `backend/gunwaree.db`) ห้าม commit ไฟล์ `.env`

เปิดเอกสาร API ที่ http://127.0.0.1:8000/docs

## Deploy

ตั้งตัวแปรบน hosting: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `DEVICE_KEY`, `DB_PATH` (ชี้ไปที่ volume ถาวร เช่น `/data/gunwaree.db`)

start command (รันจากโฟลเดอร์ `backend`):

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

## เครดิตข้อมูล

- POPNIX Flood
- ThaiWater / สสน.
- Open-Meteo (CC BY 4.0)
- กรมชลประทาน (RID)

> ต้นแบบนี้ไม่ใช่ประกาศเตือนภัยทางการ
