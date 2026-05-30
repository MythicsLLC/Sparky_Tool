from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user, require_admin
from database import get_db
from models import User, Engine
from logger import get_logger

log = get_logger("engines")

router = APIRouter(prefix="/api/v2", tags=["engines"])


class EnginePayload(BaseModel):
    name: str
    process_name: str          # actual PeopleSoft process name e.g. SM_DISCOVERY
    description: str = ""
    is_active: bool = True
    sort_order: int = 0


def _serialize(e: Engine) -> dict:
    return {
        "id":           e.id,
        "name":         e.name,
        "process_name": e.process_name,
        "description":  e.description or "",
        "is_active":    e.is_active,
        "sort_order":   e.sort_order,
        "created_at":   e.created_at,
        "updated_at":   e.updated_at,
    }


# ── Public: list active engines (any authenticated user) ─────────────────────

@router.get("/engines")
def list_engines(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    engines = (
        db.query(Engine)
        .filter(Engine.is_active == True)  # noqa: E712
        .order_by(Engine.sort_order, Engine.name)
        .all()
    )
    return [_serialize(e) for e in engines]


# ── Admin: full CRUD ──────────────────────────────────────────────────────────

@router.get("/admin/engines")
def admin_list_engines(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    engines = db.query(Engine).order_by(Engine.sort_order, Engine.name).all()
    return {"items": [_serialize(e) for e in engines], "total": len(engines)}


@router.post("/admin/engines")
def admin_create_engine(
    body: EnginePayload,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    engine = Engine(
        name=body.name.strip(),
        process_name=body.process_name.strip(),
        description=body.description.strip(),
        is_active=body.is_active,
        sort_order=body.sort_order,
        created_by=user.id,
    )
    db.add(engine)
    db.commit()
    db.refresh(engine)
    log.info("Engine created  id=%d  name=%r  process=%r  by=%s",
             engine.id, engine.name, engine.process_name, user.id[:8])
    return _serialize(engine)


@router.put("/admin/engines/{engine_id}")
def admin_update_engine(
    engine_id: int,
    body: EnginePayload,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    engine = db.query(Engine).filter(Engine.id == engine_id).first()
    if not engine:
        raise HTTPException(404, "Engine not found")
    engine.name         = body.name.strip()
    engine.process_name = body.process_name.strip()
    engine.description  = body.description.strip()
    engine.is_active    = body.is_active
    engine.sort_order   = body.sort_order
    engine.updated_at   = datetime.now(timezone.utc)
    db.commit()
    db.refresh(engine)
    log.info("Engine updated  id=%d  by=%s", engine_id, user.id[:8])
    return _serialize(engine)


@router.delete("/admin/engines/{engine_id}")
def admin_delete_engine(
    engine_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    engine = db.query(Engine).filter(Engine.id == engine_id).first()
    if not engine:
        raise HTTPException(404, "Engine not found")
    db.delete(engine)
    db.commit()
    log.info("Engine deleted  id=%d  by=%s", engine_id, user.id[:8])
    return {"deleted": True}
