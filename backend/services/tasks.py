"""Today's tasks with model-predicted completion times.

Pending tasks → task-time model 'total'; the in-progress task → model 'remaining' at its current progress.
Task features come from the plan (quantity, complexity), site conditions, the machine, and the operator's own
history (e.g. Historical_Task_Duration = this operator's median minutes-per-tonne for the task type × quantity).
Drivers are one-at-a-time counterfactuals through the same model: reset one factor group to fleet-typical values
and report how many minutes the prediction changes.
"""
from datetime import date, datetime, timedelta

import numpy as np

from backend import config
from backend import database as db
from data_generator import config as G

PLANS = {  # (task type, zone, target t, complexity, initial status) – a synthetic day plan per machine type
    "Excavator": [("Excavation", "Zone A", 420, 3, "completed"), ("Loading", "Zone D", 520, 2, "completed"),
                  ("Excavation", "Zone B", 610, 3, "pending"), ("Backfilling", "Zone C", 380, 2, "pending")],
    "Wheel Loader": [("Loading", "Zone B", 700, 2, "completed"), ("Material_Transfer", "Zone D", 820, 2, "completed"),
                     ("Stockpiling", "Zone D", 640, 3, "pending"), ("Loading", "Zone B", 560, 2, "pending")],
}
SHIFT_START = {"Morning": 6, "Afternoon": 14, "Night": 22}
TYPICAL = dict(Weather="Clear", Ground_Condition="Dry", Visibility=90.0, Ambient_Temperature=31.0)


def today():
    return date.today().isoformat()


def ensure_plan(operator_id):
    if db.one("SELECT 1 FROM tasks WHERE operator_id=? AND day=?", (operator_id, today())):
        return
    op = db.one("SELECT * FROM operators WHERE operator_id=?", (operator_id,))
    m = db.one("SELECT * FROM machines WHERE machine_id=?", (op["primary_machine_id"],))
    h0 = SHIFT_START.get(op["operating_shift"], 6)
    starts = [(h0, 10), (h0 + 1, 55), (h0 + 3, 10), (h0 + 6, 40)]
    for i, (tt, zone, qty, cplx, status) in enumerate(PLANS[m["machine_type"]]):
        tid = f"{operator_id}-{today()}-T{i + 1:02d}"
        start = f"{starts[i][0] % 24:02d}:{starts[i][1]:02d}"
        actual = None
        if status == "completed":
            actual = round(_planner(qty, m["machine_model_class"], tt) * _operator_ratio(operator_id, tt, "Actual_Task_Duration", "Estimated_Task_Duration"), 1)
        db.execute("INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                   (tid, operator_id, m["machine_id"], today(), i + 1, tt, zone, status, qty, cplx, start, None, None, actual,
                    1.0 if status == "completed" else 0.0))


def _planner(qty, cls, task_type):
    c = G.MACHINE_CLASSES[cls]
    return qty / (c["payload_t"] * 0.75) * c["cycle_s"] * G.TASK_CYCLE_FACTOR[task_type] / 60 * 1.20


def _operator_ratio(operator_id, task_type, num, den):
    from backend.services.twin import operator_sessions, fleet
    s = operator_sessions(operator_id)
    s = s[s["Task_Type"] == task_type]
    if len(s) < 5:
        s = fleet()[fleet()["Task_Type"] == task_type]
    return float((s[num] / s[den]).median())


def _zone_conditions(zone):
    from backend.services.twin import fleet
    z = fleet()[fleet()["Working_Zone"] == zone]
    return float(z["Ground_Slope"].median()), str(z["Terrain_Type"].mode().iloc[0])


