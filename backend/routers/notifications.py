from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, NotificationSetting
from logger import get_logger

log = get_logger("notifications")
router = APIRouter(prefix="/api/v2/notifications", tags=["notifications"])


class NotificationPayload(BaseModel):
    notify_on_success: bool = True
    notify_on_failure: bool = True
    email_enabled:     bool = False
    email_address:     str  = ""
    slack_webhook_url: str  = ""
    teams_webhook_url: str  = ""


def _serialize(ns: NotificationSetting) -> dict:
    return {
        "notify_on_success": ns.notify_on_success,
        "notify_on_failure": ns.notify_on_failure,
        "email_enabled":     ns.email_enabled,
        "email_address":     ns.email_address or "",
        "slack_webhook_url": ns.slack_webhook_url or "",
        "teams_webhook_url": ns.teams_webhook_url or "",
    }


@router.get("/settings")
def get_notification_settings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ns = db.query(NotificationSetting).filter(NotificationSetting.user_id == user.id).first()
    if not ns:
        return {
            "notify_on_success": True, "notify_on_failure": True,
            "email_enabled": False, "email_address": "",
            "slack_webhook_url": "", "teams_webhook_url": "",
        }
    return _serialize(ns)


@router.put("/settings")
def update_notification_settings(
    body: NotificationPayload,
    user: User = Depends(get_current_user),
    db:   Session = Depends(get_db),
):
    ns = db.query(NotificationSetting).filter(NotificationSetting.user_id == user.id).first()
    if not ns:
        ns = NotificationSetting(user_id=user.id)
        db.add(ns)

    ns.notify_on_success = body.notify_on_success
    ns.notify_on_failure = body.notify_on_failure
    ns.email_enabled     = body.email_enabled
    ns.email_address     = body.email_address
    ns.slack_webhook_url = body.slack_webhook_url
    ns.teams_webhook_url = body.teams_webhook_url
    ns.updated_at        = datetime.now(timezone.utc)
    db.commit()
    log.info("Notification settings updated  user=%s", user.id[:8])
    return _serialize(ns)
