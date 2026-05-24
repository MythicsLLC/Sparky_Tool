from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User
from logger import get_logger

log = get_logger("users")

router = APIRouter(prefix="/api/v2/users", tags=["users"])


class PatchMe(BaseModel):
    onboarded: bool | None = None
    first_name: str | None = None
    last_name: str | None = None


@router.get("/me")
def get_me(user: User = Depends(get_current_user)):
    log.debug("GET /me  user=%s  email=%s", user.id[:8], user.email)
    return {
        "id":           user.id,
        "email":        user.email,
        "first_name":   user.first_name,
        "last_name":    user.last_name,
        "role":         user.role,
        "onboarded":    user.onboarded,
        "created_at":   user.created_at,
        "last_seen_at": user.last_seen_at,
    }


@router.patch("/me")
def patch_me(
    body: PatchMe,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    changes = {}
    if body.onboarded is not None:
        user.onboarded = body.onboarded
        changes["onboarded"] = body.onboarded
    if body.first_name is not None:
        user.first_name = body.first_name
        changes["first_name"] = body.first_name
    if body.last_name is not None:
        user.last_name = body.last_name
        changes["last_name"] = body.last_name
    db.commit()
    log.info("PATCH /me  user=%s  changes=%s", user.id[:8], changes)
    return {"status": "updated"}
