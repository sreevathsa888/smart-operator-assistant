"""Phase 7 – Task completion time.   python ml/train_task_model.py

Two regressors, same pipeline:
  remaining : minutes left for an IN-PROGRESS task   (target Task_Completion_Time; uses progress)
  total     : total minutes for a PENDING task        (target Actual_Task_Duration; pre-start features only)

Candidates: planner rule (no ML), linear regression, random forest, gradient boosting (raw and log target).
Selected on VALIDATION MAE; refit on train+val; evaluated once on TEST (operator-grouped split).

Range: gradient-boosting quantile models (10th / 90th percentile) + split-conformal correction computed on
validation (CQR, Romano et al. 2019), so the displayed range targets 80 % coverage – verified on test.
"""
import json
import os
import sys
import time

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from sklearn.compose import ColumnTransformer, TransformedTargetRegressor  # noqa: E402
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor  # noqa: E402
from sklearn.linear_model import Ridge  # noqa: E402
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score  # noqa: E402
from sklearn.pipeline import make_pipeline  # noqa: E402
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ml.common import FIGS, REPORTS, SEED, load_data, operator_split, save_artifact  # noqa: E402
from ml.features import (TASK_CATEGORICAL, TASK_FORBIDDEN, TASK_TARGET_REMAINING, TASK_TARGET_TOTAL,  # noqa: E402
                         check_no_leakage, task_frame)

VERSION = "v1"
ALPHA = 0.20   # 80 % interval


def candidates(num, cat):
    lin = ColumnTransformer([("n", StandardScaler(), num), ("c", OneHotEncoder(handle_unknown="ignore"), cat)])
    tree = ColumnTransformer([("n", "passthrough", num),
                              ("c", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1), cat)])
    ci = list(range(len(num), len(num) + len(cat)))

    def hgb(loss="squared_error", q=None):
        kw = dict(quantile=q) if q is not None else {}
        return HistGradientBoostingRegressor(loss=loss, max_iter=800, learning_rate=0.05, max_leaf_nodes=31,
                                             min_samples_leaf=30, categorical_features=ci, early_stopping=True,
                                             validation_fraction=0.1, n_iter_no_change=30, random_state=SEED, **kw)
    return {
        "linear_regression": make_pipeline(lin, Ridge(alpha=1.0)),
        "random_forest": make_pipeline(tree, RandomForestRegressor(200, min_samples_leaf=3, max_features=0.5,
                                                                   n_jobs=-1, random_state=SEED)),
        "gradient_boosting": make_pipeline(tree, hgb()),
        "gradient_boosting_log": make_pipeline(tree, TransformedTargetRegressor(
            regressor=hgb(), func=np.log1p, inverse_func=np.expm1)),
    }, (lambda q: make_pipeline(tree, hgb("quantile", q)))


def reg_metrics(y, p):
    return dict(mae=mean_absolute_error(y, p), rmse=float(np.sqrt(mean_squared_error(y, p))), r2=r2_score(y, p),
                median_abs_pct_error=float(np.median(np.abs(p - y) / np.maximum(y, 1))))


