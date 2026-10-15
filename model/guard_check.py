"""ตรวจพฤติกรรม guard จุดกระโดดของ backend/risk.py กับข้อมูลจริงรายชั่วโมง 2020 ถึง 2024 (อ่านอย่างเดียว)

รันจากรากของ repo:  venv/bin/python model/guard_check.py
ไม่โหลดปี 2025 เขียนผลที่ data/guard_check.txt
ตรรกะ guard ทำซ้ำจาก risk.build_inputs (ไม่ได้ import เพื่อไม่แตะ backend):
  ค่าก่อนหน้าที่ไม่ว่างสูงสุด 4 ค่า ภายใน 6 ชม.ก่อนค่าปัจจุบัน (เวลา < ปัจจุบัน และ >= ปัจจุบัน - 6 ชม.)
  ถ้ามีอย่างน้อย 3 ค่า และ |ค่าปัจจุบัน - มัธยฐาน| > 1.0 ม. ถือว่าน่าสงสัย
"""
import contextlib
import io
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
sys.path.insert(0, str(ROOT / "model"))
import prepare_data as prep  # noqa: E402

SPIKE_T = 1.0
PREV_MAX, PREV_MIN = 4, 3
WINDOW = pd.Timedelta(hours=6)
EVENTS = [("2021-09-30", "2021-11-01"), ("2022-09-30", "2022-10-13"), ("2022-10-20", "2022-10-28")]
LAST_YEAR = 2024


def guard(s: pd.Series) -> pd.DataFrame:
    """s = ค่าที่ไม่ว่าง เรียงตามเวลา คืนตารางของทุกจุด: median ของค่าก่อนหน้า, จำนวนค่าก่อนหน้า, ส่วนต่าง, น่าสงสัยไหม"""
    s = s.dropna().sort_index()
    t, v = s.index.to_numpy(), s.to_numpy()
    med = np.full(len(s), np.nan)
    n = np.zeros(len(s), dtype=int)
    for i in range(len(s)):
        j0 = np.searchsorted(t, t[i] - WINDOW, side="left")   # เวลา >= ปัจจุบัน - 6 ชม.
        prev = v[max(j0, i - PREV_MAX):i]                      # สูงสุด 4 ค่าล่าสุด เวลา < ปัจจุบัน
        n[i] = len(prev)
        if len(prev) >= PREV_MIN:
            med[i] = np.median(prev)
    out = pd.DataFrame({"value": v, "n_prev": n, "median_prev": med}, index=s.index)
    out["diff"] = (out["value"] - out["median_prev"]).abs()
    out["suspect"] = out["diff"] > SPIKE_T
    return out


def per_year(g: pd.DataFrame) -> None:
    print(f"  {'ปี':>6} {'ชั่วโมงที่มีค่า':>14} {'ใช้ guard ได้':>13} {'น่าสงสัย':>9}")
    for year, part in g.groupby(g.index.year):
        print(f"  {year:>6} {len(part):>14,} {int(part['median_prev'].notna().sum()):>13,} {int(part['suspect'].sum()):>9}")
    print(f"  {'รวม':>6} {len(g):>14,} {int(g['median_prev'].notna().sum()):>13,} {int(g['suspect'].sum()):>9}")


