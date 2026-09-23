"""Phase 5 – Safety risk model.   python ml/train_safety_model.py

Pipeline
  1. operator-grouped 70/15/15 split (no operator in two parts)
  2. train 4 candidates on TRAIN
  3. select on VALIDATION log-loss (probability quality – the 0–100 score is built from probabilities)
  4. refit winner on TRAIN+VAL, evaluate ONCE on TEST
  5. save versioned artifact + metadata + metrics

Outputs of the served model
  probabilities  P(LOW..CRITICAL)
  score (0–100)  isotonic calibration of Σ P(level)·band-midpoint onto the ground-truth risk index
                 (monotone, fitted on training data only) – a PROJECT metric, not a CAT metric
  level          band of the served score using ALERT thresholds. Ground-truth labels use 30/55/75; the
                 alert thresholds are that set shifted down by the smallest δ that reaches
                 HIGH∪CRITICAL recall ≥ 0.90 on VALIDATION (never tuned on test). Because the level is the
                 score's band, "score" and "level" shown in the UI can never contradict each other.
                 A cost-sensitive argmin rule is reported for comparison.
"""
import json
import os
import sys
import time

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from sklearn.compose import ColumnTransformer  # noqa: E402
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier  # noqa: E402
from sklearn.isotonic import IsotonicRegression  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score, log_loss, mean_absolute_error,  # noqa: E402
                             precision_score, recall_score, roc_auc_score)
from sklearn.pipeline import make_pipeline  # noqa: E402
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, OrdinalEncoder, StandardScaler  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ml.common import FIGS, REPORTS, SEED, load_data, operator_split, save_artifact  # noqa: E402
from ml.features import (INTERACTIONS, LEVEL_MIDPOINT, RISK_LEVELS, SAFETY_CATEGORICAL, SAFETY_FORBIDDEN,  # noqa: E402
                         SAFETY_GROUPS, SAFETY_NUMERIC, SAFETY_RAW_INPUTS, SAFETY_TARGET, add_interactions,
                         check_no_leakage, ordinal, safety_frame)

VERSION = "v1"
K = len(RISK_LEVELS)
UNDER_PENALTY = 2.0
COST = np.array([[abs(t - p) * (UNDER_PENALTY if p < t else 1.0) for p in range(K)] for t in range(K)])
MID = np.array([LEVEL_MIDPOINT[l] for l in RISK_LEVELS])
NUM, CAT = SAFETY_NUMERIC, SAFETY_CATEGORICAL


def candidates():
    lin = ColumnTransformer([("num", StandardScaler(), NUM), ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])
    lin_i = ColumnTransformer([("num", StandardScaler(), NUM + INTERACTIONS),
                               ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])
    tree = ColumnTransformer([("num", "passthrough", NUM),
                              ("cat", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1), CAT)])
    cat_idx = list(range(len(NUM), len(NUM) + len(CAT)))
    return {
        "logistic_regression": make_pipeline(lin, LogisticRegression(max_iter=4000)),
        "logistic_regression_interactions": make_pipeline(FunctionTransformer(add_interactions), lin_i,
                                                          LogisticRegression(max_iter=4000)),
        "random_forest": make_pipeline(tree, RandomForestClassifier(300, min_samples_leaf=3, n_jobs=-1, random_state=SEED)),
        "hist_gradient_boosting": make_pipeline(tree, HistGradientBoostingClassifier(
            max_iter=1500, learning_rate=0.03, max_leaf_nodes=15, l2_regularization=1.0, min_samples_leaf=40,
            categorical_features=cat_idx, early_stopping=True, validation_fraction=0.1, n_iter_no_change=30,
            random_state=SEED)),
    }


def proba(model, X):
    P = model.predict_proba(X)
    cls = list(model.classes_)
    return P[:, [cls.index(l) for l in RISK_LEVELS]]


def decide(P):
    """Comparison rule: cost-sensitive argmin (under-prediction cost ×2 per level)."""
    return np.array(RISK_LEVELS)[(P @ COST).argmin(1)]


