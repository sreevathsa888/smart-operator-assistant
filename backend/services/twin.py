"""Operator Digital Twin.

PROJECT-DEFINED scores (0–100, higher = better), computed from the operator's own sessions in the last
14 recorded days, compared with the 14 days before:

  safety      100 − mean model-predicted risk of the sessions
  efficiency  fleet percentile of  pace × (1 − idle share)      pace = planner estimate ÷ actual duration
  control     fleet percentile of  smoothness − 5 × harsh events per hour
  awareness   fleet percentile of  −(proximity violations per hour + 0.5 × blind-zone entry)
  fuel        fleet percentile of  fuel efficiency (t/L) within the same machine class

Percentile scores read as "better than N % of all recorded sessions". Behaviour status, baseline bands and
reasons come from the personalised anomaly model (ml.inference.AnomalyDetector).
"""
import json
import threading
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from backend import config
from backend import database as db

WINDOW_DAYS = 14
_fleet = None
_fleet_lock = threading.Lock()
_cache: dict = {}


# ---------------------------------------------------------------------- fleet-wide session metrics
def fleet() -> pd.DataFrame:
    global _fleet
    with _fleet_lock:
        if _fleet is None:
            df = pd.read_sql("SELECT * FROM telemetry", db.connect())
            df["ts"] = pd.to_datetime(df["Timestamp"])
            h = df["Actual_Task_Duration"] / 60
            df["idle_per_2h"] = df["Idle_Time"] / h * 2
            df["harsh_per_h"] = (df["Harsh_Acceleration"] + df["Harsh_Braking"]) / h
            df["viol_per_h"] = df["Proximity_Violations"] / h
            df["safety_raw"] = 100 - df["pred_risk"]
            df["eff_raw"] = (df["Estimated_Task_Duration"] / df["Actual_Task_Duration"]) * (1 - df["Idle_Time"] / df["Actual_Task_Duration"])
            df["control_raw"] = df["Control_Smoothness"] - 5 * df["harsh_per_h"]
            df["aware_raw"] = -(df["viol_per_h"] + 0.5 * df["Blind_Zone_Entry"])
            df["eff_pct"] = df["eff_raw"].rank(pct=True)
            df["control_pct"] = df["control_raw"].rank(pct=True)
            df["aware_pct"] = df["aware_raw"].rank(pct=True)
            df["fuel_pct"] = df.groupby("Machine_Model_Class")["Fuel_Efficiency"].rank(pct=True)
            _fleet = df
        return _fleet


def last_day():
    return fleet()["ts"].max().normalize()


def _scores(s: pd.DataFrame):
    if len(s) == 0:
        return None
    return dict(safety=int(round(s["safety_raw"].mean())), efficiency=int(round(100 * s["eff_pct"].mean())),
                control=int(round(100 * s["control_pct"].mean())), awareness=int(round(100 * s["aware_pct"].mean())),
                fuel=int(round(100 * s["fuel_pct"].mean())))


def operator_sessions(operator_id) -> pd.DataFrame:
    f = fleet()
    return f[f["Operator_ID"] == operator_id].sort_values("ts")


def window_scores(operator_id, offset_days=0):
    s = operator_sessions(operator_id)
    end = last_day() + timedelta(days=1) - timedelta(days=offset_days)
    w = s[(s["ts"] >= end - timedelta(days=WINDOW_DAYS)) & (s["ts"] < end)]
    return _scores(w), len(w)


def fleet_operator_scores():
    """Median of every operator's current-window scores (for analytics comparison)."""
    f = fleet()
    end = last_day() + timedelta(days=1)
    w = f[f["ts"] >= end - timedelta(days=WINDOW_DAYS)]
    per = w.groupby("Operator_ID").apply(lambda g: pd.Series(_scores(g)), include_groups=False)
    return {k: int(round(per[k].median())) for k in per.columns}


# ---------------------------------------------------------------------- current shift session
def current_session(operator_id) -> dict:
    r = db.one("SELECT session FROM shift_sessions WHERE operator_id=?", (operator_id,))
    if r:
        return json.loads(r["session"])
    s = _pick_current_session(operator_id)
    db.execute("INSERT OR REPLACE INTO shift_sessions VALUES (?,?,?)",
               (operator_id, datetime.now().isoformat(timespec="seconds"), json.dumps(s)))
    return s


