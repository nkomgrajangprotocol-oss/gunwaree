import json
import math
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import fetch_latest
import risk
from auth import (hash_password, issue_reset_code, issue_token, require_admin,
                  require_client, require_device, use_reset_code, verify_password)
from db import TH_TZ, get_conn, latest_station_readings, now_th, upsert_station
from schemas import (AlertIn, DeviceReadingIn, ForgotPasswordIn, IncidentIn, IncidentStatusIn,
                     LoginIn, PumpCommandIn, ResetPasswordIn, SignupIn)
from seed import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ตอนเริ่ม: สร้างตารางและใส่ข้อมูลตั้งต้น (รันซ้ำได้ เผื่อ hosting ฟรีล้างไฟล์ .db)
    seed()
    # เริ่มเธรดดึงข้อมูล (POPNIX ทุก 10 นาที รอบแรกทันที แล้ว backfill) และสั่งหยุดตอนปิด server
    stop = fetch_latest.start_background()
    yield
    stop.set()


app = FastAPI(title="GunWaree API", lifespan=lifespan)

# CORS: อนุญาตหน้าเว็บของรักษ์ (Live Server) ทั้งสอง origin
# ตอน deploy ให้เพิ่มโดเมน Vercel เข้ามาใน list นี้
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500", "http://localhost:5500"],
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# 50 เขตของกรุงเทพฯ (ชื่อตรงกับช่อง district ของ POPNIX ตรวจแล้ว)
BANGKOK_DISTRICTS = [
    "พระนคร", "ดุสิต", "หนองจอก", "บางรัก", "บางเขน", "บางกะปิ", "ปทุมวัน", "ป้อมปราบศัตรูพ่าย",
    "พระโขนง", "มีนบุรี", "ลาดกระบัง", "ยานนาวา", "สัมพันธวงศ์", "พญาไท", "ธนบุรี", "บางกอกใหญ่",
    "ห้วยขวาง", "คลองสาน", "ตลิ่งชัน", "บางกอกน้อย", "บางขุนเทียน", "ภาษีเจริญ", "หนองแขม",
    "ราษฎร์บูรณะ", "บางพลัด", "ดินแดง", "บึงกุ่ม", "สาทร", "บางซื่อ", "จตุจักร", "บางคอแหลม",
    "ประเวศ", "คลองเตย", "สวนหลวง", "จอมทอง", "ดอนเมือง", "ราชเทวี", "ลาดพร้าว", "วัฒนา", "บางแค",
    "หลักสี่", "สายไหม", "คันนายาว", "สะพานสูง", "วังทองหลาง", "คลองสามวา", "บางนา", "ทวีวัฒนา",
    "ทุ่งครุ", "บางบอน",
]
ROAD_FRESH_MINUTES = 30  # จุดวัดถนนที่ไม่ส่งค่าเกิน 30 นาที POPNIX ถือว่าขัดข้อง (off) ไม่นับ
LEVEL_ORDER = {"danger": 0, "high": 1, "medium": 2, "safe": 3, "nodata": 4}
PUMP_MAX_RUN_S = 60     # backend ตอบ on ได้ไม่เกิน 60 วินาทีหลังสร้างคำสั่ง
PUMP_COOLDOWN_S = 70    # สั่ง on ใหม่ได้หลัง 70 วินาที (60 ที่ปั๊มทำงาน + 10 เผื่อบอร์ดปลดล็อก)


def _water_source(conn) -> str:
    """ใช้ POPNIX ถ้ามีสถานีแล้วและยังไม่ถูกสลับเป็น sim (ล้ม 3 รอบติด) ไม่เช่นนั้นใช้ sim
    ตัดสินทั้งระบบ ไม่แยกตาม kind เพื่อไม่ให้ค่าจริงกับค่าจำลองปนกันในคำตอบเดียว"""
    has_popnix = conn.execute("SELECT 1 FROM stations WHERE source = 'popnix' LIMIT 1").fetchone()
    return "popnix" if has_popnix and fetch_latest.active_source != "sim" else "sim"


