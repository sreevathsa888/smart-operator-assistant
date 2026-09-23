# Smart Operator Assistant for CAT Machinery

Final-year project (B.Tech CSE — Data Science). An operator-assist prototype that **predicts** safety risk a few seconds
ahead, **explains** why, lets the operator **simulate** safer actions, and **learns** each operator's personal baseline to
recommend targeted training.

> Prototype on **synthetic data**. Risk scores, twin scores, alert and training rules are **project-defined metrics**,
> not official Caterpillar metrics or procedures. "CAT" refers to the machinery class this project targets; the project
> is not affiliated with or endorsed by Caterpillar Inc.

## What it does

| | |
|---|---|
| **Predict** | Safety model (calibrated logistic regression with interaction terms) scores every 0.5 s frame and forecasts risk 5 s ahead; alerts fire from the model, before the worker reaches the restricted zone |
| **Explain** | Exact group-Shapley contributions (proximity, speed, terrain, load, visibility, machine, control) with plain-language reasons |
| **Simulate** | What-if analysis and a 3D "What would you do?" simulator, both scored by the same model |
| **Learn** | Per-operator anomaly model (personal baselines) → Digital Twin → adaptive training; completing training updates the twin |
| **Replay** | Every live event is recorded frame by frame and replayable with findings derived from the data |
| **Languages** | English + Tamil complete; Hindi / Telugu partial |

Model results on held-out **unseen operators** (details: `reports/model_report.md`):
safety ROC-AUC 0.950, macro-F1 0.757, HIGH∪CRITICAL recall 0.896, no CRITICAL predicted as LOW ·
personal anomaly PR-AUC 0.807 vs 0.625 for a global model · task time MAE 11.1 min vs 28.4 for the planner formula,
80 % intervals with 79–80 % coverage.

## Run it (Windows PowerShell; macOS/Linux identical except venv activation)

Requirements: Python 3.10+, Node 18+.

```powershell
# 1. backend (from the repository root)
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --port 8000
#   first start builds backend/database/soa.db (~6 s). API docs: http://localhost:8000/docs

# 2. frontend (second terminal)
cd frontend
npm install
npm run dev                            # http://localhost:5173  (proxies /api to :8000)
```

Trained models are committed in `models/`. To rebuild everything from scratch:
`python data_generator/generate_dataset.py` then `bash scripts/train_all.sh` (or run the three `ml/train_*.py` scripts).

Tests: `pytest` (dataset, models, API, full demo story — 37 tests).

## Demo script (≈ 5 minutes)

1. **Start shift** as `OP1007` → Overview: today's tasks with model ETAs and 80 % ranges, safety score, twin summary.
2. Tasks → **Start task** on Excavation — Zone B → ETA switches to *remaining*; drivers show what moves the estimate.
3. Header → **Demo event**. Watch Safety Center: current risk stays LOW while the **5 s forecast** turns HIGH; the model raises the alert at ≈ 4.7 s.
4. On the alert: reasons with points, recommended action → **View why** (Shapley breakdown).
5. **Take action** → speed 0, risk falls to MEDIUM (worker still close), then LOW when the worker leaves.
6. Safety Replay → the event just recorded; play it; read the findings (response time, peak, top factor).
7. **What if I had…?** → adjust speed/distance; the model re-scores both scenarios; biggest lever highlighted.
8. Operator Twin → **UNUSUAL**: idle 36 min / 2 h vs personal band 17–25; insights.
9. Training Hub → recommendations with reasons → Blind-Zone Awareness → quick check → training score rises in the twin.
10. 3D Simulator → pause at the decision → choose A–D → impact ranked by the model. Switch language to **தமிழ்** at any time.

Reset the demo: stop the backend, delete `backend/database/soa.db`, start again.

## Repository

```
data_generator/     synthetic scenario generator (seed 42) + validation
data/synthetic/     40 000 sessions × 68 columns, dictionary, reports
ml/                 features (shared train/serve), training, evaluation, inference
models/             trained artifacts + metadata
backend/            FastAPI app: routes/, services/, database/
training_content/   training modules (triggers, chapters, quizzes; EN/TA)
frontend/           React + Vite UI
docs/               architecture, api, ui_integration, dataset, eda, ml_methodology, project_audit
reports/            model report + metrics
tests/              pytest suites
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| UI shows "Cannot reach the backend" | Start `uvicorn backend.main:app --port 8000` from the repo root |
| `ModuleNotFoundError: backend` | Run uvicorn from the repository root, not from `backend/` |
| PowerShell blocks `Activate.ps1` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Port 8000 busy | `uvicorn backend.main:app --port 8010` and set `VITE_API_URL=http://localhost:8010` in `frontend/.env` |
| Old demo state | Delete `backend/database/soa.db` |

## Limitations

Scripted synthetic telemetry (no machine connection) · task progress on a demo clock (30× real time) · the current shift
session is taken from recorded history · single-process live state · Hindi/Telugu partial · weaker safety performance
on the steep-terrain scenario (documented in the model report).

See `docs/architecture.md`, `docs/api.md`, `docs/ui_integration.md`, `docs/ml_methodology.md`, `CHANGELOG.md`.
