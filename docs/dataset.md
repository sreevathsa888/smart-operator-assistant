# Synthetic dataset — `synthetic_v1.0`

> **This dataset is synthetic and is intended for prototype/model-development purposes. It is not real CAT machine telemetry.**
> No official CAT specification, threshold or algorithm is used or implied. Every range, coefficient and threshold is a project assumption documented in `data_generator/config.py`.

## 1. Why synthetic data

The problem statement shows a small illustrative table of machine/operator data. It is an example of the *kind* of data expected, far too small to train or evaluate models, and we have no access to real fleet telemetry. We therefore generate our own data from an explicit, inspectable causal model. The advantages: every relationship is documented, ground truth is known exactly, the data is reproducible, and hazard scenarios that are rare in reality can be represented in useful numbers. The cost: models learn *our assumptions*, not reality (see §9).

## 2. Reproduce it

```bash
python data_generator/generate_dataset.py   # writes data/synthetic/* (≈3 s)
python data_generator/validation.py         # writes validation_report.md/.json, exit 1 on failure
pytest -q tests/test_dataset.py             # includes a byte-level regeneration check
```

`RANDOM_SEED = 42`. All randomness flows from one `numpy.random.default_rng(42)`; the SHA-256 of the CSV is stored in `dataset_metadata.json` and re-checked by the tests.

## 3. What one row is

**One row = one task session** of one operator on one machine (e.g. "OP1007 excavating 540 t in Zone C on EXC-204"). A row contains:

- **session aggregates** — idle minutes, fuel burn, harsh-event counts, duration;
- a **safety snapshot** — speed, proximity, slope, visibility … at the highest-exposure moment of the session. This is what the safety model scores at run time;
- **ground-truth targets**.

| Size | Value |
|---|---|
| Rows | 40,000 |
| Columns | 68 (every one documented in `data_dictionary.csv`) |
| Operators | 120 (`OP1000`–`OP1119`; `OP1007` = demo operator, 328 sessions) |
| Machines | 40 (24 excavators `EXC-2xx`, 16 wheel loaders `WHL-3xx`; `EXC-204` = demo machine) |
| Period | 180 days from 2026-03-01, three shifts |

40,000 was chosen as the size where per-operator baselines are stable (~330 sessions each) while generation + training stay under a minute on a laptop.

## 4. How the data is generated

```
entities (operators, machines with LATENT traits)
   │
sessions: operator × date × shift × machine (80 % the operator's primary machine)
   │
A  structural categoricals: task → zone → terrain; season → weather; shift → lighting; zone → obstacle
   │
B  scenario CONTEXT effects  (change categories: weather, terrain, obstacle, mode, direction)
   │
C  derive continuous environment from categories (visibility, temperature, ground condition, dust, slope, proximity)
   │
D  scenario INTENSITY effects (change continuous behaviour: speed, idle, load, harsh events, temperatures)
   │
E  machine physics → task execution → fuel → sensor noise → ground-truth targets
```

### Latent operator traits (the basis of the Digital Twin)
Each operator has persistent latent traits: skill, risk propensity, idle habit (min per 2 h of session) and its personal spread, speed factor, fuel habit, control smoothness, harsh-event rate, seatbelt compliance and situational awareness. They are exported to `operators_latent_AUDIT_ONLY.csv` for auditing and **must never be used as model features**. Observable profile fields (skill score, training score, historical efficiency/idle) are *noisy measurements* of these traits.

Demo operator `OP1007`: Intermediate, morning shift, EXC-204, normal idle 16–24 min per 2 h (median 21), generally safe.

### Physical relationships (selected)
- Engine load ← payload %, slope, operating mode, task type.
- Engine / hydraulic temperature ← engine load, ambient temperature, machine health (+ fault offset in overheating).
- Travel speed ← machine type × operator speed habit × terrain/ground/visibility slow-down (skilled operators slow down more in poor visibility).
- Cycle time ← class standard × task × complexity × skill × slope × ground × weather × visibility × health × overload × mode.
- Duration = productive time + stoppages + idle, where idle share = the session's idle behaviour ÷ 120.
- Fuel rate = class burn × engine load × mode × fuel habit, blended with ~28 % burn while idle. Total fuel and t/L follow.

## 5. Scenario logic

