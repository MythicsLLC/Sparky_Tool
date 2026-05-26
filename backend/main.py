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

# CORS_ORIGINS env var — comma-separated list of allowed origins.
# Falls back to "*" so local dev works without any env config.
# In production set CORS_ORIGINS=https://your-app.vercel.app on Render.
_cors_origins_raw = _os.getenv("CORS_ORIGINS", "*")
_cors_origins = (
    ["*"] if _cors_origins_raw.strip() == "*"
    else [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
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
    from routers import users as _u, configs as _c, runs as _r, admin as _a, insights as _i
    from database import get_db
    from models import UserConfig, RunLog, AuditEvent
    from auth import get_current_user
    from encrypt import decrypt

    app.include_router(_u.router)
    app.include_router(_c.router)
    app.include_router(_r.router)
    app.include_router(_a.router)
    app.include_router(_i.router)
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
        instance_id = ""
        report_id   = ""
        try:
            # ── Step 1: Trigger PeopleSoft ──────────────────────────────────
            t1 = _time.time()
            try:
                trigger_result = trigger_engine(_settings=s)
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
            report_id = ""

            # Persist instance_id immediately so it survives any later failure
            if instance_id:
                run_log.instance_id = instance_id
                db.commit()
                log.debug("Run %d  instance_id persisted  %s", run_log.id, instance_id)

            # ── Step 2: Poll status ─────────────────────────────────────────
            if s.ps_status_endpoint and instance_id:
                t2 = _time.time()
                try:
                    status_result = poll_status(instance_id, _settings=s)
                    report_id = str(status_result.get("ReportID", ""))
                except TimeoutError as exc:
                    run_log.failed_step = "poll"
                    raise HTTPException(504, str(exc))
                except (httpx.HTTPStatusError, httpx.ConnectError) as exc:
                    run_log.failed_step = "poll"
                    raise HTTPException(502, f"PeopleSoft status polling error: {exc}")
                log.info("Run %d  step=poll  instance=%s  report=%s  %d ms",
                         run_log.id, instance_id, report_id, round((_time.time() - t2) * 1000))

                # Persist report_id immediately so it survives any later failure
                if report_id:
                    run_log.report_id = report_id
                    db.commit()
                    log.debug("Run %d  report_id persisted  %s", run_log.id, report_id)

            # ── Step 3: Download CSV (skip if retrieval not configured) ───
            is_windows = s.retrieval_method in ("winrm", "smb", "win_ssh")
            sftp_configured = (
                bool(s.win_host and s.sftp_remote_path) if is_windows
                else bool(s.sftp_host and s.sftp_remote_path)
            )

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
                elif s.retrieval_method == "winrm":
                    import windows_client as _wc
                    csv_bytes = _wc.download_csv(remote_path=remote_path, _settings=s)
                elif s.retrieval_method == "smb":
                    import smb_client as _smbcli
                    csv_bytes = _smbcli.download_csv(remote_path=remote_path, _settings=s)
                elif s.retrieval_method == "win_ssh":
                    import win_ssh_client as _winssh
                    csv_bytes = _winssh.download_csv(remote_path=remote_path, _settings=s)
                else:
                    csv_bytes = sftp_client.download_csv(remote_path=remote_path, _settings=s)
            except Exception as exc:
                label = {"scp": "SSH/SCP", "winrm": "WinRM", "smb": "SMB", "win_ssh": "SSH"}.get(
                    s.retrieval_method, "SFTP"
                )
                run_log.failed_step = "download"
                raise HTTPException(503, f"{label} download error: {exc}")
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
            run_log.status       = "error"
            run_log.error_detail = str(exc.detail)
            run_log.duration_ms  = duration_ms
            run_log.completed_at = datetime.now(timezone.utc)
            # Carry forward any tracking IDs captured before the failure
            if instance_id and not run_log.instance_id:
                run_log.instance_id = instance_id
            if report_id and not run_log.report_id:
                run_log.report_id = report_id
            # failed_step is already set at the raise site; persist it now
            db.add(AuditEvent(
                user_id=user.id,
                event_type="run_failed",
                detail={
                    "config_id":   config_id,
                    "instance_id": instance_id or "",
                    "report_id":   report_id or "",
                    "failed_step": run_log.failed_step or "unknown",
                    "error":       str(exc.detail),
                },
                ip_address=request.client.host if request.client else None,
            ))
            db.commit()
            log.error("Run failed  run_id=%d  step=%s  status=%d  error=%s  total=%d ms",
                      run_log.id, run_log.failed_step or "unknown", exc.status_code, exc.detail, duration_ms)
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
