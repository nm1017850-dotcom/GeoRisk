"""Validation for explicitly labelled landslide observations."""
import pandas as pd
from .preprocess import FEATURES, validate_record


def load_training_data(path):
    df = pd.read_csv(path)
    missing = set(FEATURES + ['label', 'region_id']) - set(df.columns)
    # Optional fault distance may be absent entirely.
    if 'fault_distance' in missing:
        df['fault_distance'] = None
        missing.remove('fault_distance')
    if missing:
        raise ValueError('Missing columns: ' + ', '.join(sorted(missing)))
    if df['region_id'].isna().any() or (df['region_id'].astype(str).str.strip() == '').any():
        raise ValueError('region_id must be present for geographic group splitting')
    if not df['label'].isin([0, 1]).all():
        raise ValueError('label must contain only 0 or 1')
    rows = []
    for index, row in df.iterrows():
        try:
            rows.append(validate_record(row.to_dict()))
        except ValueError as exc:
            raise ValueError(f'CSV row {index + 2}: {exc}') from exc
    return pd.DataFrame(rows, columns=FEATURES), df['label'].astype(int), df['region_id'].astype(str)
