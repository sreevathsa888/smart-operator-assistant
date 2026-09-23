"""Single source of configuration for the synthetic data generator.

Every number here is a PROJECT ASSUMPTION chosen to be physically plausible for
mid-size excavators and wheel loaders. None of them are official CAT specifications.
"""

RANDOM_SEED = 42
DATASET_VERSION = "synthetic_v1.0"

N_RECORDS = 40_000          # task sessions
N_OPERATORS = 120           # OP1000 … OP1119  (OP1007 = demo operator)
N_EXCAVATORS = 24           # EXC-201 … EXC-224 (EXC-204 = demo machine)
N_LOADERS = 16              # WHL-301 … WHL-316
START_DATE = "2026-03-01"
N_DAYS = 180
DEMO_OPERATOR = "OP1007"
DEMO_MACHINE = "EXC-204"

# ---------------------------------------------------------------- scenarios
# Target mix. Behavioural scenarios are modulated per operator (risk-prone operators get more
# UNSAFE_OPERATION, habitual idlers more EXCESSIVE_IDLE), so realised shares drift slightly;
# the realised distribution is reported in scenario_distribution.csv.
SCENARIO_MIX = {
    "NORMAL_OPERATION": 0.32,
    "EFFICIENT_OPERATION": 0.10,
    "HIGH_LOAD_OPERATION": 0.09,
    "EXCESSIVE_IDLE": 0.08,
    "STEEP_TERRAIN": 0.08,
    "PROXIMITY_HAZARD": 0.08,
    "POOR_WEATHER": 0.06,
    "LOW_VISIBILITY": 0.05,
    "UNSAFE_OPERATION": 0.05,
    "HIGH_FUEL_CONSUMPTION": 0.04,
    "MACHINE_OVERHEATING": 0.03,
    "MULTIPLE_SIMULTANEOUS_RISKS": 0.02,
}

# ---------------------------------------------------------------- machines
# payload_t = typical payload per cycle (t); cycle_s = standard work cycle (s);
# fuel_lph = typical burn at ~60 % engine load (L/h); vmax = on-site travel cap (km/h)
MACHINE_CLASSES = {
    "Medium Excavator (20t class)": dict(type="Excavator", payload_t=2.0, cycle_s=20, fuel_lph=15.0, vmax=5.5, share=0.6),
    "Large Excavator (30t class)":  dict(type="Excavator", payload_t=3.2, cycle_s=24, fuel_lph=21.0, vmax=5.0, share=0.4),
    "Medium Wheel Loader":          dict(type="Wheel Loader", payload_t=4.5, cycle_s=38, fuel_lph=14.0, vmax=15.0, share=0.6),
    "Large Wheel Loader":           dict(type="Wheel Loader", payload_t=7.0, cycle_s=44, fuel_lph=22.0, vmax=15.0, share=0.4),
}

TASKS_BY_TYPE = {
    "Excavator": {"Excavation": 0.40, "Trenching": 0.20, "Loading": 0.25, "Backfilling": 0.15},
    "Wheel Loader": {"Loading": 0.45, "Material_Transfer": 0.35, "Stockpiling": 0.20},
}
TASK_CYCLE_FACTOR = {"Excavation": 1.0, "Trenching": 1.30, "Loading": 0.95, "Backfilling": 0.85,
                     "Material_Transfer": 1.15, "Stockpiling": 1.0}
TASK_QTY_T = {"Excavation": (250, 900), "Trenching": (120, 450), "Loading": (300, 1100), "Backfilling": (200, 700),
              "Material_Transfer": (400, 1400), "Stockpiling": (300, 1000)}
# which zones each task is usually performed in
TASK_ZONES = {
    "Excavation": {"Zone A": .55, "Zone E": .30, "Zone C": .15},
    "Trenching": {"Zone C": .75, "Zone A": .25},
    "Loading": {"Zone B": .70, "Zone D": .30},
    "Backfilling": {"Zone C": .45, "Zone A": .35, "Zone E": .20},
    "Material_Transfer": {"Zone D": .50, "Zone F": .35, "Zone B": .15},
    "Stockpiling": {"Zone D": .80, "Zone F": .20},
}

# ---------------------------------------------------------------- site
ZONES = {
    "Zone A": dict(desc="Open excavation", terrain={"Flat": .45, "Gentle_Slope": .35, "Embankment": .20}, worker_density=0.20),
    "Zone B": dict(desc="Loading / truck traffic", terrain={"Flat": .60, "Haul_Road": .40}, worker_density=0.45),
    "Zone C": dict(desc="Trenching near utilities", terrain={"Trench_Edge": .55, "Flat": .30, "Gentle_Slope": .15}, worker_density=0.40),
    "Zone D": dict(desc="Stockpile / material transfer", terrain={"Stockpile": .55, "Flat": .45}, worker_density=0.25),
    "Zone E": dict(desc="Slope / embankment works", terrain={"Embankment": .55, "Gentle_Slope": .45}, worker_density=0.15),
    "Zone F": dict(desc="Haul road", terrain={"Haul_Road": .80, "Gentle_Slope": .20}, worker_density=0.10),
}
TERRAIN_SLOPE_DEG = {"Flat": (0, 3), "Gentle_Slope": (3, 9), "Embankment": (8, 18), "Trench_Edge": (2, 10),
                     "Haul_Road": (0, 7), "Stockpile": (4, 14)}

# ---------------------------------------------------------------- risk levels (PROJECT-defined)
RISK_BINS = [0, 30, 55, 75, 100.0001]
RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

# personal-baseline anomaly rule (in personal standard deviations)
ANOMALY_Z = 3.0

# ---------------------------------------------------------------- plausible ranges (validated)
RANGES = {
    "Machine_Speed": (0, 15), "Proximity_Distance": (0.5, 20), "Ground_Slope": (0, 30),
    "Engine_Temperature": (65, 120), "Hydraulic_Temperature": (30, 110), "Fuel_Consumption": (2, 50),
    "Machine_Health_Score": (0, 100), "Engine_Load_Percentage": (5, 100), "Visibility": (0, 100),
    "Ambient_Temperature": (15, 48), "Dust_Level": (0, 100), "Load_Percentage": (0, 115),
    "Control_Smoothness": (0, 100), "Training_Score": (0, 100), "Operator_Skill_Score": (0, 100),
    "Historical_Efficiency": (0, 100), "Safety_Risk_Score": (0, 100), "Anomaly_Score": (0, 1),
    "Current_Task_Progress": (0, 1), "Task_Complexity": (1, 5), "Machine_Age": (0, 20),
    "Load_Weight": (0.3, 9), "Idle_Time": (0, 600), "Actual_Task_Duration": (10, 1500),
    "Task_Completion_Time": (0, 1500), "Fuel_Efficiency": (0, 60), "Engine_Hours": (0, 40000),
}
