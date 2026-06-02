import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import RunOutput, User
from logger import get_logger

log = get_logger("run_outputs")
router = APIRouter(prefix="/api/v2/run-outputs", tags=["run-outputs"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _row_to_dict(row: RunOutput) -> dict:
    return {
        "id":              row.id,
        "display_name":    row.display_name,
        "config_name":     row.config_name,
        "engine_name":     row.engine_name,
        "process_name":    row.process_name,
        "run_log_id":      row.run_log_id,
        "row_count":       row.row_count,
        "file_size_bytes": row.file_size_bytes,
        "created_at":      row.created_at.isoformat() if row.created_at else None,
    }


def save_run_output(
    *,
    db:           Session,
    user_id:      str,
    run_log_id:   int | None,
    csv_bytes:    bytes,
    config_name:  str,
    engine_name:  str,
    process_name: str,
    row_count:    int,
) -> int:
    """Persist a downloaded CSV to the DB. Called synchronously from _run_one_engine."""
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M")
    display = f"{config_name} – {engine_name} ({ts})"

    record = RunOutput(
        user_id         = user_id,
        run_log_id      = run_log_id,
        display_name    = display,
        config_name     = config_name,
        engine_name     = engine_name,
        process_name    = process_name,
        row_count       = row_count,
        file_size_bytes = len(csv_bytes),
        csv_content     = csv_bytes,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    log.info(
        "save_run_output  id=%d  user=%s  config=%r  engine=%r  rows=%d  size=%d",
        record.id, user_id[:8], config_name, engine_name, row_count, len(csv_bytes),
    )
    return record.id


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
def list_run_outputs(
    limit:  int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user:   User = Depends(get_current_user),
    db:     Session = Depends(get_db),
):
    """List current user's saved run outputs, newest first. csv_content excluded."""
    rows = (
        db.query(
            RunOutput.id, RunOutput.display_name, RunOutput.config_name,
            RunOutput.engine_name, RunOutput.process_name, RunOutput.run_log_id,
            RunOutput.row_count, RunOutput.file_size_bytes, RunOutput.created_at,
        )
        .filter(RunOutput.user_id == user.id)
        .order_by(RunOutput.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    total = db.query(RunOutput).filter(RunOutput.user_id == user.id).count()
    return {
        "items": [
            {
                "id":              r.id,
                "display_name":    r.display_name,
                "config_name":     r.config_name,
                "engine_name":     r.engine_name,
                "process_name":    r.process_name,
                "run_log_id":      r.run_log_id,
                "row_count":       r.row_count,
                "file_size_bytes": r.file_size_bytes,
                "created_at":      r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "total":  total,
        "limit":  limit,
        "offset": offset,
    }


@router.delete("/{output_id}", status_code=204)
def delete_run_output(
    output_id: int,
    user:      User = Depends(get_current_user),
    db:        Session = Depends(get_db),
):
    """Delete a saved run output (DB record + stored bytes)."""
    row = db.query(RunOutput).filter(
        RunOutput.id == output_id, RunOutput.user_id == user.id
    ).first()
    if not row:
        raise HTTPException(404, "Run output not found")
    db.delete(row)
    db.commit()
    log.info("delete_run_output  id=%d  user=%s", output_id, user.id[:8])


@router.post("/{output_id}/analyze")
def analyze_run_output(
    output_id:   int,
    user:        User = Depends(get_current_user),
    db:          Session = Depends(get_db),
    ai_model_id: int | None = Query(None),
):
    """Re-run AI analysis on a previously saved run output."""
    row = db.query(RunOutput).filter(
        RunOutput.id == output_id, RunOutput.user_id == user.id
    ).first()
    if not row:
        raise HTTPException(404, "Run output not found")

    log.info("analyze_run_output  id=%d  user=%s", output_id, user.id[:8])

    from routers.insights import _run_analysis
    # Append .csv so _run_analysis uses the CSV parsing path
    fname = row.display_name if row.display_name.endswith(".csv") else row.display_name + ".csv"
    result = _run_analysis(row.csv_content, fname, user, db, ai_model_id)
    result["meta"]["run_output_id"] = output_id
    return result
