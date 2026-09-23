# ML methodology

> All models are trained and evaluated on **synthetic** data (`docs/dataset.md`). Metrics show that the pipeline works and how models compare on this data. They are **not** evidence of real-world performance on CAT machines.
> Full metric tables: `reports/model_report.md` (generated from the deployed artifacts).

## Reproduce

```bash
python data_generator/generate_dataset.py    # dataset (deterministic)
python ml/eda.py                             # docs/eda.md + figures
python ml/train_safety_model.py              # ~40 s
python ml/train_anomaly_model.py             # ~6 s
python ml/train_task_model.py                # ~90 s
python ml/evaluate_models.py                 # reports/model_report.md
pytest                                       # 24 tests (data + models)
```
or `bash scripts/train_all.sh`. Seed 42 everywhere; re-running gives identical metrics.

## Principles

1. **One feature definition.** `ml/features.py` builds every model input. Training and the (upcoming) FastAPI backend import the same functions.
2. **One prediction path.** `ml/inference.py` is the only code that produces predictions. The backend, simulator, what-if, and tests all call it, so the UI cannot show a number that did not come from a trained model.
3. **Leakage is enforced, not just documented.** Each model has a `*_FORBIDDEN` set. `check_no_leakage` raises before training, and `tests/test_models.py` re-checks the saved feature lists. The latent `Scenario` column is never a feature.
4. **Choose on validation, report test once.** Every selection (model, alert thresholds, conformal offset, anomaly threshold) is made without looking at the test data.
5. **Report what happened.** Findings that contradicted expectations are recorded below.

## Splits

| Model | Split | Why |
|---|---|---|
| Safety, task time | **Operator-grouped** 70/15/15 (84/18/18 operators) | Each operator has ~330 sessions with a persistent personal style. A random row split would let a model score well by recognising operators, so test operators are ones the model has never seen. |
| Anomaly | **Time-based**: first 120 days = history, last 60 days = evaluation | This is how a Digital Twin works: learn an operator's normal behaviour, then judge new sessions. |

---

## Model 1 – Safety risk

**Target.** `Safety_Risk_Level` (LOW / MEDIUM / HIGH / CRITICAL).

**Features.** There are 18 numeric and 8 categorical inputs: the live snapshot (speed, proximity, slope, load, visibility, dust, obstacle type, blind-zone entry, travel direction, seatbelt, ground, terrain, lighting, weather), machine condition (health, engine temperature), recent control behaviour (smoothness, harsh-event rate), and operator profile (skill, training score, previous events, shift). Derived features:
- `Inv_Proximity`, the inverse of distance
- `Person_Nearby`, whether the nearest object is a person
- `Is_Reversing`
- `Seatbelt_Off`

**Excluded for leakage.** `Safety_Risk_Score`, `Safety_Event`, `Incident_Type`, `Emergency_Stop`, `Scenario`, and all IDs.

**Candidates (validation log-loss).**

| Candidate | Log-loss | Macro-F1 |
|---|---|---|
| Logistic regression | 0.463 | 0.745 |
| **Logistic regression + hazard interaction terms** | **0.438** | **0.760** |
| Random forest | 0.595 | 0.673 |
| Hist gradient boosting (tuned) | 0.469 | 0.741 |

**Finding.** The linear model beat the tree ensembles. The ground truth is a sigmoid of mostly additive terms, which is exactly logistic regression's form, and the interaction terms (proximity×speed, proximity×blind-zone, slope×load, slope², visibility×proximity, speed²) supply the curvature.

**Caveat.** These terms are domain hazard products and are visible in EDA §2, but they also mirror how the generator was written. On real telemetry the true structure is unknown, and gradient boosting would be the safer default. The training script therefore re-selects automatically on validation log-loss instead of hard-coding the winner.

Selection uses log-loss rather than accuracy because the served score is built from the probabilities, so probability quality matters most.

