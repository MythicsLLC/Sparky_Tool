"""
Run-execution logic extracted from main.py.
Imported by both the HTTP endpoint (main.py) and the scheduler.
"""
import time as _time
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Optional

import httpx
from fastapi import HTTPException

from encrypt import decrypt
from logger import get_logger
from sanitize import strip_all_whitespace as _strip_ws
from models import RunLog, AuditEvent, UserConfig, UserConfigEngine, Engine
from peoplesoft import trigger_engine, poll_status
import sftp_client
import scp_client

log = get_logger("run_engine")


def config_to_ns(config: UserConfig) -> SimpleNamespace:
    return SimpleNamespace(
        ps_base_url         = _strip_ws(config.ps_base_url),
        ps_auth_type        = config.ps_auth_type or "basic",
        ps_username         = config.ps_username or "",
        ps_password         = decrypt(config.ps_password_enc),
        ps_endpoint         = _strip_ws(config.ps_endpoint),
        ps_status_endpoint  = _strip_ws(config.ps_status_endpoint),
        ps_process_name     = _strip_ws(config.ps_process_name),
        retrieval_method    = config.retrieval_method or "sftp",
        sftp_host           = config.sftp_host or "",
        sftp_port           = config.sftp_port or 22,
        sftp_username       = config.sftp_username or "",
        sftp_password       = decrypt(config.sftp_password_enc),
        sftp_remote_path    = config.sftp_remote_path or "",
        ftp_host            = config.ftp_host or "",
        ftp_port            = config.ftp_port or 21,
        ftp_username        = _strip_ws(config.ftp_username or ""),
        ftp_password        = _strip_ws(decrypt(config.ftp_password_enc) if config.ftp_password_enc else ""),
        ftp_remote_path     = config.ftp_remote_path or "",
        ftp_connection_type = config.ftp_connection_type or "ftp",
        ftp_passive         = config.ftp_passive if config.ftp_passive is not None else True,
        win_host            = config.win_host or "",
        win_port            = config.win_port or 5985,
        win_username        = config.win_username or "",
        win_password        = decrypt(config.win_password_enc) if config.win_password_enc else "",
        win_use_ssl         = config.win_use_ssl or False,
        win_auth_type       = config.win_auth_type or "ntlm",
        win_connection_type = config.win_connection_type or "winrm",
        win_share           = config.win_share or "C$",
        win_domain          = config.win_domain or "",
    )


