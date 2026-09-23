# Changelog

## 2026-09-23 — Phase 0–3: audit, synthetic data generator, dataset, validation

**Files added**
`data_generator/{__init__,config,entities,scenario_generator,generate_dataset,data_dictionary,validation}.py`,
`data/synthetic/*` (dataset, sample, dictionary, scenario distribution, entity tables, correlation matrix, validation report, metadata),
`tests/test_dataset.py`, `pytest.ini`, `docs/project_audit.md`, `docs/dataset.md`, `README.md`, `requirements.txt`, `.gitignore`, `.env.example`.

**Files changed**
None in the UI. The uploaded app was moved unchanged to `frontend/` (verified with `diff -r`).

**Features**
- Scenario-driven causal generator: 120 operators with latent personal traits, 40 machines, 12 scenarios with two-stage (context + intensity) multi-variable effects, seasonal weather, sensor noise.
- Ground-truth safety risk (4 levels), safety events and incident types, personal-baseline anomaly labels with reasons, remaining task time, fuel efficiency.
- Data dictionary with column roles and per-model leakage notes.

**Tests performed**
- `python data_generator/validation.py` → 29/29 checks pass.
- `pytest` → 8 passed (determinism, byte-level regeneration vs committed CSV, schema, hazard ordering, demo operator baseline).
- Frontend baseline `npm ci && npm run build` → succeeds (pre-existing chunk-size warning).

**Issues found and fixed during the phase**
- pandas reads the string "None" as NaN → categorical sentinels renamed to `No_Object` / `No_Incident` / `Normal`.
- Zone status derived before rounding → now derived from the stored distance.
- Overheating scenario pushed ambient temperature past its clip → re-clipped after scenario effects.
- Anomaly label was ~100 % identical to behavioural scenarios → scenario magnitudes widened so mild cases stay within the personal band.
- Unobserved risk noise (σ 0.55) made the HIGH class mostly irreducible → reduced to σ 0.35.
- Idle-habit unit mismatch (per productive vs per session minutes) → defined exactly as idle minutes per 2 h of session; physical cap at 58 % idle.

**Known issues**
- Scenario mix is hazard-rich by design (documented in `docs/dataset.md` §9).
- Frontend still runs entirely on `mock.js` and the JS `computeRisk` formula (to be replaced in phases 9–16).

## 2026-09-23 — Phase 4–7: EDA, safety / anomaly / task-time models

**Files added**
`ml/{__init__,common,features,inference,eda,train_safety_model,train_anomaly_model,train_task_model,evaluate_models}.py`,
`models/{safety_model,anomaly_model,task_time_model}/` (artifact + metadata.json), `reports/` (model_report.md, metrics JSON),
`docs/{eda,ml_methodology}.md`, `docs/figures/*.png`, `tests/test_models.py`, `scripts/train_all.sh`.

**Files changed**
`README.md`, `requirements.txt` (+joblib, matplotlib). No UI files changed.

**Features**
- Shared feature module (training = serving) with enforced leakage exclusions.
- Safety model: 4 candidates, selected on validation log-loss; isotonic-calibrated 0–100 index; alert thresholds chosen on validation; exact group-Shapley explanations; out-of-distribution warnings.
- Personalised anomaly detection: context-normalised behaviour, robust personal baselines, Isolation Forest on personal z-scores, cold-start fallback, typical bands for the twin.
- Task time: remaining + total models with split-conformal 80 % ranges.

**Tests performed**
`bash scripts/train_all.sh` → 24 passed; a from-scratch re-run reproduced identical metrics for all three models.

**Issues found and fixed during the phase**
- Leftover files from an interrupted earlier attempt in the sandbox were quarantined, not reused; everything was rebuilt and re-run.
- Risk index was confined to 15–87.5 (midpoint weighting) → isotonic calibration (MAE 6.26 → 5.50).
- Level disagreed with its own score band in 12 % of cases → level is now the score's band with validation-chosen alert thresholds.
- pandas refused float reference values in int-inferred columns → explicit input dtypes in inference.
- EDA claim that trees would win was contradicted by Phase 5 → corrected in eda.md.

**Known issues**
- Safety model is weakest on STEEP_TERRAIN (accuracy 0.62) and MACHINE_OVERHEATING (0.69).
- The UI demo event uses an excavator at 6.8 km/h (outside training range) → flagged by the model; fix in Phase 11.
- 19 % of LOW sessions are raised to MEDIUM+ (the cost of the high-recall alert policy).

## 2026-09-23 — Phase 8–18: backend, UI integration, live safety loop, docs

**Files added**
`backend/{__init__,config,main,schemas}.py`, `backend/database/__init__.py`, `backend/routes/api.py`,
`backend/services/{telemetry,twin,tasks,training,replay,simulation,analytics}.py`, `training_content/training_modules.json`,
`frontend/src/{api/client.js, hooks/useApi.js, components/ApiState.jsx, screens/Login.jsx}`,
`tests/{test_api,test_e2e}.py`, `docs/{architecture,api,ui_integration}.md`.

**Files changed**
All screens, `App.jsx`, `Shell.jsx`, `InterventionAlert.jsx`, `ui/index.jsx` (HIGH pill → elevated orange), `lib/risk.js`
(presentation only), `lib/i18n.jsx` (CRITICAL level, per-factor alerts/recommendations, login; Tamil complete),
`hooks/useLiveScenario.js` (polls the backend), `hooks/useTelemetry.js`, `vite.config.js` (/api proxy),
`README.md`, `requirements.txt`, `.env.example`, `.gitignore`.

**Files removed**
`frontend/src/data/mock.js` and the browser risk formula `computeRisk()`.

**Features**
- FastAPI + SQLite backend (24 endpoints), DB auto-built on first start; ground-truth labels are not loaded.
- Live loop: scripted sensor feed, model-scored 0.5 s frames, 5 s forecast, model-driven alert rule, take action / dismiss, automatic event recording.
- Safety Replay from recorded frames with derived markers and findings; What-if and 3D simulator scored by the model.
- Digital Twin (project-defined scores, personal baseline bands, trend, insights), adaptive training with traceable reasons.
- Loading / error / empty states; login; Online/Offline indicator; model reasons localised to Tamil.

**Tests performed**
- `pytest` → 37 passed (dataset 13, models 11, API 12, end-to-end story 1).
- Real-time live event run: forecast HIGH at 3.0 s while current LOW; alert at 4.7 s; after action MEDIUM → LOW; event recorded and replayable.
- Headless Chromium against uvicorn + `vite preview`: all 10 screens render without page errors; demo event → alert → take action → replay; what-if; quiz; Tamil.
- `npm run build` succeeds.

**Issues found and fixed**
- Training rule `0.8·old + 0.2·assessment` lowered the score of strong operators who passed → replaced with `old + 0.2·(100 − old)·quality`; wrong answers no longer change the score.
- Recommendation thresholds assumed absolute scores; twin scores are percentiles → thresholds moved to the bottom 35–40 %.
- Replay dropped the ALERT marker when it coincided with another event → markers merge.
- What-if rounded the recorded values → recorded side now exact.
- Alert copy said "entered the restricted zone" at 3.3 m → wording depends on distance.
- Duplicate anomaly in Analytics; simulator default speed outside the training range; worker walk-away path.

**Known issues**
- Hindi/Telugu partial. Google Fonts need internet (system fallbacks otherwise).
- `npm run build:single` produces a UI-only file; it needs a reachable backend to show data.
