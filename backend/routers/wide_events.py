import asyncio
import json
import uuid
import random
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from auth import require_admin, get_current_user
from database import get_db, _SessionLocal
from models import User, WideEvent, WideEventView
from logger import get_logger

log = get_logger("wide_events")

router = APIRouter(prefix="/api/v2/admin/events", tags=["wide_events"])

_ENVIRONMENT = os.environ.get("RAILWAY_ENVIRONMENT_NAME", "production")

# ── Tier / sampling ──────────────────────────────────────────────────────────

_EVENT_TIERS: dict[str, int] = {
    # T1 — always write
    "run.completed":         1,
    "run.failed":            1,
    "config.deleted":        1,
    "user.deleted":          1,
    "user.invited":          1,
    "ai_model.deleted":      1,
    "feature_flag.deleted":  1,
    "conversation.deleted":  1,
    # T2 — 50 % write
    "run.started":           2,
    "config.created":        2,
    "config.updated":        2,
    "user.role_changed":     2,
    "user.updated":          2,
    "ai_model.created":      2,
    "ai_model.updated":      2,
    "feature_flag.created":  2,
    "feature_flag.toggled":  2,
    "feature_flag.updated":  2,
    "conversation.created":  2,
    "ai_analysis.completed": 2,
    # T3 — 10 % write
    "preferences.updated":   3,
    "corehr.file.viewed":    3,
    # T4 — never write to DB
    "users.me.handled":      4,
    "feature_flags.handled": 4,
    "admin.stats.handled":   4,
    "health.checked":        4,
}

_TIER_SAMPLE_RATES: dict[int, float] = {1: 1.0, 2: 0.5, 3: 0.1, 4: 0.0}


def get_event_tier(event: str) -> int:
    return _EVENT_TIERS.get(event, 4)


def _should_write(tier: int) -> bool:
    rate = _TIER_SAMPLE_RATES.get(tier, 0.0)
    return rate > 0 and random.random() < rate


# ── Public write helper (called from other routers / middleware) ──────────────

def write_wide_event(
    db: Session,
    *,
    event: str,
    status: str = "success",
    message: str | None = None,
    http_method: str = "",
    http_status: int = 200,
    endpoint: str = "",
    user_id: str | None = None,
    user_name: str | None = None,
    duration_ms: int = 0,
    payload: dict | None = None,
    request_id: str | None = None,
) -> None:
    tier = get_event_tier(event)
    if not _should_write(tier):
        return

    rid = request_id or str(uuid.uuid4())
    row = WideEvent(
        event_uuid=str(uuid.uuid4()),
        event=event,
        status=status,
        tier=tier,
        message=message,
        total_duration_ms=duration_ms,
        http_method=http_method,
        http_status=http_status,
        endpoint=endpoint,
        user_id=user_id,
        user_name=user_name,
        request_id=rid,
        process_id=rid,
        environment=_ENVIRONMENT,
        payload=payload or {},
    )
    try:
        db.add(row)
        db.commit()
    except Exception as exc:
        db.rollback()
        log.warning("wide_event write failed (non-fatal): %s", exc)


# ── Serializer ───────────────────────────────────────────────────────────────

def _serialize_event(row) -> dict:
    return {
        "id":               row.id,
        "event_uuid":       row.event_uuid,
        "event":            row.event,
        "status":           row.status,
        "tier":             row.tier,
        "message":          row.message,
        "total_duration_ms": row.total_duration_ms,
        "http_method":      row.http_method,
        "http_status":      row.http_status,
        "endpoint":         row.endpoint,
        "user_id":          row.user_id,
        "user_name":        row.user_name,
        "request_id":       row.request_id,
        "process_id":       row.process_id,
        "environment":      row.environment,
        "payload":          row.payload or {},
        "created_at":       row.created_at.isoformat() if row.created_at else None,
    }


# ── List events ──────────────────────────────────────────────────────────────

