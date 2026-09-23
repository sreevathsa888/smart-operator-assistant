"""Data dictionary: one entry per column of cat_operator_synthetic.csv.

Role
  ID              identifier – never a model input
  LATENT          generator-internal variable exported for auditing – NEVER a model input
  RAW             directly observable at prediction time (sensor, profile or plan)
  DERIVED         deterministic function of RAW columns (redundant but observable)
  SESSION_OUTCOME only known after the session / task finishes → leakage risk for pre-task models
  TARGET          ground-truth label produced by the generator

Model abbreviations in Leakage_Notes: SAFETY = safety-risk classifier, ANOMALY = personal anomaly
detector, TASK = task-completion-time regressor.
"""

G_ID, G_M, G_O, G_OP, G_S, G_E, G_T, G_Y = "Identifier", "Machine", "Operator", "Operation", "Safety", "Environment", "Task", "Target"

DICTIONARY = [
    # col, group, role, type, unit, description, leakage
    ("Record_ID", G_ID, "ID", "string", "", "Unique session record id.", "Never a feature."),
    ("Timestamp", G_ID, "ID", "datetime", "local", "Session start time (synthetic site calendar, 180 days from 2026-03-01).", "Use only for time-based splitting / ordering."),
    ("Scenario", G_ID, "LATENT", "category", "", "Generator scenario that produced the session. Not observable on a real machine.", "NEVER a feature for any model (would leak the generating process). Use for stratification and error analysis only."),

    ("Machine_ID", G_M, "ID", "string", "", "Machine identifier (EXC-2xx excavators, WHL-3xx wheel loaders).", "Do not one-hot as a feature (memorisation)."),
    ("Machine_Type", G_M, "RAW", "category", "", "Excavator or Wheel Loader.", ""),
    ("Machine_Model_Class", G_M, "RAW", "category", "", "Generic size class (e.g. Medium Excavator (20t class)). Not an official model name.", ""),
    ("Engine_Hours", G_M, "RAW", "float", "h", "Cumulative engine hours at session start.", ""),
    ("Machine_Age", G_M, "RAW", "float", "years", "Years in service.", ""),
    ("Engine_Temperature", G_M, "RAW", "float", "°C", "Coolant temperature (session average). Driven by engine load, ambient temperature, machine health; overheating scenario adds a fault offset.", ""),
    ("Hydraulic_Temperature", G_M, "RAW", "float", "°C", "Hydraulic oil temperature (session average).", ""),
    ("Machine_Speed", G_M, "RAW", "float", "km/h", "Travel speed in the safety snapshot window (sensor noise σ≈0.2 km/h). Excavators ≤5.5, loaders ≤15.", ""),
    ("Fuel_Consumption", G_M, "RAW", "float", "L/h", "Average fuel burn rate over the session (active burn blended with ~28 % idle burn).", "TASK: session aggregate – known only after work starts."),
    ("Machine_Health_Score", G_M, "RAW", "float", "0–100", "Project-defined condition index (wear, maintenance quality, fault state). Not a CAT metric.", ""),
    ("Engine_Load_Percentage", G_M, "RAW", "float", "%", "Average engine load (payload, slope, mode, task).", ""),

    ("Operator_ID", G_O, "ID", "string", "", "Operator identifier OP1000–OP1119 (OP1007 = demo operator).", "Do not one-hot for SAFETY/TASK. ANOMALY uses it only to look up the operator's own baseline."),
    ("Experience_Level", G_O, "RAW", "category", "", "Novice (<2 y), Intermediate (2–5), Experienced (5–10), Expert (10+).", ""),
    ("Years_Experience", G_O, "RAW", "float", "years", "Years operating heavy equipment.", ""),
    ("Operating_Shift", G_O, "RAW", "category", "", "Morning 06–14, Afternoon 14–22, Night 22–06.", ""),
    ("Historical_Efficiency", G_O, "RAW", "float", "0–100", "Operator's historical productivity index (profile, pre-window).", ""),
    ("Historical_Idle_Time", G_O, "RAW", "float", "min / 120-min session", "Operator's historical typical idle (noisy estimate of personal habit).", ""),
    ("Training_Score", G_O, "RAW", "float", "0–100", "Latest training assessment score; drifts upward slowly over the 180 days.", ""),
    ("Previous_Safety_Events", G_O, "RAW", "int", "count", "Safety events recorded before the observation window.", ""),
    ("Operator_Skill_Score", G_O, "RAW", "float", "0–100", "Assessed skill (noisy measurement of latent skill).", ""),

    ("Load_Weight", G_OP, "RAW", "float", "t / cycle", "Average payload per work cycle.", ""),
    ("Load_Percentage", G_OP, "DERIVED", "float", "% of class payload", "Load_Weight relative to typical class payload (>100 % = overloading).", ""),
    ("Load_Cycles", G_OP, "SESSION_OUTCOME", "int", "count", "Work cycles needed for the completed quantity.", "TASK: LEAKAGE – realised cycle count is only known at completion."),
    ("Idle_Time", G_OP, "SESSION_OUTCOME", "float", "min", "Idle minutes during the session. Idle share of session time = operator habit ÷ 120 (habit expressed as min per 2 h).", "TASK: LEAKAGE – idle minutes are part of the realised duration. ANOMALY: primary input."),
    ("Operating_Mode", G_OP, "RAW", "category", "", "Eco / Standard / Power.", ""),
    ("Travel_Direction", G_OP, "RAW", "category", "", "Forward / Reverse / Swinging / Stationary in the snapshot window.", ""),
    ("Harsh_Acceleration", G_OP, "SESSION_OUTCOME", "int", "count", "Harsh acceleration events in the session.", "TASK: leakage-risk (scales with duration). Use per-hour rate for ANOMALY."),
    ("Harsh_Braking", G_OP, "SESSION_OUTCOME", "int", "count", "Harsh braking events in the session.", "Same as Harsh_Acceleration."),
    ("Rapid_Control_Input", G_OP, "SESSION_OUTCOME", "int", "count", "Rapid joystick reversals in the session.", "Same as Harsh_Acceleration."),
    ("Control_Smoothness", G_OP, "RAW", "float", "0–100", "Project-defined control smoothness index (higher = smoother).", ""),
    ("Proximity_Violations", G_OP, "SESSION_OUTCOME", "int", "count", "Entries of any object into the 3 m restricted zone during the session.", "ANOMALY input (repeated violations). Not for SAFETY snapshot scoring."),

    ("Seatbelt_Status", G_S, "RAW", "category", "", "Fastened / Unfastened.", ""),
    ("Proximity_Distance", G_S, "RAW", "float", "m", "Distance to nearest object in the snapshot (sensor noise ≈8 %). 0.5–20 m.", ""),
    ("Obstacle_Type", G_S, "RAW", "category", "", "Nearest object: Worker, Vehicle, Structure, Material_Pile, Utility_Marker, No_Object.", ""),
    ("Blind_Zone_Entry", G_S, "RAW", "int", "0/1", "Object detected in a blind zone (more likely when reversing, close, low visibility).", ""),
    ("Ground_Slope", G_S, "RAW", "float", "°", "Ground slope at the machine (sensor noise σ≈0.7°). 0–30°.", ""),
    ("Safety_Zone_Status", G_S, "DERIVED", "category", "", "From Proximity_Distance: Violated <3 m, Warning 3–6 m, Clear ≥6 m (PROJECT thresholds).", "Redundant with Proximity_Distance."),
    ("Emergency_Stop", G_S, "SESSION_OUTCOME", "int", "0/1", "Emergency stop triggered.", "SAFETY: LEAKAGE – consequence of risk, not a cause."),
    ("Safety_Event", G_S, "TARGET", "int", "0/1", "A safety event (near miss or incident) occurred. Bernoulli draw from ground-truth risk.", "SAFETY: LEAKAGE if used as input. Can be a secondary target."),

    ("Weather", G_E, "RAW", "category", "", "Clear, Cloudy, Hot, Light_Rain, Heavy_Rain, Dust_Wind, Fog (seasonal).", ""),
    ("Visibility", G_E, "RAW", "float", "% (index)", "Estimated visibility index 0–100 from weather × lighting (sensor noise σ≈4).", ""),
    ("Ambient_Temperature", G_E, "RAW", "float", "°C", "Air temperature (month, shift, weather).", ""),
    ("Dust_Level", G_E, "RAW", "float", "0–100", "Dust index (terrain, wind, rain suppresses).", ""),
    ("Ground_Condition", G_E, "RAW", "category", "", "Dry, Wet, Muddy, Loose, Rocky (driven by weather + terrain).", ""),
    ("Terrain_Type", G_E, "RAW", "category", "", "Flat, Gentle_Slope, Embankment, Trench_Edge, Haul_Road, Stockpile.", ""),
    ("Working_Zone", G_E, "RAW", "category", "", "Zone A–F; zones differ in terrain and ground-worker density.", ""),
    ("Lighting_Condition", G_E, "RAW", "category", "", "Daylight, Dawn_Dusk, Night_Floodlit, Night_Poor.", ""),

    ("Task_ID", G_T, "ID", "string", "", "Task identifier.", "Never a feature."),
    ("Task_Type", G_T, "RAW", "category", "", "Excavation, Trenching, Loading, Backfilling (excavator); Loading, Material_Transfer, Stockpiling (loader).", ""),
    ("Task_Complexity", G_T, "RAW", "int", "1–5", "Planner-assigned complexity.", ""),
    ("Target_Quantity", G_T, "RAW", "float", "t", "Planned quantity to move.", ""),
    ("Completed_Quantity", G_T, "SESSION_OUTCOME", "float", "t", "Quantity actually moved (<target if interrupted).", "TASK: LEAKAGE."),
    ("Historical_Task_Duration", G_T, "RAW", "float", "min", "This operator's historical duration for comparable tasks, scaled to the target quantity.", "Known before the task – legitimate TASK feature."),
    ("Current_Task_Progress", G_T, "RAW", "float", "0–1", "Quantity-based progress at the snapshot.", "Legitimate TASK feature for remaining-time prediction."),
    ("Estimated_Task_Duration", G_T, "RAW", "float", "min", "Planner's standard estimate (quantity ÷ standard rate + 20 % allowance). No operator or condition info.", "Known before the task – legitimate TASK baseline."),
    ("Actual_Task_Duration", G_T, "SESSION_OUTCOME", "float", "min", "Realised total duration (productive + idle + stoppages).", "TASK: LEAKAGE – this is (almost) the target. Can serve as target for a total-duration model."),
    ("Total_Fuel_Used", G_T, "SESSION_OUTCOME", "float", "L", "Fuel_Consumption × duration.", "TASK: LEAKAGE."),

    ("Safety_Risk_Score", G_Y, "TARGET", "float", "0–100", "Synthetic ground-truth risk index = 100·sigmoid(logit) built from TRUE conditions + unobserved operator awareness + situational noise. PROJECT metric, not a CAT metric.", "SAFETY: LEAKAGE for the level classifier (level is binned from it)."),
    ("Safety_Risk_Level", G_Y, "TARGET", "category", "", "LOW <30, MEDIUM 30–55, HIGH 55–75, CRITICAL ≥75 on Safety_Risk_Score (PROJECT thresholds).", "Primary SAFETY target."),
    ("Operator_Anomaly", G_Y, "TARGET", "int", "0/1", "Session behaviour deviates ≥3 personal SDs from the operator's own latent baseline on any behaviour dimension.", "ANOMALY evaluation label (the detector itself is unsupervised)."),
    ("Anomaly_Score", G_Y, "TARGET", "float", "0–1", "sigmoid(1.2·(max personal z − 3)).", "ANOMALY: LEAKAGE if used as input."),
    ("Anomaly_Reason", G_Y, "TARGET", "category", "", "Behaviour dimension with the largest deviation (Normal if not anomalous).", "Evaluation of explanation quality."),
    ("Task_Completion_Time", G_Y, "TARGET", "float", "min", "Minutes remaining from the snapshot to task completion.", "Primary TASK target. Actual_Task_Duration must NOT be an input."),
    ("Incident_Type", G_Y, "TARGET", "category", "", "Type of safety event (No_Incident if no event), sampled in proportion to the dominant risk term.", "SAFETY: LEAKAGE."),
    ("Fuel_Efficiency", G_Y, "TARGET", "float", "t / L", "Completed_Quantity ÷ Total_Fuel_Used (optional target).", "Uses outcomes – target only."),
]
