"""Feature definitions shared by TRAINING and SERVING.

The FastAPI backend imports these exact functions, so a feature is computed one way everywhere.
Every input used here is observable at prediction time (see data_dictionary.csv roles). Columns
flagged LATENT / SESSION_OUTCOME / TARGET for a given model are listed in the *_FORBIDDEN sets
and asserted absent by tests/test_models.py.
"""
import numpy as np
import pandas as pd

# ============================================================ SAFETY RISK
# Snapshot inputs a live machine can report + the operator's profile.
SAFETY_NUMERIC = [
    "Machine_Speed", "Proximity_Distance", "Ground_Slope", "Load_Percentage", "Visibility", "Dust_Level",
    "Machine_Health_Score", "Engine_Temperature", "Control_Smoothness", "Blind_Zone_Entry",
    "Harsh_Rate_per_h", "Operator_Skill_Score", "Training_Score", "Previous_Safety_Events",
    # derived
    "Person_Nearby", "Inv_Proximity", "Is_Reversing", "Seatbelt_Off",
]
SAFETY_CATEGORICAL = ["Obstacle_Type", "Ground_Condition", "Terrain_Type", "Travel_Direction", "Machine_Type",
                      "Lighting_Condition", "Weather", "Operating_Shift"]
SAFETY_FORBIDDEN = {"Scenario", "Safety_Risk_Score", "Safety_Risk_Level", "Safety_Event", "Incident_Type",
                    "Emergency_Stop", "Operator_ID", "Machine_ID", "Record_ID", "Task_ID"}
SAFETY_TARGET = "Safety_Risk_Level"
RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
# Representative index value of each level (band midpoints of the project thresholds 0/30/55/75/100).
LEVEL_MIDPOINT = {"LOW": 15.0, "MEDIUM": 42.5, "HIGH": 65.0, "CRITICAL": 87.5}

# Explanation groups. Keys match the factor keys the existing UI already renders (WhyPanel).
SAFETY_GROUPS = {
    "proximity": ["Proximity_Distance", "Inv_Proximity", "Obstacle_Type", "Person_Nearby", "Blind_Zone_Entry",
                  "Travel_Direction", "Is_Reversing"],
    "speed": ["Machine_Speed"],
    "terrain": ["Ground_Slope", "Ground_Condition", "Terrain_Type"],
    "load": ["Load_Percentage"],
    "visibility": ["Visibility", "Lighting_Condition", "Weather", "Dust_Level"],
    "machine": ["Machine_Health_Score", "Engine_Temperature"],
    "control": ["Control_Smoothness", "Harsh_Rate_per_h", "Seatbelt_Off"],
}
# Same groups expressed over RAW inputs – explanations swap raw values so derived features stay consistent.
SAFETY_RAW_GROUPS = {
    "proximity": ["Proximity_Distance", "Obstacle_Type", "Blind_Zone_Entry", "Travel_Direction"],
    "speed": ["Machine_Speed"],
    "terrain": ["Ground_Slope", "Ground_Condition", "Terrain_Type"],
    "load": ["Load_Percentage"],
    "visibility": ["Visibility", "Lighting_Condition", "Weather", "Dust_Level"],
    "machine": ["Machine_Health_Score", "Engine_Temperature"],
    "control": ["Control_Smoothness", "Harsh_Rate_per_h", "Seatbelt_Status"],
}
# headline raw value shown next to each factor in the UI
GROUP_HEADLINE = {"proximity": ("Proximity_Distance", "m"), "speed": ("Machine_Speed", "km/h"),
                  "terrain": ("Ground_Slope", "°"), "load": ("Load_Percentage", "%"), "visibility": ("Visibility", "%"),
                  "machine": ("Machine_Health_Score", "/100"), "control": ("Control_Smoothness", "/100")}
# Operator profile + shift + machine type are context: held at the actual value, never "explained away".
SAFETY_CONTEXT = ["Operator_Skill_Score", "Training_Score", "Previous_Safety_Events", "Operating_Shift", "Machine_Type"]


# Raw inputs safety_frame() needs. The API fills any that a caller omits from stored typical values.
SAFETY_RAW_INPUTS = ["Machine_Speed", "Proximity_Distance", "Ground_Slope", "Load_Percentage", "Visibility", "Dust_Level",
                     "Machine_Health_Score", "Engine_Temperature", "Control_Smoothness", "Blind_Zone_Entry",
                     "Harsh_Rate_per_h", "Operator_Skill_Score", "Training_Score", "Previous_Safety_Events",
                     "Seatbelt_Status"] + SAFETY_CATEGORICAL
