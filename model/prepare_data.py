"""ขั้น 1: ตรวจข้อมูล กรองค่าผิดปกติ รวมเป็นรายชั่วโมง สร้างตัวแปรและ label แล้วแบ่งเทรน/ทดสอบตามเวลา

รันจากรากของ repo:  venv/bin/python model/prepare_data.py
อ่าน data/*.csv อย่างเดียว เขียนผลเป็น data/features_train.csv และ data/features_test.csv

ลำดับการทำความสะอาดระดับน้ำ: ตัดค่าเกินตลิ่ง + 3 ม. แล้วตัดจุดกระโดด (ห่างจาก rolling median
แบบ centered 7 ค่าเกิน 1 ม.) ทั้งสองขั้นทำบนค่าราย 10 นาทีก่อนปรับเป็นรายชั่วโมงและก่อนเติมค่าล่าสุด

สมมติฐาน (ดูรายงานที่พิมพ์ออกมาประกอบ):
- เวลาในไฟล์ระดับน้ำและการไหลของ ThaiWater เป็นเวลาไทย ไม่มีเขตเวลากำกับ
- เวลาในไฟล์ฝน Open-Meteo ตรวจจากรูปแบบฝนรายชั่วโมงของวัน (ฝนไทยตกมากช่วงบ่ายถึงค่ำ)
- ค่าฝนของชั่วโมง t ของ Open-Meteo คือฝนสะสมของชั่วโมงก่อนหน้า (t-1, t] จึงรู้แล้ว ณ เวลา t
"""
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

BANK = {"ay": 5.06, "bkk": 2.16, "ns": 26.06}  # ตลิ่ง (ม.รทก.)
OUTLIER_MARGIN = 3.0                           # ตัดค่าที่สูงกว่าตลิ่ง + 3 ม.
SPIKE_W = 7                                    # rolling median แบบ centered 7 ค่า (70 นาที)
SPIKE_MIN_PERIODS = 4                          # ต้องมีค่าอย่างน้อย 4 ค่าในหน้าต่าง
SPIKE_T = 1.0                                  # ตัดเมื่อห่างจากมัธยฐานเกิน 1 ม. (ค่าตั้งต้น ไม่ปรับตามผล)
SPIKE_W_SENSITIVITY = (5, 7, 9)                # รายงานความไวเท่านั้น
SPIKE_T_SENSITIVITY = (0.5, 1.0, 2.0)
# เหตุการณ์จริงที่รู้อยู่ ใช้ตรวจว่ากฎตัดจุดกระโดดไม่กระทบเหตุการณ์จริง (ไม่ใช้เลือก W หรือ T)
KNOWN_EVENTS = [("2021-09-30", "2021-11-01"), ("2022-09-30", "2022-10-13"), ("2022-10-20", "2022-10-28"),
                ("2025-10-04", "2025-10-06"), ("2025-11-05", "2025-11-23")]
EVENT_GAP_DAYS = 3                             # วันเกินตลิ่งที่ห่างกันเกิน 3 วันนับเป็นคนละเหตุการณ์
FFILL_LIMIT = pd.Timedelta(hours=3)            # เติมค่าล่าสุดต่อได้ไม่เกิน 3 ชม.
HORIZON = pd.Timedelta(hours=24)               # label: ถึงตลิ่งภายใน 24 ชม.ข้างหน้า
LABEL_MIN_COVERAGE = 0.5                       # label = 0 ต้องมีค่าวัดอย่างน้อยครึ่งหนึ่งของช่วง
TEST_YEAR = 2025