def _seconds_since(ts: Optional[str]) -> Optional[float]:
    """จำนวนวินาทีจากเวลาไทย "YYYY-MM-DD HH:MM:SS" ถึงตอนนี้ คืน None ถ้าไม่มีเวลา"""
    if not ts:
        return None
    then = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S").replace(tzinfo=TH_TZ)
    return (datetime.now(TH_TZ) - then).total_seconds()


def _latest_pump_command(conn, region: str):
    return conn.execute(
        "SELECT id, command, created_at, executed_at FROM pump_commands "
        "WHERE region = ? ORDER BY id DESC LIMIT 1",
        (region,),
    ).fetchone()


def _district_level(depths: list[float]) -> str:
    """ระดับของเขตตามตารางในแผน (danger เป็นข้อเสนอ: ลึกตั้งแต่ 30 ซม. หรือท่วมเกิน 10 ซม. ตั้งแต่ 2 จุด)"""
    if not depths:
        return "nodata"
    deepest = max(depths)
    if deepest >= 30 or sum(d > 10 for d in depths) >= 2:
        return "danger"
    if deepest > 10:
        return "high"
    if deepest >= 5:
        return "medium"
    return "safe"


def _district_summary(conn) -> list[dict]:
    """สรุปจุดวัดน้ำท่วมถนนรายเขต นับเฉพาะจุดที่ส่งค่าภายใน 30 นาที"""
    fresh_after = (datetime.now(TH_TZ) - timedelta(minutes=ROAD_FRESH_MINUTES)).strftime("%Y-%m-%d %H:%M:%S")
    points: dict[str, list[dict]] = {d: [] for d in BANGKOK_DISTRICTS}
    for r in latest_station_readings(conn, [_water_source(conn)], "road"):
        if (r["district"] in points and r["depth_cm"] is not None
                and r["measured_at"] and r["measured_at"] >= fresh_after):
            points[r["district"]].append(r)
    result = []
    for district, rows in points.items():
        depths = [r["depth_cm"] for r in rows]
        lats = [r["lat"] for r in rows if r["lat"] is not None]
        lons = [r["lon"] for r in rows if r["lon"] is not None]
        result.append({
            "district": district,
            "road_points": len(rows),
            "max_depth_cm": max(depths) if depths else None,
            "flooded_points": sum(d > 10 for d in depths),
            "level": _district_level(depths),
            "measured_at": max(r["measured_at"] for r in rows) if rows else None,
            # พิกัดเขตโดยประมาณ = ค่าเฉลี่ยของจุดวัดในเขต
            "lat": round(sum(lats) / len(lats), 5) if lats else None,
            "lon": round(sum(lons) / len(lons), 5) if lons else None,
        })
    return result


# ---------- ทั่วไป ----------

@app.get("/health")
def health():
    return {"status": "ok"}


# ---------- ข้อมูลน้ำ (guest เรียกได้) ----------

@app.get("/stations/latest")
def stations_latest(
    kind: Optional[Literal["canal", "river", "road", "rain"]] = None,
    scope: Literal["bangkok", "bangkok_test"] = "bangkok",
):
    conn = get_conn()
    try:
        if scope == "bangkok_test":
            return latest_station_readings(conn, ["esp32"], kind)
        return latest_station_readings(conn, [_water_source(conn)], kind)
    finally:
        conn.close()


@app.get("/districts/latest")
def districts_latest():
    conn = get_conn()
    try:
        return [{k: d[k] for k in ("district", "road_points", "max_depth_cm", "level", "measured_at")}
                for d in _district_summary(conn)]
    finally:
        conn.close()


