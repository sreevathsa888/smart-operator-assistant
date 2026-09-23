"""Synthetic live telemetry + model-driven predictive safety.

The prototype has no real machine, so sensor values come from a deterministic SCRIPT:
  normal  – steady operation with small smooth variation
  event   – a worker approaches the rear-left blind zone while the machine reverses (keyframes below)
  stop    – operator pressed TAKE ACTION: machine stops, worker then walks away
  dismiss – alert dismissed: the machine keeps moving, the worker leaves slowly

What is NOT scripted: every risk value, level, explanation, the 5-second forecast and the moment the alert
fires. Those come from ml.inference.SafetyPredictor on each 0.5 s frame. The alert fires when the model's
CURRENT level is HIGH/CRITICAL, or its FORECAST is HIGH/CRITICAL while the current level is at least MEDIUM
(preventive intervention). Script values stay inside the training range (excavator ≤ 4.3 km/h).
"""
import json
import math
import threading
import time
from datetime import datetime, timedelta

import numpy as np

from backend import config
from backend import database as db

STEP = 0.5            # frame spacing (s)
HORIZON = 5.0         # forecast horizon (s)
MAX_EVENT_S = 60.0    # an unattended event ends after this long
LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

NORMAL = dict(dist=6.0, speed=2.6, slope=7.0, load=72.0, vis=88.0, dir="Forward", blind=0, angle=-126.0)
# t (s since trigger) → state. Worker walks from front-left round to the rear-left blind zone.
EVENT_KF = [
    (0.0, NORMAL),
    (3.0, dict(dist=4.5, speed=3.0, slope=8.0, load=74.0, vis=86.0, dir="Reverse", blind=0, angle=-170.0)),
    (6.0, dict(dist=3.0, speed=3.6, slope=10.0, load=80.0, vis=84.0, dir="Reverse", blind=1, angle=-205.0)),
    (9.0, dict(dist=2.0, speed=4.0, slope=11.0, load=85.0, vis=82.0, dir="Reverse", blind=1, angle=-220.0)),
    (11.0, dict(dist=1.7, speed=4.1, slope=11.0, load=85.0, vis=80.0, dir="Reverse", blind=1, angle=-222.5)),
]
NUMERIC = ["dist", "speed", "slope", "load", "vis", "angle"]


def _lerp(a, b, k):
    k = max(0.0, min(1.0, k))
    out = {n: a[n] + (b[n] - a[n]) * k for n in NUMERIC}
    out["dir"] = b["dir"] if k >= 0.5 else a["dir"]
    out["blind"] = b["blind"] if k >= 0.5 else a["blind"]
    return out


def _path(kfs, t):
    if t <= kfs[0][0]:
        return dict(kfs[0][1])
    for (t0, a), (t1, b) in zip(kfs, kfs[1:]):
        if t <= t1:
            return _lerp(a, b, (t - t0) / (t1 - t0))
    return dict(kfs[-1][1])


def _wiggle(t, seed=0.0):
    return math.sin(t / 7.0 + seed) * 0.5 + math.sin(t / 2.3 + 2 * seed) * 0.25


