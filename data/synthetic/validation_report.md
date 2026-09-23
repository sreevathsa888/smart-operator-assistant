# Dataset validation report

> Synthetic prototype data — not real CAT machine telemetry.

**Result: PASS** — 29 pass, 0 warn, 0 fail

## Checks

| Check | Status | Detail |
|---|---|---|
| row_count | PASS | 40,000 rows (expected 40,000) |
| column_count | PASS | 68 columns (dictionary 68) |
| dictionary_sync | PASS | every column documented |
| missing_values | PASS | 0 missing cells (0.0000%) |
| duplicate_rows | PASS | 0 exact duplicates |
| duplicate_rows_excluding_ids | PASS | 0 duplicates ignoring ids |
| unique_ids | PASS | Record_ID and Task_ID unique |
| value_ranges | PASS | all 27 range-constrained columns within bounds |
| speed_within_machine_class | PASS | 0 over class cap |
| positive_fuel | PASS | fuel strictly positive |
| completed_le_target | PASS | Completed_Quantity ≤ Target_Quantity |
| remaining_le_actual | PASS | remaining time ≤ total duration |
| incident_iff_event | PASS | Incident_Type set exactly when Safety_Event=1 |
| reason_iff_anomaly | PASS | Anomaly_Reason set exactly when anomalous |
| zone_status_consistent | PASS | Safety_Zone_Status matches distance thresholds |
| task_machine_compatibility | PASS | every task type is valid for its machine type |
| blind_zone_only_people_vehicles | PASS | 0 blind-zone entries by static objects |
| risk_level_matches_score | PASS | level = binned score |
| demo_entities_present | PASS | OP1007 sessions: 328, EXC-204 sessions: 1839 |
| scenario_distribution | PASS | max |realised − target| = 0.0049 |
| all_scenarios_present | PASS | 12 / 12 scenarios |
| risk_class_balance | PASS | {'LOW': 0.5298, 'MEDIUM': 0.266, 'HIGH': 0.1084, 'CRITICAL': 0.0958} |
| event_rate_plausible | PASS | Safety_Event rate 10.527% |
| anomaly_rate_plausible | PASS | Operator_Anomaly rate 19.625% |
| expected_correlation_signs | PASS | 16/16 relationships have the expected sign |
| no_feature_target_near_identity | PASS | no RAW/DERIVED feature has |ρ|>0.95 with a target |
| safety_target_learnable | PASS | probe acc 0.7805 vs majority 0.5432 |
| safety_target_not_trivial | PASS | probe acc 0.7805 (<0.97 ⇒ not trivially separable) |
| personal_baseline_beats_global | PASS | {'auc_global_idle_rate': 0.8926, 'auc_personal_z': 0.9997, 'n': 35023, 'positives': 2873} |

## Shape

Rows: **40,000**  
Columns: **68**  
Operators: 120  
Machines: 40  
Date span: 2026-03-01 06:01 → 2026-08-28 03:24  
Missing values: 0.00%  
Duplicate rows: 0

## Safety risk classes

| Level | Share | Rows | Safety_Event rate |
|---|---|---|---|
| LOW | 53.0% | 21192 | 0.3% |
| MEDIUM | 26.6% | 10642 | 4.5% |
| HIGH | 10.8% | 4335 | 23.9% |
| CRITICAL | 9.6% | 3831 | 68.5% |

## Scenario distribution

| Scenario | Target_Share | Realised_Share | Rows | Critical_or_High_Share | Anomaly_Share |
|---|---|---|---|---|---|
| NORMAL_OPERATION | 0.32 | 0.323 | 12920 | 0.039 | 0.039 |
| EFFICIENT_OPERATION | 0.1 | 0.0958 | 3831 | 0.02 | 0.017 |
| HIGH_LOAD_OPERATION | 0.09 | 0.09 | 3602 | 0.141 | 0.037 |
| EXCESSIVE_IDLE | 0.08 | 0.0751 | 3004 | 0.044 | 0.882 |
| STEEP_TERRAIN | 0.08 | 0.0806 | 3224 | 0.523 | 0.039 |
| PROXIMITY_HAZARD | 0.08 | 0.0808 | 3232 | 0.768 | 0.119 |
| POOR_WEATHER | 0.06 | 0.0606 | 2425 | 0.093 | 0.038 |
| LOW_VISIBILITY | 0.05 | 0.0516 | 2065 | 0.115 | 0.045 |
| UNSAFE_OPERATION | 0.05 | 0.0501 | 2005 | 0.668 | 0.972 |
| HIGH_FUEL_CONSUMPTION | 0.04 | 0.0407 | 1629 | 0.039 | 0.886 |
| MACHINE_OVERHEATING | 0.03 | 0.031 | 1242 | 0.2 | 0.038 |
| MULTIPLE_SIMULTANEOUS_RISKS | 0.02 | 0.0205 | 821 | 0.801 | 0.438 |