# (ชื่อย่อ, ไฟล์, คอลัมน์ค่า, แถวตามแผน, สัดส่วนมีค่าตามแผน หรือ None ถ้าแผนไม่ระบุ)
FILES = [
    ("ay", "ayutthaya_stage.csv", "value", 315_648, 0.938),
    ("bkk", "bangkok_bridge_stage.csv", "value", 315_648, 0.927),
    ("ns", "nakhonsawan_stage.csv", "value", 315_648, 0.840),
    ("c13", "chaophraya_dam_c13_discharge.csv", "value", 52_608, 0.639),
    ("c2", "nakhonsawan_c2_discharge.csv", "value", 52_608, 0.633),
    ("rain_bkk", "rain_bangkok.csv", "precip_mm", 52_608, None),
    ("rain_ns", "rain_nakhonsawan.csv", "precip_mm", 52_608, None),
]
STATION_CODE = {"ay": 39, "bkk": 4, "ns": 568}
PLAN_OUTLIERS = {"bkk": 1, "ay": 4, "ns": 87}


def load(name: str, column: str) -> pd.Series:
    df = pd.read_csv(DATA / name)
    s = pd.Series(df[column].to_numpy(dtype=float), index=pd.to_datetime(df["time"]), name=name)
    return s


def report_files() -> dict[str, pd.Series]:
    print("=" * 70)
    print("1. ไฟล์ข้อมูล เทียบกับแผน")
    print("=" * 70)
    series = {}
    for key, name, column, plan_rows, plan_ratio in FILES:
        df = pd.read_csv(DATA / name, nrows=0)
        s = load(name, column)
        series[key] = s
        ratio = s.notna().mean()
        rows_ok = "ตรง" if len(s) == plan_rows else "ไม่ตรง"
        ratio_txt = f"{ratio:.1%}"
        if plan_ratio is not None:
            ratio_txt += f" (แผน {plan_ratio:.1%} {'ตรง' if round(ratio, 3) == plan_ratio else 'ไม่ตรง'})"
        print(f"- {name}: คอลัมน์ {list(df.columns)}")
        print(f"    แถว {len(s):,} (แผน {plan_rows:,} {rows_ok}), ช่วง {s.index.min()} ถึง {s.index.max()}")
        print(f"    มีค่าจริง {s.notna().sum():,} = {ratio_txt}, ค่าว่าง {s.isna().mean():.1%}")
        step = s.index.to_series().diff().dropna()
        print(f"    ระยะห่างเวลา: {step.value_counts().head(3).to_dict()}, เวลาซ้ำ {s.index.duplicated().sum()}")
    return series


def report_timezone(series: dict[str, pd.Series]) -> None:
    print()
    print("=" * 70)
    print("1b. เขตเวลา")
    print("=" * 70)
    for key in ("rain_bkk", "rain_ns"):
        s = series[key]
        by_hour = s.groupby(s.index.hour).mean()
        top = by_hour.sort_values(ascending=False).head(4).index.tolist()
        low = by_hour.sort_values().head(4).index.tolist()
        print(f"- {key}: ชั่วโมงที่ฝนเฉลี่ยมากสุด {top}, น้อยสุด {low}")
        print("    ฝนเฉลี่ยรายชั่วโมง (มม.): " + ", ".join(f"{h}:{v:.3f}" for h, v in by_hour.items()))
    print("  การอ่าน: ถ้าเป็นเวลาไทย ฝนควรสูงช่วงบ่ายถึงค่ำ (ราว 15 ถึง 21 น.)")
    print("           ถ้าเป็น UTC ช่วงเดียวกันจะเลื่อนไปอยู่ราว 8 ถึง 14")
    print("  ระดับน้ำและการไหล: ไม่มีเขตเวลากำกับ ถือว่าเป็นเวลาไทยตามที่ ThaiWater แสดง")


def filter_outliers(series: dict[str, pd.Series]) -> dict[str, pd.Series]:
    print()
    print("=" * 70)
    print("2. ตัดค่าระดับน้ำที่สูงกว่าตลิ่ง + 3 ม.")
    print("=" * 70)
    clean = dict(series)
    for key in ("bkk", "ay", "ns"):
        s = series[key]
        limit = BANK[key] + OUTLIER_MARGIN
        bad = s > limit
        clean[key] = s.mask(bad)
        mark = "ตรง" if bad.sum() == PLAN_OUTLIERS[key] else "ไม่ตรง"
        print(f"- สถานี {STATION_CODE[key]} (ตลิ่ง {BANK[key]}, ตัดเมื่อ > {limit:.2f}): "
              f"ตัด {bad.sum()} แถว (แผน {PLAN_OUTLIERS[key]} {mark})")
        if bad.any():
            sample = s[bad]
            print(f"    ตัวอย่าง: {sample.head(5).round(3).to_dict()}"
                  + (f" ... ค่าสูงสุด {sample.max():.3f}" if len(sample) > 5 else ""))
    return clean


