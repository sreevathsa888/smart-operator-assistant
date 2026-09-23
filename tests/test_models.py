"""Model tests.   Run after training:  pytest -q tests/test_models.py"""
import numpy as np
import pytest

from ml.common import load_artifact, load_data, time_split
from ml.features import ANOMALY_FORBIDDEN, SAFETY_FORBIDDEN, TASK_FORBIDDEN
from ml.inference import anomaly, safety, task_time

DEMO = {"speed": 6.8, "distance": 1.7, "load": 85, "slope": 11, "visibility": 80,
        "Obstacle_Type": "Worker", "Travel_Direction": "Reverse", "Blind_Zone_Entry": 1}


# ---------------------------------------------------------------- metadata & leakage
@pytest.mark.parametrize("name", ["safety_model", "anomaly_model", "task_time_model"])
def test_artifact_metadata(name):
    _, m = load_artifact(name)
    for k in ("model_name", "version", "training_date", "dataset_version", "dataset_sha256"):
        assert m[k]


def test_no_leakage_in_feature_lists():
    _, s = load_artifact("safety_model")
    assert not (set(s["features_numeric"] + s["features_categorical"]) & SAFETY_FORBIDDEN)
    _, t = load_artifact("task_time_model")
    for m in t["models"].values():
        assert not (set(m["features"]) & TASK_FORBIDDEN)
    _, a = load_artifact("anomaly_model")
    assert not (set(a["behaviour_metrics"]) & ANOMALY_FORBIDDEN)


# ---------------------------------------------------------------- safety
def test_safety_quality_guards():
    _, m = load_artifact("safety_model")
    s = m["metrics_test"]["served_alert_band"]
    assert s["high_or_critical_recall"] >= 0.85
    assert s["critical_as_low"] == 0
    assert s["under_by_2plus"] < 0.005
    assert s["accuracy"] < 0.97          # synthetic data must not be trivially separable


IN_DIST = {"speed": 3.5, "distance": 6, "load": 75, "slope": 6, "visibility": 85, "Obstacle_Type": "Worker",
           "Travel_Direction": "Forward", "Blind_Zone_Entry": 0, "Machine_Type": "Excavator"}


def test_risk_rises_as_worker_gets_closer_and_faster():
    S = safety()
    d = [r["score"] for r in S.score_batch([{**IN_DIST, "distance": x} for x in (12, 8, 5, 3, 1.5)])]
    v = [r["score"] for r in S.score_batch([{**IN_DIST, "distance": 3, "speed": x} for x in (0, 1.5, 3, 5)])]
    assert d == sorted(d) and d[-1] > d[0] + 20
    assert v == sorted(v) and v[-1] > v[0] + 10


def test_level_always_matches_score_band():
    S = safety()
    cuts = S.cuts
    for r in S.score_batch([{**DEMO, "distance": x, "speed": s} for x in np.linspace(0.6, 15, 12) for s in (0, 3, 7)]):
        assert r["level"] == S.levels[int(np.digitize(r["score"], cuts))]


def test_explanation_is_exact_and_ranked():
    r = safety().predict(DEMO)
    assert abs(sum(c["points"] for c in r["contributions"]) - (r["score"] - r["baseline_score"])) < 0.2
    assert r["contributions"][0]["key"] == "proximity"
    assert r["reasons"] and "1.7" in r["reasons"][0]["text"]


def test_batch_equals_single():
    S = safety()
    assert S.predict(DEMO, explain=False)["score"] == S.score_batch([DEMO])[0]["score"]


# ---------------------------------------------------------------- anomaly
@pytest.fixture(scope="module")
def eval_sessions():
    df = load_data()
    _, ev, _ = time_split(df)
    return df.iloc[ev]


def test_personalisation_beats_global():
    _, m = load_artifact("anomaly_model")
    e = m["metrics_eval"]
    assert e["personal_isolation_forest"]["pr_auc"] > e["global_isolation_forest"]["pr_auc"] + 0.1


def test_injected_idle_deviation_is_flagged(eval_sessions):
    A = anomaly()
    normal = eval_sessions[(eval_sessions.Operator_ID == "OP1007") & (eval_sessions.Operator_Anomaly == 0)].iloc[0].to_dict()
    assert A.analyze(normal)["status"] == "NORMAL"
    band = A.baseline("OP1007")["bands"]["idle_per_2h"]
    hours = normal["Actual_Task_Duration"] / 60
    injected = {**normal, "Idle_Time": (band["high"] + 20) / 2 * hours}      # +20 min / 2 h above the band
    r = A.analyze(injected)
    assert r["status"] == "UNUSUAL" and r["reason_code"] == "Excessive_Idle"


def test_same_idle_is_normal_for_a_habitual_idler(eval_sessions):
    """The core Digital-Twin property: identical behaviour, different verdict, because baselines differ."""
    A = anomaly()
    base = A.a["baselines"]
    hi_op = base["idle_per_2h_med"].idxmax(); lo_op = base["idle_per_2h_med"].idxmin()
    s = eval_sessions[(eval_sessions.Operator_ID == hi_op) & (eval_sessions.Operator_Anomaly == 0)].iloc[0].to_dict()
    r_hi = A.analyze(s)
    r_lo = A.analyze({**s, "Operator_ID": lo_op})
    assert r_hi["status"] == "NORMAL" and r_lo["status"] == "UNUSUAL"


def test_cold_start_uses_fleet_baseline(eval_sessions):
    s = eval_sessions.iloc[0].to_dict(); s["Operator_ID"] = "OP_NEW"
    assert anomaly().analyze(s)["baseline_source"].startswith("fleet")


# ---------------------------------------------------------------- task time
def test_task_interval_and_modes():
    df = load_data()
    row = df[df.Operator_ID == "OP1007"].iloc[0].to_dict()
    T = task_time()
    rem = T.predict({**row, "Current_Task_Progress": 0.5})
    tot = T.predict({**row, "Current_Task_Progress": 0})
    assert rem["kind"] == "remaining" and tot["kind"] == "total"
    for r in (rem, tot):
        assert r["low_min"] <= r["point_min"] <= r["high_min"]
    assert rem["point_min"] < tot["point_min"]
    with pytest.raises(ValueError):
        T.predict({"Target_Quantity": 500})


def test_task_quality_and_coverage():
    _, m = load_artifact("task_time_model")
    for k, v in m["models"].items():
        t = v["metrics_test"]
        assert t["mae"] < 0.6 * t["planner_rule_no_ml"]["mae"]
        assert 0.75 <= t["interval_coverage"] <= 0.85


def test_out_of_distribution_inputs_are_flagged():
    S = safety()
    assert S.predict(IN_DIST, explain=False)["warnings"] == []
    w = S.predict({**IN_DIST, "speed": 6.8}, explain=False)["warnings"]       # excavators never exceed ~5.5 km/h
    assert any("Machine_Speed" in x for x in w)