def _pick_current_session(operator_id):
    """'Today's session so far' for the prototype = the operator's most recent recorded session.
    For the DEMO operator we take the most recent session the anomaly model flags for idling, so the demo can
    show a personal-baseline deviation (documented choice; the verdict itself still comes from the model)."""
    from ml.inference import anomaly
    s = operator_sessions(operator_id)
    if len(s) == 0:
        raise KeyError(operator_id)
    cols = [c for c in s.columns if c[0].isupper()]
    pick = s.iloc[-1]
    if operator_id == config.DEMO_OPERATOR:
        recent = s.tail(40)
        res = anomaly().analyze([r[cols].to_dict() for _, r in recent.iterrows()])
        idle = [i for i, r in enumerate(res) if r["reason_code"] == "Excessive_Idle"]
        if idle:
            pick = recent.iloc[idle[-1]]
    out = {k: (v.item() if hasattr(v, "item") else v) for k, v in pick[cols].to_dict().items()}
    out["Operator_ID"] = operator_id
    return out


def add_proximity_violation(operator_id):
    s = current_session(operator_id)
    s["Proximity_Violations"] = int(s.get("Proximity_Violations", 0)) + 1
    db.execute("UPDATE shift_sessions SET session=? WHERE operator_id=?", (json.dumps(s), operator_id))
    invalidate(operator_id)


def invalidate(operator_id):
    _cache.pop(operator_id, None)


# ---------------------------------------------------------------------- twin
def compute(operator_id) -> dict:
    if operator_id in _cache:
        return _cache[operator_id]
    from ml.inference import anomaly
    op = db.one("SELECT * FROM operators WHERE operator_id=?", (operator_id,))
    if not op:
        raise KeyError(operator_id)
    now_s, n_now = window_scores(operator_id)
    prev_s, _ = window_scores(operator_id, offset_days=WINDOW_DAYS)
    sess = current_session(operator_id)
    A = anomaly()
    cur = A.analyze(sess)
    base = A.baseline(operator_id)
    sessions = operator_sessions(operator_id)

    bands = []
    for d in cur["deviations"]:
        lo, hi, c = d["typical_low"], d["typical_high"], d["current"]
        top = max(hi, c) * 1.35 if max(hi, c) > 0 else 1
        bands.append(dict(key=d["metric"], label=d["label"], unit=d["unit"], min=_r(lo), max=_r(hi), current=_r(c),
                          domain=[0, _r(top)], z=d["z"], outside=bool(c < lo or c > hi)))

    hist = _daily_history(sessions)
    slope = np.polyfit(np.arange(len(hist)), [h["safety"] for h in hist], 1)[0] if len(hist) >= 5 else 0.0
    trend = "improving" if slope > 0.3 else "declining" if slope < -0.3 else "stable"
    last30 = sessions[sessions["ts"] > last_day() - timedelta(days=30)]
    events_30 = db.one("SELECT COUNT(*) n FROM safety_events WHERE operator_id=? AND ts>=?",
                       (operator_id, (last_day() - timedelta(days=30)).strftime("%Y-%m-%d")))["n"]
    done = db.rows("SELECT module_id, score, completed_at FROM training_progress WHERE operator_id=? AND status='completed' "
                   "ORDER BY completed_at DESC LIMIT 3", (operator_id,))
    out = dict(
        operator_id=operator_id,
        scores=now_s, lastPeriod=prev_s or now_s, period_days=WINDOW_DAYS, sessions_in_window=n_now,
        behavior="unusual" if cur["status"] == "UNUSUAL" else "normal",
        baseline=_baseline_stability(operator_id, last30), trend=trend, trend_slope_per_day=round(float(slope), 2),
        current=cur, baselineBands=bands, baseline_source=base["source"], sessions_in_baseline=base["n_sessions"],
        hours_modelled=int(sessions["Actual_Task_Duration"].sum() / 60),
        history=hist, insights=_insights(sessions, cur),
        training=dict(score=round(op["training_score"], 1), recent=done),
        recent_incidents_30d=events_30,
        definitions={"scores": "project-defined; see backend/services/twin.py", "window": f"last {WINDOW_DAYS} recorded days"},
    )
    _cache[operator_id] = out
    return out


