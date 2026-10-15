import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
import os

# บน hosting ตั้ง DB_PATH ชี้ไป volume (เช่น /data/gunwaree.db) เครื่องตัวเองไม่ต้องตั้ง ใช้ไฟล์ข้าง db.py เหมือนเดิม
DB_PATH = Path(os.getenv("DB_PATH") or Path(__file__).resolve().parent / "gunwaree.db")
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# ไทยไม่มีเวลาออมแสง ใช้ +7 คงที่ ไม่ต้องพึ่งฐานข้อมูลเขตเวลาของเครื่อง server
TH_TZ = timezone(timedelta(hours=7))


def now_th() -> str:
    """เวลาไทยปัจจุบันในรูปแบบที่เก็บใน DB: "YYYY-MM-DD HH:MM:SS" """
    return datetime.now(TH_TZ).strftime("%Y-%m-%d %H:%M:%S")

# 11 ตารางตามหัวข้อ "ฐานข้อมูล SQLite" ในแผน เรียงตามลำดับในคู่มือ db.py
# วันที่เวลาเป็น TEXT "YYYY-MM-DD HH:MM:SS" เวลาไทย จริง/เท็จเป็น INTEGER 0 หรือ 1
# ต่างจากแผน 1 จุด (ตกลงกันแล้ว): stations ใช้ UNIQUE(source, kind, code) แทน (source, code)
# เพราะ POPNIX ใช้รหัสเดียวกันกับสถานีจริงตัวเดียวที่วัดทั้งระดับน้ำและฝน
TABLES = [
    """CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'client',
        created_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS auth_tokens (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        token_hash TEXT UNIQUE NOT NULL,
        created_at TEXT,
        expires_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        code_hash TEXT NOT NULL,
        created_at TEXT,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0
    )""",
    """CREATE TABLE IF NOT EXISTS stations (
        id INTEGER PRIMARY KEY,
        source TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT,
        kind TEXT NOT NULL,
        lat REAL,
        lon REAL,
        district TEXT,
        bank REAL,
        warn REAL,
        crit REAL,
        UNIQUE(source, kind, code)
    )""",
    """CREATE TABLE IF NOT EXISTS readings (
        id INTEGER PRIMARY KEY,
        station_id INTEGER,
        water_level REAL,
        depth_cm REAL,
        rain_1h REAL,
        rain_24h REAL,
        discharge REAL,
        status TEXT,
        measured_at TEXT NOT NULL,
        UNIQUE(station_id, measured_at)
    )""",
    """CREATE TABLE IF NOT EXISTS dams (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        province TEXT,
        lat REAL,
        lon REAL,
        capacity REAL
    )""",
    """CREATE TABLE IF NOT EXISTS dam_readings (
        id INTEGER PRIMARY KEY,
        dam_id INTEGER,
        pct REAL,
        volume REAL,
        inflow REAL,
        outflow REAL,
        measured_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY,
        message TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'watch',
        status TEXT NOT NULL DEFAULT 'pending',
        created_by INTEGER,
        created_at TEXT,
        sent_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS incident_reports (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        description TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        created_at TEXT,
        updated_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS pump_commands (
        id INTEGER PRIMARY KEY,
        region TEXT NOT NULL,
        command TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_by INTEGER,
        created_at TEXT,
        executed_at TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS predictions (
        id INTEGER PRIMARY KEY,
        target_station TEXT NOT NULL,
        risk_percent REAL NOT NULL,
        horizon_hours INTEGER NOT NULL DEFAULT 24,
        predicted_for TEXT,
        input_json TEXT,
        created_at TEXT,
        actual_outcome INTEGER
    )""",
]


