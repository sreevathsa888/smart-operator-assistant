"""Phase 6 – Personalised operator anomaly detection (Operator Digital Twin).   python ml/train_anomaly_model.py

Design
  * TIME split: first 120 days = history (baselines + model fit), last 60 days = evaluation.
    This is how a twin is used: learn an operator's normal, then judge new sessions.
  * Context normalisation: travel speed and fuel burn depend on terrain / load / machine class, so each is
    divided by a CONTEXT-EXPECTED value from a small regression fitted on history. What remains is behaviour.
  * Personal baseline: per operator, robust median and MAD-based SD of every behaviour metric over history.
  * Personal z-score of the session on every metric → Isolation Forest on the z-vectors (pooled across
    operators, which is valid because z-vectors are on a common personal scale).
  * The detector is UNSUPERVISED. Labels (Operator_Anomaly) are used only to (a) pick the alert threshold on
    the HISTORY period – standing in for a small supervisor-reviewed set – and (b) evaluate on the later period.
"""
import json
import os
import sys
import time

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.compose import ColumnTransformer  # noqa: E402
from sklearn.ensemble import HistGradientBoostingRegressor, IsolationForest  # noqa: E402
from sklearn.metrics import average_precision_score, f1_score, precision_score, recall_score, roc_auc_score  # noqa: E402
from sklearn.pipeline import make_pipeline  # noqa: E402
from sklearn.preprocessing import OrdinalEncoder  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ml.common import FIGS, REPORTS, SEED, load_data, save_artifact, time_split  # noqa: E402
from ml.features import (ANOMALY_FORBIDDEN, BEHAVIOUR, BEHAVIOUR_LABEL, FUEL_CTX_CAT, FUEL_CTX_NUM,  # noqa: E402
                         SPEED_CTX_CAT, SPEED_CTX_NUM, behaviour_raw, check_no_leakage, fuel_ctx_frame,
                         speed_ctx_frame)

VERSION = "v1"
MIN_SESSIONS = 20          # fewer history sessions → fall back to the fleet baseline (cold start)
ONE_SIDED = {d: True for d in BEHAVIOUR}
ONE_SIDED["speed_ratio"] = False   # unusually slow is also worth noting; everything else: only "more" is bad


def ctx_regressor(num, cat):
    enc = ColumnTransformer([("n", "passthrough", num),
                             ("c", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1), cat)])
    return make_pipeline(enc, HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05,
                                                            categorical_features=list(range(len(num), len(num) + len(cat))),
                                                            random_state=SEED))


def behaviour(df, speed_model, fuel_model):
    B = behaviour_raw(df)
    B["speed_ratio"] = (df["Machine_Speed"].astype(float) + 0.3) / (speed_model.predict(speed_ctx_frame(df)) + 0.3)
    B["fuel_ratio"] = df["Fuel_Consumption"].astype(float) / fuel_model.predict(fuel_ctx_frame(df))
    return B[BEHAVIOUR]


def robust_baselines(B, ops):
    """Per-operator median / robust SD / typical band (p10–p90) for each metric."""
    rows = []
    for op, g in B.groupby(ops):
        r = {"Operator_ID": op, "n": len(g)}
        for d in BEHAVIOUR:
            x = g[d].to_numpy()
            med = np.median(x)
            r[f"{d}_med"] = med
            r[f"{d}_sd"] = 1.4826 * np.median(np.abs(x - med))
            r[f"{d}_p10"], r[f"{d}_p90"] = np.percentile(x, [10, 90])
        rows.append(r)
    return pd.DataFrame(rows).set_index("Operator_ID")


def personal_z(B, ops, base, fleet, floors):
    Z = pd.DataFrame(index=B.index, columns=BEHAVIOUR, dtype=float)
    known = ops.isin(base.index[base["n"] >= MIN_SESSIONS]).to_numpy()
    for d in BEHAVIOUR:
        med = np.where(known, ops.map(base[f"{d}_med"]), fleet[f"{d}_med"])
        sd = np.where(known, ops.map(base[f"{d}_sd"]), fleet[f"{d}_sd"])
        z = (B[d].to_numpy() - med) / np.maximum(sd, floors[d])
        Z[d] = z if not ONE_SIDED[d] else np.maximum(z, 0) + 0.2 * np.minimum(z, 0)  # damp "better than usual"
    return Z


