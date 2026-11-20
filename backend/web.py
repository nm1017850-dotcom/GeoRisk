"""Serve the compiled dashboard and API from one origin."""

import os
from base64 import b64decode
from binascii import Error
from hmac import compare_digest
from pathlib import Path

from fastapi import Request
from fastapi.responses import FileResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from app import app


BUILD = Path(__file__).resolve().parents[1] / "frontend" / "dist"
PASSWORD = os.getenv("GEORISK_SITE_PASSWORD")
if os.getenv("GEORISK_REQUIRE_AUTH") == "1" and not PASSWORD:
    raise RuntimeError("GEORISK_SITE_PASSWORD is required for this deployment.")

if PASSWORD:
    expected_credentials = f"georisk:{PASSWORD}".encode("utf-8")

    @app.middleware("http")
    async def authenticate(request: Request, call_next):
        if request.url.path == "/api/health" and request.method == "GET":
            return await call_next(request)

        scheme, _, encoded = request.headers.get("authorization", "").partition(" ")
        if scheme.lower() == "basic":
            try:
                credentials = b64decode(encoded, validate=True)
            except (Error, ValueError):
                credentials = b""
            if compare_digest(credentials, expected_credentials):
                return await call_next(request)

        return Response(
            status_code=401,
            headers={"WWW-Authenticate": 'Basic realm="GeoRisk AI", charset="UTF-8"'},
        )

app.mount("/assets", StaticFiles(directory=BUILD / "assets"), name="assets")


@app.get("/api/session", include_in_schema=False)
def session():
    return RedirectResponse("/", status_code=303)


@app.get("/", include_in_schema=False)
@app.get("/map", include_in_schema=False)
@app.get("/prediction", include_in_schema=False)
@app.get("/alerts", include_in_schema=False)
@app.get("/reports", include_in_schema=False)
@app.get("/model", include_in_schema=False)
def frontend():
    return FileResponse(BUILD / "index.html", headers={"Cache-Control": "no-cache"})