## Other targets

| Target | Summary |
|---|---|
| Safety_Event | 10.53% of sessions |
| Operator_Anomaly | 19.62% of sessions |
| Anomaly_Reason | Excessive_Idle: 2873, Abnormal_Fuel: 1679, Unusual_Speed: 1408, Erratic_Control: 774, Repeated_Harsh_Events: 755, Repeated_Proximity_Violations: 361 |
| Incident_Type | Stability_Loss: 1405, Proximity_Near_Miss: 1344, Harsh_Maneuver: 552, Vehicle_Interaction: 501, Loss_of_Traction: 249, Overheating_Shutdown: 133, Obstacle_Contact: 27 |
| Task_Completion_Time (min) | mean 93.2, median 76.2, p5 13.5, p95 233.1 |
| Actual_Task_Duration (min) | mean 187.0, median 168.3, p5 72.2, p95 368.5 |
| Safety_Risk_Score | mean 35.1, median 28.1, p5 7.7, p95 86.5 |
| Fuel_Efficiency (t/L) | mean 13.9, median 13.2, p5 6.9, p95 23.4 |

## Expected relationships (Spearman ρ)

| Feature | Target | Expected | ρ | Result |
|---|---|---|---|---|
| Proximity_Distance | Safety_Risk_Score | − | -0.362 | OK |
| Machine_Speed | Safety_Risk_Score | + | 0.33 | OK |
| Ground_Slope | Safety_Risk_Score | + | 0.415 | OK |
| Visibility | Safety_Risk_Score | − | -0.222 | OK |
| Blind_Zone_Entry | Safety_Risk_Score | + | 0.386 | OK |
| Control_Smoothness | Safety_Risk_Score | − | -0.252 | OK |
| Load_Percentage | Engine_Load_Percentage | + | 0.461 | OK |
| Engine_Load_Percentage | Fuel_Consumption | + | 0.513 | OK |
| Engine_Load_Percentage | Hydraulic_Temperature | + | 0.595 | OK |
| Ambient_Temperature | Engine_Temperature | + | 0.513 | OK |
| Machine_Health_Score | Engine_Temperature | − | -0.425 | OK |
| Target_Quantity | Actual_Task_Duration | + | 0.752 | OK |
| Operator_Skill_Score | Historical_Efficiency | + | 0.689 | OK |
| Idle_Time | Fuel_Efficiency | − | -0.16 | OK |
| Safety_Risk_Score | Safety_Event | + | 0.47 | OK |
| Current_Task_Progress | Task_Completion_Time | − | -0.771 | OK |

## Outliers (1.5×IQR, informational)

| Column | Outliers | Share |
|---|---|---|
| Machine_Speed | 29 | 0.07% |
| Proximity_Distance | 0 | 0.00% |
| Ground_Slope | 2104 | 5.26% |
| Engine_Temperature | 1397 | 3.49% |
| Hydraulic_Temperature | 1384 | 3.46% |
| Fuel_Consumption | 473 | 1.18% |
| Idle_Time | 2375 | 5.94% |
| Actual_Task_Duration | 1256 | 3.14% |
| Load_Percentage | 1819 | 4.55% |
| Visibility | 0 | 0.00% |

Outliers are intentional: they come from hazard scenarios (e.g. overheating, steep terrain, excessive idle), not from generation errors. Range checks above confirm none are physically impossible.

## Learnability probe

HistGradientBoosting on 14 snapshot features, operator-grouped 80/20 split: accuracy **0.7805**, macro-F1 **0.7083** vs majority-class baseline 0.5432. Learnable, but not trivially separable — the ground truth depends on true (pre-sensor-noise) values and unobserved factors.
This is a data-quality probe only; the real model and its evaluation are produced in the ML phase.

## Why a personal baseline (Digital Twin evidence)

Detecting *Excessive_Idle* anomalies (2873 positives among 35023 sessions):

- one global idle-rate threshold: ROC-AUC **0.8926**
- deviation from the operator's own baseline: ROC-AUC **0.9997**

Operators have different normal idle habits (e.g. a loader operator waiting on trucks), so a single threshold confuses 'idle-heavy but normal for them' with 'unusual for them'.