Scenarios perturb several linked variables at once. Behavioural scenarios are more likely for operators whose traits make them likely (risk-prone → UNSAFE_OPERATION; low skill → EXCESSIVE_IDLE; skilled → EFFICIENT_OPERATION; heavy-footed → HIGH_FUEL).

| Scenario | Target | Realised | Main effects | HIGH/CRIT share | Anomaly share |
|---|---|---|---|---|---|
| NORMAL_OPERATION | 32 % | 32.3 % | none | 3.9 % | 3.9 % |
| EFFICIENT_OPERATION | 10 % | 9.6 % | idle ↓, smoothness ↑, harsh ↓, Eco mode, fuel ↓, keeps distance | 2.0 % | 1.7 % |
| HIGH_LOAD_OPERATION | 9 % | 9.0 % | payload 92–112 %, Power mode, quantity ↑ → engine load, temps, fuel, duration ↑ | 14.1 % | 3.7 % |
| EXCESSIVE_IDLE | 8 % | 7.5 % | idle ×1.25–2.6 of personal habit → fuel efficiency ↓ | 4.4 % | 88.2 % |
| STEEP_TERRAIN | 8 % | 8.1 % | embankment, slope 14–28°, loose ground → speed ↓, fuel ↑, risk ↑ | 52.3 % | 3.9 % |
| PROXIMITY_HAZARD | 8 % | 8.1 % | worker/vehicle at 0.6–3.4 m, reversing, blind-zone ↑, violations ↑ | 76.8 % | 11.9 % |
| POOR_WEATHER | 6 % | 6.1 % | heavy rain / dust / light rain → visibility ↓, mud/wet ↓, cycle time ↑ | 9.3 % | 3.8 % |
| LOW_VISIBILITY | 5 % | 5.2 % | poor night lighting / fog / dust, visibility 12–42 | 11.5 % | 4.5 % |
| UNSAFE_OPERATION | 5 % | 5.0 % | speed ×1.15–1.7, proximity ↓, slope ↑, harsh ×1.4–3.2, smoothness ↓, seatbelt ↓ | 66.8 % | 97.2 % |
| HIGH_FUEL_CONSUMPTION | 4 % | 4.1 % | fuel ×1.08–1.45 of habit, Power mode | 3.9 % | 88.6 % |
| MACHINE_OVERHEATING | 3 % | 3.1 % | engine +13–24 °C, hydraulic +16–28 °C, health −15–30 | 20.0 % | 3.8 % |
| MULTIPLE_SIMULTANEOUS_RISKS | 2 % | 2.1 % | 2–3 of {proximity, unsafe, steep, weather, visibility, high load} | 80.1 % | 43.8 % |

Changes from the suggested mix: NORMAL 35 → 32 % and MULTIPLE 1 → 2 % (so the combined-risk scenario has >800 rows), HIGH_FUEL 3 → 4 %, OVERHEATING 2 → 3 %, POOR_WEATHER 5 → 6 %.

Independent of scenarios, 2.5 % of sessions receive a random "off-day" deviation (fatigue/distraction) on one behaviour dimension, so anomalies are not a copy of the scenario label.

## 6. Targets

| Target | Definition |
|---|---|
| `Safety_Risk_Score` 0–100 | `100·sigmoid(logit)`; logit = sum of 7 term groups (proximity incl. speed interaction and blind zone, speed, terrain incl. slope×load and ground, load, visibility, machine condition, control/seatbelt) evaluated on **true** values + latent operator awareness + night fatigue + unobserved noise N(0, 0.35). A **project metric**, not a CAT metric. |
| `Safety_Risk_Level` | LOW < 30 ≤ MEDIUM < 55 ≤ HIGH < 75 ≤ CRITICAL (project thresholds). Shares 53.0 / 26.6 / 10.8 / 9.6 %. |
| `Safety_Event`, `Incident_Type` | Bernoulli draw with p = 0.8·sigmoid(2.2·(logit − 1)); event rate 0.3 % LOW → 68.5 % CRITICAL. Type sampled in proportion to the dominant risk term. |
| `Operator_Anomaly`, `Anomaly_Score`, `Anomaly_Reason` | For 6 behaviour dimensions (idle, speed, fuel, control, harsh events, proximity violations) compute this session's deviation from **this operator's own** latent baseline in personal SDs. Anomalous if max z ≥ 3. Score = sigmoid(1.2·(max z − 3)). Reason = argmax dimension. |
| `Task_Completion_Time` | Minutes **remaining** from the snapshot to completion (progress is quantity-based and pace is non-uniform, so remaining ≠ total × (1 − progress)). |
| `Fuel_Efficiency` | Completed tonnes ÷ litres (optional target). |

