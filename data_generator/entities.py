"""Persistent entities: operators and machines.

Operators carry LATENT traits (skill, risk propensity, idle habit, personal behaviour
baselines). Those latent values drive every session they work, which is what gives the
dataset operator-specific structure — the basis of the Operator Digital Twin and of
personalised anomaly detection. Latent traits are exported to operators_latent.csv for
auditing only; they are never model features.
"""
import numpy as np
import pandas as pd

from . import config as C

EXPERIENCE_BINS = [(0, 2, "Novice"), (2, 5, "Intermediate"), (5, 10, "Experienced"), (10, 40, "Expert")]


def _experience_level(years):
    for lo, hi, name in EXPERIENCE_BINS:
        if lo <= years < hi:
            return name
    return "Expert"


def make_machines(rng: np.random.Generator) -> pd.DataFrame:
    rows = []
    exc_classes = [k for k, v in C.MACHINE_CLASSES.items() if v["type"] == "Excavator"]
    whl_classes = [k for k, v in C.MACHINE_CLASSES.items() if v["type"] == "Wheel Loader"]

    def pick(classes):
        p = np.array([C.MACHINE_CLASSES[c]["share"] for c in classes])
        return classes[rng.choice(len(classes), p=p / p.sum())]

    for i in range(C.N_EXCAVATORS):
        rows.append(("EXC-%d" % (201 + i), "Excavator", pick(exc_classes)))
    for i in range(C.N_LOADERS):
        rows.append(("WHL-%d" % (301 + i), "Wheel Loader", pick(whl_classes)))
    df = pd.DataFrame(rows, columns=["Machine_ID", "Machine_Type", "Machine_Model_Class"])

    n = len(df)
    df["Machine_Age"] = np.round(rng.uniform(0.5, 12.0, n), 1)
    # ~1,100–1,600 engine hours per year of service
    df["Engine_Hours_Start"] = np.round(df["Machine_Age"] * rng.uniform(1100, 1600, n), 1)
    # latent condition: maintenance quality (1 = excellent). Health declines with hours, offset by maintenance.
    df["Maintenance_Quality"] = np.clip(rng.normal(0.75, 0.12, n), 0.35, 1.0)
    df["Base_Health"] = np.clip(
        100 - df["Engine_Hours_Start"] / 450 - (1 - df["Maintenance_Quality"]) * 30 + rng.normal(0, 3, n), 45, 99)
    # demo machine: 20t class, mid-life, healthy (matches the existing UI: ~1,523 engine hours)
    d = df["Machine_ID"] == C.DEMO_MACHINE
    df.loc[d, ["Machine_Model_Class", "Machine_Age", "Engine_Hours_Start", "Maintenance_Quality", "Base_Health"]] = \
        ["Medium Excavator (20t class)", 1.2, 1350.0, 0.85, 93.0]
    return df


