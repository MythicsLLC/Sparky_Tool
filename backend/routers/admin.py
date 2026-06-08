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
    total_users  = db.query(func.count(User.id)).scalar()
    total_runs   = db.query(func.count(RunLog.id)).scalar()
    success_runs = db.query(func.count(RunLog.id)).filter(RunLog.status == "success").scalar()
    error_runs   = db.query(func.count(RunLog.id)).filter(RunLog.status == "error").scalar()
    running_runs = db.query(func.count(RunLog.id)).filter(RunLog.status == "running").scalar()
    sftp_skipped = db.query(func.count(RunLog.id)).filter(RunLog.sftp_skipped == True).scalar()  # noqa: E712
    avg_duration = db.query(func.avg(RunLog.duration_ms)).filter(
        RunLog.status == "success", RunLog.duration_ms.isnot(None),
    ).scalar()
    total_rows   = db.query(func.sum(RunLog.row_count)).filter(
        RunLog.status == "success", RunLog.row_count.isnot(None),
    ).scalar() or 0
    avg_rows     = db.query(func.avg(RunLog.row_count)).filter(
        RunLog.status == "success", RunLog.row_count.isnot(None), RunLog.row_count > 0,
    ).scalar()

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

    # ── AI token / cost stats ─────────────────────────────────────────────────
    total_conversations = db.query(func.count(AiConversation.id)).scalar() or 0
    total_ai_tokens     = db.query(func.sum(AiConversation.total_tokens)).scalar() or 0
    total_ai_cost       = db.query(func.sum(AiConversation.estimated_cost_usd)).scalar() or 0

    # ── Observability ────────────────────────────────────────────────────────
    total_wide_events   = db.query(func.count(WideEvent.id)).scalar() or 0
    total_feature_flags = db.query(func.count(FeatureFlag.id)).filter(FeatureFlag.status == "active").scalar() or 0
    enabled_flags       = db.query(func.count(FeatureFlag.id)).filter(
        FeatureFlag.status == "active", FeatureFlag.enabled == True  # noqa: E712
    ).scalar() or 0

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


# ── users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
def list_users(
    limit:  int = Query(200, le=500),
    offset: int = Query(0, ge=0),
    user:   User = Depends(require_admin),
    db:     Session = Depends(get_db),
):
    total = db.query(func.count(User.id)).scalar()
    users = db.query(User).order_by(User.created_at.desc()).offset(offset).limit(limit).all()
    run_counts = dict(db.query(RunLog.user_id, func.count(RunLog.id)).group_by(RunLog.user_id).all())
    log.debug("admin list_users  total=%d  requested_by=%s", total, user.id[:8])
    return {"total": total, "items": [_serialize_user(u, run_counts.get(u.id, 0)) for u in users]}


class RolePayload(BaseModel):
    role: str


class UpdateUserPayload(BaseModel):
    first_name: str | None = None
    last_name:  str | None = None
    onboarded:  bool | None = None


class InviteUserPayload(BaseModel):
    email:      str
    first_name: str = ""
    last_name:  str = ""
    role:       str = "user"


# ── AI model payloads ─────────────────────────────────────────────────────────

VALID_PROVIDERS = {"gemini", "openai", "anthropic", "grok", "generic"}


class AiModelCreatePayload(BaseModel):
    name:       str
    provider:   str
    model_id:   str
    api_key:    str = ""
    base_url:   str = ""
    is_default: bool = False
    is_active:  bool = True


class AiModelUpdatePayload(BaseModel):
    name:       str | None = None
    provider:   str | None = None
    model_id:   str | None = None
    api_key:    str | None = None   # if None, key is unchanged
    base_url:   str | None = None
    is_default: bool | None = None
    is_active:  bool | None = None