def run_one_engine(config, engine_process_name, engine_label, s, user, config_id, db, request=None):
    """Trigger → Poll → Download → Parse → DQ-check for one engine.
    Returns (run_log, result_dict)."""
    s_eng = SimpleNamespace(**vars(s))
    s_eng.ps_process_name = engine_process_name

    run_log = RunLog(
        user_id         = user.id,
        config_id       = config.id,
        config_name     = config.name,
        ps_process_name = engine_process_name,
        status          = "running",
    )
    db.add(run_log)
    db.commit()
    db.refresh(run_log)

    ip_address = request.client.host if request and request.client else None
    start      = _time.time()
    instance_id = ""
    report_id   = ""
    file_name   = ""

    try:
        # ── Step 1: Trigger ────────────────────────────────────────────────────
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

        # ── Step 2: Poll ───────────────────────────────────────────────────────
        if s_eng.ps_status_endpoint and instance_id:
            t2 = _time.time()
            try:
                status_result = poll_status(instance_id, _settings=s_eng)
                report_id = str(status_result.get("ReportID", ""))
                file_name  = str(status_result.get("FileName", ""))
            except TimeoutError as exc:
                run_log.failed_step = "poll"
                raise HTTPException(504, str(exc))
            except (httpx.HTTPStatusError, httpx.ConnectError) as exc:
                run_log.failed_step = "poll"
                raise HTTPException(502, f"PeopleSoft status polling error: {exc}")
            log.info("Run %d  step=poll  instance=%s  report=%s  file=%s  %d ms",
                     run_log.id, instance_id, report_id, file_name, round((_time.time() - t2) * 1000))
            if report_id:
                run_log.report_id = report_id
                db.commit()

        # ── Step 3: Download ───────────────────────────────────────────────────
        is_windows = s_eng.retrieval_method in ("winrm", "smb", "win_ssh")
        if s_eng.retrieval_method == "ftp":
            sftp_configured = bool(s_eng.ftp_host and s_eng.ftp_remote_path)
        elif is_windows:
            sftp_configured = bool(s_eng.win_host and s_eng.sftp_remote_path)
        else:
            sftp_configured = bool(s_eng.sftp_host and s_eng.sftp_remote_path)

        if not sftp_configured:
            duration_ms = int((_time.time() - start) * 1000)
            run_log.status       = "success"
            _method_labels = {"ftp": "FTP", "scp": "SSH/SCP", "winrm": "WinRM", "smb": "SMB", "win_ssh": "SSH"}
            run_log.sftp_skipped = True
            run_log.skip_reason  = f"{_method_labels.get(s_eng.retrieval_method, 'SFTP')} host or remote path not configured"
            run_log.row_count    = 0
            run_log.duration_ms  = duration_ms
            run_log.completed_at = datetime.now(timezone.utc)
            db.add(AuditEvent(
                user_id=user.id, event_type="run_completed",
                detail={"config_id": config_id, "engine": engine_label,
                        "instance_id": instance_id, "sftp_skipped": True},
                ip_address=ip_address,
            ))
            db.commit()
            return run_log, {
                "engine_name": engine_label, "process_name": engine_process_name,
                "run_id": run_log.id, "instance_id": instance_id, "report_id": report_id,
                "sftp_skipped": True, "row_count": 0, "kpis": {}, "chart_data": [],
                "dq_results": [],
                "message": "PeopleSoft process completed. SFTP retrieval skipped.",
            }

        remote_path = s_eng.ftp_remote_path if s_eng.retrieval_method == "ftp" else s_eng.sftp_remote_path
        if report_id:
            remote_path = remote_path.replace("{report_id}", report_id)
        if instance_id:
            remote_path = remote_path.replace("{instance_id}", instance_id)
        if file_name:
            if "{file_name}" in remote_path:
                remote_path = remote_path.replace("{file_name}", file_name)
            else:
                remote_path = remote_path.rstrip("/") + "/" + file_name

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
            label_map = {"scp": "SSH/SCP", "winrm": "WinRM", "smb": "SMB", "win_ssh": "SSH", "ftp": "FTP"}
            if not isinstance(exc, HTTPException):
                run_log.failed_step = "download"
            raise exc if isinstance(exc, HTTPException) else HTTPException(
                503, f"{label_map.get(s_eng.retrieval_method, 'SFTP')} download error: {exc} (path: {remote_path})"
            )
        log.info("Run %d  step=download  size=%d bytes  %d ms",
                 run_log.id, len(csv_bytes), round((_time.time() - t3) * 1000))

        # ── Step 4: Parse ──────────────────────────────────────────────────────
        t4 = _time.time()
        from csv_parser import parse_and_compute
        try:
            result = parse_and_compute(csv_bytes)
        except Exception as exc:
            run_log.failed_step = "parse"
            raise HTTPException(422, f"CSV parse error: {exc}")
        log.info("Run %d  step=parse  rows=%d  %d ms",
                 run_log.id, result.get("row_count", 0), round((_time.time() - t4) * 1000))

        # ── Save to run_outputs ────────────────────────────────────────────────
        run_output_id = None
        try:
            from routers.run_outputs import save_run_output
            run_output_id = save_run_output(
                db=db, user_id=user.id, run_log_id=run_log.id,
                csv_bytes=csv_bytes, config_name=config.name,
                engine_name=engine_label, process_name=engine_process_name,
                row_count=result.get("row_count", 0),
            )
        except Exception as exc:
            log.warning("save_run_output failed (non-fatal): %s", exc)

        # ── Data quality checks ────────────────────────────────────────────────
        dq_results = []
        try:
            from quality_checker import run_checks
            dq_results = run_checks(db=db, config_id=config_id, run_log_id=run_log.id, csv_bytes=csv_bytes)
        except Exception as exc:
            log.warning("DQ checks failed (non-fatal): %s", exc)

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
            ip_address=ip_address,
        ))
        db.commit()
        log.info("Run complete  run_id=%d  engine=%r  rows=%d  %d ms",
                 run_log.id, engine_label, result["row_count"], duration_ms)

        result.update({
            "engine_name":  engine_label, "process_name": engine_process_name,
            "run_id":        run_log.id, "instance_id": instance_id,
            "report_id":     report_id, "sftp_skipped": False,
            "dq_results":    dq_results,
            "run_output_id": run_output_id,
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
            ip_address=ip_address,
        ))
        db.commit()
        log.error("Run failed  run_id=%d  engine=%r  step=%s  error=%s  %d ms",
                  run_log.id, engine_label, run_log.failed_step or "unknown", exc.detail, duration_ms)
        return run_log, {
            "engine_name": engine_label, "process_name": engine_process_name,
            "run_id": run_log.id, "status": "error", "error": str(exc.detail),
            "row_count": 0, "kpis": {}, "chart_data": [], "dq_results": [],
        }