def spike_mask(s: pd.Series, w: int = SPIKE_W, t: float = SPIKE_T) -> pd.Series:
    """True = ห่างจากมัธยฐานแบบ centered window w ค่า (ข้ามค่าว่าง ต้องมีอย่างน้อย 4 ค่า) เกิน t ม.
    ช่องที่มัธยฐานคำนวณไม่ได้ (ค่าในหน้าต่างไม่พอ) ไม่ถูกตัด
    ข้อมูลเป็นราย 10 นาทีที่เวลาเรียงห่างเท่ากันทุกแถว (ตรวจในข้อ 1) หน้าต่างนับตามแถวจึงเท่ากับ w × 10 นาที"""
    med = s.rolling(w, center=True, min_periods=SPIKE_MIN_PERIODS).median()
    return ((s - med).abs() > t).fillna(False).astype(bool)


def bank_days(s: pd.Series) -> pd.Series:
    daily_max = s.resample("D").max()
    return daily_max.index[daily_max >= BANK["ay"]].to_series()


def events(days: pd.Series) -> list[tuple[pd.Timestamp, pd.Timestamp, int]]:
    """รวมวันเกินตลิ่งเป็นเหตุการณ์ วันที่ห่างจากวันก่อนเกิน 3 วันเริ่มเหตุการณ์ใหม่ คืน [(วันเริ่ม, วันจบ, จำนวนวัน)]"""
    if days.empty:
        return []
    gap = days.diff().dt.days
    group = ((gap.isna()) | (gap > EVENT_GAP_DAYS)).cumsum()
    return [(g.iloc[0], g.iloc[-1], len(g)) for _, g in days.groupby(group.to_numpy())]


def per_year(items, key) -> pd.Series:
    return pd.Series([key(x).year for x in items], dtype=int).value_counts()


def remove_spikes(clean: dict[str, pd.Series]) -> dict[str, pd.Series]:
    print()
    print("=" * 70)
    print(f"2b. จุดกระโดด: rolling median แบบ centered W = {SPIKE_W} ค่า ({SPIKE_W * 10} นาที)"
          f" ต้องมีค่าอย่างน้อย {SPIKE_MIN_PERIODS} ค่า ตัดเมื่อ |ค่า - มัธยฐาน| > T = {SPIKE_T} ม.")
    print("=" * 70)
    print("ผลต่างสัมบูรณ์ระหว่างค่าที่อ่านติดกัน (ม.) ปี 2020 ถึง 2024 หลังตัดค่าเกินตลิ่ง + 3 ม. ก่อนตัดจุดกระโดด")
    print("  (ค่าติดกัน = ค่าที่มีถัดกัน ข้ามช่องว่าง)")
    print(f"  {'สถานี':>6} {'จำนวนคู่':>9} {'p50':>7} {'p99':>7} {'p99.9':>7} {'p99.99':>7} {'สูงสุด':>7}")
    for key in ("ay", "bkk", "ns"):
        x = clean[key]
        x = x[x.index.year <= TEST_YEAR - 1].dropna()
        d = x.diff().abs().dropna()
        q = d.quantile([0.5, 0.99, 0.999, 0.9999])
        print(f"  {STATION_CODE[key]:>6} {len(d):>9,} {q[0.5]:>7.3f} {q[0.99]:>7.3f} {q[0.999]:>7.3f}"
              f" {q[0.9999]:>7.3f} {d.max():>7.3f}")

    print()
    print("ความไวของกฎ (รายงานเท่านั้น ใช้จริง W = 7, T = 1.0) ทุกปี 2020 ถึง 2025")
    print(f"  {'W':>3} {'T':>4} {'ตัด 39':>7} {'ตัด 4':>6} {'ตัด 568':>8} {'วันเกินตลิ่ง 39':>15} {'เหตุการณ์ 39':>12}")
    for w in SPIKE_W_SENSITIVITY:
        for t in SPIKE_T_SENSITIVITY:
            cut = {k: spike_mask(clean[k], w, t) for k in ("ay", "bkk", "ns")}
            days = bank_days(clean["ay"].mask(cut["ay"]))
            mark = "  <- ใช้จริง" if (w, t) == (SPIKE_W, SPIKE_T) else ""
            print(f"  {w:>3} {t:>4} {int(cut['ay'].sum()):>7} {int(cut['bkk'].sum()):>6} {int(cut['ns'].sum()):>8}"
                  f" {len(days):>15} {len(events(days)):>12}{mark}")

    out = dict(clean)
    for key in ("ay", "bkk", "ns"):
        out[key] = clean[key].mask(spike_mask(clean[key]))
    return out


