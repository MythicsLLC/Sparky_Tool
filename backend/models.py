from sqlalchemy import Column, String, Integer, Boolean, Text, TIMESTAMP, JSON, ForeignKey, Index, Numeric, UniqueConstraint, LargeBinary
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
    ps_webserver_path  = Column(Text, default="")
    # FTP / FTPS server access
    ftp_host            = Column(String,  default="")
    ftp_port            = Column(Integer, default=21)
    ftp_username        = Column(String,  default="")
    ftp_password_enc    = Column(Text,    default="")
    ftp_remote_path     = Column(Text,    default="")
    ftp_connection_type = Column(String,  default="ftp")   # ftp | ftps
    ftp_passive         = Column(Boolean, default=True)
    # Windows Server (WinRM) access
    win_host           = Column(String, default="")
    win_port           = Column(Integer, default=5985)
    win_username       = Column(String, default="")
    win_password_enc   = Column(Text, default="")
    win_use_ssl         = Column(Boolean, default=False)
    win_auth_type       = Column(String, default="ntlm")
    win_connection_type = Column(String, default="winrm")   # winrm | smb | ssh
    win_share           = Column(String, default="C$")       # SMB share (admin share by default)
    win_domain          = Column(String, default="")         # domain for SMB / Kerberos
    is_active           = Column(Boolean, default=True)
    created_at         = Column(TIMESTAMP(timezone=True), default=_now)
    updated_at         = Column(TIMESTAMP(timezone=True), default=_now)


class Engine(Base):
    """A PeopleSoft process name managed by admins and selectable per user config."""
    __tablename__ = "engines"
    __table_args__ = (Index("idx_engines_sort", "sort_order"),)
    id           = Column(Integer, primary_key=True, autoincrement=True)
    name         = Column(String(200), nullable=False)          # human-readable label
    process_name = Column(String(200), nullable=False)          # PS process name e.g. SM_DISCOVERY
    description  = Column(Text, default="")
    is_active    = Column(Boolean, default=True)
    sort_order   = Column(Integer, default=0)
    created_by   = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    created_at   = Column(TIMESTAMP(timezone=True), default=_now)
    updated_at   = Column(TIMESTAMP(timezone=True), default=_now)


class UserConfigEngine(Base):
    """Many-to-many: which engines (process names) are selected for a config, and in what order."""
    __tablename__ = "user_config_engines"
    __table_args__ = (
        Index("idx_uce_config_id", "config_id"),
        UniqueConstraint("config_id", "engine_id", name="uq_config_engine"),
    )
    id         = Column(Integer, primary_key=True, autoincrement=True)
    config_id  = Column(Integer, ForeignKey("user_configs.id", ondelete="CASCADE"), nullable=False)
    engine_id  = Column(Integer, ForeignKey("engines.id", ondelete="CASCADE"), nullable=False)
    sort_order = Column(Integer, default=0)


class RunLog(Base):
    __tablename__ = "run_logs"
    __table_args__ = (
        Index("idx_run_logs_user_id",   "user_id"),
        Index("idx_run_logs_started",   "started_at"),
        Index("idx_run_logs_status",    "status"),
        Index("idx_run_logs_config_id", "config_id"),
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
    failed_step     = Column(String, default="")   # trigger | poll | download | parse
    row_count       = Column(Integer)
    error_detail    = Column(Text)
    duration_ms     = Column(Integer)
    started_at      = Column(TIMESTAMP(timezone=True), default=_now)
    completed_at    = Column(TIMESTAMP(timezone=True))


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        Index("idx_audit_user_id",    "user_id"),
        Index("idx_audit_created",    "created_at"),
        Index("idx_audit_event_type", "event_type"),
    )
    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    event_type = Column(String, nullable=False)
    detail     = Column(JSON, default=dict)
    ip_address = Column(String)
    created_at = Column(TIMESTAMP(timezone=True), default=_now)


