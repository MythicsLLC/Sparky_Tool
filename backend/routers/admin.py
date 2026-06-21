import os
import httpx
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from auth import require_admin
from config import get_settings
from database import get_db
from models import User, RunLog, AuditEvent, AiModel, WideEvent, AiConversation, FeatureFlag
from encrypt import encrypt, decrypt
from logger import get_logger

log = get_logger("admin")

router = APIRouter(prefix="/api/v2/admin", tags=["admin"])

# ── helpers ───────────────────────────────────────────────────────────────────

def _clerk_secret() -> str:
    secret = os.environ.get("CLERK_API_SECRET", "") or getattr(get_settings(), "clerk_api_secret", "")
    if not secret:
        raise HTTPException(503, "CLERK_API_SECRET is not configured — set it in your environment variables to enable user management via Clerk")
    return secret


def _serialize_user(u: User, run_count: int = 0) -> dict:
    return {
        "id":           u.id,
        "email":        u.email,
        "first_name":   u.first_name or "",
        "last_name":    u.last_name or "",
        "role":         u.role,
        "onboarded":    u.onboarded,
        "run_count":    run_count,
        "created_at":   u.created_at,
        "last_seen_at": u.last_seen_at,
    }


def _serialize_model(m: AiModel) -> dict:
    return {
        "id":         m.id,
        "name":       m.name,
        "provider":   m.provider,
        "model_id":   m.model_id,
        "api_key":    "••••••••" if m.api_key_enc else "",
        "base_url":   m.base_url or "",
        "is_default": m.is_default,
        "is_active":  m.is_active,
        "created_at": m.created_at,
        "updated_at": m.updated_at,
    }


# ── stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
def get_stats(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    # Consolidate all scalar aggregates into a single round-trip instead of
    # 13 individual COUNT/SUM/AVG queries.  The CTE fan-out pattern keeps the
    # SQL readable while the DB executes everything in one plan.
    agg = db.execute(text("""
        WITH run_agg AS (
            SELECT
                COUNT(*)                                                        AS total_runs,
                COUNT(*) FILTER (WHERE status = 'success')                      AS success_runs,
                COUNT(*) FILTER (WHERE status = 'error')                        AS error_runs,
                COUNT(*) FILTER (WHERE status = 'running')                      AS running_runs,
                COUNT(*) FILTER (WHERE sftp_skipped = TRUE)                     AS sftp_skipped,
                AVG(duration_ms) FILTER (WHERE status='success'
                    AND duration_ms IS NOT NULL)                                AS avg_duration,
                COALESCE(SUM(row_count) FILTER (WHERE status='success'
                    AND row_count IS NOT NULL), 0)                              AS total_rows,
                AVG(row_count) FILTER (WHERE status='success'
                    AND row_count IS NOT NULL AND row_count > 0)               AS avg_rows
            FROM run_logs
        ),
        user_agg AS (
            SELECT COUNT(*) AS total_users FROM users
        ),
        ai_agg AS (
            SELECT
                COUNT(*)                              AS total_conversations,
                COALESCE(SUM(total_tokens), 0)        AS total_ai_tokens,
                COALESCE(SUM(estimated_cost_usd), 0)  AS total_ai_cost
            FROM ai_conversations
        ),
        wide_agg AS (
            SELECT COALESCE(COUNT(*), 0) AS total_wide_events FROM wide_events
        ),
        flag_agg AS (
            SELECT
                COUNT(*) FILTER (WHERE status = 'active')                    AS total_feature_flags,
                COUNT(*) FILTER (WHERE status = 'active' AND enabled = TRUE) AS enabled_flags
            FROM feature_flags
        )
        SELECT
            u.total_users,
            r.total_runs, r.success_runs, r.error_runs, r.running_runs,
            r.sftp_skipped, r.avg_duration, r.total_rows, r.avg_rows,
            a.total_conversations, a.total_ai_tokens, a.total_ai_cost,
            w.total_wide_events,
            f.total_feature_flags, f.enabled_flags
        FROM run_agg r, user_agg u, ai_agg a, wide_agg w, flag_agg f
    """)).mappings().one()

    total_users  = agg["total_users"]  or 0
    total_runs   = agg["total_runs"]   or 0
    success_runs = agg["success_runs"] or 0
    error_runs   = agg["error_runs"]   or 0
    running_runs = agg["running_runs"] or 0
    sftp_skipped = agg["sftp_skipped"] or 0
    avg_duration = agg["avg_duration"]
    total_rows   = agg["total_rows"]   or 0
    avg_rows     = agg["avg_rows"]

    total_conversations = agg["total_conversations"] or 0
    total_ai_tokens     = agg["total_ai_tokens"]     or 0
    total_ai_cost       = agg["total_ai_cost"]       or 0

    total_wide_events   = agg["total_wide_events"]   or 0
    total_feature_flags = agg["total_feature_flags"] or 0
    enabled_flags       = agg["enabled_flags"]       or 0

    step_counts = db.execute(text("""
        SELECT failed_step, COUNT(*) AS cnt
        FROM run_logs
        WHERE status = 'error' AND failed_step != '' AND failed_step IS NOT NULL
        GROUP BY failed_step
    """)).fetchall()

    runs_per_day = db.execute(text("""
        SELECT DATE(started_at) AS day, COUNT(*) AS count,
               SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS success,
               SUM(CASE WHEN status='error'   THEN 1 ELSE 0 END) AS errors
        FROM run_logs
        WHERE started_at >= NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day
    """)).fetchall()

    recent_runs = db.execute(text("""
        SELECT r.id, r.status, r.instance_id, r.report_id, r.ps_process_name,
               r.sftp_skipped, r.failed_step, r.row_count, r.duration_ms, r.started_at,
               u.email AS user_email, r.config_name
        FROM run_logs r
        LEFT JOIN users u ON u.id = r.user_id
        ORDER BY r.started_at DESC
        LIMIT 10
    """)).fetchall()

    log.debug("admin stats  users=%d  runs=%d  requested_by=%s", total_users, total_runs, user.id[:8])

    return {
        "total_users":          total_users,
        "total_runs":           total_runs,
        "success_runs":         success_runs,
        "error_runs":           error_runs,
        "running_runs":         running_runs,
        "sftp_skipped":         sftp_skipped,
        "success_rate":         round(success_runs / total_runs * 100, 1) if total_runs else 0,
        "avg_duration_ms":      round(avg_duration) if avg_duration else 0,
        "total_rows_processed": total_rows,
        "avg_rows_per_run":     round(avg_rows) if avg_rows else 0,
        "failed_by_step":       {row.failed_step: row.cnt for row in step_counts},
        # ── AI ────────────────────────────────────────────────────────────────
        "total_conversations":  total_conversations,
        "total_ai_tokens":      int(total_ai_tokens),
        "total_ai_cost_usd":    float(total_ai_cost),
        # ── Observability ─────────────────────────────────────────────────────
        "total_wide_events":    int(total_wide_events),
        "total_feature_flags":  int(total_feature_flags),
        "enabled_feature_flags": int(enabled_flags),
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
                "failed_step":     r.failed_step or "",
                "row_count":       r.row_count,
                "duration_ms":     r.duration_ms,
                "started_at":      str(r.started_at),
                "user_email":      r.user_email or "",
                "config_name":     r.config_name or "",
            }
            for r in recent_runs
        ],
    }
