"""Performance analytics for one operator – computed from recorded sessions and model outputs."""
from datetime import timedelta

import numpy as np
import pandas as pd

from backend.services import twin


def compute(operator_id):
    from ml.inference import anomaly, task_time
    f = twin.fleet()
    s = twin.operator_sessions(operator_id)
    end = twin.last_day()
    d30 = s[s["ts"] > end - timedelta(days=30)]
    f30 = f[f["ts"] > end - timedelta(days=30)]
    day = lambda x: x["ts"].dt.normalize()  # noqa: E731
    fleet_daily = f30.groupby(day(f30))["safety_raw"].mean()
    op_daily = d30.groupby(day(d30))["safety_raw"].mean()
    days = pd.date_range(end - timedelta(days=29), end)
    safety = [dict(d=i + 1, date=x.strftime("%d %b"), score=_n(op_daily.get(x)), fleet=_n(fleet_daily.get(x))) for i, x in enumerate(days)]
    fuel_daily = d30.groupby(day(d30))["Fuel_Consumption"].mean()
    fuel = [dict(d=i + 1, date=x.strftime("%d %b"), lph=_n(fuel_daily.get(x), 1)) for i, x in enumerate(days)]

    A = anomaly()
    base_idle = float(A.a["baselines"]["idle_per_2h_med"].get(operator_id, np.nan))
    d56 = s[s["ts"] > end - timedelta(days=56)]
    wk = d56.groupby(d56["ts"].dt.dayofweek)["idle_per_2h"].median()
    idle = [dict(d=n, idle=_n(wk.get(i), 1), baseline=round(base_idle, 1)) for i, n in enumerate(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) if i in wk.index]

    d28 = s[s["ts"] > end - timedelta(days=28)].copy()
    cols = [c for c in d28.columns if c[0].isupper()]
    preds = task_time().predict([{**r[cols].to_dict(), "Current_Task_Progress": 0.0} for _, r in d28.iterrows()]) if len(d28) else []
    d28["ontime"] = [a <= p["high_min"] for a, p in zip(d28["Actual_Task_Duration"], preds)]
    d28["week"] = ((end - d28["ts"]).dt.days // 7).clip(0, 3)
    tc = [dict(w=f"W{4 - w}", ontime=int(d28[d28["week"] == w]["ontime"].sum()), late=int((~d28[d28["week"] == w]["ontime"]).sum()))
          for w in (3, 2, 1, 0)]

    tw = twin.compute(operator_id)
    fleet_scores = twin.fleet_operator_scores()
    radar = [dict(k=k.title(), you=tw["scores"][k], fleet=fleet_scores[k]) for k in ("safety", "efficiency", "control", "awareness", "fuel")]

    d90 = s[s["ts"] > end - timedelta(days=90)]
    hours = sorted(d90["ts"].dt.hour.unique())
    zones = sorted(d90["Working_Zone"].unique())
    hi = d90[d90["pred_level"].isin(["HIGH", "CRITICAL"])]
    heat = dict(rows=zones, cols=[f"{h:02d}" for h in hours],
                v=[[int(((hi["Working_Zone"] == z) & (hi["ts"].dt.hour == h)).sum()) for h in hours] for z in zones],
                metric="sessions with model-predicted HIGH/CRITICAL risk, last 90 days")

    recent = s.tail(25)
    res = A.analyze([r[cols].to_dict() for _, r in recent.iterrows()]) if len(recent) else []
    anomalies = []
    cur = tw["current"]
    if cur["status"] == "UNUSUAL":
        anomalies.append(_anom("Current shift", cur))
    cur_id = twin.current_session(operator_id).get("Record_ID")
    for (_, r), a in zip(recent.iloc[::-1].iterrows(), res[::-1]):
        if a["status"] == "UNUSUAL" and r["Record_ID"] != cur_id:
            anomalies.append(_anom(r["ts"].strftime("%d %b %H:%M"), a))
    return dict(operator_id=operator_id, safety=safety, fuel=fuel, idle=idle, taskCompletion=tc, radar=radar, heat=heat,
                anomalies=anomalies[:6], period_end=end.strftime("%d %b %Y"),
                notes=dict(safety="100 − mean model-predicted risk per day", taskCompletion="on time = actual ≤ upper bound of the model's 80 % range"))


def _anom(when, a):
    top = a["deviations"][0]
    return dict(when=when, what=f"{top['label']} {top['current']} {top['unit']}", vs=f"baseline {top['typical_low']}–{top['typical_high']}",
                sev="high" if top["z"] >= 6 else "elevated", reason_code=a["reason_code"])


def _n(v, d=0):
    return None if v is None or pd.isna(v) else round(float(v), d) if d else int(round(float(v)))