class MachineState:
    """Per-machine simulator state. Times are wall-clock seconds (time.time())."""

    def __init__(self, machine_id):
        self.machine_id = machine_id
        self.operator_id = config.DEMO_OPERATOR
        self.t0 = time.time()
        self.event_start = None
        self.action = None            # ("stop" | "dismiss", wall time)
        self.event_id = None
        self.frames = []              # model-scored frames of the current event
        self.alert_t = None           # seconds after trigger when the model first called for an alert
        self.ended_t = None
        self.fuel_start = 64.0
        self.lock = threading.Lock()

    # ------------------------------------------------------------------ script
    def scripted(self, t_rel):
        """Sensor state t_rel seconds after the trigger (None → normal operation)."""
        if t_rel is None:
            s = dict(NORMAL)
            w = _wiggle(time.time())
            s["speed"] = round(NORMAL["speed"] + 0.25 * w, 2)
            s["load"] = NORMAL["load"] + 3 * w
            return s
        base = _path(EVENT_KF, t_rel)
        if self.action is None:
            return base
        kind, at = self.action
        ta = at - self.event_start
        if t_rel < ta:
            return _path(EVENT_KF, t_rel)
        s0 = _path(EVENT_KF, ta)
        dt = t_rel - ta
        if kind == "stop":
            s = dict(s0)
            s["speed"] = max(0.0, s0["speed"] * (1 - dt / 1.5))
            if s["speed"] == 0:
                s["dir"] = "Stationary"
            if dt > 4.5:                                   # worker confirms and walks away
                k = min(1.0, (dt - 4.5) / 7.5)
                s["dist"] = s0["dist"] + (7.0 - s0["dist"]) * k
                s["angle"] = s0["angle"] + (NORMAL["angle"] - s0["angle"]) * k   # back out along the left side
                s["blind"] = 0 if s["dist"] > 4 else s0["blind"]
            return s
        # dismiss: nothing changes on the machine; the worker leaves slowly after a few seconds
        s = dict(s0)
        if dt > 4:
            k = min(1.0, (dt - 4) / 10.0)
            s["dist"] = s0["dist"] + (7.0 - s0["dist"]) * k
            s["blind"] = 0 if s["dist"] > 4 else s0["blind"]
        return s

    def event_over(self, t_rel):
        if self.action is None:
            return t_rel > MAX_EVENT_S
        kind, at = self.action
        dt = t_rel - (at - self.event_start)
        return dt > (13.0 if kind == "stop" else 15.0)


_STATES: dict[str, MachineState] = {}
_GLOBAL = threading.Lock()


def state_of(machine_id) -> MachineState:
    with _GLOBAL:
        if machine_id not in _STATES:
            _STATES[machine_id] = MachineState(machine_id)
        return _STATES[machine_id]


# ---------------------------------------------------------------------- model inputs
def _context(operator_id, machine_id):
    """Fields the script does not vary: operator profile, machine condition, site conditions."""
    from backend.services import twin
    op = db.one("SELECT * FROM operators WHERE operator_id=?", (operator_id,)) or {}
    m = db.one("SELECT * FROM machines WHERE machine_id=?", (machine_id,)) or {}
    sess = twin.current_session(operator_id)
    hrs = max(sess.get("Actual_Task_Duration", 60) / 60, 0.25)
    return {
        "Operator_Skill_Score": op.get("operator_skill_score", 65), "Training_Score": op.get("training_score", 70),
        "Previous_Safety_Events": op.get("previous_safety_events", 1), "Operating_Shift": op.get("operating_shift", "Morning"),
        "Machine_Type": m.get("machine_type", "Excavator"), "Machine_Health_Score": _machine_health(machine_id),
        "Control_Smoothness": sess.get("Control_Smoothness", 80),
        "Harsh_Rate_per_h": (sess.get("Harsh_Acceleration", 1) + sess.get("Harsh_Braking", 1)) / hrs,
        "Seatbelt_Status": "Fastened", "Weather": "Clear", "Lighting_Condition": "Daylight", "Dust_Level": 20.0,
        "Ground_Condition": "Dry", "Terrain_Type": "Gentle_Slope", "Obstacle_Type": "Worker",
    }


def _machine_health(machine_id):
    r = db.one("SELECT Machine_Health_Score h FROM telemetry WHERE Machine_ID=? ORDER BY Timestamp DESC LIMIT 1", (machine_id,))
    return float(r["h"]) if r else 85.0


def model_inputs(s):
    return {"speed": round(s["speed"], 2), "distance": round(s["dist"], 2), "slope": round(s["slope"], 1),
            "load": round(s["load"], 1), "visibility": round(s["vis"], 1), "Travel_Direction": s["dir"],
            "Blind_Zone_Entry": int(s["blind"])}


def forecast_state(s_now, s_prev):
    """Linear extrapolation of the last second of sensor change – no knowledge of the script's future."""
    f = dict(s_now)
    for k, lo, hi in (("dist", 0.5, 20), ("speed", 0, 4.3), ("slope", 0, 30), ("load", 0, 110), ("vis", 5, 100)):
        f[k] = float(np.clip(s_now[k] + (s_now[k] - s_prev[k]) * HORIZON, lo, hi))
    return f


