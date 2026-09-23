"""Adaptive training.

Each module in training_content/training_modules.json declares `trigger_conditions` over operator metrics.
recommendations() computes those metrics from the operator's data (twin scores, anomaly result for the current
shift, recorded safety events, recent sessions), evaluates every condition, and ranks triggered modules by the
number of conditions met. Reasons are rendered from the actual metric values, so every recommendation can be
traced to data.

Completing a module updates the operator's Training_Score (PROJECT rule, documented):
    new = old + 0.2 × (100 − old) × quality      quality = 1.0 if the quick check is passed first time,
                                                            0.5 if passed on a later attempt
A wrong answer records the attempt without changing the score; modules without a quiz record completion only.
The rule closes part of the gap to 100, so completing training never lowers the score and never exceeds 100.
Training_Score is also a safety-model input, so the live risk estimate reflects it on the next prediction.
"""
import json
import os
from datetime import datetime, timedelta

from backend import config
from backend import database as db

PATH = os.path.join(config.ROOT, "training_content", "training_modules.json")
PROXIMITY_TYPES = ("Proximity_Near_Miss", "Vehicle_Interaction")


def modules():
    return {r["module_id"]: json.loads(r["spec"]) for r in db.rows("SELECT * FROM training_modules")}


def seed_modules():
    spec = json.load(open(PATH, encoding="utf-8"))
    for m in spec["modules"]:
        db.execute("INSERT OR REPLACE INTO training_modules VALUES (?,?)", (m["id"], json.dumps(m, ensure_ascii=False)))
    # Seed training history for the demo operator (synthetic, like the rest of the prototype data)
    for mid, status, prog, score, days in (("lockout", "completed", 1.0, 100, 40), ("fire", "completed", 1.0, 100, 25),
                                           ("trench", "in_progress", 0.55, None, None)):
        db.execute("INSERT OR REPLACE INTO training_progress VALUES (?,?,?,?,?,?,?)",
                   (config.DEMO_OPERATOR, mid, status, prog, score, 1 if status == "completed" else 0,
                    (datetime.now() - timedelta(days=days)).isoformat(timespec="seconds") if days else None))


def metrics(operator_id):
    from backend.services import twin
    tw = twin.compute(operator_id)
    s = twin.operator_sessions(operator_id)
    end = twin.last_day()
    last30 = s[s["ts"] > end - timedelta(days=30)]
    high = last30["pred_level"].isin(["HIGH", "CRITICAL"])
    since14 = (end - timedelta(days=14)).strftime("%Y-%m-%d")
    prox_events = db.one(
        f"SELECT COUNT(*) n FROM safety_events WHERE operator_id=? AND ts>=? AND (source IN ('live','recorded') OR incident_type IN {PROXIMITY_TYPES})",
        (operator_id, since14))["n"]
    idle_band = next(b for b in tw["baselineBands"] if b["key"] == "idle_per_2h")
    from ml.inference import anomaly
    base = anomaly().a["baselines"]
    op_idle = base["idle_per_2h_med"].get(operator_id)
    idle_pct = int(round(100 * (base["idle_per_2h_med"] < op_idle).mean())) if op_idle is not None else 50
    cur = tw["current"]
    return dict(
        proximity_events_14d=int(prox_events), awareness_score=tw["scores"]["awareness"], fuel_score=tw["scores"]["fuel"],
        efficiency_score=tw["scores"]["efficiency"], control_score=tw["scores"]["control"], safety_score=tw["scores"]["safety"],
        anomaly_reason=cur["reason_code"], idle_anomaly=bool(idle_band["current"] > idle_band["max"] * 1.2),
        idle_current=idle_band["current"], idle_band=f"{idle_band['min']}–{idle_band['max']}", idle_median_vs_fleet_pct=idle_pct,
        high_risk_slope_sessions_30d=int((high & (last30["Ground_Slope"] > 10)).sum()),
        high_risk_trench_sessions_30d=int((high & (last30["Task_Type"] == "Trenching")).sum()),
        seatbelt_unfastened_30d=int((last30["Seatbelt_Status"] == "Unfastened").sum()),
    )