def features(task, progress=None):
    op = db.one("SELECT * FROM operators WHERE operator_id=?", (task["operator_id"],))
    m = db.one("SELECT * FROM machines WHERE machine_id=?", (task["machine_id"],))
    from backend.services.telemetry import _machine_health
    slope, terrain = _zone_conditions(task["zone"])
    planner = _planner(task["target_quantity"], m["machine_model_class"], task["task_type"])
    hist = _operator_ratio(task["operator_id"], task["task_type"], "Actual_Task_Duration", "Target_Quantity") * task["target_quantity"]
    return dict(
        Target_Quantity=task["target_quantity"], Task_Complexity=task["task_complexity"],
        Estimated_Task_Duration=round(planner, 1), Historical_Task_Duration=round(hist, 1),
        Ground_Slope=slope, Terrain_Type=terrain, Load_Percentage=74.0, Machine_Health_Score=_machine_health(task["machine_id"]),
        Operator_Skill_Score=op["operator_skill_score"], Historical_Efficiency=op["historical_efficiency"],
        Historical_Idle_Time=op["historical_idle_time"], Experience_Level=op["experience_level"],
        Task_Type=task["task_type"], Machine_Model_Class=m["machine_model_class"], Working_Zone=task["zone"],
        Operating_Mode="Standard", Current_Task_Progress=progress or 0.0, **TYPICAL)


def _progress(task, total_pred):
    if task["status"] == "completed":
        return 1.0, task["actual_min"]
    if task["status"] != "in_progress" or not task["started_at"]:
        return 0.0, None
    elapsed_min = (datetime.now() - datetime.fromisoformat(task["started_at"])).total_seconds() / 60 * config.DEMO_TIME_SCALE
    return min(0.97, max(0.01, elapsed_min / total_pred)), round(elapsed_min, 1)


def _risk_for(task):
    from backend.services.twin import fleet
    f = fleet()
    z = f[(f["Working_Zone"] == task["zone"]) & (f["Task_Type"] == task["task_type"])]
    from ml.inference import safety
    return str(safety().level_of([float(z["pred_risk"].median())])[0]).lower() if len(z) else "low"


def list_tasks(operator_id):
    from ml.inference import task_time
    ensure_plan(operator_id)
    T = task_time()
    tasks = db.rows("SELECT * FROM tasks WHERE operator_id=? AND day=? ORDER BY seq", (operator_id, today()))
    out, cursor = [], None
    for t in tasks:
        total = T.predict(features(t, 0.0))
        prog, so_far = _progress(t, total["point_min"])
        item = dict(id=t["task_id"], seq=t["seq"], name=t["task_type"].replace("_", " "), task_type=t["task_type"], zone=t["zone"],
                    machine=t["machine_id"], status=t["status"], progress=int(round(prog * 100)), start=t["planned_start"],
                    estMin=round(total["point_min"]), estRange=[round(total["low_min"]), round(total["high_min"])],
                    actualMin=so_far, risk=_risk_for(t), target_t=t["target_quantity"])
        if t["status"] == "in_progress":
            rem = T.predict(features(t, prog))
            item["eta"] = dict(kind="remaining", pointMin=round(rem["point_min"]), lowMin=round(rem["low_min"]),
                               highMin=round(rem["high_min"]), display=rem["display"], range_display=rem["range_display"], coverage=0.8)
        elif t["status"] == "pending":
            item["eta"] = dict(kind="total", pointMin=round(total["point_min"]), lowMin=round(total["low_min"]),
                               highMin=round(total["high_min"]), display=total["display"], range_display=total["range_display"], coverage=0.8)
        out.append(item)
    _chain(out)
    return out


def _chain(items):
    """Predicted start/end clock times (Gantt): completed = recorded, current = now + remaining, pending = chained."""
    now = datetime.now()
    def at(hhmm):
        h, m = map(int, hhmm.split(":")); return now.replace(hour=h, minute=m, second=0, microsecond=0)
    prev_end = None
    for it in items:
        start = at(it["start"])
        if it["status"] == "completed":
            end = start + timedelta(minutes=it["actualMin"])
        elif it["status"] == "in_progress":
            end = start + timedelta(minutes=(it["actualMin"] or 0) + it["eta"]["pointMin"])   # elapsed (task clock) + remaining
        else:
            start = max(start, prev_end) if prev_end else start
            end = start + timedelta(minutes=it["eta"]["pointMin"])
        it["gantt"] = dict(start=start.strftime("%H:%M"), end=end.strftime("%H:%M"))
        prev_end = end


