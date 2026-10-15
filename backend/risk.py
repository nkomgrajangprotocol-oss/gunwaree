import json
from datetime import datetime, timedelta
from statistics import median

from db import TH_TZ, now_th

FMT = "%Y-%m-%d %H:%M:%S"

# เป้าหมายตามแผน: ระดับน้ำที่พระนครศรีอยุธยา (ThaiWater 39) เกินตลิ่ง 5.06 ม.รทก. ภายใน 24 ชม.
TARGET_CODE = "39"
TARGET_STATION = "thaiwater:39"
TARGET_LABEL = "พระนครศรีอยุธยา (สถานี 39)"
BANK_DEFAULT = 5.06
HORIZON_HOURS = 24
MAX_AGE_HOURS = 3      # ไม่มีค่าล่าสุดเกิน 3 ชม. -> 503
TREND_HOURS = 6        # B2 ดูว่าระดับน้ำ 6 ชม.ที่ผ่านมากำลังขึ้น
FILL_FORWARD_HOURS = 3  # ค่า 6 ชม.ก่อน ยอมใช้ค่าที่เก่ากว่านั้นได้ไม่เกิน 3 ชม.

# guard จุดกระโดด: ข้อมูลเทรนมีค่าเดี่ยวที่กระโดดไป 5 ถึง 7 ม. ราว 33 ครั้งใน 6 ปี ซึ่งจะทำให้กฎทับตอบ critical ปลอม
# ค่าล่าสุดที่ห่างจากมัธยฐานของค่าก่อนหน้า (สูงสุด 4 ค่า ภายใน 6 ชม.) เกิน 1 ม. ถือว่าน่าสงสัย แล้วใช้มัธยฐานนั้นแทน
SPIKE_T = 1.0
SPIKE_PREV_MAX = 4
SPIKE_PREV_MIN = 3     # ค่าก่อนหน้าน้อยกว่า 3 ค่า ไม่ใช้ guard (มัธยฐานไม่น่าเชื่อถือ)
SPIKE_WINDOW_HOURS = 6

# m ของ B2 = 0.30 เลือกจากข้อมูลเทรน 2020-2024 ให้ F1 เฉลี่ยสูงสุดบน validation ปี 2021 และ 2022 (ไม่ได้ใช้ปี 2025) เส้น F1 ราบช่วง m 0.10 ถึง 0.50
B2_MARGIN_M = 0.30

# คะแนนของกฎ (กฎให้ผลเป็นระดับ ไม่ใช่ความน่าจะเป็น) ค่าชั่วคราวจนกว่าจะมีโมเดล
RULE_SCORE = {"none": 0.0, "watch": 33.0, "warning": 67.0, "critical": 100.0}


class NoRecentData(Exception):
    """ไม่มีค่าล่าสุดของอยุธยาภายใน 3 ชม. (endpoint ตอบ 503)"""


def _parse(t: str) -> datetime:
    return datetime.strptime(t, FMT).replace(tzinfo=TH_TZ)


