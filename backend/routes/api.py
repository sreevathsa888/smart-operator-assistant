"""All /api routes. Thin: validation + delegation to services + ml.inference."""
import json
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from backend import config
from backend import database as db
from backend.schemas import (AnomalyRequest, DecisionRequest, SafetyRequest, SimulationRiskRequest, TaskTimeRequest,
                             TelemetryEvent, TrainingComplete)
from backend.services import analytics, replay, simulation, tasks, telemetry, training, twin

router = APIRouter(prefix="/api")


def _op(operator_id):
    op = db.one("SELECT * FROM operators WHERE operator_id=?", (operator_id,))
    if not op:
        raise HTTPException(404, f"operator {operator_id} not found")
    return op


def _log(kind, req, resp):
    db.execute("INSERT INTO predictions (ts, kind, request, response) VALUES (?,?,?,?)",
               (datetime.now().isoformat(timespec="seconds"), kind, json.dumps(req, default=str)[:4000], json.dumps(resp, default=str)[:4000]))


def _call(fn, *a, **k):
    try:
        return fn(*a, **k)
    except KeyError as e:
        raise HTTPException(404, f"not found: {e}")
    except ValueError as e:
        raise HTTPException(409, str(e))


# ------------------------------------------------------------------ meta
@router.get("/health")
def health():
    from ml.common import load_artifact
    return dict(status="ok", seeded=db.is_seeded(), models={n: load_artifact(n)[1]["version"] for n in ("safety_model", "anomaly_model", "task_time_model")})


@router.get("/meta")
def meta():
    from ml.inference import safety
    S = safety()
    return dict(levels=S.levels, alert_cuts=S.cuts.tolist(), label_cuts=[30, 55, 75], demo_operator=config.DEMO_OPERATOR,
                demo_machine=config.DEMO_MACHINE, site=config.SITE_NAME, safety_model=S.meta["selected_model"],
                disclaimer="Prototype on synthetic data. Risk scores are project-defined metrics, not official CAT metrics.")


# ------------------------------------------------------------------ operators / machines
@router.get("/operators")
def operators(limit: int = 200):
    return db.rows("SELECT operator_id, experience_level, operating_shift, primary_machine_id FROM operators ORDER BY operator_id LIMIT ?", (limit,))


@router.get("/operator/{operator_id}")
def operator(operator_id: str):
    op = _op(operator_id)
    op["shift_window"] = {"Morning": "06:00 – 14:00", "Afternoon": "14:00 – 22:00", "Night": "22:00 – 06:00"}[op["operating_shift"]]
    return op


@router.get("/machine/{machine_id}")
def machine(machine_id: str):
    m = db.one("SELECT * FROM machines WHERE machine_id=?", (machine_id,))
    if not m:
        raise HTTPException(404, f"machine {machine_id} not found")
    return m


@router.get("/twin/{operator_id}")
def get_twin(operator_id: str):
    _op(operator_id)
    return _call(twin.compute, operator_id)


@router.get("/dashboard/{operator_id}")
def dashboard(operator_id: str):
    op = operator(operator_id)
    items = _call(tasks.list_tasks, operator_id)
    tw = twin.compute(operator_id)
    rec = training.recommendations(operator_id)
    return dict(operator=op, machine=machine(op["primary_machine_id"]), tasks=items, current_task=tasks.current_task(items),
                twin={k: tw[k] for k in ("scores", "lastPeriod", "period_days", "behavior", "baseline", "trend", "sessions_in_baseline", "training")}
                | dict(current_status=tw["current"]["status"], current_reason=tw["current"]["reason"]),
                recent_alerts=replay.list_events(operator_id, limit=5),
                training=[m for m in rec["modules"] if m["status"] == "recommended"])