def current_task(items):
    return next((t for t in items if t["status"] == "in_progress"), None) or next((t for t in items if t["status"] == "pending"), None)


def start_task(task_id):
    t = db.one("SELECT * FROM tasks WHERE task_id=?", (task_id,))
    if not t:
        raise KeyError(task_id)
    if db.one("SELECT 1 FROM tasks WHERE operator_id=? AND day=? AND status='in_progress'", (t["operator_id"], t["day"])):
        raise ValueError("another task is already in progress")
    if t["status"] != "pending":
        raise ValueError(f"task is {t['status']}")
    db.execute("UPDATE tasks SET status='in_progress', started_at=? WHERE task_id=?", (datetime.now().isoformat(timespec="seconds"), task_id))


def complete_task(task_id):
    from ml.inference import task_time
    t = db.one("SELECT * FROM tasks WHERE task_id=?", (task_id,))
    if not t or t["status"] != "in_progress":
        raise ValueError("only an in-progress task can be completed")
    total = task_time().predict(features(t, 0.0))["point_min"]
    _, so_far = _progress(t, total)
    db.execute("UPDATE tasks SET status='completed', completed_at=?, actual_min=?, progress=1 WHERE task_id=?",
               (datetime.now().isoformat(timespec="seconds"), so_far, task_id))


def drivers(task_item):
    """How much each factor group moves the ETA versus fleet-typical values (same model, one group at a time)."""
    from ml.inference import task_time
    from backend.services.twin import fleet
    t = db.one("SELECT * FROM tasks WHERE task_id=?", (task_item["id"],))
    prog = task_item["progress"] / 100 if task_item["status"] == "in_progress" else 0.0
    base = features(t, prog)
    f = fleet()
    ops = db.rows("SELECT operator_skill_score s, historical_efficiency e, historical_idle_time i FROM operators")
    typical_op = dict(Operator_Skill_Score=float(np.median([o["s"] for o in ops])), Historical_Efficiency=float(np.median([o["e"] for o in ops])),
                      Historical_Idle_Time=float(np.median([o["i"] for o in ops])),
                      Historical_Task_Duration=float((f[f["Task_Type"] == t["task_type"]]["Actual_Task_Duration"] /
                                                      f[f["Task_Type"] == t["task_type"]]["Target_Quantity"]).median() * t["target_quantity"]),
                      Experience_Level="Intermediate")
    groups = {
        "Site conditions": (dict(Ground_Slope=3.0, Terrain_Type="Flat", Weather="Clear", Ground_Condition="Dry", Visibility=90.0),
                            f"{base['Terrain_Type'].replace('_', ' ').lower()}, {base['Ground_Slope']:.0f}° slope"),
        "Your pace": (typical_op, f"skill {base['Operator_Skill_Score']:.0f}, typical idle {base['Historical_Idle_Time']:.0f} min"),
        "Machine condition": (dict(Machine_Health_Score=90.0), f"health {base['Machine_Health_Score']:.0f}/100"),
        "Task difficulty": (dict(Task_Complexity=2), f"complexity {base['Task_Complexity']}/5"),
    }
    T = task_time()
    now = T.predict(base)["point_min"]
    out = []
    for name, (repl, desc) in groups.items():
        alt = T.predict({**base, **repl})["point_min"]
        out.append(dict(key=name, value=desc, delta_min=round(now - alt, 1)))
    out.sort(key=lambda d: -abs(d["delta_min"]))
    return dict(reference="fleet-typical values", drivers=out[:3])