@app.get("/dams/latest")
def dams_latest():
    conn = get_conn()
    try:
        rows = conn.execute(
            """SELECT d.name, d.province, d.lat, d.lon, r.pct, r.volume, r.inflow, r.outflow,
                      d.capacity, r.measured_at
               FROM dams d
               LEFT JOIN dam_readings r ON r.id = (
                   SELECT id FROM dam_readings WHERE dam_id = d.id ORDER BY measured_at DESC LIMIT 1
               )
               ORDER BY d.id"""
        ).fetchall()
    finally:
        conn.close()
    result = []
    for r in rows:
        dam = dict(r)
        is_chao_phraya = dam["name"] == "เจ้าพระยา"
        # เรียงช่องตามตัวอย่าง: ... capacity, source, measured_at (+ note ของเจ้าพระยา)
        dam["source"] = "popnix" if is_chao_phraya else "rid"
        dam["measured_at"] = dam.pop("measured_at")
        if is_chao_phraya:
            flow = dam["outflow"]
            dam["note"] = (f"ค่าการไหลสถานี C.13 ({round(flow / fetch_latest.M3S_TO_MCM_PER_DAY):,} "
                           "ลบ.ม./วินาที) แปลงหน่วยแล้ว" if flow is not None
                           else "ค่าการไหลสถานี C.13 แปลงหน่วยแล้ว")
        result.append(dam)
    return result


@app.get("/stations/history")
def stations_history(
    code: str = Query(min_length=1, max_length=32),
    kind: Literal["canal", "river", "road", "rain"] = "river",
    hours: int = Query(default=24, ge=1, le=72),
):
    """ค่าย้อนหลังของสถานีเดียว เรียงจากเก่าไปใหม่ ใช้วาดกราฟ (เช่นอยุธยา code=39 ในหน้า admin)
    เก็บย้อนหลังได้ราว 72 ชม. ตาม backfill ค่าเป็นค่าดิบ ไม่ผ่าน guard จุดกระโดดของ /risk"""
    conn = get_conn()
    try:
        source = _water_source(conn)
        station = conn.execute(
            "SELECT id, code, name, kind, bank, warn, crit FROM stations "
            "WHERE source = ? AND kind = ? AND code = ?",
            (source, kind, code),
        ).fetchone()
        if station is None:
            raise HTTPException(status_code=404, detail="ไม่พบสถานี")
        since = (datetime.now(TH_TZ) - timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S")
        rows = conn.execute(
            "SELECT water_level, depth_cm, rain_24h, measured_at FROM readings "
            "WHERE station_id = ? AND measured_at >= ? ORDER BY measured_at",
            (station["id"], since),
        ).fetchall()
    finally:
        conn.close()
    info = {k: station[k] for k in ("code", "name", "kind", "bank", "warn", "crit")}
    return {**info, "source": source, "hours": hours, "readings": [dict(r) for r in rows]}


@app.get("/risk")
def get_risk():
    conn = get_conn()
    try:
        return risk.predict(conn)
    except risk.NoRecentData:
        raise HTTPException(status_code=503, detail="ยังไม่มีข้อมูลล่าสุดให้ทาย")
    finally:
        conn.close()


# ---------- ผู้ใช้ ----------

@app.post("/auth/signup", status_code=201)
def signup(body: SignupIn):
    email = body.email.lower()
    conn = get_conn()
    try:
        taken = conn.execute(
            "SELECT 1 FROM users WHERE username = ? OR email = ?", (body.username, email)
        ).fetchone()
        if taken:
            raise HTTPException(status_code=409, detail="ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้แล้ว")
        try:
            # role กำหนดตายตัวเป็น client ห้ามรับจากผู้สมัคร
            cur = conn.execute(
                "INSERT INTO users (username, email, password_hash, role, created_at) "
                "VALUES (?, ?, ?, 'client', ?)",
                (body.username, email, hash_password(body.password), now_th()),
            )
            conn.commit()
        except sqlite3.IntegrityError:  # มีคนสมัครชื่อเดียวกันแทรกเข้ามาพร้อมกัน
            raise HTTPException(status_code=409, detail="ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้แล้ว")
        return {"id": cur.lastrowid, "username": body.username, "role": "client"}
    finally:
        conn.close()


@app.post("/auth/login")
def login(body: LoginIn):
    conn = get_conn()
    try:
        user = conn.execute(
            "SELECT id, password_hash, role FROM users WHERE username = ?", (body.username,)
        ).fetchone()
        if not verify_password(body.password, user["password_hash"] if user else None):
            raise HTTPException(status_code=401, detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
        token = issue_token(conn, user["id"])
        conn.commit()
        return {"token": token, "role": user["role"]}
    finally:
        conn.close()


@app.post("/auth/forgot-password")
def forgot_password(body: ForgotPasswordIn):
    conn = get_conn()
    try:
        user = conn.execute("SELECT id FROM users WHERE email = ?", (body.email.lower(),)).fetchone()
        if user:
            code = issue_reset_code(conn, user["id"])
            conn.commit()
            # โหมดจำลอง: พิมพ์รหัสใน terminal ของ server ไม่ส่งอีเมลจริงและไม่ใส่ในคำตอบ
            print(f"[forgot-password] {body.email.lower()} code={code} (หมดอายุใน 15 นาที)")
    finally:
        conn.close()
    # ตอบเหมือนกันเสมอ ไม่บอกว่าอีเมลนี้มีในระบบหรือไม่
    return {"message": "ถ้าอีเมลนี้อยู่ในระบบ เราได้ออกรหัสให้แล้ว"}


@app.post("/auth/reset-password")
def reset_password(body: ResetPasswordIn):
    conn = get_conn()
    try:
        user = conn.execute("SELECT id FROM users WHERE email = ?", (body.email.lower(),)).fetchone()
        if user is None or not use_reset_code(conn, user["id"], body.code):
            raise HTTPException(status_code=400, detail="รหัสไม่ถูกต้องหรือหมดอายุ")
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                     (hash_password(body.new_password), user["id"]))
        # เปลี่ยนรหัสแล้วให้ token เดิมทั้งหมดใช้ไม่ได้ ต้อง login ใหม่
        conn.execute("DELETE FROM auth_tokens WHERE user_id = ?", (user["id"],))
        conn.commit()
        return {"message": "เปลี่ยนรหัสผ่านแล้ว"}
    finally:
        conn.close()


# ---------- แจ้งเตือนและแจ้งเหตุ ----------

@app.get("/alerts")
def alerts():
    # เปิดสาธารณะ ไม่ตรวจ token (header Authorization ที่ส่งมาถูกเมิน)
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT id, message, severity, sent_at FROM alerts WHERE status = 'sent' "
            "ORDER BY sent_at DESC, id DESC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/incidents", status_code=201)