## 7. Leakage controls

`data_dictionary.csv` assigns each column a role — `ID`, `LATENT`, `RAW`, `DERIVED`, `SESSION_OUTCOME`, `TARGET` — and per-model leakage notes. Key rules:

- **`Scenario` is LATENT — never a feature.** A real machine doesn't report its scenario.
- Safety model: must not use `Safety_Risk_Score`, `Safety_Event`, `Incident_Type`, `Emergency_Stop`.
- Task-time model: must not use `Actual_Task_Duration`, `Idle_Time`, `Load_Cycles`, `Completed_Quantity`, `Total_Fuel_Used`, `Fuel_Consumption`.
- Anomaly model: must not use `Anomaly_Score` / `Anomaly_Reason`; `Operator_Anomaly` is for evaluation only (the detector is unsupervised).
- Validation scans every RAW/DERIVED feature for |Spearman ρ| > 0.95 with any target — none found.
- Models see only the **noisy observed** columns; ground truth uses pre-noise values plus unobserved factors, so perfect accuracy is impossible by design.

## 8. Validation summary (`validation_report.md`)

29/29 checks pass: 0 missing, 0 duplicates, all ranges plausible (speed within class cap, proximity 0.5–20 m, slope 0–30°, positive fuel), logical consistency (completed ≤ target, remaining ≤ total, zone status ↔ distance, incident ↔ event), scenario mix within 0.5 pp of target, 16/16 expected correlation signs, no near-identity leakage.

- **Learnability probe** (gradient boosting, operator-grouped split, 14 features): accuracy ≈ 0.78, macro-F1 ≈ 0.71 vs 0.54 majority baseline — learnable, not trivial. An extended probe with all legitimate features reached 0.81 with only 0.17 % of predictions off by ≥ 2 levels and no CRITICAL→LOW errors: remaining errors are adjacent-level confusions.
- **Personal vs global baseline:** detecting excessive idling via deviation from the operator's own history gives ROC-AUC 0.9997 vs 0.893 for one global threshold. *Caveat:* this is partly by construction (the label is defined against the personal baseline); it shows the design is coherent, not that real-world detection would be this clean.

## 9. Limitations (read before quoting any metric)

1. **Synthetic-data bias.** Models trained here recover the generator's equations. High accuracy on this data says nothing about accuracy on real machines.
2. **Scenario assumptions.** The scenario mix is deliberately hazard-rich (≈ 20 % HIGH/CRITICAL sessions, 10.5 % safety events, 19.6 % behavioural anomalies). Real sites are far less eventful; class priors would need recalibration.
3. **Distribution assumptions.** Ranges, payloads, cycle times and fuel burns are plausible generic values for mid-size equipment, not manufacturer data. Weather seasonality assumes a hot pre-monsoon / monsoon climate.
4. **Independence.** Sessions are independent draws; there is no within-day sequence, fatigue accumulation or machine-to-machine interaction.
5. **Snapshot simplification.** One safety snapshot per session stands in for a continuous telemetry stream.
6. **No real CAT telemetry.** Signal names, units and sampling differ from real machine data buses.
7. **Domain shift.** Deployment would require validation on real telemetry with domain experts, recalibration of thresholds, and monitoring for drift.

## 10. Files

| File | Content |
|---|---|
| `cat_operator_synthetic.csv` | full dataset (40,000 × 68, ≈ 17.6 MB) |
| `cat_operator_synthetic_sample.csv` | 500-row sample for quick inspection |
| `data_dictionary.csv` | column, group, role, type, unit, description, leakage notes, min, max, example |
| `scenario_distribution.csv` | target vs realised share, rows, HIGH/CRITICAL share and anomaly share per scenario |
| `operators.csv`, `machines.csv` | observable entity tables (DB seed) |
| `operators_latent_AUDIT_ONLY.csv` | latent traits — auditing only, never features |
| `correlation_matrix.csv` | Spearman correlations of all numeric columns |
| `validation_report.md` / `.json` | validation results |
| `dataset_metadata.json` | version, seed, shape, SHA-256 |