LABEL_CUTS = np.array([30.0, 55.0, 75.0])
RECALL_TARGET = 0.90


def fit_calibrator(P, true_score):
    return IsotonicRegression(y_min=0, y_max=100, out_of_bounds="clip").fit(P @ MID, true_score)


CAL = None  # set in main(); score = CAL(P @ MID)


def served_score(P):
    return CAL.predict(P @ MID) if CAL is not None else P @ MID


def band(P, cuts):
    return np.array(RISK_LEVELS)[np.digitize(served_score(P), cuts)]


def hc_recall(y, pred):
    return float(np.mean(np.isin(pred[np.isin(y, ["HIGH", "CRITICAL"])], ["HIGH", "CRITICAL"])))


def choose_alert_cuts(y_val, P_val):
    for delta in np.arange(0, 15.5, 0.5):
        cuts = LABEL_CUTS - delta
        if hc_recall(y_val, band(P_val, cuts)) >= RECALL_TARGET:
            return cuts, float(delta)
    return LABEL_CUTS - 15, 15.0


def metrics(y, P, true_score, cuts=LABEL_CUTS):
    out = {"alert_cuts": list(cuts)}
    for rule, pred in [("served_alert_band", band(P, cuts)), ("argmax", np.array(RISK_LEVELS)[P.argmax(1)]),
                       ("cost_sensitive", decide(P))]:
        rec = recall_score(y, pred, labels=RISK_LEVELS, average=None, zero_division=0)
        pre = precision_score(y, pred, labels=RISK_LEVELS, average=None, zero_division=0)
        f1 = f1_score(y, pred, labels=RISK_LEVELS, average=None, zero_division=0)
        d = ordinal(y) - ordinal(pred)
        out[rule] = dict(
            accuracy=accuracy_score(y, pred), macro_f1=f1_score(y, pred, average="macro"),
            per_class={l: dict(precision=pre[i], recall=rec[i], f1=f1[i]) for i, l in enumerate(RISK_LEVELS)},
            high_or_critical_recall=hc_recall(y, pred), low_false_alarm=float(np.mean(pred[y == "LOW"] != "LOW")),
            under_by_2plus=float(np.mean(d >= 2)), critical_as_low=int(np.sum((y == "CRITICAL") & (pred == "LOW"))),
            confusion_matrix=confusion_matrix(y, pred, labels=RISK_LEVELS).tolist())
    yo = ordinal(y)
    out["log_loss"] = log_loss(yo, P, labels=range(K))
    out["roc_auc_ovr_macro"] = roc_auc_score(yo, P, multi_class="ovr", labels=range(K))
    out["roc_auc_per_class"] = {l: roc_auc_score(yo == i, P[:, i]) for i, l in enumerate(RISK_LEVELS)}
    score = served_score(P)
    out["score_mae_vs_ground_truth_index"] = mean_absolute_error(true_score, score)
    out["score_spearman_vs_ground_truth_index"] = float(np.corrcoef(np.argsort(np.argsort(score)),
                                                                    np.argsort(np.argsort(true_score)))[0, 1])
    return out


def reference_state(df, X, tr):
    """Two dictionaries over SAFETY_RAW_INPUTS, both computed on TRAIN only:
    reference_state – 'typical safe operation' (median / mode of LOW-risk sessions): the explanation baseline;
    typical_inputs  – median / mode of all sessions: defaults for fields an API caller omits."""
    raw = df.iloc[tr].copy()
    raw["Harsh_Rate_per_h"] = X.iloc[tr]["Harsh_Rate_per_h"].to_numpy()

    def summarise(frame):
        return {c: (float(frame[c].median()) if frame[c].dtype.kind in "fiu" else str(frame[c].mode().iloc[0]))
                for c in SAFETY_RAW_INPUTS}
    return summarise(raw[raw[SAFETY_TARGET] == "LOW"]), summarise(raw)