def create_incident(body: IncidentIn, user: dict = Depends(require_client)):
    now = now_th()
    conn = get_conn()
    try:
        # user_id มาจาก token เท่านั้น ไม่รับจากผู้ใช้
        cur = conn.execute(
            "INSERT INTO incident_reports (user_id, description, address, phone, lat, lon, status, "
            "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?)",
            (user["id"], body.description, body.address, body.phone, body.lat, body.lon, now, now),
        )
        conn.commit()
        return {"id": cur.lastrowid, "status": "new"}
    finally:
        conn.close()


@app.get("/incidents/mine")
def my_incidents(user: dict = Depends(require_client)):
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT id, description, address, phone, lat, lon, status, created_at, updated_at "
            "FROM incident_reports WHERE user_id = ? ORDER BY id DESC",
            (user["id"],),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ---------- admin ----------

@app.get("/admin/alerts")
def admin_alerts(status: Optional[Literal["pending", "sent"]] = None,
                 admin: dict = Depends(require_admin)):
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT id, message, severity, status, created_at FROM alerts "
            "WHERE (? IS NULL OR status = ?) ORDER BY id DESC",
            (status, status),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/admin/alerts", status_code=201)
def admin_create_alert(body: AlertIn, admin: dict = Depends(require_admin)):
    now = now_th()
    conn = get_conn()
    try:
        # รออนุมัติก่อนเสมอ ขึ้นใน /alerts เมื่อกด /admin/alerts/{id}/send
        cur = conn.execute(
            "INSERT INTO alerts (message, severity, status, created_by, created_at) "
            "VALUES (?, ?, 'pending', ?, ?)",
            (body.message, body.severity, admin["id"], now),
        )
        conn.commit()
        return {"id": cur.lastrowid, "message": body.message, "severity": body.severity,
                "status": "pending", "created_at": now}
    finally:
        conn.close()


