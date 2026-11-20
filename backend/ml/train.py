"""Train with geographically disjoint train, calibration and test sets.

python -m backend.ml.train --data observations.csv --output backend/models
Input must be validated observations, not synthetic demonstration data.
"""
import argparse
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBClassifier
from .data_loader import load_training_data
from .preprocess import CATEGORICAL, NUMERIC


def train(path, output):
    X, y, groups = load_training_data(path)
    if groups.nunique() < 3:
        raise ValueError('At least three geographical groups are required')
    # Retry deterministic seeds to find disjoint splits containing both labels.
    selected = None
    for seed in range(100):
        train_cal, test = next(GroupShuffleSplit(n_splits=1, test_size=.2, random_state=seed).split(X, y, groups))
        if groups.iloc[train_cal].nunique() < 2:
            continue
        a, b = next(GroupShuffleSplit(n_splits=1, test_size=.25, random_state=seed).split(X.iloc[train_cal], y.iloc[train_cal], groups.iloc[train_cal]))
        train_idx, cal_idx = train_cal[a], train_cal[b]
        if all(y.iloc[idx].nunique() == 2 for idx in (train_idx, cal_idx, test)):
            selected = train_idx, cal_idx, test
            break
    if selected is None:
        raise ValueError('Cannot form geographically separate train/calibration/test sets containing both classes')
    train_idx, cal_idx, test_idx = selected
    transform = ColumnTransformer([
        ('num', SimpleImputer(strategy='median', keep_empty_features=True), NUMERIC),
        ('cat', Pipeline([('impute', SimpleImputer(strategy='most_frequent')), ('encode', OneHotEncoder(handle_unknown='ignore'))]), CATEGORICAL),
    ])
    model = Pipeline([('features', transform), ('classifier', XGBClassifier(n_estimators=150, max_depth=4, learning_rate=.05, n_jobs=2, eval_metric='logloss', random_state=42))])
    model.fit(X.iloc[train_idx], y.iloc[train_idx])
    # Fit sigmoid calibration on disjoint geographical groups; evaluate on a third set.
    def logit(prob):
        prob = np.clip(prob, 1e-6, 1 - 1e-6)
        return np.log(prob / (1 - prob)).reshape(-1, 1)
    calibrator = LogisticRegression().fit(logit(model.predict_proba(X.iloc[cal_idx])[:, 1]), y.iloc[cal_idx])
    probabilities = calibrator.predict_proba(logit(model.predict_proba(X.iloc[test_idx])[:, 1]))[:, 1]
    labels = (probabilities >= .5).astype(int)
    observed = y.iloc[test_idx]
    metrics = {'precision': float(precision_score(observed, labels, zero_division=0)), 'recall': float(recall_score(observed, labels, zero_division=0)), 'f1': float(f1_score(observed, labels, zero_division=0)), 'roc_auc': float(roc_auc_score(observed, probabilities)), 'brier_score': float(brier_score_loss(observed, probabilities)), 'test_samples': len(test_idx), 'calibration_samples': len(cal_idx)}
    version = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    metadata = {'version': version, 'metrics': metrics, 'dataset': {'file': Path(path).name, 'rows': len(X), 'geographic_groups': int(groups.nunique()), 'split': 'geographically disjoint train/calibration/test', 'train_rows': len(train_idx), 'calibration_rows': len(cal_idx), 'test_rows': len(test_idx)}, 'thresholds': {'moderate': .4, 'high': .7}, 'limitations': 'Thresholds are operational defaults, not validated emergency criteria. Model validity depends on representativeness and quality of training data.'}
    dest = Path(output)
    dest.mkdir(parents=True, exist_ok=True)
    # Atomic replace prevents readers from loading a partial artifact.
    with tempfile.NamedTemporaryFile(dir=dest, suffix='.tmp', delete=False) as f:
        temp = f.name
    try:
        joblib.dump({'model': model, 'calibrator': calibrator, 'metadata': metadata}, temp)
        os.replace(temp, dest / 'model.joblib')
    finally:
        if os.path.exists(temp): os.unlink(temp)
    (dest / 'metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', required=True)
    parser.add_argument('--output', default='backend/models')
    args = parser.parse_args()
    print(json.dumps(train(args.data, args.output), ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