**The 0–100 risk score (project metric).**
- **Raw index:** Σ P(level) × band midpoint (15, 42.5, 65, 87.5).
- **Why calibrate:** a weighted average of midpoints can only span 15–87.5.
- **Calibration:** an isotonic regression, fitted on training data only, maps the raw index onto the ground-truth risk index. It is monotone and uses the full 0–100 range.
- **Result:** test mean absolute error 5.50 points (6.26 before calibration).

**The level.** The level is the band of the served score, using **alert thresholds 27 / 52 / 72**.
- Ground-truth labels use 30 / 55 / 75.
- The alert thresholds are that set shifted down by the smallest amount that reaches HIGH ∪ CRITICAL recall ≥ 0.90 on validation.
- Because the level is derived from the score, the UI can never show a contradiction such as "52/100 · HIGH". The first version used a cost-sensitive argmax and disagreed with its own score band in 12 % of cases, which is why it was replaced.
- On validation, the band rule matched the cost-sensitive rule's recall with fewer false alarms on LOW sessions.

**Test results (18 unseen operators, 5,855 sessions).**

| Metric | Value |
|---|---|
| Accuracy / macro-F1 | 0.780 / 0.757 |
| ROC-AUC (one-vs-rest, macro) | 0.950 |
| HIGH ∪ CRITICAL recall | **0.896** |
| CRITICAL recall | 0.885 |
| Under-predicted by ≥ 2 levels | 0.02 % |
| CRITICAL predicted LOW | **0** |
| LOW raised to MEDIUM or higher (false alarm) | 19 % – the price of the recall policy |

**Weak spots.** Error analysis by latent scenario shows that STEEP_TERRAIN is worst (accuracy 0.62, under-predicted 12 %), followed by MACHINE_OVERHEATING (0.69). Terrain risk depends on the slope × load × ground-condition interaction, which the snapshot features capture only partly. Possible improvements: a terrain-specific interaction term, or a separate stability sub-model.

**Explanations.** These are **exact Shapley values of the risk score over 7 factor groups**: proximity, speed, terrain, load, visibility, machine, control.
- **Game:** v(S) is the score when the groups in S take their actual values and the other groups take a *typical safe operation* reference (the median or mode of LOW-risk training sessions). Operator profile and shift are held at their actual values.
- **Exactness:** all 2⁷ = 128 coalitions are evaluated in one batch (~30 ms), so the contributions sum exactly to score − reference score. This is verified by a test.
- **Faithfulness:** the reason text shows the actual and reference values ("Proximity 1.7 m (typical safe 10.4 m)"). No explanation text is written by hand.
- **UI fit:** the group keys match the factor keys the existing `WhyPanel` already renders.
- **Why not the `shap` library:** it is not required. Exact computation is cheap at 7 groups, and grouping keeps the explanation human-sized.

**Out-of-distribution warnings.** Every prediction includes `warnings` when an input lies outside the 0.5–99.5 % training range (speed checked per machine type) or uses an unseen category.

---

## Model 2 – Personalised anomaly detection (Operator Digital Twin)

**Behaviour metrics per session.** Seven metrics:
- idle minutes per 2 h
- speed ratio
- fuel ratio
- control roughness (100 − smoothness)
- harsh events per hour
- rapid control inputs per hour
- proximity violations per hour

**Context normalisation.** Speed and fuel are divided by a context-expected value from small gradient-boosting regressors fitted on history, so a steep slope or a heavy load does not look like operator behaviour:
- speed ← slope, visibility, machine type, direction, ground
- fuel ← engine load, machine class, mode, the operator's *historical* idle share

**Personal baseline.** For each operator: the median and a robust standard deviation (1.4826 × median absolute deviation) of every metric over the history period, plus a 10th–90th percentile "typical band" for the UI. Standard deviations are floored at the fleet's 25th percentile so that operators with near-zero variation do not produce inflated z-scores. Operators with fewer than 20 history sessions fall back to the fleet baseline (cold start).

