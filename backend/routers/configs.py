from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, UserConfig, AuditEvent
from encrypt import encrypt, decrypt
from logger import get_logger

log = get_logger("configs")

router = APIRouter(prefix="/api/v2/configs", tags=["configs"])


class ConfigPayload(BaseModel):
    name: str = "Default Configuration"
    ps_base_url: str = ""
    ps_auth_type: str = "basic"
    ps_username: str = ""
    ps_password: str = ""        # plain — encrypted before storage
    ps_endpoint: str = ""
    ps_status_endpoint: str = ""
    ps_process_name: str = "SM_DISCOVERY"
    retrieval_method: str = "sftp"
    sftp_host: str = ""
    sftp_port: int = 22
    sftp_username: str = ""
    sftp_password: str = ""      # plain — encrypted before storage
    sftp_remote_path: str = ""


def _serialize(config: UserConfig) -> dict:
    return {
        "id":                 config.id,
        "name":               config.name,
        "ps_base_url":        config.ps_base_url,
        "ps_auth_type":       config.ps_auth_type,
        "ps_username":        config.ps_username,
        "ps_password":        "***" if config.ps_password_enc else "",
        "ps_endpoint":        config.ps_endpoint,
        "ps_status_endpoint": config.ps_status_endpoint,
        "ps_process_name":    config.ps_process_name,
        "retrieval_method":   config.retrieval_method,
        "sftp_host":          config.sftp_host,
        "sftp_port":          config.sftp_port,
        "sftp_username":      config.sftp_username,
        "sftp_password":      "***" if config.sftp_password_enc else "",
        "sftp_remote_path":   config.sftp_remote_path,
        "is_active":          config.is_active,
        "created_at":         config.created_at,
        "updated_at":         config.updated_at,
    }


@router.get("/")
def list_configs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    configs = db.query(UserConfig).filter(UserConfig.user_id == user.id).all()
    log.debug("list_configs  user=%s  count=%d", user.id[:8], len(configs))
    return [_serialize(c) for c in configs]


@router.post("/")
def create_config(
    body: ConfigPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    config = UserConfig(
        user_id=user.id,
        name=body.name,
        ps_base_url=body.ps_base_url,
        ps_auth_type=body.ps_auth_type,
        ps_username=body.ps_username,
        ps_password_enc=encrypt(body.ps_password) if body.ps_password else "",
        ps_endpoint=body.ps_endpoint,
        ps_status_endpoint=body.ps_status_endpoint,
        ps_process_name=body.ps_process_name,
        retrieval_method=body.retrieval_method,
        sftp_host=body.sftp_host,
        sftp_port=body.sftp_port,
        sftp_username=body.sftp_username,
        sftp_password_enc=encrypt(body.sftp_password) if body.sftp_password else "",
        sftp_remote_path=body.sftp_remote_path,
    )
    db.add(config)
    db.add(AuditEvent(user_id=user.id, event_type="config_created", detail={"name": body.name}))
    db.commit()
    db.refresh(config)
    log.info("Config created  id=%d  name=%r  user=%s", config.id, body.name, user.id[:8])
    return _serialize(config)


@router.get("/{config_id}")
def get_config(
    config_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    config = db.query(UserConfig).filter(
        UserConfig.id == config_id, UserConfig.user_id == user.id
    ).first()
    if not config:
        log.warning("get_config 404  id=%d  user=%s", config_id, user.id[:8])
        raise HTTPException(404, "Configuration not found")
    log.debug("get_config  id=%d  user=%s", config_id, user.id[:8])
    return _serialize(config)


@router.put("/{config_id}")
def update_config(
    config_id: int,
    body: ConfigPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    config = db.query(UserConfig).filter(
        UserConfig.id == config_id, UserConfig.user_id == user.id
    ).first()
    if not config:
        log.warning("update_config 404  id=%d  user=%s", config_id, user.id[:8])
        raise HTTPException(404, "Configuration not found")

    config.name               = body.name
    config.ps_base_url        = body.ps_base_url
    config.ps_auth_type       = body.ps_auth_type
    config.ps_username        = body.ps_username
    config.ps_endpoint        = body.ps_endpoint
    config.ps_status_endpoint = body.ps_status_endpoint
    config.ps_process_name    = body.ps_process_name
    config.retrieval_method   = body.retrieval_method
    config.sftp_host          = body.sftp_host
    config.sftp_port          = body.sftp_port
    config.sftp_username      = body.sftp_username
    config.sftp_remote_path   = body.sftp_remote_path
    config.updated_at         = datetime.now(timezone.utc)

    if body.ps_password and body.ps_password != "***":
        config.ps_password_enc = encrypt(body.ps_password)
    if body.sftp_password and body.sftp_password != "***":
        config.sftp_password_enc = encrypt(body.sftp_password)

    db.add(AuditEvent(user_id=user.id, event_type="config_updated", detail={"config_id": config_id}))
    db.commit()
    db.refresh(config)
    log.info("Config updated  id=%d  name=%r  user=%s", config_id, body.name, user.id[:8])
    return _serialize(config)


@router.delete("/{config_id}")
def delete_config(
    config_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    config = db.query(UserConfig).filter(
        UserConfig.id == config_id, UserConfig.user_id == user.id
    ).first()
    if not config:
        log.warning("delete_config 404  id=%d  user=%s", config_id, user.id[:8])
        raise HTTPException(404, "Configuration not found")
    db.delete(config)
    db.add(AuditEvent(user_id=user.id, event_type="config_deleted", detail={"config_id": config_id}))
    db.commit()
    log.info("Config deleted  id=%d  user=%s", config_id, user.id[:8])
    return {"deleted": True}
