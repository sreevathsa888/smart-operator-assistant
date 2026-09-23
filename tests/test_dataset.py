"""Dataset generation + validation tests.   Run:  pytest -q tests/test_dataset.py"""
import hashlib
import json
import os

import pandas as pd
import pytest

from data_generator import config as C
from data_generator.data_dictionary import DICTIONARY
from data_generator.generate_dataset import generate
from data_generator.validation import validate

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYN = os.path.join(ROOT, "data", "synthetic")


@pytest.fixture(scope="module")
def full():
    return pd.read_csv(os.path.join(SYN, "cat_operator_synthetic.csv"))


def test_small_generation_is_deterministic():
    a, _, _ = generate(n_records=3000, seed=7)
    b, _, _ = generate(n_records=3000, seed=7)
    pd.testing.assert_frame_equal(a, b)


def test_different_seed_changes_data():
    a, _, _ = generate(n_records=1000, seed=1)
    b, _, _ = generate(n_records=1000, seed=2)
    assert not a["Safety_Risk_Score"].equals(b["Safety_Risk_Score"])


def test_committed_csv_matches_regeneration():
    """The CSV in the repo must be exactly what `python generate_dataset.py` produces."""
    df, _, _ = generate()
    sha = hashlib.sha256(df.to_csv(index=False).encode()).hexdigest()
    meta = json.load(open(os.path.join(SYN, "dataset_metadata.json")))
    assert sha == meta["sha256"]


def test_schema_matches_dictionary(full):
    assert set(full.columns) == {row[0] for row in DICTIONARY}
    assert full.shape == (C.N_RECORDS, len(DICTIONARY))


def test_every_hard_validation_check_passes(full):
    report = validate(full)
    assert not report.failed, report.failed


def test_scenario_is_latent_not_feature():
    roles = {row[0]: row[2] for row in DICTIONARY}
    assert roles["Scenario"] == "LATENT"
    assert roles["Actual_Task_Duration"] == "SESSION_OUTCOME"   # must not feed the task-time model
    assert roles["Emergency_Stop"] == "SESSION_OUTCOME"         # must not feed the safety model


def test_hazard_scenarios_raise_risk(full):
    by = full.groupby("Scenario")["Safety_Risk_Score"].mean()
    assert by["PROXIMITY_HAZARD"] > by["NORMAL_OPERATION"] + 15
    assert by["MULTIPLE_SIMULTANEOUS_RISKS"] > by["PROXIMITY_HAZARD"]
    assert by["EFFICIENT_OPERATION"] < by["NORMAL_OPERATION"]


def test_demo_operator_baseline(full):
    o = full[(full["Operator_ID"] == C.DEMO_OPERATOR) & (full["Operator_Anomaly"] == 0)]
    per2h = o["Idle_Time"] / (o["Actual_Task_Duration"] / 120)
    assert 17 <= per2h.median() <= 25
