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
from pydantic import BaseModel

from logger import setup_logging, get_logger
from config import get_settings
from peoplesoft import trigger_engine, poll_status
import sftp_client
import scp_client
from csv_parser import parse_and_compute
from settings_manager import update_env

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

    # Validate required env vars — crash the container immediately if missing
    _check_required_env()
    log.info("Environment: required vars present")

    # Eagerly connect to DB with retries so a slow Neon cold-start doesn't
    # manifest as a CORS-less 500 on the first real request.
    from database import init_db
    init_db(retries=5, delay=3.0)

    _startup_ok = True
    log.info("Startup complete  v2_routers=%s", _v2_enabled)
    yield
    log.info("Shutdown")


app = FastAPI(title="Sparky Tool", lifespan=lifespan)

# CORS — open to all origins.
# Security is enforced via Clerk JWT on every authenticated endpoint,
# so CORS does not need to be the access-control layer here.
# allow_credentials must stay False when allow_origins=["*"].
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
    expose_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = _time.time()
    request_id = str(_uuid.uuid4())
    response = await call_next(request)
    elapsed = round((_time.time() - t0) * 1000)
    path = request.url.path

    _silent = {"/favicon.ico", "/api/ping"}
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
    from routers import conversations as _conv
    from routers import engines as _eng
    from routers import run_outputs as _ro
    from database import get_db
    from models import UserConfig, UserConfigEngine, Engine, RunLog, AuditEvent
    from auth import get_current_user
    from encrypt import decrypt

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
    _v2_enabled = True

    def _config_to_ns(config: UserConfig) -> SimpleNamespace:
        return SimpleNamespace(
            ps_base_url=config.ps_base_url or "",
            ps_auth_type=config.ps_auth_type or "basic",
            ps_username=config.ps_username or "",
            ps_password=decrypt(config.ps_password_enc),
            ps_endpoint=config.ps_endpoint or "",
            ps_status_endpoint=config.ps_status_endpoint or "",
            ps_process_name=config.ps_process_name or "SM_DISCOVERY",
            retrieval_method=config.retrieval_method or "sftp",
            sftp_host=config.sftp_host or "",
            sftp_port=config.sftp_port or 22,
            sftp_username=config.sftp_username or "",
            sftp_password=decrypt(config.sftp_password_enc),
            sftp_remote_path=config.sftp_remote_path or "",
            # FTP / FTPS
            ftp_host=config.ftp_host or "",
            ftp_port=config.ftp_port or 21,
            ftp_username=config.ftp_username or "",
            ftp_password=decrypt(config.ftp_password_enc) if config.ftp_password_enc else "",
            ftp_remote_path=config.ftp_remote_path or "",
            ftp_connection_type=config.ftp_connection_type or "ftp",
            ftp_passive=config.ftp_passive if config.ftp_passive is not None else True,
            # Windows Server (WinRM) retrieval
            win_host=config.win_host or "",
            win_port=config.win_port or 5985,
            win_username=config.win_username or "",
            win_password=decrypt(config.win_password_enc) if config.win_password_enc else "",
            win_use_ssl=config.win_use_ssl or False,
            win_auth_type=config.win_auth_type or "ntlm",
            win_connection_type=config.win_connection_type or "winrm",
            win_share=config.win_share or "C$",
            win_domain=config.win_domain or "",
        )

    from sqlalchemy.orm import Session

    def _run_one_engine(config, engine_process_name, engine_label, s, user, config_id, request, db):
        """Trigger → Poll → Download → Parse for a single engine process name.
        Returns (run_log, result_dict)."""
        s_eng = SimpleNamespace(**vars(s))
        s_eng.ps_process_name = engine_process_name

        run_log = RunLog(
            user_id=user.id,
            config_id=config.id,
            config_name=config.name,
            ps_process_name=engine_process_name,
            status="running",
        )
        db.add(run_log)
        db.commit()
        db.refresh(run_log)

        log.info("Run started  run_id=%d  config=%d  engine=%r  process=%s  method=%s",
                 run_log.id, config_id, engine_label, engine_process_name, s_eng.retrieval_method)

        start      = _time.time()
        instance_id = ""
        report_id   = ""
        try:
            # ── Step 1: Trigger PeopleSoft ──────────────────────────────────
            t1 = _time.time()
            try:
                trigger_result = trigger_engine(_settings=s_eng)
            except httpx.HTTPStatusError as exc:
                run_log.failed_step = "trigger"
                raise HTTPException(502, f"PeopleSoft API error: {exc}")
            except httpx.TimeoutException:
                run_log.failed_step = "trigger"
                raise HTTPException(504, "PeopleSoft API timed out")
            except httpx.ConnectError as exc:
                run_log.failed_step = "trigger"
                raw = str(exc)
                if "10061" in raw or "Connection refused" in raw:
                    raise HTTPException(502, "PeopleSoft refused the connection — check the port in your Base URL and confirm the service is running.")
                raise HTTPException(502, f"PeopleSoft API unreachable: {exc}")
            except ValueError as exc:
                run_log.failed_step = "trigger"
                raise HTTPException(400, str(exc))
            log.info("Run %d  step=trigger  %d ms", run_log.id, round((_time.time() - t1) * 1000))

            instance_id = str(trigger_result.get("InstanceID", ""))
            if instance_id:
                run_log.instance_id = instance_id
                db.commit()

            # ── Step 2: Poll status ─────────────────────────────────────────
            if s_eng.ps_status_endpoint and instance_id:
                t2 = _time.time()
                try:
                    status_result = poll_status(instance_id, _settings=s_eng)
                    report_id = str(status_result.get("ReportID", ""))
                except TimeoutError as exc:
                    run_log.failed_step = "poll"
                    raise HTTPException(504, str(exc))
                except (httpx.HTTPStatusError, httpx.ConnectError) as exc:
                    run_log.failed_step = "poll"
                    raise HTTPException(502, f"PeopleSoft status polling error: {exc}")
                log.info("Run %d  step=poll  instance=%s  report=%s  %d ms",
                         run_log.id, instance_id, report_id, round((_time.time() - t2) * 1000))
                if report_id:
                    run_log.report_id = report_id
                    db.commit()

            # ── Step 3: Download CSV (skip if retrieval not configured) ─────
            is_windows     = s_eng.retrieval_method in ("winrm", "smb", "win_ssh")
            sftp_configured = (
                bool(s_eng.win_host and s_eng.sftp_remote_path) if is_windows
                else bool(s_eng.sftp_host and s_eng.sftp_remote_path)
            )

            if not sftp_configured:
                duration_ms = int((_time.time() - start) * 1000)
                run_log.status       = "success"
                run_log.sftp_skipped = True
                run_log.skip_reason  = "SFTP host or remote path not configured"
                run_log.row_count    = 0
                run_log.duration_ms  = duration_ms
                run_log.completed_at = datetime.now(timezone.utc)
                db.add(AuditEvent(
                    user_id=user.id, event_type="run_completed",
                    detail={"config_id": config_id, "engine": engine_label,
                            "instance_id": instance_id, "sftp_skipped": True},
                    ip_address=request.client.host if request.client else None,
                ))
                db.commit()
                result = {
                    "engine_name": engine_label, "process_name": engine_process_name,
                    "run_id": run_log.id, "instance_id": instance_id, "report_id": report_id,
                    "sftp_skipped": True, "row_count": 0, "kpis": {}, "chart_data": [],
                    "message": "PeopleSoft process completed. SFTP retrieval skipped.",
                }
                log.info("Run complete (SFTP skipped)  run_id=%d  %d ms", run_log.id, duration_ms)
                return run_log, result

            remote_path = s_eng.sftp_remote_path
            if report_id:
                remote_path = remote_path.replace("{report_id}", report_id)
            if instance_id:
                remote_path = remote_path.replace("{instance_id}", instance_id)

            t3 = _time.time()
            try:
                if s_eng.retrieval_method == "scp":
                    csv_bytes = scp_client.download_csv(remote_path=remote_path, _settings=s_eng)
                elif s_eng.retrieval_method == "winrm":
                    import windows_client as _wc
                    csv_bytes = _wc.download_csv(remote_path=remote_path, _settings=s_eng)
                elif s_eng.retrieval_method == "smb":
                    import smb_client as _smbcli
                    csv_bytes = _smbcli.download_csv(remote_path=remote_path, _settings=s_eng)
                elif s_eng.retrieval_method == "win_ssh":
                    import win_ssh_client as _winssh
                    csv_bytes = _winssh.download_csv(remote_path=remote_path, _settings=s_eng)
                elif s_eng.retrieval_method == "ftp":
                    import ftp_client as _ftpcli
                    csv_bytes = _ftpcli.download_csv(remote_path=remote_path, _settings=s_eng)
                else:
                    csv_bytes = sftp_client.download_csv(remote_path=remote_path, _settings=s_eng)
            except Exception as exc:
                label = {"scp": "SSH/SCP", "winrm": "WinRM", "smb": "SMB", "win_ssh": "SSH", "ftp": "FTP"}.get(
                    s_eng.retrieval_method, "SFTP"
                )
                if not isinstance(exc, HTTPException):
                    run_log.failed_step = "download"
                raise exc if isinstance(exc, HTTPException) else HTTPException(503, f"{label} download error: {exc}")
            log.info("Run %d  step=download  size=%d bytes  %d ms",
                     run_log.id, len(csv_bytes), round((_time.time() - t3) * 1000))

            # ── Step 4: Parse CSV ───────────────────────────────────────────
            t4 = _time.time()
            try:
                result = parse_and_compute(csv_bytes)
            except Exception as exc:
                run_log.failed_step = "parse"
                raise HTTPException(422, f"CSV parse error: {exc}")
            log.info("Run %d  step=parse  rows=%d  %d ms",
                     run_log.id, result.get("row_count", 0), round((_time.time() - t4) * 1000))

            # ── Save CSV to run_outputs for analysis history ────────────────
            try:
                from routers.run_outputs import save_run_output
                save_run_output(
                    db=db,
                    user_id=user.id,
                    run_log_id=run_log.id,
                    csv_bytes=csv_bytes,
                    config_name=config.name,
                    engine_name=engine_label,
                    process_name=engine_process_name,
                    row_count=result.get("row_count", 0),
                )
            except Exception as _save_exc:
                log.warning("save_run_output failed (non-fatal): %s", _save_exc)

            duration_ms = int((_time.time() - start) * 1000)
            run_log.status       = "success"
            run_log.instance_id  = instance_id
            run_log.report_id    = report_id
            run_log.sftp_skipped = False
            run_log.row_count    = result["row_count"]
            run_log.duration_ms  = duration_ms
            run_log.completed_at = datetime.now(timezone.utc)
            db.add(AuditEvent(
                user_id=user.id, event_type="run_completed",
                detail={"config_id": config_id, "engine": engine_label,
                        "instance_id": instance_id, "row_count": result["row_count"]},
                ip_address=request.client.host if request.client else None,
            ))
            db.commit()
            log.info("Run complete  run_id=%d  engine=%r  rows=%d  %d ms",
                     run_log.id, engine_label, result["row_count"], duration_ms)

            result.update({
                "engine_name": engine_label, "process_name": engine_process_name,
                "run_id": run_log.id, "instance_id": instance_id,
                "report_id": report_id, "sftp_skipped": False,
            })
            return run_log, result

        except HTTPException as exc:
            duration_ms = int((_time.time() - start) * 1000)
            run_log.status       = "error"
            run_log.error_detail = str(exc.detail)
            run_log.duration_ms  = duration_ms
            run_log.completed_at = datetime.now(timezone.utc)
            if instance_id and not run_log.instance_id:
                run_log.instance_id = instance_id
            if report_id and not run_log.report_id:
                run_log.report_id = report_id
            db.add(AuditEvent(
                user_id=user.id, event_type="run_failed",
                detail={"config_id": config_id, "engine": engine_label,
                        "failed_step": run_log.failed_step or "unknown", "error": str(exc.detail)},
                ip_address=request.client.host if request.client else None,
            ))
            db.commit()
            log.error("Run failed  run_id=%d  engine=%r  step=%s  error=%s  %d ms",
                      run_log.id, engine_label, run_log.failed_step or "unknown", exc.detail, duration_ms)
            error_result = {
                "engine_name": engine_label, "process_name": engine_process_name,
                "run_id": run_log.id, "status": "error", "error": str(exc.detail),
                "row_count": 0, "kpis": {}, "chart_data": [],
            }
            return run_log, error_result

    @app.post("/api/v2/run/{config_id}")
    def run_v2(
        config_id: int,
        request: Request,
        db: Session = Depends(get_db),
        user=Depends(get_current_user),
    ):
        config = db.query(UserConfig).filter(
            UserConfig.id == config_id, UserConfig.user_id == user.id
        ).first()
        if not config:
            raise HTTPException(404, "Configuration not found")

        s = _config_to_ns(config)

        # Resolve engines: prefer junction-table selection, fall back to config.ps_process_name
        engine_rows = (
            db.query(UserConfigEngine, Engine)
            .join(Engine, UserConfigEngine.engine_id == Engine.id)
            .filter(UserConfigEngine.config_id == config_id)
            .order_by(UserConfigEngine.sort_order)
            .all()
        )

        if engine_rows:
            engines_to_run = [(e.process_name, e.name) for _, e in engine_rows]
        else:
            # Backward compat: no engines selected → use the config's ps_process_name
            engines_to_run = [(s.ps_process_name or "SM_DISCOVERY", s.ps_process_name or "SM_DISCOVERY")]

        log.info("Run dispatched  config=%d (%s)  user=%s  engines=%s  method=%s",
                 config_id, config.name, user.id[:8],
                 [p for p, _ in engines_to_run], s.retrieval_method)

        results = []
        last_ok  = None
        for process_name, label in engines_to_run:
            _, eng_result = _run_one_engine(
                config, process_name, label, s, user, config_id, request, db
            )
            results.append(eng_result)
            if eng_result.get("status") != "error":
                last_ok = eng_result

        # For dashboard compat: surface the last successful engine's kpis/chart_data
        # as top-level keys alongside the full runs list.
        base = last_ok or results[-1]
        aggregate = {
            "runs":          results,
            "total_engines": len(results),
            "success_count": sum(1 for r in results if r.get("status") != "error"),
            "row_count":     sum(r.get("row_count", 0) for r in results),
            "kpis":          base.get("kpis", {}),
            "chart_data":    base.get("chart_data", []),
            "instance_id":   base.get("instance_id", ""),
            "report_id":     base.get("report_id", ""),
            "sftp_skipped":  all(r.get("sftp_skipped") for r in results),
        }
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
    log.info("v1 run triggered")
    start = _time.time()
    try:
        trigger_result = trigger_engine()
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
    ps_process_name: str = "SM_DISCOVERY"
    retrieval_method: str = "sftp"
    sftp_host: str = ""
    sftp_port: str = "22"
    sftp_username: str = ""
    sftp_password: str = ""
    sftp_remote_path: str = ""
    ps_webserver_path: str = ""
    cors_origins: str = "http://localhost:3000"


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
    ps_base_url: str = ""
    ps_auth_type: str = "basic"
    ps_username: str = ""
    ps_password: str = ""
    ps_endpoint: str = ""
    ps_status_endpoint: str = ""
    ps_process_name: str = ""


