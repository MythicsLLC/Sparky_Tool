"""APScheduler wrapper for automated PeopleSoft runs."""
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from logger import get_logger

log = get_logger("scheduler")
_scheduler: BackgroundScheduler | None = None


# ── job execution ─────────────────────────────────────────────────────────────

def _execute_job(schedule_id: int) -> None:
    """Called by APScheduler in a background thread for each scheduled run."""
    from database import _SessionLocal
    if _SessionLocal is None:
        log.warning("Scheduled job %d skipped — DB not initialised", schedule_id)
        return

    db = _SessionLocal()
    try:
        from models import ScheduledRun, User
        sched = db.query(ScheduledRun).filter(ScheduledRun.id == schedule_id).first()
        if not sched or not sched.is_active:
            return

        user = db.query(User).filter(User.id == sched.user_id).first()
        if not user:
            log.warning("Scheduled job %d — user %s not found", schedule_id, sched.user_id)
            return

        sched.last_run_at = datetime.now(timezone.utc)
        sched.last_status = "running"
        db.commit()
        log.info("Scheduled job %d started  config=%d  user=%s", schedule_id, sched.config_id, user.id[:8])

        try:
            from run_engine import run_config_engines
            run_config_engines(sched.config_id, user, db)
            sched.last_status = "success"
            log.info("Scheduled job %d completed", schedule_id)
        except Exception as exc:
            sched.last_status = "error"
            log.error("Scheduled job %d failed: %s", schedule_id, exc)
        finally:
            # Refresh next_run_at from APScheduler
            job = _scheduler.get_job(f"schedule_{schedule_id}") if _scheduler else None
            if job and job.next_run_time:
                sched.next_run_at = job.next_run_time
            db.commit()
    finally:
        db.close()


# ── trigger builder ───────────────────────────────────────────────────────────

def _make_trigger(sched) -> CronTrigger:
    tz = sched.timezone if hasattr(sched, "timezone") and sched.timezone else "UTC"
    if sched.frequency == "weekly":
        return CronTrigger(day_of_week=sched.day_of_week, hour=sched.run_hour,
                           minute=sched.run_minute, timezone=tz)
    if sched.frequency == "monthly":
        return CronTrigger(day=sched.day_of_month, hour=sched.run_hour,
                           minute=sched.run_minute, timezone=tz)
    # daily (default)
    return CronTrigger(hour=sched.run_hour, minute=sched.run_minute, timezone=tz)


# ── public API ────────────────────────────────────────────────────────────────

def start() -> None:
    global _scheduler
    _scheduler = BackgroundScheduler(job_defaults={"misfire_grace_time": 3600})
    _scheduler.start()
    log.info("Scheduler started")

    try:
        from database import _SessionLocal
        from models import ScheduledRun
        db = _SessionLocal()
        try:
            schedules = db.query(ScheduledRun).filter(ScheduledRun.is_active == True).all()
            for s in schedules:
                _add_job(s)
            log.info("Loaded %d active scheduled run(s)", len(schedules))
        finally:
            db.close()
    except Exception as exc:
        log.warning("Could not load schedules at startup: %s", exc)


def stop() -> None:
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        log.info("Scheduler stopped")


def _add_job(sched) -> None:
    if not _scheduler:
        return
    job_id = f"schedule_{sched.id}"
    _scheduler.add_job(
        _execute_job,
        trigger=_make_trigger(sched),
        id=job_id,
        args=[sched.id],
        replace_existing=True,
    )
    job = _scheduler.get_job(job_id)
    next_run = job.next_run_time if job else None
    log.info("Registered schedule %d  freq=%s  next=%s", sched.id, sched.frequency, next_run)


def register(sched) -> None:
    """Add or replace a job and persist next_run_at."""
    _add_job(sched)
    _persist_next_run(sched.id)


def unregister(schedule_id: int) -> None:
    if not _scheduler:
        return
    job_id = f"schedule_{schedule_id}"
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)
        log.info("Unregistered schedule %d", schedule_id)


def _persist_next_run(schedule_id: int) -> None:
    if not _scheduler:
        return
    job = _scheduler.get_job(f"schedule_{schedule_id}")
    if not job:
        return
    try:
        from database import _SessionLocal
        from models import ScheduledRun
        db = _SessionLocal()
        try:
            s = db.query(ScheduledRun).filter(ScheduledRun.id == schedule_id).first()
            if s:
                s.next_run_at = job.next_run_time
                db.commit()
        finally:
            db.close()
    except Exception as exc:
        log.warning("Could not persist next_run_at for schedule %d: %s", schedule_id, exc)
