from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from auth import require_admin
from database import get_db
from models import User, RunLog, AuditEvent
from logger import get_logger

log = get_logger("admin")

router = APIRouter(prefix="/api/v2/admin", tags=["admin"])


@router.get("/stats")
def get_stats(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    total_users    = db.query(func.count(User.id)).scalar()
    total_runs     = db.query(func.count(RunLog.id)).scalar()
    success_runs   = db.query(func.count(RunLog.id)).filter(RunLog.status == "success").scalar()
    error_runs     = db.query(func.count(RunLog.id)).filter(RunLog.status == "error").scalar()
    running_runs   = db.query(func.count(RunLog.id)).filter(RunLog.status == "running").scalar()
    sftp_skipped   = db.query(func.count(RunLog.id)).filter(RunLog.sftp_skipped == True).scalar()  # noqa: E712
    avg_duration   = db.query(func.avg(RunLog.duration_ms)).filter(
        RunLog.status == "success", RunLog.duration_ms.isnot(None)
    ).scalar()
    total_rows     = db.query(func.sum(RunLog.row_count)).filter(
        RunLog.status == "success", RunLog.row_count.isnot(None)
    ).scalar() or 0
    avg_rows       = db.query(func.avg(RunLog.row_count)).filter(
        RunLog.status == "success", RunLog.row_count.isnot(None), RunLog.row_count > 0
    ).scalar()

    runs_per_day = db.execute(text("""
        SELECT DATE(started_at) AS day, COUNT(*) AS count,
               SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS success,
               SUM(CASE WHEN status='error'   THEN 1 ELSE 0 END) AS errors
        FROM run_logs
        WHERE started_at >= NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day
    """)).fetchall()

    # Last 10 runs for the recent activity panel
    recent_runs = db.execute(text("""
        SELECT r.id, r.status, r.instance_id, r.report_id, r.ps_process_name,
               r.sftp_skipped, r.row_count, r.duration_ms, r.started_at,
               u.email AS user_email, r.config_name
        FROM run_logs r
        LEFT JOIN users u ON u.id = r.user_id
        ORDER BY r.started_at DESC
        LIMIT 10
    """)).fetchall()

    log.debug("admin stats  users=%d  runs=%d (ok=%d err=%d sftp_skipped=%d)  requested_by=%s",
              total_users, total_runs, success_runs, error_runs, sftp_skipped, user.id[:8])

    return {
        "total_users":     total_users,
        "total_runs":      total_runs,
        "success_runs":    success_runs,
        "error_runs":      error_runs,
        "running_runs":    running_runs,
        "sftp_skipped":    sftp_skipped,
        "success_rate":    round(success_runs / total_runs * 100, 1) if total_runs else 0,
        "avg_duration_ms": round(avg_duration) if avg_duration else 0,
        "total_rows_processed": total_rows,
        "avg_rows_per_run":     round(avg_rows) if avg_rows else 0,
        "runs_per_day": [
            {"day": str(r.day), "count": r.count, "success": r.success, "errors": r.errors}
            for r in runs_per_day
        ],
        "recent_runs": [
            {
                "id":              r.id,
                "status":          r.status,
                "instance_id":     r.instance_id or "",
                "report_id":       r.report_id or "",
                "ps_process_name": r.ps_process_name or "",
                "sftp_skipped":    r.sftp_skipped or False,
                "row_count":       r.row_count,
                "duration_ms":     r.duration_ms,
                "started_at":      str(r.started_at),
                "user_email":      r.user_email or "",
                "config_name":     r.config_name or "",
            }
            for r in recent_runs
        ],
    }


@router.get("/users")
def list_users(
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    total = db.query(func.count(User.id)).scalar()
    users = db.query(User).order_by(User.created_at.desc()).offset(offset).limit(limit).all()

    run_counts = dict(
        db.query(RunLog.user_id, func.count(RunLog.id))
        .group_by(RunLog.user_id)
        .all()
    )

    log.debug("admin list_users  total=%d  returned=%d  requested_by=%s", total, len(users), user.id[:8])

    return {
        "total": total,
        "items": [
            {
                "id":           u.id,
                "email":        u.email,
                "first_name":   u.first_name,
                "last_name":    u.last_name,
                "role":         u.role,
                "onboarded":    u.onboarded,
                "run_count":    run_counts.get(u.id, 0),
                "created_at":   u.created_at,
                "last_seen_at": u.last_seen_at,
            }
            for u in users
        ],
    }


class RolePayload(BaseModel):
    role: str


@router.put("/users/{target_id}/role")
def set_user_role(
    target_id: str,
    body: RolePayload,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if body.role not in ("user", "admin"):
        raise HTTPException(400, "Role must be 'user' or 'admin'")
    target = db.query(User).filter(User.id == target_id).first()
    if not target:
        log.warning("set_user_role 404  target=%s  admin=%s", target_id[:8], admin.id[:8])
        raise HTTPException(404, "User not found")
    old_role = target.role
    target.role = body.role
    db.add(AuditEvent(
        user_id=admin.id,
        event_type="role_changed",
        detail={"target_user": target_id, "new_role": body.role},
    ))
    db.commit()
    log.info("Role changed  target=%s  %s → %s  by admin=%s",
             target_id[:8], old_role, body.role, admin.id[:8])
    return {"status": "updated", "role": body.role}


@router.get("/runs")
def list_all_runs(
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    status: str | None = Query(None),
    user_id: str | None = Query(None),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(RunLog)
    if status:
        q = q.filter(RunLog.status == status)
    if user_id:
        q = q.filter(RunLog.user_id == user_id)
    total = q.count()
    logs = q.order_by(RunLog.started_at.desc()).offset(offset).limit(limit).all()

    user_map = {u.id: u.email for u in db.query(User).all()}

    log.debug("admin list_all_runs  total=%d  returned=%d  filters=(status=%r, user=%r)",
              total, len(logs), status, user_id)

    return {
        "total": total,
        "items": [
            {
                "id":              l.id,
                "user_id":         l.user_id,
                "user_email":      user_map.get(l.user_id, ""),
                "config_name":     l.config_name,
                "ps_process_name": l.ps_process_name or "",
                "status":          l.status,
                "instance_id":     l.instance_id or "",
                "report_id":       l.report_id or "",
                "sftp_skipped":    l.sftp_skipped or False,
                "skip_reason":     l.skip_reason or "",
                "row_count":       l.row_count,
                "error_detail":    l.error_detail,
                "duration_ms":     l.duration_ms,
                "started_at":      l.started_at,
                "completed_at":    l.completed_at,
            }
            for l in logs
        ],
    }


@router.get("/logs")
def get_audit_logs(
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    event_type: str | None = Query(None),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(AuditEvent)
    if event_type:
        q = q.filter(AuditEvent.event_type == event_type)
    total = q.count()
    events = q.order_by(AuditEvent.created_at.desc()).offset(offset).limit(limit).all()

    user_map = {u.id: f"{u.first_name} {u.last_name}".strip() or u.email
                for u in db.query(User).all()}

    log.debug("admin audit_logs  total=%d  returned=%d  filter=%r", total, len(events), event_type)

    return {
        "total": total,
        "items": [
            {
                "id":         e.id,
                "user_id":    e.user_id,
                "user_name":  user_map.get(e.user_id, ""),
                "event_type": e.event_type,
                "detail":     e.detail,
                "ip_address": e.ip_address,
                "created_at": e.created_at,
            }
            for e in events
        ],
    }