def _alert_rule(level, pred_level):
    li, pi = LEVELS.index(level), LEVELS.index(pred_level)
    return li >= 2 or (pi >= 2 and li >= 1)


# ---------------------------------------------------------------------- event frames
def _extend_frames(ms: MachineState, until_rel, ctx):
    """Score frames at STEP spacing up to `until_rel` (batched). Frames are deterministic given the actions."""
    from ml.inference import safety
    S = safety()
    start = len(ms.frames) * STEP
    ts = np.arange(start, until_rel + 1e-9, STEP)
    if len(ts) == 0:
        return
    now = [ms.scripted(t) for t in ts]
    prev = [ms.scripted(max(0.0, t - 1.0)) for t in ts]
    fut = [forecast_state(a, b) for a, b in zip(now, prev)]
    sc = S.score_batch([model_inputs(s) for s in now + fut], context=ctx)
    n = len(ts)
    for i, t in enumerate(ts):
        s = now[i]
        r = math.radians(s["angle"]); rad = s["dist"] + 1.6
        fr = dict(t=round(float(t), 2), dist=round(s["dist"], 2), speed=round(s["speed"], 2), slope=round(s["slope"], 1),
                  load=round(s["load"], 1), vis=round(s["vis"], 1), dir=s["dir"], blind=int(s["blind"]),
                  wx=round(rad * math.cos(r), 2), wy=round(rad * math.sin(r), 2),
                  score=sc[i]["score"], level=sc[i]["level"], pred_score=sc[n + i]["score"], pred_level=sc[n + i]["level"])
        ms.frames.append(fr)
        if ms.alert_t is None and ms.action is None and _alert_rule(fr["level"], fr["pred_level"]):
            ms.alert_t = fr["t"]
            _open_event(ms, fr)


def _clock(ms, t_rel):
    return datetime.fromtimestamp(ms.event_start + t_rel).strftime("%H:%M:%S")


def _open_event(ms, fr):
    ms.event_id = "EVT-" + datetime.fromtimestamp(ms.event_start).strftime("%m%d-%H%M%S")
    db.execute("INSERT OR REPLACE INTO safety_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
        ms.event_id, ms.operator_id, ms.machine_id, datetime.fromtimestamp(ms.event_start).strftime("%Y-%m-%d %H:%M"),
        "live", fr["score"], fr["level"], "No_Incident", "Worker approached the rear-left blind zone while the machine reversed.",
        "open", None, json.dumps(ms.frames)))
    from backend.services import twin
    twin.add_proximity_violation(ms.operator_id)


def _finalize(ms):
    if ms.event_id:
        peak = max(ms.frames, key=lambda f: f["score"])
        kind, at = ms.action if ms.action else ("none", None)
        resp = round(at - ms.event_start - ms.alert_t, 1) if at and ms.alert_t is not None else None
        for f in ms.frames:
            f["clock"] = _clock(ms, f["t"])
        db.execute("UPDATE safety_events SET peak_score=?, peak_level=?, action=?, response_s=?, frames=? WHERE event_id=?",
                   (peak["score"], peak["level"], {"stop": "stopped", "dismiss": "dismissed", "none": "no_action"}[kind],
                    resp, json.dumps(ms.frames), ms.event_id))
        db.execute("INSERT INTO simulation_events (ts, operator_id, kind, payload) VALUES (?,?,?,?)",
                   (datetime.now().isoformat(timespec="seconds"), ms.operator_id, "live_event",
                    json.dumps(dict(event_id=ms.event_id, action=kind, response_s=resp, peak=peak["score"]))))
        from backend.services import twin
        twin.invalidate(ms.operator_id)
    ms.event_start = None; ms.action = None; ms.frames = []; ms.alert_t = None; ms.event_id = None


