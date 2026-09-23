"""Scenario engine.

A scenario is NOT a label that sets one column. Each scenario perturbs several causally
linked variables in two stages:

  context(v, m, rng)    – categorical conditions (weather, lighting, terrain, obstacle, mode …)
                          applied BEFORE continuous environment values are derived, so e.g.
                          heavy rain automatically lowers visibility and worsens the ground.
  intensity(v, m, rng)  – continuous behaviour / machine state (speed, idle, load, temps …)
                          applied AFTER derivation.

`v` is a dict of numpy arrays (one entry per record), `m` a boolean mask of affected rows.
Scenario is a LATENT generator variable: it is exported for auditing and stratification
but must never be used as a model input (a real machine does not report its "scenario").
"""
import numpy as np

from . import config as C


def _set(v, key, m, values):
    arr = v[key]
    arr[m] = values
    v[key] = arr


def _choice(rng, options, p, size):
    return rng.choice(np.array(options, dtype=object), size=size, p=np.array(p) / np.sum(p))


# ---------------------------------------------------------------- context stage
def ctx_high_load(v, m, rng):
    n = m.sum()
    _set(v, "Operating_Mode", m, _choice(rng, ["Power", "Standard"], [0.65, 0.35], n))
    _set(v, "Target_Quantity", m, v["Target_Quantity"][m] * rng.uniform(1.1, 1.35, n))


def ctx_steep(v, m, rng):
    n = m.sum()
    _set(v, "Terrain_Type", m, _choice(rng, ["Embankment", "Stockpile", "Gentle_Slope"], [0.7, 0.2, 0.1], n))
    _set(v, "Working_Zone", m, _choice(rng, ["Zone E", "Zone A", "Zone D"], [0.6, 0.25, 0.15], n))


def ctx_proximity(v, m, rng):
    n = m.sum()
    _set(v, "Obstacle_Type", m, _choice(rng, ["Worker", "Vehicle"], [0.72, 0.28], n))
    _set(v, "Travel_Direction", m, _choice(rng, ["Reverse", "Forward", "Swinging"], [0.45, 0.35, 0.20], n))


def ctx_unsafe(v, m, rng):
    n = m.sum()
    _set(v, "Operating_Mode", m, _choice(rng, ["Power", "Standard"], [0.6, 0.4], n))
    _set(v, "Travel_Direction", m, _choice(rng, ["Forward", "Reverse"], [0.6, 0.4], n))
    obst = v["Obstacle_Type"][m]
    none = obst == "No_Object"
    obst[none] = _choice(rng, ["Worker", "Vehicle", "Structure"], [0.5, 0.3, 0.2], none.sum())
    _set(v, "Obstacle_Type", m, obst)


def ctx_poor_weather(v, m, rng):
    n = m.sum()
    _set(v, "Weather", m, _choice(rng, ["Heavy_Rain", "Dust_Wind", "Light_Rain"], [0.55, 0.30, 0.15], n))


def ctx_low_visibility(v, m, rng):
    n = m.sum()
    kind = rng.choice(3, n, p=[0.40, 0.35, 0.25])
    w = v["Weather"][m]; l = v["Lighting_Condition"][m]
    l[kind == 0] = "Night_Poor"
    w[kind == 1] = "Fog"
    w[kind == 2] = "Dust_Wind"
    _set(v, "Weather", m, w); _set(v, "Lighting_Condition", m, l)


def ctx_high_fuel(v, m, rng):
    _set(v, "Operating_Mode", m, _choice(rng, ["Power", "Standard"], [0.7, 0.3], m.sum()))


def ctx_efficient(v, m, rng):
    _set(v, "Operating_Mode", m, _choice(rng, ["Eco", "Standard"], [0.65, 0.35], m.sum()))


# ---------------------------------------------------------------- intensity stage
def int_efficient(v, m, rng):
    n = m.sum()
    v["b_idle"][m] *= rng.uniform(0.55, 0.8, n)
    v["b_smooth"][m] = np.minimum(98, v["b_smooth"][m] + rng.uniform(3, 8, n))
    v["b_harsh"][m] *= rng.uniform(0.4, 0.7, n)
    v["b_fuel"][m] *= rng.uniform(0.90, 0.96, n)
    v["prox_true"][m] += rng.uniform(1, 3, n)


def int_high_load(v, m, rng):
    n = m.sum()
    v["Load_Percentage"][m] = rng.uniform(92, 112, n)


def int_excessive_idle(v, m, rng):
    n = m.sum()
    v["b_idle"][m] *= rng.uniform(1.25, 2.6, n)


def int_steep(v, m, rng):
    n = m.sum()
    v["slope_true"][m] = rng.uniform(14, 28, n)
    gc = v["Ground_Condition"][m]
    loose = rng.random(n) < 0.4
    gc[loose & (gc == "Dry")] = "Loose"
    v["Ground_Condition"][m] = gc


def int_proximity(v, m, rng):
    n = m.sum()
    v["prox_true"][m] = rng.uniform(0.6, 3.4, n)
    v["blind_bias"][m] += 1.6
    v["prox_viol_extra"][m] += rng.poisson(2.2, n)


