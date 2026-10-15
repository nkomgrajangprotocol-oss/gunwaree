import hashlib
import os
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import bcrypt
from dotenv import load_dotenv
from fastapi import Depends, Header, HTTPException

from db import TH_TZ, get_conn, now_th

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

FMT = "%Y-%m-%d %H:%M:%S"
TOKEN_TTL_HOURS = 24
RESET_CODE_TTL_MINUTES = 15

# แฮชไว้เทียบเมื่อไม่พบชื่อผู้ใช้ ให้ login ที่ชื่อผิดใช้เวลาพอๆ กับรหัสผิด (เดาชื่อผู้ใช้จากเวลาได้ยากขึ้น)
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password", bcrypt.gensalt()).decode()


# ---------- รหัสผ่าน ----------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: Optional[str]) -> bool:
    """password_hash = None (ไม่พบผู้ใช้) ยังเทียบกับ hash หลอกเพื่อให้ใช้เวลาเท่ากัน แล้วตอบ False"""
    try:
        ok = bcrypt.checkpw(password.encode(), (password_hash or _DUMMY_HASH).encode())
    except ValueError:  # รหัสยาวเกิน 72 ไบต์ หรือ hash ผิดรูป
        return False
    return ok and password_hash is not None


# ---------- token และรหัสชั่วคราว ----------

def sha256(value: str) -> str:
    """token และรหัสชั่วคราวสุ่มยาวพอแล้ว แฮชด้วย SHA-256 ก็พอ (ไม่ต้องช้าแบบ bcrypt)"""
    return hashlib.sha256(value.encode()).hexdigest()


def _after(**delta) -> str:
    return (datetime.now(TH_TZ) + timedelta(**delta)).strftime(FMT)


def issue_token(conn, user_id: int) -> str:
    """ออก token ใหม่ เก็บเฉพาะ hash พร้อมวันหมดอายุ ผู้เรียกต้อง commit"""
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO auth_tokens (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (user_id, sha256(token), now_th(), _after(hours=TOKEN_TTL_HOURS)),
    )
    return token


def issue_reset_code(conn, user_id: int) -> str:
    """รหัสชั่วคราวอายุ 15 นาที ใช้ได้ครั้งเดียว เก็บเฉพาะ hash ผู้เรียกต้อง commit"""
    code = secrets.token_urlsafe(6)
    conn.execute(
        "INSERT INTO password_resets (user_id, code_hash, created_at, expires_at, used) "
        "VALUES (?, ?, ?, ?, 0)",
        (user_id, sha256(code), now_th(), _after(minutes=RESET_CODE_TTL_MINUTES)),
    )
    return code


def use_reset_code(conn, user_id: int, code: str) -> bool:
    """ตรวจรหัสที่ยังไม่ใช้และยังไม่หมดอายุ ถ้าถูกให้ทำเครื่องหมายว่าใช้แล้ว ผู้เรียกต้อง commit"""
    row = conn.execute(
        "SELECT id FROM password_resets "
        "WHERE user_id = ? AND code_hash = ? AND used = 0 AND expires_at > ?",
        (user_id, sha256(code), now_th()),
    ).fetchone()
    if row is None:
        return False
    conn.execute("UPDATE password_resets SET used = 1 WHERE id = ?", (row["id"],))
    return True


# ---------- dependency ที่ endpoint เรียก ----------

def current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    """อ่าน Authorization: Bearer <token> คืน {id, username, role} หรือ 401"""
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="กรุณาเข้าสู่ระบบ")
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT u.id, u.username, u.role FROM auth_tokens t JOIN users u ON u.id = t.user_id "
            "WHERE t.token_hash = ? AND t.expires_at > ?",
            (sha256(token.strip()), now_th()),
        ).fetchone()
    finally:
        conn.close()
    if row is None:  # ไม่พบ หรือหมดอายุแล้ว
        raise HTTPException(status_code=401, detail="กรุณาเข้าสู่ระบบ")
    return dict(row)


def require_admin(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="ต้องเป็น admin")
    return user


def require_client(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "client":
        raise HTTPException(status_code=403, detail="สำหรับผู้ใช้ทั่วไปเท่านั้น")
    return user


def require_device(x_device_key: Optional[str] = Header(default=None)) -> None:
    """ตรวจ X-Device-Key กับ DEVICE_KEY ใน .env แบบเวลาคงที่ ถ้ายังไม่ได้ตั้งค่า ปฏิเสธทุกคำขอ"""
    expected = os.getenv("DEVICE_KEY")
    if not expected or not x_device_key or not secrets.compare_digest(
        x_device_key.encode(), expected.encode()
    ):
        raise HTTPException(status_code=401, detail="รหัสอุปกรณ์ไม่ถูกต้อง")