def train_one(kind, df, tr, va, te):
    progress = kind == "remaining"
    target = TASK_TARGET_REMAINING if progress else TASK_TARGET_TOTAL
    X = task_frame(df, progress=progress)
    check_no_leakage(X.columns, TASK_FORBIDDEN)
    y = df[target].to_numpy(float)
    num = [c for c in X.columns if c not in TASK_CATEGORICAL]
    cands, quantile_model = candidates(num, TASK_CATEGORICAL)

    planner = X["Planner_Remaining"].to_numpy() if progress else X["Estimated_Task_Duration"].to_numpy()
    val = {"planner_rule_no_ml": reg_metrics(y[va], planner[va])}
    for name, m in cands.items():
        t = time.time(); m.fit(X.iloc[tr], y[tr])
        val[name] = reg_metrics(y[va], m.predict(X.iloc[va])); val[name]["fit_seconds"] = round(time.time() - t, 1)
    print(f"[{kind}] target {target}")
    for k, v in val.items():
        print(f"  {k:24s} MAE {v['mae']:6.2f}  RMSE {v['rmse']:6.2f}  R² {v['r2']:.3f}  median |%err| {v['median_abs_pct_error']:.3f}")
    best = min(cands, key=lambda k: val[k]["mae"])
    print(f"  selected: {best}")

    # conformal calibration of the quantile band: fit on TRAIN, calibrate on VAL
    lo_m, hi_m = quantile_model(ALPHA / 2).fit(X.iloc[tr], y[tr]), quantile_model(1 - ALPHA / 2).fit(X.iloc[tr], y[tr])
    lo_v, hi_v = lo_m.predict(X.iloc[va]), hi_m.predict(X.iloc[va])
    conf = np.maximum(lo_v - y[va], y[va] - hi_v)
    q = float(np.quantile(conf, np.ceil((len(va) + 1) * (1 - ALPHA)) / len(va)))

    # final: point model on train+val; quantile models stay on TRAIN so the conformal offset remains valid
    trva = np.concatenate([tr, va])
    point = cands[best].fit(X.iloc[trva], y[trva])
    p_te = point.predict(X.iloc[te])
    lo_t, hi_t = np.maximum(lo_m.predict(X.iloc[te]) - q, 0), hi_m.predict(X.iloc[te]) + q
    lo_t, hi_t = np.minimum(lo_t, p_te), np.maximum(hi_t, p_te)          # range always contains the point
    test = reg_metrics(y[te], p_te)
    test["planner_rule_no_ml"] = reg_metrics(y[te], planner[te])
    test["interval_target_coverage"] = 1 - ALPHA
    test["interval_coverage"] = float(np.mean((y[te] >= lo_t) & (y[te] <= hi_t)))
    test["interval_mean_width_min"] = float(np.mean(hi_t - lo_t))
    test["interval_median_rel_width"] = float(np.median((hi_t - lo_t) / np.maximum(p_te, 1)))
    print(f"  TEST MAE {test['mae']:.2f} (planner {test['planner_rule_no_ml']['mae']:.2f})  RMSE {test['rmse']:.2f}  R² {test['r2']:.3f}"
          f"  | 80% range coverage {test['interval_coverage']:.3f}, mean width {test['interval_mean_width_min']:.0f} min")
    return dict(kind=kind, target=target, features=list(X.columns), selected=best, point=point, lower=lo_m, upper=hi_m,
                conformal_offset=q, validation=val, test=test, y_te=y[te], p_te=p_te, lo_te=lo_t, hi_te=hi_t)


def main():
    t0 = time.time()
    df = load_data()
    tr, va, te = operator_split(df)
    res = {k: train_one(k, df, tr, va, te) for k in ("remaining", "total")}

    artifact = {k: dict(point=r["point"], lower=r["lower"], upper=r["upper"], conformal_offset=r["conformal_offset"],
                        features=r["features"], target=r["target"]) for k, r in res.items()}
    path = save_artifact("task_time_model", VERSION, artifact, dict(
        task="task completion time: remaining minutes (in-progress) and total minutes (pending)",
        models={k: dict(selected=r["selected"], target=r["target"], features=r["features"],
                        metrics_test=r["test"], metrics_validation_candidates=r["validation"]) for k, r in res.items()},
        excluded_for_leakage=sorted(TASK_FORBIDDEN),
        split="operator-grouped 70/15/15 (seed 42); point model refit on train+val",
        interval=f"{int((1 - ALPHA) * 100)} % split-conformal quantile interval (quantile models on train, calibrated on val)"))
    with open(os.path.join(REPORTS, "task_model_metrics.json"), "w") as f:
        json.dump({k: dict(selected=r["selected"], validation=r["validation"], test=r["test"]) for k, r in res.items()},
                  f, indent=2, default=float)

    r = res["remaining"]
    fig, ax = plt.subplots(1, 2, figsize=(10, 3.8))
    s = np.random.default_rng(0).choice(len(r["y_te"]), 1500, replace=False)
    ax[0].scatter(r["y_te"][s], r["p_te"][s], s=5, alpha=0.4, color="#2a8ea0")
    m = max(r["y_te"].max(), r["p_te"].max()); ax[0].plot([0, m], [0, m], color="#1d2228", lw=0.8)
    ax[0].set_xlabel("Actual remaining (min)"); ax[0].set_ylabel("Predicted (min)")
    ax[0].set_title(f"Remaining time – test MAE {r['test']['mae']:.1f} min, R² {r['test']['r2']:.3f}", fontsize=9)
    o = np.argsort(r["p_te"])[:: max(1, len(r["p_te"]) // 120)]
    ax[1].fill_between(range(len(o)), r["lo_te"][o], r["hi_te"][o], color="#56c7db", alpha=0.3, label="80 % range")
    ax[1].plot(range(len(o)), r["p_te"][o], color="#2a8ea0", lw=1, label="prediction")
    ax[1].scatter(range(len(o)), r["y_te"][o], s=6, color="#1d2228", label="actual")
    ax[1].set_title(f"Range coverage on test {r['test']['interval_coverage']:.1%}", fontsize=9)
    ax[1].set_xlabel("test tasks (sorted by prediction)"); ax[1].legend(fontsize=7)
    fig.tight_layout(); fig.savefig(os.path.join(FIGS, "ml_task_model.png"), dpi=110); plt.close(fig)
    print(f"saved {path}  ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