def get_conn() -> sqlite3.Connection:
    """เปิดการเชื่อมต่อใหม่ แถวที่อ่านได้ใช้ row["ชื่อคอลัมน์"] ได้ ผู้เรียกต้อง close เอง"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """สร้างตารางที่ยังไม่มี รันซ้ำได้ ไม่ลบหรือแก้ตารางเดิม"""
    conn = get_conn()
    try:
        for sql in TABLES:
            conn.execute(sql)
        conn.commit()
    finally:
        conn.close()


READING_FIELDS = ("water_level", "depth_cm", "rain_1h", "rain_24h", "discharge", "status")


def upsert_station(conn, source: str, station: dict) -> int:
    """เพิ่มสถานีถ้ายังไม่มี (source, kind, code) แล้วคืน id ของสถานี"""
    row = {"name": None, "lat": None, "lon": None, "district": None,
           "bank": None, "warn": None, "crit": None, **station, "source": source}
    conn.execute(
        "INSERT OR IGNORE INTO stations (source, code, name, kind, lat, lon, district, bank, warn, crit) "
        "VALUES (:source, :code, :name, :kind, :lat, :lon, :district, :bank, :warn, :crit)",
        row,
    )
    return conn.execute(
        "SELECT id FROM stations WHERE source = ? AND kind = ? AND code = ?",
        (source, row["kind"], row["code"]),
    ).fetchone()["id"]


def insert_reading(conn, station_id: int, reading: dict, replace: bool = False) -> bool:
    """เพิ่ม reading ใหม่ แถวที่ (station_id, measured_at) ซ้ำจะถูกข้าม
    replace=True ให้เขียนทับค่าเดิม (ใช้กับค่าที่ต้นทางปรับย้อนหลังได้ เช่น Open-Meteo)
    คืน True ถ้าได้แถวใหม่หรือแก้แถวเดิม"""
    if not reading.get("measured_at"):
        return False  # measured_at เป็น NOT NULL ไม่มีเวลาก็ไม่เก็บ
    row = {f: reading.get(f) for f in READING_FIELDS}
    row.update(station_id=station_id, measured_at=reading["measured_at"])
    sql = ("INSERT INTO readings (station_id, water_level, depth_cm, rain_1h, rain_24h, discharge, "
           "status, measured_at) VALUES (:station_id, :water_level, :depth_cm, :rain_1h, :rain_24h, "
           ":discharge, :status, :measured_at) ")
    if replace:
        sql += ("ON CONFLICT(station_id, measured_at) DO UPDATE SET water_level = excluded.water_level, "
                "depth_cm = excluded.depth_cm, rain_1h = excluded.rain_1h, rain_24h = excluded.rain_24h, "
                "discharge = excluded.discharge, status = excluded.status")
    else:
        sql += "ON CONFLICT(station_id, measured_at) DO NOTHING"
    return conn.execute(sql, row).rowcount == 1


def insert_dam_reading(conn, dam_name: str, reading: dict) -> bool:
    """เพิ่มค่าเขื่อน ข้ามถ้าเขื่อนนี้มีค่าของเวลาเดียวกันแล้ว (ตารางไม่มี UNIQUE จึงตรวจเอง)"""
    dam = conn.execute("SELECT id FROM dams WHERE name = ?", (dam_name,)).fetchone()
    if dam is None or not reading.get("measured_at"):
        return False
    exists = conn.execute(
        "SELECT 1 FROM dam_readings WHERE dam_id = ? AND measured_at = ?",
        (dam["id"], reading["measured_at"]),
    ).fetchone()
    if exists:
        return False
    conn.execute(
        "INSERT INTO dam_readings (dam_id, pct, volume, inflow, outflow, measured_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (dam["id"], reading.get("pct"), reading.get("volume"), reading.get("inflow"),
         reading.get("outflow"), reading["measured_at"]),
    )
    return True


def latest_station_readings(conn, sources: list[str], kind: str | None = None) -> list[dict]:
    """ค่าล่าสุดของแต่ละสถานีที่ source อยู่ใน sources กรองด้วย kind ถ้าให้มา
    สถานีที่ยังไม่มี reading ยังอยู่ในผล โดยช่องค่าวัดเป็น None (รอการรายงาน)"""
    placeholders = ", ".join("?" for _ in sources)
    rows = conn.execute(
        f"""SELECT s.code, s.name, s.kind, s.lat, s.lon, s.district,
                   r.water_level, r.depth_cm, r.rain_24h,
                   s.bank, s.warn, s.crit, s.source, r.status, r.measured_at
            FROM stations s
            LEFT JOIN readings r ON r.id = (
                SELECT id FROM readings
                WHERE station_id = s.id
                ORDER BY measured_at DESC
                LIMIT 1
            )
            WHERE s.source IN ({placeholders})
              AND (? IS NULL OR s.kind = ?)
            ORDER BY s.kind, s.code""",
        (*sources, kind, kind),
    ).fetchall()
    return [dict(r) for r in rows]


if __name__ == "__main__":
    init_db()
    conn = get_conn()
    names = [r["name"] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    )]
    conn.close()
    print(f"{DB_PATH}")
    print(f"{len(names)} ตาราง: {', '.join(names)}")
