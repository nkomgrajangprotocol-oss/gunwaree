import threading
import time
from datetime import datetime, timedelta

import requests

from db import TH_TZ, get_conn, insert_dam_reading, insert_reading, now_th, upsert_station

POPNIX_BASE = "https://flood.pop.in.th"
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
RID_URL = "https://app.rid.go.th/reservoir/api/dam/public/{date}"
TIMEOUT = (5, 30)  # (ต่อเชื่อม, รออ่าน) วินาที
HEADERS = {"User-Agent": "GunWaree/0.1 (U-Hackathon 2026 prototype)"}

TICK_S = 600              # รอบหลัก 10 นาที = POPNIX
OPEN_METEO_EVERY_S = 3600  # ฝนทุกชั่วโมง
RID_EVERY_S = 6 * 3600     # เขื่อนรายวัน เรียกวันละ 4 ครั้งพอ
BACKFILL_HOURS = 72        # ย้อนหลังราว 3 วันตามแผน
SIM_AFTER_FAILS = 3

# จุดดึงฝนของ Open-Meteo (ค่าระดับกริด) พิกัดกลางเมืองโดยประมาณ ต้องตรวจให้ตรงกับจุดที่ใช้ตอนเทรน
OPEN_METEO_POINTS = [
    {"code": "bangkok", "name": "กรุงเทพมหานคร (Open-Meteo)", "lat": 13.75, "lon": 100.50},
    {"code": "nakhon_sawan", "name": "นครสวรรค์ (Open-Meteo)", "lat": 15.70, "lon": 100.14},
]

# รหัสเขื่อนของ RID -> ชื่อในตาราง dams (เจ้าพระยาไม่อยู่ใน RID ใช้ค่าการไหล C.13 แทน)
RID_DAMS = {"200101": "ภูมิพล", "200102": "สิริกิติ์", "100107": "แควน้อยบำรุงแดน", "100301": "ป่าสักชลสิทธิ์"}
C13_CODE = "2744"
M3S_TO_MCM_PER_DAY = 0.0864  # ลบ.ม./วินาที -> ล้าน ลบ.ม./วัน

# สถานะที่ main.py อ่าน: "sim" เมื่อดึง POPNIX ไม่ได้ 3 รอบติด, None = ยังไม่ต้องสลับ
active_source: str | None = None
_fail_streak = 0


def _get_json(url: str, params: dict | None = None) -> dict:
    resp = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()


# ---------- POPNIX ----------
# แปลงแถวของแต่ละปลายทางเป็น (ข้อมูลสถานี, ข้อมูล reading) ชื่อช่องของเราตามตาราง stations/readings
# ค่าที่ไม่มีคงเป็น None เสมอ ไม่แปลงเป็น 0

def _from_overview(s: dict) -> tuple[dict, dict]:
    # id ของ api_overview เป็นรหัสภายใน POPNIX ชนกับรหัส ThaiWater ของ api_river จึงใส่ "bma:" นำหน้า
    station = {"code": f"bma:{s['id']}", "name": s.get("name"), "kind": "canal",
               "lat": s.get("lat"), "lon": s.get("lng"),
               "bank": s.get("bank"), "warn": s.get("warn"), "crit": s.get("crit")}
    return station, {"water_level": s.get("wl"), "measured_at": s.get("measured_at")}


def _from_roads(r: dict) -> tuple[dict, dict]:
    station = {"code": r["code"], "name": r.get("name"), "kind": "road",
               "lat": r.get("lat"), "lon": r.get("lng"), "district": r.get("district")}
    return station, {"depth_cm": r.get("depth"), "measured_at": r.get("measured_at")}


def _from_river(s: dict) -> tuple[dict, dict]:
    # api_river มีทั้งแม่น้ำและคลอง แยกจากชื่อลำน้ำ (ตกลงกันแล้ว)
    kind = "river" if (s.get("river") or "").startswith("แม่น้ำ") else "canal"
    station = {"code": s["code"], "name": s.get("name"), "kind": kind,
               "lat": s.get("lat"), "lon": s.get("lng"),
               "bank": s.get("bank"), "warn": s.get("warn"), "crit": s.get("crit")}
    return station, {"water_level": s.get("wl"), "discharge": s.get("flow"),
                     "measured_at": s.get("measured_at")}


def _from_rain(s: dict) -> tuple[dict, dict]:
    station = {"code": s["code"], "name": s.get("name"), "kind": "rain",
               "lat": s.get("lat"), "lon": s.get("lng"), "district": s.get("district")}
    return station, {"rain_1h": s.get("r1h"), "rain_24h": s.get("r24h"),
                     "measured_at": s.get("measured_at")}