# ---------------------------------------------------------------------- public API
def control(machine_id, action, operator_id=None):
    ms = state_of(machine_id)
    with ms.lock:
        if operator_id:
            ms.operator_id = operator_id
        now = time.time()
        if action == "start":
            if ms.event_start is not None:
                return {"ok": False, "reason": "event already running"}
            ms.event_start = now; ms.action = None; ms.frames = []; ms.alert_t = None; ms.event_id = None
        elif action in ("stop", "dismiss"):
            if ms.event_start is None or ms.action is not None:
                return {"ok": False, "reason": "no active event"}
            ctx = _context(ms.operator_id, machine_id)
            _extend_frames(ms, now - ms.event_start, ctx)        # freeze history up to the action
            ms.action = (action, now)
        else:
            raise ValueError(action)
    return {"ok": True, "action": action}


def snapshot(machine_id, operator_id=None, with_history=False):
    from ml.inference import safety
    ms = state_of(machine_id)
    with ms.lock:
        if operator_id and ms.event_start is None:
            ms.operator_id = operator_id
        ctx = _context(ms.operator_id, machine_id)
        now = time.time()
        t_rel = None if ms.event_start is None else now - ms.event_start
        if t_rel is not None:
            _extend_frames(ms, t_rel, ctx)
            if ms.event_over(t_rel):
                _finalize(ms)
                t_rel = None
        s = ms.scripted(t_rel)
        s_prev = ms.scripted(None if t_rel is None else max(0.0, t_rel - 1.0))
        risk = safety().predict(model_inputs(s), context=ctx)
        pred = safety().predict(model_inputs(forecast_state(s, s_prev)), context=ctx, explain=False)
        phase = _phase(ms, t_rel, risk["level"])
        closing = (s_prev["dist"] - s["dist"])            # m per second
        eta_restricted = round((s["dist"] - 3.0) / closing, 1) if closing > 0.05 and s["dist"] > 3 else None
        r = math.radians(s["angle"]); rad = s["dist"] + 1.6
        out = dict(
            machine_id=machine_id, operator_id=ms.operator_id, server_time=datetime.now().isoformat(timespec="seconds"),
            phase=phase, event_id=ms.event_id, event_elapsed_s=None if t_rel is None else round(t_rel, 1),
            state=dict(speed=round(s["speed"], 2), distance=round(s["dist"], 2), load=round(s["load"]), slope=round(s["slope"], 1),
                       visibility=round(s["vis"]), direction=s["dir"], blind_zone=int(s["blind"]), obstacle="Worker",
                       seatbelt="Fastened", worker=dict(x=round(rad * math.cos(r), 2), y=round(rad * math.sin(r), 2))),
            risk=risk,
            predicted=dict(horizon_s=HORIZON, score=pred["score"], level=pred["level"]),
            eta_restricted_s=eta_restricted,
            alert=_alert_payload(phase, risk),
            telemetry=machine_telemetry(ms, s, ctx),
        )
        if with_history:
            out["history"] = _history(ms, ctx)
        return out


def _phase(ms, t_rel, level):
    if t_rel is None:
        return "normal"
    if ms.action is not None:
        kind, _ = ms.action
        if kind == "dismiss":
            return "dismissed"
        return "resolving" if LEVELS.index(level) >= 2 else "resolved"
    return "alert" if ms.alert_t is not None else "approach"


RECOMMEND = {  # PROJECT guidance keyed by the model's top contributing factor (not official CAT procedure)
    "proximity": "rec.proximity", "speed": "rec.speed", "terrain": "rec.terrain", "load": "rec.load",
    "visibility": "rec.visibility", "machine": "rec.machine", "control": "rec.control",
}


def _alert_payload(phase, risk):
    top = risk["contributions"][0]["key"] if risk.get("contributions") else "proximity"
    return dict(active=phase == "alert", title_key=f"alert.title.{top}", recommendation_key=RECOMMEND.get(top, "rec.proximity"),
                top_factor=top, reasons=risk.get("reasons", []))


