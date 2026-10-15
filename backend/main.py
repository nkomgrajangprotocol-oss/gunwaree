from typing import Literal, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="GunWaree API")

# CORS: อนุญาตหน้าเว็บของรักษ์ (Live Server) ทั้งสอง origin
# ตอน deploy ให้เพิ่มโดเมน Vercel เข้ามาใน list นี้
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500", "http://localhost:5500"],
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# ข้อมูลตัวอย่างจากเอกสาร (ขั้น 4 จะสลับไปอ่านจาก SQLite)
# "scope" ใช้กรองเท่านั้น ไม่ส่งออกไปในคำตอบ
SAMPLE_STATIONS = [
    {"scope": "bangkok", "code": "1", "name": "คลองลาดพร้าว วัดบางบัว", "kind": "canal",
     "lat": 13.85402, "lon": 100.58746, "district": None,
     "water_level": 1.43, "depth_cm": None, "rain_24h": None,
     "bank": 2.2, "warn": None, "crit": None,
     "source": "popnix", "status": None, "measured_at": "2026-10-14 08:10:00"},
    {"scope": "bangkok", "code": "4", "name": "สะพานกรุงเทพ", "kind": "river",
     "lat": 13.700301, "lon": 100.49277, "district": None,
     "water_level": 1.74, "depth_cm": None, "rain_24h": None,
     "bank": 2.16, "warn": None, "crit": None,
     "source": "popnix", "status": None, "measured_at": "2026-10-14 08:10:00"},
    {"scope": "bangkok", "code": "FL.BBN.01", "name": "ถ.เอกชัย (ห้างบิ๊กซี)", "kind": "road",
     "lat": 13.67942, "lon": 100.43563, "district": "บางบอน",
     "water_level": None, "depth_cm": 0, "rain_24h": None,
     "bank": None, "warn": None, "crit": None,
     "source": "popnix", "status": None, "measured_at": "2026-10-14 13:05:00"},
    {"scope": "bangkok", "code": "2072", "name": "กรมทรัพยากรน้ำ", "kind": "rain",
     "lat": 13.785535, "lon": 100.53908, "district": "พญาไท",
     "water_level": None, "depth_cm": None, "rain_24h": 4.5,
     "bank": None, "warn": None, "crit": None,
     "source": "popnix", "status": None, "measured_at": "2026-10-14 13:00:00"},
    {"scope": "bangkok_test", "code": "esp32-01", "name": "ชุดทดลอง ESP32", "kind": "canal",
     "lat": None, "lon": None, "district": None,
     "water_level": 0.124, "depth_cm": None, "rain_24h": None,
     "bank": None, "warn": None, "crit": None,
     "source": "esp32", "status": "green", "measured_at": "2026-10-14 13:30:10"},
]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/stations/latest")
def stations_latest(
    kind: Optional[Literal["canal", "river", "road", "rain"]] = None,
    scope: Literal["bangkok", "bangkok_test"] = "bangkok",
):
    rows = [
        s for s in SAMPLE_STATIONS
        if s["scope"] == scope and (kind is None or s["kind"] == kind)
    ]
    return [{k: v for k, v in s.items() if k != "scope"} for s in rows]