"""ขั้น 2: baseline B0 ถึง B2, โมเดล M1 ถึง M3 และ validation 2 รอบภายใน 2020 ถึง 2024

รันจากรากของ repo:  venv/bin/python model/train.py   (ต้องรัน prepare_data.py ก่อน)
อ่าน data/features_train.csv อย่างเดียว ไม่โหลดปี 2025 (data/features_test.csv) ในขั้นนี้
เขียน data/candidate_model.joblib, data/candidate_features.json และคะแนนของรอบ validation ที่ data/val_scores.csv
ไม่เขียนอะไรลง backend/models/ (ย้ายเข้าไปตอนขั้น 3 เมื่อผ่านกติกาตัดสินเท่านั้น)

validation:
- รอบ A ทดสอบปี 2021 เทรนจาก 2020, 2022, 2023, 2024
- รอบ B ทดสอบปี 2022 เทรนจาก 2020, 2021, 2023, 2024
- ตัดชั่วโมงเทรนที่อยู่ภายใน 72 ชม.จากขอบปีที่ทดสอบ (label มองไปข้างหน้า 24 ชม. จึงปนข้ามขอบได้)
"""
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, f1_score, precision_score, recall_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

BANK = 5.06
TRAIN_YEARS = {2020, 2021, 2022, 2023, 2024}
FOLDS = {"A": 2021, "B": 2022}
PURGE = pd.Timedelta(hours=72)
M_GRID = np.round(np.arange(0.0, 2.0001, 0.05), 2)
MODEL_THRESHOLD = 0.5      # เกณฑ์ของโมเดลสำหรับ precision/recall/F1 กำหนดล่วงหน้า (เกณฑ์ระดับเตือนตั้งในขั้น 3)
EVENT_GAP = pd.Timedelta(days=3)
FLAT_TOL = 0.02            # m ที่ F1 เฉลี่ยห่างจากค่าสูงสุดไม่เกิน 0.02 ถือว่าอยู่ในช่วงราบ
SEED = 42

M1_FEATURES = ["ay_level", "ay_d6", "ay_d12", "ay_d24", "ns_level", "ns_d6", "ns_d12", "ns_d24",
               "ay_level_missing", "ns_level_missing"]
SIMPLICITY = ["M1", "M2", "M3"]


def load_train() -> pd.DataFrame:
    df = pd.read_csv(DATA / "features_train.csv", index_col="time", parse_dates=True)
    years = set(df.index.year.unique())
    assert years <= TRAIN_YEARS, f"ข้อมูลที่ใช้ต้องเป็นปี 2020 ถึง 2024 เท่านั้น แต่พบ {sorted(years)}"
    assert df["label"].notna().all()
    return df