def main():
    global CAL
    t0 = time.time()
    df = load_data()
    X = safety_frame(df)
    check_no_leakage(X.columns, SAFETY_FORBIDDEN)
    y = df[SAFETY_TARGET].to_numpy()
    tr, va, te = operator_split(df)
    s_true = df["Safety_Risk_Score"].to_numpy()

    # ---- candidates on validation
    val = {}
    for name, m in candidates().items():
        t = time.time()
        m.fit(X.iloc[tr], y[tr])
        val[name] = metrics(y[va], proba(m, X.iloc[va]), s_true[va])
        val[name]["fit_seconds"] = round(time.time() - t, 1)
        v = val[name]
        print(f"  {name:34s} logloss {v['log_loss']:.3f}  macroF1(argmax) {v['argmax']['macro_f1']:.3f}  ({v['fit_seconds']}s)")
    best = min(val, key=lambda k: val[k]["log_loss"])
    print(f"  selected: {best} (lowest validation log-loss)")
    sel = candidates()[best].fit(X.iloc[tr], y[tr])          # calibrate on TRAIN, choose alert thresholds on VALIDATION
    CAL = fit_calibrator(proba(sel, X.iloc[tr]), s_true[tr])
    cuts, delta = choose_alert_cuts(y[va], proba(sel, X.iloc[va]))
    print(f"  alert thresholds {cuts.tolist()} (label thresholds − {delta}) → validation H∪C recall ≥ {RECALL_TARGET}")

    # ---- refit on train+val, evaluate once on test
    trva = np.concatenate([tr, va])
    model = candidates()[best].fit(X.iloc[trva], y[trva])
    CAL = fit_calibrator(proba(model, X.iloc[trva]), s_true[trva])
    P_te = proba(model, X.iloc[te])
    test = metrics(y[te], P_te, s_true[te], cuts)

    # error analysis by latent scenario (stratification only – never a feature)
    pred = band(P_te, cuts)
    by_scen = {}
    for s in sorted(df["Scenario"].unique()):
        m = df["Scenario"].iloc[te].to_numpy() == s
        by_scen[s] = dict(n=int(m.sum()), accuracy=float(np.mean(pred[m] == y[te][m])),
                          under_predicted=float(np.mean(ordinal(pred[m]) < ordinal(y[te][m]))))
    test["by_scenario"] = by_scen

    ref, typical = reference_state(df, X, tr)
    # training input ranges (0.5–99.5 %) for out-of-distribution warnings; speed per machine type
    raw_tr = df.iloc[trva].copy(); raw_tr["Harsh_Rate_per_h"] = X.iloc[trva]["Harsh_Rate_per_h"].to_numpy()
    ranges = {c: [float(raw_tr[c].quantile(0.005)), float(raw_tr[c].quantile(0.995))]
              for c in SAFETY_RAW_INPUTS if raw_tr[c].dtype.kind in "fiu"}
    speed_by_type = {t: [0.0, float(g.quantile(0.995))] for t, g in raw_tr.groupby("Machine_Type")["Machine_Speed"]}
    categories = {c: sorted(raw_tr[c].astype(str).unique()) for c in SAFETY_RAW_INPUTS if raw_tr[c].dtype.kind not in "fiu"}
    artifact = dict(model=model, calibrator=CAL, levels=RISK_LEVELS, alert_cuts=cuts, label_cuts=LABEL_CUTS, midpoints=MID, groups=SAFETY_GROUPS,
                    reference_state=ref, typical_inputs=typical, raw_inputs=SAFETY_RAW_INPUTS,
                    input_ranges=ranges, speed_range_by_type=speed_by_type, categories=categories)
    cm_m = {k: v for k, v in val.items()}
    path = save_artifact("safety_model", VERSION, artifact, dict(
        task="4-class safety risk level + probability-weighted 0–100 risk index",
        selected_model=best, selection_criterion="lowest validation log-loss",
        features_numeric=NUM, features_categorical=CAT, interaction_terms=INTERACTIONS if "interactions" in best else [],
        excluded_for_leakage=sorted(SAFETY_FORBIDDEN), target=SAFETY_TARGET,
        split="operator-grouped 70/15/15 (seed 42); final model refit on train+val", n_train=len(tr), n_val=len(va), n_test=len(te),
        decision_rule=f"level = band of score with alert thresholds {cuts.tolist()} (label thresholds minus {delta}, chosen on validation for HIGH∪CRITICAL recall ≥ {RECALL_TARGET})", score_definition="isotonic(sum_k P(k) * midpoint(k)) calibrated to the ground-truth index on training data; midpoints " + json.dumps(LEVEL_MIDPOINT),
        explanation="exact Shapley values over 7 feature groups vs a typical low-risk reference state",
        metrics_test=test, metrics_validation_candidates=cm_m))

    os.makedirs(REPORTS, exist_ok=True)
    with open(os.path.join(REPORTS, "safety_model_metrics.json"), "w") as f:
        json.dump(dict(selected=best, validation=val, test=test), f, indent=2, default=float)
    plot(test, val, best)
    c = test["served_alert_band"]
    print(f"\nTEST ({len(te)} sessions, {df['Operator_ID'].iloc[te].nunique()} unseen operators)\n"
          f"  accuracy {c['accuracy']:.3f}  macro-F1 {c['macro_f1']:.3f}  ROC-AUC {test['roc_auc_ovr_macro']:.3f}  log-loss {test['log_loss']:.3f}\n"
          f"  recall L/M/H/C {[round(c['per_class'][l]['recall'], 3) for l in RISK_LEVELS]}   HIGH∪CRITICAL recall {c['high_or_critical_recall']:.3f}\n"
          f"  under-predicted by ≥2 levels {c['under_by_2plus']:.4f}   CRITICAL→LOW {c['critical_as_low']}\n"
          f"  LOW false-alarm {c['low_false_alarm']:.3f}   (cost-sensitive rule for comparison: H∪C recall {test['cost_sensitive']['high_or_critical_recall']:.3f}, LOW false-alarm {test['cost_sensitive']['low_false_alarm']:.3f})\n"
          f"  score MAE vs ground-truth index {test['score_mae_vs_ground_truth_index']:.2f}\n"
          f"saved {path}  ({time.time() - t0:.0f}s)")