def make_operators(rng: np.random.Generator, machines: pd.DataFrame) -> pd.DataFrame:
    n = C.N_OPERATORS
    ids = ["OP%d" % (1000 + i) for i in range(n)]
    years = np.round(np.clip(rng.gamma(2.2, 2.6, n), 0.2, 28), 1)
    # latent skill 0–1: grows with experience (diminishing returns) + individual talent
    skill = np.clip(0.25 + 0.55 * (1 - np.exp(-years / 5.5)) + rng.normal(0, 0.09, n), 0.05, 0.98)
    # latent risk propensity (independent-ish of skill; slight negative relationship)
    risk_prop = np.clip(rng.normal(0.35, 0.16, n) - 0.15 * (skill - 0.6), 0.02, 0.95)
    # latent idle habit: minutes idled in a typical 2-hour session (personal baseline!)
    idle_habit = np.clip(rng.lognormal(np.log(20), 0.35, n), 7, 45)
    shift = rng.choice(["Morning", "Afternoon", "Night"], n, p=[0.45, 0.35, 0.20])
    # machine type qualification: most operators run one type
    mtype = rng.choice(["Excavator", "Wheel Loader"], n, p=[0.6, 0.4])

    df = pd.DataFrame({
        "Operator_ID": ids,
        "Years_Experience": years,
        "Experience_Level": [_experience_level(y) for y in years],
        "Operating_Shift": shift,
        "Primary_Machine_Type": mtype,
        # ----- latent (never exported as features) -----
        "L_Skill": skill,
        "L_Risk_Propensity": risk_prop,
        "L_Idle_Habit": idle_habit,                                   # min per 120-min session
        "L_Idle_SD": idle_habit * rng.uniform(0.10, 0.16, n),         # personal variability
        "L_Speed_Factor": np.clip(rng.normal(1.0, 0.10, n) + 0.25 * (risk_prop - 0.35), 0.75, 1.45),
        "L_Speed_SD": rng.uniform(0.06, 0.10, n),                     # relative SD of travel speed
        "L_Fuel_Habit": np.clip(rng.normal(1.0, 0.06, n) + 0.08 * (risk_prop - 0.35) - 0.05 * (skill - 0.6), 0.85, 1.2),
        "L_Smoothness": np.clip(55 + 40 * skill - 20 * (risk_prop - 0.35) + rng.normal(0, 4, n), 30, 97),
        "L_Harsh_Rate": np.clip(0.4 + 2.5 * risk_prop + 1.2 * (1 - skill) + rng.normal(0, 0.25, n), 0.1, 5),  # events/h
        "L_Seatbelt_Compliance": np.clip(0.985 - 0.12 * risk_prop + rng.normal(0, 0.02, n), 0.6, 0.999),
        "L_Awareness": np.clip(0.5 + 0.4 * skill - 0.4 * (risk_prop - 0.35) + rng.normal(0, 0.08, n), 0.1, 1.0),
    })

    # ----- demo operator OP1007: intermediate, normally idles 18–25 min, generally safe -----
    d = df["Operator_ID"] == C.DEMO_OPERATOR
    df.loc[d, ["Years_Experience", "Experience_Level", "Operating_Shift", "Primary_Machine_Type"]] = \
        [4.1, "Intermediate", "Morning", "Excavator"]
    df.loc[d, ["L_Skill", "L_Risk_Propensity", "L_Idle_Habit", "L_Idle_SD", "L_Speed_Factor", "L_Speed_SD",
               "L_Fuel_Habit", "L_Smoothness", "L_Harsh_Rate", "L_Seatbelt_Compliance", "L_Awareness"]] = \
        [0.66, 0.30, 21.5, 2.4, 1.0, 0.07, 1.0, 84.0, 0.9, 0.99, 0.72]

    # ----- observable operator profile (what an HR / fleet system would know) -----
    s = df["L_Skill"].to_numpy()
    df["Operator_Skill_Score"] = np.round(np.clip(100 * s + rng.normal(0, 4, n), 0, 100), 1)  # assessed skill (noisy)
    df["Training_Score_Start"] = np.round(np.clip(45 + 45 * s + rng.normal(0, 7, n), 20, 100), 1)
    df["Historical_Efficiency"] = np.round(np.clip(50 + 45 * s - 10 * (df["L_Idle_Habit"] / 20 - 1) + rng.normal(0, 4, n), 10, 99), 1)
    df["Historical_Idle_Time"] = np.round(df["L_Idle_Habit"] * rng.lognormal(0, 0.06, n), 1)  # noisy estimate of habit
    lam = df["Years_Experience"].clip(0.5, 12) * (0.08 + 0.55 * df["L_Risk_Propensity"])
    df["Previous_Safety_Events"] = rng.poisson(lam.to_numpy())

    # primary machine assignment within qualified type
    prim = []
    for t in df["Primary_Machine_Type"]:
        pool = machines.loc[machines["Machine_Type"] == t, "Machine_ID"].to_numpy()
        prim.append(rng.choice(pool))
    df["Primary_Machine_ID"] = prim
    df.loc[d, "Primary_Machine_ID"] = C.DEMO_MACHINE
    return df
