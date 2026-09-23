"""Generate the Smart Operator Assistant synthetic dataset.

    python -m data_generator.generate_dataset            # from repo root
    python data_generator/generate_dataset.py            # also works

Deterministic: RANDOM_SEED in config.py fixes every draw, so re-running reproduces the
same CSV byte-for-byte (verified by tests/test_dataset.py).

ONE RECORD = ONE TASK SESSION of one operator on one machine. Columns fall in three groups:
  * session aggregates  (idle time, fuel, harsh-event counts, duration …)
  * a safety SNAPSHOT   (speed, proximity, slope, visibility … at the highest-exposure
                         moment of the session — the moment the safety model scores)
  * ground-truth targets computed from TRUE (pre-sensor-noise) values plus unobserved factors.

THIS DATA IS SYNTHETIC. It is not real CAT telemetry.
"""
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    __package__ = "data_generator"

from data_generator import config as C                      # noqa: E402
from data_generator.entities import make_machines, make_operators   # noqa: E402
from data_generator import scenario_generator as S           # noqa: E402
from data_generator.data_dictionary import DICTIONARY        # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "synthetic")


def sigmoid(x):
    return 1 / (1 + np.exp(-x))


def pick(rng, table: dict, n):
    keys = list(table)
    p = np.array([table[k] for k in keys], float)
    return rng.choice(np.array(keys, dtype=object), n, p=p / p.sum())


def pick_rowwise(rng, keys_per_row, table_lookup):
    """Categorical draw whose distribution depends on another categorical column."""
    out = np.empty(len(keys_per_row), dtype=object)
    for k in pd.unique(keys_per_row):
        m = keys_per_row == k
        out[m] = pick(rng, table_lookup[k], m.sum())
    return out


