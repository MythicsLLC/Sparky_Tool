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
    h = response.headers
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("X-Frame-Options", "DENY")
    h.setdefault("X-XSS-Protection", "1; mode=block")
    h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    # Restrict browser feature access for an enterprise data tool
    h.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
    # Content-Security-Policy — allows Clerk auth iframes/scripts; blocks plugins and cross-origin framing
    h.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://*.clerk.com https://*.clerk.accounts.dev; "
        "style-src 'self' 'unsafe-inline'; "
        "connect-src 'self' https://*.clerk.com https://*.clerk.dev https://api.clerk.com wss: ws:; "
        "img-src 'self' data: https: blob:; "
        "font-src 'self' data:; "
        "frame-src https://*.clerk.com https://*.clerk.accounts.dev; "
        "object-src 'none'; "
        "frame-ancestors 'none'",
    )
    # HSTS — only meaningful over HTTPS; Render terminates TLS and forwards proto via header
    if request.headers.get("x-forwarded-proto") == "https":
        h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
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
    except Exception as _exc:
        log.debug("Wide event write failed (best-effort): %s", _exc)


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
    sftp_port: str = "22"
    sftp_username: str = ""
    sftp_password: str = ""
    sftp_remote_path: str = ""
    ps_webserver_path: str = ""
    cors_origins: str = "http://localhost:3000"

    @field_validator("ps_base_url", "ps_endpoint", "ps_status_endpoint", "ps_process_name")
    @classmethod
    def _no_whitespace(cls, v: str) -> str:
        return _strip_ws(v)


@app.get("/api/settings")
def get_settings_view():
    s = settings
    return {
        "ps_base_url":        s.ps_base_url,
        "ps_auth_type":       s.ps_auth_type,
        "ps_username":        s.ps_username,
        "ps_password":        "***" if s.ps_password else "",
        "ps_endpoint":        s.ps_endpoint,
        "ps_status_endpoint": s.ps_status_endpoint,
        "ps_process_name":    s.ps_process_name,
        "retrieval_method":   s.retrieval_method,
        "sftp_host":          s.sftp_host,
        "sftp_port":          str(s.sftp_port),
        "sftp_username":      s.sftp_username,
        "sftp_password":      "***" if s.sftp_password else "",
        "sftp_remote_path":   s.sftp_remote_path,
        "ps_webserver_path":  s.ps_webserver_path,
        "cors_origins":       s.cors_origins,
    }


class PeoplesoftTestPayload(BaseModel):
    config_id: int | None = None
    ps_base_url: str = ""
    ps_auth_type: str = "basic"
    ps_username: str = ""
    ps_password: str = ""
    ps_endpoint: str = ""
    ps_status_endpoint: str = ""
    ps_process_name: str = ""

    @field_validator("ps_base_url", "ps_endpoint", "ps_status_endpoint", "ps_process_name")
    @classmethod
    def _no_whitespace(cls, v: str) -> str:
        return _strip_ws(v)


