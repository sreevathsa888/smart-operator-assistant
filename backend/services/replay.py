"""Safety events and replay. Markers and findings are derived from the recorded model-scored frames."""
import json

from backend import database as db

KIND = {"LOW": "safe", "MEDIUM": "medium", "HIGH": "high", "CRITICAL": "critical"}
LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]


def list_events(operator_id=None, limit=20):
    q = "SELECT event_id, operator_id, machine_id, ts, source, peak_score, peak_level, incident_type, summary, action, response_s FROM safety_events"
    args = ()
    if operator_id:
        q += " WHERE operator_id=?"; args = (operator_id,)
    q += " ORDER BY ts DESC LIMIT ?"
    ev = db.rows(q, args + (limit,))
    for e in ev:
        e["replayable"] = e["source"] in ("live", "recorded")
    return ev


def _first(frames, pred, start=0):
    return next((i for i in range(start, len(frames)) if pred(frames[i])), None)


def get(event_id):
    from backend.services.telemetry import _alert_rule, _context, model_inputs
    from ml.inference import safety
    e = db.one("SELECT * FROM safety_events WHERE event_id=?", (event_id,))
    if not e:
        raise KeyError(event_id)
    F = json.loads(e["frames"] or "[]")
    if not F:
        raise ValueError("event has no recorded frames yet")
    for f in F:
        f.setdefault("clock", e["ts"][-5:] + ":00")
        f.setdefault("wx", -(f["dist"] + 1.6) * 0.7); f.setdefault("wy", (f["dist"] + 1.6) * 0.7)
    marks = []
    def mark(i, label):
        if i is None:
            return
        same = next((m for m in marks if m["i"] == i), None)
        if same:                                   # two things happened in the same frame → one merged marker
            same["label"] += " · " + label
            same["labels"].append(label)
        else:
            marks.append(dict(i=i, t=F[i]["t"], clock=F[i]["clock"], label=label, labels=[label], kind=KIND[F[i]["level"]], score=F[i]["score"]))
    mark(0, "START" if e["source"] != "incident_log" else "INCIDENT")
    if len(F) > 1:
        d0, v0 = F[0]["dist"], F[0]["speed"]
        i_prox = _first(F, lambda f: f["dist"] < 6.0) if d0 >= 6.0 else None
        i_speed = _first(F, lambda f: f["speed"] >= v0 + 0.4)
        i_blind = _first(F, lambda f: f.get("blind") == 1)
        i_med = _first(F, lambda f: LEVELS.index(f["level"]) >= 1)
        i_alert = _first(F, lambda f: _alert_rule(f["level"], f.get("pred_level", f["level"])))
        i_stop = _first(F, lambda f: f["speed"] == 0, i_alert or 0) if e["action"] == "stopped" else None
        peak = max(range(len(F)), key=lambda i: F[i]["score"])
        i_clear = _first(F, lambda f: f["level"] == "LOW", peak)
        for i, lab in ((i_prox, "PROXIMITY ↓"), (i_speed, "SPEED ↑"), (i_blind, "BLIND ZONE"), (i_med, "RISK ↑"),
                       (i_alert, "ALERT"), (i_stop, "STOPPED"), (i_clear, "CLEAR")):
            mark(i, lab)
    marks.sort(key=lambda m: m["t"])
    # findings
    peak = max(F, key=lambda f: f["score"])
    ctx = _context(e["operator_id"], e["machine_id"])
    s = dict(speed=peak["speed"], dist=peak["dist"], slope=peak["slope"], load=peak["load"], vis=peak.get("vis", 85),
             dir=peak.get("dir", "Reverse"), blind=peak.get("blind", 0))
    ex = safety().predict(model_inputs(s), context=ctx)
    top = ex["contributions"][0]
    findings = []
    alert = next((m for m in marks if "ALERT" in m["labels"]), None)
    prox = next((m for m in marks if "PROXIMITY ↓" in m["labels"]), None)
    if alert and prox:
        findings.append(f"Worker entered the 6 m proximity zone {alert['t'] - prox['t']:.1f} s before the alert.")
    if alert and len(F) > 1:
        a = F[marks[0]["i"]]; b = next(f for f in F if f["t"] == alert["t"])
        findings.append(f"Speed went from {a['speed']:.1f} to {b['speed']:.1f} km/h while distance fell from {a['dist']:.1f} to {b['dist']:.1f} m.")
    findings.append(f"Peak predicted risk {peak['score']:.0f}/100 ({peak['level']}) at {peak['clock']}; top factor {top['key']} "
                    f"(+{top['points']:.0f} points vs typical safe operation).")
    if e["action"] == "stopped" and e["response_s"] is not None:
        findings.append(f"Operator stopped {e['response_s']:.1f} s after the alert" + (" — good response." if e["response_s"] <= 3.5 else "."))
    elif e["action"] == "dismissed":
        findings.append("Alert was dismissed; the machine kept moving until the worker left.")
    elif e["source"] == "incident_log":
        findings.append(f"Recorded outcome: {e['incident_type'].replace('_', ' ')}. Snapshot only — no time series was recorded.")
    alert_frame = next((f for f in F if alert and f["t"] == alert["t"]), peak)
    return dict(id=e["event_id"], operator_id=e["operator_id"], machine=e["machine_id"], date=e["ts"], source=e["source"],
                summary=e["summary"], action=e["action"], response_s=e["response_s"], incident_type=e["incident_type"],
                peak_score=e["peak_score"], peak_level=e["peak_level"], frames=F, keyframes=marks, findings=findings,
                alert_frame=dict(speed=alert_frame["speed"], distance=alert_frame["dist"], slope=alert_frame["slope"],
                                 load=alert_frame["load"], visibility=alert_frame.get("vis", 85),
                                 direction=alert_frame.get("dir", "Reverse"), blind_zone=alert_frame.get("blind", 0)),
                peak_explanation=ex["contributions"])
