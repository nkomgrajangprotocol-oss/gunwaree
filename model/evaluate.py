"""ขั้น 3 (ฉบับย่อ): วัดผลบนปี 2025 ครั้งเดียว ไม่ปรับอะไรตามผล

รันจากรากของ repo:  venv/bin/python model/evaluate.py
การตัดสินใจกำหนดไว้ก่อนเห็นปี 2025: ระบบใช้กฎ B2 ที่ m = 0.30 (backend/risk.py)
อ่าน data/features_test.csv, data/val_scores.csv, data/candidate_model.joblib, data/*_stage.csv
เขียนผลทั้งหมดที่ data/eval_2025.txt ไม่เขียนอะไรลง backend/
"""
import contextlib
import io
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
sys.path.insert(0, str(ROOT / "model"))
import prepare_data as prep  # noqa: E402

BANK = 5.06
M_B1, M_B2 = 0.05, 0.30          # จากขั้น 2 (ห้ามเปลี่ยน)
MODEL_THRESHOLD = 0.5
EVENT_GAP_DAYS = 3
LOOKBACK = pd.Timedelta(hours=72)   # หาการเตือนครั้งแรกตั้งแต่ 72 ชม.ก่อนน้ำถึงตลิ่ง
ON_TIME = pd.Timedelta(hours=24)    # เตือนทัน = เตือนภายใน 24 ชม.ก่อนน้ำถึงตลิ่งครั้งแรก (หรือเร็วกว่านั้น)


# ---------- กฎ ----------

def risk_level(level: pd.Series, rise: pd.Series, m: float = M_B2) -> pd.Series:
    """ทำซ้ำ rule_b2 ของ backend/risk.py (ไม่ได้ import เพื่อไม่แตะ backend)
    critical: ระดับ >= ตลิ่ง, warning: ระดับ > ตลิ่ง - m และ rise_6h > 0,
    watch: ระดับ > ตลิ่ง - m แต่ไม่ขึ้นหรือไม่มีค่าเทียบ, none: ต่ำกว่านั้น
    ระดับน้ำว่าง = ระบบจริงตอบ 503 ในที่นี้ใส่ 'nodata' และไม่นับเป็นการเตือน"""
    out = pd.Series("none", index=level.index, dtype=object)
    near = level > BANK - m
    rising = rise.notna() & (rise > 0)
    out[near] = "watch"
    out[near & rising] = "warning"
    out[level >= BANK] = "critical"
    out[level.isna()] = "nodata"
    return out


def methods(df: pd.DataFrame, m3_score: pd.Series) -> dict[str, pd.Series]:
    lvl = risk_level(df["ay_level"], df["ay_d6"])
    return {
        "B1": df["ay_level"] > BANK - M_B1,
        "B2": (df["ay_level"] > BANK - M_B2) & (df["ay_d6"] > 0),
        "M3": m3_score >= MODEL_THRESHOLD,
        "rule_b2>=watch": lvl.isin(["watch", "warning", "critical"]),
        "rule_b2>=warning": lvl.isin(["warning", "critical"]),
    }


# ---------- เหตุการณ์ ----------

def despiked_ayutthaya() -> pd.Series:
    """ระดับน้ำอยุธยาราย 10 นาทีหลังตัดค่าเกินตลิ่ง + 3 ม. และ rolling median (กฎเดียวกับ prepare_data.py)"""
    with contextlib.redirect_stdout(io.StringIO()):
        raw = {k: prep.load(n, c) for k, n, c, _, _ in prep.FILES if k in ("ay", "bkk", "ns")}
        clean = prep.filter_outliers(raw)
        return prep.remove_spikes(clean)["ay"]


def events_of_year(ay: pd.Series, year: int) -> list[dict]:
    days = prep.bank_days(ay)
    days = days[days.dt.year == year]
    out = []
    for start, end, n in prep.events(days):
        x = ay[start:end + pd.Timedelta(hours=23, minutes=50)]
        onset = x[x >= BANK].index.min()      # ค่าวัดแรกที่ถึงตลิ่ง
        out.append({"start": start, "end": end, "days": n, "onset": onset,
                    "last": x[x >= BANK].index.max(), "peak": x.max()})
    return out


def first_alarm(alarm: pd.Series, ev: dict) -> tuple[str, str]:
    """ชั่วโมงแรกที่เตือนตั้งแต่ 72 ชม.ก่อนน้ำถึงตลิ่งจนจบเหตุการณ์ คืน (เวลา, lead time ชม.)"""
    window = alarm[(alarm.index >= ev["onset"] - LOOKBACK) & (alarm.index <= ev["last"])]
    hits = window.index[window.to_numpy().astype(bool)]
    if len(hits) == 0:
        return "ไม่เตือน", "-"
    lead = (ev["onset"] - hits[0]) / pd.Timedelta(hours=1)
    return str(hits[0]), f"{lead:+.1f}"


# ---------- รายงาน ----------

def hourly_table(title: str, y: np.ndarray, preds: dict[str, np.ndarray]) -> None:
    print(f"\n  {title}: {len(y):,} ชม., บวก {int(y.sum()):,} ชม.")
    print(f"  {'วิธี':<18} {'P':>6} {'R':>6} {'F1':>6} | {'TN':>6} {'FP':>5} {'FN':>5} {'TP':>5}")
    for name, p in preds.items():
        tn, fp, fn, tp = confusion_matrix(y, p, labels=[0, 1]).ravel()
        print(f"  {name:<18} {precision_score(y, p, zero_division=0):>6.3f} {recall_score(y, p, zero_division=0):>6.3f}"
              f" {f1_score(y, p, zero_division=0):>6.3f} | {tn:>6,} {fp:>5,} {fn:>5,} {tp:>5,}")