def generate(n_records: int = C.N_RECORDS, seed: int = C.RANDOM_SEED):
    rng = np.random.default_rng(seed)
    machines = make_machines(rng)
    operators = make_operators(rng, machines)
    n = n_records

    # ------------------------------------------------------------ sessions
    op_idx = rng.integers(0, len(operators), n)
    ops = operators.iloc[op_idx].reset_index(drop=True)
    day = rng.integers(0, C.N_DAYS, n)
    date = pd.Timestamp(C.START_DATE) + pd.to_timedelta(day, unit="D")
    month = date.month.to_numpy()

    shift = ops["Operating_Shift"].to_numpy().copy()
    swap = rng.random(n) < 0.12
    shift[swap] = rng.choice(np.array(["Morning", "Afternoon", "Night"], dtype=object), swap.sum())
    start_h = np.select([shift == "Morning", shift == "Afternoon"], [6, 14], 22) + rng.uniform(0, 5.5, n)
    ts = date + pd.to_timedelta(start_h, unit="h")

    # machine: 80 % primary machine, else another of the same type
    mach_ids = ops["Primary_Machine_ID"].to_numpy().copy()
    other = rng.random(n) >= 0.80
    for t in ("Excavator", "Wheel Loader"):
        pool = machines.loc[machines["Machine_Type"] == t, "Machine_ID"].to_numpy()
        mm = other & (ops["Primary_Machine_Type"].to_numpy() == t)
        mach_ids[mm] = rng.choice(pool, mm.sum())
    mac = machines.set_index("Machine_ID").loc[mach_ids].reset_index()
    mtype = mac["Machine_Type"].to_numpy()
    mcls = mac["Machine_Model_Class"].to_numpy()
    cls = lambda key: np.array([C.MACHINE_CLASSES[c][key] for c in mcls], float)  # noqa: E731
    payload, cycle_s, fuel_lph, vmax = cls("payload_t"), cls("cycle_s"), cls("fuel_lph"), cls("vmax")

    # ------------------------------------------------------------ stage A: structural categoricals
    v = {}
    v["Task_Type"] = pick_rowwise(rng, mtype, C.TASKS_BY_TYPE)
    task = v["Task_Type"]
    cplx_mean = np.where(task == "Trenching", 3.4, np.where(np.isin(task, ["Excavation", "Backfilling"]), 2.9, 2.4))
    v["Task_Complexity"] = np.clip(np.round(rng.normal(cplx_mean, 0.9)), 1, 5).astype(int)
    lo = np.array([C.TASK_QTY_T[t][0] for t in task]); hi = np.array([C.TASK_QTY_T[t][1] for t in task])
    v["Target_Quantity"] = rng.uniform(lo, hi)
    v["Working_Zone"] = pick_rowwise(rng, task, C.TASK_ZONES)
    v["Terrain_Type"] = pick_rowwise(rng, v["Working_Zone"], {z: d["terrain"] for z, d in C.ZONES.items()})

    # seasonal weather (Mar–May hot/dusty, Jun–Aug monsoon-like) – a site-climate ASSUMPTION
    wet = np.isin(month, [6, 7, 8])
    v["Weather"] = np.where(
        wet,
        pick(rng, {"Clear": .25, "Cloudy": .30, "Light_Rain": .28, "Heavy_Rain": .10, "Fog": .04, "Dust_Wind": .03}, n),
        pick(rng, {"Clear": .50, "Cloudy": .15, "Hot": .22, "Light_Rain": .03, "Heavy_Rain": .01, "Fog": .03, "Dust_Wind": .06}, n),
    ).astype(object)
    night = shift == "Night"
    v["Lighting_Condition"] = np.where(
        night, pick(rng, {"Night_Floodlit": .82, "Night_Poor": .18}, n),
        np.where(shift == "Afternoon", pick(rng, {"Daylight": .75, "Dawn_Dusk": .25}, n),
                 pick(rng, {"Daylight": .88, "Dawn_Dusk": .12}, n))).astype(object)
    v["Operating_Mode"] = pick(rng, {"Eco": .30, "Standard": .55, "Power": .15}, n)
    v["Travel_Direction"] = np.where(
        mtype == "Excavator", pick(rng, {"Swinging": .45, "Forward": .25, "Reverse": .15, "Stationary": .15}, n),
        pick(rng, {"Forward": .50, "Reverse": .35, "Stationary": .15}, n)).astype(object)
    wd = np.array([C.ZONES[z]["worker_density"] for z in v["Working_Zone"]])
    u = rng.random(n)
    v["Obstacle_Type"] = np.select(
        [u < wd, u < wd + 0.15, u < wd + 0.27, u < wd + 0.40, (u < wd + 0.47) & (v["Working_Zone"] == "Zone C")],
        ["Worker", "Vehicle", "Structure", "Material_Pile", "Utility_Marker"], "No_Object").astype(object)

    # ------------------------------------------------------------ scenarios (context stage)
    scen = S.assign_scenarios(rng, ops)
    multi = S.multi_components(rng, int((scen == "MULTIPLE_SIMULTANEOUS_RISKS").sum()))
    S.apply_stage(v, scen, multi, 0, rng)

    # ------------------------------------------------------------ stage C: derive continuous environment
    W = v["Weather"]; L = v["Lighting_Condition"]
    vis_w = pd.Series(W).map({"Clear": 93, "Cloudy": 86, "Hot": 88, "Light_Rain": 72, "Heavy_Rain": 46,
                              "Dust_Wind": 50, "Fog": 36}).to_numpy(float)
    vis_l = pd.Series(L).map({"Daylight": 1.0, "Dawn_Dusk": 0.86, "Night_Floodlit": 0.76, "Night_Poor": 0.52}).to_numpy(float)
    v["vis_true"] = np.clip(vis_w * vis_l + rng.normal(0, 4, n), 5, 100)

    temp_base = np.select([month <= 3, month <= 5, month <= 8], [30, 36, 30], 29).astype(float)
    temp_base += np.select([shift == "Morning", shift == "Afternoon"], [-1.0, 3.0], -5.0)
    temp_base += pd.Series(W).map({"Hot": 4, "Heavy_Rain": -4, "Light_Rain": -2, "Fog": -3}).fillna(0).to_numpy()
    v["Ambient_Temperature"] = np.clip(temp_base + rng.normal(0, 2.2, n), 16, 46)

    T = v["Terrain_Type"]
    rain = np.isin(W, ["Light_Rain", "Heavy_Rain"])
    gc = np.full(n, "Dry", dtype=object)
    r = rng.random(n)
    gc[(T == "Stockpile") & (r < 0.45)] = "Loose"
    gc[(np.isin(T, ["Embankment", "Trench_Edge"])) & (r < 0.25)] = "Loose"
    gc[(T == "Haul_Road") & (r < 0.15)] = "Rocky"
    gc[(W == "Light_Rain") & (r < 0.75)] = "Wet"
    gc[(W == "Heavy_Rain")] = np.where(r[W == "Heavy_Rain"] < 0.6, "Muddy", "Wet")
    v["Ground_Condition"] = gc
    dust = 18 + pd.Series(T).map({"Haul_Road": 22, "Stockpile": 18, "Flat": 5}).fillna(8).to_numpy()
    dust += np.where(W == "Dust_Wind", 45, 0) + np.where(W == "Hot", 10, 0) - np.where(rain, 15, 0)
    v["Dust_Level"] = np.clip(dust + rng.normal(0, 7, n), 0, 100)

    slo = np.array([C.TERRAIN_SLOPE_DEG[t][0] for t in T]); shi = np.array([C.TERRAIN_SLOPE_DEG[t][1] for t in T])
    v["slope_true"] = rng.uniform(slo, shi)

    aware = ops["L_Awareness"].to_numpy()
    obst = v["Obstacle_Type"]
    v["prox_true"] = np.where(obst == "No_Object", rng.uniform(12, 20, n),
                              2.2 + rng.gamma(2.0, 2.4, n) + 2.5 * aware)
    v["Load_Percentage"] = np.clip(rng.normal(74, 9, n), 35, 100)

    # per-session BEHAVIOUR multipliers relative to the operator's own baseline (anomaly ground truth lives here)
    v["b_speed"] = ops["L_Speed_Factor"].to_numpy() * rng.normal(1, ops["L_Speed_SD"].to_numpy())
    v["b_idle"] = np.maximum(1, ops["L_Idle_Habit"].to_numpy() + rng.normal(0, ops["L_Idle_SD"].to_numpy()))
    v["b_fuel"] = ops["L_Fuel_Habit"].to_numpy() * rng.normal(1, 0.04, n)
    v["b_smooth"] = ops["L_Smoothness"].to_numpy() + rng.normal(0, 3.5, n)
    v["b_harsh"] = ops["L_Harsh_Rate"].to_numpy() * rng.gamma(8, 1 / 8, n)
    v["b_rapid"] = (2 + (100 - ops["L_Smoothness"].to_numpy()) / 8) * rng.gamma(8, 1 / 8, n)
    v["seatbelt_p"] = ops["L_Seatbelt_Compliance"].to_numpy().copy()
    v["blind_bias"] = np.zeros(n)
    v["prox_viol_extra"] = np.zeros(n)
    v["temp_fault_eng"] = np.zeros(n); v["temp_fault_hyd"] = np.zeros(n); v["health_drop"] = np.zeros(n)
    base = {k: v[k].copy() for k in ["b_speed", "b_idle", "b_fuel", "b_smooth", "b_harsh"]}

    # ------------------------------------------------------------ scenarios (intensity stage)
    S.apply_stage(v, scen, multi, 1, rng)
    v["Ambient_Temperature"] = np.clip(v["Ambient_Temperature"], 16, 48)

    # spontaneous "off day" deviations, independent of scenario (fatigue, distraction …)
    off = rng.random(n) < 0.025
    dim = rng.integers(0, 4, n)
    k = rng.uniform(4, 6.5, n)
    sd_speed = ops["L_Speed_SD"].to_numpy(); sd_idle = ops["L_Idle_SD"].to_numpy()
    v["b_speed"] = np.where(off & (dim == 0), v["b_speed"] * (1 + k * sd_speed), v["b_speed"])
    v["b_idle"] = np.where(off & (dim == 1), v["b_idle"] + k * sd_idle, v["b_idle"])
    v["b_fuel"] = np.where(off & (dim == 2), v["b_fuel"] * (1 + k * 0.04), v["b_fuel"])
    v["b_smooth"] = np.where(off & (dim == 3), v["b_smooth"] - k * 3.5, v["b_smooth"])
    v["b_smooth"] = np.clip(v["b_smooth"], 5, 99)
    v["b_idle"] = np.clip(v["b_idle"], 0.5, 70)   # physical cap: ≤58 % of session idle

    # ------------------------------------------------------------ machine state
    slope = np.clip(v["slope_true"], 0, 30)
    load_pct = np.clip(v["Load_Percentage"], 0, 115)
    vis = v["vis_true"]
    direction = v["Travel_Direction"]
    moving = np.isin(direction, ["Forward", "Reverse"])
    typical = np.where(mtype == "Excavator", 2.9, 7.2)
    cond = (1 - 0.018 * slope) * (1 - 0.35 * aware * np.clip((70 - vis) / 70, 0, 1)) * \
        pd.Series(v["Ground_Condition"]).map({"Muddy": .8, "Wet": .9, "Loose": .88}).fillna(1).to_numpy()
    speed_true = np.where(moving, typical * v["b_speed"] * np.clip(cond, 0.35, 1.1),
                          rng.uniform(0, 0.8, n) * v["b_speed"])
    speed_true = np.clip(speed_true, 0, vmax)

    mode = v["Operating_Mode"]
    eng_load = 30 + 38 * load_pct / 100 + 0.9 * slope + np.select([mode == "Eco", mode == "Power"], [-6, 8], 0) \
        + np.where(np.isin(task, ["Excavation", "Trenching"]), 6, 0) + rng.normal(0, 4, n)
    eng_load = np.clip(eng_load, 10, 100)

    doy = day.astype(float)
    health = np.clip(mac["Base_Health"].to_numpy() - 0.02 * doy + rng.normal(0, 2, n) - v["health_drop"], 20, 100)
    amb = v["Ambient_Temperature"]
    eng_temp = 80 + 0.14 * (eng_load - 60) + 0.30 * (amb - 30) + 0.12 * (85 - health) + rng.normal(0, 1.5, n) + v["temp_fault_eng"]
    hyd_temp = 58 + 0.28 * (eng_load - 60) + 0.45 * (amb - 30) + 0.15 * (85 - health) + rng.normal(0, 2.0, n) + v["temp_fault_hyd"]
    eng_temp = np.clip(eng_temp, 66, 119); hyd_temp = np.clip(hyd_temp, 32, 109)
    engine_hours = mac["Engine_Hours_Start"].to_numpy() + doy * rng.uniform(6.5, 8.5, n)

    # ------------------------------------------------------------ task execution
    skill = ops["L_Skill"].to_numpy()
    gc_f = pd.Series(v["Ground_Condition"]).map({"Wet": 1.06, "Muddy": 1.18, "Loose": 1.10, "Rocky": 1.08}).fillna(1).to_numpy()
    w_f = pd.Series(W).map({"Heavy_Rain": 1.15, "Light_Rain": 1.05, "Dust_Wind": 1.07, "Fog": 1.08}).fillna(1).to_numpy()
    tfac = np.array([C.TASK_CYCLE_FACTOR[t] for t in task])
    cycle = cycle_s * tfac * (1 + 0.12 * (v["Task_Complexity"] - 3)) * (1.30 - 0.5 * skill) * (1 + 0.014 * slope) \
        * gc_f * w_f * (1 + 0.004 * np.clip(70 - vis, 0, None)) * (1 + 0.006 * np.clip(85 - health, 0, None)) \
        * (1 + 0.25 * np.clip(load_pct - 90, 0, None) / 20) * np.select([mode == "Eco", mode == "Power"], [1.06, 0.95], 1.0) \
        * rng.lognormal(0, 0.05, n)
    load_w = payload * load_pct / 100 * rng.lognormal(0, 0.03, n)

    interrupted = rng.random(n) < (0.04 + 0.10 * (W == "Heavy_Rain") + 0.06 * (scen == "MACHINE_OVERHEATING"))
    completed = np.where(interrupted, v["Target_Quantity"] * rng.uniform(0.45, 0.95, n), v["Target_Quantity"])
    cycles = np.ceil(completed / load_w).astype(int)
    productive = cycles * cycle / 60
    stoppage = rng.exponential(np.where(v["Working_Zone"] == "Zone B", 9, 5)) + np.where(interrupted, rng.uniform(10, 40, n), 0)
    # b_idle = idle minutes per 120 minutes of SESSION time  ⇒  idle / (productive + stoppage + idle) = b_idle / 120
    idle = v["b_idle"] * (productive + stoppage) / (120 - v["b_idle"])
    actual = np.clip((productive + idle + stoppage) * rng.lognormal(0, 0.04, n), 10, 1500)

    planner = (v["Target_Quantity"] / (payload * 0.75)) * cycle_s * tfac / 60 * 1.20
    hist_prod = (v["Target_Quantity"] / (payload * 0.72)) * cycle_s * tfac * (1.30 - 0.5 * skill) * 1.03 / 60
    hab = ops["L_Idle_Habit"].to_numpy()
    hist_dur = (hist_prod + 6) * 120 / (120 - hab) * rng.lognormal(0, 0.08, n)

    progress = rng.uniform(0.05, 0.95, n)
    elapsed_frac = progress ** rng.uniform(0.85, 1.15, n)
    remaining = actual * (1 - elapsed_frac)

    # fuel: active burn while working, ~28 % while idling / stopped
    active_rate = fuel_lph * (0.45 + 0.9 * eng_load / 100) * np.select([mode == "Eco", mode == "Power"], [0.90, 1.12], 1.0) * v["b_fuel"]
    active_frac = productive / (productive + idle + stoppage)
    fuel_rate = active_rate * (active_frac + 0.28 * (1 - active_frac))
    fuel_obs = np.clip(fuel_rate * rng.lognormal(0, 0.03, n), 2, 50)
    total_fuel = fuel_rate * actual / 60
    fuel_eff = completed / total_fuel

    dur_h = actual / 60
    harsh_acc = rng.poisson(0.55 * np.maximum(v["b_harsh"], 0.02) * dur_h)
    harsh_brk = rng.poisson(0.45 * np.maximum(v["b_harsh"], 0.02) * dur_h)
    rapid = rng.poisson(np.maximum(v["b_rapid"], 0.1) * dur_h)
    lam_viol = (0.3 + 1.5 * (1 - aware)) * dur_h
    prox_viol = rng.poisson(lam_viol) + v["prox_viol_extra"].astype(int)

    # ------------------------------------------------------------ safety snapshot (observed = true + sensor noise)
    prox = np.clip(v["prox_true"], 0.5, 20)
    worker_like = np.isin(obst, ["Worker", "Vehicle"])
    reverse = direction == "Reverse"
    blind_p = sigmoid(-3.2 + 1.1 * reverse + 1.3 * (prox < 4) + v["blind_bias"] + 0.8 * (vis < 50))
    blind = worker_like & (rng.random(n) < blind_p)
    seatbelt = rng.random(n) < np.clip(v["seatbelt_p"], 0, 1)

    obs_speed = np.clip(speed_true + rng.normal(0, 0.2, n), 0, 15)
    obs_prox = np.round(np.clip(prox * rng.lognormal(0, 0.08, n), 0.5, 20), 2)
    obs_slope = np.clip(slope + rng.normal(0, 0.7, n), 0, 30)
    obs_vis = np.clip(vis + rng.normal(0, 4, n), 0, 100)

    # ------------------------------------------------------------ GROUND-TRUTH SAFETY RISK
    # Built from TRUE values + latent operator awareness + unobserved situational noise.
    # The model only ever sees the noisy observed columns, so perfect accuracy is impossible by design.
    prox_w = pd.Series(obst).map({"Worker": 1.0, "Vehicle": 0.8, "Structure": 0.45, "Material_Pile": 0.3,
                                  "Utility_Marker": 0.55}).fillna(0).to_numpy()
    P = prox_w * np.exp(-(prox - 0.5) / 2.0)
    sp = speed_true / 10
    smooth = np.clip(v["b_smooth"], 0, 100)
    harsh_rate = (harsh_acc + harsh_brk) / dur_h
    terms = {
        "proximity": 3.0 * P + 2.8 * P * sp + (0.9 + 0.6 * reverse) * blind + 1.2 * (1 - vis / 100) * P,
        "speed": 1.5 * sp,
        "terrain": 0.065 * slope + 0.0012 * slope ** 2 + 0.9 * (slope / 20) * np.clip(load_pct - 70, 0, None) / 30
                   + pd.Series(v["Ground_Condition"]).map({"Muddy": .4, "Wet": .25, "Loose": .3, "Rocky": .15}).fillna(0).to_numpy(),
        "load": 0.8 * (load_pct / 100) ** 2,
        "visibility": 1.3 * (1 - vis / 100) ** 1.4,
        "machine": 0.025 * np.clip(80 - health, 0, None) + 0.06 * np.clip(eng_temp - 100, 0, None),
        "control": 0.9 * (1 - smooth / 100) + 0.12 * np.minimum(harsh_rate, 10) + 0.5 * (~seatbelt),
    }
    latent = 0.8 * (0.5 - aware) + 0.25 * night + rng.normal(0, 0.35, n)
    logit = -3.55 + sum(terms.values()) + latent
    score = np.round(100 * sigmoid(logit), 1)
    level = pd.cut(score, C.RISK_BINS, labels=C.RISK_LEVELS, right=False).astype(str)

    p_event = 0.8 * sigmoid(2.2 * (logit - 1.0))
    event = rng.random(n) < p_event
    # incident type: sample in proportion to exp(2 × term contribution)
    tmat = np.column_stack([terms["proximity"], terms["terrain"] + 0.5 * terms["load"], terms["machine"],
                            terms["control"] + 0.5 * terms["speed"], terms["visibility"] + 0.3 * terms["terrain"]])
    probs = np.exp(2 * tmat); probs /= probs.sum(1, keepdims=True)
    kind = (probs.cumsum(1) < rng.random(n)[:, None]).sum(1).clip(0, 4)
    prox_name = np.select([obst == "Worker", obst == "Vehicle"], ["Proximity_Near_Miss", "Vehicle_Interaction"], "Obstacle_Contact")
    inc = np.select([kind == 0, kind == 1, kind == 2, kind == 3],
                    [prox_name, "Stability_Loss", "Overheating_Shutdown", "Harsh_Maneuver"], "Loss_of_Traction").astype(object)
    inc = np.where(event, inc, "No_Incident")
    estop = (event & (rng.random(n) < 0.55)) | (~event & (score >= 75) & (rng.random(n) < 0.12)) | (rng.random(n) < 0.003)

    # ------------------------------------------------------------ GROUND-TRUTH PERSONAL ANOMALY
    # deviation of THIS session's behaviour from THIS operator's latent baseline, in personal SDs
    z = {
        "idle": (v["b_idle"] - ops["L_Idle_Habit"].to_numpy()) / ops["L_Idle_SD"].to_numpy(),
        "speed": (v["b_speed"] / ops["L_Speed_Factor"].to_numpy() - 1) / ops["L_Speed_SD"].to_numpy(),
        "fuel": (v["b_fuel"] / ops["L_Fuel_Habit"].to_numpy() - 1) / 0.04,
        "control": (ops["L_Smoothness"].to_numpy() - v["b_smooth"]) / 3.5,
        "harsh": (v["b_harsh"] / ops["L_Harsh_Rate"].to_numpy() - 1) / 0.354,
        "proximity": (prox_viol - lam_viol) / np.sqrt(lam_viol + 1),
    }
    Z = np.column_stack(list(z.values()))
    zmax = Z.max(1)
    reason_names = np.array(["Excessive_Idle", "Unusual_Speed", "Abnormal_Fuel", "Erratic_Control",
                             "Repeated_Harsh_Events", "Repeated_Proximity_Violations"], dtype=object)
    anomaly = zmax >= C.ANOMALY_Z
    anomaly_score = np.round(sigmoid(1.2 * (zmax - C.ANOMALY_Z)), 4)
    reason = np.where(anomaly, reason_names[Z.argmax(1)], "Normal")

    # ------------------------------------------------------------ operator profile at time of session
    train = np.clip(ops["Training_Score_Start"].to_numpy() + doy / C.N_DAYS * rng.uniform(0, 8, n), 0, 100)

    df = pd.DataFrame({
        "Record_ID": [f"R{i + 1:06d}" for i in range(n)],
        "Timestamp": ts.strftime("%Y-%m-%d %H:%M"),
        "Scenario": scen,
        # machine
        "Machine_ID": mach_ids, "Machine_Type": mtype, "Machine_Model_Class": mcls,
        "Engine_Hours": np.round(engine_hours, 1), "Machine_Age": np.round(mac["Machine_Age"].to_numpy() + doy / 365, 2),
        "Engine_Temperature": np.round(eng_temp, 1), "Hydraulic_Temperature": np.round(hyd_temp, 1),
        "Machine_Speed": np.round(obs_speed, 2), "Fuel_Consumption": np.round(fuel_obs, 2),
        "Machine_Health_Score": np.round(health, 1), "Engine_Load_Percentage": np.round(eng_load, 1),
        # operator
        "Operator_ID": ops["Operator_ID"].to_numpy(), "Experience_Level": ops["Experience_Level"].to_numpy(),
        "Years_Experience": ops["Years_Experience"].to_numpy(), "Operating_Shift": shift,
        "Historical_Efficiency": ops["Historical_Efficiency"].to_numpy(), "Historical_Idle_Time": ops["Historical_Idle_Time"].to_numpy(),
        "Training_Score": np.round(train, 1), "Previous_Safety_Events": ops["Previous_Safety_Events"].to_numpy(),
        "Operator_Skill_Score": ops["Operator_Skill_Score"].to_numpy(),
        # operation
        "Load_Weight": np.round(load_w, 2), "Load_Percentage": np.round(load_pct, 1), "Load_Cycles": cycles,
        "Idle_Time": np.round(idle, 1), "Operating_Mode": mode, "Travel_Direction": direction,
        "Harsh_Acceleration": harsh_acc, "Harsh_Braking": harsh_brk, "Rapid_Control_Input": rapid,
        "Control_Smoothness": np.round(np.clip(smooth + rng.normal(0, 1.5, n), 0, 100), 1),
        "Proximity_Violations": prox_viol,
        # safety snapshot
        "Seatbelt_Status": np.where(seatbelt, "Fastened", "Unfastened"),
        "Proximity_Distance": np.round(obs_prox, 2), "Obstacle_Type": obst,
        "Blind_Zone_Entry": blind.astype(int), "Ground_Slope": np.round(obs_slope, 1),
        "Safety_Zone_Status": np.select([obs_prox < 3, obs_prox < 6], ["Violated", "Warning"], "Clear"),
        "Emergency_Stop": estop.astype(int), "Safety_Event": event.astype(int),
        # environment
        "Weather": W, "Visibility": np.round(obs_vis, 1), "Ambient_Temperature": np.round(amb, 1),
        "Dust_Level": np.round(v["Dust_Level"], 1), "Ground_Condition": v["Ground_Condition"],
        "Terrain_Type": T, "Working_Zone": v["Working_Zone"], "Lighting_Condition": L,
        # task
        "Task_ID": [f"TSK-{i + 1:06d}" for i in range(n)], "Task_Type": task, "Task_Complexity": v["Task_Complexity"],
        "Target_Quantity": np.round(v["Target_Quantity"], 1), "Completed_Quantity": np.round(completed, 1),
        "Historical_Task_Duration": np.round(hist_dur, 1), "Current_Task_Progress": np.round(progress, 3),
        "Estimated_Task_Duration": np.round(planner, 1), "Actual_Task_Duration": np.round(actual, 1),
        "Total_Fuel_Used": np.round(total_fuel, 1),
        # targets
        "Safety_Risk_Score": score, "Safety_Risk_Level": level,
        "Operator_Anomaly": anomaly.astype(int), "Anomaly_Score": anomaly_score, "Anomaly_Reason": reason,
        "Task_Completion_Time": np.round(remaining, 1), "Incident_Type": inc, "Fuel_Efficiency": np.round(fuel_eff, 2),
    })
    df = df.sort_values(["Timestamp", "Record_ID"]).reset_index(drop=True)
    for c in df.columns:
        if df[c].dtype == object:
            df[c] = df[c].astype(str)
    return df, operators, machines