class AiModel(Base):
    __tablename__ = "ai_models"
    __table_args__ = (Index("idx_ai_models_provider", "provider"),)
    id          = Column(Integer, primary_key=True, autoincrement=True)
    name        = Column(String(255), nullable=False)
    provider    = Column(String(50), nullable=False)   # gemini|openai|anthropic|grok|generic
    model_id    = Column(String(255), nullable=False)  # e.g. gemini-2.0-flash
    api_key_enc = Column(Text, default="")
    base_url    = Column(Text, default="")             # for generic/OpenAI-compatible
    is_default  = Column(Boolean, default=False)
    is_active   = Column(Boolean, default=True)
    created_at  = Column(TIMESTAMP(timezone=True), default=_now)
    updated_at  = Column(TIMESTAMP(timezone=True), default=_now)


# ── Wide Events (structured observability) ────────────────────────────────────

class WideEvent(Base):
    """One row per significant API operation. Status is always explicit. Tier controls retention/sampling."""
    __tablename__ = "wide_events"
    __table_args__ = (
        Index("idx_wide_events_created", "created_at"),
        Index("idx_wide_events_event", "event"),
        Index("idx_wide_events_status", "status"),
        Index("idx_wide_events_tier", "tier"),
        Index("idx_wide_events_user_id", "user_id"),
        Index("idx_wide_events_request_id", "request_id"),
    )
    id               = Column(Integer, primary_key=True, autoincrement=True)
    event_uuid       = Column(String(36), nullable=False)   # logical UUID assigned at creation
    event            = Column(String(200), nullable=False)
    status           = Column(String(20), nullable=False, default="success")
    tier             = Column(Integer, nullable=False, default=4)
    message          = Column(Text)
    total_duration_ms = Column(Integer)
    http_method      = Column(String(10))
    http_status      = Column(Integer)
    endpoint         = Column(Text)
    user_id          = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    user_name        = Column(String(255))
    request_id       = Column(String(100))
    process_id       = Column(String(100))
    environment      = Column(String(50), default="production")
    payload          = Column(JSON, default=dict)
    created_at       = Column(TIMESTAMP(timezone=True), default=_now)


class WideEventView(Base):
    """Saved admin filter presets for the event stream."""
    __tablename__ = "wide_event_views"
    __table_args__ = (Index("idx_wide_event_views_name", "name"),)
    id          = Column(String(36), primary_key=True)   # UUID
    name        = Column(Text, nullable=False)
    description = Column(Text)
    config      = Column(JSON, default=dict)             # filter params serialized as JSON
    created_by  = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    updated_by  = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    created_at  = Column(TIMESTAMP(timezone=True), default=_now)
    updated_at  = Column(TIMESTAMP(timezone=True), default=_now)


# ── User Preferences ──────────────────────────────────────────────────────────

class UserPreference(Base):
    """Per-user UI settings stored as a JSON blob. One row per user."""
    __tablename__ = "user_preferences"
    user_id     = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    preferences = Column(JSON, default=dict)
    updated_at  = Column(TIMESTAMP(timezone=True), default=_now)


# ── Feature Flags ─────────────────────────────────────────────────────────────

class FeatureFlag(Base):
    """Runtime on/off toggles. Admins flip them in the console without a redeploy."""
    __tablename__ = "feature_flags"
    __table_args__ = (Index("idx_feature_flags_key", "key"),)
    id          = Column(Integer, primary_key=True, autoincrement=True)
    key         = Column(String(200), unique=True, nullable=False)
    name        = Column(String(200))
    description = Column(Text)
    enabled     = Column(Boolean, default=False)
    status      = Column(String(20), default="active")   # active | archived
    created_by  = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    created_at  = Column(TIMESTAMP(timezone=True), default=_now)
    updated_at  = Column(TIMESTAMP(timezone=True), default=_now)


# ── AI Conversations + Messages ───────────────────────────────────────────────

class AiConversation(Base):
    """Tracks every AI file-analysis session: model used, aggregate token counts, cost."""
    __tablename__ = "ai_conversations"
    __table_args__ = (Index("idx_ai_conv_user_id", "user_id"),)
    id                       = Column(Integer, primary_key=True, autoincrement=True)
    user_id                  = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title                    = Column(String(500))
    ai_model_db_id           = Column(Integer, ForeignKey("ai_models.id", ondelete="SET NULL"))
    provider                 = Column(String(50))
    model_id_str             = Column(String(255))
    total_prompt_tokens      = Column(Integer, default=0)
    total_completion_tokens  = Column(Integer, default=0)
    total_reasoning_tokens   = Column(Integer, default=0)
    total_cached_tokens      = Column(Integer, default=0)
    total_tokens             = Column(Integer, default=0)
    estimated_cost_usd       = Column(Numeric(10, 6))
    created_at               = Column(TIMESTAMP(timezone=True), default=_now)
    updated_at               = Column(TIMESTAMP(timezone=True), default=_now)