def build_inputs(conn) -> dict:
    """สร้างตัวแปรจาก SQLite: ระดับน้ำล่าสุด ตลิ่ง และการเปลี่ยนแปลง 6 ชม."""
    station = conn.execute(
        "SELECT id, bank FROM stations WHERE source = 'popnix' AND kind = 'river' AND code = ?",
        (TARGET_CODE,),
    ).fetchone()
    if station is None:
        raise NoRecentData
    latest = conn.execute(
        "SELECT water_level, measured_at FROM readings "
        "WHERE station_id = ? AND water_level IS NOT NULL ORDER BY measured_at DESC LIMIT 1",
        (station["id"],),
    ).fetchone()
    if latest is None:
        raise NoRecentData
    latest_at = _parse(latest["measured_at"])
    if datetime.now(TH_TZ) - latest_at > timedelta(hours=MAX_AGE_HOURS):
        raise NoRecentData

    # guard จุดกระโดด: เทียบค่าล่าสุดกับมัธยฐานของค่าก่อนหน้า
    previous = conn.execute(
        "SELECT water_level, measured_at FROM readings "
        "WHERE station_id = ? AND water_level IS NOT NULL AND measured_at < ? AND measured_at >= ? "
        "ORDER BY measured_at DESC LIMIT ?",
        (station["id"], latest["measured_at"],
         (latest_at - timedelta(hours=SPIKE_WINDOW_HOURS)).strftime(FMT), SPIKE_PREV_MAX),
    ).fetchall()
    water_level, measured_at, suspect = latest["water_level"], latest["measured_at"], False
    if len(previous) >= SPIKE_PREV_MIN:
        prev_median = median(r["water_level"] for r in previous)
        if abs(latest["water_level"] - prev_median) > SPIKE_T:
            # ค่าล่าสุดน่าสงสัย ใช้มัธยฐานแทน และใช้เวลาของค่าก่อนหน้าล่าสุด ซึ่งต้องไม่เก่าเกิน 3 ชม. เช่นกัน
            water_level, measured_at, suspect = prev_median, previous[0]["measured_at"], True
            latest_at = _parse(measured_at)
            if datetime.now(TH_TZ) - latest_at > timedelta(hours=MAX_AGE_HOURS):
                raise NoRecentData

    target_at = latest_at - timedelta(hours=TREND_HOURS)
    earlier = conn.execute(
        "SELECT water_level, measured_at FROM readings "
        "WHERE station_id = ? AND water_level IS NOT NULL AND measured_at <= ? AND measured_at >= ? "
        "ORDER BY measured_at DESC LIMIT 1",
        (station["id"], target_at.strftime(FMT),
         (target_at - timedelta(hours=FILL_FORWARD_HOURS)).strftime(FMT)),
    ).fetchone()

    return {
        "water_level": water_level,
        "bank": station["bank"] if station["bank"] is not None else BANK_DEFAULT,
        "rise_6h": (round(water_level - earlier["water_level"], 3)
                    if earlier else None),  # None = ไม่มีค่าเทียบ ไม่ใช่ 0
        "measured_at": measured_at,
        "earlier_measured_at": earlier["measured_at"] if earlier else None,
        "raw_latest": latest["water_level"],  # ค่าวัดล่าสุดจริง ก่อน guard
        "suspect_latest": suspect,            # True = ค่าล่าสุดถูกแทนด้วยมัธยฐานของค่าก่อนหน้า
    }


def rule_b2(inputs: dict) -> str:
    """แปลงตัวแปรเป็น level ด้วยกฎ B2 และกฎทับ
    critical: ถึงตลิ่งแล้ว (กฎทับ เป็น critical เสมอ)
    warning:  B2 ติด คือสูงกว่า (ตลิ่ง - m) และ 6 ชม.ที่ผ่านมากำลังขึ้น
    watch:    สูงกว่า (ตลิ่ง - m) แต่ไม่ได้ขึ้น หรือไม่มีค่าเทียบแนวโน้ม
    none:     ต่ำกว่า (ตลิ่ง - m)"""
    wl, bank, rise = inputs["water_level"], inputs["bank"], inputs["rise_6h"]
    if wl >= bank:
        return "critical"
    if wl > bank - B2_MARGIN_M:
        return "warning" if rise is not None and rise > 0 else "watch"
    return "none"


def predict(conn) -> dict:
    """คำนวณความเสี่ยง บันทึกแถวใหม่ลง predictions แล้วคืนคำตอบของ GET /risk
    ยก NoRecentData ถ้าไม่มีค่าล่าสุด (ผู้เรียกต้องตอบ 503)"""
    inputs = build_inputs(conn)
    level = rule_b2(inputs)
    risk_percent = RULE_SCORE[level]
    created_at = now_th()
    predicted_for = (_parse(created_at) + timedelta(hours=HORIZON_HOURS)).strftime(FMT)
    # ตาราง predictions ไม่มีคอลัมน์ level จึงเก็บไว้ใน input_json พร้อมตัวแปรที่ใช้
    input_json = json.dumps({**inputs, "level": level, "method": "rule_b2", "margin_m": B2_MARGIN_M},
                            ensure_ascii=False)
    conn.execute(
        "INSERT INTO predictions (target_station, risk_percent, horizon_hours, predicted_for, "
        "input_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (TARGET_STATION, risk_percent, HORIZON_HOURS, predicted_for, input_json, created_at),
    )
    conn.commit()
    return {
        "risk_percent": risk_percent,
        "level": level,
        "target": TARGET_LABEL,
        "horizon_hours": HORIZON_HOURS,
        "created_at": created_at,
        "inputs_measured_at": inputs["measured_at"],
    }