# Short aliases used by the existing frontend payload { speed, distance, load, slope, visibility }
SAFETY_ALIASES = {"speed": "Machine_Speed", "distance": "Proximity_Distance", "slope": "Ground_Slope",
                  "load": "Load_Percentage", "visibility": "Visibility"}

# Domain interaction terms (hazard products). Motivated by EDA §2; used by the linear candidate.
INTERACTIONS = ["ip_x_speed", "ip_x_blind", "slope_x_load", "slope_sq", "vis_x_ip", "speed_sq"]


def add_interactions(X: pd.DataFrame) -> pd.DataFrame:
    Z = X.copy()
    s = Z["Machine_Speed"] / 10
    ip = Z["Inv_Proximity"] * Z["Person_Nearby"]            # closeness to a PERSON / vehicle
    Z["ip_x_speed"] = ip * s
    Z["ip_x_blind"] = ip * Z["Blind_Zone_Entry"]
    Z["slope_x_load"] = Z["Ground_Slope"] * Z["Load_Percentage"] / 100
    Z["slope_sq"] = Z["Ground_Slope"] ** 2
    Z["vis_x_ip"] = (1 - Z["Visibility"] / 100) * ip
    Z["speed_sq"] = s ** 2
    return Z


def safety_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Build the safety feature frame from raw columns. Accepts the dataset or a 1-row API payload."""
    X = pd.DataFrame(index=df.index)
    raw_num = [c for c in SAFETY_NUMERIC if c not in ("Harsh_Rate_per_h", "Person_Nearby", "Inv_Proximity",
                                                      "Is_Reversing", "Seatbelt_Off")]
    for c in raw_num:
        X[c] = pd.to_numeric(df[c], errors="coerce").astype(float)
    if "Harsh_Rate_per_h" in df:
        X["Harsh_Rate_per_h"] = df["Harsh_Rate_per_h"].astype(float)
    else:  # dataset: rolling rate over the session
        X["Harsh_Rate_per_h"] = (df["Harsh_Acceleration"] + df["Harsh_Braking"]) / (df["Actual_Task_Duration"] / 60)
    for c in SAFETY_CATEGORICAL:
        X[c] = df[c].astype(str)
    X["Person_Nearby"] = X["Obstacle_Type"].isin(["Worker", "Vehicle"]).astype(float)
    X["Inv_Proximity"] = 1.0 / X["Proximity_Distance"].clip(lower=0.5)
    X["Is_Reversing"] = (X["Travel_Direction"] == "Reverse").astype(float)
    X["Seatbelt_Off"] = (df["Seatbelt_Status"].astype(str) == "Unfastened").astype(float)
    return X[SAFETY_NUMERIC + SAFETY_CATEGORICAL]


# ============================================================ TASK TIME
TASK_NUMERIC = ["Target_Quantity", "Task_Complexity", "Current_Task_Progress", "Remaining_Quantity",
                "Estimated_Task_Duration", "Historical_Task_Duration", "Planner_Remaining", "Historical_Remaining",
                "Ground_Slope", "Visibility", "Load_Percentage", "Machine_Health_Score", "Operator_Skill_Score",
                "Historical_Efficiency", "Historical_Idle_Time", "Ambient_Temperature"]
TASK_CATEGORICAL = ["Task_Type", "Machine_Model_Class", "Weather", "Ground_Condition", "Terrain_Type",
                    "Working_Zone", "Operating_Mode", "Experience_Level"]
TASK_FORBIDDEN = {"Scenario", "Actual_Task_Duration", "Idle_Time", "Load_Cycles", "Completed_Quantity",
                  "Total_Fuel_Used", "Fuel_Consumption", "Fuel_Efficiency", "Task_Completion_Time",
                  "Harsh_Acceleration", "Harsh_Braking", "Rapid_Control_Input", "Proximity_Violations",
                  "Operator_ID", "Machine_ID", "Record_ID", "Task_ID"}
TASK_TARGET_REMAINING = "Task_Completion_Time"     # minutes left (in-progress tasks)
TASK_TARGET_TOTAL = "Actual_Task_Duration"          # total minutes (pending tasks) – used only as a TARGET


def task_frame(df: pd.DataFrame, progress: bool = True) -> pd.DataFrame:
    X = pd.DataFrame(index=df.index)
    for c in ["Target_Quantity", "Task_Complexity", "Estimated_Task_Duration", "Historical_Task_Duration",
              "Ground_Slope", "Visibility", "Load_Percentage", "Machine_Health_Score", "Operator_Skill_Score",
              "Historical_Efficiency", "Historical_Idle_Time", "Ambient_Temperature"]:
        X[c] = pd.to_numeric(df[c], errors="coerce").astype(float)
    p = df["Current_Task_Progress"].astype(float) if progress else pd.Series(0.0, index=df.index)
    X["Current_Task_Progress"] = p
    X["Remaining_Quantity"] = X["Target_Quantity"] * (1 - p)
    X["Planner_Remaining"] = X["Estimated_Task_Duration"] * (1 - p)
    X["Historical_Remaining"] = X["Historical_Task_Duration"] * (1 - p)
    for c in TASK_CATEGORICAL:
        X[c] = df[c].astype(str)
    cols = TASK_NUMERIC + TASK_CATEGORICAL
    if not progress:
        cols = [c for c in cols if c not in ("Current_Task_Progress", "Remaining_Quantity", "Planner_Remaining",
                                             "Historical_Remaining")]
    return X[cols]


# ============================================================ PERSONAL ANOMALY
# Behaviour metrics per session. Speed and fuel are divided by a CONTEXT-EXPECTED value (learned from data)
# so terrain, load and machine class do not masquerade as operator behaviour.
BEHAVIOUR = ["idle_per_2h", "speed_ratio", "fuel_ratio", "control_deficit", "harsh_per_h", "rapid_per_h",
             "prox_viol_per_h"]
BEHAVIOUR_LABEL = {
    "idle_per_2h": ("Idle time", "min / 2 h", "Excessive_Idle"),
    "speed_ratio": ("Travel speed vs conditions", "× expected", "Unusual_Speed"),
    "fuel_ratio": ("Fuel burn vs load", "× expected", "Abnormal_Fuel"),
    "control_deficit": ("Control roughness", "100 − smoothness", "Erratic_Control"),
    "harsh_per_h": ("Harsh accel/brake", "/ h", "Repeated_Harsh_Events"),
    "rapid_per_h": ("Rapid control input", "/ h", "Erratic_Control"),
    "prox_viol_per_h": ("Proximity violations", "/ h", "Repeated_Proximity_Violations"),
}
SPEED_CTX_NUM = ["Ground_Slope", "Visibility"]
SPEED_CTX_CAT = ["Machine_Type", "Travel_Direction", "Ground_Condition"]
FUEL_CTX_NUM = ["Engine_Load_Percentage", "Idle_Share_Ctx"]
FUEL_CTX_CAT = ["Machine_Model_Class", "Operating_Mode"]
ANOMALY_FORBIDDEN = {"Scenario", "Operator_Anomaly", "Anomaly_Score", "Anomaly_Reason"}


def behaviour_raw(df: pd.DataFrame) -> pd.DataFrame:
    """Per-hour / per-2h rates from session aggregates (context normalisation applied separately)."""
    h = df["Actual_Task_Duration"].astype(float) / 60
    return pd.DataFrame({
        "idle_per_2h": df["Idle_Time"] / h * 2,
        "control_deficit": 100 - df["Control_Smoothness"].astype(float),
        "harsh_per_h": (df["Harsh_Acceleration"] + df["Harsh_Braking"]) / h,
        "rapid_per_h": df["Rapid_Control_Input"] / h,
        "prox_viol_per_h": df["Proximity_Violations"] / h,
    }, index=df.index)


def speed_ctx_frame(df):
    X = df[SPEED_CTX_NUM].astype(float).copy()
    for c in SPEED_CTX_CAT:
        X[c] = df[c].astype(str)
    return X


def fuel_ctx_frame(df):
    X = pd.DataFrame(index=df.index)
    X["Engine_Load_Percentage"] = df["Engine_Load_Percentage"].astype(float)
    # idle share at the operator's HISTORICAL habit (not this session's idle) – otherwise excess idle
    # would be absorbed into the "expected" fuel and hidden.
    X["Idle_Share_Ctx"] = df["Historical_Idle_Time"].astype(float) / 120
    for c in FUEL_CTX_CAT:
        X[c] = df[c].astype(str)
    return X


def check_no_leakage(columns, forbidden):
    bad = set(columns) & set(forbidden)
    if bad:
        raise ValueError(f"leakage: forbidden columns used as features: {sorted(bad)}")
    return True


def ordinal(levels):
    return np.array([RISK_LEVELS.index(l) for l in levels])