@router.get("")
def list_events(
    limit:        int      = Query(200, le=500),
    offset:       int      = Query(0, ge=0),
    event:        str | None = Query(None),
    status:       str | None = Query(None),
    tier:         int | None = Query(None),
    user_id:      str | None = Query(None),
    http_status:  int | None = Query(None),
    duration_min: int | None = Query(None),
    q:            str | None = Query(None),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(WideEvent)
    if event:        query = query.filter(WideEvent.event == event)
    if status:       query = query.filter(WideEvent.status == status)
    if tier:         query = query.filter(WideEvent.tier == tier)
    if user_id:      query = query.filter(WideEvent.user_id == user_id)
    if http_status:  query = query.filter(WideEvent.http_status == http_status)
    if duration_min: query = query.filter(WideEvent.total_duration_ms >= duration_min)
    if q:
        like = f"%{q}%"
        query = query.filter(
            WideEvent.event.ilike(like) |
            WideEvent.message.ilike(like) |
            WideEvent.endpoint.ilike(like) |
            WideEvent.user_name.ilike(like)
        )

    total = query.count()
    rows  = query.order_by(WideEvent.created_at.desc()).offset(offset).limit(limit).all()

    return {"total": total, "items": [_serialize_event(r) for r in rows]}


# ── SSE stream (polling-based, works with Neon pooler) ───────────────────────
# Each poll cycle opens and closes its own session immediately.
# No DB connection is held open for the stream's lifetime.

_MAX_STREAM_SECONDS = 1800  # hard cap: 30 min per connection


@router.get("/stream")
async def stream_events(
    request: Request,
    event:        str | None = Query(None),
    status:       str | None = Query(None),
    tier:         int | None = Query(None),
    admin: User = Depends(require_admin),
    # No db dependency — sessions are opened/closed per poll cycle
):
    since_id: int = 0

    def _poll() -> list:
        """Run one DB poll in a short-lived session. Called via run_in_executor."""
        if _SessionLocal is None:
            return []
        db = _SessionLocal()
        try:
            clauses = ["id > :since_id"]
            params: dict = {"since_id": since_id}
            if event:  clauses.append("event = :event");   params["event"]  = event
            if status: clauses.append("status = :status"); params["status"] = status
            if tier:   clauses.append("tier = :tier");     params["tier"]   = tier
            where = " AND ".join(clauses)
            return db.execute(
                text(f"SELECT * FROM wide_events WHERE {where} ORDER BY id ASC LIMIT 50"),
                params,
            ).fetchall()
        finally:
            db.close()

    def _seed() -> int:
        """Read the current max id to avoid replaying old events."""
        if _SessionLocal is None:
            return 0
        db = _SessionLocal()
        try:
            return db.execute(text("SELECT COALESCE(MAX(id), 0) FROM wide_events")).scalar() or 0
        finally:
            db.close()

    async def generator():
        nonlocal since_id
        loop = asyncio.get_event_loop()

        since_id = await loop.run_in_executor(None, _seed)
        yield f"event: ready\ndata: {json.dumps({'ok': True})}\n\n"

        heartbeat_tick = 0
        elapsed = 0
        while elapsed < _MAX_STREAM_SECONDS:
            if await request.is_disconnected():
                break

            rows = await loop.run_in_executor(None, _poll)
            for row in rows:
                since_id = max(since_id, row.id)
                data = {
                    "id":                row.id,
                    "event":             row.event,
                    "status":            row.status,
                    "tier":              row.tier,
                    "message":           row.message,
                    "total_duration_ms": row.total_duration_ms,
                    "http_method":       row.http_method,
                    "http_status":       row.http_status,
                    "endpoint":          row.endpoint,
                    "user_id":           row.user_id,
                    "user_name":         row.user_name,
                    "environment":       row.environment,
                    "created_at":        str(row.created_at),
                }
                yield f"event: event\ndata: {json.dumps(data)}\n\n"

            heartbeat_tick += 1
            if heartbeat_tick >= 12:  # every ~24 s
                yield f"event: heartbeat\ndata: {json.dumps({'now': datetime.now(timezone.utc).isoformat()})}\n\n"
                heartbeat_tick = 0

            await asyncio.sleep(2)
            elapsed += 2

        # Tell the client the stream ended so it can reconnect if desired
        yield f"event: close\ndata: {json.dumps({'reason': 'max_duration'})}\n\n"

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache, no-transform",
            "Connection":        "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Wide Event Views (saved filter presets) ──────────────────────────────────

class WideEventViewPayload(BaseModel):
    name:        str
    description: str = ""
    config:      dict = {}


@router.get("/views")
def list_views(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    views = db.query(WideEventView).order_by(WideEventView.name.asc()).all()
    return {"items": [
        {
            "id":          v.id,
            "name":        v.name,
            "description": v.description,
            "config":      v.config,
            "created_at":  v.created_at,
            "updated_at":  v.updated_at,
        }
        for v in views
    ]}


@router.post("/views", status_code=201)
def create_view(
    body:  WideEventViewPayload,
    admin: User = Depends(require_admin),
    db:    Session = Depends(get_db),
):
    if not body.name.strip():
        raise HTTPException(400, "name is required")
    now = datetime.now(timezone.utc)
    v = WideEventView(
        id=str(uuid.uuid4()),
        name=body.name.strip(),
        description=body.description.strip() or None,
        config=body.config,
        created_by=admin.id,
        updated_by=admin.id,
        created_at=now,
        updated_at=now,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return {"id": v.id, "name": v.name, "description": v.description, "config": v.config}


@router.put("/views/{view_id}")
def update_view(
    view_id: str,
    body:  WideEventViewPayload,
    admin: User = Depends(require_admin),
    db:    Session = Depends(get_db),
):
    v = db.query(WideEventView).filter(WideEventView.id == view_id).first()
    if not v:
        raise HTTPException(404, "View not found")
    v.name        = body.name.strip()
    v.description = body.description.strip() or None
    v.config      = body.config
    v.updated_by  = admin.id
    v.updated_at  = datetime.now(timezone.utc)
    db.commit()
    return {"id": v.id, "name": v.name, "description": v.description, "config": v.config}


@router.delete("/views/{view_id}", status_code=204)
def delete_view(
    view_id: str,
    admin: User = Depends(require_admin),
    db:    Session = Depends(get_db),
):
    v = db.query(WideEventView).filter(WideEventView.id == view_id).first()
    if not v:
        raise HTTPException(404, "View not found")
    db.delete(v)
    db.commit()
