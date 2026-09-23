"""The full demo story, in order, against the real app (fresh temporary database).

login → dashboard → start task → live event → model alert → explanation → safer simulation → take action →
event recorded → replay → personal anomaly → training recommendation → complete module → twin updated → analytics
"""
import os
import tempfile

os.environ["SOA_DB_PATH"] = os.path.join(tempfile.mkdtemp(), "e2e.db")

from fastapi.testclient import TestClient  # noqa: E402

from backend import database as db  # noqa: E402
from backend.main import app  # noqa: E402
from backend.services import telemetry  # noqa: E402

OP, MC = "OP1007", "EXC-204"


def _age(seconds):
    ms = telemetry.state_of(MC)
    ms.event_start -= seconds
    if ms.action:
        ms.action = (ms.action[0], ms.action[1] - seconds)


def test_demo_story():
    db.use_path(os.path.join(tempfile.mkdtemp(), "e2e.db"))       # fresh database even when run after other suites
    with TestClient(app) as c:
        # 1–2 login + dashboard
        op = c.get(f"/api/operator/{OP}").json()
        assert op["primary_machine_id"] == MC
        d = c.get(f"/api/dashboard/{OP}").json()
        assert d["current_task"]["status"] == "pending"
        # 3 start the task → ETA becomes 'remaining'
        assert c.post(f"/api/tasks/{d['current_task']['id']}/start").status_code == 200
        assert c.get(f"/api/tasks/{OP}").json()["current"]["eta"]["kind"] == "remaining"
        # 4–6 live event: risk rises, the model forecasts it before the alert fires
        c.post(f"/api/telemetry/{MC}/event", json={"action": "start", "operator_id": OP})
        _age(3.0)
        s = c.get(f"/api/telemetry/{MC}").json()
        assert s["phase"] == "approach" and s["predicted"]["score"] > s["risk"]["score"]
        _age(3.0)
        s = c.get(f"/api/telemetry/{MC}").json()
        assert s["phase"] == "alert" and s["alert"]["top_factor"] == "proximity"
        # 7 explanation sums to the score change
        r = s["risk"]
        assert abs(sum(x["points"] for x in r["contributions"]) - (r["score"] - r["baseline_score"])) < 0.3
        # 8 simulate a safer action from the paused state
        st = s["state"]
        sim = c.post("/api/simulation/decision", json={"state": {"speed": st["speed"], "distance": st["distance"], "Travel_Direction": st["direction"],
                                                                 "Blind_Zone_Entry": st["blind_zone"], "Obstacle_Type": "Worker"}}).json()
        assert min(sim["options"], key=lambda o: o["score"])["id"] == "C"
        # 9 take action → risk falls → event recorded
        c.post(f"/api/telemetry/{MC}/event", json={"action": "stop"})
        _age(2.0)
        assert c.get(f"/api/telemetry/{MC}").json()["state"]["speed"] == 0
        _age(20)
        assert c.get(f"/api/telemetry/{MC}").json()["phase"] == "normal"
        ev = next(e for e in c.get(f"/api/safety/events?operator_id={OP}").json() if e["source"] == "live")
        # 10 replay with derived markers and findings
        rp = c.get(f"/api/safety/replay/{ev['event_id']}").json()
        assert any("ALERT" in k["label"] for k in rp["keyframes"]) and len(rp["findings"]) >= 3
        # 11 personal anomaly for the current shift
        an = c.post("/api/anomaly/operator", json={"operator_id": OP}).json()
        assert an["status"] == "UNUSUAL" and an["reason_code"] == "Excessive_Idle"
        # 12 recommendations are traceable to data
        rec = c.get(f"/api/training/recommendations/{OP}").json()
        top = [m for m in rec["modules"] if m["status"] == "recommended"]
        assert {"blind", "idle"} <= {m["id"] for m in top}
        # 13–14 complete a module → twin training score updated
        before = c.get(f"/api/twin/{OP}").json()["training"]["score"]
        done = c.post("/api/training/complete", json={"operator_id": OP, "module_id": "blind", "correct": True}).json()
        after = c.get(f"/api/twin/{OP}").json()["training"]["score"]
        assert after == done["training_score"]["after"] > before
        # 15 analytics reflects the operator
        a = c.get(f"/api/analytics/{OP}").json()
        assert a["anomalies"] and a["anomalies"][0]["when"] == "Current shift"