def split(df: pd.DataFrame, test_year: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    start, end = pd.Timestamp(f"{test_year}-01-01"), pd.Timestamp(f"{test_year + 1}-01-01")
    test = df[(df.index >= start) & (df.index < end)]
    near = (df.index >= start - PURGE) & (df.index < end + PURGE)
    train = df[~near]
    assert test_year not in set(train.index.year)
    return train, test


def count_events(y: pd.Series) -> int:
    """นับเหตุการณ์จากชั่วโมงที่ label = 1 ช่วงที่ห่างจากชั่วโมงบวกก่อนหน้าเกิน 3 วันเริ่มเหตุการณ์ใหม่"""
    t = y.index[y.to_numpy() == 1].to_series()
    if t.empty:
        return 0
    return int(((t.diff().isna()) | (t.diff() > EVENT_GAP)).sum())


def prf(y, pred) -> dict:
    return {"P": precision_score(y, pred, zero_division=0),
            "R": recall_score(y, pred, zero_division=0),
            "F1": f1_score(y, pred, zero_division=0)}


# ---------- baseline ----------

def rule_b1(df: pd.DataFrame, m: float) -> np.ndarray:
    # ระดับน้ำว่าง (NaN) เทียบแล้วได้ False = ทายว่าไม่เกิน
    return (df["ay_level"] > BANK - m).to_numpy()


def rule_b2(df: pd.DataFrame, m: float) -> np.ndarray:
    return rule_b1(df, m) & (df["ay_d6"] > 0).to_numpy()


def m_table(name: str, rule, parts: dict[str, pd.DataFrame]) -> pd.DataFrame:
    rows = []
    for m in M_GRID:
        row = {"m": m}
        for part, d in parts.items():
            for k, v in prf(d["label"].astype(int), rule(d, m)).items():
                row[f"{part}_{k}"] = v
        row["meanF1_AB"] = (row["A_F1"] + row["B_F1"]) / 2
        rows.append(row)
    t = pd.DataFrame(rows)
    print(f"\n  {name}: P / R / F1 ระดับชั่วโมงทุกค่า m (A = ปี 2021, B = ปี 2022, train = 2020 ถึง 2024 ทั้งหมด)")
    print(f"  {'m':>5} | {'A P':>5} {'A R':>5} {'A F1':>5} | {'B P':>5} {'B R':>5} {'B F1':>5} |"
          f" {'tr P':>5} {'tr R':>5} {'tr F1':>5} | {'เฉลี่ยF1 A,B':>12}")
    for r in t.itertuples():
        print(f"  {r.m:>5.2f} | {r.A_P:>5.3f} {r.A_R:>5.3f} {r.A_F1:>5.3f} | {r.B_P:>5.3f} {r.B_R:>5.3f} {r.B_F1:>5.3f} |"
              f" {r.train_P:>5.3f} {r.train_R:>5.3f} {r.train_F1:>5.3f} | {r.meanF1_AB:>12.3f}")
    return t


def pick_m(t: pd.DataFrame) -> float:
    """F1 เฉลี่ยของรอบ A และ B สูงสุด ถ้าเสมอเลือก m ที่มากกว่า (เตือนไวกว่า)"""
    best = t["meanF1_AB"].round(10).max()
    return float(t.loc[t["meanF1_AB"].round(10) == best, "m"].max())


def describe_curve(name: str, t: pd.DataFrame, m: float) -> None:
    best = t["meanF1_AB"].max()
    flat = t[t["meanF1_AB"] >= best - FLAT_TOL]["m"]
    i = int(np.where(np.isclose(t["m"], m))[0][0])
    nb = [t["meanF1_AB"].iloc[j] for j in (i - 1, i + 1) if 0 <= j < len(t)]
    print(f"  >>> {name}: m = {m:.2f} (เกณฑ์ ay_level > {BANK - m:.2f} ม.รทก.)  F1 เฉลี่ย A,B = {best:.3f}")
    print(f"      ช่วง m ที่ F1 เฉลี่ยห่างจากสูงสุดไม่เกิน {FLAT_TOL}: {flat.min():.2f} ถึง {flat.max():.2f}"
          f" ({len(flat)} ค่า), F1 ที่ m ข้างเคียง ±0.05: {', '.join(f'{v:.3f}' for v in nb)}")


# ---------- โมเดล ----------

def make_models(features: list[str]) -> dict[str, tuple[list[str], Pipeline]]:
    def pipe(model):
        # คอลัมน์บอกค่าที่ขาดสร้างไว้แล้วใน prepare_data.py (*_missing) จึงอยู่ในรายชื่อตัวแปร
        return Pipeline([("impute", SimpleImputer(strategy="median")),
                         ("scale", StandardScaler()),
                         ("model", model)])
    return {
        "M1": (M1_FEATURES, pipe(LogisticRegression(class_weight="balanced", max_iter=5000))),
        "M2": (features, pipe(LogisticRegression(class_weight="balanced", max_iter=5000))),
        "M3": (features, pipe(HistGradientBoostingClassifier(
            class_weight="balanced", max_iter=300, learning_rate=0.05, max_leaf_nodes=15,
            min_samples_leaf=50, l2_regularization=1.0, random_state=SEED))),
    }


def print_metrics(title: str, res: pd.DataFrame, names: list[str], counts: dict) -> None:
    print(f"\n  {title}")
    for fold in ("A", "B"):
        n_pos, n_ev, n = counts[fold]
        print(f"    รอบ {fold}: {n:,} ชม., บวก {n_pos:,} ชม., {n_ev} เหตุการณ์")
    print(f"  {'':<4} | {'A P':>5} {'A R':>5} {'A F1':>5} {'A AP':>5} | {'B P':>5} {'B R':>5} {'B F1':>5} {'B AP':>5} |"
          f" {'เฉลี่ย P':>8} {'R':>5} {'F1':>5} {'AP':>5}")
    for n in names:
        a = res[(res.model == n) & (res.fold == "A")].iloc[0]
        b = res[(res.model == n) & (res.fold == "B")].iloc[0]
        f = lambda v: "    -" if pd.isna(v) else f"{v:>5.3f}"
        mean = lambda k: (a[k] + b[k]) / 2
        print(f"  {n:<4} | {f(a.P)} {f(a.R)} {f(a.F1)} {f(a.AP)} | {f(b.P)} {f(b.R)} {f(b.F1)} {f(b.AP)} |"
              f" {f(mean('P')):>8} {f(mean('R'))} {f(mean('F1'))} {f(mean('AP'))}")


def main() -> None:
    df = load_train()
    features = [c for c in df.columns if c != "label"]
    folds = {name: split(df, year) for name, year in FOLDS.items()}

    print("=" * 78)
    print("ข้อมูล: ปี", sorted(set(df.index.year)), f"{len(df):,} ชม. (ไม่ได้โหลดปี 2025)")
    for name, (tr, te) in folds.items():
        print(f"  รอบ {name}: ทดสอบ {FOLDS[name]} {len(te):,} ชม. (บวก {int(te.label.sum()):,}, {count_events(te.label)} เหตุการณ์)"
              f" | เทรน {len(tr):,} ชม. ปี {sorted(set(tr.index.year))} (บวก {int(tr.label.sum()):,},"
              f" {count_events(tr.label)} เหตุการณ์)")
    print("=" * 78)

    # ---------- 1. baseline ----------
    print("\n1. baseline B1, B2: m = 0.00 ถึง 2.00 ทีละ 0.05 เลือก m ที่ F1 เฉลี่ยรอบ A,B สูงสุด (เสมอ: m มากกว่า)")
    parts = {"A": folds["A"][1], "B": folds["B"][1], "train": df}
    t1 = m_table("B1 (ay_level > 5.06 - m)", rule_b1, parts)
    t2 = m_table("B2 (B1 และ ay_level สูงกว่า 6 ชม.ก่อน)", rule_b2, parts)
    m1, m2 = pick_m(t1), pick_m(t2)
    print()
    describe_curve("B1", t1, m1)
    describe_curve("B2", t2, m2)

    # ---------- 2 และ 3. โมเดลบนรอบ A, B ----------
    models = make_models(features)
    rows, rows_below, scores = [], [], []
    counts, counts_below = {}, {}
    for fold, (tr, te) in folds.items():
        y = te["label"].astype(int).to_numpy()
        below = (te["ay_level"] < BANK).to_numpy()  # ตอนทายยังต่ำกว่าตลิ่ง (ค่าว่างไม่นับ)
        counts[fold] = (int(y.sum()), count_events(te["label"]), len(te))
        counts_below[fold] = (int(y[below].sum()), count_events(te["label"][below]), int(below.sum()))
        out = pd.DataFrame({"fold": fold, "label": y, "ay_level": te["ay_level"].to_numpy(),
                            "ay_d6": te["ay_d6"].to_numpy()}, index=te.index)

        preds = {"B0": (np.zeros(len(te), dtype=bool), None),
                 "B1": (rule_b1(te, m1), None),
                 "B2": (rule_b2(te, m2), None)}
        for name, (cols, pipe) in models.items():
            pipe.fit(tr[cols], tr["label"].astype(int))
            s = pipe.predict_proba(te[cols])[:, 1]
            preds[name] = (s >= MODEL_THRESHOLD, s)
            out[name] = s
        for name, (pred, s) in preds.items():
            ap = average_precision_score(y, s) if s is not None else np.nan
            rows.append({"fold": fold, "model": name, "AP": ap, **prf(y, pred)})
            if name != "B0" and name != "B1":
                ap_b = average_precision_score(y[below], s[below]) if s is not None and y[below].any() else np.nan
                rows_below.append({"fold": fold, "model": name, "AP": ap_b, **prf(y[below], pred[below])})
        scores.append(out)
    res, res_below = pd.DataFrame(rows), pd.DataFrame(rows_below)
    pd.concat(scores).to_csv(DATA / "val_scores.csv")

    print()
    print("=" * 78)
    print(f"2. ผลบนรอบ A และ B (โมเดลใช้เกณฑ์ {MODEL_THRESHOLD} ที่กำหนดล่วงหน้า, AP ไม่ขึ้นกับเกณฑ์)")
    print("=" * 78)
    print_metrics("ทุกชั่วโมง", res, ["B0", "B1", "B2", "M1", "M2", "M3"], counts)
    print()
    print("=" * 78)
    print("3. เฉพาะชั่วโมงที่ตอนทายระดับน้ำอยุธยายังต่ำกว่าตลิ่ง (ตัดชั่วโมงที่เกินตลิ่งอยู่แล้วและที่ระดับน้ำว่าง)")
    print("=" * 78)
    print_metrics("ชั่วโมงที่ยังต่ำกว่าตลิ่ง", res_below, ["B2", "M1", "M2", "M3"], counts_below)

    # ---------- 4. กติกาตัดสิน ----------
    print()
    print("=" * 78)
    print("4. กติกาตัดสิน: ผ่านเมื่อ F1 ชนะ B2 ทั้งรอบ A และรอบ B (ทุกชั่วโมง)")
    print("=" * 78)
    f1 = res.pivot(index="model", columns="fold", values="F1")
    passed = []
    for n in SIMPLICITY:
        win = [f1.loc[n, k] > f1.loc["B2", k] for k in ("A", "B")]
        ok = all(win)
        print(f"  {n}: F1 A {f1.loc[n, 'A']:.3f} vs B2 {f1.loc['B2', 'A']:.3f} ({'ชนะ' if win[0] else 'ไม่ชนะ'}),"
              f" F1 B {f1.loc[n, 'B']:.3f} vs B2 {f1.loc['B2', 'B']:.3f} ({'ชนะ' if win[1] else 'ไม่ชนะ'})"
              f" -> {'ผ่าน' if ok else 'ไม่ผ่าน'}")
        if ok:
            passed.append(n)
    mean_f1 = f1.mean(axis=1)
    if passed:
        top = max(mean_f1[passed])
        chosen = next(n for n in SIMPLICITY if n in passed and np.isclose(mean_f1[n], top))
        print(f"  ผล: ผ่าน {passed} เลือก {chosen} (F1 เฉลี่ยสูงสุด {mean_f1[chosen]:.3f})")
    else:
        top = max(mean_f1[SIMPLICITY])
        chosen = next(n for n in SIMPLICITY if np.isclose(mean_f1[n], top))
        print(f"  ผล: ไม่มีโมเดลผ่าน ใช้ B2 (m = {m2:.2f})")
        print(f"  บันทึก {chosen} (F1 เฉลี่ยสูงสุดในกลุ่มโมเดล {mean_f1[chosen]:.3f}) ไว้อ้างอิงเท่านั้น")

    # ---------- 5. สัมประสิทธิ์ M1 ----------
    print()
    print("=" * 78)
    print("5. สัมประสิทธิ์ M1 (เทรนด้วย 2020 ถึง 2024 ทั้งหมด หน่วย: ต่อ 1 ส่วนเบี่ยงเบนมาตรฐาน หลังเติมค่ามัธยฐาน)")
    print("=" * 78)
    cols1, p1 = make_models(features)["M1"]
    p1.fit(df[cols1], df["label"].astype(int))
    coef = p1.named_steps["model"].coef_[0]
    expect = {"ay_level": "+", "ay_d6": "+", "ay_d12": "+", "ay_d24": "+", "ns_level": "+",
              "ns_d6": "+", "ns_d12": "+", "ns_d24": "+"}
    for c, v in sorted(zip(cols1, coef), key=lambda x: -abs(x[1])):
        e = expect.get(c)
        verdict = "" if e is None else ("สมเหตุสมผล" if (v > 0) == (e == "+") else "ไม่ตรงที่คาด")
        print(f"  {c:<18} {v:>+8.3f}  {('คาด ' + e) if e else 'ไม่คาดเครื่องหมาย':<18} {verdict}")
    print(f"  intercept          {p1.named_steps['model'].intercept_[0]:>+8.3f}")

    # ---------- 6. บันทึก candidate ----------
    print()
    print("=" * 78)
    print("6. เทรน candidate ด้วย 2020 ถึง 2024 ทั้งหมด แล้วบันทึกใน data/ (ยังไม่เข้า backend/models/)")
    print("=" * 78)
    cols, pipe = make_models(features)[chosen]
    pipe.fit(df[cols], df["label"].astype(int))
    model_path = DATA / "candidate_model.joblib"
    joblib.dump(pipe, model_path, compress=3)
    meta = {
        "model": chosen,
        "passed_decision_rule": bool(passed),
        "features": cols,
        "target": "ระดับน้ำสถานีอยุธยา (39) ถึง 5.06 ม.รทก. ภายใน 24 ชม.ข้างหน้า",
        "trained_on": "2020 ถึง 2024 รายชั่วโมง (ไม่รวม 24 ชม.สุดท้ายของปี 2024)",
        "model_threshold": MODEL_THRESHOLD,
        "baseline_m": {"B1": m1, "B2": m2},
    }
    (DATA / "candidate_features.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
                                                  encoding="utf-8")
    size = model_path.stat().st_size
    print(f"  data/candidate_model.joblib: {size:,} ไบต์ ({size / 1024:.1f} KB) โมเดล {chosen}"
          f" {'(ผ่านกติกา)' if passed else '(ไม่ผ่านกติกา เก็บไว้อ้างอิง)'}")
    print(f"  data/candidate_features.json: {len(cols)} ตัวแปร")
    print("  คะแนนของรอบ validation: data/val_scores.csv")


if __name__ == "__main__":
    main()