def check_bank_days(clean: dict[str, pd.Series], despiked: dict[str, pd.Series]) -> None:
    print()
    print("=" * 70)
    print("7. วันที่ค่าสูงสุดของวันที่อยุธยา >= 5.06 และเหตุการณ์ (ห่างกันเกิน 3 วัน = คนละเหตุการณ์)")
    print("=" * 70)
    before, after = clean["ay"], despiked["ay"]
    d_before, d_after = bank_days(before), bank_days(after)
    e_before, e_after = events(d_before), events(d_after)
    nd_b, nd_a = d_before.groupby(d_before.dt.year).size(), d_after.groupby(d_after.dt.year).size()
    ne_b, ne_a = per_year(e_before, lambda e: e[0]), per_year(e_after, lambda e: e[0])
    print("  ก่อนตัด = หลังตัดค่าเกินตลิ่ง + 3 ม. แต่ยังไม่ตัดจุดกระโดด, เหตุการณ์นับปีของวันเริ่ม")
    print(f"  {'ปี':>6} {'วันก่อนตัด':>11} {'วันหลังตัด':>11} {'เหตุการณ์ก่อน':>14} {'เหตุการณ์หลัง':>14}")
    for year in range(2020, TEST_YEAR + 1):
        print(f"  {year:>6} {int(nd_b.get(year, 0)):>11} {int(nd_a.get(year, 0)):>11}"
              f" {int(ne_b.get(year, 0)):>14} {int(ne_a.get(year, 0)):>14}")
    print(f"  {'รวม':>6} {len(d_before):>11} {len(d_after):>11} {len(e_before):>14} {len(e_after):>14}")

    print()
    print("  เหตุการณ์ทั้งหมดหลังตัด:")
    for start, end, n in e_after:
        print(f"    {start.date()} ถึง {end.date()} ({n} วันเกินตลิ่ง)")

    short = [e for e in e_after if (e[1] - e[0]).days + 1 < 3]
    print(f"\n  เหตุการณ์ที่สั้นกว่า 3 วัน: {len(short)} เหตุการณ์ (รายงานอย่างเดียว ไม่ลบ)")
    for start, end, _ in short:
        for day in pd.date_range(start, end, freq="D"):
            x = after[day:day + pd.Timedelta(hours=23, minutes=50)]
            print(f"    {day.date()}: มัธยฐานรายวัน {x.median():.3f}, สูงสุดรายวัน {x.max():.3f},"
                  f" จำนวนค่าที่ถึงตลิ่ง {int((x >= BANK['ay']).sum())}")

    print()
    print("  เหตุการณ์จริงที่รู้อยู่: จุดที่ถูกตัดในช่วง และวันเริ่ม/จบที่เลื่อนไป (+ = ช้าลง)")
    cut = before.notna() & after.isna()
    for k_start, k_end in KNOWN_EVENTS:
        ks, ke = pd.Timestamp(k_start), pd.Timestamp(k_end)
        n_cut = int(cut[ks:ke + pd.Timedelta(hours=23, minutes=50)].sum())
        match = [e for e in e_after if e[0] <= ke and e[1] >= ks]
        if match:
            s0, e0 = match[0][0], match[-1][1]
            shift = f"เริ่ม {(s0 - ks).days:+d} วัน, จบ {(e0 - ke).days:+d} วัน ({s0.date()} ถึง {e0.date()})"
        else:
            shift = "หายไปหลังตัด"
        print(f"    {k_start} ถึง {k_end}: ตัด {n_cut} จุด, {shift}")

    print()
    hourly = pd.date_range(before.index.min().floor("h"), before.index.max().floor("h"), freq="h")
    print(f"  สัดส่วนค่าว่างของสถานี 39 รายชั่วโมง (หลังเติมไม่เกิน 3 ชม.):"
          f" ก่อนตัด {to_hourly(before, hourly).isna().mean():.2%}, หลังตัด {to_hourly(after, hourly).isna().mean():.2%}"
          f" (ราย 10 นาที: ก่อน {before.isna().mean():.2%}, หลัง {after.isna().mean():.2%})")

    for key in ("bkk", "ns"):
        for label, src in (("ก่อนตัด", clean), ("หลังตัด", despiked)):
            d = src[key].resample("D").max()
            print(f"  (อ้างอิง) สถานี {STATION_CODE[key]} วันที่ถึงตลิ่ง {BANK[key]} {label}: {int((d >= BANK[key]).sum())} วัน")