@app.post("/admin/alerts/{alert_id}/send")
def admin_send_alert(alert_id: int, admin: dict = Depends(require_admin)):
    conn = get_conn()
    try:
        row = conn.execute("SELECT status, sent_at FROM alerts WHERE id = ?", (alert_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="ไม่พบแจ้งเตือน")
        sent_at = row["sent_at"]
        if row["status"] != "sent":  # ส่งซ้ำไม่เปลี่ยนเวลาที่ส่งครั้งแรก
            sent_at = now_th()
            conn.execute("UPDATE alerts SET status = 'sent', sent_at = ? WHERE id = ?", (sent_at, alert_id))
            conn.commit()
        return {"id": alert_id, "status": "sent", "sent_at": sent_at}
    finally:
        conn.close()


@app.get("/admin/incidents")
def admin_incidents(admin: dict = Depends(require_admin)):
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT i.id, i.user_id, u.username, i.description, i.address, i.phone, i.lat, i.lon, "
            "i.status, i.created_at, i.updated_at FROM incident_reports i LEFT JOIN users u ON u.id = i.user_id "
            "ORDER BY i.id DESC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.patch("/admin/incidents/{incident_id}")
def admin_update_incident(incident_id: int, body: IncidentStatusIn, admin: dict = Depends(require_admin)):
    now = now_th()
    conn = get_conn()
    try:
        cur = conn.execute(
            "UPDATE incident_reports SET status = ?, updated_at = ? WHERE id = ?",
            (body.status, now, incident_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="ไม่พบแจ้งเหตุ")
        conn.commit()
        return {"id": incident_id, "status": body.status, "updated_at": now}
    finally:
        conn.close()


@app.post("/admin/pump-commands", status_code=201)
def admin_pump_command(body: PumpCommandIn, admin: dict = Depends(require_admin)):
    now = now_th()
    conn = get_conn()
    try:
        if body.command == "on":
            # ห้ามสั่ง on ซ้ำระหว่างที่คำสั่ง on ล่าสุดยังไม่ครบ 70 วินาที (off สั่งได้เสมอ และยกเลิกการรอ)
            last = _latest_pump_command(conn, body.region)
            if last is not None and last["command"] == "on":
                elapsed = _seconds_since(last["created_at"])
                if elapsed is not None and elapsed < PUMP_COOLDOWN_S:
                    raise HTTPException(status_code=409, detail="ปั๊มยังทำงานอยู่ รอครบเวลาก่อน")
        # บันทึกว่าใครสั่ง (created_by) จาก token
        cur = conn.execute(
            "INSERT INTO pump_commands (region, command, status, created_by, created_at) "
            "VALUES (?, ?, 'pending', ?, ?)",
            (body.region, body.command, admin["id"], now),
        )
        conn.commit()
        return {"id": cur.lastrowid, "region": body.region, "command": body.command,
                "status": "pending", "created_at": now}
    finally:
        conn.close()


@app.get("/admin/pump-status")
def admin_pump_status(region: Literal["bangkok_test"], admin: dict = Depends(require_admin)):
    """อ่านอย่างเดียว ห้ามเขียน DB ตัวเลขใช้กติกาเดียวกับ /device/pump-command และ 409 ของ pump-commands"""
    conn = get_conn()
    try:
        last = _latest_pump_command(conn, region)
        seen = conn.execute(
            "SELECT MAX(r.measured_at) AS t FROM readings r JOIN stations s ON s.id = r.station_id "
            "WHERE s.source = 'esp32'"
        ).fetchone()
    finally:
        conn.close()
    seconds_left = cooldown_left = 0
    if last is not None and last["command"] == "on":
        age = _seconds_since(last["created_at"])
        if age is not None:  # ไม่มีเวลาสร้าง บอร์ดได้ off และสั่ง on ใหม่ได้ จึงเป็น 0
            seconds_left = max(0, math.ceil(PUMP_MAX_RUN_S - age))
            cooldown_left = max(0, math.ceil(PUMP_COOLDOWN_S - age))
    return {
        "region": region,
        "pump": "on" if seconds_left > 0 else "off",
        "seconds_left": seconds_left,
        "cooldown_left_s": cooldown_left,
        "can_send_on": cooldown_left == 0,
        "acknowledged": last is not None and last["executed_at"] is not None,
        "last_command": ({k: last[k] for k in ("id", "command", "created_at", "executed_at")}
                         if last is not None else None),
        "board_last_seen": seen["t"],
    }


@app.get("/admin/predictions")
def admin_predictions(admin: dict = Depends(require_admin)):
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT id, target_station, risk_percent, horizon_hours, predicted_for, created_at, "
            "actual_outcome, input_json FROM predictions ORDER BY id DESC LIMIT 200"
        ).fetchall()
    finally:
        conn.close()
    result = []
    for r in rows:
        p = dict(r)
        level = json.loads(p.pop("input_json") or "{}").get("level")
        result.append({"id": p["id"], "target_station": p["target_station"],
                       "risk_percent": p["risk_percent"], "level": level,
                       "horizon_hours": p["horizon_hours"], "predicted_for": p["predicted_for"],
                       "created_at": p["created_at"], "actual_outcome": p["actual_outcome"]})
    return result


@app.get("/admin/affected-areas")
def admin_affected_areas(admin: dict = Depends(require_admin)):
    conn = get_conn()
    try:
        districts = _district_summary(conn)
    finally:
        conn.close()
    monitored = [d for d in districts if d["level"] != "nodata"]
    monitored.sort(key=lambda d: (LEVEL_ORDER[d["level"]], -(d["max_depth_cm"] or 0)))
    times = [d["measured_at"] for d in monitored if d["measured_at"]]
    return {
        "monitored_districts": len(monitored),
        "updated_at": max(times) if times else None,
        "areas": [{k: d[k] for k in ("district", "level", "max_depth_cm", "flooded_points",
                                     "road_points", "lat", "lon")} for d in monitored],
    }


# ---------- อุปกรณ์ ESP32 (X-Device-Key) ----------

@app.post("/device/readings", status_code=201, dependencies=[Depends(require_device)])
def device_reading(body: DeviceReadingIn):
    now = now_th()  # เวลา backend ตั้งเอง ไม่รับจากบอร์ด
    conn = get_conn()
    try:
        station_id = upsert_station(conn, "esp32", {
            "code": body.device_id, "kind": "canal", "name": "ชุดทดลอง ESP32",
        })
        # บอร์ดส่งเป็น cm เก็บเป็นเมตร distance_cm ไม่เก็บ
        conn.execute(
            "INSERT OR REPLACE INTO readings (station_id, water_level, status, measured_at) "
            "VALUES (?, ?, ?, ?)",
            (station_id, body.water_level_cm / 100, body.status, now),
        )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.get("/device/pump-command", dependencies=[Depends(require_device)])
def device_pump_command(region: Literal["bangkok_test"]):
    conn = get_conn()
    try:
        last = _latest_pump_command(conn, region)
        if last is None or last["command"] != "on":
            return {"pump": "off"}
        elapsed = _seconds_since(last["created_at"])
        if elapsed is None or elapsed >= PUMP_MAX_RUN_S:
            return {"pump": "off"}  # ครบเวลาแล้ว backend หยุดตอบ on เอง
        if last["executed_at"] is None:  # บอร์ดรับคำสั่งนี้ครั้งแรก
            conn.execute(
                "UPDATE pump_commands SET executed_at = ?, status = 'executed' "
                "WHERE id = ? AND executed_at IS NULL",
                (now_th(), last["id"]),
            )
            conn.commit()
        return {"pump": "on", "max_run_s": PUMP_MAX_RUN_S}
    finally:
        conn.close()
