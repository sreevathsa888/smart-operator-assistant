#!/usr/bin/env bash
# Full reproducible pipeline: data → validation → EDA → 3 models → report → tests.
set -euo pipefail
cd "$(dirname "$0")/.."
python data_generator/generate_dataset.py
python data_generator/validation.py
python ml/eda.py
python ml/train_safety_model.py
python ml/train_anomaly_model.py
python ml/train_task_model.py
python ml/evaluate_models.py
python -m pytest
