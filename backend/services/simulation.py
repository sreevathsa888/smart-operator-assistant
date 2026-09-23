"""What-if, 3D simulator and 'What would you do?' – all through the SAME safety model."""
import json
from datetime import datetime

from backend import database as db

OPTION_ASSUMPTIONS = {  # resulting state assumed for each decision (documented, applied to the paused scenario)
    "A": ("Continue operation", lambda s: {**s, "distance": max(0.6, s["distance"] - 1.0)}),
    "B": ("Reduce speed", lambda s: {**s, "speed": min(s["speed"] * 0.4, 1.5), "distance": max(0.6, s["distance"] - 0.4)}),
    "C": ("Stop and verify surroundings", lambda s: {**s, "speed": 0.0, "Travel_Direction": "Stationary"}),
    "D": ("Reverse immediately", lambda s: {**s, "speed": min(4.3, max(s["speed"], 3.5)), "Travel_Direction": "Reverse",
                                            "Blind_Zone_Entry": 1, "distance": max(0.6, s["distance"] - 1.5)}),
}


def _ctx(operator_id, machine_id):
    from backend.services.telemetry import _context
    return _context(operator_id, machine_id)


def _log(operator_id, kind, payload):
    db.execute("INSERT INTO simulation_events (ts, operator_id, kind, payload) VALUES (?,?,?,?)",
               (datetime.now().isoformat(timespec="seconds"), operator_id, kind, json.dumps(payload)))


def risk(scenarios, operator_id, machine_id, explain):
    from ml.inference import safety
    ctx = _ctx(operator_id, machine_id)
    if explain:
        return [safety().predict(s, context=ctx) for s in scenarios]
    res = safety().score_batch(scenarios, context=ctx)
    return res


def decision(state, choice, operator_id, machine_id):
    from ml.inference import safety
    ctx = _ctx(operator_id, machine_id)
    before = safety().predict(state, context=ctx, explain=False)
    opts = []
    for oid, (label, f) in OPTION_ASSUMPTIONS.items():
        st = f(dict(state))
        r = safety().predict(st, context=ctx, explain=False)
        opts.append(dict(id=oid, label=label, assumed_state=st, score=r["score"], level=r["level"], delta=round(r["score"] - before["score"], 1)))
    best = min(opts, key=lambda o: o["score"]); worst = max(opts, key=lambda o: o["score"])
    for o in opts:
        o["impact"] = ("best" if o is best else "critical" if (o is worst and o["level"] in ("HIGH", "CRITICAL"))
                       else "positive" if o["delta"] <= -5 else "negative")
    chosen = next(o for o in opts if o["id"] == choice) if choice else None
    _log(operator_id, "decision", dict(choice=choice, before=before["score"], options=[(o["id"], o["score"]) for o in opts]))
    return dict(before=dict(score=before["score"], level=before["level"]), options=opts, chosen=chosen,
                method="each option's resulting state (see assumed_state) scored by the safety model")
