"""Validate the generated synthetic dataset and write a report.

    python -m data_generator.validation          (or: python data_generator/validation.py)

Writes data/synthetic/validation_report.{md,json} and correlation_matrix.csv.
Exit code 1 if any HARD check fails. SOFT checks are reported as warnings.
"""
import json
import os
import sys

import numpy as np
import pandas as pd

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data_generator import config as C                   # noqa: E402
from data_generator.data_dictionary import DICTIONARY     # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "synthetic")

# expected directional relationships (Spearman sign) – each encodes a generator assumption
EXPECTED_SIGNS = [
    ("Proximity_Distance", "Safety_Risk_Score", -1),
    ("Machine_Speed", "Safety_Risk_Score", +1),
    ("Ground_Slope", "Safety_Risk_Score", +1),
    ("Visibility", "Safety_Risk_Score", -1),
    ("Blind_Zone_Entry", "Safety_Risk_Score", +1),
    ("Control_Smoothness", "Safety_Risk_Score", -1),
    ("Load_Percentage", "Engine_Load_Percentage", +1),
    ("Engine_Load_Percentage", "Fuel_Consumption", +1),
    ("Engine_Load_Percentage", "Hydraulic_Temperature", +1),
    ("Ambient_Temperature", "Engine_Temperature", +1),
    ("Machine_Health_Score", "Engine_Temperature", -1),
    ("Target_Quantity", "Actual_Task_Duration", +1),
    ("Operator_Skill_Score", "Historical_Efficiency", +1),
    ("Idle_Time", "Fuel_Efficiency", -1),
    ("Safety_Risk_Score", "Safety_Event", +1),
    ("Current_Task_Progress", "Task_Completion_Time", -1),
]
KNOWN_TARGET_PAIRS = {  # high correlation expected by construction – not leakage into a model
    ("Actual_Task_Duration", "Task_Completion_Time"), ("Completed_Quantity", "Target_Quantity"),
    ("Anomaly_Score", "Operator_Anomaly"), ("Safety_Risk_Score", "Safety_Risk_Level"),
}


class Report:
    def __init__(self):
        self.checks, self.sections = [], []

    def check(self, name, ok, detail, hard=True):
        self.checks.append(dict(check=name, status="PASS" if ok else ("FAIL" if hard else "WARN"), detail=str(detail)))

    def section(self, title, body):
        self.sections.append((title, body))

    @property
    def failed(self):
        return [c for c in self.checks if c["status"] == "FAIL"]


def personal_vs_global_idle(df):
    """Evidence for the Digital-Twin design: does a PERSONAL idle baseline separate idle anomalies
    better than one global threshold? Personal baseline = operator's median/MAD over their
    OTHER sessions (leave-one-out approximated by the full-history median, 300+ sessions each)."""
    from sklearn.metrics import roc_auc_score
    idle_rate = df["Idle_Time"] / df["Actual_Task_Duration"]
    g = idle_rate.groupby(df["Operator_ID"])
    med = g.transform("median")
    mad = g.transform(lambda s: (s - s.median()).abs().median()) * 1.4826
    personal_z = (idle_rate - med) / mad
    m = (df["Anomaly_Reason"] == "Excessive_Idle") | (df["Operator_Anomaly"] == 0)
    y = (df.loc[m, "Anomaly_Reason"] == "Excessive_Idle").astype(int)
    return dict(auc_global_idle_rate=round(roc_auc_score(y, idle_rate[m]), 4),
                auc_personal_z=round(roc_auc_score(y, personal_z[m]), 4), n=int(m.sum()), positives=int(y.sum()))


def learnability_probe(df):
    """Fast sanity check that the safety target is learnable but NOT trivially separable."""
    from sklearn.compose import ColumnTransformer
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.metrics import accuracy_score, f1_score
    from sklearn.model_selection import GroupShuffleSplit
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import OneHotEncoder
    num = ["Machine_Speed", "Proximity_Distance", "Ground_Slope", "Load_Percentage", "Visibility",
           "Machine_Health_Score", "Engine_Temperature", "Control_Smoothness", "Blind_Zone_Entry"]
    cat = ["Obstacle_Type", "Seatbelt_Status", "Ground_Condition", "Travel_Direction", "Machine_Type"]
    tr, te = next(GroupShuffleSplit(1, test_size=0.2, random_state=C.RANDOM_SEED).split(df, groups=df["Operator_ID"]))
    pipe = make_pipeline(ColumnTransformer([("n", "passthrough", num), ("c", OneHotEncoder(handle_unknown="ignore"), cat)]),
                         HistGradientBoostingClassifier(random_state=C.RANDOM_SEED))
    y = df["Safety_Risk_Level"]
    pipe.fit(df.iloc[tr], y.iloc[tr])
    pr = pipe.predict(df.iloc[te])
    majority = y.iloc[te].value_counts(normalize=True).iloc[0]
    return dict(accuracy=round(accuracy_score(y.iloc[te], pr), 4), macro_f1=round(f1_score(y.iloc[te], pr, average="macro"), 4),
                majority_baseline=round(float(majority), 4))


