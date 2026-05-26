from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, RunLog
from logger import get_logger

log = get_logger("runs")

router = APIRouter(prefix="/api/v2/runs", tags=["runs"])


def _serialize(entry: RunLog) -> dict:
    return {
        "id":              entry.id,
        "config_id":       entry.config_id,
        "config_name":     entry.config_name,
        "ps_process_name": entry.ps_process_name or "",
        "status":          entry.status,
        "instance_id":     entry.instance_id or "",
        "report_id":       entry.report_id or "",
        "sftp_skipped":    entry.sftp_skipped or False,
        "skip_reason":     entry.skip_reason or "",
        "failed_step":     entry.failed_step or "",
        "row_count":       entry.row_count,
        "error_detail":    entry.error_detail,
        "duration_ms":     entry.duration_ms,
        "started_at":      entry.started_at,
        "completed_at":    entry.completed_at,
    }


@router.get("/")
def list_runs(
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    status: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(RunLog).filter(RunLog.user_id == user.id)
    if status:
        q = q.filter(RunLog.status == status)
    total = q.count()
    logs = q.order_by(RunLog.started_at.desc()).offset(offset).limit(limit).all()
    log.debug("list_runs  user=%s  total=%d  returned=%d  status=%r",
              user.id[:8], total, len(logs), status)
    return {"total": total, "items": [_serialize(l) for l in logs]}


@router.get("/{run_id}")
def get_run(run_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entry = db.query(RunLog).filter(RunLog.id == run_id, RunLog.user_id == user.id).first()
    if not entry:
        log.warning("get_run 404  id=%d  user=%s", run_id, user.id[:8])
        raise HTTPException(404, "Run not found")
    log.debug("get_run  id=%d  status=%s  user=%s", run_id, entry.status, user.id[:8])
    return _serialize(entry)
