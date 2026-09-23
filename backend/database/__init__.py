"""SQLite database: schema + one-time seeding from the synthetic dataset.

Deliberately simple (stdlib sqlite3, no ORM). The database is rebuilt from data/ + models/ by
`python -m backend.database.seed` or automatically on first start if the file is missing.

What is NOT copied from the dataset: the latent `Scenario` and the generator's ground-truth labels
(Safety_Risk_Score/Level, Operator_Anomaly/Score/Reason, Task_Completion_Time). A real deployment would
not have them; every risk or anomaly value the API serves is produced by the trained models instead.
Recorded incidents (Safety_Event, Incident_Type) ARE kept — a real site would log those.
"""
import json
import os
import sqlite3
import threading
from datetime import date, datetime, timedelta

import pandas as pd

from backend import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS operators (
  operator_id TEXT PRIMARY KEY, years_experience REAL, experience_level TEXT, operating_shift TEXT,
  primary_machine_type TEXT, primary_machine_id TEXT, operator_skill_score REAL, training_score REAL,
  historical_efficiency REAL, historical_idle_time REAL, previous_safety_events INTEGER);
CREATE TABLE IF NOT EXISTS machines (
  machine_id TEXT PRIMARY KEY, machine_type TEXT, machine_model_class TEXT, machine_age REAL,
  engine_hours REAL, tank_litres REAL, site TEXT);
CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY, operator_id TEXT, machine_id TEXT, day TEXT, seq INTEGER, task_type TEXT, zone TEXT,
  status TEXT, target_quantity REAL, task_complexity INTEGER, planned_start TEXT, started_at TEXT,
  completed_at TEXT, actual_min REAL, progress REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS safety_events (
  event_id TEXT PRIMARY KEY, operator_id TEXT, machine_id TEXT, ts TEXT, source TEXT, peak_score REAL,
  peak_level TEXT, incident_type TEXT, summary TEXT, action TEXT, response_s REAL, frames TEXT);
