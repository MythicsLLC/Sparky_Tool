import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user, require_admin
from database import get_db
from models import User, FeatureFlag
from logger import get_logger

log = get_logger("feature_flags")

router = APIRouter(tags=["feature_flags"])

# In-process cache for active flags — avoids a DB round-trip on every request.
# TTL is intentionally short (60 s) so flag changes propagate quickly.
_FLAG_CACHE: dict | None = None
_FLAG_CACHE_TS: float = 0.0
_FLAG_CACHE_TTL: float = 60.0


def _invalidate_flag_cache() -> None:
    global _FLAG_CACHE, _FLAG_CACHE_TS
    _FLAG_CACHE = None
    _FLAG_CACHE_TS = 0.0


def _serialize(f: FeatureFlag) -> dict:
    return {
        "id":          f.id,
        "key":         f.key,
        "name":        f.name or f.key,
        "description": f.description,
        "enabled":     f.enabled,
        "status":      f.status,
        "created_at":  f.created_at,
        "updated_at":  f.updated_at,
    }


# ── Public: any authenticated user can read flags ────────────────────────────

@router.get("/api/v2/feature-flags")
def list_active_flags(
    user: User = Depends(get_current_user),
    db:   Session = Depends(get_db),
):
    """Return all active flags as a {key: enabled} map."""
    global _FLAG_CACHE, _FLAG_CACHE_TS
    now = time.monotonic()
    if _FLAG_CACHE is not None and (now - _FLAG_CACHE_TS) < _FLAG_CACHE_TTL:
        return _FLAG_CACHE

    flags = (
        db.query(FeatureFlag)
        .filter(FeatureFlag.status == "active")
        .all()
    )
    result = {f.key: f.enabled for f in flags}
    _FLAG_CACHE = result
    _FLAG_CACHE_TS = now
    return result


# ── Admin CRUD ────────────────────────────────────────────────────────────────

class FlagCreatePayload(BaseModel):
    key:         str
    name:        str = ""
    description: str = ""
    enabled:     bool = False


class FlagUpdatePayload(BaseModel):
    name:        str | None = None
    description: str | None = None
    enabled:     bool | None = None
    status:      str | None = None


@router.get("/api/v2/admin/feature-flags")
def admin_list_flags(
    admin: User = Depends(require_admin),
    db:    Session = Depends(get_db),
):
    flags = db.query(FeatureFlag).order_by(FeatureFlag.key.asc()).all()
    return {"items": [_serialize(f) for f in flags]}


@router.post("/api/v2/admin/feature-flags", status_code=201)
def admin_create_flag(
    body:  FlagCreatePayload,
    admin: User = Depends(require_admin),
    db:    Session = Depends(get_db),
):
    key = body.key.strip().lower().replace(" ", "_")
    if not key:
        raise HTTPException(400, "key is required")
    if db.query(FeatureFlag).filter(FeatureFlag.key == key).first():
        raise HTTPException(409, f"Flag '{key}' already exists")

    now = datetime.now(timezone.utc)
    f = FeatureFlag(
        key=key,
        name=body.name.strip() or key,
        description=body.description.strip() or None,
        enabled=body.enabled,
        status="active",
        created_by=admin.id,
        created_at=now,
        updated_at=now,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    _invalidate_flag_cache()
    log.info("feature_flag created  key=%s  by=%s", key, admin.id[:8])
    return _serialize(f)


@router.patch("/api/v2/admin/feature-flags/{flag_id}")
def admin_update_flag(
    flag_id: int,
    body:    FlagUpdatePayload,
    admin:   User = Depends(require_admin),
    db:      Session = Depends(get_db),
):
    f = db.query(FeatureFlag).filter(FeatureFlag.id == flag_id).first()
    if not f:
        raise HTTPException(404, "Flag not found")

    if body.name        is not None: f.name        = body.name.strip()
    if body.description is not None: f.description = body.description.strip() or None
    if body.enabled     is not None: f.enabled     = body.enabled
    if body.status      is not None:
        if body.status not in ("active", "archived"):
            raise HTTPException(400, "status must be 'active' or 'archived'")
        f.status = body.status

    f.updated_at = datetime.now(timezone.utc)
    db.commit()
    _invalidate_flag_cache()
    log.info("feature_flag updated  key=%s  by=%s", f.key, admin.id[:8])
    return _serialize(f)


@router.post("/api/v2/admin/feature-flags/{flag_id}/toggle")
def admin_toggle_flag(
    flag_id: int,
    admin:   User = Depends(require_admin),
    db:      Session = Depends(get_db),
):
    f = db.query(FeatureFlag).filter(FeatureFlag.id == flag_id).first()
    if not f:
        raise HTTPException(404, "Flag not found")
    f.enabled    = not f.enabled
    f.updated_at = datetime.now(timezone.utc)
    db.commit()
    _invalidate_flag_cache()
    log.info("feature_flag toggled  key=%s  enabled=%s  by=%s", f.key, f.enabled, admin.id[:8])
    return _serialize(f)


@router.delete("/api/v2/admin/feature-flags/{flag_id}", status_code=204)
def admin_delete_flag(
    flag_id: int,
    admin:   User = Depends(require_admin),
    db:      Session = Depends(get_db),
):
    f = db.query(FeatureFlag).filter(FeatureFlag.id == flag_id).first()
    if not f:
        raise HTTPException(404, "Flag not found")
    key = f.key
    db.delete(f)
    db.commit()
    _invalidate_flag_cache()
    log.info("feature_flag deleted  key=%s  by=%s", key, admin.id[:8])