def main() -> None:
    # ---------- 1. ชุดสะอาด ----------
    train = pd.read_csv(DATA / "features_train.csv", index_col="time", parse_dates=True)
    assert train.index.year.max() <= LAST_YEAR
    print("=" * 78)
    print("1. ชุดสะอาด: ay_level รายชั่วโมงจาก data/features_train.csv (หลังตัดจุดกระโดด, เติมค่าล่าสุดไม่เกิน 3 ชม.)")
    print("   หมายเหตุ: ชั่วโมงที่ label ไม่รู้ผลถูกตัดออกจากไฟล์นี้แล้ว และค่าที่เติมต่อเป็นค่าซ้ำของชั่วโมงก่อน")
    print("=" * 78)
    g = guard(train["ay_level"])
    per_year(g)
    print("\n  ภายในเหตุการณ์จริง:")
    for s, e in EVENTS:
        part = g[s:pd.Timestamp(e) + pd.Timedelta(hours=23)]
        d = part["diff"].dropna()
        print(f"    {s} ถึง {e}: {len(part)} ชม., ใช้ guard ได้ {int(part['median_prev'].notna().sum())},"
              f" น่าสงสัย {int(part['suspect'].sum())}, |ค่า - มัธยฐาน| สูงสุด {d.max():.3f} ม."
              f" (ที่ {d.idxmax()})")
    bad = g[g["suspect"]]
    print(f"\n  ชั่วโมงที่น่าสงสัยทั้งหมดในชุดสะอาด: {len(bad)}")
    for t, r in bad.iterrows():
        print(f"    {t}  ค่า {r.value:.3f}  มัธยฐานก่อนหน้า {r.median_prev:.3f}  ส่วนต่าง {r['diff']:.3f}  ({r.n_prev} ค่าก่อนหน้า)")
    print(f"\n  ส่วนต่างทั้งชุด: p99 {g['diff'].quantile(0.99):.3f}, p99.9 {g['diff'].quantile(0.999):.3f},"
          f" สูงสุด {g['diff'].max():.3f} ม.")

    # ---------- 2. ชุดดิบ ----------
    print()
    print("=" * 78)
    print("2. ชุดดิบ: ค่าแรกที่อ่านได้ (ไม่ว่าง) ในแต่ละชั่วโมงจาก data/ayutthaya_stage.csv ไม่ตัดอะไรเลย")
    print("=" * 78)
    raw = prep.load("ayutthaya_stage.csv", "value")
    raw = raw[raw.index.year <= LAST_YEAR]
    known = raw.dropna()
    first = known.groupby(known.index.floor("h")).head(1)       # ค่าแรกของชั่วโมง (เวลาจริงของค่าวัด)
    g2 = guard(first)
    per_year(g2)

    # จุดกระโดดที่รู้ = ค่าที่ prepare_data ตัดทิ้ง (เกินตลิ่ง + 3 ม. แล้ว rolling median W = 7, T = 1.0)
    with contextlib.redirect_stdout(io.StringIO()):
        over = raw > prep.BANK["ay"] + prep.OUTLIER_MARGIN
        cleaned = raw.mask(over)
        spike = prep.spike_mask(cleaned)
    known_spikes = raw.index[spike.to_numpy()]
    known_over = raw.index[over.to_numpy()]
    for label, idx in (("จุดกระโดดที่ rolling median ตัด", known_spikes), ("ค่าเกินตลิ่ง + 3 ม. ที่ตัดก่อนหน้านั้น", known_over)):
        in_first = idx[idx.isin(first.index)]
        flagged = g2.loc[in_first, "suspect"] if len(in_first) else pd.Series(dtype=bool)
        print(f"\n  {label}: ทั้งหมด {len(idx)} จุด, เป็นค่าแรกของชั่วโมง {len(in_first)} จุด,"
              f" guard ถือว่าน่าสงสัย {int(flagged.sum())} จุด")
        for t in in_first:
            r = g2.loc[t]
            med = "-" if np.isnan(r.median_prev) else f"{r.median_prev:.3f}"
            print(f"    {t}  ค่า {r.value:.3f}  มัธยฐานก่อนหน้า {med}  ค่าก่อนหน้า {r.n_prev} ค่า"
                  f"  {'น่าสงสัย' if r.suspect else 'ไม่จับ'}")

    other = g2[g2["suspect"] & ~g2.index.isin(known_spikes) & ~g2.index.isin(known_over)]
    print(f"\n  ชั่วโมงที่ guard ถือว่าน่าสงสัย แต่ไม่ใช่จุดที่รู้: {len(other)}")
    for t, r in other.iterrows():
        print(f"    {t}  ค่า {r.value:.3f}  มัธยฐานก่อนหน้า {r.median_prev:.3f}  ส่วนต่าง {r['diff']:.3f}")


if __name__ == "__main__":
    buf = io.StringIO()

    class Tee:
        def write(self, s):
            sys.__stdout__.write(s)
            buf.write(s)

        def flush(self):
            sys.__stdout__.flush()

    sys.stdout = Tee()
    try:
        main()
    finally:
        sys.stdout = sys.__stdout__
        (DATA / "guard_check.txt").write_text(buf.getvalue(), encoding="utf-8")