# ---------------------------------------------------------------------- machine telemetry
def machine_telemetry(ms, s, ctx, t_wall=None):
    """Engine/hydraulic/fuel values from the same physical relations used by the data generator."""
    t = time.time() if t_wall is None else t_wall
    m = db.one("SELECT * FROM machines WHERE machine_id=?", (ms.machine_id,)) or {}
    cls_fuel = {"Medium Excavator (20t class)": 15.0, "Large Excavator (30t class)": 21.0,
                "Medium Wheel Loader": 14.0, "Large Wheel Loader": 22.0}.get(m.get("machine_model_class"), 15.0)
    el = float(np.clip(30 + 38 * s["load"] / 100 + 0.9 * s["slope"] + 6 + 2 * _wiggle(t, 1.3), 10, 100))
    health = ctx["Machine_Health_Score"]
    amb = 31.0
    eng = 80 + 0.14 * (el - 60) + 0.30 * (amb - 30) + 0.12 * (85 - health) + 0.8 * _wiggle(t, 0.4)
    hyd = 58 + 0.28 * (el - 60) + 0.45 * (amb - 30) + 0.15 * (85 - health) + 1.0 * _wiggle(t, 2.1)
    rate = cls_fuel * (0.45 + 0.9 * el / 100)
    tank = m.get("tank_litres", 410)
    fuel = max(5.0, ms.fuel_start - (t - ms.t0) / 3600 * rate / tank * 100)
    hours_to_20 = max(0.0, (fuel - 20) / 100 * tank / rate)
    status = "caution" if eng > 100 or hyd > 90 or health < 60 else "normal"   # PROJECT thresholds
    from backend.services import twin
    sess = twin.current_session(ms.operator_id)
    return dict(engineTemp=round(eng, 1), hydraulicTemp=round(hyd, 1), fuel=round(fuel, 1), load=round(s["load"]),
                speed=round(s["speed"], 1), idleMin=round(sess.get("Idle_Time", 0)), rpm=int(1500 + 4 * el + 20 * _wiggle(t, 0.9)),
                fuelRate=round(rate, 1), engineLoad=round(el), engineHours=round(m.get("engine_hours", 0) + (t - ms.t0) / 3600, 1),
                health=round(health, 1), status=status,
                fuelProjection=dict(hours_to_20pct=round(hours_to_20, 2),
                                    at=(datetime.fromtimestamp(t) + timedelta(hours=hours_to_20)).strftime("%H:%M"),
                                    method="linear projection at current burn rate", tank_litres=tank))


def _history(ms, ctx, n=60):
    now = time.time()
    t_rel_now = None if ms.event_start is None else now - ms.event_start
    out = {"engineTemp": [], "hydraulicTemp": [], "fuelRate": [], "load": []}
    for k in range(n - 1, -1, -1):
        tr = None if t_rel_now is None or t_rel_now - k < 0 else t_rel_now - k
        tm = machine_telemetry(ms, ms.scripted(tr), ctx, t_wall=now - k)
        for key in out:
            out[key].append(tm[key])
    return out


# ---------------------------------------------------------------------- seeding a recorded event
def record_historical_demo_event(operator_id, machine_id, days_ago=6):
    """Run the SAME simulator offline (operator stops 3 s after the alert) and store the result as a past event."""
    ms = MachineState(machine_id)
    ms.operator_id = operator_id
    day = datetime.now().replace(hour=14, minute=32, second=5, microsecond=0) - timedelta(days=days_ago)
    ms.event_start = day.timestamp()
    ctx = _context(operator_id, machine_id)
    t = 0.0
    while ms.alert_t is None and t < 30:
        t += STEP
        _extend_frames(ms, t, ctx)
    if ms.alert_t is None:
        return None
    ms.action = ("stop", ms.event_start + ms.alert_t + 3.0)
    end = ms.alert_t + 3.0 + 13.0
    _extend_frames(ms, end, ctx)
    eid = "EVT-" + day.strftime("%m%d-%H%M%S")
    ms.event_id = eid
    db.execute("INSERT OR REPLACE INTO safety_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
        eid, operator_id, machine_id, day.strftime("%Y-%m-%d %H:%M"), "recorded", 0, "LOW", "No_Incident",
        "Worker approached the rear-left blind zone while the machine reversed on a slope.", "open", None, "[]"))
    _finalize(ms)
    return eid
