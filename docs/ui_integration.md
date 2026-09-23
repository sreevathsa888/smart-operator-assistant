# UI integration

The existing interface was kept (layout, components, colours, typography, motion). Only its **data sources** changed:
`src/data/mock.js` and the browser formula `computeRisk()` were deleted; every number now comes from the API.

## Screen → data source

| Screen | Endpoint(s) | What is model-driven |
|---|---|---|
| Login (new, minimal) | `/api/operators`, `/api/operator/{id}` | – |
| Overview | `/api/dashboard`, live telemetry | safety = 100 − predicted risk; task ETA + 80 % range (task model); twin scores; factor rows coloured by Shapley points |
| Live Machine | live telemetry (+ history), `/api/twin` | status from project thresholds; idle vs *personal* band (anomaly model) |
| Tasks | `/api/tasks`, start/complete | ETAs (total/remaining), range, distribution, drivers (model counterfactuals), Gantt |
| Safety Center | live telemetry, `/api/meta`, `/api/safety/events` | risk, level, radar (isolated per-factor effects), 5 s forecast line, reasons, alert |
| Intervention alert | live telemetry | title/recommendation by the model's top factor; reasons with points; forecast |
| Operator Twin | `/api/twin` | baseline bands + UNUSUAL/NORMAL from the anomaly model; insights from the operator's sessions |
| Training Hub / Microlearning | `/api/training/*` | recommendations from trigger rules over real metrics; quiz updates the training score |
| 3D Simulator | `/api/simulation/risk` (throttled), `/api/simulation/decision` | risk gauge; decision impact ranking |
| Safety Replay | `/api/safety/events`, `/api/safety/replay/{id}` | recorded model-scored frames; markers + findings derived from them |
| What-if | `/api/simulation/risk` (one batch of 56 scenarios) | both gauges, difference, biggest lever, risk-vs-speed curves, out-of-range warnings |
| Analytics | `/api/analytics` | all charts; hotspot computed from the heatmap |

## Risk levels

The model has four levels; the design system had three signal colours for risk plus an *elevated* orange token.
Mapping: LOW → safe green · MEDIUM → caution amber · **HIGH → elevated orange** · **CRITICAL → critical red**.
The `high` pill variant now uses the elevated token (it previously reused red).

## States
`components/ApiState.jsx` provides skeleton loading, error (with Retry) and empty states in the app's own style.
The whole app shows an error panel with the start command if the backend is unreachable; the header shows Online/Offline.

## Live updates
`hooks/useLiveScenario.js` polls `/api/telemetry` every 500 ms (the model scores frames at the same rate).
`MachinePlan` already animates the worker between positions, so 2 Hz data looks smooth. Sliders use a debounced
(What-if) or throttled (Simulator, ≤ 4 req/s, latest-wins) model hook.

## Still illustrative (by design)
- Microlearning animations (worker path in the blind-zone lesson, idle/slope HUDs) are teaching visuals, not predictions.
- The 3D scene's motion and the drawn "zone" radius are visual; the risk shown next to them comes from the model.
- The training content is project-written guidance, not official CAT procedure.

## Languages
English and Tamil are complete for all operator-facing text, including model reasons (rebuilt from structured values).
Hindi and Telugu are partial (marked PARTIAL in the language menu) and fall back to English.
