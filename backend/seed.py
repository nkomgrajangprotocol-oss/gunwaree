import os

from auth import hash_password  # import auth จะโหลด .env ที่รากของ repo ให้ด้วย
from db import get_conn, init_db, now_th

# เขื่อน 5 แห่งตามตัวอย่าง /dams/latest ในแผน (capacity ล้าน ลบ.ม. = storage ของ RID)
# พิกัดภูมิพลเป็นค่าโดยประมาณ แผนระบุว่าต้องตรวจ, เจ้าพระยาไม่มี capacity ใช้ค่าการไหล C.13 แทน
DAMS = [
    ("ภูมิพล", "ตาก", 17.24, 98.97, 13462),
    ("สิริกิติ์", "อุตรดิตถ์", 17.76389, 100.56333, 9510),
    ("แควน้อยบำรุงแดน", "พิษณุโลก", 17.18407, 100.41524, 939),
    ("ป่าสักชลสิทธิ์", "ลพบุรี", 14.85666, 101.07687, 871.5),
    ("เจ้าพระยา", "ชัยนาท", 15.16384, 100.18792, None),
]

# แจ้งเตือนตั้งต้นสำหรับ prototype: 1 ส่งแล้ว (ให้กระดิ่งมีของ), 1 รออนุมัติ (ให้คิว admin มีของ)
ALERTS = [
    ("ระดับน้ำที่อยุธยาใกล้ตลิ่ง ติดตามใกล้ชิด", "warning", "sent"),
    ("ระดับน้ำที่อยุธยาเริ่มสูง", "watch", "pending"),
]

# สถานีตัวอย่างติดป้าย sim ใช้ค่าจากตัวอย่าง JSON ในแผน (เวลาของค่าคงเป็นของวันที่ 14 ต.ค.)
# (code, name, kind, lat, lon, district, bank, water_level, depth_cm, rain_24h, measured_at)
SIM_STATIONS = [
    ("1", "คลองลาดพร้าว วัดบางบัว", "canal", 13.85402, 100.58746, None, 2.2,
     1.43, None, None, "2026-10-14 08:10:00"),
    ("4", "สะพานกรุงเทพ", "river", 13.700301, 100.49277, None, 2.16,
     1.74, None, None, "2026-10-14 08:10:00"),
    ("FL.BBN.01", "ถ.เอกชัย (ห้างบิ๊กซี)", "road", 13.67942, 100.43563, "บางบอน", None,
     None, 0, None, "2026-10-14 13:05:00"),
    ("2072", "กรมทรัพยากรน้ำ", "rain", 13.785535, 100.53908, "พญาไท", None,
     None, None, 4.5, "2026-10-14 13:00:00"),
]


def seed_admin(conn) -> int | None:
    """สร้าง admin คนแรกจาก .env ถ้ายังไม่มีชื่อนี้ คืน id ของ admin (None ถ้าไม่ได้ตั้งค่า)"""
    username = os.getenv("ADMIN_USERNAME")
    password = os.getenv("ADMIN_PASSWORD")
    if not username or not password:
        print("ข้าม admin: ยังไม่ได้ตั้ง ADMIN_USERNAME หรือ ADMIN_PASSWORD ใน .env")
        return None

    row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if row:
        return row["id"]  # มีแล้ว ไม่แก้รหัสผ่านเดิม

    if len(password.encode()) > 72:
        print("ข้าม admin: ADMIN_PASSWORD ยาวเกิน 72 ไบต์ ซึ่ง bcrypt รับไม่ได้")
        return None

    password_hash = hash_password(password)
    # ตาราง users บังคับ email แต่ .env ไม่มีอีเมล admin จึงใช้ที่อยู่สมมติที่ส่งจริงไม่ได้
    email = f"{username}@admin.invalid"
    cur = conn.execute(
        "INSERT INTO users (username, email, password_hash, role, created_at) "
        "VALUES (?, ?, ?, 'admin', ?)",
        (username, email, password_hash, now_th()),
    )
    return cur.lastrowid


def seed_dams(conn) -> None:
    conn.executemany(
        "INSERT OR IGNORE INTO dams (name, province, lat, lon, capacity) VALUES (?, ?, ?, ?, ?)",
        DAMS,
    )


def seed_alerts(conn, admin_id: int | None) -> None:
    for message, severity, status in ALERTS:
        exists = conn.execute("SELECT 1 FROM alerts WHERE message = ?", (message,)).fetchone()
        if exists:
            continue
        now = now_th()
        conn.execute(
            "INSERT INTO alerts (message, severity, status, created_by, created_at, sent_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (message, severity, status, admin_id, now, now if status == "sent" else None),
        )


def seed_sim_stations(conn) -> None:
    for (code, name, kind, lat, lon, district, bank,
         water_level, depth_cm, rain_24h, measured_at) in SIM_STATIONS:
        conn.execute(
            "INSERT OR IGNORE INTO stations (source, code, name, kind, lat, lon, district, bank) "
            "VALUES ('sim', ?, ?, ?, ?, ?, ?, ?)",
            (code, name, kind, lat, lon, district, bank),
        )
        station_id = conn.execute(
            "SELECT id FROM stations WHERE source = 'sim' AND kind = ? AND code = ?", (kind, code)
        ).fetchone()["id"]
        # UNIQUE(station_id, measured_at) กันแถวซ้ำเมื่อรันซ้ำ
        conn.execute(
            "INSERT OR IGNORE INTO readings (station_id, water_level, depth_cm, rain_24h, measured_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (station_id, water_level, depth_cm, rain_24h, measured_at),
        )


def seed() -> None:
    """สร้างตารางและใส่ข้อมูลตั้งต้น รันซ้ำกี่ครั้งก็ไม่เกิดแถวซ้ำ"""
    init_db()
    conn = get_conn()
    try:
        admin_id = seed_admin(conn)
        seed_dams(conn)
        seed_alerts(conn, admin_id)
        seed_sim_stations(conn)
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    seed()
    conn = get_conn()
    for table in ("users", "dams", "alerts", "stations", "readings"):
        # ชื่อตารางมาจาก tuple คงที่ข้างบน ไม่ได้รับจากภายนอก
        count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"{table}: {count}")
    conn.close()
