"""API tests (FastAPI TestClient against a throw-away database).   pytest -q tests/test_api.py"""
import os
import tempfile

import pytest

os.environ["SOA_DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")

from fastapi.testclient import TestClient  # noqa: E402

from backend import database as db  # noqa: E402
from backend.main import app  # noqa: E402
from backend.services import telemetry  # noqa: E402

OP, MC = "OP1007", "EXC-204"


@pytest.fixture(scope="module")
def c():
    db.use_path(os.path.join(tempfile.mkdtemp(), "api.db"))
    with TestClient(app) as client:
        yield client


def test_health_and_meta(c):
    h = c.get("/api/health").json()
    assert h["status"] == "ok" and h["seeded"]
    m = c.get("/api/meta").json()
    assert m["levels"] == ["LOW", "MEDIUM", "HIGH", "CRITICAL"] and len(m["alert_cuts"]) == 3


def test_unknown_ids_are_404(c):
    assert c.get("/api/operator/NOPE").status_code == 404
    assert c.get("/api/twin/NOPE").status_code == 404
    assert c.get("/api/safety/replay/NOPE").status_code == 404


def test_dashboard_contract(c):
    d = c.get(f"/api/dashboard/{OP}").json()
    assert d["operator"]["operator_id"] == OP and d["machine"]["machine_id"] == MC
    assert len(d["tasks"]) == 4 and d["current_task"]["eta"]["lowMin"] <= d["current_task"]["eta"]["pointMin"] <= d["current_task"]["eta"]["highMin"]
    assert set(d["twin"]["scores"]) == {"safety", "efficiency", "control", "awareness", "fuel"}


def test_predict_safety_matches_model_and_explains(c):
    r = c.post("/api/predict/safety", json={"inputs": {"speed": 4, "distance": 1.7, "Obstacle_Type": "Worker", "Blind_Zone_Entry": 1}}).json()
    assert r["level"] in ("HIGH", "CRITICAL") and r["contributions"][0]["key"] == "proximity"
    assert abs(sum(x["points"] for x in r["contributions"]) - (r["score"] - r["baseline_score"])) < 0.3


def test_simulation_batch_is_monotone_in_distance(c):
    res = c.post("/api/simulation/risk", json={"scenarios": [{"speed": 3, "distance": d, "Obstacle_Type": "Worker"} for d in (10, 6, 3, 1.5)]}).json()["results"]
    s = [x["score"] for x in res]
    assert s == sorted(s)


def test_decision_ranks_stop_best(c):
    r = c.post("/api/simulation/decision", json={"state": {"speed": 3.5, "distance": 2.5, "Travel_Direction": "Reverse",
                                                           "Blind_Zone_Entry": 1, "Obstacle_Type": "Worker"}, "choice": "C"}).json()
    by = {o["id"]: o for o in r["options"]}
    assert by["C"]["impact"] == "best" and by["C"]["score"] < by["A"]["score"]
    assert by["D"]["score"] >= by["B"]["score"]


def test_task_start_and_progress(c):
    tasks = c.get(f"/api/tasks/{OP}").json()
    pending = next(t for t in tasks["tasks"] if t["status"] == "pending")
    assert c.post(f"/api/tasks/{pending['id']}/start").status_code == 200
    assert c.post(f"/api/tasks/{pending['id']}/start").status_code == 409
    cur = c.get(f"/api/tasks/{OP}").json()["current"]
    assert cur["status"] == "in_progress" and cur["eta"]["kind"] == "remaining"
    assert tasks["drivers"] and all("delta_min" in d for d in tasks["drivers"]["drivers"])


def test_anomaly_current_session(c):
    r = c.post("/api/anomaly/operator", json={"operator_id": OP}).json()
    assert r["status"] in ("NORMAL", "UNUSUAL") and r["deviations"]


def _age_event(seconds):
    ms = telemetry.state_of(MC)
    ms.event_start -= seconds
    if ms.action:
        ms.action = (ms.action[0], ms.action[1] - seconds)


def test_live_event_alert_action_and_replay(c):
    assert c.post(f"/api/telemetry/{MC}/event", json={"action": "start", "operator_id": OP}).status_code == 200
    s = c.get(f"/api/telemetry/{MC}").json()
    assert s["phase"] == "approach" and s["risk"]["level"] == "LOW"
    _age_event(6)                                       # 6 s into the event
    s = c.get(f"/api/telemetry/{MC}").json()
    assert s["phase"] == "alert" and s["alert"]["active"] and s["event_id"]
    assert c.post(f"/api/telemetry/{MC}/event", json={"action": "stop"}).status_code == 200
    _age_event(20)                                      # well after the worker has left
    s = c.get(f"/api/telemetry/{MC}").json()
    assert s["phase"] == "normal"
    ev = c.get(f"/api/safety/events?operator_id={OP}&limit=5").json()
    live = next(e for e in ev if e["source"] == "live")
    assert live["action"] == "stopped"
    rp = c.get(f"/api/safety/replay/{live['event_id']}").json()
    labels = " ".join(k["label"] for k in rp["keyframes"])
    assert "ALERT" in labels and "STOPPED" in labels and rp["findings"]


def test_training_recommendation_and_completion_updates_twin(c):
    rec = c.get(f"/api/training/recommendations/{OP}").json()
    top = [m for m in rec["modules"] if m["status"] == "recommended"]
    assert top and all(m["reason"] for m in top)
    before = c.get(f"/api/twin/{OP}").json()["training"]["score"]
    r = c.post("/api/training/complete", json={"operator_id": OP, "module_id": top[0]["id"], "correct": True}).json()
    assert r["training_score"]["before"] == before and r["training_score"]["after"] >= before
    assert c.get(f"/api/twin/{OP}").json()["training"]["score"] == r["training_score"]["after"]
    rec2 = c.get(f"/api/training/recommendations/{OP}").json()
    assert next(m for m in rec2["modules"] if m["id"] == top[0]["id"])["status"] == "completed"


def test_analytics_shapes(c):
    a = c.get(f"/api/analytics/{OP}").json()
    assert len(a["safety"]) == 30 and len(a["radar"]) == 5 and len(a["taskCompletion"]) == 4
    assert a["heat"]["rows"] and len(a["heat"]["v"]) == len(a["heat"]["rows"])


def test_training_score_rule_is_monotone(c):
    """Wrong answer: score unchanged. Pass on a later attempt: score rises (never falls), stays ≤ 100."""
    before = c.get(f"/api/twin/{OP}").json()["training"]["score"]
    r1 = c.post("/api/training/complete", json={"operator_id": OP, "module_id": "slope", "correct": False}).json()
    assert r1["training_score"]["after"] == before and r1["status"] == "in_progress"
    r2 = c.post("/api/training/complete", json={"operator_id": OP, "module_id": "slope", "correct": True}).json()
    assert before < r2["training_score"]["after"] <= 100
    assert abs(r2["training_score"]["after"] - (before + 0.2 * (100 - before) * 0.5)) < 0.06
