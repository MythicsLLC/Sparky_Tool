import httpx
import os as _os
import time as _time
import paramiko
from datetime import datetime, timezone
from types import SimpleNamespace
from fastapi import FastAPI, HTTPException, Depends, Request
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
app = FastAPI(title="Sparky Tool")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = _time.time()
    response = await call_next(request)
    elapsed = round((_time.time() - t0) * 1000)
    # Skip noisy static-asset requests from the log
    path = request.url.path
    if not path.startswith("/assets/") and path not in ("/favicon.ico",):
        log.info("%-6s %-55s %3d  %d ms", request.method, path, response.status_code, elapsed)
    return response


_cache: dict = {}
_v2_enabled = False

# ── v2 routers ────────────────────────────────────────────────────────────────
try:
    from routers import users as _u, configs as _c, runs as _r, admin as _a
    from database import get_db
    from models import UserConfig, RunLog, AuditEvent
    from auth import get_current_user
    from encrypt import decrypt

    app.include_router(_u.router)
    app.include_router(_c.router)
    app.include_router(_r.router)
    app.include_router(_a.router)
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
        )

    from sqlalchemy.orm import Session

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
        run_log = RunLog(
            user_id=user.id,
            config_id=config.id,
            config_name=config.name,
            ps_process_name=s.ps_process_name,
            status="running",
        )
        db.add(run_log)
        db.commit()
        db.refresh(run_log)

        log.info("Run started  run_id=%d  config=%d (%s)  user=%s  process=%s  method=%s",
                 run_log.id, config_id, config.name, user.id[:8], s.ps_process_name, s.retrieval_method)

        start = _time.time()
        try:
            # ── Step 1: Trigger PeopleSoft ──────────────────────────────────
            t1 = _time.time()
            try:
                trigger_result = trigger_engine(_settings=s)
            except httpx.HTTPStatusError as exc:
                raise HTTPException(502, f"PeopleSoft error: {exc}")
            except httpx.TimeoutException:
                raise HTTPException(504, "PeopleSoft engine timed out")
            except httpx.ConnectError as exc:
                raise HTTPException(502, f"PeopleSoft unreachable: {exc}")
            log.info("Run %d  step=trigger  %d ms", run_log.id, round((_time.time() - t1) * 1000))

            instance_id = str(trigger_result.get("InstanceID", ""))
            report_id = ""

            # ── Step 2: Poll status ─────────────────────────────────────────
            if s.ps_status_endpoint and instance_id:
                t2 = _time.time()
                try:
                    status_result = poll_status(instance_id, _settings=s)
                    report_id = str(status_result.get("ReportID", ""))
                except TimeoutError as exc:
                    raise HTTPException(504, str(exc))
                except (httpx.HTTPStatusError, httpx.ConnectError) as exc:
                    raise HTTPException(502, f"PeopleSoft status error: {exc}")
                log.info("Run %d  step=poll  instance=%s  report=%s  %d ms",
                         run_log.id, instance_id, report_id, round((_time.time() - t2) * 1000))

            # ── Step 3: Download CSV (skip if SFTP not configured) ─────────
            sftp_configured = bool(s.sftp_host and s.sftp_remote_path)

            if not sftp_configured:
                duration_ms = int((_time.time() - start) * 1000)
                run_log.status       = "success"
                run_log.instance_id  = instance_id
                run_log.report_id    = report_id
                run_log.sftp_skipped = True
                run_log.skip_reason  = "SFTP host or remote path not configured"
                run_log.row_count    = 0
                run_log.duration_ms  = duration_ms
                run_log.completed_at = datetime.now(timezone.utc)
                db.add(AuditEvent(
                    user_id=user.id,
                    event_type="run_completed",
                    detail={
                        "config_id": config_id,
                        "instance_id": instance_id,
                        "report_id": report_id,
                        "sftp_skipped": True,
                    },
                    ip_address=request.client.host if request.client else None,
                ))
                db.commit()
                log.info("Run complete (SFTP skipped)  run_id=%d  instance=%s  report=%s  %d ms",
                         run_log.id, instance_id, report_id, duration_ms)
                return {
                    "instance_id": instance_id,
                    "report_id": report_id,
                    "sftp_skipped": True,
                    "message": (
                        "PeopleSoft process completed successfully. "
                        "SFTP retrieval was skipped — configure SFTP Host and Remote Path "
                        "in Settings to enable CSV download and data analysis."
                    ),
                    "row_count": 0,
                    "kpis": {},
                    "chart_data": [],
                }

            remote_path = s.sftp_remote_path
            if report_id:
                remote_path = remote_path.replace("{report_id}", report_id)
            if instance_id:
                remote_path = remote_path.replace("{instance_id}", instance_id)

            t3 = _time.time()
            try:
                if s.retrieval_method == "scp":
                    csv_bytes = scp_client.download_csv(remote_path=remote_path, _settings=s)
                else:
                    csv_bytes = sftp_client.download_csv(remote_path=remote_path, _settings=s)
            except Exception as exc:
                label = "SSH/SCP" if s.retrieval_method == "scp" else "SFTP"
                raise HTTPException(503, f"{label} error: {exc}")
            log.info("Run %d  step=download  size=%d bytes  %d ms",
                     run_log.id, len(csv_bytes), round((_time.time() - t3) * 1000))

            # ── Step 4: Parse CSV ───────────────────────────────────────────
            t4 = _time.time()
            try:
                result = parse_and_compute(csv_bytes)
            except Exception as exc:
                raise HTTPException(422, f"CSV parse error: {exc}")
            log.info("Run %d  step=parse  rows=%d  %d ms",
                     run_log.id, result.get("row_count", 0), round((_time.time() - t4) * 1000))

            result["instance_id"] = instance_id
            result["report_id"]   = report_id
            result["sftp_skipped"] = False

            duration_ms = int((_time.time() - start) * 1000)
            run_log.status       = "success"
            run_log.instance_id  = instance_id
            run_log.report_id    = report_id
            run_log.sftp_skipped = False
            run_log.row_count    = result["row_count"]
            run_log.duration_ms  = duration_ms
            run_log.completed_at = datetime.now(timezone.utc)
            db.add(AuditEvent(
                user_id=user.id,
                event_type="run_completed",
                detail={
                    "config_id":  config_id,
                    "instance_id": instance_id,
                    "report_id":  report_id,
                    "row_count":  result["row_count"],
                },
                ip_address=request.client.host if request.client else None,
            ))
            db.commit()

            log.info("Run complete  run_id=%d  instance=%s  report=%s  rows=%d  total=%d ms",
                     run_log.id, instance_id, report_id, result["row_count"], duration_ms)

            _cache["last"] = result
            return result

        except HTTPException as exc:
            duration_ms = int((_time.time() - start) * 1000)
            run_log.status = "error"
            run_log.error_detail = str(exc.detail)
            run_log.duration_ms = duration_ms
            run_log.completed_at = datetime.now(timezone.utc)
            db.commit()
            log.error("Run failed  run_id=%d  status=%d  error=%s  total=%d ms",
                      run_log.id, exc.status_code, exc.detail, duration_ms)
            raise

except Exception as _init_err:
    log.error("v2 endpoints disabled — import failed: %s", _init_err, exc_info=True)


@app.on_event("startup")
async def on_startup():
    log.info("=" * 60)
    log.info("Sparky Tool starting up  v2_routers=%s", _v2_enabled)
    log.info("=" * 60)


# ── v1 endpoints (backward compat, no auth) ────────────────────────────────

@app.get("/api/health")
def health():
    from database import health_check as _db_health
    db_ok = False
    try:
        db_ok = _db_health()
    except Exception:
        pass
    return {"status": "ok", "db": "ok" if db_ok else "unavailable"}


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
        log.warning("test_peoplesoft connect error: %s", exc)
        raise HTTPException(400, detail=f"Cannot reach PeopleSoft endpoint — {exc}")
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
