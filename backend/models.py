from sqlalchemy import Column, String, Integer, Boolean, Text, TIMESTAMP, JSON, ForeignKey, Index
from sqlalchemy.orm import declarative_base
from datetime import datetime, timezone

Base = declarative_base()

_now = lambda: datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id           = Column(String, primary_key=True)
    email        = Column(String, unique=True, nullable=False)
    first_name   = Column(String, default="")
    last_name    = Column(String, default="")
    role         = Column(String, default="user")
    onboarded    = Column(Boolean, default=False)
    created_at   = Column(TIMESTAMP(timezone=True), default=_now)
    last_seen_at = Column(TIMESTAMP(timezone=True), default=_now)


class UserConfig(Base):
    __tablename__ = "user_configs"
    __table_args__ = (Index("idx_configs_user_id", "user_id"),)
    id                 = Column(Integer, primary_key=True, autoincrement=True)
    user_id            = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name               = Column(String, default="Default Configuration")
    ps_base_url        = Column(Text, default="")
    ps_auth_type       = Column(String, default="basic")
    ps_username        = Column(String, default="")
    ps_password_enc    = Column(Text, default="")
    ps_endpoint        = Column(Text, default="")
    ps_status_endpoint = Column(Text, default="")
    ps_process_name    = Column(String, default="SM_DISCOVERY")
    retrieval_method   = Column(String, default="sftp")
    sftp_host          = Column(String, default="")
    sftp_port          = Column(Integer, default=22)
    sftp_username      = Column(String, default="")
    sftp_password_enc  = Column(Text, default="")
    sftp_remote_path   = Column(Text, default="")
    is_active          = Column(Boolean, default=True)
    created_at         = Column(TIMESTAMP(timezone=True), default=_now)
    updated_at         = Column(TIMESTAMP(timezone=True), default=_now)


class RunLog(Base):
    __tablename__ = "run_logs"
    __table_args__ = (
        Index("idx_run_logs_user_id", "user_id"),
        Index("idx_run_logs_started", "started_at"),
    )
    id              = Column(Integer, primary_key=True, autoincrement=True)
    user_id         = Column(String, ForeignKey("users.id"), nullable=False)
    config_id       = Column(Integer, ForeignKey("user_configs.id", ondelete="SET NULL"))
    config_name     = Column(String, default="")
    ps_process_name = Column(String, default="")
    status          = Column(String, nullable=False)
    instance_id     = Column(String, default="")
    report_id       = Column(String, default="")
    sftp_skipped    = Column(Boolean, default=False)
    skip_reason     = Column(Text, default="")
    row_count       = Column(Integer)
    error_detail    = Column(Text)
    duration_ms     = Column(Integer)
    started_at      = Column(TIMESTAMP(timezone=True), default=_now)
    completed_at    = Column(TIMESTAMP(timezone=True))


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        Index("idx_audit_user_id", "user_id"),
        Index("idx_audit_created", "created_at"),
    )
    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    event_type = Column(String, nullable=False)
    detail     = Column(JSON, default=dict)
    ip_address = Column(String)
    created_at = Column(TIMESTAMP(timezone=True), default=_now)