class RunOutput(Base):
    """CSV downloaded during a run, stored in DB so history survives Render restarts."""
    __tablename__ = "run_outputs"
    __table_args__ = (
        Index("idx_run_outputs_user_id",  "user_id"),
        Index("idx_run_outputs_created",  "created_at"),
    )
    id              = Column(Integer, primary_key=True, autoincrement=True)
    user_id         = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    run_log_id      = Column(Integer, ForeignKey("run_logs.id", ondelete="SET NULL"), nullable=True)
    display_name    = Column(String(500), nullable=False)
    config_name     = Column(String(255), default="")
    engine_name     = Column(String(255), default="")
    process_name    = Column(String(255), default="")
    row_count       = Column(Integer, default=0)
    file_size_bytes = Column(Integer, default=0)
    csv_content     = Column(LargeBinary, nullable=False)
    created_at      = Column(TIMESTAMP(timezone=True), default=_now)


# ── Scheduled Runs ───────────────────────────────────────────────────────────

class ScheduledRun(Base):
    __tablename__ = "scheduled_runs"
    __table_args__ = (
        Index("idx_scheduled_runs_user_id",  "user_id"),
        Index("idx_scheduled_runs_next_run", "next_run_at"),
    )
    id            = Column(Integer, primary_key=True, autoincrement=True)
    user_id       = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    config_id     = Column(Integer, ForeignKey("user_configs.id", ondelete="CASCADE"), nullable=False)
    label         = Column(String(255), default="")
    frequency     = Column(String(20), nullable=False, default="daily")   # daily | weekly | monthly
    run_hour      = Column(Integer, default=0)    # 0-23 UTC
    run_minute    = Column(Integer, default=0)    # 0-59
    day_of_week   = Column(Integer, default=0)    # 0=Mon … 6=Sun (weekly only)
    day_of_month  = Column(Integer, default=1)    # 1-31 (monthly only)
    is_active     = Column(Boolean, default=True)
    next_run_at   = Column(TIMESTAMP(timezone=True))
    last_run_at   = Column(TIMESTAMP(timezone=True))
    last_status   = Column(String(20), default="")   # success | error | running
    created_at    = Column(TIMESTAMP(timezone=True), default=_now)
    updated_at    = Column(TIMESTAMP(timezone=True), default=_now)


# ── Notification Settings ─────────────────────────────────────────────────────

class NotificationSetting(Base):
    __tablename__ = "notification_settings"
    user_id           = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    notify_on_success = Column(Boolean, default=True)
    notify_on_failure = Column(Boolean, default=True)
    email_enabled     = Column(Boolean, default=False)
    email_address     = Column(String(255), default="")   # blank → use user.email
    slack_webhook_url = Column(Text, default="")
    teams_webhook_url = Column(Text, default="")
    updated_at        = Column(TIMESTAMP(timezone=True), default=_now)


# ── Data Quality Rules + Results ──────────────────────────────────────────────

class DataQualityRule(Base):
    __tablename__ = "data_quality_rules"
    __table_args__ = (
        Index("idx_dq_rules_config_id", "config_id"),
        Index("idx_dq_rules_user_id",   "user_id"),
    )
    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    config_id  = Column(Integer, ForeignKey("user_configs.id", ondelete="CASCADE"), nullable=False)
    name       = Column(String(255), nullable=False)
    rule_type  = Column(String(50), nullable=False)   # row_count_gt | row_count_lt | row_count_between | column_not_null | value_must_exist | column_unique
    parameters = Column(JSON, default=dict)
    is_active  = Column(Boolean, default=True)
    created_at = Column(TIMESTAMP(timezone=True), default=_now)
    updated_at = Column(TIMESTAMP(timezone=True), default=_now)


