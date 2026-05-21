import httpx
import os as _os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import get_settings
from peoplesoft import trigger_engine
from sftp_client import download_csv
from csv_parser import parse_and_compute

settings = get_settings()
app = FastAPI(title="Sparky Tool")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

_cache: dict = {}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/run")
def run():
    try:
        trigger_engine()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"PeopleSoft error: {exc}")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="PeopleSoft engine timed out")
    except httpx.ConnectError as exc:
        raise HTTPException(status_code=502, detail=f"PeopleSoft unreachable: {exc}")

    try:
        csv_bytes = download_csv()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"SFTP error: {exc}")

    try:
        result = parse_and_compute(csv_bytes)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"CSV parse error: {exc}")

    _cache["last"] = result
    return result


@app.get("/api/results")
def results():
    if "last" not in _cache:
        raise HTTPException(status_code=404, detail="No results yet — run the engine first.")
    return _cache["last"]


# Must be registered AFTER all API routes so /api/* is not shadowed
_frontend_dist = _os.path.join(_os.path.dirname(__file__), "..", "frontend", "dist")
if _os.path.isdir(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="static")
