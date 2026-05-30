from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, UserConfig, UserConfigEngine, Engine, AuditEvent
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
    ps_webserver_path: str = ""
    # VPN tunnel
    vpn_enabled: bool = False
    vpn_type: str = "none"
    vpn_host: str = ""
    vpn_port: int | None = None
    vpn_username: str = ""
    vpn_password: str = ""
    vpn_extra: str = ""
    # Windows Server access
    win_host: str = ""
    win_port: int = 5985
    win_username: str = ""
    win_password: str = ""
    win_use_ssl: bool = False
    win_auth_type: str = "ntlm"
    win_connection_type: str = "winrm"
    win_share: str = "C$"
    win_domain: str = ""
    # Engines — ordered list of engine IDs to run sequentially
    engine_ids: list[int] = []


def _get_engines(config_id: int, db: Session) -> list[dict]:
    rows = (
        db.query(UserConfigEngine, Engine)
        .join(Engine, UserConfigEngine.engine_id == Engine.id)
        .filter(UserConfigEngine.config_id == config_id)
        .order_by(UserConfigEngine.sort_order)
        .all()
    )
    return [
        {"id": e.id, "name": e.name, "process_name": e.process_name, "sort_order": uce.sort_order}
        for uce, e in rows
    ]


def _sync_engines(config_id: int, engine_ids: list[int], db: Session) -> None:
    """Replace the engine selection for a config with the given ordered list."""
    db.query(UserConfigEngine).filter(UserConfigEngine.config_id == config_id).delete()
    for order, eid in enumerate(engine_ids):
        db.add(UserConfigEngine(config_id=config_id, engine_id=eid, sort_order=order))


def _serialize(config: UserConfig, db: Session) -> dict:
    engines = _get_engines(config.id, db)
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
        "ps_webserver_path":  config.ps_webserver_path,
        "vpn_enabled":        config.vpn_enabled or False,
        "vpn_type":           config.vpn_type or "none",
        "vpn_host":           config.vpn_host or "",
        "vpn_port":           config.vpn_port,
        "vpn_username":       config.vpn_username or "",
        "vpn_password":       "***" if config.vpn_password_enc else "",
        "vpn_extra":          config.vpn_extra or "",
        "win_host":           config.win_host,
        "win_port":           config.win_port,
        "win_username":       config.win_username,
        "win_password":       "***" if config.win_password_enc else "",
        "win_use_ssl":        config.win_use_ssl,
        "win_auth_type":      config.win_auth_type or "ntlm",
        "win_connection_type": config.win_connection_type or "winrm",
        "win_share":          config.win_share or "C$",
        "win_domain":         config.win_domain or "",
        "engine_ids":         [e["id"] for e in engines],
        "engines":            engines,
        "is_active":          config.is_active,
        "created_at":         config.created_at,
        "updated_at":         config.updated_at,
    }


@router.get("/")
def list_configs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    configs = db.query(UserConfig).filter(UserConfig.user_id == user.id).all()
    log.debug("list_configs  user=%s  count=%d", user.id[:8], len(configs))
    return [_serialize(c, db) for c in configs]


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
        ps_webserver_path=body.ps_webserver_path,
        vpn_enabled=body.vpn_enabled,
        vpn_type=body.vpn_type,
        vpn_host=body.vpn_host,
        vpn_port=body.vpn_port,
        vpn_username=body.vpn_username,
        vpn_password_enc=encrypt(body.vpn_password) if body.vpn_password else "",
        vpn_extra=body.vpn_extra,
        win_host=body.win_host,
        win_port=body.win_port,
        win_username=body.win_username,
        win_password_enc=encrypt(body.win_password) if body.win_password else "",
        win_use_ssl=body.win_use_ssl,
        win_auth_type=body.win_auth_type,
        win_connection_type=body.win_connection_type,
        win_share=body.win_share,
        win_domain=body.win_domain,
    )
    db.add(config)
    db.flush()  # get config.id before syncing engines
    _sync_engines(config.id, body.engine_ids, db)
    db.add(AuditEvent(user_id=user.id, event_type="config_created", detail={"name": body.name}))
    db.commit()
    db.refresh(config)
    log.info("Config created  id=%d  name=%r  engines=%s  user=%s",
             config.id, body.name, body.engine_ids, user.id[:8])
    return _serialize(config, db)


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
    return _serialize(config, db)


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
    config.ps_webserver_path  = body.ps_webserver_path
    config.vpn_enabled        = body.vpn_enabled
    config.vpn_type           = body.vpn_type
    config.vpn_host           = body.vpn_host
    config.vpn_port           = body.vpn_port
    config.vpn_username       = body.vpn_username
    config.vpn_extra          = body.vpn_extra
    config.win_host           = body.win_host
    config.win_port           = body.win_port
    config.win_username       = body.win_username
    config.win_use_ssl        = body.win_use_ssl
    config.win_auth_type      = body.win_auth_type
    config.win_connection_type = body.win_connection_type
    config.win_share          = body.win_share
    config.win_domain         = body.win_domain
    config.updated_at         = datetime.now(timezone.utc)

    if body.ps_password and body.ps_password != "***":
        config.ps_password_enc = encrypt(body.ps_password)
    if body.sftp_password and body.sftp_password != "***":
        config.sftp_password_enc = encrypt(body.sftp_password)
    if body.vpn_password and body.vpn_password != "***":
        config.vpn_password_enc = encrypt(body.vpn_password)
    if body.win_password and body.win_password != "***":
        config.win_password_enc = encrypt(body.win_password)

    _sync_engines(config_id, body.engine_ids, db)
    db.add(AuditEvent(user_id=user.id, event_type="config_updated", detail={"config_id": config_id}))
    db.commit()
    db.refresh(config)
    log.info("Config updated  id=%d  name=%r  engines=%s  user=%s",
             config_id, body.name, body.engine_ids, user.id[:8])
    return _serialize(config, db)


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
