from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Any

from auth import get_current_user
from database import get_db
from models import User, UserConfig, DataQualityRule, DataQualityResult
from logger import get_logger

log = get_logger("data_quality")
router = APIRouter(prefix="/api/v2/data-quality", tags=["data-quality"])

VALID_RULE_TYPES = {
    "row_count_gt", "row_count_lt", "row_count_between",
    "column_not_null", "value_must_exist", "column_unique",
}


class RulePayload(BaseModel):
    config_id:  int
    name:       str
    rule_type:  str
    parameters: dict[str, Any] = {}
    is_active:  bool = True


def _serialize_rule(r: DataQualityRule) -> dict:
    return {
        "id":         r.id,
        "config_id":  r.config_id,
        "name":       r.name,
        "rule_type":  r.rule_type,
        "parameters": r.parameters or {},
        "is_active":  r.is_active,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _serialize_result(r: DataQualityResult) -> dict:
    return {
        "id":           r.id,
        "run_log_id":   r.run_log_id,
        "rule_id":      r.rule_id,
        "rule_name":    r.rule_name,
        "rule_type":    r.rule_type,
        "passed":       r.passed,
        "actual_value": r.actual_value,
        "message":      r.message,
        "checked_at":   r.checked_at.isoformat() if r.checked_at else None,
    }


# ── Rules CRUD ────────────────────────────────────────────────────────────────

@router.get("/rules")
def list_rules(
    config_id: int | None = Query(None),
    user:      User       = Depends(get_current_user),
    db:        Session    = Depends(get_db),
):
    q = db.query(DataQualityRule).filter(DataQualityRule.user_id == user.id)
    if config_id:
        q = q.filter(DataQualityRule.config_id == config_id)
    return [_serialize_rule(r) for r in q.all()]


@router.post("/rules", status_code=201)
def create_rule(
    body: RulePayload,
    user: User    = Depends(get_current_user),
    db:   Session = Depends(get_db),
):
    if body.rule_type not in VALID_RULE_TYPES:
        raise HTTPException(400, f"Unknown rule_type '{body.rule_type}'")
    if not db.query(UserConfig).filter(
        UserConfig.id == body.config_id, UserConfig.user_id == user.id
    ).first():
        raise HTTPException(404, "Configuration not found")

    rule = DataQualityRule(
        user_id    = user.id,
        config_id  = body.config_id,
        name       = body.name,
        rule_type  = body.rule_type,
        parameters = body.parameters,
        is_active  = body.is_active,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    log.info("Created DQ rule %d  config=%d  type=%s  user=%s",
             rule.id, rule.config_id, rule.rule_type, user.id[:8])
    return _serialize_rule(rule)


@router.patch("/rules/{rule_id}")
def update_rule(
    rule_id: int,
    body:    RulePayload,
    user:    User    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    rule = db.query(DataQualityRule).filter(
        DataQualityRule.id == rule_id, DataQualityRule.user_id == user.id
    ).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    if body.rule_type not in VALID_RULE_TYPES:
        raise HTTPException(400, f"Unknown rule_type '{body.rule_type}'")

    rule.name       = body.name
    rule.rule_type  = body.rule_type
    rule.parameters = body.parameters
    rule.is_active  = body.is_active
    rule.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _serialize_rule(rule)


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(
    rule_id: int,
    user:    User    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    rule = db.query(DataQualityRule).filter(
        DataQualityRule.id == rule_id, DataQualityRule.user_id == user.id
    ).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()


# ── Results ───────────────────────────────────────────────────────────────────

@router.get("/results")
def list_results(
    run_log_id: int | None = Query(None),
    config_id:  int | None = Query(None),
    limit:      int        = Query(100, le=500),
    user:       User       = Depends(get_current_user),
    db:         Session    = Depends(get_db),
):
    q = (
        db.query(DataQualityResult)
        .join(DataQualityRule, DataQualityResult.rule_id == DataQualityRule.id)
        .filter(DataQualityRule.user_id == user.id)
    )
    if run_log_id:
        q = q.filter(DataQualityResult.run_log_id == run_log_id)
    if config_id:
        q = q.filter(DataQualityRule.config_id == config_id)
    rows = q.order_by(DataQualityResult.checked_at.desc()).limit(limit).all()
    return [_serialize_result(r) for r in rows]