CREATE TABLE IF NOT EXISTS operator_profiles (operator_id TEXT PRIMARY KEY, twin TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS shift_sessions (operator_id TEXT PRIMARY KEY, started_at TEXT, session TEXT);
CREATE TABLE IF NOT EXISTS training_modules (module_id TEXT PRIMARY KEY, spec TEXT);
CREATE TABLE IF NOT EXISTS training_progress (
  operator_id TEXT, module_id TEXT, status TEXT, progress REAL, score REAL, attempts INTEGER DEFAULT 0,
  completed_at TEXT, PRIMARY KEY (operator_id, module_id));
CREATE TABLE IF NOT EXISTS predictions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, request TEXT, response TEXT);
CREATE TABLE IF NOT EXISTS simulation_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, operator_id TEXT, kind TEXT, payload TEXT);
CREATE INDEX IF NOT EXISTS ix_tel_op ON telemetry (Operator_ID, Timestamp);
"""

DROP_COLUMNS = ["Scenario", "Safety_Risk_Score", "Safety_Risk_Level", "Operator_Anomaly", "Anomaly_Score",
                "Anomaly_Reason", "Task_Completion_Time"]

_local = threading.local()
_seed_lock = threading.Lock()


_GEN = [0]


def use_path(path):
    """Point the app at another SQLite file (used by tests for isolation) and drop in-memory state tied to the old one."""
    config.DB_PATH = path
    _GEN[0] += 1
    from backend.services import telemetry, twin
    twin._cache.clear()
    telemetry._STATES.clear()


def connect() -> sqlite3.Connection:
    """One connection per thread (FastAPI runs sync endpoints in a thread pool)."""
    conn = getattr(_local, "conn", None)
    if conn is not None and getattr(_local, "gen", 0) != _GEN[0]:   # database switched (tests) → reconnect
        conn.close(); conn = None
    if conn is None:
        os.makedirs(os.path.dirname(config.DB_PATH), exist_ok=True)
        conn = sqlite3.connect(config.DB_PATH, check_same_thread=False, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        _local.conn = conn
        _local.gen = _GEN[0]
    return conn


def rows(sql, params=()):
    return [dict(r) for r in connect().execute(sql, params).fetchall()]


def one(sql, params=()):
    r = connect().execute(sql, params).fetchone()
    return dict(r) if r else None


def execute(sql, params=()):
    c = connect()
    c.execute(sql, params)
    c.commit()


def meta(key, default=None):
    r = one("SELECT value FROM meta WHERE key=?", (key,))
    return json.loads(r["value"]) if r else default


def set_meta(key, value):
    execute("INSERT OR REPLACE INTO meta VALUES (?,?)", (key, json.dumps(value)))


def is_seeded():
    try:
        return meta("seeded_at") is not None
    except sqlite3.OperationalError:
        return False


def ensure_seeded():
    with _seed_lock:
        if not is_seeded():
            seed()


def seed():
    """Build the database from the dataset and trained models (≈10–20 s, once)."""
    from ml.common import load_data
    from ml.inference import safety
    from backend.services import telemetry, training

    df = load_data()
    # ---- calendar: shift synthetic dates so the last recorded day is "yesterday"
    ts = pd.to_datetime(df["Timestamp"])
    offset = (date.today() - timedelta(days=1)) - ts.max().date()
    df["Timestamp"] = (ts + pd.Timedelta(days=offset.days)).dt.strftime("%Y-%m-%d %H:%M")
    # ---- model-predicted risk for every historical session (the ground-truth index is NOT stored)
    df["pred_risk"] = safety().score_frame(df)
    df["pred_level"] = safety().level_of(df["pred_risk"].to_numpy())
    tel = df.drop(columns=DROP_COLUMNS)

    c = connect()
    for t in ["telemetry", "operators", "machines", "tasks", "safety_events", "operator_profiles", "shift_sessions",
              "training_modules", "training_progress", "predictions", "simulation_events", "meta"]:
        c.execute(f"DROP TABLE IF EXISTS {t}")
    tel.to_sql("telemetry", c, index=False)
    c.executescript(SCHEMA)

    syn = os.path.join(config.ROOT, "data", "synthetic")
    ops = pd.read_csv(os.path.join(syn, "operators.csv"))
    latest_train = df.sort_values("Timestamp").groupby("Operator_ID")["Training_Score"].last()
    for _, o in ops.iterrows():
        c.execute("INSERT INTO operators VALUES (?,?,?,?,?,?,?,?,?,?,?)", (
            o.Operator_ID, o.Years_Experience, o.Experience_Level, o.Operating_Shift, o.Primary_Machine_Type,
            o.Primary_Machine_ID, o.Operator_Skill_Score, float(latest_train.get(o.Operator_ID, o.Training_Score_Start)),
            o.Historical_Efficiency, o.Historical_Idle_Time, int(o.Previous_Safety_Events)))
    mac = pd.read_csv(os.path.join(syn, "machines.csv"))
    tank = {"Medium Excavator (20t class)": 410, "Large Excavator (30t class)": 520,  # PROJECT assumptions (litres)
            "Medium Wheel Loader": 300, "Large Wheel Loader": 450}
    last_hours = df.groupby("Machine_ID")["Engine_Hours"].max()
    for _, m in mac.iterrows():
        c.execute("INSERT INTO machines VALUES (?,?,?,?,?,?,?)", (
            m.Machine_ID, m.Machine_Type, m.Machine_Model_Class, float(m.Machine_Age),
            float(last_hours.get(m.Machine_ID, m.Engine_Hours_Start)), tank[m.Machine_Model_Class], config.SITE_NAME))

    # ---- recorded incidents from history (snapshot only – the dataset has no time series)
    ev = df[df["Safety_Event"] == 1]
    for _, r in ev.iterrows():
        frame = dict(t=0, clock=r.Timestamp[-5:] + ":00", dist=float(r.Proximity_Distance), speed=float(r.Machine_Speed),
                     slope=float(r.Ground_Slope), load=float(r.Load_Percentage), score=float(r.pred_risk),
                     level=str(r.pred_level), obstacle=r.Obstacle_Type, blind=int(r.Blind_Zone_Entry))
        c.execute("INSERT INTO safety_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
            f"INC-{r.Record_ID}", r.Operator_ID, r.Machine_ID, r.Timestamp, "incident_log", float(r.pred_risk),
            str(r.pred_level), r.Incident_Type, f"{r.Incident_Type.replace('_', ' ')} during {r.Task_Type.replace('_', ' ')} "
            f"in {r.Working_Zone}", "recorded", None, json.dumps([frame])))
    c.commit()

    set_meta("date_offset_days", offset.days)
    set_meta("seeded_at", datetime.now().isoformat(timespec="seconds"))
    training.seed_modules()
    # one recorded telemetry sequence for the demo operator, produced by the SAME simulator as live events
    telemetry.record_historical_demo_event(config.DEMO_OPERATOR, config.DEMO_MACHINE, days_ago=6)
    return len(df)


if __name__ == "__main__":
    n = seed()
    print(f"seeded {n:,} sessions → {config.DB_PATH}")