**Detector.** An Isolation Forest on the personal z-score vectors.
- **Pooling:** it is fitted once across operators, which is valid because every z-vector is on a common personal scale.
- **Direction:** "better than usual" deviations are damped, and speed is the only two-sided metric.
- **Threshold:** the alert threshold is the best-F1 point on the labelled history period. This stands in for a small supervisor-reviewed set; the detector itself never trains on labels.

**Evaluation period (last 60 days).**

| Detector | ROC-AUC | PR-AUC | F1 |
|---|---|---|---|
| Global Isolation Forest (raw metrics) | 0.813 | 0.625 | 0.576 |
| Global threshold rule | 0.819 | 0.632 | 0.587 |
| Personal max-z rule | 0.930 | 0.797 | 0.739 |
| **Personal Isolation Forest** | 0.925 | **0.807** | 0.729 |

**Finding.** Personalisation is what matters: PR-AUC rises from about 0.63 to about 0.80. The Isolation Forest adds almost nothing over a simple personal z-rule; it was kept only because PR-AUC was the pre-declared selection criterion.

**Reason agreement.** The top personal deviation matches the true anomaly reason in 76 % of true anomalies.

**Two-operator test.** A test confirms the defining property of the Digital Twin: the *same* idle behaviour is NORMAL for the most idle-heavy operator and UNUSUAL for the least.

**Demo operator.** OP1007's learned idle band is 17.2–25.2 min per 2 h.

---

## Model 3 – Task completion time

There are two regressors:
- **Remaining** minutes for in-progress tasks (target `Task_Completion_Time`).
- **Total** minutes for pending tasks (`Actual_Task_Duration` is used *only as a target*, with pre-start features).

**Excluded for leakage.** `Actual_Task_Duration` (as a feature), `Idle_Time`, `Load_Cycles`, `Completed_Quantity`, fuel totals, and session event counts.

| Test (unseen operators) | Remaining | Total |
|---|---|---|
| Planner rule, no ML (MAE) | 28.4 min | 56.4 min |
| **Gradient boosting, log target (MAE)** | **11.1 min** | **20.3 min** |
| R² | 0.923 | 0.886 |
| 80 % range – empirical coverage | 79.2 % | 79.9 % |

**Finding.** Unlike the safety model, gradient boosting clearly beats the linear model here: validation MAE 11.0 vs 16.3 for remaining time. Duration is multiplicative across many factors, and the log target helps.

**Expected range.** Quantile gradient boosting (10th and 90th percentiles) fitted on training data, then widened by a split-conformal offset computed on validation (conformalised quantile regression). This is the mathematical justification the brief asked for before showing a range, and test coverage confirms the 80 % target.

---

## What the synthetic setting cannot tell us

- The models recover the generator's assumptions. Real telemetry would have different structure, noise, and class priors.
- The data is hazard-rich (about 20 % HIGH or CRITICAL). On a real site the alert thresholds and anomaly threshold would need recalibration to the real base rates.
- Anomaly labels are *defined* against personal baselines, which flatters personalised detectors. The ordering (personal > global) is expected to hold on real data, but the size of the gap is not.
- Deployment would require validation on real machine data, domain-expert review of the risk index and thresholds, and drift monitoring.

## Flags for the UI-integration phases

- **Out-of-range demo values.** The existing demo event (`useLiveScenario.js` ALERT state) runs an excavator at 6.8 km/h, but training excavators reach about 4.3 km/h (99.5th percentile). The model returns an extrapolation warning. The demo should use in-range values (for example, an excavator at 3.8 km/h) or a wheel loader.
- **"Resolved" state.** The UI shows "resolved" after stopping. The model says risk stays HIGH (about 68) while a worker remains 2.6 m away in the blind zone on an 11° slope, because stopping removes the speed factor but not the proximity factor. The UI should show "risk reducing – worker still in zone" until the distance increases, rather than presenting a fixed resolved state.
- **Fourth risk level.** The UI needs a `critical` level. The Tailwind palette already has a `critical` colour token, but `lib/risk.js` (`LEVEL_COLOR`, `LEVEL_TW`, `levelOf`) and the i18n `lvl.*` keys only know low / medium / high, and currently map red to `high`.