# (ปลายทาง, ช่องที่เก็บรายการ, ตัวแปลง)
POPNIX_ENDPOINTS = [
    ("api_overview.php", "stations", _from_overview),
    ("api_roads.php", "roads", _from_roads),
    ("api_river.php", "stations", _from_river),
    ("api_rain.php", "stations", _from_rain),
]


def _save_chao_phraya(conn, river_rows: list[dict]) -> None:
    """เขื่อนเจ้าพระยา: ค่าการไหลที่ C.13 แปลงเป็นล้าน ลบ.ม./วัน ใส่ใน outflow (ไม่มี pct)"""
    for s in river_rows:
        if s.get("code") == C13_CODE and s.get("flow") is not None:
            insert_dam_reading(conn, "เจ้าพระยา", {
                "outflow": round(s["flow"] * M3S_TO_MCM_PER_DAY, 2),
                "measured_at": s.get("measured_at"),
            })


def _save_popnix(conn, path: str, key: str, convert, data: dict) -> int:
    rows = data[key]
    new = 0
    for item in rows:
        station, reading = convert(item)
        station_id = upsert_station(conn, "popnix", station)
        if insert_reading(conn, station_id, reading):
            new += 1
    if path == "api_river.php":
        _save_chao_phraya(conn, rows)
    return new


def fetch_popnix() -> dict:
    """ดึง 4 ปลายทางของ POPNIX ลง SQLite ปลายทางไหนพังก็ข้ามไป ไม่ทำให้ปลายทางอื่นล้ม"""
    result = {"ok": [], "failed": {}, "stale": [], "stations": 0, "new_readings": 0}
    conn = get_conn()
    try:
        for path, key, convert in POPNIX_ENDPOINTS:
            try:
                data = _get_json(f"{POPNIX_BASE}/{path}")
                result["new_readings"] += _save_popnix(conn, path, key, convert, data)
                conn.commit()
            except Exception as e:  # เครือข่าย, HTTP error, JSON ผิดรูป หรือช่องหาย
                conn.rollback()
                result["failed"][path] = f"{type(e).__name__}: {e}"
                continue
            result["ok"].append(path)
            result["stations"] += len(data[key])
            summary = data.get("summary") or {}
            if summary.get("stale") or summary.get("scrape_failing"):
                result["stale"].append(path)  # ข้อมูลไม่สด (เก่ากว่า 45 นาที หรือต้นทางดึงไม่สำเร็จ)
    finally:
        conn.close()
    return result


def fetch_latest() -> dict:
    """ดึง POPNIX หนึ่งรอบ ถ้าทุกปลายทางล้ม 3 รอบติดกัน สลับเป็นข้อมูลจำลอง (sim)"""
    global active_source, _fail_streak
    result = fetch_popnix()
    if result["ok"]:
        _fail_streak = 0
        active_source = None
    else:
        _fail_streak += 1
        if _fail_streak >= SIM_AFTER_FAILS:
            active_source = "sim"
    return {"source": active_source or "popnix", "fetched_at": now_th(),
            "fail_streak": _fail_streak, **result}


# ---------- Open-Meteo (ฝนรายชั่วโมง) ----------

def fetch_open_meteo() -> dict:
    """ฝนรายชั่วโมงย้อนหลัง 3 วันถึงชั่วโมงปัจจุบัน (ไม่เก็บค่าพยากรณ์ของชั่วโมงที่ยังไม่ถึง)
    เก็บเป็นสถานี source='openmeteo' kind='rain' ค่าอยู่ใน readings.rain_1h"""
    result = {"ok": [], "failed": {}, "rows": 0}
    now_hour = datetime.now(TH_TZ).strftime("%Y-%m-%dT%H:00")
    conn = get_conn()
    try:
        for p in OPEN_METEO_POINTS:
            try:
                data = _get_json(OPEN_METEO_URL, {
                    "latitude": p["lat"], "longitude": p["lon"], "hourly": "precipitation",
                    "past_days": 3, "forecast_days": 1, "timezone": "Asia/Bangkok",
                })
                hourly = data["hourly"]
                station_id = upsert_station(conn, "openmeteo", {**p, "kind": "rain"})
                for t, mm in zip(hourly["time"], hourly["precipitation"]):
                    if t > now_hour:
                        break
                    # ค่าชั่วโมงล่าสุดอาจถูกปรับภายหลัง จึงเขียนทับ
                    if insert_reading(conn, station_id, {"rain_1h": mm, "measured_at": t.replace("T", " ") + ":00"},
                                      replace=True):
                        result["rows"] += 1
                conn.commit()
                result["ok"].append(p["code"])
            except Exception as e:
                conn.rollback()
                result["failed"][p["code"]] = f"{type(e).__name__}: {e}"
    finally:
        conn.close()
    return result


# ---------- RID (เขื่อนรายวัน) ----------

