import asyncio as _asyncio
import httpx
import os as _os
import time as _time
import uuid as _uuid
import paramiko
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from fastapi import FastAPI, HTTPException, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator

from logger import setup_logging, get_logger
from config import get_settings
from peoplesoft import trigger_engine, poll_status
import sftp_client
import scp_client
from csv_parser import parse_and_compute
from settings_manager import update_env
from sanitize import strip_all_whitespace as _strip_ws

# Initialise logging before anything that might emit a log record
setup_logging()
log = get_logger("main")

settings = get_settings()
_startup_ok = False   # set to True after successful lifespan startup


def _check_required_env() -> None:
    """Fail fast at startup if critical env vars are missing."""
    missing = []
    for var in ("DATABASE_URL", "CLERK_JWKS_URL", "ENCRYPTION_KEY"):
        val = _os.environ.get(var, "") or getattr(settings, var.lower(), "")
        if not val:
            missing.append(var)
    if missing:
        raise RuntimeError(
            f"Required environment variables not set: {', '.join(missing)}. "
            "Configure them in the Render dashboard (Environment → Add Variable)."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _startup_ok
    log.info("=" * 60)
    log.info("Sparky Tool starting up")
    log.info("=" * 60)

    _check_required_env()
    log.info("Environment: required vars present")

    from database import init_db
    init_db(retries=5, delay=3.0)

    # Start background job scheduler
    try:
        import scheduler as _sched
        _sched.start()
    except Exception as _se:
        log.warning("Scheduler failed to start (non-fatal): %s", _se)

    _startup_ok = True
    log.info("Startup complete  v2_routers=%s", _v2_enabled)
    yield
    try:
        import scheduler as _sched
        _sched.stop()
    except Exception:
        pass
    log.info("Shutdown")


app = FastAPI(title="Sparky Tool", lifespan=lifespan)

# CORS — configurable via `settings.cors_origins` (comma-separated).
# Security is enforced via Clerk JWT on authenticated endpoints so CORS
# does not need to be the access-control layer here. When the origin list
# is wildcard ("*"), `allow_credentials` must remain False.
_origins_raw = getattr(settings, "cors_origins", "") or ""
if isinstance(_origins_raw, str):
    _origins = [o.strip() for o in _origins_raw.split(",") if o.strip()]
else:
    _origins = list(_origins_raw)
if not _origins:
    _origins = ["*"]

# If we have a specific allowlist, enable credentials support; otherwise
# keep credentials disabled for the wildcard origin.
_allow_credentials = False
if _origins != ["*"]:
    _allow_credentials = True

log.info("CORS configured — origins=%s  allow_credentials=%s", _origins, _allow_credentials)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=_allow_credentials,
    expose_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("X-XSS-Protection", "1; mode=block")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    return response


@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = _time.time()
    request_id = str(_uuid.uuid4())
    response = await call_next(request)
    elapsed = round((_time.time() - t0) * 1000)
    path = request.url.path

    _silent = {"/favicon.ico", "/api/ping", "/api/health"}
    if not path.startswith("/assets/") and path not in _silent:
        log.info("%-6s %-55s %3d  %d ms", request.method, path, response.status_code, elapsed)

    # Emit wide event for all v2 API calls (fire-and-forget).
    # User identity comes from request.state, set by get_current_user after
    # full JWT signature verification — never from an unverified token decode.
    if _v2_enabled and path.startswith("/api/v2/"):
        user_id = getattr(request.state, "auth_user_id", None)
        _asyncio.create_task(_emit_wide_event(
            path, request.method, response.status_code, elapsed, user_id, request_id,
        ))

    return response


_cache: dict = {}
_v2_enabled = False

# ── Wide-event middleware helpers ─────────────────────────────────────────────


_PATH_EVENT_MAP: list[tuple[str, str, str]] = [
    # (method, path-prefix-or-exact, event-name)
    ("POST",   "/api/v2/run/",                   "run.started"),
    ("POST",   "/api/v2/admin/users/invite",      "user.invited"),
    ("PUT",    "/api/v2/admin/users/",            "user.role_changed"),
    ("PATCH",  "/api/v2/admin/users/",            "user.updated"),
    ("DELETE", "/api/v2/admin/users/",            "user.deleted"),
    ("POST",   "/api/v2/admin/ai-models",         "ai_model.created"),
    ("PUT",    "/api/v2/admin/ai-models/",        "ai_model.updated"),
    ("DELETE", "/api/v2/admin/ai-models/",        "ai_model.deleted"),
    ("POST",   "/api/v2/admin/feature-flags",     "feature_flag.created"),
    ("PATCH",  "/api/v2/admin/feature-flags/",    "feature_flag.updated"),
    ("POST",   "/api/v2/admin/feature-flags/",    "feature_flag.toggled"),
    ("DELETE", "/api/v2/admin/feature-flags/",    "feature_flag.deleted"),
    ("POST",   "/api/v2/configs/",                "config.created"),
    ("PUT",    "/api/v2/configs/",                "config.updated"),
    ("DELETE", "/api/v2/configs/",                "config.deleted"),
    ("PUT",    "/api/v2/preferences",             "preferences.updated"),
    ("POST",   "/api/v2/insights/analyze-file",   "ai_analysis.completed"),
    ("GET",    "/api/v2/admin/stats",             "admin.stats.handled"),
    ("GET",    "/api/v2/admin/events/stream",     "admin.events.stream.handled"),
    ("GET",    "/api/v2/admin/events",            "admin.events.handled"),
    ("GET",    "/api/v2/users/me",                "users.me.handled"),
    ("GET",    "/api/v2/feature-flags",           "feature_flags.handled"),
    ("GET",    "/api/health",                     "health.checked"),
]


def _path_to_event(method: str, path: str) -> str:
    for m, prefix, event in _PATH_EVENT_MAP:
        if method.upper() == m and path.startswith(prefix):
            return event
    return "api.request"


async def _emit_wide_event(
    path: str, method: str, http_status: int, duration_ms: int,
    user_id: str | None, request_id: str,
) -> None:
    """Fire-and-forget wide event writer. Session is always closed via try/finally."""
    from routers.wide_events import get_event_tier, _should_write
    tier = get_event_tier(_path_to_event(method, path))
    if not _should_write(tier):
        return

    try:
        from database import _SessionLocal
        if _SessionLocal is None:
            return
        db = _SessionLocal()
        try:
            from routers.wide_events import write_wide_event
            write_wide_event(
                db,
                event=_path_to_event(method, path),
                status="success" if http_status < 400 else "failed",
                http_method=method,
                http_status=http_status,
                endpoint=path,
                user_id=user_id,
                duration_ms=duration_ms,
                request_id=request_id,
            )
        finally:
            db.close()  # always runs — no more session leaks
    except Exception:
        pass  # wide events are best-effort, never crash the request


# ── v2 routers ────────────────────────────────────────────────────────────────
try:
    from routers import users as _u, configs as _c, runs as _r, admin as _a, insights as _i
    from routers import wide_events as _we, preferences as _pref, feature_flags as _ff
    from routers import conversations as _conv, engines as _eng, run_outputs as _ro
    from routers import schedules as _sched_r, notifications as _notif_r, data_quality as _dq_r
    from routers import analysis_results as _ar
    from routers import company as _company
    from database import get_db
    from models import UserConfig
    from auth import get_current_user
    from run_engine import run_config_engines

    app.include_router(_u.router)
    app.include_router(_c.router)
    app.include_router(_r.router)
    app.include_router(_a.router)
    app.include_router(_i.router)
    app.include_router(_we.router)
    app.include_router(_pref.router)
    app.include_router(_ff.router)
    app.include_router(_conv.router)
    app.include_router(_eng.router)
    app.include_router(_ro.router)
    app.include_router(_sched_r.router)
    app.include_router(_notif_r.router)
    app.include_router(_dq_r.router)
    app.include_router(_ar.router)
    app.include_router(_company.router)
    _v2_enabled = True

    from sqlalchemy.orm import Session

    @app.post("/api/v2/run/{config_id}")
    def run_v2(
        config_id: int,
        request:   Request,
        db:        Session = Depends(get_db),
        user                = Depends(get_current_user),
    ):
        aggregate = run_config_engines(config_id, user, db, request)
        _cache["last"] = aggregate
        return aggregate

except Exception as _init_err:
    # Don't silently disable v2 and serve a broken app — crash at startup so
    # Render restarts the container and surfaces the error in deploy logs.
    log.critical("v2 router import failed — aborting startup: %s", _init_err, exc_info=True)
    raise SystemExit(1) from _init_err


# ── v1 endpoints (backward compat, no auth) ────────────────────────────────

@app.get("/api/health")
def health(response: Response):
    from database import health_check as _db_health
    result = _db_health()
    if not result["ok"]:
        response.status_code = 503
    return {
        "status": "ok" if result["ok"] else "degraded",
        "db": "ok" if result["ok"] else "unavailable",
        "db_latency_ms": result.get("latency_ms"),
        "startup": "ok" if _startup_ok else "pending",
    }


@app.get("/api/ready")
def ready(response: Response):
    """Strict readiness probe — returns 503 until startup is complete and DB is reachable."""
    from database import health_check as _db_health
    if not _startup_ok:
        response.status_code = 503
        return {"ready": False, "reason": "startup_pending"}
    result = _db_health()
    if not result["ok"]:
        response.status_code = 503
        return {"ready": False, "reason": "db_unavailable", "db_latency_ms": result.get("latency_ms")}
    return {"ready": True, "db_latency_ms": result.get("latency_ms")}


@app.get("/api/ping")
def ping():
    """Lightweight keep-alive probe — no DB, no auth, not logged."""
    return {"ok": True}


@app.post("/api/run")
def run():
    from database import _SessionLocal
    from models import Engine as _Engine
    from types import SimpleNamespace as _NS

    # Resolve process name from DB (first active engine by sort order)
    process_name = settings.ps_process_name
    if _SessionLocal is not None:
        db = _SessionLocal()
        try:
            first_engine = (
                db.query(_Engine)
                .filter(_Engine.is_active == True)
                .order_by(_Engine.sort_order, _Engine.id)
                .first()
            )
            if first_engine:
                process_name = first_engine.process_name
        finally:
            db.close()

    if not process_name:
        raise HTTPException(
            status_code=400,
            detail="No active engine configured. Add an engine via the Engines page.",
        )

    run_settings = _NS(**{k: getattr(settings, k) for k in vars(settings) if not k.startswith("_")})
    run_settings.ps_process_name = process_name

    log.info("v1 run triggered  process=%s", process_name)
    start = _time.time()
    try:
        trigger_result = trigger_engine(_settings=run_settings)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"PeopleSoft error: {exc}")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="PeopleSoft engine timed out")
    except httpx.ConnectError as exc:
        raise HTTPException(status_code=502, detail=f"PeopleSoft unreachable: {exc}")

    instance_id = str(trigger_result.get("InstanceID", ""))
    report_id = ""

    if settings.ps_status_endpoint and instance_id:
        try:
            status_result = poll_status(instance_id)
            report_id = str(status_result.get("ReportID", ""))
        except TimeoutError as exc:
            raise HTTPException(status_code=504, detail=str(exc))
        except (httpx.HTTPStatusError, httpx.ConnectError) as exc:
            raise HTTPException(status_code=502, detail=f"PeopleSoft status error: {exc}")

    remote_path = settings.sftp_remote_path
    if report_id:
        remote_path = remote_path.replace("{report_id}", report_id)
    if instance_id:
        remote_path = remote_path.replace("{instance_id}", instance_id)

    method = settings.retrieval_method
    try:
        if method == "scp":
            csv_bytes = scp_client.download_csv(remote_path=remote_path)
        else:
            csv_bytes = sftp_client.download_csv(remote_path=remote_path)
    except Exception as exc:
        label = "SSH/SCP" if method == "scp" else "SFTP"
        raise HTTPException(status_code=503, detail=f"{label} error: {exc}")

    try:
        result = parse_and_compute(csv_bytes)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"CSV parse error: {exc}")

    result["instance_id"] = instance_id
    result["report_id"] = report_id
    _cache["last"] = result

    log.info("v1 run complete  rows=%d  %d ms", result.get("row_count", 0),
             int((_time.time() - start) * 1000))
    return result


