"""Shared ML utilities: data loading, splitting, versioned artifact I/O."""
import json
import os
import platform
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.model_selection import GroupShuffleSplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "synthetic", "cat_operator_synthetic.csv")
META = os.path.join(ROOT, "data", "synthetic", "dataset_metadata.json")
MODELS = os.path.join(ROOT, "models")
REPORTS = os.path.join(ROOT, "reports")
FIGS = os.path.join(ROOT, "docs", "figures")
SEED = 42


def load_data() -> pd.DataFrame:
    # keep_default_na=False: category sentinels must never be parsed as NaN
    return pd.read_csv(DATA, keep_default_na=False, na_values=[""])


def dataset_meta() -> dict:
    with open(META) as f:
        return json.load(f)


def operator_split(df: pd.DataFrame, seed: int = SEED):
    """70 / 15 / 15 split with NO operator shared between parts.

    Why operator-grouped: every operator contributes ~330 sessions with a persistent personal style.
    A random row split would put the same operator in train and test, letting a model score well by
    recognising operators instead of generalising to new ones.
    """
    g = df["Operator_ID"].to_numpy()
    idx = np.arange(len(df))
    tr_va, te = next(GroupShuffleSplit(1, test_size=0.15, random_state=seed).split(idx, groups=g))
    tr, va = next(GroupShuffleSplit(1, test_size=0.15 / 0.85, random_state=seed).split(tr_va, groups=g[tr_va]))
    tr, va = tr_va[tr], tr_va[va]
    assert not (set(g[tr]) & set(g[te])) and not (set(g[tr]) & set(g[va])) and not (set(g[va]) & set(g[te]))
    return tr, va, te


def time_split(df: pd.DataFrame, history_days: int = 120):
    """Baseline period (first `history_days`) vs evaluation period – how a Digital Twin is used in practice."""
    ts = pd.to_datetime(df["Timestamp"])
    cut = ts.min().normalize() + pd.Timedelta(days=history_days)
    return np.flatnonzero(ts < cut), np.flatnonzero(ts >= cut), str(cut.date())


def save_artifact(name: str, version: str, obj: dict, metadata: dict):
    """models/<name>/<name>_<version>.joblib + metadata.json."""
    d = os.path.join(MODELS, name)
    os.makedirs(d, exist_ok=True)
    fname = f"{name}_{version}.joblib"
    joblib.dump(obj, os.path.join(d, fname), compress=3)
    ds = dataset_meta()
    meta = dict(model_name=name, version=version, artifact=fname,
                training_date=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                dataset_version=ds["dataset_version"], dataset_sha256=ds["sha256"], random_seed=SEED,
                sklearn_version=sklearn.__version__, python_version=platform.python_version(),
                note="Trained on SYNTHETIC data. Metrics do not indicate real-world performance.", **metadata)
    with open(os.path.join(d, "metadata.json"), "w") as f:
        json.dump(meta, f, indent=2, default=_json_default)
    return os.path.join(d, fname)


def load_artifact(name: str):
    d = os.path.join(MODELS, name)
    with open(os.path.join(d, "metadata.json")) as f:
        meta = json.load(f)
    return joblib.load(os.path.join(d, meta["artifact"])), meta


def _json_default(o):
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    return str(o)