@app.post("/api/test-peoplesoft")
def test_peoplesoft(
    body: PeoplesoftTestPayload,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    import json as _json
    from encrypt import decrypt as _decrypt

    password = body.ps_password
    username = body.ps_username

    # Config-based credentials take priority: the frontend sends config_id and
    # strips the "***" sentinel to "" so we know to fetch the real password from DB.
    if body.config_id is not None:
        cfg = db.get(UserConfig, body.config_id)
        if cfg and cfg.user_id == user.id:
            if not password:
                password = _decrypt(cfg.ps_password_enc)
            if not username:
                username = cfg.ps_username

    # .env fallback only when no config is in use (v1 compatibility)
    if not password:
        password = settings.ps_password
    if not username:
        username = settings.ps_username

    endpoint = body.ps_endpoint.strip()
    if endpoint.startswith(("http://", "https://")):
        url = endpoint
    else:
        base = body.ps_base_url.strip().rstrip("/")
        if endpoint and not endpoint.startswith("/"):
            endpoint = "/" + endpoint
        url = base + endpoint

    if not url.startswith(("http://", "https://")):
        raise HTTPException(
            400,
            detail=f"Invalid URL — Base URL must start with http:// or https://. Got: '{url}'",
        )

    log.info("test_peoplesoft  url=%s  auth=%s", url, body.ps_auth_type)

    auth = None
    extra_headers = {}
    if body.ps_auth_type == "basic":
        auth = httpx.BasicAuth(username, password)
    elif body.ps_auth_type == "bearer":
        extra_headers = {"Authorization": f"Bearer {password}"}

    request_body = {"processname": body.ps_process_name} if body.ps_process_name else {}

    try:
        with httpx.Client(timeout=30, follow_redirects=False) as client:
            response = client.post(url, auth=auth, headers=extra_headers, json=request_body)

            if response.is_redirect:
                location = response.headers.get("location", "")
                log.warning("test_peoplesoft redirect → %s", location)
                raise HTTPException(
                    400,
                    detail=f"Authentication failed — PeopleSoft redirected to login. (Location: {location})",
                )
            if response.status_code in (401, 403):
                log.warning("test_peoplesoft auth failure  HTTP %d  body=%r", response.status_code, response.text[:500])
                raise HTTPException(400, f"Authentication failed (HTTP {response.status_code}) — POST {url}")
            if response.status_code >= 400:
                snippet = response.text.strip()
                log.warning("test_peoplesoft PS error  HTTP %d  body=%r", response.status_code, snippet)
                raise HTTPException(400, f"PeopleSoft returned HTTP {response.status_code}"
                                        + (f" — {snippet}" if snippet else "")
                                        + f"\n\nURL: POST {url}")

            try:
                trigger_json = response.json()
                trigger_body_str = _json.dumps(trigger_json, indent=2)
            except Exception:
                trigger_json = {}
                trigger_body_str = response.text

            instance_id = str(trigger_json.get("InstanceID", ""))
            log.info("test_peoplesoft trigger OK  HTTP %d  instance=%s", response.status_code, instance_id)

            status_http_status = None
            status_url_used = None
            status_body_str = None

            if body.ps_status_endpoint and instance_id:
                import re as _re
                # Strip trailing {InstanceID} placeholders copied verbatim from Postman URLs
                status_ep = _re.sub(r"/?\{[^}]+\}$", "", body.ps_status_endpoint.strip().rstrip("/"))
                if status_ep.startswith(("http://", "https://")):
                    status_url_used = status_ep
                else:
                    sbase = body.ps_base_url.rstrip("/")
                    if not status_ep.startswith("/"):
                        status_ep = "/" + status_ep
                    status_url_used = f"{sbase}{status_ep}"

                if not status_url_used.startswith(("http://", "https://")):
                    raise HTTPException(
                        400,
                        detail=f"Invalid status URL — Base URL must start with http:// or https://. Got: '{status_url_used}'",
                    )

                status_url_used = f"{status_url_used}/{instance_id}"
                log.info("test_peoplesoft status GET  url=%s", status_url_used)
                status_resp = client.get(status_url_used, auth=auth, headers=extra_headers)
                status_http_status = status_resp.status_code
                if status_http_status >= 400:
                    log.warning("test_peoplesoft status error  HTTP %d  url=%s  body=%r",
                                status_http_status, status_url_used, status_resp.text[:500])
                else:
                    log.info("test_peoplesoft status OK  HTTP %d", status_http_status)
                try:
                    status_body_str = _json.dumps(status_resp.json(), indent=2)
                except Exception:
                    status_body_str = status_resp.text

        return {
            "status": "ok",
            "http_status": response.status_code,
            "url": url,
            "body": trigger_body_str,
            "instance_id": instance_id,
            "status_http_status": status_http_status,
            "status_url": status_url_used,
            "status_body": status_body_str,
        }

    except HTTPException:
        raise
    except httpx.UnsupportedProtocol as exc:
        raise HTTPException(400, detail=f"Invalid URL — {exc}")
    except httpx.ConnectError as exc:
        raw = str(exc)
        if "10061" in raw or "Connection refused" in raw:
            detail = (
                f"Connection refused by {url} — the port is not accepting connections. "
                "Check: (1) the port in your Base URL, (2) that the PeopleSoft service is running, "
                "(3) HTTP vs HTTPS."
            )
        elif "11001" in raw or "getaddrinfo" in raw or "Name or service" in raw:
            detail = f"Host not found for {url} — verify the Base URL hostname."
        else:
            detail = f"Cannot reach PeopleSoft endpoint ({url}) — {exc}"
        log.warning("test_peoplesoft connect error: %s", exc)
        raise HTTPException(400, detail=detail)
    except httpx.TimeoutException:
        raise HTTPException(400, detail="Request timed out after 30 s")
    except Exception as exc:
        log.error("test_peoplesoft unexpected error: %s", exc, exc_info=True)
        raise HTTPException(400, detail=f"Unexpected error: {exc}")


class RetrievalTestPayload(BaseModel):
    retrieval_method: str = "sftp"
    sftp_host: str = ""
    sftp_port: int = 22
    sftp_username: str = ""
    sftp_password: str = ""
    sftp_remote_path: str = ""


@app.post("/api/test-retrieval")
def test_retrieval(body: RetrievalTestPayload):
    password = body.sftp_password or settings.sftp_password
    log.info("test_retrieval  %s@%s:%d  method=%s  path=%s",
             body.sftp_username, body.sftp_host, body.sftp_port, body.retrieval_method, body.sftp_remote_path)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(hostname=body.sftp_host, port=body.sftp_port,
                       username=body.sftp_username, password=password, timeout=10, banner_timeout=10)
        log.info("test_retrieval SSH connected to %s:%d", body.sftp_host, body.sftp_port)
    except paramiko.AuthenticationException:
        log.warning("test_retrieval auth failed  %s@%s", body.sftp_username, body.sftp_host)
        raise HTTPException(400, "Authentication failed — check username and password")
    except Exception as exc:
        log.warning("test_retrieval connect failed  %s:%d  %s", body.sftp_host, body.sftp_port, exc)
        raise HTTPException(400, f"Cannot connect to {body.sftp_host}:{body.sftp_port} — {exc}")

    try:
        if body.retrieval_method == "scp":
            _, stdout, stderr = client.exec_command(f"ls -la '{body.sftp_remote_path}'")
            exit_code = stdout.channel.recv_exit_status()
            out = stdout.read().decode().strip()
            err = stderr.read().decode().strip()
            if exit_code != 0 or (not out and err):
                raise HTTPException(400, f"File not accessible: {err or 'no such file'}")
            size_bytes = None
            try:
                size_bytes = int(out.split()[4])
            except (IndexError, ValueError):
                pass
            log.info("test_retrieval SCP file OK  %s  size=%s", body.sftp_remote_path,
                     f"{size_bytes} bytes" if size_bytes else "unknown")
            return {"status": "ok", "method": "scp", "file": body.sftp_remote_path,
                    "size_kb": round(size_bytes / 1024, 1) if size_bytes is not None else None}
        else:
            try:
                sftp = client.open_sftp()
            except Exception as exc:
                raise HTTPException(400, f"SFTP subsystem unavailable — try SSH/SCP instead. ({exc})")
            try:
                attrs = sftp.stat(body.sftp_remote_path)
                size_kb = round(attrs.st_size / 1024, 1) if attrs.st_size else 0
                log.info("test_retrieval SFTP file OK  %s  size=%.1f KB", body.sftp_remote_path, size_kb)
                return {"status": "ok", "method": "sftp", "file": body.sftp_remote_path, "size_kb": size_kb}
            except FileNotFoundError:
                raise HTTPException(400, f"File not found: {body.sftp_remote_path}")
            except PermissionError:
                raise HTTPException(400, "Permission denied")
            except Exception as exc:
                raise HTTPException(400, f"Cannot access file: {exc}")
    finally:
        client.close()


# ── Windows Server (WinRM) endpoints ──────────────────────────────────────────


class WinPayload(BaseModel):
    win_host: str
    win_username: str
    win_password: str
    win_port: int = 5985
    win_use_ssl: bool = False
    win_auth_type: str = "ntlm"
    win_connection_type: str = "winrm"   # winrm | smb | ssh
    win_share: str = "C$"
    win_domain: str = ""


class WinBrowsePayload(WinPayload):
    path: str


class WinReadFilePayload(WinPayload):
    path: str


@app.post("/api/test-windows")
def test_windows(body: WinPayload):
    log.info("test_windows  %s:%d  user=%s  type=%s",
             body.win_host, body.win_port, body.win_username, body.win_connection_type)
    try:
        if body.win_connection_type == "smb":
            import smb_client
            info = smb_client.test_connection(
                body.win_host, body.win_username, body.win_password,
                share=body.win_share, domain=body.win_domain, port=body.win_port,
            )
        elif body.win_connection_type == "ssh":
            import win_ssh_client
            info = win_ssh_client.test_connection(
                body.win_host, body.win_username, body.win_password, port=body.win_port,
            )
        else:  # winrm (default)
            import windows_client
            info = windows_client.test_connection(
                body.win_host, body.win_username, body.win_password,
                body.win_port, body.win_use_ssl, body.win_auth_type,
            )
        return {"status": "ok", **info}
    except Exception as exc:
        log.warning("test_windows failed  %s  type=%s: %s",
                    body.win_host, body.win_connection_type, exc)
        raise HTTPException(400, detail=_win_error_msg(
            str(exc), body.win_connection_type, body.win_host, body.win_port))


@app.post("/api/win-browse")
def win_browse(body: WinBrowsePayload):
    log.info("win_browse  %s  path=%s  type=%s",
             body.win_host, body.path, body.win_connection_type)
    try:
        if body.win_connection_type == "smb":
            import smb_client
            items = smb_client.list_directory(
                body.win_host, body.win_username, body.win_password,
                body.path, share=body.win_share, domain=body.win_domain, port=body.win_port,
            )
        elif body.win_connection_type == "ssh":
            import win_ssh_client
            items = win_ssh_client.list_directory(
                body.win_host, body.win_username, body.win_password,
                body.path, port=body.win_port,
            )
        else:  # winrm
            import windows_client
            items = windows_client.list_directory(
                body.win_host, body.win_username, body.win_password,
                body.path, body.win_port, body.win_use_ssl, body.win_auth_type,
            )
        return {"path": body.path, "items": items}
    except Exception as exc:
        log.warning("win_browse failed  %s  path=%s  type=%s: %s",
                    body.win_host, body.path, body.win_connection_type, exc)
        raise HTTPException(400, detail=_win_error_msg(
            str(exc), body.win_connection_type, body.win_host, body.win_port))


@app.post("/api/win-read-file")
def win_read_file(body: WinReadFilePayload):
    log.info("win_read_file  %s  path=%s  type=%s",
             body.win_host, body.path, body.win_connection_type)
    try:
        if body.win_connection_type == "smb":
            import smb_client
            content = smb_client.read_file(
                body.win_host, body.win_username, body.win_password,
                body.path, domain=body.win_domain, port=body.win_port,
            )
        elif body.win_connection_type == "ssh":
            import win_ssh_client
            content = win_ssh_client.read_file(
                body.win_host, body.win_username, body.win_password,
                body.path, port=body.win_port,
            )
        else:  # winrm
            import windows_client
            content = windows_client.read_file(
                body.win_host, body.win_username, body.win_password,
                body.path, body.win_port, body.win_use_ssl, body.win_auth_type,
            )
        return {"path": body.path, "content": content}
    except Exception as exc:
        log.warning("win_read_file failed  %s  path=%s  type=%s: %s",
                    body.win_host, body.path, body.win_connection_type, exc)
        raise HTTPException(400, detail=_win_error_msg(
            str(exc), body.win_connection_type, body.win_host, body.win_port))


def _winrm_error_msg(raw: str, host: str, port: int) -> str:
    """Convert low-level WinRM exceptions into actionable user messages."""
    r = raw.lower()

    if "connection refused" in r or "10061" in r:
        return (
            f"Connection refused by {host}:{port}. "
            "WinRM is not listening on that port. "
            "Run this in an elevated PowerShell on the remote server to enable it:\n"
            "  winrm quickconfig\n"
            f"Default HTTP port is 5985; HTTPS is 5986."
        )
    if "timed out" in r or "timeout" in r:
        return (
            f"Connection to {host}:{port} timed out. "
            f"Check that port {port} is open in Windows Firewall on the remote host."
        )
    if "rejected" in r or "credential" in r or "401" in r or "unauthorized" in r:
        return (
            "Credentials rejected. RDP credentials do not automatically grant WinRM access.\n\n"
            "RDP into the server and run these commands in an elevated PowerShell (Run as Administrator):\n\n"
            "STEP 1 — Enable WinRM (if not already done):\n"
            "  winrm quickconfig -q\n\n"
            "STEP 2 — Fix UAC token filtering for local accounts (most common cause):\n"
            "  reg add HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System"
            " /v LocalAccountTokenFilterPolicy /t REG_DWORD /d 1 /f\n\n"
            "STEP 3 — Enable Basic auth as an alternative (simpler, try this if NTLM still fails):\n"
            "  winrm set winrm/config/service/auth @{Basic=\"true\"}\n"
            "  winrm set winrm/config/service @{AllowUnencrypted=\"true\"}\n"
            "  Then switch Auth Type to 'Basic' in the tool.\n\n"
            "STEP 4 — Restart WinRM service:\n"
            "  Restart-Service WinRM"
        )
    if "getaddrinfo" in r or "name or service" in r or "11001" in r:
        return f"Host not found: '{host}'. Verify the IP address or hostname is correct."
    if "access is denied" in r or "accessdenied" in r:
        return (
            "Access denied — the account does not have WinRM permission. "
            "Add it to 'Remote Management Users' group on the remote server or use an Administrator account."
        )
    if "kerberos" in r or "kinit" in r:
        return (
            "Kerberos authentication failed. "
            "Use 'NTLM' or 'Negotiate' auth type instead, or ensure this machine is domain-joined."
        )
    return raw


def _smb_error_msg(raw: str, host: str, port: int) -> str:
    """Translate SMB / smbprotocol exceptions into actionable messages."""
    r = raw.lower()
    if "connection refused" in r or "10061" in r or "errno 111" in r:
        return (
            f"SMB connection refused by {host}:{port}. "
            "Check that port 445 is open and Windows File Sharing is enabled on the remote server."
        )
    if "nt_status_logon_failure" in r or "logon_failure" in r or "rejected" in r or "wrong password" in r:
        return (
            "SMB credentials rejected. Verify the username and password. "
            "For local accounts use just the username (no domain prefix). "
            "Ensure the account is in the Administrators group to access admin shares (C$, D$)."
        )
    if "nt_status_access_denied" in r or "access_denied" in r:
        return (
            "SMB access denied. The account must be in the Administrators group "
            "to browse admin shares (C$, D$, ADMIN$)."
        )
    if "nt_status_bad_network_name" in r or "bad_network_name" in r:
        return (
            f"SMB share not found on {host}. "
            "Try 'C$' to access the C drive (requires Administrator rights), "
            "or ask the server admin which share name to use."
        )
    if "timed out" in r or "timeout" in r:
        return (
            f"Connection to {host}:{port} timed out. "
            "Ensure port 445 is open in Windows Firewall on the remote host."
        )
    if "getaddrinfo" in r or "name or service" in r or "11001" in r:
        return f"Host not found: '{host}'. Verify the IP address or hostname."
    return raw


def _ssh_error_msg(raw: str, host: str, port: int) -> str:
    """Translate SSH / paramiko exceptions into actionable messages."""
    r = raw.lower()
    if "connection refused" in r or "10061" in r:
        return (
            f"SSH connection refused by {host}:{port}. OpenSSH may not be installed or running.\n"
            "Install it on the remote server (elevated PowerShell):\n"
            "  Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0\n"
            "  Start-Service sshd\n"
            "  Set-Service -Name sshd -StartupType Automatic"
        )
    if "authentication" in r or "auth failed" in r:
        return (
            "SSH authentication failed. Verify the username and password. "
            "Ensure the Windows account is allowed SSH access."
        )
    if "timed out" in r or "timeout" in r:
        return (
            f"Connection to {host}:{port} timed out. "
            f"Check that port {port} is open in Windows Firewall."
        )
    if "getaddrinfo" in r or "name or service" in r or "11001" in r:
        return f"Host not found: '{host}'. Verify the IP address or hostname."
    return raw


def _win_error_msg(raw: str, connection_type: str, host: str, port: int) -> str:
    """Dispatch to the appropriate error formatter based on connection type."""
    if connection_type == "smb":
        return _smb_error_msg(raw, host, port)
    if connection_type == "ssh":
        return _ssh_error_msg(raw, host, port)
    return _winrm_error_msg(raw, host, port)


# ── FTP / FTPS endpoints ──────────────────────────────────────────────────────

class FtpPayload(BaseModel):
    config_id: int | None = None
    ftp_host: str
    ftp_port: int = 21
    ftp_username: str = ""
    ftp_password: str = ""
    ftp_connection_type: str = "ftp"   # ftp | ftps
    ftp_passive: bool = True

    @field_validator("ftp_username", "ftp_password")
    @classmethod
    def _strip(cls, v: str) -> str:
        return _strip_ws(v)


class FtpBrowsePayload(FtpPayload):
    path: str


class FtpReadFilePayload(FtpPayload):
    path: str


def _resolve_ftp_creds(body: FtpPayload, user, db) -> tuple[str, str]:
    """Return (username, password) for FTP, fetching from DB when config_id is given."""
    from encrypt import decrypt as _decrypt
    username = body.ftp_username
    password = body.ftp_password
    if body.config_id is not None:
        cfg = db.get(UserConfig, body.config_id)
        if cfg and cfg.user_id == user.id:
            if not username:
                username = _strip_ws(cfg.ftp_username or "")
            if not password or password == "***":
                password = _strip_ws(_decrypt(cfg.ftp_password_enc or ""))
    return username, password


@app.post("/api/test-ftp")
def test_ftp(
    body: FtpPayload,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    import ftp_client as _ftp
    username, password = _resolve_ftp_creds(body, user, db)
    tls = body.ftp_connection_type == "ftps"
    log.info("test_ftp  %s:%d  user=%s  tls=%s", body.ftp_host, body.ftp_port, username, tls)
    try:
        info = _ftp.test_connection(
            body.ftp_host, body.ftp_port,
            username, password,
            tls=tls, passive=body.ftp_passive,
        )
        return {"status": "ok", **info}
    except Exception as exc:
        log.warning("test_ftp failed  %s: %s", body.ftp_host, exc)
        raise HTTPException(400, str(exc))


@app.post("/api/ftp-browse")
def ftp_browse(
    body: FtpBrowsePayload,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    import ftp_client as _ftp
    username, password = _resolve_ftp_creds(body, user, db)
    tls = body.ftp_connection_type == "ftps"
    log.info("ftp_browse  %s  path=%s  tls=%s", body.ftp_host, body.path, tls)
    try:
        items = _ftp.list_directory(
            body.ftp_host, body.ftp_port,
            username, password,
            body.path, tls=tls, passive=body.ftp_passive,
        )
        return {"path": body.path, "items": items}
    except Exception as exc:
        log.warning("ftp_browse failed  %s  path=%s: %s", body.ftp_host, body.path, exc)
        raise HTTPException(400, str(exc))


@app.post("/api/ftp-read-file")
def ftp_read_file(
    body: FtpReadFilePayload,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    import ftp_client as _ftp
    username, password = _resolve_ftp_creds(body, user, db)
    tls = body.ftp_connection_type == "ftps"
    log.info("ftp_read_file  %s  path=%s  tls=%s", body.ftp_host, body.path, tls)
    try:
        content = _ftp.read_file(
            body.ftp_host, body.ftp_port,
            username, password,
            body.path, tls=tls, passive=body.ftp_passive,
        )
        return {"path": body.path, "content": content}
    except Exception as exc:
        log.warning("ftp_read_file failed  %s  path=%s: %s", body.ftp_host, body.path, exc)
        raise HTTPException(400, str(exc))


@app.post("/api/settings")
def save_settings(body: SettingsPayload):
    update_env(body.model_dump())
    get_settings.cache_clear()
    global settings
    settings = get_settings()
    log.info("v1 settings saved and reloaded")
    return {"status": "saved"}


# Static frontend — registered AFTER all API routes
_frontend_dist = _os.path.join(_os.path.dirname(__file__), "..", "frontend", "dist")
if _os.path.isdir(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="static")
    log.info("Serving static frontend from %s", _frontend_dist)