@app.get("/api/results")
def results():
    if "last" not in _cache:
        raise HTTPException(status_code=404, detail="No results yet — run the engine first.")
    return _cache["last"]


class SettingsPayload(BaseModel):
    ps_base_url: str = ""
    ps_auth_type: str = "basic"
    ps_username: str = ""
    ps_password: str = ""
    ps_endpoint: str = ""
    ps_status_endpoint: str = ""
    ps_process_name: str = ""
    retrieval_method: str = "sftp"
    sftp_host: str = ""
    sftp_port: int = 22
    sftp_username: str = ""
    sftp_password: str = ""
    sftp_remote_path: str = ""

    @field_validator("ps_base_url", "ps_endpoint", "ps_status_endpoint", "ps_process_name")
    @classmethod
    def _no_whitespace(cls, v: str) -> str:
        return _strip_ws(v)


@app.get("/api/settings")
def get_settings_endpoint():
    return {
        "ps_base_url":        settings.ps_base_url,
        "ps_auth_type":       settings.ps_auth_type,
        "ps_username":        settings.ps_username,
        "ps_endpoint":        settings.ps_endpoint,
        "ps_status_endpoint": settings.ps_status_endpoint,
        "ps_process_name":    settings.ps_process_name,
        "retrieval_method":   settings.retrieval_method,
        "sftp_host":          settings.sftp_host,
        "sftp_port":          settings.sftp_port,
        "sftp_username":      settings.sftp_username,
        "sftp_remote_path":   settings.sftp_remote_path,
    }


