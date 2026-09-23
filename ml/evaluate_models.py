"""Consolidated model report.   python ml/evaluate_models.py   → reports/model_report.md

Reads ONLY the saved artifacts' metadata.json (what is actually deployed) and re-checks each model on
a few canonical scenarios through ml/inference.py, so the report cannot drift from the served models.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ml.common import REPORTS, load_artifact  # noqa: E402
from ml.features import RISK_LEVELS  # noqa: E402
from ml.inference import anomaly, safety, task_time  # noqa: E402


def t(header, rows):
    return "\n".join(["| " + " | ".join(header) + " |", "|" + "---|" * len(header)] +
                     ["| " + " | ".join(str(c) for c in r) + " |" for r in rows])


def f3(x):
    return f"{x:.3f}"


def main():
    md = ["# Model evaluation report", "",
          "> Generated from `models/*/metadata.json` by `python ml/evaluate_models.py`. "
          "All metrics are on **synthetic** data and do not indicate real-world performance.", ""]

    # ---------------- safety
    _, sm = load_artifact("safety_model")
    te = sm["metrics_test"]; s = te["served_alert_band"]
    md += ["## 1. Safety risk model", "", f"Selected **{sm['selected_model']}** ({sm['selection_criterion']}). "
           f"Split: {sm['split']}. Decision: {sm['decision_rule']}.", "",
           "### Validation – candidates", "",
           t(["Candidate", "Log-loss ↓", "Macro-F1 (argmax)", "Fit (s)"],
             [(k, f3(v["log_loss"]), f3(v["argmax"]["macro_f1"]), v["fit_seconds"])
              for k, v in sm["metrics_validation_candidates"].items()]), "",
           f"### Test – {sm['n_test']:,} sessions from unseen operators", "",
           t(["Metric", "Value"], [
               ("Accuracy", f3(s["accuracy"])), ("Macro-F1", f3(s["macro_f1"])),
               ("ROC-AUC (one-vs-rest, macro)", f3(te["roc_auc_ovr_macro"])), ("Log-loss", f3(te["log_loss"])),
               ("HIGH ∪ CRITICAL recall", f3(s["high_or_critical_recall"])),
               ("LOW sessions raised to MEDIUM+ (false alarm)", f3(s["low_false_alarm"])),
               ("Under-predicted by ≥ 2 levels", f"{s['under_by_2plus']:.4f}"), ("CRITICAL predicted LOW", s["critical_as_low"]),
               ("Risk-score MAE vs ground-truth index (0–100)", f"{te['score_mae_vs_ground_truth_index']:.2f}")]), "",
           t(["Level", "Precision", "Recall", "F1", "ROC-AUC"],
             [(l, f3(s["per_class"][l]["precision"]), f3(s["per_class"][l]["recall"]), f3(s["per_class"][l]["f1"]),
               f3(te["roc_auc_per_class"][l])) for l in RISK_LEVELS]), "",
           "Confusion matrix (rows = true, columns = predicted, order LOW/MEDIUM/HIGH/CRITICAL):", "",
           t(["", *RISK_LEVELS], [(l, *row) for l, row in zip(RISK_LEVELS, s["confusion_matrix"])]), "",
           "Error analysis by latent scenario (test):", "",
           t(["Scenario", "n", "Accuracy", "Under-predicted"],
             [(k, v["n"], f3(v["accuracy"]), f3(v["under_predicted"])) for k, v in te["by_scenario"].items()]), "",
           "![](../docs/figures/ml_safety_model.png)", ""]

    S = safety()
    demo = {"speed": 6.8, "distance": 1.7, "load": 85, "slope": 11, "visibility": 80, "Obstacle_Type": "Worker",
            "Travel_Direction": "Reverse", "Blind_Zone_Entry": 1}
    r = S.predict(demo)
    md += ["### Canonical check – the UI demo event", "",
           "Input: worker at 1.7 m, 6.8 km/h, reversing into blind zone, 11° slope, 85 % load, visibility 80 %.", "",
           f"Served: **{r['score']} / 100 – {r['level']}** (baseline for typical safe operation {r['baseline_score']}).", "",
           t(["Factor", "Points added", "Share of increase", "Value", "Typical safe"],
             [(c["key"], c["points"], f"{c['pct']} %", f"{c['value']} {c['unit']}", f"{c['reference']} {c['unit']}")
              for c in r["contributions"]]), ""]

    # ---------------- anomaly
    _, am = load_artifact("anomaly_model")
    md += ["## 2. Personalised anomaly detection (Operator Digital Twin)", "",
           f"Selected **{am['selected_model']}** ({am['selection_criterion']}). Split: {am['split']}. "
           f"{am['operators_with_baseline']} operators have a personal baseline.", "",
           t(["Detector", "ROC-AUC", "PR-AUC", "Precision", "Recall", "F1", "Flagged"],
             [(k, f3(v["roc_auc"]), f3(v["pr_auc"]), f3(v["precision"]), f3(v["recall"]), f3(v["f1"]),
               f"{v['flagged_rate']:.1%}") for k, v in am["metrics_eval"].items()]), "",
           f"Reason agreement (top personal deviation = generator's reason) on true anomalies: **{am['reason_agreement']:.3f}**.", "",
           "![](../docs/figures/ml_anomaly_model.png)", ""]
    b = anomaly().baseline("OP1007")["bands"]
    md += ["OP1007 learned typical bands (10th–90th percentile of history): " +
           "; ".join(f"{v['label']} {v['low']}–{v['high']} {v['unit']}" for v in b.values()) + ".", ""]

    # ---------------- task
    _, tm = load_artifact("task_time_model")
    md += ["## 3. Task completion time", "", f"{tm['interval']}. Split: {tm['split']}.", ""]
    for kind, m in tm["models"].items():
        md += [f"### {kind} (target `{m['target']}`) – selected **{m['selected']}**", "",
               t(["Candidate (validation)", "MAE (min)", "RMSE", "R²", "Median |% error|"],
                 [(k, f"{v['mae']:.2f}", f"{v['rmse']:.2f}", f3(v["r2"]), f"{v['median_abs_pct_error']:.1%}")
                  for k, v in m["metrics_validation_candidates"].items()]), "",
               t(["Test metric", "Value"], [
                   ("MAE (min)", f"{m['metrics_test']['mae']:.2f}"), ("Planner-rule MAE (min)", f"{m['metrics_test']['planner_rule_no_ml']['mae']:.2f}"),
                   ("RMSE (min)", f"{m['metrics_test']['rmse']:.2f}"), ("R²", f3(m["metrics_test"]["r2"])),
                   ("80 % range – empirical coverage", f"{m['metrics_test']['interval_coverage']:.1%}"),
                   ("80 % range – mean width (min)", f"{m['metrics_test']['interval_mean_width_min']:.0f}")]), ""]
    md += ["![](../docs/figures/ml_task_model.png)", ""]
    os.makedirs(REPORTS, exist_ok=True)
    with open(os.path.join(REPORTS, "model_report.md"), "w") as f:
        f.write("\n".join(md) + "\n")
    print("wrote reports/model_report.md")


if __name__ == "__main__":
    main()
