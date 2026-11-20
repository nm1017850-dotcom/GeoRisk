"""GeoRisk API. Predictions are produced only by a separately trained model."""
from __future__ import annotations

import csv
import io
import json
import os
import sqlite3
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from ml import model_service

app = FastAPI(title="GeoRisk AI")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])
DB = Path(os.getenv("GEORISK_DB_PATH", str(Path(__file__).parent / "data" / "georisk.db")))
REGIONS = [
    ("abai", "Абай облысы", "Семей", 50.411, 80.228),
    ("akmola", "Ақмола облысы", "Көкшетау", 53.283, 69.383),
    ("aktobe", "Ақтөбе облысы", "Ақтөбе", 50.283, 57.167),
    ("almaty-region", "Алматы облысы", "Қонаев", 43.866, 77.067),
    ("atyrau", "Атырау облысы", "Атырау", 47.116, 51.883),
    ("west-kazakhstan", "Батыс Қазақстан облысы", "Орал", 51.233, 51.367),
    ("zhambyl", "Жамбыл облысы", "Тараз", 42.900, 71.367),
    ("zhetisu", "Жетісу облысы", "Талдықорған", 45.015, 78.373),
    ("karaganda", "Қарағанды облысы", "Қарағанды", 49.806, 73.085),
    ("kostanay", "Қостанай облысы", "Қостанай", 53.215, 63.624),
    ("kyzylorda", "Қызылорда облысы", "Қызылорда", 44.848, 65.502),
    ("mangystau", "Маңғыстау облысы", "Ақтау", 43.653, 51.197),
    ("pavlodar", "Павлодар облысы", "Павлодар", 52.286, 76.967),
    ("north-kazakhstan", "Солтүстік Қазақстан облысы", "Петропавл", 54.875, 69.162),
    ("turkistan", "Түркістан облысы", "Түркістан", 43.297, 68.251),
    ("ulytau", "Ұлытау облысы", "Жезқазған", 47.783, 67.714),
    ("east-kazakhstan", "Шығыс Қазақстан облысы", "Өскемен", 49.948, 82.628),
    ("astana", "Астана", "Астана", 51.169, 71.449),
    ("almaty-city", "Алматы", "Алматы", 43.238, 76.889),
    ("shymkent", "Шымкент", "Шымкент", 42.315, 69.586),
]


