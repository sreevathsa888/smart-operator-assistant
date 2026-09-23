# Architecture

```
 React + Vite UI (frontend/)                      FastAPI backend (backend/)                         ML (ml/, models/)
 ───────────────────────────                      ──────────────────────────                         ─────────────────
 screens ─► hooks (useApi, useLiveScenario) ─► /api/* routes ─► services ─────────────────────────► ml.inference
            api/client.js  (fetch, ApiError)       │            telemetry  (live feed + alerts)        SafetyPredictor
            polling 0.5 s for live telemetry       │            twin       (scores, baseline)          AnomalyDetector
                                                   │            tasks      (plan, ETAs, drivers)       TaskTimePredictor
                                                   │            training   (triggers, completion)
                                                   │            replay     (events, markers)
                                                   │            simulation (what-if, decisions)
                                                   │            analytics
                                                   ▼
                                               SQLite (backend/database/soa.db, built on first start from data/synthetic/)
```

## Layers

| Layer | Responsibility | Never does |
|---|---|---|
| `data_generator/` | Builds the synthetic dataset (seed 42) | – |
| `ml/` | Feature engineering shared by training **and** serving (`ml/features.py`), training scripts, `ml/inference.py` | Talk to HTTP or the DB |
| `backend/services/` | Business logic: builds model inputs from DB + live state, applies project rules | Contain model maths |
| `backend/routes/api.py` | Validation, HTTP errors (404 unknown id, 409 invalid state, 422 bad body), logging to `predictions` | Business logic |
| `frontend/src/api/client.js` | The only place the UI talks to the network | Compute risk |
| `frontend/src/screens/*` | Presentation, loading/error/empty states | Invent numbers |

## The live loop (predict → explain → act → learn)

1. `POST /api/telemetry/{machine}/event {action:"start"}` starts the **scripted sensor feed** (worker walks toward the rear-left blind zone while the machine reverses). The script is deterministic and stays inside the training range.
2. Every `GET /api/telemetry/{machine}` (the UI polls every 0.5 s) scores new 0.5 s frames with the **safety model**: current risk, per-group Shapley explanation, and a **5 s forecast** (the current state extrapolated linearly from the last second of sensor change — the forecast never reads the script's future).
3. **Alert rule (project-defined):** current level HIGH/CRITICAL, *or* forecast HIGH/CRITICAL while current is at least MEDIUM. When it first holds, a `safety_events` row is opened and the operator's shift session gets a proximity violation.
4. `{action:"stop"}` → the machine decelerates to 0 in 1.5 s; the worker walks away after 4.5 s. Risk is re-predicted on every frame, so the UI shows it falling (MEDIUM while the worker is still close, then LOW).
5. When the event ends, the full frame series, action and response time are stored → **Safety Replay** derives markers and findings from them.
6. The event changes the operator's metrics → **training recommendations** and the **twin** change on the next request.

## Persistence (SQLite)

`telemetry` (dataset sessions without ground-truth labels, plus the model's `pred_risk`/`pred_level`; dates shifted so the last day is yesterday), `operators`, `machines`, `tasks`, `safety_events` (`incident_log` snapshots from the dataset, `recorded` demo event, `live` events), `shift_sessions`, `training_modules`, `training_progress`, `predictions`, `simulation_events`, `meta`.
The DB is rebuilt automatically when missing (≈ 6 s). Delete `backend/database/soa.db` to reset the demo.

## Key design decisions

- **One feature pipeline** (`ml/features.py`) for training and serving → no train/serve skew; leakage sets are enforced there.
- **Ground-truth labels are not loaded into the serving DB** — the app can only see what the models predict.
- **Server-side simulation** of the live feed: all browsers see the same state; alerts are decided by the model, not by UI timers.
- **Project-defined metrics are labelled as such** in code, API responses and UI (twin scores, alert rule, training rule, recommendation text).

## Known limitations

- Telemetry is scripted synthetic data; there is no machine connection.
- Task progress runs on a demo clock (`SOA_DEMO_TIME_SCALE`, default 30× real time).
- "Current shift session" is taken from the operator's recorded history (for the demo operator: the most recent session the anomaly model flags for idling).
- Single-process state for live events (fine for a demo; a production system would use a message broker).