@router.post("/users/invite")
def invite_user(
    body:  InviteUserPayload,
    admin: User = Depends(require_admin),
    db:    Session = Depends(get_db),
):
    """Create a user in Clerk and pre-register them in our DB with the chosen role."""
    if body.role not in ("user", "admin"):
        raise HTTPException(400, "Role must be 'user' or 'admin'")

    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "A valid email address is required")

    secret = _clerk_secret()

    # ── Create user in Clerk ─────────────────────────────────────────
    try:
        resp = httpx.post(
            "https://api.clerk.com/v1/users",
            headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
            json={
                "email_address":          [email],
                "first_name":             body.first_name.strip(),
                "last_name":              body.last_name.strip(),
                "skip_password_checks":   True,
                "skip_password_requirement": True,
            },
            timeout=15,
        )
    except httpx.TimeoutException:
        raise HTTPException(504, "Clerk API timed out — please retry")
    except Exception as exc:
        raise HTTPException(502, f"Could not reach Clerk API: {exc}")

    if resp.status_code == 422:
        errors = resp.json().get("errors", [])
        msg = (errors[0].get("long_message") or errors[0].get("message", "Validation failed")) if errors else "Validation failed"
        raise HTTPException(422, msg)
    if not resp.is_success:
        raise HTTPException(502, f"Clerk returned HTTP {resp.status_code}: {resp.text[:200]}")

    clerk_user = resp.json()
    clerk_id   = clerk_user["id"]
    now        = datetime.now(timezone.utc)

    # ── Upsert in our DB with chosen role ────────────────────────────
    existing = db.query(User).filter(User.id == clerk_id).first()
    if existing:
        existing.role = body.role
        db.add(AuditEvent(user_id=admin.id, event_type="user_role_preset",
                          detail={"target_user": clerk_id, "email": email, "role": body.role}))
        db.commit()
        return_user = existing
        run_count   = db.query(func.count(RunLog.id)).filter(RunLog.user_id == clerk_id).scalar()
    else:
        new_user = User(
            id=clerk_id, email=email,
            first_name=body.first_name.strip(), last_name=body.last_name.strip(),
            role=body.role, onboarded=False, created_at=now, last_seen_at=now,
        )
        db.add(new_user)
        db.add(AuditEvent(user_id=admin.id, event_type="user_invited",
                          detail={"target_user": clerk_id, "email": email, "role": body.role}))
        db.commit()
        return_user = new_user
        run_count   = 0

    log.info("User invited via Clerk  id=%s  email=%s  role=%s  by=%s",
             clerk_id[:8], email, body.role, admin.id[:8])
    return _serialize_user(return_user, run_count)


