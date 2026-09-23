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
