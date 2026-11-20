"""Local, trusted model artifacts only; never load user-uploaded joblib files."""
from pathlib import Path

MODEL_PATH = Path(__file__).resolve().parents[1] / 'models' / 'model.joblib'
NOT_READY = 'ЖИ моделі әзірге дайын емес. Нақты деректермен оқыту қажет.'

class ModelNotReady(Exception):
    pass


def _load():
    if not MODEL_PATH.is_file():
        raise ModelNotReady(NOT_READY)
    try:
        import joblib
        artifact = joblib.load(MODEL_PATH)
        if not all(k in artifact for k in ('model', 'calibrator', 'metadata')):
            raise ValueError('Incomplete artifact')
        return artifact
    except Exception as exc:
        raise ModelNotReady('Модельді жүктеу мүмкін болмады. Оқыту ортасын тексеріңіз.') from exc


def status():
    try:
        metadata = _load()['metadata']
    except ModelNotReady as exc:
        return {'ready': False, 'message': str(exc)}
    return {'ready': True, 'message': 'Модель жүктелді', 'version': metadata['version'], 'metrics': metadata['metrics'], 'dataset': metadata['dataset'], 'limitations': metadata.get('limitations')}


def predict(features):
    from .preprocess import validate_record
    import numpy as np
    import pandas as pd
    artifact = _load()
    row = pd.DataFrame([validate_record(features)])
    raw = float(artifact['model'].predict_proba(row)[0, 1])
    clipped = np.clip(raw, 1e-6, 1 - 1e-6)
    score = float(artifact['calibrator'].predict_proba([[np.log(clipped / (1 - clipped))]])[0, 1])
    metadata = artifact['metadata']
    thresholds = metadata['thresholds']
    risk = 'high' if score >= thresholds['high'] else 'moderate' if score >= thresholds['moderate'] else 'low'
    return {'risk': risk, 'score': score, 'model_version': metadata['version'], 'factors': [], 'provenance': metadata['dataset'], 'limitations': metadata.get('limitations')}