def validate(df: pd.DataFrame) -> Report:
    R = Report()
    dd = pd.DataFrame(DICTIONARY, columns=["Column", "Group", "Role", "Type", "Unit", "Description", "Leakage_Notes"])

    # 1. shape
    R.check("row_count", len(df) == C.N_RECORDS, f"{len(df):,} rows (expected {C.N_RECORDS:,})")
    R.check("column_count", df.shape[1] == len(dd) and df.shape[1] >= 40, f"{df.shape[1]} columns (dictionary {len(dd)})")
    R.check("dictionary_sync", list(df.columns) == list(dd["Column"]) or set(df.columns) == set(dd["Column"]),
            "every column documented" if set(df.columns) == set(dd["Column"]) else set(df.columns) ^ set(dd["Column"]))

    # 2. missing / duplicates
    miss = df.isna().sum()
    R.check("missing_values", miss.sum() == 0, f"{miss.sum()} missing cells ({miss.sum() / df.size:.4%})")
    R.check("duplicate_rows", not df.duplicated().any(), f"{df.duplicated().sum()} exact duplicates")
    no_id = df.drop(columns=["Record_ID", "Task_ID", "Timestamp"])
    R.check("duplicate_rows_excluding_ids", not no_id.duplicated().any(), f"{no_id.duplicated().sum()} duplicates ignoring ids")
    R.check("unique_ids", df["Record_ID"].is_unique and df["Task_ID"].is_unique, "Record_ID and Task_ID unique")

    # 3. ranges
    bad = {}
    for col, (lo, hi) in C.RANGES.items():
        n_bad = int(((df[col] < lo) | (df[col] > hi)).sum())
        if n_bad:
            bad[col] = n_bad
    R.check("value_ranges", not bad, bad or f"all {len(C.RANGES)} range-constrained columns within bounds")
    cap = df["Machine_Type"].map({"Excavator": 5.5, "Wheel Loader": 15.0}) + 0.8  # + sensor noise margin
    R.check("speed_within_machine_class", (df["Machine_Speed"] <= cap).all(), f"{(df['Machine_Speed'] > cap).sum()} over class cap")
    R.check("positive_fuel", (df["Fuel_Consumption"] > 0).all() and (df["Total_Fuel_Used"] > 0).all(), "fuel strictly positive")

    # 4. logical consistency
    R.check("completed_le_target", (df["Completed_Quantity"] <= df["Target_Quantity"] + 1e-6).all(), "Completed_Quantity ≤ Target_Quantity")
    R.check("remaining_le_actual", (df["Task_Completion_Time"] <= df["Actual_Task_Duration"] + 0.2).all(), "remaining time ≤ total duration")
    R.check("incident_iff_event", ((df["Incident_Type"] != "No_Incident") == (df["Safety_Event"] == 1)).all(), "Incident_Type set exactly when Safety_Event=1")
    R.check("reason_iff_anomaly", ((df["Anomaly_Reason"] != "Normal") == (df["Operator_Anomaly"] == 1)).all(), "Anomaly_Reason set exactly when anomalous")
    zone = np.select([df["Proximity_Distance"] < 3, df["Proximity_Distance"] < 6], ["Violated", "Warning"], "Clear")
    R.check("zone_status_consistent", (zone == df["Safety_Zone_Status"]).all(), "Safety_Zone_Status matches distance thresholds")
    tasks_ok = all(set(df.loc[df["Machine_Type"] == t, "Task_Type"]) <= set(C.TASKS_BY_TYPE[t]) for t in C.TASKS_BY_TYPE)
    R.check("task_machine_compatibility", tasks_ok, "every task type is valid for its machine type")
    blind_bad = ((df["Blind_Zone_Entry"] == 1) & ~df["Obstacle_Type"].isin(["Worker", "Vehicle"])).sum()
    R.check("blind_zone_only_people_vehicles", blind_bad == 0, f"{blind_bad} blind-zone entries by static objects")
    lvl = pd.cut(df["Safety_Risk_Score"], C.RISK_BINS, labels=C.RISK_LEVELS, right=False).astype(str)
    R.check("risk_level_matches_score", (lvl == df["Safety_Risk_Level"]).all(), "level = binned score")
    R.check("demo_entities_present", (df["Operator_ID"] == C.DEMO_OPERATOR).any() and (df["Machine_ID"] == C.DEMO_MACHINE).any(),
            f"{C.DEMO_OPERATOR} sessions: {(df['Operator_ID'] == C.DEMO_OPERATOR).sum()}, {C.DEMO_MACHINE} sessions: {(df['Machine_ID'] == C.DEMO_MACHINE).sum()}")

    # 5. scenario distribution
    realised = df["Scenario"].value_counts(normalize=True)
    dev = {k: round(realised.get(k, 0) - v, 4) for k, v in C.SCENARIO_MIX.items()}
    R.check("scenario_distribution", max(abs(x) for x in dev.values()) <= 0.015, f"max |realised − target| = {max(abs(x) for x in dev.values()):.4f}")
    R.check("all_scenarios_present", set(realised.index) == set(C.SCENARIO_MIX), f"{len(realised)} / {len(C.SCENARIO_MIX)} scenarios")

    # 6. class balance
    cls = df["Safety_Risk_Level"].value_counts(normalize=True)
    R.check("risk_class_balance", cls.min() >= 0.05 and cls.max() <= 0.70, cls.round(4).to_dict())
    ev = df["Safety_Event"].mean(); an = df["Operator_Anomaly"].mean()
    R.check("event_rate_plausible", 0.02 <= ev <= 0.20, f"Safety_Event rate {ev:.3%}", hard=False)
    R.check("anomaly_rate_plausible", 0.05 <= an <= 0.25, f"Operator_Anomaly rate {an:.3%}", hard=False)

    # 7. correlation structure
    num_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    corr = df[num_cols].corr(method="spearman")
    corr.round(3).to_csv(os.path.join(OUT, "correlation_matrix.csv"))
    sign_rows = []
    for a, b, s in EXPECTED_SIGNS:
        r = corr.loc[a, b]
        sign_rows.append((a, b, "+" if s > 0 else "−", round(r, 3), "OK" if np.sign(r) == s and abs(r) > 0.02 else "UNEXPECTED"))
    wrong = [r for r in sign_rows if r[-1] != "OK"]
    R.check("expected_correlation_signs", not wrong, f"{len(sign_rows) - len(wrong)}/{len(sign_rows)} relationships have the expected sign")

    # 8. leakage scan: feature ↔ target near-identity
    roles = dict(zip(dd["Column"], dd["Role"]))
    targets = [c for c in num_cols if roles.get(c) == "TARGET"]
    feats = [c for c in num_cols if roles.get(c) in ("RAW", "DERIVED")]
    leaks = [(f, t, round(corr.loc[f, t], 3)) for f in feats for t in targets
             if abs(corr.loc[f, t]) > 0.95 and (f, t) not in KNOWN_TARGET_PAIRS]
    R.check("no_feature_target_near_identity", not leaks, leaks or "no RAW/DERIVED feature has |ρ|>0.95 with a target")

    # 9. outliers (IQR) – informational
    out_rows = []
    for c in ["Machine_Speed", "Proximity_Distance", "Ground_Slope", "Engine_Temperature", "Hydraulic_Temperature",
              "Fuel_Consumption", "Idle_Time", "Actual_Task_Duration", "Load_Percentage", "Visibility"]:
        q1, q3 = df[c].quantile([0.25, 0.75]); iqr = q3 - q1
        k = int(((df[c] < q1 - 1.5 * iqr) | (df[c] > q3 + 1.5 * iqr)).sum())
        out_rows.append((c, k, f"{k / len(df):.2%}"))

    # 10. learnability + personalisation evidence
    lp = learnability_probe(df)
    R.check("safety_target_learnable", lp["accuracy"] > lp["majority_baseline"] + 0.15, f"probe acc {lp['accuracy']} vs majority {lp['majority_baseline']}")
    R.check("safety_target_not_trivial", lp["accuracy"] < 0.97, f"probe acc {lp['accuracy']} (<0.97 ⇒ not trivially separable)", hard=False)
    pz = personal_vs_global_idle(df)
    R.check("personal_baseline_beats_global", pz["auc_personal_z"] > pz["auc_global_idle_rate"], pz, hard=False)

    # ---------- sections
    R.section("Shape", f"Rows: **{len(df):,}**  \nColumns: **{df.shape[1]}**  \nOperators: {df['Operator_ID'].nunique()}  \n"
              f"Machines: {df['Machine_ID'].nunique()}  \nDate span: {df['Timestamp'].min()} → {df['Timestamp'].max()}  \n"
              f"Missing values: {miss.sum() / df.size:.2%}  \nDuplicate rows: {df.duplicated().sum()}")
    R.section("Safety risk classes", _md_table(["Level", "Share", "Rows", "Safety_Event rate"],
              [(l, f"{cls.get(l, 0):.1%}", int((df['Safety_Risk_Level'] == l).sum()),
                f"{df.loc[df['Safety_Risk_Level'] == l, 'Safety_Event'].mean():.1%}") for l in C.RISK_LEVELS]))
    sd = pd.read_csv(os.path.join(OUT, "scenario_distribution.csv"))
    R.section("Scenario distribution", _md_table(list(sd.columns), sd.values.tolist()))
    R.section("Other targets", _md_table(["Target", "Summary"], [
        ("Safety_Event", f"{ev:.2%} of sessions"), ("Operator_Anomaly", f"{an:.2%} of sessions"),
        ("Anomaly_Reason", ", ".join(f"{k}: {v}" for k, v in df.loc[df['Operator_Anomaly'] == 1, 'Anomaly_Reason'].value_counts().items())),
        ("Incident_Type", ", ".join(f"{k}: {v}" for k, v in df.loc[df['Safety_Event'] == 1, 'Incident_Type'].value_counts().items())),
        ("Task_Completion_Time (min)", _desc(df["Task_Completion_Time"])),
        ("Actual_Task_Duration (min)", _desc(df["Actual_Task_Duration"])),
        ("Safety_Risk_Score", _desc(df["Safety_Risk_Score"])), ("Fuel_Efficiency (t/L)", _desc(df["Fuel_Efficiency"]))]))
    R.section("Expected relationships (Spearman ρ)", _md_table(["Feature", "Target", "Expected", "ρ", "Result"], sign_rows))
    R.section("Outliers (1.5×IQR, informational)", _md_table(["Column", "Outliers", "Share"], out_rows) +
              "\n\nOutliers are intentional: they come from hazard scenarios (e.g. overheating, steep terrain, excessive idle), not from generation errors. Range checks above confirm none are physically impossible.")
    R.section("Learnability probe", f"HistGradientBoosting on 14 snapshot features, operator-grouped 80/20 split: "
              f"accuracy **{lp['accuracy']}**, macro-F1 **{lp['macro_f1']}** vs majority-class baseline {lp['majority_baseline']}. "
              "Learnable, but not trivially separable — the ground truth depends on true (pre-sensor-noise) values and unobserved factors.\n"
              "This is a data-quality probe only; the real model and its evaluation are produced in the ML phase.")
    R.section("Why a personal baseline (Digital Twin evidence)",
              f"Detecting *Excessive_Idle* anomalies ({pz['positives']} positives among {pz['n']} sessions):\n\n"
              f"- one global idle-rate threshold: ROC-AUC **{pz['auc_global_idle_rate']}**\n"
              f"- deviation from the operator's own baseline: ROC-AUC **{pz['auc_personal_z']}**\n\n"
              "Operators have different normal idle habits (e.g. a loader operator waiting on trucks), so a single threshold "
              "confuses 'idle-heavy but normal for them' with 'unusual for them'.")
    return R


