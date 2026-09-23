"""Inference services – the ONLY place predictions are produced.

The FastAPI backend, the 3D simulator endpoint, the what-if endpoint and the tests all call these
classes, so the UI can never show a number that did not come from a trained model.
"""
import math
import os
import sys
from functools import lru_cache
from itertools import combinations

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ml.common import load_artifact  # noqa: E402
from ml import features as F  # noqa: E402


# ====================================================================== SAFETY
class SafetyPredictor:
    """predict(inputs) → score 0–100, level, probabilities, and (optionally) an exact group-Shapley explanation.

    `inputs` may use dataset column names or the frontend aliases {speed, distance, load, slope, visibility}.
    Omitted fields fall back to the caller's `context` (e.g. the machine's live snapshot) and then to the
    training-set typical values stored in the artifact – every fallback is reported in `filled_defaults`.
    """

    def __init__(self):
        art, self.meta = load_artifact("safety_model")
        self.model = art["model"]
        self.levels = art["levels"]
        self.cuts = np.asarray(art["alert_cuts"], float)
        self.mid = np.asarray(art["midpoints"], float)
        self.cal = art["calibrator"]
        self.ref = art["reference_state"]
        self.typical = art["typical_inputs"]
        self.raw_inputs = art["raw_inputs"]
        self.ranges, self.speed_by_type, self.categories = art["input_ranges"], art["speed_range_by_type"], art["categories"]
        self.groups = F.SAFETY_RAW_GROUPS
        self._classes = list(self.model.classes_)
        self._order = [self._classes.index(l) for l in self.levels]
        n = len(self.groups)
        # all 2^n coalitions as boolean masks + Shapley weights
        self._coal = np.array([[(m >> i) & 1 for i in range(n)] for m in range(2 ** n)], bool)
        self._w = np.array([math.factorial(k) * math.factorial(n - k - 1) / math.factorial(n) for k in range(n)])

    # ---------------------------------------------------------------- input handling
    def _complete(self, inputs: dict, context: dict | None = None):
        row, filled = {}, []
        src = {F.SAFETY_ALIASES.get(k, k): v for k, v in (inputs or {}).items()}
        ctx = {F.SAFETY_ALIASES.get(k, k): v for k, v in (context or {}).items()}
        for c in self.raw_inputs:
            if c in src and src[c] is not None:
                row[c] = src[c]
            elif c in ctx and ctx[c] is not None:
                row[c] = ctx[c]
            else:
                row[c] = self.typical[c]; filled.append(c)
        if row["Seatbelt_Status"] in (True, False):
            row["Seatbelt_Status"] = "Fastened" if row["Seatbelt_Status"] else "Unfastened"
        return row, filled

    def _frame(self, rows) -> pd.DataFrame:
        """Explicit dtypes: numeric inputs float, categorical inputs str (JSON ints must not fix a column to int)."""
        raw = pd.DataFrame(list(rows))[self.raw_inputs]
        for c in self.raw_inputs:
            if isinstance(self.typical[c], str):
                raw[c] = raw[c].astype(str)
            else:
                raw[c] = pd.to_numeric(raw[c], errors="raise").astype(float)
        return raw

    def _warnings(self, row):
        """Inputs outside the training data: the model is extrapolating and the caller should be told."""
        w = []
        for c, (lo, hi) in self.ranges.items():
            v = float(row[c])
            if c == "Machine_Speed":
                lo, hi = self.speed_by_type.get(row["Machine_Type"], (lo, hi))
            if v < lo - 1e-9 or v > hi + 1e-9:
                w.append(f"{c}={v:g} is outside the training range {lo:.3g}–{hi:.3g}"
                         + (f" for {row['Machine_Type']}" if c == "Machine_Speed" else "") + "; prediction is an extrapolation.")
        for c, allowed in self.categories.items():
            if str(row[c]) not in allowed:
                w.append(f"{c}='{row[c]}' was not seen in training.")
        return w

    def _proba(self, raw: pd.DataFrame) -> np.ndarray:
        return self.model.predict_proba(F.safety_frame(raw))[:, self._order]

    def _score(self, P):
        return self.cal.predict(P @ self.mid)

    def _level(self, score):
        return np.array(self.levels)[np.digitize(score, self.cuts)]

    # ---------------------------------------------------------------- public
    def predict(self, inputs, context=None, explain=True):
        single = isinstance(inputs, dict)
        items = [inputs] if single else list(inputs)
        rows, fills = zip(*[self._complete(i, context) for i in items])
        raw = self._frame(rows)
        P = self._proba(raw)
        score = self._score(P)
        level = self._level(score)
        expl = self._explain(raw) if explain else [None] * len(raw)
        out = []
        for i in range(len(raw)):
            r = dict(score=round(float(score[i]), 1), level=str(level[i]),
                     probabilities={l: round(float(P[i, k]), 4) for k, l in enumerate(self.levels)},
                     filled_defaults=list(fills[i]), warnings=self._warnings(raw.iloc[i]),
                     model_version=self.meta["version"])
            if expl[i] is not None:
                r.update(expl[i])
            out.append(r)
        return out[0] if single else out

    def score_frame(self, df: pd.DataFrame) -> np.ndarray:
        """Score dataset-shaped rows (e.g. historical sessions) in one call."""
        return np.round(self._score(self.model.predict_proba(F.safety_frame(df))[:, self._order]), 1)

    def level_of(self, scores):
        return self._level(np.asarray(scores, float))

    def score_batch(self, inputs, context=None):
        """Fast path for curves / sliders: scores only, no explanation."""
        rows = [self._complete(i, context)[0] for i in inputs]
        s = self._score(self._proba(self._frame(rows)))
        return [dict(score=round(float(v), 1), level=str(l)) for v, l in zip(s, self._level(s))]

    # ---------------------------------------------------------------- explanation
    def _explain(self, raw: pd.DataFrame):
        """Exact Shapley values of the risk SCORE over the 7 factor groups.

        Game: v(S) = score when groups in S take the actual values and the other groups take the
        'typical safe operation' reference (context fields always actual). φ sums exactly to
        score(actual) − score(reference). 128 model evaluations per record, batched.
        """
        names = list(self.groups)
        n, B, M = len(names), len(raw), len(self._coal)
        big = raw.loc[raw.index.repeat(M)].reset_index(drop=True)
        mask = np.tile(self._coal, (B, 1))
        for gi, g in enumerate(names):
            off = ~mask[:, gi]
            for c in self.groups[g]:
                big.loc[off, c] = self.ref[c]
        v = self._score(self._proba(big)).reshape(B, M)
        out = []
        for b in range(B):
            phi = np.zeros(n)
            for i in range(n):
                with_i = self._coal[:, i]
                sizes = self._coal[~with_i].sum(1)
                idx_without = np.flatnonzero(~with_i)
                idx_with = idx_without | (1 << i)            # coalition index = bitmask
                phi[i] = np.sum(self._w[sizes] * (v[b, idx_with] - v[b, idx_without]))
            base = float(v[b, 0])
            pos = phi.clip(min=0).sum() or 1.0
            contrib = []
            for i, g in enumerate(names):
                col, unit = F.GROUP_HEADLINE[g]
                alone = float(v[b, 1 << i] - base)             # this factor alone, others at the safe reference
                contrib.append(dict(key=g, points=round(float(phi[i]), 2), pct=int(round(100 * max(phi[i], 0) / pos)),
                                    isolated=round(max(0.0, 100 * alone / max(1e-6, 100 - base)), 1),
                                    direction="raises" if phi[i] > 0.25 else "lowers" if phi[i] < -0.25 else "neutral",
                                    value=_fmt(raw.iloc[b][col]), reference=_fmt(self.ref[col]), unit=unit))
            contrib.sort(key=lambda c: -c["points"])
            out.append(dict(baseline_score=round(base, 1), contributions=contrib,
                            reasons=[_reason(c) for c in contrib if c["direction"] == "raises"][:4],
                            explanation_method="exact group Shapley vs typical low-risk operation"))
        return out


