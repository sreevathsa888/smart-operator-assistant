# Current project audit (Phase 0)

Audited: `smart-operator-assistant.zip` (frontend) and `cat_operator_immersive_ui_skill.zip` (design skill).
Baseline: `npm ci && npm run build` **succeeds** (Vite 5, 2 chunks ≈ 850 kB each — pre-existing size warning).

## A. Existing architecture

Frontend-only React 18 + Vite 5 SPA. No backend, no database, no ML.

| Layer | Implementation |
|---|---|
| Routing | Hash routing in `App.jsx` (`#overview`, `#safety`, …), 10 routes defined in `Shell.jsx` `ROUTES` |
| Styling | Tailwind 3 with custom tokens (`tailwind.config.js`): cab-dark surfaces, signal ramp safe → caution → elevated → critical, `assist` cyan for the assistant's voice. Fonts: Barlow Condensed / Barlow / JetBrains Mono |
| Motion | framer-motion (page transitions, alert slide-in, bar animations) |
| Charts | recharts (Analytics) + hand-built SVG (ArcGauge, RiskRadar, Sparkline, SpeedCurve) |
| 3D | @react-three/fiber + drei + three (Simulator, lazy-loaded) |
| i18n | `lib/i18n.jsx` context; EN + Tamil complete, Hindi + Telugu partial with EN fallback |
| State | Local `useState` + two hooks: `useLiveScenario` (demo event state machine), `useTelemetry` (1 Hz random walk) |
| Data layer | `api/client.js` — a mock/real switch (`VITE_USE_MOCK`) **that no screen currently calls** |

## B. Existing UI (screens)

Overview · Live Machine · Tasks · Safety Center · Operator Twin · Training Hub (+ Microlearning player) · 3D Simulator · Safety Replay · What-if · Analytics. Global `InterventionAlert` overlay with VIEW WHY / SIMULATE SAFER ACTION / TAKE ACTION / DISMISS already designed.

## C. Reusable components (`components/ui/index.jsx` + others)

`Panel`, `PanelHeader`, `StatusPill`, `AnimatedNumber`, `ArcGauge`, `RiskRadar`, `Sparkline`, `ScenarioSlider`, `BaselineBand`, `Disclaimer`, `KV`, `ScreenTitle`, `useInterval`, `useStepper`, `MachinePlan` (top-down zones), `InterventionAlert` + `WhyPanel`, `Sidebar`/`Header`/`MobileNav`.
These will be reused as-is; no duplicates will be created.

## D. What works today (visually, on mock data)

The full demo story is clickable end-to-end: demo event → alert → why → what-if → simulator decision → replay → training quiz → twin. The design, interactions, disclaimers and accessibility (text + icon + colour for levels) are in place.

## E. What is missing (the gap this project closes)

| Gap | Where |
|---|---|
| Every screen imports `data/mock.js` directly; `api/client.js` is unused | Overview, Tasks, Twin, Training, Replay, Analytics |
| Risk is a hand-written JS formula (`lib/risk.js computeRisk`) called in 3 places — not a trained model | `useLiveScenario`, `Simulator`, `WhatIf` (WhatIf calls it ~100× per render for the speed curve) |
| Only 3 risk levels (low/medium/high); spec requires LOW/MEDIUM/HIGH/CRITICAL | `lib/risk.js`, i18n `lvl.*` keys |
| Hardcoded ETA text `2h 18m` / `2h 05m – 2h 35m` | `Overview.jsx` (not even read from mock) |
| Alert "why this matters" bullets are fixed i18n strings, not derived from the prediction | `InterventionAlert.jsx` (`alert.r1–r3`) |
| Twin baselines, anomalies, training reasons are static | `mock.twin`, `mock.analytics.anomalies`, `mock.trainingModules` |
| No backend, DB, dataset, models, tests, loading/error states | — |

## F. Files that should remain untouched

`tailwind.config.js`, `index.css`, `components/ui/index.jsx`, `components/MachinePlan.jsx`, `components/Shell.jsx`, `lib/i18n.jsx` (additive keys only), `vite.config.js`, `postcss.config.js`, the 3D scene geometry inside `Simulator.jsx`, all visual markup in screens.

## G. Files that need (small, controlled) modification

| File | Change | Why |
|---|---|---|
| `api/client.js` | real endpoint paths, batch risk call, error propagation | single data seam |
| `lib/risk.js` | keep colours/level helpers, add `critical`; `computeRisk` becomes offline fallback only, clearly labelled | no fake ML, 4 levels |
| `hooks/useLiveScenario.js`, `hooks/useTelemetry.js` | pull risk from `/api/simulation/risk`, telemetry from backend stream | same model everywhere |
| Screens (Overview, Tasks, Twin, Training, Replay, WhatIf, Simulator, Analytics) | replace `mock` imports with a `useApi` hook + loading/error/empty states | real data |
| `InterventionAlert.jsx` | "why this matters" bullets from model contributions | explanation from the model |
| `lib/i18n.jsx` | add `lvl.critical`, `lvl.short.critical` (+ ta/hi/te) | 4th level |

## H. New files required

`data_generator/`, `data/`, `ml/`, `models/`, `backend/` (FastAPI), `training_content/training_modules.json`, `tests/`, `docs/`, `frontend/src/hooks/useApi.js`, `README.md`, `CHANGELOG.md`, `.env.example`, `requirements.txt`.

## I. Recommended order

1 data generator → 2 run → 3 validate (**done in this phase**) → 4 EDA/features → 5 safety model → 6 anomaly model → 7 task model → 8 FastAPI → 9–13 wire screens one at a time (Overview/Tasks first, then Twin, Safety Center + alert, Training) → 14 Simulator → 15 Replay → 16 What-if → 17 E2E → 18 polish.

## Repository layout decision

The existing app is moved **unchanged** from `cat-operator-assistant/` to `frontend/` so it sits beside `backend/`, `ml/` and `data/`. No file inside it is modified in Phase 1.
