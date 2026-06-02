from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, UserConfig, ScheduledRun
from logger import get_logger

log = get_logger("schedules")
router = APIRouter(prefix="/api/v2/schedules", tags=["schedules"])


class SchedulePayload(BaseModel):
    config_id:    int
    label:        str   = ""
    frequency:    str   = "daily"   # daily | weekly | monthly
    run_hour:     int   = 0
    run_minute:   int   = 0
    day_of_week:  int   = 0         # 0=Mon … 6=Sun
    day_of_month: int   = 1         # 1-31
    is_active:    bool  = True


def _serialize(s: ScheduledRun) -> dict:
    return {
        "id":           s.id,
        "config_id":    s.config_id,
        "label":        s.label or "",
        "frequency":    s.frequency,
        "run_hour":     s.run_hour,
        "run_minute":   s.run_minute,
        "day_of_week":  s.day_of_week,
        "day_of_month": s.day_of_month,
        "is_active":    s.is_active,
        "next_run_at":  s.next_run_at.isoformat() if s.next_run_at else None,
        "last_run_at":  s.last_run_at.isoformat() if s.last_run_at else None,
        "last_status":  s.last_status or "",
        "created_at":   s.created_at.isoformat() if s.created_at else None,
    }


@router.get("/")
def list_schedules(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(ScheduledRun).filter(ScheduledRun.user_id == user.id).all()
    return [_serialize(r) for r in rows]


@router.post("/", status_code=201)
def create_schedule(
    body: SchedulePayload,
    user: User = Depends(get_current_user),
    db:   Session = Depends(get_db),
):
    config = db.query(UserConfig).filter(
        UserConfig.id == body.config_id, UserConfig.user_id == user.id
    ).first()
    if not config:
        raise HTTPException(404, "Configuration not found")

    sched = ScheduledRun(
        user_id      = user.id,
        config_id    = body.config_id,
        label        = body.label or config.name,
        frequency    = body.frequency,
        run_hour     = body.run_hour,
        run_minute   = body.run_minute,
        day_of_week  = body.day_of_week,
        day_of_month = body.day_of_month,
        is_active    = body.is_active,
    )
    db.add(sched)
    db.commit()
    db.refresh(sched)

    if sched.is_active:
        try:
            import scheduler as _sched
            _sched.register(sched)
        except Exception as exc:
            log.warning("Could not register schedule %d with APScheduler: %s", sched.id, exc)

    log.info("Created schedule %d  config=%d  freq=%s  user=%s",
             sched.id, sched.config_id, sched.frequency, user.id[:8])
    return _serialize(sched)


@router.patch("/{schedule_id}")
def update_schedule(
    schedule_id: int,
    body: SchedulePayload,
    user: User = Depends(get_current_user),
    db:   Session = Depends(get_db),
):
    sched = db.query(ScheduledRun).filter(
        ScheduledRun.id == schedule_id, ScheduledRun.user_id == user.id
    ).first()
    if not sched:
        raise HTTPException(404, "Schedule not found")

    sched.config_id    = body.config_id
    sched.label        = body.label or sched.label
    sched.frequency    = body.frequency
    sched.run_hour     = body.run_hour
    sched.run_minute   = body.run_minute
    sched.day_of_week  = body.day_of_week
    sched.day_of_month = body.day_of_month
    sched.is_active    = body.is_active
    sched.updated_at   = datetime.now(timezone.utc)
    db.commit()
    db.refresh(sched)

    try:
        import scheduler as _sched
        if sched.is_active:
            _sched.register(sched)
        else:
            _sched.unregister(schedule_id)
    except Exception as exc:
        log.warning("Scheduler sync failed for schedule %d: %s", schedule_id, exc)

    return _serialize(sched)


@router.delete("/{schedule_id}", status_code=204)
def delete_schedule(
    schedule_id: int,
    user: User = Depends(get_current_user),
    db:   Session = Depends(get_db),
):
    sched = db.query(ScheduledRun).filter(
        ScheduledRun.id == schedule_id, ScheduledRun.user_id == user.id
    ).first()
    if not sched:
        raise HTTPException(404, "Schedule not found")
    try:
        import scheduler as _sched
        _sched.unregister(schedule_id)
    except Exception:
        pass
    db.delete(sched)
    db.commit()
    log.info("Deleted schedule %d  user=%s", schedule_id, user.id[:8])