@app.post("/api/test-peoplesoft")
def test_peoplesoft(body: PeoplesoftTestPayload):
    import json as _json

    password = body.ps_password or settings.ps_password
    username = body.ps_username or settings.ps_username

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
                raise HTTPException(400, f"Authentication failed (HTTP {response.status_code})")
            if response.status_code >= 400:
                snippet = response.text[:200].strip()
                raise HTTPException(400, f"PeopleSoft returned HTTP {response.status_code}"
                                        + (f" — {snippet}" if snippet else ""))

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
                status_ep = body.ps_status_endpoint.strip()
                if status_ep.startswith(("http://", "https://")):
                    status_url_used = f"{status_ep.rstrip('/')}/{instance_id}"
                else:
                    sbase = body.ps_base_url.rstrip("/")
                    if not status_ep.startswith("/"):
                        status_ep = "/" + status_ep
                    status_url_used = f"{sbase}{status_ep}/{instance_id}"

                if not status_url_used.startswith(("http://", "https://")):
                    raise HTTPException(
                        400,
                        detail=f"Invalid status URL — Base URL must start with http:// or https://. Got: '{status_url_used}'",
                    )

                status_resp = client.get(status_url_used, auth=auth, headers=extra_headers)
                status_http_status = status_resp.status_code
                log.info("test_peoplesoft status OK  HTTP %d  url=%s", status_http_status, status_url_used)
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
    ftp_host: str
    ftp_port: int = 21
    ftp_username: str = ""
    ftp_password: str = ""
    ftp_connection_type: str = "ftp"   # ftp | ftps
    ftp_passive: bool = True


