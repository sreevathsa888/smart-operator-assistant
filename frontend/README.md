# Smart Operator Assistant — frontend prototype

An intelligent operator companion for excavator / loader operators, built around **PREDICT → EXPLAIN → SIMULATE → LEARN**.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build → dist/
npm run build:single # one self-contained HTML file → dist-single/index.html
```

Node 18+ recommended. No backend needed — everything runs on synthetic data.

## Demo script (≈3 minutes for an evaluator)

1. **Overview** — task progress + ETA range, safety gauge, live machine plan, operator twin.
2. Press **DEMO EVENT** (top right). A worker walks into the rear-left blind zone; risk climbs and the **intervention panel** slides in.
3. **VIEW WHY** → risk contribution bars (proximity is the top driver).
4. **SIMULATE SAFER ACTION** → **What-if** opens pre-loaded with the live event; drag sliders or press *Suggest*.
5. **Safety Center** → run the event again to see the radar, trajectory + 10 s forecast and **TAKE ACTION**.
6. **Operator Twin** → behavior compared with the operator's *own* baseline band (UNUSUAL idle + speed).
7. **Training Hub** → recommended modules explain *why* they're recommended. Watch *Blind-Zone Awareness*, switch subtitles to **தமிழ்**, finish the quick check → twin score updates.
8. **3D Simulator** → *Start scenario* → "What would you do?" → decision analysis. Toggle **Cab view** to see why the blind zone matters.
9. **Safety Replay** → play the 17 Sep event; click timeline nodes to scrub.
10. **Analytics** — line, area, bar, heatmap, radar.

## Structure

```
src/
  App.jsx                    shell, hash routing, global alert overlay
  api/client.js              data layer (mock today, FastAPI tomorrow)
  data/mock.js               synthetic data shaped like the API responses
  lib/risk.js                explainable risk model (score, level, contributions)
  lib/i18n.jsx               EN + Tamil complete; Hindi + Telugu partial
  hooks/useLiveScenario.js   shared live situation + demo event state machine
  hooks/useTelemetry.js      simulated 1 Hz telemetry stream
  components/
    ui/index.jsx             Panel, StatusPill, ArcGauge, RiskRadar, Sparkline, ScenarioSlider, BaselineBand…
    MachinePlan.jsx          top-down machine with restricted / proximity / blind zones
    InterventionAlert.jsx    intelligent alert + WhyPanel
    Shell.jsx                sidebar, header, mobile nav
  screens/                   Overview, LiveMachine, Tasks, SafetyCenter, OperatorTwin,
                             TrainingHub, Microlearning, Simulator (R3F), SafetyReplay, WhatIf, Analytics
```

## Connecting the FastAPI backend

Set `VITE_USE_MOCK=false` and `VITE_API_URL=http://localhost:8000`. Expected endpoints (shapes = `src/data/mock.js`):

| Endpoint | Returns |
| --- | --- |
| `GET /operators/{id}` | operator profile |
| `GET /machines/{id}` | machine info |
| `GET /tasks/today?operator=` | task list with `eta {pointMin, lowMin, highMin, confidence}` |
| `GET /operators/{id}/twin` | scores, lastWeek, baselineBands, history |
| `GET /training/modules?operator=` | modules with `status` + `reason` |
| `GET /events/{id}/replay` | keyframes |
| `GET /analytics/summary?range=30d` | chart series |
| `POST /risk/predict` | `{ score, level, contributions:[{key, value, pct}] }` |

Swap `lib/risk.js` for the model's `/risk/predict` output — every screen already renders `contributions`, so explanations work unchanged (e.g. SHAP values).

## Design system

Tokens live in `tailwind.config.js` and mirror the **Smart Operator Assistant** design system: cab-dark surfaces, signal ramp safe → caution → elevated → critical, `assist` cyan reserved for the assistant's own voice (predictions, explanations, simulations). Type: Barlow Condensed (display), Barlow (UI), JetBrains Mono (live numbers).

All what-if and simulator outputs are labelled *Scenario simulation — not a guarantee of real-world outcome.*
