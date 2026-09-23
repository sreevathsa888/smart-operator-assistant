# API reference

Base URL `http://localhost:8000` · interactive docs at `/docs` (Swagger) · all bodies JSON.
Errors: `404` unknown id · `409` invalid state (e.g. starting a second task) · `422` invalid body. Error body: `{"detail": "..."}`.
Levels: `LOW | MEDIUM | HIGH | CRITICAL`. Scores 0–100 (project-defined risk scale; not an official CAT metric).

## Meta
| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{status, seeded, models:{name:version}}` |
| GET | `/api/meta` | levels, `alert_cuts` [27,52,72], demo ids, selected safety model, disclaimer |
| GET | `/api/operators` | operator list (for login) |
| GET | `/api/operator/{id}` | profile incl. `primary_machine_id`, `shift_window` |
| GET | `/api/machine/{id}` | machine record |

## Operator
| Method | Path | Returns |
|---|---|---|
| GET | `/api/dashboard/{op}` | operator, machine, tasks, current task, twin summary, recent alerts, recommended training |
| GET | `/api/twin/{op}` | scores (+ previous period), behaviour/baseline/trend, `current` anomaly result, `baselineBands`, 14-day `history`, `insights`, training score |
| GET | `/api/analytics/{op}` | daily safety vs fleet, fuel, idle by weekday, on-time tasks, radar, hotspot heatmap, anomalies |

## Tasks
| Method | Path | Notes |
|---|---|---|
| GET | `/api/tasks/{op}` | `tasks[]` each with `eta {kind: total|remaining, pointMin, lowMin, highMin, display, range_display}`, `gantt`; `current`; `drivers` (counterfactual minutes vs fleet-typical values) |
| POST | `/api/tasks/{task_id}/start` | 409 if another task is in progress |
| POST | `/api/tasks/{task_id}/complete` | only an in-progress task |

## Predictions
```jsonc
POST /api/predict/safety
{ "inputs": {"speed": 4, "distance": 1.7, "Obstacle_Type": "Worker", "Blind_Zone_Entry": 1},
  "operator_id": "OP1007", "explain": true }
→ { "score": 91.6, "level": "CRITICAL", "probabilities": {...}, "baseline_score": 4.1,
    "contributions": [{"key":"proximity","points":60.2,"pct":68.8,"isolated":78.0,"value":1.7,"reference":10.4,"unit":"m"}, ...],
    "reasons": [{"key":"proximity","points":60.2,"text":"Proximity 1.7 m (typical safe 10.4 m)"}], "warnings": [] }
```
Aliases: `speed, distance, load, slope, visibility`; any dataset column name is accepted. Missing fields are filled from the operator/machine context. `warnings` lists inputs outside the training range.

| Method | Path | Body |
|---|---|---|
| POST | `/api/predict/task-time` | `{task:{...task features...}}` → `{kind, point_min, low_min, high_min, display, range_display}` |
| POST | `/api/anomaly/operator` | `{operator_id, session?}` (omit session → current shift) → `{status, anomaly_score, reason_code, reason, deviations[]}` |
| POST | `/api/simulation/risk` | `{scenario}` or `{scenarios:[≤400], explain:false}` → batch scores |
| POST | `/api/simulation/decision` | `{state, choice?}` → options A–D with `assumed_state`, `score`, `level`, `impact` |

## Live telemetry
| Method | Path | Notes |
|---|---|---|
| GET | `/api/telemetry/{machine}?operator_id=&history=` | `phase` (normal/approach/alert/resolving/resolved/dismissed), `state`, `risk` (full explanation), `predicted` (5 s), `eta_restricted_s`, `alert {active, title_key, recommendation_key, top_factor}`, `telemetry` (engine/hydraulic/fuel/rpm, fuel projection), `history` (60 samples when requested) |
| POST | `/api/telemetry/{machine}/event` | `{action: start|stop|dismiss, operator_id?}` · 409 if not applicable |

## Safety events
| Method | Path | Notes |
|---|---|---|
| GET | `/api/safety/events?operator_id=&limit=` | newest first; `replayable` for live/recorded events |
| GET | `/api/safety/replay/{event_id}` | `frames[]` (t, clock, dist, speed, slope, load, score, level, wx, wy), `keyframes[]`, `findings[]`, `alert_frame`, `peak_explanation` |

## Training
| Method | Path | Notes |
|---|---|---|
| GET | `/api/training/recommendations/{op}` | `metrics` used by the triggers, `modules[]` with `status` (recommended/in_progress/available/completed), `reasons`, chapters, quiz |
| POST | `/api/training/complete` | `{operator_id, module_id, correct, answer?}` → status, attempts, `training_score {before, after}`, `rule` |

Training score rule (project-defined): `new = old + 0.2 × (100 − old) × quality` (1.0 first-attempt pass, 0.5 later pass; wrong answers and quiz-less modules leave the score unchanged).