def fetch_rid() -> dict:
    """ค่าเขื่อน 4 แห่งของวันนี้ ถ้าวันนี้ยังไม่มีให้ลองเมื่อวาน ถ้าเรียกไม่ได้ ค่าเดิมในตารางยังอยู่"""
    result = {"date": None, "saved": 0, "failed": {}}
    today = datetime.now(TH_TZ).date()
    for day in (today, today - timedelta(days=1)):
        date = day.isoformat()
        try:
            data = _get_json(RID_URL.format(date=date))
            dams = [d for region in data.get("data") or [] for d in region.get("dam") or []]
            wanted = [d for d in dams if d.get("id") in RID_DAMS]
            if not wanted:
                result["failed"][date] = "ไม่มีข้อมูลเขื่อนที่ต้องการ"
                continue
            # RID ส่งแถวของวันนี้มาก่อนมีค่า ถ้าทุกช่องเป็น null ทุกเขื่อน ไม่บันทึกแถวว่าง แล้วลองวันถัดไป (0 ถือว่ามีค่า)
            if not any(d.get(k) is not None for d in wanted for k in ("percent_storage", "volume", "inflow", "outflow")):
                result["failed"][date] = "ยังไม่มีค่าของวันนี้"
                continue
        except Exception as e:
            result["failed"][date] = f"{type(e).__name__}: {e}"
            continue
        conn = get_conn()
        try:
            for d in wanted:
                # measured_at เป็นวันที่อย่างเดียว ตามตัวอย่าง /dams/latest ในแผน
                if insert_dam_reading(conn, RID_DAMS[d["id"]], {
                    "pct": d.get("percent_storage"), "volume": d.get("volume"),
                    "inflow": d.get("inflow"), "outflow": d.get("outflow"),
                    "measured_at": data.get("date") or date,
                }):
                    result["saved"] += 1
            conn.commit()
        finally:
            conn.close()
        result["date"] = date
        break
    return result


# ---------- backfill ตอนเริ่มระบบ ----------

def backfill(hours: int = BACKFILL_HOURS) -> dict:
    """ดึง api_river ย้อนหลังรายชั่วโมงด้วย ?at= (ให้ /risk มีแนวโน้ม 6 ชม. ทันทีหลังรีสตาร์ท)
    ฝนย้อนหลังได้จาก Open-Meteo past_days=3 อยู่แล้ว"""
    result = {"hours_ok": 0, "hours_failed": 0, "new_readings": 0}
    start = datetime.now(TH_TZ).replace(minute=0, second=0, microsecond=0)
    for h in range(hours, 0, -1):
        at = (start - timedelta(hours=h)).strftime("%Y-%m-%d %H:%M")
        conn = get_conn()
        try:
            data = _get_json(f"{POPNIX_BASE}/api_river.php", {"at": at})
            result["new_readings"] += _save_popnix(conn, "api_river.php", "stations", _from_river, data)
            conn.commit()
            result["hours_ok"] += 1
        except Exception:
            conn.rollback()
            result["hours_failed"] += 1
        finally:
            conn.close()
        time.sleep(0.3)  # ห่างกันเล็กน้อย ไม่ให้ชนเพดาน 300 ครั้ง/นาที
    return result


# ---------- วนในเธรดเบื้องหลัง ----------

def _run(name: str, fn) -> None:
    try:
        print(f"[{name}] {now_th()} {fn()}")
    except Exception as e:  # กันเธรดตาย ถ้าพลาดตรงไหนที่ไม่คาดไว้ (เช่น DB ล็อก)
        print(f"[{name}] error: {type(e).__name__}: {e}")


def _loop(stop: threading.Event) -> None:
    last_om = last_rid = 0.0
    first = True
    while not stop.is_set():
        _run("popnix", lambda: {k: v for k, v in fetch_latest().items() if k != "fetched_at"})
        now = time.monotonic()
        if first or now - last_om >= OPEN_METEO_EVERY_S:
            _run("open-meteo", fetch_open_meteo)
            last_om = now
        if first or now - last_rid >= RID_EVERY_S:
            _run("rid", fetch_rid)
            last_rid = now
        if first:
            _run("backfill", backfill)  # ทำหลังรอบแรก หน้าเว็บจะได้มีค่าล่าสุดก่อน
            first = False
        stop.wait(TICK_S)


def start_background() -> threading.Event:
    """เริ่มเธรดดึงข้อมูล (POPNIX ทุก 10 นาที ฝนทุกชั่วโมง เขื่อนทุก 6 ชม.) คืน Event ไว้สั่งหยุด"""
    stop = threading.Event()
    threading.Thread(target=_loop, args=(stop,), daemon=True, name="fetch_latest").start()
    return stop


if __name__ == "__main__":
    import json
    print(json.dumps({"popnix": fetch_latest(), "open_meteo": fetch_open_meteo(), "rid": fetch_rid()},
                     ensure_ascii=False, indent=2))