def to_hourly(s: pd.Series, grid: pd.DatetimeIndex) -> pd.Series:
    """ค่าล่าสุดที่รู้ ณ ต้นชั่วโมง t (เวลา <= t) ย้อนได้ไม่เกิน 3 ชม. ไม่ใช้ค่าหลัง t"""
    known = s.dropna()
    return known.reindex(grid, method="ffill", tolerance=FFILL_LIMIT)


def make_label(ay: pd.Series, grid: pd.DatetimeIndex) -> pd.Series:
    """label(t) = 1 ถ้ามีค่าวัดในช่วง [t, t+24h] ที่ >= ตลิ่ง
    = 0 ถ้าไม่มีค่าใดถึงตลิ่ง และมีค่าวัดอย่างน้อย 50% ของช่วง ไม่งั้นเป็น NaN (ไม่รู้ผล)"""
    step = pd.Timedelta(minutes=10)
    full = pd.date_range(ay.index.min(), ay.index.max() + HORIZON, freq=step)
    g = ay.reindex(full)
    n = int(HORIZON / step) + 1  # 145 ช่อง รวมทั้ง t และ t+24h
    rev = g[::-1]
    fwd_max = rev.rolling(n, min_periods=1).max()[::-1]
    fwd_cnt = rev.notna().astype(float).rolling(n, min_periods=1).sum()[::-1]
    hit = (fwd_max >= BANK["ay"]).reindex(grid)
    coverage = (fwd_cnt / n).reindex(grid)
    label = pd.Series(np.nan, index=grid)
    label[coverage >= LABEL_MIN_COVERAGE] = 0.0
    label[hit.fillna(False).astype(bool)] = 1.0
    # ช่วงท้ายข้อมูลที่มองไปข้างหน้าไม่ครบ 24 ชม. ไม่รู้ผลจริง
    label[grid + HORIZON > ay.index.max()] = np.nan
    return label