class FtpBrowsePayload(FtpPayload):
    path: str


class FtpReadFilePayload(FtpPayload):
    path: str


@app.post("/api/test-ftp")
def test_ftp(body: FtpPayload):
    import ftp_client as _ftp
    tls = body.ftp_connection_type == "ftps"
    log.info("test_ftp  %s:%d  user=%s  tls=%s", body.ftp_host, body.ftp_port, body.ftp_username, tls)
    try:
        info = _ftp.test_connection(
            body.ftp_host, body.ftp_port,
            body.ftp_username, body.ftp_password,
            tls=tls, passive=body.ftp_passive,
        )
        return {"status": "ok", **info}
    except Exception as exc:
        log.warning("test_ftp failed  %s: %s", body.ftp_host, exc)
        raise HTTPException(400, str(exc))


@app.post("/api/ftp-browse")
def ftp_browse(body: FtpBrowsePayload):
    import ftp_client as _ftp
    tls = body.ftp_connection_type == "ftps"
    log.info("ftp_browse  %s  path=%s  tls=%s", body.ftp_host, body.path, tls)
    try:
        items = _ftp.list_directory(
            body.ftp_host, body.ftp_port,
            body.ftp_username, body.ftp_password,
            body.path, tls=tls, passive=body.ftp_passive,
        )
        return {"path": body.path, "items": items}
    except Exception as exc:
        log.warning("ftp_browse failed  %s  path=%s: %s", body.ftp_host, body.path, exc)
        raise HTTPException(400, str(exc))


@app.post("/api/ftp-read-file")
def ftp_read_file(body: FtpReadFilePayload):
    import ftp_client as _ftp
    tls = body.ftp_connection_type == "ftps"
    log.info("ftp_read_file  %s  path=%s  tls=%s", body.ftp_host, body.path, tls)
    try:
        content = _ftp.read_file(
            body.ftp_host, body.ftp_port,
            body.ftp_username, body.ftp_password,
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