class DataQualityResult(Base):
    __tablename__ = "data_quality_results"
    __table_args__ = (
        Index("idx_dq_results_run_log_id", "run_log_id"),
        Index("idx_dq_results_rule_id",    "rule_id"),
    )
    id           = Column(Integer, primary_key=True, autoincrement=True)
    run_log_id   = Column(Integer, ForeignKey("run_logs.id",           ondelete="CASCADE"), nullable=False)
    rule_id      = Column(Integer, ForeignKey("data_quality_rules.id", ondelete="CASCADE"), nullable=False)
    rule_name    = Column(String(255), default="")
    rule_type    = Column(String(50),  default="")
    passed       = Column(Boolean, nullable=False)
    actual_value = Column(String(500), default="")
    message      = Column(Text, default="")
    checked_at   = Column(TIMESTAMP(timezone=True), default=_now)


class AnalysisResult(Base):
    """Full AI analysis response stored per run, with a user review status."""
    __tablename__ = "analysis_results"
    __table_args__ = (
        Index("idx_analysis_results_user_id", "user_id"),
        Index("idx_analysis_results_created",  "created_at"),
        Index("idx_analysis_results_review",   "review_status"),
    )
    id              = Column(Integer, primary_key=True, autoincrement=True)
    user_id         = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    conversation_id = Column(Integer, ForeignKey("ai_conversations.id", ondelete="SET NULL"))
    filename        = Column(String(500), nullable=False)
    provider        = Column(String(50),  default="")
    model_id_str    = Column(String(255), default="")
    # First 2 000 chars of the prompt sent to the AI — enough to understand the
    # data profile used, without storing the full (potentially large) blob.
    prompt_snippet  = Column(Text, default="")
    response_json   = Column(JSON)          # complete chart spec returned by AI
    chart_count     = Column(Integer, default=0)
    sheet_count     = Column(Integer, default=1)
    total_rows      = Column(Integer, default=0)
    total_columns   = Column(Integer, default=0)
    review_status   = Column(String(20), default="pending")  # pending | approved | rejected
    review_comment  = Column(Text, default="")
    reviewed_at     = Column(TIMESTAMP(timezone=True))
    created_at      = Column(TIMESTAMP(timezone=True), default=_now)


class PromptReference(Base):
    """Approved analyses — the 'good prompt' library.
    Created automatically when a user approves an AnalysisResult."""
    __tablename__ = "prompt_references"
    __table_args__ = (
        Index("idx_prompt_refs_user_id", "user_id"),
        Index("idx_prompt_refs_created", "created_at"),
    )
    id                 = Column(Integer, primary_key=True, autoincrement=True)
    analysis_result_id = Column(Integer, ForeignKey("analysis_results.id", ondelete="CASCADE"), nullable=False)
    user_id            = Column(String, ForeignKey("users.id", ondelete="SET NULL"))
    filename           = Column(String(500), nullable=False)
    summary            = Column(Text, default="")
    chart_count        = Column(Integer, default=0)
    sheet_count        = Column(Integer, default=1)
    total_rows         = Column(Integer, default=0)
    total_columns      = Column(Integer, default=0)
    provider           = Column(String(50),  default="")
    model_id_str       = Column(String(255), default="")
    review_comment     = Column(Text, default="")
    response_json      = Column(JSON)   # copy of the approved chart spec
    created_at         = Column(TIMESTAMP(timezone=True), default=_now)


class AiMessage(Base):
    """One row per turn (user prompt or assistant reply) within an AiConversation."""
    __tablename__ = "ai_messages"
    __table_args__ = (Index("idx_ai_msg_conv_id", "conversation_id"),)
    id                  = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id     = Column(Integer, ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False)
    user_id             = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role                = Column(String(20), nullable=False)   # user | assistant
    content             = Column(Text)
    prompt_tokens       = Column(Integer, default=0)
    completion_tokens   = Column(Integer, default=0)
    reasoning_tokens    = Column(Integer, default=0)
    cached_tokens       = Column(Integer, default=0)
    total_tokens        = Column(Integer, default=0)
    ttft_ms             = Column(Integer)   # time-to-first-token (ms) when available
    created_at          = Column(TIMESTAMP(timezone=True), default=_now)