@app.post("/api/settings")
def save_settings(payload: SettingsPayload):
    update_env(payload.model_dump())
    settings.__init__()
    return {"saved": True}


@app.post("/api/test-retrieval")
def test_retrieval(payload: SettingsPayload):
    from types import SimpleNamespace as _NS
    s = _NS(**payload.model_dump())
    method = s.retrieval_method
    try:
        if method == "scp":
            files = scp_client.list_files(_settings=s)
        else:
            files = sftp_client.list_files(_settings=s)
        return {"ok": True, "files": files}
    except Exception as exc:
        label = "SSH/SCP" if method == "scp" else "SFTP"
        raise HTTPException(status_code=503, detail=f"{label} connection failed: {exc}")


@app.post("/api/test-peoplesoft")
def test_peoplesoft(payload: SettingsPayload):
    from types import SimpleNamespace as _NS
    s = _NS(**payload.model_dump())
    try:
        result = trigger_engine(_settings=s)
        return {"ok": True, "result": result}
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"PeopleSoft returned {exc.response.status_code}: {exc}")
    except httpx.ConnectError as exc:
        raise HTTPException(status_code=502, detail=f"Cannot reach PeopleSoft: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


class WinPayload(BaseModel):
    win_host: str = ""
    win_port: int = 5985
    win_username: str = ""
    win_password: str = ""
    win_use_ssl: bool = False
    win_auth_type: str = "ntlm"
    win_connection_type: str = "winrm"
    win_share: str = "C$"
    win_domain: str = ""
    path: str = ""


@app.post("/api/test-windows")
def test_windows(payload: WinPayload):
    from types import SimpleNamespace as _NS
    s = _NS(**payload.model_dump())
    try:
        from windows_client import test_connection
        result = test_connection(_settings=s)
        return {"ok": True, "result": result}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.post("/api/win-browse")
def win_browse(payload: WinPayload):
    from types import SimpleNamespace as _NS
    s = _NS(**payload.model_dump())
    try:
        from windows_client import browse
        result = browse(_settings=s, path=payload.path)
        return {"ok": True, "items": result}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.post("/api/win-read-file")
def win_read_file(payload: WinPayload):
    from types import SimpleNamespace as _NS
    s = _NS(**payload.model_dump())
    try:
        from windows_client import read_file
        content = read_file(_settings=s, path=payload.path)
        return {"ok": True, "content": content}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


class FtpPayload(BaseModel):
    ftp_host: str = ""
    ftp_port: int = 21
    ftp_username: str = ""
    ftp_password: str = ""
    ftp_remote_path: str = ""
    ftp_connection_type: str = "ftp"
    ftp_passive: bool = True
    path: str = ""


@app.post("/api/test-ftp")
def test_ftp(payload: FtpPayload):
    from types import SimpleNamespace as _NS
    s = _NS(**payload.model_dump())
    try:
        from ftp_client import test_connection
        result = test_connection(_settings=s)
        return {"ok": True, "result": result}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.post("/api/ftp-browse")
def ftp_browse(payload: FtpPayload):
    from types import SimpleNamespace as _NS
    s = _NS(**payload.model_dump())
    try:
        from ftp_client import browse
        result = browse(_settings=s, path=payload.path)
        return {"ok": True, "items": result}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.post("/api/ftp-read-file")
def ftp_read_file(payload: FtpPayload):
    from types import SimpleNamespace as _NS
    s = _NS(**payload.model_dump())
    try:
        from ftp_client import read_file
        content = read_file(_settings=s, path=payload.path)
        return {"ok": True, "content": content}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


# Serve the React SPA from /build/frontend/dist when running inside Docker.
# The Dockerfile copies the Vite build output there; locally this path
# won't exist and the mount is skipped silently.
import pathlib as _pathlib
_spa_dir = _pathlib.Path("/build/frontend/dist")
if _spa_dir.is_dir():
    # Serve hashed static assets at /assets/* with far-future cache
    _assets_dir = _spa_dir / "assets"
    if _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")

    from fastapi.responses import FileResponse

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        """Catch-all: serve index.html so React Router handles client-side routes."""
        return FileResponse(str(_spa_dir / "index.html"))