def main():
    os.makedirs(OUT, exist_ok=True)
    df, operators, machines = generate()

    df.to_csv(os.path.join(OUT, "cat_operator_synthetic.csv"), index=False)
    df.sample(500, random_state=C.RANDOM_SEED).sort_values("Timestamp").to_csv(
        os.path.join(OUT, "cat_operator_synthetic_sample.csv"), index=False)

    pub_ops = operators[["Operator_ID", "Years_Experience", "Experience_Level", "Operating_Shift", "Primary_Machine_Type",
                         "Primary_Machine_ID", "Operator_Skill_Score", "Training_Score_Start", "Historical_Efficiency",
                         "Historical_Idle_Time", "Previous_Safety_Events"]]
    pub_ops.to_csv(os.path.join(OUT, "operators.csv"), index=False)
    machines[["Machine_ID", "Machine_Type", "Machine_Model_Class", "Machine_Age", "Engine_Hours_Start"]].to_csv(
        os.path.join(OUT, "machines.csv"), index=False)
    # latent traits: for auditing the generator ONLY — never use as model features
    operators.filter(regex="^(Operator_ID|L_)").round(4).to_csv(os.path.join(OUT, "operators_latent_AUDIT_ONLY.csv"), index=False)

    realised = df["Scenario"].value_counts(normalize=True)
    dist = pd.DataFrame({"Scenario": list(C.SCENARIO_MIX), "Target_Share": list(C.SCENARIO_MIX.values())})
    dist["Realised_Share"] = dist["Scenario"].map(realised).fillna(0).round(4)
    dist["Rows"] = dist["Scenario"].map(df["Scenario"].value_counts()).fillna(0).astype(int)
    dist["Critical_or_High_Share"] = dist["Scenario"].map(
        df.groupby("Scenario")["Safety_Risk_Level"].apply(lambda s: s.isin(["HIGH", "CRITICAL"]).mean())).round(3)
    dist["Anomaly_Share"] = dist["Scenario"].map(df.groupby("Scenario")["Operator_Anomaly"].mean()).round(3)
    dist.to_csv(os.path.join(OUT, "scenario_distribution.csv"), index=False)

    dd = pd.DataFrame(DICTIONARY, columns=["Column", "Group", "Role", "Type", "Unit", "Description", "Leakage_Notes"])
    missing = set(df.columns) - set(dd["Column"]); extra = set(dd["Column"]) - set(df.columns)
    if missing or extra:
        raise SystemExit(f"data dictionary out of sync: missing={missing} extra={extra}")
    dd["Min"] = dd["Column"].map(lambda c: df[c].min() if pd.api.types.is_numeric_dtype(df[c]) else "")
    dd["Max"] = dd["Column"].map(lambda c: df[c].max() if pd.api.types.is_numeric_dtype(df[c]) else "")
    dd["Example"] = dd["Column"].map(lambda c: df[c].iloc[0])
    dd.to_csv(os.path.join(OUT, "data_dictionary.csv"), index=False)

    with open(os.path.join(OUT, "cat_operator_synthetic.csv"), "rb") as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    meta = dict(dataset_version=C.DATASET_VERSION, random_seed=C.RANDOM_SEED, rows=len(df), columns=df.shape[1],
                operators=C.N_OPERATORS, machines=C.N_EXCAVATORS + C.N_LOADERS, days=C.N_DAYS, start_date=C.START_DATE,
                sha256=sha, generated_utc=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                note="SYNTHETIC prototype data. Not real CAT telemetry.")
    with open(os.path.join(OUT, "dataset_metadata.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print(f"wrote {len(df):,} rows × {df.shape[1]} cols → {OUT}\nsha256 {sha}")


if __name__ == "__main__":
    main()