def build_features(clean: dict[str, pd.Series]) -> pd.DataFrame:
    grid = pd.date_range(clean["ay"].index.min().floor("h"), clean["ay"].index.max().floor("h"), freq="h")
    df = pd.DataFrame(index=grid)
    df.index.name = "time"

    for key in ("ay", "ns"):
        lvl = to_hourly(clean[key], grid)
        df[f"{key}_level"] = lvl
        for h in (6, 12, 24):
            df[f"{key}_d{h}"] = lvl - lvl.shift(h)  # เทียบกับ h ชม.ก่อน ใช้ข้อมูลอดีตเท่านั้น
    for key in ("c13", "c2"):
        df[f"{key}_flow"] = to_hourly(clean[key], grid)
    for key in ("rain_bkk", "rain_ns"):
        r = clean[key].reindex(grid)  # รายชั่วโมงอยู่แล้ว ไม่เติมค่า
        for h in (24, 72):
            # ผลรวมชั่วโมง t-h+1 ถึง t (ฝนของแต่ละแถวคือฝนชั่วโมงก่อนหน้า จึงรู้แล้ว ณ t)
            df[f"{key}_{h}h"] = r.rolling(h, min_periods=h).sum()
    df["month"] = grid.month

    # คอลัมน์บอกค่าขาด (1 = ขาด) ของค่าตั้งต้นแต่ละแหล่ง
    for col in ("ay_level", "ns_level", "c13_flow", "c2_flow", "rain_bkk_24h", "rain_ns_24h"):
        df[f"{col}_missing"] = df[col].isna().astype(int)

    df["label"] = make_label(clean["ay"], grid)
    return df


def split_and_save(df: pd.DataFrame) -> None:
    print()
    print("=" * 70)
    print("3 ถึง 6. ตารางรายชั่วโมง ตัวแปร label และการแบ่งข้อมูล")
    print("=" * 70)
    feature_cols = [c for c in df.columns if c != "label"]
    print(f"- ตาราง {len(df):,} ชั่วโมง ({df.index.min()} ถึง {df.index.max()}), ตัวแปร {len(feature_cols)} ตัว")
    print("- สัดส่วนค่าขาดหลังทำเป็นรายชั่วโมง (เติมไม่เกิน 3 ชม.):")
    for c in feature_cols:
        if not c.endswith("_missing") and c != "month":
            print(f"    {c:<16} {df[c].isna().mean():6.1%}")

    labelled = df[df["label"].notna()]
    print(f"- label ไม่รู้ผล (ค่าวัดในช่วง 24 ชม.ข้างหน้าน้อยกว่า 50% หรือท้ายข้อมูล): "
          f"{df['label'].isna().sum():,} ชั่วโมง ตัดทิ้ง")

    # ตัดชั่วโมงท้ายปี 2024 ที่ช่วง label ล้ำเข้าไปในปีทดสอบ กันข้อมูลปี 2025 รั่วเข้าชุดเทรน
    test_start = pd.Timestamp(f"{TEST_YEAR}-01-01")
    train = labelled[(labelled.index < test_start) & (labelled.index + HORIZON < test_start)]
    test = labelled[labelled.index >= test_start]
    dropped = ((labelled.index < test_start) & (labelled.index + HORIZON >= test_start)).sum()
    print(f"- ตัด {dropped} ชั่วโมงท้ายปี {TEST_YEAR - 1} ที่ช่วง label ล้ำเข้าปี {TEST_YEAR}")

    print(f"{'ชุด':>8} {'ชั่วโมง':>8} {'label=1':>8} {'สัดส่วน':>8}")
    for year, part in labelled.groupby(labelled.index.year):
        print(f"{year:>8} {len(part):>8,} {int(part['label'].sum()):>8,} {part['label'].mean():>8.2%}")
    for name, part in (("train", train), ("test", test)):
        print(f"{name:>8} {len(part):>8,} {int(part['label'].sum()):>8,} {part['label'].mean():>8.2%}")

    train.to_csv(DATA / "features_train.csv")
    test.to_csv(DATA / "features_test.csv")
    print(f"- บันทึก {DATA / 'features_train.csv'} และ {DATA / 'features_test.csv'}")


def main() -> None:
    raw = report_files()
    report_timezone(raw)
    clean = filter_outliers(raw)
    despiked = remove_spikes(clean)
    check_bank_days(clean, despiked)
    df = build_features(despiked)
    split_and_save(df)


if __name__ == "__main__":
    main()
