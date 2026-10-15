from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

# รูปแบบอีเมลอย่างง่าย (ไม่ใช้ EmailStr เพราะต้องติดตั้ง email-validator เพิ่ม)
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


def _bcrypt_limit(v: str) -> str:
    # bcrypt รับรหัสได้ไม่เกิน 72 ไบต์ (ภาษาไทย 1 ตัวอักษร = 3 ไบต์)
    if len(v.encode()) > 72:
        raise ValueError("รหัสผ่านยาวเกิน 72 ไบต์")
    return v


class SignupIn(BaseModel):
    # ห้ามมีช่อง role: ผู้สมัครทุกคนเป็น client เสมอ ช่องที่ไม่รู้จักถูกตัดทิ้ง
    username: str = Field(min_length=3, max_length=32)
    email: str = Field(max_length=254, pattern=EMAIL_PATTERN)
    password: str = Field(min_length=8)

    _check_password = field_validator("password")(_bcrypt_limit)


class LoginIn(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class ForgotPasswordIn(BaseModel):
    email: str = Field(max_length=254, pattern=EMAIL_PATTERN)


class ResetPasswordIn(BaseModel):
    email: str = Field(max_length=254, pattern=EMAIL_PATTERN)
    code: str = Field(min_length=1, max_length=64)
    new_password: str = Field(min_length=8)

    _check_password = field_validator("new_password")(_bcrypt_limit)


class IncidentIn(BaseModel):
    description: str = Field(min_length=1, max_length=2000)
    address: Optional[str] = Field(default=None, max_length=500)
    phone: Optional[str] = Field(default=None, max_length=20)
    # พิกัดไม่บังคับ แต่ต้องส่งคู่กัน strict ไม่รับตัวเลขที่เป็นข้อความ ไม่รับ NaN/inf
    lat: Optional[float] = Field(default=None, ge=-90, le=90, strict=True, allow_inf_nan=False)
    lon: Optional[float] = Field(default=None, ge=-180, le=180, strict=True, allow_inf_nan=False)

    @model_validator(mode="after")
    def _lat_lon_pair(self):
        if (self.lat is None) != (self.lon is None):
            raise ValueError("lat และ lon ต้องส่งคู่กัน หรือไม่ส่งเลย")
        return self


class IncidentStatusIn(BaseModel):
    status: Literal["new", "in_progress", "resolved"]


class AlertIn(BaseModel):
    # ตัดช่องว่างหัวท้ายก่อนนับความยาว ข้อความว่างหรือมีแต่ช่องว่างจึงตอบ 422
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    severity: Literal["watch", "warning", "critical"] = "watch"


class PumpCommandIn(BaseModel):
    region: Literal["bangkok_test"]
    command: Literal["on", "off"]


class DeviceReadingIn(BaseModel):
    device_id: str = Field(pattern=r"^esp32-[0-9]{2}$")  # เช่น esp32-01
    water_level_cm: float = Field(ge=-50, le=1000)
    status: Literal["green", "yellow", "red"]
    distance_cm: Optional[float] = None  # ไม่บังคับ ไว้ตรวจปัญหา backend ไม่ใช้คำนวณ
