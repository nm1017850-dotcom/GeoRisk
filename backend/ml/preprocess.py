"""Shared, explicit input schema for training and inference."""
import math

NUMERIC = ['latitude', 'longitude', 'elevation', 'slope', 'rainfall_accumulation', 'rainfall_intensity', 'fault_distance']
CATEGORICAL = ['soil', 'land_cover']
FEATURES = NUMERIC + CATEGORICAL
RANGES = {'latitude': (40, 56), 'longitude': (46, 88), 'elevation': (-500, 9000), 'slope': (0, 90), 'rainfall_accumulation': (0, 10000), 'rainfall_intensity': (0, 1000), 'fault_distance': (0, 10000)}


def validate_record(record):
    """Return normalized features or raise ValueError; fault distance is optional (km)."""
    result = {}
    for key in NUMERIC:
        value = record.get(key)
        if key == 'fault_distance' and (value is None or value == '' or (isinstance(value, float) and math.isnan(value))):
            result[key] = float('nan')
            continue
        try:
            value = float(value)
        except (ValueError, TypeError):
            raise ValueError(f'{key}: сандық мән қажет') from None
        lo, hi = RANGES[key]
        if not math.isfinite(value) or not lo <= value <= hi:
            raise ValueError(f'{key}: рұқсат етілген аралық {lo}–{hi}')
        result[key] = value
    for key in CATEGORICAL:
        value = record.get(key)
        if not isinstance(value, str) or not value.strip() or len(value) > 100:
            raise ValueError(f'{key}: санат қажет')
        result[key] = value.strip()
    return result