def int_unsafe(v, m, rng):
    n = m.sum()
    v["b_speed"][m] *= rng.uniform(1.15, 1.7, n)
    v["prox_true"][m] = np.maximum(0.6, v["prox_true"][m] * rng.uniform(0.35, 0.7, n))
    v["slope_true"][m] += rng.uniform(2, 6, n)
    v["b_harsh"][m] *= rng.uniform(1.4, 3.2, n)
    v["b_smooth"][m] -= rng.uniform(6, 22, n)
    v["b_rapid"][m] *= rng.uniform(2.2, 3.5, n)
    v["seatbelt_p"][m] *= 0.75
    v["prox_viol_extra"][m] += rng.poisson(1.5, n)


def int_poor_weather(v, m, rng):
    pass  # weather already set in context stage → visibility / ground / dust derived from it


def int_low_visibility(v, m, rng):
    n = m.sum()
    v["vis_true"][m] = rng.uniform(12, 42, n)


def int_high_fuel(v, m, rng):
    n = m.sum()
    v["b_fuel"][m] *= rng.uniform(1.08, 1.45, n)


def int_overheating(v, m, rng):
    n = m.sum()
    v["temp_fault_eng"][m] = rng.uniform(13, 24, n)
    v["temp_fault_hyd"][m] = rng.uniform(16, 28, n)
    v["health_drop"][m] = rng.uniform(15, 30, n)
    v["Ambient_Temperature"][m] += rng.uniform(2, 5, n)


SCENARIOS = {
    "NORMAL_OPERATION":      (None, None),
    "EFFICIENT_OPERATION":   (ctx_efficient, int_efficient),
    "HIGH_LOAD_OPERATION":   (ctx_high_load, int_high_load),
    "EXCESSIVE_IDLE":        (None, int_excessive_idle),
    "STEEP_TERRAIN":         (ctx_steep, int_steep),
    "PROXIMITY_HAZARD":      (ctx_proximity, int_proximity),
    "POOR_WEATHER":          (ctx_poor_weather, int_poor_weather),
    "LOW_VISIBILITY":        (ctx_low_visibility, int_low_visibility),
    "UNSAFE_OPERATION":      (ctx_unsafe, int_unsafe),
    "HIGH_FUEL_CONSUMPTION": (ctx_high_fuel, int_high_fuel),
    "MACHINE_OVERHEATING":   (None, int_overheating),
}
# building blocks combined for MULTIPLE_SIMULTANEOUS_RISKS
MULTI_COMPONENTS = ["PROXIMITY_HAZARD", "UNSAFE_OPERATION", "STEEP_TERRAIN", "POOR_WEATHER",
                    "LOW_VISIBILITY", "HIGH_LOAD_OPERATION"]


def assign_scenarios(rng, ops_for_rows):
    """Sample a scenario per record. Behavioural scenarios depend on the operator's latent traits."""
    names = list(C.SCENARIO_MIX)
    base = np.array([C.SCENARIO_MIX[k] for k in names])
    n = len(ops_for_rows)
    W = np.tile(base, (n, 1))
    idx = {k: i for i, k in enumerate(names)}
    rp = ops_for_rows["L_Risk_Propensity"].to_numpy()
    sk = ops_for_rows["L_Skill"].to_numpy()
    fh = ops_for_rows["L_Fuel_Habit"].to_numpy()
    W[:, idx["UNSAFE_OPERATION"]] *= (rp / 0.35) ** 1.3
    W[:, idx["EXCESSIVE_IDLE"]] *= 1.5 - sk
    W[:, idx["EFFICIENT_OPERATION"]] *= 0.4 + sk
    W[:, idx["HIGH_FUEL_CONSUMPTION"]] *= fh ** 4
    W /= W.sum(1, keepdims=True)
    u = rng.random(n)[:, None]
    pick = (W.cumsum(1) < u).sum(1)
    pick = np.minimum(pick, len(names) - 1)
    return np.array(names, dtype=object)[pick]


def multi_components(rng, n):
    """For each MULTIPLE_SIMULTANEOUS_RISKS row choose 2–3 component scenarios."""
    out = []
    for _ in range(n):
        k = rng.choice([2, 3], p=[0.6, 0.4])
        out.append(tuple(rng.choice(MULTI_COMPONENTS, k, replace=False)))
    return out


def apply_stage(v, scen, multi, stage, rng):
    """stage 0 = context, 1 = intensity."""
    for name, fns in SCENARIOS.items():
        fn = fns[stage]
        if fn is None:
            continue
        m = scen == name
        if m.any():
            fn(v, m, rng)
    # combined-risk rows: apply each chosen component
    mm_idx = np.flatnonzero(scen == "MULTIPLE_SIMULTANEOUS_RISKS")
    for comp in MULTI_COMPONENTS:
        fn = SCENARIOS[comp][stage]
        if fn is None:
            continue
        rows = [i for i, c in zip(mm_idx, multi) if comp in c]
        if rows:
            m = np.zeros(len(scen), bool); m[rows] = True
            fn(v, m, rng)