def _fmt(v):
    return round(float(v), 1) if isinstance(v, (int, float, np.integer, np.floating)) else v


REASON = {
    "proximity": "Proximity {value} {unit} (typical safe {reference} {unit})",
    "speed": "Machine speed {value} {unit} (typical safe {reference} {unit})",
    "terrain": "Ground slope {value}{unit} (typical safe {reference}{unit})",
    "load": "Load {value}{unit} of rated payload (typical safe {reference}{unit})",
    "visibility": "Visibility {value}{unit} (typical safe {reference}{unit})",
    "machine": "Machine health {value}{unit} (typical safe {reference}{unit})",
    "control": "Control smoothness {value}{unit} (typical safe {reference}{unit})",
}


def _reason(c):
    return dict(key=c["key"], points=c["points"], text=REASON[c["key"]].format(**c))


@lru_cache(maxsize=1)
def safety() -> SafetyPredictor:
    return SafetyPredictor()


# ====================================================================== PERSONAL ANOMALY / DIGITAL TWIN
class AnomalyDetector:
    """analyze(session) → personal deviation of one session (live: pass elapsed minutes as Actual_Task_Duration).

    Required session fields: Operator_ID, Idle_Time, Actual_Task_Duration, Control_Smoothness, Harsh_Acceleration,
    Harsh_Braking, Rapid_Control_Input, Proximity_Violations, Machine_Speed, Fuel_Consumption, Historical_Idle_Time
    and the context fields Ground_Slope, Visibility, Machine_Type, Travel_Direction, Ground_Condition,
    Engine_Load_Percentage, Machine_Model_Class, Operating_Mode.
    """

    def __init__(self):
        art, self.meta = load_artifact("anomaly_model")
        self.a = art
        self.dims = art["behaviour"]

    def _behaviour(self, df):
        from ml.train_anomaly_model import behaviour
        return behaviour(df, self.a["speed_model"], self.a["fuel_model"])

    def _z(self, B, ops):
        from ml.train_anomaly_model import personal_z
        return personal_z(B, ops, self.a["baselines"], self.a["fleet"], self.a["floors"])

    def analyze(self, sessions):
        single = isinstance(sessions, dict)
        df = pd.DataFrame([sessions] if single else list(sessions))
        B = self._behaviour(df)
        Z = self._z(B, df["Operator_ID"].astype(str))
        s = -self.a["isolation_forest"].score_samples(Z[self.dims])
        ref = self.a["ref_scores"]
        out = []
        for i in range(len(df)):
            op = str(df["Operator_ID"].iloc[i])
            known = op in self.a["baselines"].index and self.a["baselines"].loc[op, "n"] >= self.a["min_sessions"]
            devs = []
            for d in self.dims:
                label, unit, reason = self.a["labels"][d]
                lo, hi = self._band(op, d, known)
                devs.append(dict(metric=d, label=label, unit=unit, current=round(float(B[d].iloc[i]), 2),
                                 typical_low=round(lo, 2), typical_high=round(hi, 2), z=round(float(Z[d].iloc[i]), 2),
                                 deviation=round(float(B[d].iloc[i] - (lo + hi) / 2), 2), reason_code=reason))
            devs.sort(key=lambda x: -x["z"])
            unusual = bool(s[i] >= self.a["threshold"])
            top = devs[0]
            out.append(dict(
                operator_id=op, status="UNUSUAL" if unusual else "NORMAL",
                anomaly_score=round(float(np.searchsorted(ref, s[i]) / len(ref)), 3),   # percentile vs history
                raw_score=round(float(s[i]), 4), threshold=round(float(self.a["threshold"]), 4),
                baseline_source="personal" if known else "fleet (cold start)",
                reason_code=top["reason_code"] if unusual else "Normal",
                reason=(f"{top['label']} is {top['current']} {top['unit']} vs this operator's typical "
                        f"{top['typical_low']}–{top['typical_high']} {top['unit']} ({top['z']:+.1f} personal SD)") if unusual else
                       "Behaviour is within this operator's normal range.",
                deviations=devs, model_version=self.meta["version"]))
        return out[0] if single else out

    def _band(self, op, d, known):
        if known:
            b = self.a["baselines"].loc[op]
            return float(b[f"{d}_p10"]), float(b[f"{d}_p90"])
        f = self.a["fleet"]
        return float(f[f"{d}_med"] - 1.28 * f[f"{d}_sd"]), float(f[f"{d}_med"] + 1.28 * f[f"{d}_sd"])

    def baseline(self, operator_id):
        """Typical bands (p10–p90 of history) for the Digital Twin's BaselineBand components."""
        known = operator_id in self.a["baselines"].index
        return dict(operator_id=operator_id, source="personal" if known else "fleet (cold start)",
                    n_sessions=int(self.a["baselines"].loc[operator_id, "n"]) if known else 0,
                    bands={d: dict(zip(("low", "high"), (round(v, 2) for v in self._band(operator_id, d, known))),
                                   label=self.a["labels"][d][0], unit=self.a["labels"][d][1]) for d in self.dims})


