import asyncio
import datetime
import io
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import RunOutput, RunLog, DataQualityResult, User, AnalysisResult
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
    # Subquery: latest AnalysisResult id per run_output_id, scoped to this user
    ar_sub = (
        db.query(
            AnalysisResult.run_output_id,
            func.max(AnalysisResult.id).label("ar_id"),
        )
        .filter(
            AnalysisResult.user_id == user.id,
            AnalysisResult.run_output_id.isnot(None),
        )
        .group_by(AnalysisResult.run_output_id)
        .subquery()
    )

    rows = (
        db.query(
            RunOutput.id, RunOutput.display_name, RunOutput.config_name,
            RunOutput.engine_name, RunOutput.process_name, RunOutput.run_log_id,
            RunOutput.row_count, RunOutput.file_size_bytes, RunOutput.created_at,
            ar_sub.c.ar_id,
        )
        .outerjoin(ar_sub, ar_sub.c.run_output_id == RunOutput.id)
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
                "id":                 r.id,
                "display_name":       r.display_name,
                "config_name":        r.config_name,
                "engine_name":        r.engine_name,
                "process_name":       r.process_name,
                "run_log_id":         r.run_log_id,
                "row_count":          r.row_count,
                "file_size_bytes":    r.file_size_bytes,
                "created_at":         r.created_at.isoformat() if r.created_at else None,
                "analysis_result_id": r.ar_id,
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


@router.get("/diff")
def diff_run_outputs(
    a:          int             = Query(..., description="Base (older) run output ID"),
    b:          int             = Query(..., description="Comparison (newer) run output ID"),
    key_column: str | None      = Query(None, description="Column to use as row key"),
    user:       User            = Depends(get_current_user),
    db:         Session         = Depends(get_db),
):
    """Compare two saved run outputs row-by-row. Returns added/removed/changed counts and rows."""
    import pandas as pd

    row_a = db.query(RunOutput).filter(RunOutput.id == a, RunOutput.user_id == user.id).first()
    row_b = db.query(RunOutput).filter(RunOutput.id == b, RunOutput.user_id == user.id).first()
    if not row_a or not row_b:
        raise HTTPException(404, "One or both run outputs not found")

    df_a = pd.read_csv(io.BytesIO(row_a.csv_content), low_memory=False, dtype=str).fillna("")
    df_b = pd.read_csv(io.BytesIO(row_b.csv_content), low_memory=False, dtype=str).fillna("")

    # Auto-detect key column if not provided
    if not key_column:
        candidates = ["EMPLID", "EMPLOYEE_ID", "EMP_ID", "ID", "KEY", "PERSON_ID", "OPRID"]
        upper_a = {c.upper(): c for c in df_a.columns}
        for cand in candidates:
            if cand in upper_a:
                key_column = upper_a[cand]
                break

    meta = {
        "run_a": {"id": row_a.id, "display_name": row_a.display_name, "created_at": row_a.created_at.isoformat() if row_a.created_at else None, "row_count": row_a.row_count},
        "run_b": {"id": row_b.id, "display_name": row_b.display_name, "created_at": row_b.created_at.isoformat() if row_b.created_at else None, "row_count": row_b.row_count},
        "key_column": key_column,
    }

    _MAX_ROWS = 500   # cap to avoid huge payloads

    if key_column and key_column in df_a.columns and key_column in df_b.columns:
        keys_a = set(df_a[key_column])
        keys_b = set(df_b[key_column])
        added_keys   = keys_b - keys_a
        removed_keys = keys_a - keys_b
        common_keys  = keys_a & keys_b

        added_rows   = df_b[df_b[key_column].isin(added_keys)].head(_MAX_ROWS).to_dict("records")
        removed_rows = df_a[df_a[key_column].isin(removed_keys)].head(_MAX_ROWS).to_dict("records")

        # Changed rows — same key but at least one column differs
        changed_rows = []
        merged = df_a[df_a[key_column].isin(common_keys)].set_index(key_column).join(
            df_b[df_b[key_column].isin(common_keys)].set_index(key_column),
            lsuffix="_before", rsuffix="_after",
        )
        for key, row in merged.iterrows():
            diff_cols = {}
            for col in df_a.columns:
                if col == key_column:
                    continue
                before_col = f"{col}_before"
                after_col  = f"{col}_after"
                if before_col in row and after_col in row:
                    if str(row[before_col]) != str(row[after_col]):
                        diff_cols[col] = {"before": str(row[before_col]), "after": str(row[after_col])}
            if diff_cols:
                changed_rows.append({key_column: key, "changes": diff_cols})
            if len(changed_rows) >= _MAX_ROWS:
                break

        return {
            "meta": meta,
            "summary": {
                "added_count":   len(added_keys),
                "removed_count": len(removed_keys),
                "changed_count": len(changed_rows),
                "unchanged_count": len(common_keys) - len(changed_rows),
            },
            "added_rows":   added_rows,
            "removed_rows": removed_rows,
            "changed_rows": changed_rows,
        }

    # Fallback: index-based diff
    cols_a = set(df_a.columns)
    cols_b = set(df_b.columns)
    added_cols   = list(cols_b - cols_a)
    removed_cols = list(cols_a - cols_b)
    min_len = min(len(df_a), len(df_b))
    common_cols = [c for c in df_a.columns if c in cols_b]

    changed_rows = []
    for i in range(min_len):
        diff_cols = {
            col: {"before": str(df_a.iloc[i][col]), "after": str(df_b.iloc[i][col])}
            for col in common_cols
            if str(df_a.iloc[i][col]) != str(df_b.iloc[i][col])
        }
        if diff_cols:
            changed_rows.append({"row_index": i, "changes": diff_cols})
        if len(changed_rows) >= _MAX_ROWS:
            break

    added_rows   = df_b.iloc[len(df_a):].head(_MAX_ROWS).to_dict("records") if len(df_b) > len(df_a) else []
    removed_rows = df_a.iloc[len(df_b):].head(_MAX_ROWS).to_dict("records") if len(df_a) > len(df_b) else []

    return {
        "meta": meta,
        "summary": {
            "added_count":    len(df_b) - len(df_a) if len(df_b) > len(df_a) else 0,
            "removed_count":  len(df_a) - len(df_b) if len(df_a) > len(df_b) else 0,
            "changed_count":  len(changed_rows),
            "unchanged_count": min_len - len(changed_rows),
            "added_columns":   added_cols,
            "removed_columns": removed_cols,
        },
        "added_rows":   added_rows,
        "removed_rows": removed_rows,
        "changed_rows": changed_rows,
    }


@router.post("/{output_id}/analyze")
async def analyze_run_output(
    output_id:   int,
    user:        User = Depends(get_current_user),
    db:          Session = Depends(get_db),
    ai_model_id: int | None = Query(None),
):
    """Re-run AI analysis on a previously saved run output — streamed via SSE."""
    row = db.query(RunOutput).filter(
        RunOutput.id == output_id, RunOutput.user_id == user.id
    ).first()
    if not row:
        raise HTTPException(404, "Run output not found")

    log.info("analyze_run_output  id=%d  user=%s", output_id, user.id[:8])

    from routers.insights import _run_analysis
    fname = row.display_name if row.display_name.endswith(".csv") else row.display_name + ".csv"
    raw   = row.csv_content

    async def event_stream():
        box:  dict = {}
        done = asyncio.Event()

        async def worker():
            try:
                result = await asyncio.to_thread(_run_analysis, raw, fname, user, db, ai_model_id, output_id)
                result["meta"]["run_output_id"] = output_id
                box["result"] = result
            except Exception as exc:
                box["error"]       = exc.detail if isinstance(exc, HTTPException) else str(exc)
                box["status_code"] = exc.status_code if isinstance(exc, HTTPException) else 500
            finally:
                done.set()

        asyncio.create_task(worker())

        while not done.is_set():
            try:
                await asyncio.wait_for(asyncio.shield(done.wait()), timeout=5.0)
            except asyncio.TimeoutError:
                yield b'data: {"status":"processing"}\n\n'

        if "error" in box:
            yield (
                'data: ' +
                json.dumps({"error": box["error"], "status_code": box.get("status_code", 500)}) +
                '\n\n'
            ).encode()
        else:
            yield ('data: ' + json.dumps(box["result"]) + '\n\n').encode()
        yield b'data: [DONE]\n\n'

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


_MAX_HISTORY_ROWS = 10_000


@router.get("/{output_id}/reconstruct")
def reconstruct_run_output(
    output_id: int,
    user:      User    = Depends(get_current_user),
    db:        Session = Depends(get_db),
):
    """Reconstruct a runResult-shaped payload from stored data for the history dashboard."""
    import pandas as pd

    row = db.query(RunOutput).filter(
        RunOutput.id == output_id, RunOutput.user_id == user.id
    ).first()
    if not row:
        raise HTTPException(404, "Run output not found")

    try:
        df = pd.read_csv(io.BytesIO(row.csv_content), low_memory=False, dtype=str).fillna("")
    except Exception as exc:
        raise HTTPException(422, f"Could not parse stored CSV: {exc}") from exc

    columns = list(df.columns)
    total_rows = len(df)
    rows = df.head(_MAX_HISTORY_ROWS).to_dict("records")

    run_log = None
    if row.run_log_id:
        run_log = db.query(RunLog).filter(RunLog.id == row.run_log_id).first()

    dq_results = []
    if run_log:
        dq_rows = db.query(DataQualityResult).filter(
            DataQualityResult.run_log_id == run_log.id
        ).all()
        dq_results = [
            {
                "rule_name":    r.rule_name,
                "rule_type":    r.rule_type,
                "passed":       r.passed,
                "actual_value": r.actual_value,
                "message":      r.message,
            }
            for r in dq_rows
        ]

    run_entry = {
        "id":           run_log.id           if run_log else None,
        "duration_ms":  run_log.duration_ms  if run_log else None,
        "engine_name":  row.engine_name,
        "process_name": row.process_name,
        "status":       run_log.status       if run_log else "success",
    }

    log.info("reconstruct_run_output  id=%d  user=%s  rows=%d", output_id, user.id[:8], total_rows)

    return {
        "instance_id":    run_log.instance_id if run_log else "",
        "report_id":      run_log.report_id   if run_log else "",
        "row_count":      row.row_count,
        "runs":           [run_entry],
        "success_count":  1,
        "dq_results":     dq_results,
        "rows":           rows,
        "columns":        columns,
        "run_output_id":  output_id,
        "config_name":    row.config_name,
        "display_name":   row.display_name,
        "created_at":     row.created_at.isoformat() if row.created_at else None,
        "total_rows":     total_rows,
        "rows_truncated": total_rows > _MAX_HISTORY_ROWS,
    }