def event_table(title: str, evs: list[dict], alarms: dict[str, pd.Series]) -> None:
    print(f"\n  {title}: {len(evs)} เหตุการณ์")
    for i, ev in enumerate(evs, 1):
        print(f"   {i}. {ev['start'].date()} ถึง {ev['end'].date()} ({ev['days']} วันเกินตลิ่ง, สูงสุด {ev['peak']:.2f} ม.)"
              f" น้ำถึงตลิ่งครั้งแรก {ev['onset']}")
        for name, a in alarms.items():
            t, lead = first_alarm(a, ev)
            on_time = "-" if lead == "-" else ("ทัน" if float(lead) > 0 else "ไม่ทัน")
            print(f"      {name:<18} เตือนครั้งแรก {t:<20} lead {lead:>7} ชม.  {on_time}")


def main() -> None:
    meta = json.loads((DATA / "candidate_features.json").read_text(encoding="utf-8"))
    model = joblib.load(DATA / "candidate_model.joblib")
    test = pd.read_csv(DATA / "features_test.csv", index_col="time", parse_dates=True)
    assert set(test.index.year) == {2025}
    y = test["label"].astype(int).to_numpy()
    m3 = pd.Series(model.predict_proba(test[meta["features"]])[:, 1], index=test.index)
    preds = methods(test, m3)
    lvl = risk_level(test["ay_level"], test["ay_d6"])

    print("=" * 84)
    print(f"ประเมินปี 2025 ครั้งเดียว | ระบบใช้ rule_b2 m = {M_B2} (ตัดสินแล้วก่อนเห็นปี 2025)")
    print(f"B1 m = {M_B1}, B2 m = {M_B2}, M3 = data/candidate_model.joblib ({meta['model']}) เกณฑ์ {MODEL_THRESHOLD}")
    print(f"ชั่วโมงที่ระดับน้ำอยุธยาว่าง (ระบบจริงตอบ 503): {int((lvl == 'nodata').sum())} ชม."
          f" นับเป็นไม่เตือน, ระดับของ rule_b2: {lvl.value_counts().to_dict()}")
    print("=" * 84)

    print("\n1. ระดับชั่วโมง คลาสเกินตลิ่ง (label = ถึง 5.06 ภายใน t ถึง t+24 ชม.)")
    hourly_table("ทุกชั่วโมง ปี 2025", y, {k: v.to_numpy() for k, v in preds.items()})
    below = (test["ay_level"] < BANK).to_numpy()
    hourly_table("เฉพาะชั่วโมงที่ตอนทายยังต่ำกว่าตลิ่ง ปี 2025", y[below],
                 {k: v.to_numpy()[below] for k, v in preds.items()})

    print("\n2. ระดับเหตุการณ์ (วันเกินตลิ่งหลังตัดจุดกระโดด ห่างกันเกิน 3 วัน = คนละเหตุการณ์)")
    print(f"   lead = เวลาน้ำถึงตลิ่งครั้งแรก ลบ เวลาเตือนครั้งแรก (บวก = เตือนก่อน) หาการเตือนตั้งแต่"
          f" {int(LOOKBACK / pd.Timedelta(hours=1))} ชม.ก่อนน้ำถึงตลิ่งจนจบเหตุการณ์")
    ay = despiked_ayutthaya()
    event_table("ปี 2025 (ทดสอบ)", events_of_year(ay, 2025), preds)

    val = pd.read_csv(DATA / "val_scores.csv", index_col="time", parse_dates=True)
    for year, fold in ((2021, "A"), (2022, "B")):
        v = val[val["fold"] == fold]
        vp = methods(v, v["M3"])
        event_table(f"ปี {year} (validation รอบ {fold}: M3 เป็นคะแนนนอกชุดเทรน, m ของกฎเลือกจากปีนี้ด้วย)",
                    events_of_year(ay, year), vp)

    print("\n3. rule_b2 เตือนผิดระดับ warning ขึ้นไป ปี 2025")
    print("   ชั่วโมงเตือนผิด = warning ขึ้นไป แต่ label = 0 (ไม่ถึงตลิ่งภายใน 24 ชม.ถัดไป) นับเป็นวันที่มีอย่างน้อย 1 ชม.")
    alarm = preds["rule_b2>=warning"].to_numpy()
    false_hours = test.index[alarm & (y == 0)]
    false_days = pd.Series(false_hours.normalize().unique())
    by_month = false_days.groupby(false_days.dt.month).size() if len(false_days) else pd.Series(dtype=int)
    print(f"   ชั่วโมงเตือนผิด {len(false_hours)} ชม. ใน {len(false_days)} วัน")
    print("   " + ", ".join(f"เดือน {m}: {int(by_month.get(m, 0))}" for m in range(1, 13)))
    print(f"   เฉลี่ย {len(false_days) / 12:.2f} วันต่อเดือน")
    if len(false_days):
        print("   วันที่: " + ", ".join(str(d.date()) for d in false_days))


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
        (DATA / "eval_2025.txt").write_text(buf.getvalue(), encoding="utf-8")