def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS assessments (id INTEGER PRIMARY KEY, region TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL, elevation REAL NOT NULL, slope REAL NOT NULL, rainfall_accumulation REAL NOT NULL, rainfall_intensity REAL NOT NULL, soil TEXT NOT NULL, land_cover TEXT NOT NULL, fault_distance REAL, result TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY, assessment_id INTEGER NOT NULL REFERENCES assessments(id), region TEXT NOT NULL, risk TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, created_at TEXT NOT NULL);
        """)


@app.on_event("startup")
def startup():
    init_db()


def now():
    return datetime.now(timezone.utc).isoformat()


def assessment(row):
    d = dict(row)
    d["result"] = json.loads(d["result"])
    return d


class Prediction(BaseModel):
    region: str = Field(min_length=1, max_length=100)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    elevation: float = Field(ge=-500, le=9000, allow_inf_nan=False)
    slope: float = Field(ge=0, le=90, allow_inf_nan=False)
    rainfall_accumulation: float = Field(ge=0, le=10000, allow_inf_nan=False)
    rainfall_intensity: float = Field(ge=0, le=1000, allow_inf_nan=False)
    soil: str = Field(min_length=1, max_length=100)
    land_cover: str = Field(min_length=1, max_length=100)
    fault_distance: float | None = Field(default=None, ge=0, allow_inf_nan=False)


class AlertUpdate(BaseModel):
    status: Literal["new", "reviewed", "closed"]


class AssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    assessment_id: int | None = None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/model/status")
def model_status():
    return model_service.status()


@app.get("/api/regions")
def regions():
    return [dict(zip(("id", "name", "city", "lat", "lon"), row)) for row in REGIONS]


@app.get("/api/assessments")
def assessments(region: str | None = None):
    with connect() as db:
        rows = db.execute("SELECT * FROM assessments WHERE (? IS NULL OR region=?) ORDER BY id DESC", (region, region)).fetchall()
    return [assessment(r) for r in rows]


@app.post("/api/predict")
def predict(body: Prediction):
    if body.region not in {r[1] for r in REGIONS}:
        raise HTTPException(422, "Белгісіз аймақ")
    inputs = body.model_dump()
    try:
        result = model_service.predict(inputs)
    except model_service.ModelNotReady:
        raise HTTPException(503, "ЖИ моделі әзірге дайын емес. Нақты деректермен оқыту қажет.")
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    timestamp = now()
    with connect() as db:
        cur = db.execute("INSERT INTO assessments (region,latitude,longitude,elevation,slope,rainfall_accumulation,rainfall_intensity,soil,land_cover,fault_distance,result,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (*inputs.values(), json.dumps(result, ensure_ascii=False), timestamp))
        assessment_id = cur.lastrowid
        # Alert threshold uses the model's categorical risk, not an invented score.
        levels = {"low": 0, "moderate": 1, "high": 2}
        threshold = os.getenv("ALERT_RISK_THRESHOLD", "high").lower()
        if threshold not in levels:
            threshold = "high"
        risk = result.get("risk")
        if risk in levels and levels[risk] >= levels[threshold]:
            db.execute("INSERT INTO alerts (assessment_id,region,risk,status,description,created_at) VALUES (?,?,?,?,?,?)", (assessment_id, body.region, risk, "new", "Модель нәтижесі ескерту шегіне жетті. Бұл ресми төтенше жағдай ескертуі емес.", timestamp))
        row = db.execute("SELECT * FROM assessments WHERE id=?", (assessment_id,)).fetchone()
    return assessment(row)


@app.get("/api/alerts")
def alerts(region: str | None = None, status: str | None = None):
    with connect() as db:
        rows = db.execute("SELECT * FROM alerts WHERE (? IS NULL OR region=?) AND (? IS NULL OR status=?) ORDER BY id DESC", (region, region, status, status)).fetchall()
    return [dict(r) for r in rows]


@app.patch("/api/alerts/{alert_id}")
def update_alert(alert_id: int, body: AlertUpdate):
    with connect() as db:
        cur = db.execute("UPDATE alerts SET status=? WHERE id=?", (body.status, alert_id))
        if not cur.rowcount:
            raise HTTPException(404, "Ескерту табылмады")
        return dict(db.execute("SELECT * FROM alerts WHERE id=?", (alert_id,)).fetchone())


@app.get("/api/reports/{assessment_id}")
def report(assessment_id: int):
    with connect() as db:
        row = db.execute("SELECT * FROM assessments WHERE id=?", (assessment_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Талдау табылмады")
    return assessment(row)


@app.get("/api/export/assessments.csv")
def export_csv():
    output = io.StringIO(newline="")
    records = assessments()
    fields = ["id", "region", "latitude", "longitude", "elevation", "slope", "rainfall_accumulation", "rainfall_intensity", "soil", "land_cover", "fault_distance", "result", "created_at"]
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    for record in records:
        record["result"] = json.dumps(record["result"], ensure_ascii=False)
        # Prevent spreadsheet formula execution for user-supplied text.
        for key, value in record.items():
            if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
                record[key] = "'" + value
        writer.writerow(record)
    return Response("\ufeff" + output.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": "attachment; filename=georisk-assessments.csv"})


# Per-process rate limit to bound requests; deploy behind a shared limiter for multiple workers.
requests_by_client: dict[str, deque] = defaultdict(deque)


@app.post("/api/assistant")
async def assistant(body: AssistantRequest):
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise HTTPException(503, "AI көмекшісі үшін OPENAI_API_KEY бапталмаған.")
    # A global limiter also protects environments without user authentication.
    queue = requests_by_client["global"]
    timestamp = time.monotonic()
    while queue and queue[0] < timestamp - 60:
        queue.popleft()
    if len(queue) >= 15:
        raise HTTPException(429, "Сұрау шегі асып кетті. Кейінірек қайталаңыз.")
    queue.append(timestamp)
    context = report(body.assessment_id) if body.assessment_id else None
    instruction = ("Сен GeoRisk AI геология көмекшісісің. Тек қазақ тілінде жауап бер. "
                   "Берілген нақты контексттен тыс ағымдағы өлшемдер мен бақылауларды ойдан шығарма; "
                   "дерек жетіспесе айт. Болжам моделін тілдік көмекшіден ажырат. "
                   "Жауап ресми төтенше жағдай ескертуі емес. Контекст: " + json.dumps(context, ensure_ascii=False))
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post("https://api.openai.com/v1/chat/completions", headers={"Authorization": f"Bearer {key}"}, json={"model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"), "messages": [{"role": "system", "content": instruction}, {"role": "user", "content": body.message}], "max_tokens": 800})
            response.raise_for_status()
            answer = response.json()["choices"][0]["message"]["content"]
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        raise HTTPException(502, "AI қызметіне қосылу мүмкін болмады. Кейінірек қайталаңыз.")
    return {"answer": answer}


@app.post("/api/datasets/upload")
async def upload_dataset(file: UploadFile = File(...)):
    name = file.filename or ""
    suffix = Path(name).suffix.lower()
    if suffix not in {".csv", ".geojson"}:
        raise HTTPException(400, "CSV немесе GeoJSON файлын таңдаңыз.")
    data = await file.read(5_000_001)
    if len(data) > 5_000_000:
        raise HTTPException(413, "Файл 5 МБ шегінен асады.")
    try:
        if suffix == ".csv":
            rows = list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))
            if not rows or not {"latitude", "longitude"}.issubset(rows[0]):
                raise ValueError("CSV ішінде latitude және longitude бағандары қажет")
            points = [(r["latitude"], r["longitude"]) for r in rows]
        else:
            obj = json.loads(data)
            if not isinstance(obj, dict) or obj.get("type") != "FeatureCollection" or not isinstance(obj.get("features"), list) or not obj["features"]:
                raise ValueError("GeoJSON FeatureCollection бос болмауы қажет")
            points = []
            for feature in obj["features"]:
                if not isinstance(feature, dict):
                    raise ValueError("GeoJSON feature жарамсыз")
                geom = feature.get("geometry") or {}
                if not isinstance(geom, dict):
                    raise ValueError("GeoJSON geometry жарамсыз")
                if geom.get("type") != "Point" or len(geom.get("coordinates", [])) < 2:
                    raise ValueError("Тек Point геометриясына қолдау көрсетіледі")
                lon, lat = geom["coordinates"][:2]
                points.append((lat, lon))
        for lat, lon in points:
            if not (-90 <= float(lat) <= 90 and -180 <= float(lon) <= 180):
                raise ValueError("Координата ауқымнан тыс")
    except (ValueError, TypeError, KeyError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(422, f"Деректер жарамсыз: {exc}") from exc
    # Validation only: uploaded data are not silently treated as measurements or model training data.
    return {"filename": Path(name).name, "records": len(points), "status": "validated", "message": "Файл тексерілді; талдауға немесе модельді оқытуға автоматты түрде қосылмайды."}