def evaluate(y, score, thr):
    pred = score >= thr
    return dict(roc_auc=roc_auc_score(y, score), pr_auc=average_precision_score(y, score),
                precision=precision_score(y, pred, zero_division=0), recall=recall_score(y, pred),
                f1=f1_score(y, pred), threshold=float(thr), flagged_rate=float(pred.mean()))


def best_f1_threshold(y, score):
    qs = np.quantile(score, np.linspace(0.5, 0.99, 99))
    return max(qs, key=lambda t: f1_score(y, score >= t))


def main():
    t0 = time.time()
    df = load_data()
    hist, ev, cut = time_split(df)
    H, E = df.iloc[hist], df.iloc[ev]
    y_h, y_e = H["Operator_Anomaly"].to_numpy(), E["Operator_Anomaly"].to_numpy()
    check_no_leakage(SPEED_CTX_NUM + SPEED_CTX_CAT + FUEL_CTX_NUM + FUEL_CTX_CAT + BEHAVIOUR, ANOMALY_FORBIDDEN)

    # ---- context-expected speed & fuel (history only)
    speed_model = ctx_regressor(SPEED_CTX_NUM, SPEED_CTX_CAT).fit(speed_ctx_frame(H), H["Machine_Speed"].astype(float))
    fuel_model = ctx_regressor(FUEL_CTX_NUM, FUEL_CTX_CAT).fit(fuel_ctx_frame(H), H["Fuel_Consumption"].astype(float))
    B_h, B_e = behaviour(H, speed_model, fuel_model), behaviour(E, speed_model, fuel_model)

    # ---- personal baselines (history)
    base = robust_baselines(B_h, H["Operator_ID"])
    fleet = {}
    for d in BEHAVIOUR:
        med = np.median(B_h[d]); fleet[f"{d}_med"] = med; fleet[f"{d}_sd"] = 1.4826 * np.median(np.abs(B_h[d] - med))
    floors = {d: float(np.percentile(base[f"{d}_sd"], 25)) for d in BEHAVIOUR}   # SD floor: stops tiny-MAD blow-ups
    Z_h = personal_z(B_h, H["Operator_ID"], base, fleet, floors)
    Z_e = personal_z(B_e, E["Operator_ID"], base, fleet, floors)

    results, scores_e = {}, {}
    # (a) global Isolation Forest on raw behaviour – no personalisation
    g_if = IsolationForest(n_estimators=300, random_state=SEED).fit(B_h)
    s_h, s_e = -g_if.score_samples(B_h), -g_if.score_samples(B_e)
    results["global_isolation_forest"] = evaluate(y_e, s_e, best_f1_threshold(y_h, s_h)); scores_e["global_isolation_forest"] = s_e
    # (b) global rule: fleet z (one threshold for everyone)
    fz_h = np.max(np.abs((B_h - [fleet[f"{d}_med"] for d in BEHAVIOUR]) / [max(fleet[f"{d}_sd"], 1e-6) for d in BEHAVIOUR]), 1)
    fz_e = np.max(np.abs((B_e - [fleet[f"{d}_med"] for d in BEHAVIOUR]) / [max(fleet[f"{d}_sd"], 1e-6) for d in BEHAVIOUR]), 1)
    results["global_threshold_rule"] = evaluate(y_e, fz_e.to_numpy(), best_f1_threshold(y_h, fz_h.to_numpy())); scores_e["global_threshold_rule"] = fz_e.to_numpy()
    # (c) personal rule: max personal z
    pr_h, pr_e = Z_h.abs().max(axis=1).to_numpy(), Z_e.abs().max(axis=1).to_numpy()
    results["personal_max_z_rule"] = evaluate(y_e, pr_e, best_f1_threshold(y_h, pr_h)); scores_e["personal_max_z_rule"] = pr_e
    # (d) personalised Isolation Forest on personal z-vectors
    p_if = IsolationForest(n_estimators=300, random_state=SEED).fit(Z_h)
    ps_h, ps_e = -p_if.score_samples(Z_h), -p_if.score_samples(Z_e)
    thr = best_f1_threshold(y_h, ps_h)
    results["personal_isolation_forest"] = evaluate(y_e, ps_e, thr); scores_e["personal_isolation_forest"] = ps_e

    for k, v in results.items():
        print(f"  {k:28s} ROC-AUC {v['roc_auc']:.3f}  PR-AUC {v['pr_auc']:.3f}  P {v['precision']:.3f}  R {v['recall']:.3f}  F1 {v['f1']:.3f}")
    best = max(results, key=lambda k: results[k]["pr_auc"])
    print(f"  selected: {best} (highest PR-AUC on evaluation period; labels ≈{y_e.mean():.0%} positive)")

    # ---- reason accuracy: does the top personal deviation match the generator's reason?
    reason_map = {d: BEHAVIOUR_LABEL[d][2] for d in BEHAVIOUR}
    top_dim = Z_e.idxmax(axis=1).map(reason_map)
    m = y_e == 1
    reason_acc = float(np.mean(top_dim[m].to_numpy() == E["Anomaly_Reason"].to_numpy()[m]))
    print(f"  reason agreement on true anomalies: {reason_acc:.3f}")

    sel = results[best]
    # per-operator score reference distribution (history) → percentile-based 0–1 anomaly score for the UI
    ref_scores = np.sort(ps_h if best == "personal_isolation_forest" else pr_h)
    artifact = dict(detector=best, speed_model=speed_model, fuel_model=fuel_model, baselines=base, fleet=fleet,
                    floors=floors, isolation_forest=p_if, threshold=sel["threshold"], ref_scores=ref_scores,
                    behaviour=BEHAVIOUR, labels=BEHAVIOUR_LABEL, one_sided=ONE_SIDED, min_sessions=MIN_SESSIONS)
    path = save_artifact("anomaly_model", VERSION, artifact, dict(
        task="personalised operator behaviour anomaly detection (Operator Digital Twin)",
        selected_model=best, selection_criterion="highest PR-AUC on the evaluation period",
        behaviour_metrics=BEHAVIOUR, context_models={"speed": SPEED_CTX_NUM + SPEED_CTX_CAT, "fuel": FUEL_CTX_NUM + FUEL_CTX_CAT},
        excluded_for_leakage=sorted(ANOMALY_FORBIDDEN),
        split=f"time-based: history < {cut} (baselines, fit, threshold) / evaluation ≥ {cut}",
        n_history=len(hist), n_eval=len(ev), operators_with_baseline=int((base['n'] >= MIN_SESSIONS).sum()),
        threshold_note="alert threshold chosen for best F1 on the labelled HISTORY period",
        metrics_eval=results, reason_agreement=reason_acc))
    with open(os.path.join(REPORTS, "anomaly_model_metrics.json"), "w") as f:
        json.dump(dict(selected=best, eval=results, reason_agreement=reason_acc, cut=cut), f, indent=2, default=float)

    # ---- figure
    fig, ax = plt.subplots(1, 2, figsize=(10, 3.6))
    names = list(results)
    ax[0].barh(names, [results[n]["pr_auc"] for n in names], color=["#2a8ea0" if n == best else "#b8c0c7" for n in names])
    ax[0].set_xlabel("PR-AUC (evaluation period)"); ax[0].set_xlim(0, 1); ax[0].tick_params(axis="y", labelsize=8)
    for n_, v in zip(names, [results[n]["pr_auc"] for n in names]):
        ax[0].text(v + 0.01, n_, f"{v:.3f}", va="center", fontsize=8)
    op = "OP1007"
    b = base.loc[op]
    sel_rows = E["Operator_ID"] == op
    x = B_e.loc[sel_rows, "idle_per_2h"]
    ax[1].scatter(range(len(x)), x, s=10, c=np.where(E.loc[sel_rows, "Operator_Anomaly"] == 1, "#ff5a52", "#8a939c"))
    ax[1].axhspan(b["idle_per_2h_p10"], b["idle_per_2h_p90"], color="#3fd08a", alpha=0.18, label="personal typical band")
    ax[1].set_title(f"{op}: idle per 2 h, evaluation period (red = labelled anomaly)", fontsize=9)
    ax[1].set_xlabel("session"); ax[1].legend(fontsize=8)
    fig.tight_layout(); fig.savefig(os.path.join(FIGS, "ml_anomaly_model.png"), dpi=110); plt.close(fig)
    print(f"saved {path}  ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