def _holds(c, m):
    v = m.get(c["metric"])
    op, x = c["op"], c["value"]
    if v is None:
        return False
    return {">=": lambda: v >= x, ">": lambda: v > x, "<": lambda: v < x, "<=": lambda: v <= x,
            "==": lambda: v == x, "in": lambda: v in x}[op]()


def _fmt_dur(s):
    return f"{s // 60:02d}:{s % 60:02d}"


def recommendations(operator_id, top_n=3):
    m = metrics(operator_id)
    progress = {r["module_id"]: r for r in db.rows("SELECT * FROM training_progress WHERE operator_id=?", (operator_id,))}
    out = []
    for mid, spec in modules().items():
        hits = [c for c in spec.get("trigger_conditions", []) if _holds(c, m)]
        reasons = [spec["reason_templates"][c["metric"]].format(**m) for c in hits if c["metric"] in spec.get("reason_templates", {})]
        p = progress.get(mid)
        out.append(dict(
            id=mid, titleKey=spec.get("title_key"), title=spec["title"]["en"], title_i18n=spec["title"], kind=spec["kind"],
            cat=spec["category"], dur=_fmt_dur(spec["duration_s"]), duration_s=spec["duration_s"], difficulty=spec["difficulty"],
            skill=", ".join(spec["skills"]), description=spec["description"], animation=spec.get("animation", "generic"),
            chapters=spec.get("chapters", []), quiz=spec.get("quiz"), languages=spec.get("languages", ["en"]),
            triggered=[c["metric"] for c in hits], reasons=reasons, reason="; ".join(reasons) if reasons else None,
            priority=len(hits), status=(p["status"] if p else "available"), progress=int(round(100 * (p["progress"] if p else 0))),
            score=p["score"] if p else None))
    open_triggered = sorted([x for x in out if x["priority"] > 0 and x["status"] != "completed"], key=lambda x: (-x["priority"], x["id"]))
    for x in open_triggered[:top_n]:
        x["status"] = "recommended"
    order = {"recommended": 0, "in_progress": 1, "available": 2, "completed": 3}
    out.sort(key=lambda x: (order[x["status"]], -x["priority"], x["id"]))
    return dict(operator_id=operator_id, metrics=m, modules=out,
                summary=[r for x in out if x["status"] == "recommended" for r in x["reasons"]][:4])


def complete(operator_id, module_id, correct: bool, answer=None):
    from backend.services import twin
    spec = modules().get(module_id)
    if not spec:
        raise KeyError(module_id)
    p = db.one("SELECT * FROM training_progress WHERE operator_id=? AND module_id=?", (operator_id, module_id)) or {"attempts": 0}
    attempts = (p.get("attempts") or 0) + 1
    op = db.one("SELECT training_score FROM operators WHERE operator_id=?", (operator_id,))
    before = round(op["training_score"], 1)
    if spec.get("quiz") is None:                      # no assessment → completion recorded, score unchanged
        assessment, after, correct = None, before, True
    elif correct:
        quality = 1.0 if attempts == 1 else 0.5
        assessment = int(100 * quality)
        after = round(min(100.0, before + 0.2 * (100 - before) * quality), 1)
    else:                                              # a wrong answer records the attempt; the score only moves on a pass
        assessment, after = None, before
    db.execute("UPDATE operators SET training_score=? WHERE operator_id=?", (after, operator_id))
    status = "completed" if correct else "in_progress"
    db.execute("INSERT OR REPLACE INTO training_progress VALUES (?,?,?,?,?,?,?)",
               (operator_id, module_id, status, 1.0 if correct else 0.9, assessment, attempts,
                datetime.now().isoformat(timespec="seconds") if correct else None))
    db.execute("INSERT INTO simulation_events (ts, operator_id, kind, payload) VALUES (?,?,?,?)",
               (datetime.now().isoformat(timespec="seconds"), operator_id, "training_complete",
                json.dumps(dict(module_id=module_id, correct=correct, answer=answer, assessment=assessment))))
    twin.invalidate(operator_id)
    return dict(module_id=module_id, status=status, assessment=assessment, attempts=attempts,
                training_score=dict(before=before, after=after), rule="new = old + 0.2 × (100 − old) × quality")