def _desc(s):
    return f"mean {s.mean():.1f}, median {s.median():.1f}, p5 {s.quantile(.05):.1f}, p95 {s.quantile(.95):.1f}"


def _md_table(header, rows):
    out = ["| " + " | ".join(map(str, header)) + " |", "|" + "---|" * len(header)]
    out += ["| " + " | ".join(map(str, r)) + " |" for r in rows]
    return "\n".join(out)


def write(R: Report):
    lines = ["# Dataset validation report", "",
             "> Synthetic prototype data — not real CAT machine telemetry.", "",
             f"**Result: {'PASS' if not R.failed else 'FAIL'}** — "
             f"{sum(c['status'] == 'PASS' for c in R.checks)} pass, {sum(c['status'] == 'WARN' for c in R.checks)} warn, "
             f"{len(R.failed)} fail", "", "## Checks", "", _md_table(["Check", "Status", "Detail"],
                                                                     [(c['check'], c['status'], c['detail']) for c in R.checks])]
    for t, b in R.sections:
        lines += ["", f"## {t}", "", b]
    with open(os.path.join(OUT, "validation_report.md"), "w") as f:
        f.write("\n".join(lines) + "\n")
    with open(os.path.join(OUT, "validation_report.json"), "w") as f:
        json.dump(dict(passed=not R.failed, checks=R.checks), f, indent=2)


def main():
    df = pd.read_csv(os.path.join(OUT, "cat_operator_synthetic.csv"))
    R = validate(df)
    write(R)
    width = max(len(c["check"]) for c in R.checks)
    for c in R.checks:
        print(f"  {c['status']:4}  {c['check']:<{width}}  {c['detail'][:90]}")
    print(f"\n{'PASSED' if not R.failed else 'FAILED'} → {os.path.join(OUT, 'validation_report.md')}")
    sys.exit(1 if R.failed else 0)


if __name__ == "__main__":
    main()
