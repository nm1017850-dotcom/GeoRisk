"""CLI inference for a JSON feature record, using the locally trained model."""
import argparse
import json
from .model_service import predict

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('json_file')
    args = parser.parse_args()
    with open(args.json_file, encoding='utf-8') as stream:
        print(json.dumps(predict(json.load(stream)), ensure_ascii=False, indent=2))