def run_config_engines(config_id: int, user, db, request=None) -> dict:
    """Run every engine attached to a config. Returns aggregate result."""
    config = db.query(UserConfig).filter(
        UserConfig.id == config_id, UserConfig.user_id == user.id
    ).first()
    if not config:
        raise HTTPException(404, "Configuration not found")

    s = config_to_ns(config)

    engine_rows = (
        db.query(UserConfigEngine, Engine)
        .join(Engine, UserConfigEngine.engine_id == Engine.id)
        .filter(UserConfigEngine.config_id == config_id, Engine.is_active == True)  # noqa: E712
        .order_by(UserConfigEngine.sort_order)
        .all()
    )
    if engine_rows:
        engines_to_run = [
            (e.process_name, e.name) for _, e in engine_rows
            if e.process_name  # skip engines whose process_name was left blank
        ]
        if not engines_to_run:
            log.warning("Config %d has engine rows but all have empty process_name — falling back to config ps_process_name", config_id)
    else:
        engines_to_run = []

    if not engines_to_run and s.ps_process_name:
        engines_to_run = [(s.ps_process_name, s.ps_process_name)]
    elif not engines_to_run:
        raise HTTPException(400, "No engines configured and no process name set for this configuration.")

    log.info("Run dispatched  config=%d (%s)  user=%s  engines=%s  method=%s",
             config_id, config.name, user.id[:8], [p for p, _ in engines_to_run], s.retrieval_method)

    results = []
    last_ok = None
    for process_name, label in engines_to_run:
        _, eng_result = run_one_engine(config, process_name, label, s, user, config_id, db, request)
        results.append(eng_result)
        if eng_result.get("status") != "error":
            last_ok = eng_result

    # Fire notifications (non-fatal)
    try:
        from notifier import notify_run_complete
        notify_run_complete(db=db, user_id=user.id, config_name=config.name, run_results=results)
    except Exception as exc:
        log.warning("notify_run_complete failed (non-fatal): %s", exc)

    # Collect all saved output IDs in engine order so the frontend can analyse
    # each one; the first successful output is used as the primary.
    run_output_ids = [r["run_output_id"] for r in results if r.get("run_output_id")]
    primary = next((r for r in results if r.get("run_output_id")), None) or last_ok or results[-1]
    base = last_ok or results[-1]
    return {
        "runs":           results,
        "total_engines":  len(results),
        "success_count":  sum(1 for r in results if r.get("status") != "error"),
        "row_count":      sum(r.get("row_count", 0) for r in results),
        "kpis":           primary.get("kpis", {}),
        "chart_data":     primary.get("chart_data", []),
        "instance_id":    primary.get("instance_id", ""),
        "report_id":      primary.get("report_id", ""),
        "sftp_skipped":   all(r.get("sftp_skipped") for r in results),
        "dq_results":     [item for r in results for item in r.get("dq_results", [])],
        "rows":           primary.get("rows", []),
        "columns":        primary.get("columns", []),
        "run_output_id":  run_output_ids[0] if run_output_ids else base.get("run_output_id"),
        "run_output_ids": run_output_ids,
    }