def _r(x):
    return round(float(x), 2 if abs(x) < 10 else 1)


def _daily_history(s):
    end = last_day()
    days = [end - timedelta(days=i) for i in range(WINDOW_DAYS - 1, -1, -1)]
    base = float((100 - s[s["ts"] > end - timedelta(days=60)]["pred_risk"]).mean())
    out = []
    for i, d in enumerate(days):
        g = s[s["ts"].dt.normalize() == d]
        out.append(dict(day=f"D-{WINDOW_DAYS - 1 - i}", date=d.strftime("%d %b"),
                        safety=int(round(g["safety_raw"].mean())) if len(g) else None,
                        efficiency=int(round(100 * g["eff_pct"].mean())) if len(g) else None, baseline=round(base)))
    # carry the last value across days without sessions so the chart line is continuous
    for k in ("safety", "efficiency"):
        last = next((h[k] for h in out if h[k] is not None), None)
        for h in out:
            h[k] = last if h[k] is None else h[k]; last = h[k]
    return out


def _baseline_stability(operator_id, recent):
    from ml.inference import anomaly
    A = anomaly()
    if operator_id not in A.a["baselines"].index or len(recent) < 8:
        return "insufficient data"
    b = A.a["baselines"].loc[operator_id]
    idle = (recent["idle_per_2h"].median() - b["idle_per_2h_med"]) / max(b["idle_per_2h_sd"], A.a["floors"]["idle_per_2h"])
    ctrl = ((100 - recent["Control_Smoothness"]).median() - b["control_deficit_med"]) / max(b["control_deficit_sd"], A.a["floors"]["control_deficit"])
    return "stable" if max(abs(idle), abs(ctrl)) < 1.5 else "shifting"


def _insights(s, cur):
    """Patterns found in the operator's own recent sessions (data-derived, max 3)."""
    end = last_day()
    r60 = s[s["ts"] > end - timedelta(days=60)]
    out = []
    by_task = r60.groupby("Task_Type")["idle_per_2h"].median()
    if len(by_task) >= 2:
        t = by_task.idxmax(); others = r60[r60["Task_Type"] != t]["idle_per_2h"].median()
        d = (by_task[t] / others - 1) * 100 if others > 0 else 0
        if d > 12:
            out.append((d, dict(text=f"Idle time is {d:.0f}% higher on {t.replace('_', ' ').lower()} tasks than on your other work.",
                                module="idle", level="elevated")))
    mv = r60[r60["Machine_Speed"] > 0.8]
    rev, fwd = mv[mv["Travel_Direction"] == "Reverse"]["Machine_Speed"].median(), mv[mv["Travel_Direction"] == "Forward"]["Machine_Speed"].median()
    if pd.notna(rev) and pd.notna(fwd) and fwd > 0:
        d = (rev / fwd - 1) * 100
        if d > 5:
            out.append((d, dict(text=f"Your reversing speed is {d:.0f}% above your forward speed — reversing is where blind zones are largest.",
                                module="blind", level="elevated")))
    a = s[s["ts"] > end - timedelta(days=30)]["Control_Smoothness"].median()
    b = s[(s["ts"] <= end - timedelta(days=30)) & (s["ts"] > end - timedelta(days=90))]["Control_Smoothness"].median()
    if pd.notna(a) and pd.notna(b) and b > 0:
        d = (a / b - 1) * 100
        if abs(d) >= 2:
            out.append((abs(d), dict(text=f"Control smoothness is {abs(d):.0f}% {'better' if d > 0 else 'worse'} than 1–3 months ago.",
                                     module=None if d > 0 else "harsh", level="safe" if d > 0 else "elevated")))
    if cur["status"] == "UNUSUAL":
        out.append((999, dict(text=cur["reason"] + ".", module={"Excessive_Idle": "idle", "Repeated_Proximity_Violations": "blind",
                                                                "Abnormal_Fuel": "eco"}.get(cur["reason_code"], "harsh"), level="elevated")))
    return [x for _, x in sorted(out, key=lambda z: -z[0])][:3]