@router.put("/users/{target_id}/role")
def set_user_role(
    target_id: str,
    body:  RolePayload,
    admin: User = Depends(require_admin),
    db:    Session = Depends(get_db),
):
    if body.role not in ("user", "admin"):
        raise HTTPException(400, "Role must be 'user' or 'admin'")
    target = db.query(User).filter(User.id == target_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    old_role = target.role
    target.role = body.role
    db.add(AuditEvent(user_id=admin.id, event_type="role_changed",
                      detail={"target_user": target_id, "old_role": old_role, "new_role": body.role}))
    db.commit()
    log.info("Role changed  target=%s  %s → %s  by=%s", target_id[:8], old_role, body.role, admin.id[:8])
    return {"status": "updated", "role": body.role}


@router.patch("/users/{target_id}")
def update_user(
    target_id: str,
    body:  UpdateUserPayload,
    admin: User = Depends(require_admin),
    db:    Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == target_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    changes: dict = {}
    if body.first_name is not None: target.first_name = body.first_name; changes["first_name"] = body.first_name  # noqa: E702
    if body.last_name  is not None: target.last_name  = body.last_name;  changes["last_name"]  = body.last_name   # noqa: E702
    if body.onboarded  is not None: target.onboarded  = body.onboarded;  changes["onboarded"]  = body.onboarded   # noqa: E702
    if changes:
        db.add(AuditEvent(user_id=admin.id, event_type="user_updated",
                          detail={"target_user": target_id, "changes": changes}))
        db.commit()
    log.info("User updated  target=%s  changes=%s  by=%s", target_id[:8], changes, admin.id[:8])
    return {"status": "updated"}


@router.delete("/users/{target_id}")
def delete_user(
    target_id: str,
    also_clerk: bool = Query(False),
    admin: User = Depends(require_admin),
    db:    Session = Depends(get_db),
):
    if target_id == admin.id:
        raise HTTPException(400, "Cannot delete your own account")
    target = db.query(User).filter(User.id == target_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    target_email = target.email

    # Optionally delete from Clerk too
    if also_clerk:
        try:
            secret = _clerk_secret()
            resp = httpx.delete(f"https://api.clerk.com/v1/users/{target_id}",
                                headers={"Authorization": f"Bearer {secret}"}, timeout=10)
            if not resp.is_success and resp.status_code != 404:
                log.warning("Clerk delete returned %d for user %s", resp.status_code, target_id[:8])
        except Exception as exc:
            log.warning("Clerk delete failed (non-fatal): %s", exc)

    db.delete(target)
    db.add(AuditEvent(user_id=admin.id, event_type="user_deleted",
                      detail={"target_user": target_id, "target_email": target_email,
                              "also_clerk": also_clerk}))
    db.commit()
    log.info("User deleted  target=%s (%s)  also_clerk=%s  by=%s",
             target_id[:8], target_email, also_clerk, admin.id[:8])
    return {"status": "deleted"}


# ── runs ──────────────────────────────────────────────────────────────────────

@router.get("/runs")
def list_all_runs(
    limit:   int          = Query(200, le=500),
    offset:  int          = Query(0, ge=0),
    status:  str | None   = Query(None),
    user_id: str | None   = Query(None),
    admin:   User         = Depends(require_admin),
    db:      Session      = Depends(get_db),
):
    q = db.query(RunLog)
    if status:  q = q.filter(RunLog.status == status)
    if user_id: q = q.filter(RunLog.user_id == user_id)
    total = q.count()
    logs  = q.order_by(RunLog.started_at.desc()).offset(offset).limit(limit).all()
    # Fetch only the users that appear on this page — avoids loading the full user table.
    page_user_ids = {l.user_id for l in logs}
    user_map = (
        {u.id: u.email for u in db.query(User.id, User.email).filter(User.id.in_(page_user_ids)).all()}
        if page_user_ids else {}
    )
    log.debug("admin list_all_runs  total=%d  returned=%d", total, len(logs))
    return {
        "total": total,
        "items": [
            {
                "id":              l.id,
                "user_id":         l.user_id,
                "user_email":      user_map.get(l.user_id, ""),
                "config_name":     l.config_name or "",
                "ps_process_name": l.ps_process_name or "",
                "status":          l.status,
                "instance_id":     l.instance_id or "",
                "report_id":       l.report_id or "",
                "sftp_skipped":    l.sftp_skipped or False,
                "skip_reason":     l.skip_reason or "",
                "failed_step":     l.failed_step or "",
                "row_count":       l.row_count,
                "error_detail":    l.error_detail,
                "duration_ms":     l.duration_ms,
                "started_at":      l.started_at,
                "completed_at":    l.completed_at,
            }
            for l in logs
        ],
    }


# ── audit log ─────────────────────────────────────────────────────────────────

@router.get("/logs")
def get_audit_logs(
    limit:      int         = Query(200, le=500),
    offset:     int         = Query(0, ge=0),
    event_type: str | None  = Query(None),
    admin:      User        = Depends(require_admin),
    db:         Session     = Depends(get_db),
):
    q = db.query(AuditEvent)
    if event_type:
        q = q.filter(AuditEvent.event_type == event_type)
    total  = q.count()
    events = q.order_by(AuditEvent.created_at.desc()).offset(offset).limit(limit).all()
    # Fetch only the users that appear on this page — avoids loading the full user table.
    page_user_ids = {e.user_id for e in events if e.user_id}
    user_map = (
        {u.id: f"{u.first_name} {u.last_name}".strip() or u.email
         for u in db.query(User.id, User.first_name, User.last_name, User.email)
                    .filter(User.id.in_(page_user_ids)).all()}
        if page_user_ids else {}
    )
    log.debug("admin audit_logs  total=%d  filter=%r", total, event_type)
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


# ── AI Models ─────────────────────────────────────────────────────────────────

@router.get("/ai-models")
def list_ai_models(
    admin: User = Depends(require_admin),
    db:    Session = Depends(get_db),
):
    models = db.query(AiModel).order_by(AiModel.created_at.asc()).all()
    return {"items": [_serialize_model(m) for m in models]}


@router.post("/ai-models", status_code=201)
def create_ai_model(
    body:  AiModelCreatePayload,
    admin: User = Depends(require_admin),
    db:    Session = Depends(get_db),
):
    if body.provider not in VALID_PROVIDERS:
        raise HTTPException(400, f"provider must be one of {sorted(VALID_PROVIDERS)}")
    if not body.name.strip():
        raise HTTPException(400, "name is required")
    if not body.model_id.strip():
        raise HTTPException(400, "model_id is required")

    now = datetime.now(timezone.utc)

    if body.is_default:
        db.query(AiModel).update({"is_default": False})

    m = AiModel(
        name=body.name.strip(),
        provider=body.provider,
        model_id=body.model_id.strip(),
        api_key_enc=encrypt(body.api_key) if body.api_key else "",
        base_url=body.base_url.strip(),
        is_default=body.is_default,
        is_active=body.is_active,
        created_at=now,
        updated_at=now,
    )
    db.add(m)
    db.add(AuditEvent(user_id=admin.id, event_type="ai_model_created",
                      detail={"name": m.name, "provider": m.provider}))
    db.commit()
    db.refresh(m)
    log.info("AI model created  id=%d  name=%s  by=%s", m.id, m.name, admin.id[:8])
    return _serialize_model(m)


@router.put("/ai-models/{model_id_pk}")
def update_ai_model(
    model_id_pk: int,
    body:  AiModelUpdatePayload,
    admin: User = Depends(require_admin),
    db:    Session = Depends(get_db),
):
    m = db.query(AiModel).filter(AiModel.id == model_id_pk).first()
    if not m:
        raise HTTPException(404, "AI model not found")

    if body.provider is not None and body.provider not in VALID_PROVIDERS:
        raise HTTPException(400, f"provider must be one of {sorted(VALID_PROVIDERS)}")

    if body.name       is not None: m.name       = body.name.strip()
    if body.provider   is not None: m.provider   = body.provider
    if body.model_id   is not None: m.model_id   = body.model_id.strip()
    if body.base_url   is not None: m.base_url   = body.base_url.strip()
    if body.is_active  is not None: m.is_active  = body.is_active
    if body.api_key    is not None: m.api_key_enc = encrypt(body.api_key) if body.api_key else ""

    if body.is_default is True:
        db.query(AiModel).filter(AiModel.id != model_id_pk).update({"is_default": False})
        m.is_default = True
    elif body.is_default is False:
        m.is_default = False

    m.updated_at = datetime.now(timezone.utc)
    db.add(AuditEvent(user_id=admin.id, event_type="ai_model_updated",
                      detail={"id": model_id_pk, "name": m.name}))
    db.commit()
    log.info("AI model updated  id=%d  by=%s", model_id_pk, admin.id[:8])
    return _serialize_model(m)


@router.delete("/ai-models/{model_id_pk}", status_code=204)
def delete_ai_model(
    model_id_pk: int,
    admin: User = Depends(require_admin),
    db:    Session = Depends(get_db),
):
    m = db.query(AiModel).filter(AiModel.id == model_id_pk).first()
    if not m:
        raise HTTPException(404, "AI model not found")
    name = m.name
    db.delete(m)
    db.add(AuditEvent(user_id=admin.id, event_type="ai_model_deleted",
                      detail={"id": model_id_pk, "name": name}))
    db.commit()
    log.info("AI model deleted  id=%d  name=%s  by=%s", model_id_pk, name, admin.id[:8])


@router.post("/ai-models/{model_id_pk}/set-default")
def set_default_ai_model(
    model_id_pk: int,
    admin: User = Depends(require_admin),
    db:    Session = Depends(get_db),
):
    m = db.query(AiModel).filter(AiModel.id == model_id_pk).first()
    if not m:
        raise HTTPException(404, "AI model not found")
    db.query(AiModel).update({"is_default": False})
    m.is_default = True
    m.updated_at = datetime.now(timezone.utc)
    db.add(AuditEvent(user_id=admin.id, event_type="ai_model_set_default",
                      detail={"id": model_id_pk, "name": m.name}))
    db.commit()
    log.info("Default AI model set  id=%d  by=%s", model_id_pk, admin.id[:8])
    return _serialize_model(m)