def plot(test, val, best):
    os.makedirs(FIGS, exist_ok=True)
    fig, ax = plt.subplots(1, 2, figsize=(10, 3.8))
    cm = np.array(test["served_alert_band"]["confusion_matrix"])
    cmn = cm / cm.sum(1, keepdims=True)
    ax[0].imshow(cmn, cmap="Blues", vmin=0, vmax=1)
    for i in range(K):
        for j in range(K):
            ax[0].text(j, i, f"{cm[i, j]}\n{cmn[i, j]:.0%}", ha="center", va="center", fontsize=8,
                       color="white" if cmn[i, j] > 0.5 else "black")
    ax[0].set_xticks(range(K)); ax[0].set_xticklabels(RISK_LEVELS, fontsize=8); ax[0].set_yticks(range(K))
    ax[0].set_yticklabels(RISK_LEVELS, fontsize=8); ax[0].set_xlabel("Predicted"); ax[0].set_ylabel("True")
    ax[0].set_title("Test confusion (served alert rule)", fontsize=10); ax[0].grid(False)
    names = list(val); ll = [val[n]["log_loss"] for n in names]; hc = [val[n]["argmax"]["high_or_critical_recall"] for n in names]
    x = np.arange(len(names))
    ax[1].bar(x - 0.2, ll, 0.4, color=["#2a8ea0" if n == best else "#b8c0c7" for n in names], label="log-loss (↓)")
    ax2 = ax[1].twinx(); ax2.plot(x + 0.2, hc, "o", color="#ff8a3d", label="HIGH∪CRIT recall (↑)"); ax2.set_ylim(0.5, 1)
    ax[1].set_xticks(x); ax[1].set_xticklabels([n.replace("_", "\n") for n in names], fontsize=7)
    ax[1].set_title("Validation: candidates", fontsize=10); ax[1].set_ylabel("log-loss"); ax2.set_ylabel("recall", color="#ff8a3d")
    fig.tight_layout(); fig.savefig(os.path.join(FIGS, "ml_safety_model.png"), dpi=110); plt.close(fig)


if __name__ == "__main__":
    main()