# ------------------------------------------------------------------ tasks
@router.get("/tasks/{operator_id}")
def get_tasks(operator_id: str):
    _op(operator_id)
    items = _call(tasks.list_tasks, operator_id)
    cur = tasks.current_task(items)
    return dict(tasks=items, current=cur, drivers=tasks.drivers(cur) if cur else None)


@router.post("/tasks/{task_id}/start")
def start_task(task_id: str):
    _call(tasks.start_task, task_id)
    return {"ok": True}


@router.post("/tasks/{task_id}/complete")
def complete_task(task_id: str):
    _call(tasks.complete_task, task_id)
    return {"ok": True}


# ------------------------------------------------------------------ predictions
@router.post("/predict/safety")
def predict_safety(req: SafetyRequest):
    from backend.services.telemetry import _context
    from ml.inference import safety
    ctx = _context(req.operator_id or config.DEMO_OPERATOR, req.machine_id or config.DEMO_MACHINE)
    out = _call(safety().predict, req.inputs, context=ctx, explain=req.explain)
    _log("safety", req.model_dump(), dict(score=out["score"], level=out["level"]))
    return out


@router.post("/predict/task-time")
def predict_task_time(req: TaskTimeRequest):
    from ml.inference import task_time
    out = _call(task_time().predict, req.task)
    _log("task_time", req.model_dump(), out)
    return out


@router.post("/anomaly/operator")
def anomaly_operator(req: AnomalyRequest):
    from ml.inference import anomaly
    _op(req.operator_id)
    session = req.session or twin.current_session(req.operator_id)
    session = {**session, "Operator_ID": req.operator_id}
    out = _call(anomaly().analyze, session)
    _log("anomaly", dict(operator_id=req.operator_id), dict(status=out["status"], reason=out["reason_code"]))
    return out


# ------------------------------------------------------------------ simulation
@router.post("/simulation/risk")
def simulation_risk(req: SimulationRiskRequest):
    items = req.scenarios if req.scenarios is not None else ([req.scenario] if req.scenario else None)
    if not items:
        raise HTTPException(422, "provide scenario or scenarios")
    res = _call(simulation.risk, items, req.operator_id or config.DEMO_OPERATOR, req.machine_id or config.DEMO_MACHINE, req.explain)
    return dict(results=res) if req.scenarios is not None else res[0]


@router.post("/simulation/decision")
def simulation_decision(req: DecisionRequest):
    return _call(simulation.decision, req.state, req.choice, req.operator_id or config.DEMO_OPERATOR, req.machine_id or config.DEMO_MACHINE)


# ------------------------------------------------------------------ live telemetry
@router.get("/telemetry/{machine_id}")
def get_telemetry(machine_id: str, operator_id: str | None = None, history: bool = False):
    machine(machine_id)
    return telemetry.snapshot(machine_id, operator_id, with_history=history)


@router.post("/telemetry/{machine_id}/event")
def telemetry_event(machine_id: str, body: TelemetryEvent):
    machine(machine_id)
    out = telemetry.control(machine_id, body.action, body.operator_id)
    if not out["ok"]:
        raise HTTPException(409, out["reason"])
    return out


# ------------------------------------------------------------------ safety events
@router.get("/safety/events")
def safety_events(operator_id: str | None = None, limit: int = Query(20, le=200)):
    return replay.list_events(operator_id, limit)


@router.get("/safety/replay/{event_id}")
def safety_replay(event_id: str):
    return _call(replay.get, event_id)


# ------------------------------------------------------------------ training
@router.get("/training/recommendations/{operator_id}")
def training_recs(operator_id: str):
    _op(operator_id)
    return training.recommendations(operator_id)


@router.post("/training/complete")
def training_complete(body: TrainingComplete):
    _op(body.operator_id)
    return _call(training.complete, body.operator_id, body.module_id, body.correct, body.answer)


# ------------------------------------------------------------------ analytics
@router.get("/analytics/{operator_id}")
def get_analytics(operator_id: str):
    _op(operator_id)
    return analytics.compute(operator_id)