@lru_cache(maxsize=1)
def anomaly() -> AnomalyDetector:
    return AnomalyDetector()


# ====================================================================== TASK TIME
def fmt_hm(minutes):
    m = int(round(max(minutes, 0)))
    return f"{m // 60}h {m % 60:02d}m" if m >= 60 else f"{m}m"


class TaskTimePredictor:
    """predict(task) → minutes + 80 % conformal range.

    Current_Task_Progress > 0 → 'remaining' model (minutes left); otherwise → 'total' model (full duration).
    """

    def __init__(self):
        self.a, self.meta = load_artifact("task_time_model")

    def required_fields(self):
        base = ["Target_Quantity", "Task_Complexity", "Estimated_Task_Duration", "Historical_Task_Duration",
                "Ground_Slope", "Visibility", "Load_Percentage", "Machine_Health_Score", "Operator_Skill_Score",
                "Historical_Efficiency", "Historical_Idle_Time", "Ambient_Temperature"] + list(F.TASK_CATEGORICAL)
        return base + ["Current_Task_Progress"]

    def predict(self, tasks):
        single = isinstance(tasks, dict)
        df = pd.DataFrame([tasks] if single else list(tasks))
        if "Current_Task_Progress" not in df:
            df["Current_Task_Progress"] = 0.0
        missing = [c for c in self.required_fields() if c not in df]
        if missing:
            raise ValueError(f"task-time prediction needs fields: {missing}")
        prog = df["Current_Task_Progress"].astype(float).fillna(0).to_numpy()
        out = [None] * len(df)
        for kind, rows in (("remaining", np.flatnonzero(prog > 0)), ("total", np.flatnonzero(prog <= 0))):
            if len(rows) == 0:
                continue
            m = self.a[kind]
            X = F.task_frame(df.iloc[rows], progress=(kind == "remaining"))[m["features"]]
            p = m["point"].predict(X)
            lo = np.minimum(np.maximum(m["lower"].predict(X) - m["conformal_offset"], 0), p)
            hi = np.maximum(m["upper"].predict(X) + m["conformal_offset"], p)
            for j, r in enumerate(rows):
                out[r] = dict(kind=kind, point_min=round(float(p[j]), 1), low_min=round(float(lo[j]), 1),
                              high_min=round(float(hi[j]), 1), display=fmt_hm(p[j]),
                              range_display=f"{fmt_hm(lo[j])} – {fmt_hm(hi[j])}", coverage=0.8,
                              model_version=self.meta["version"])
        return out[0] if single else out


@lru_cache(maxsize=1)
def task_time() -> TaskTimePredictor:
    return TaskTimePredictor()
