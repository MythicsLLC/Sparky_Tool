from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
import importlib.util
import os

from config import get_settings
from logger import get_logger

log = get_logger("db")

_engine = None
_SessionLocal = None


def _validate_database_url(url: str) -> None:
    placeholder_tokens = ("hostname", "database_name", "username", "password", "<run-the-command")
    if any(token in url for token in placeholder_tokens):
        raise RuntimeError(
            "DATABASE_URL appears to contain placeholder values. "
            "Set DATABASE_URL to a valid Neon/Postgres connection string."
        )


def _resolve_postgres_driver(url: str) -> str:
    """Normalize the URL to use the psycopg3 driver prefix."""
    if url.startswith("postgres://"):
        prefix = "postgres://"
    elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
        prefix = "postgresql://"
    else:
        return url  # already has explicit driver (e.g. postgresql+psycopg://)

    if importlib.util.find_spec("psycopg") is not None:
        return "postgresql+psycopg://" + url[len(prefix):]
    return url


def _migrate_columns(engine) -> None:
    """Add columns/tables introduced after initial deployment (idempotent — safe to run on every startup)."""
    stmts = [
        # ── run_logs ─────────────────────────────────────────────────────────
        "ALTER TABLE run_logs ADD COLUMN IF NOT EXISTS config_name VARCHAR DEFAULT ''",
        "ALTER TABLE run_logs ADD COLUMN IF NOT EXISTS ps_process_name VARCHAR DEFAULT ''",
        "ALTER TABLE run_logs ADD COLUMN IF NOT EXISTS sftp_skipped BOOLEAN DEFAULT FALSE",
        "ALTER TABLE run_logs ADD COLUMN IF NOT EXISTS skip_reason TEXT DEFAULT ''",
        "ALTER TABLE run_logs ADD COLUMN IF NOT EXISTS failed_step VARCHAR DEFAULT ''",
        # ── user_configs ──────────────────────────────────────────────────────
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS ps_webserver_path TEXT DEFAULT ''",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS win_host VARCHAR DEFAULT ''",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS win_port INTEGER DEFAULT 5985",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS win_username VARCHAR DEFAULT ''",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS win_password_enc TEXT DEFAULT ''",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS win_use_ssl BOOLEAN DEFAULT FALSE",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS win_auth_type VARCHAR DEFAULT 'ntlm'",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS win_connection_type VARCHAR DEFAULT 'winrm'",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS win_share VARCHAR DEFAULT 'C$'",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS win_domain VARCHAR DEFAULT ''",
        # ── Remove VPN columns (idempotent) ──────────────────────────────────
        "ALTER TABLE user_configs DROP COLUMN IF EXISTS vpn_enabled",
        "ALTER TABLE user_configs DROP COLUMN IF EXISTS vpn_type",
        "ALTER TABLE user_configs DROP COLUMN IF EXISTS vpn_host",
        "ALTER TABLE user_configs DROP COLUMN IF EXISTS vpn_port",
        "ALTER TABLE user_configs DROP COLUMN IF EXISTS vpn_username",
        "ALTER TABLE user_configs DROP COLUMN IF EXISTS vpn_password_enc",
        "ALTER TABLE user_configs DROP COLUMN IF EXISTS vpn_extra",
        # ── FTP / FTPS access ────────────────────────────────────────────────
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS ftp_host VARCHAR DEFAULT ''",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS ftp_port INTEGER DEFAULT 21",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS ftp_username VARCHAR DEFAULT ''",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS ftp_password_enc TEXT DEFAULT ''",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS ftp_remote_path TEXT DEFAULT ''",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS ftp_connection_type VARCHAR DEFAULT 'ftp'",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS ftp_passive BOOLEAN DEFAULT TRUE",
        # ── wide_events ───────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS wide_events (
            id                SERIAL PRIMARY KEY,
            event_uuid        VARCHAR(36) NOT NULL,
            event             VARCHAR(200) NOT NULL,
            status            VARCHAR(20) NOT NULL DEFAULT 'success',
            tier              INTEGER NOT NULL DEFAULT 4,
            message           TEXT,
            total_duration_ms INTEGER,
            http_method       VARCHAR(10),
            http_status       INTEGER,
            endpoint          TEXT,
            user_id           VARCHAR REFERENCES users(id) ON DELETE SET NULL,
            user_name         VARCHAR(255),
            request_id        VARCHAR(100),
            process_id        VARCHAR(100),
            environment       VARCHAR(50) DEFAULT 'production',
            payload           JSONB DEFAULT '{}',
            created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_wide_events_created   ON wide_events (created_at)",
        "CREATE INDEX IF NOT EXISTS idx_wide_events_event     ON wide_events (event)",
        "CREATE INDEX IF NOT EXISTS idx_wide_events_status    ON wide_events (status)",
        "CREATE INDEX IF NOT EXISTS idx_wide_events_tier      ON wide_events (tier)",
        "CREATE INDEX IF NOT EXISTS idx_wide_events_user_id   ON wide_events (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_wide_events_request   ON wide_events (request_id)",
        # ── wide_event_views ──────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS wide_event_views (
            id          VARCHAR(36) PRIMARY KEY,
            name        TEXT NOT NULL,
            description TEXT,
            config      JSONB DEFAULT '{}',
            created_by  VARCHAR REFERENCES users(id) ON DELETE SET NULL,
            updated_by  VARCHAR REFERENCES users(id) ON DELETE SET NULL,
            created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_wide_event_views_name ON wide_event_views (name)",
        # ── user_preferences ──────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS user_preferences (
            user_id     VARCHAR PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            preferences JSONB DEFAULT '{}',
            updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        # ── feature_flags ─────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS feature_flags (
            id          SERIAL PRIMARY KEY,
            key         VARCHAR(200) UNIQUE NOT NULL,
            name        VARCHAR(200),
            description TEXT,
            enabled     BOOLEAN DEFAULT FALSE,
            status      VARCHAR(20) DEFAULT 'active',
            created_by  VARCHAR REFERENCES users(id) ON DELETE SET NULL,
            created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags (key)",
        # ── ai_conversations ──────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS ai_conversations (
            id                      SERIAL PRIMARY KEY,
            user_id                 VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title                   VARCHAR(500),
            ai_model_db_id          INTEGER REFERENCES ai_models(id) ON DELETE SET NULL,
            provider                VARCHAR(50),
            model_id_str            VARCHAR(255),
            total_prompt_tokens     INTEGER DEFAULT 0,
            total_completion_tokens INTEGER DEFAULT 0,
            total_reasoning_tokens  INTEGER DEFAULT 0,
            total_cached_tokens     INTEGER DEFAULT 0,
            total_tokens            INTEGER DEFAULT 0,
            estimated_cost_usd      NUMERIC(10, 6),
            created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_ai_conv_user_id ON ai_conversations (user_id)",
        # ── ai_messages ───────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS ai_messages (
            id                SERIAL PRIMARY KEY,
            conversation_id   INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
            user_id           VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role              VARCHAR(20) NOT NULL,
            content           TEXT,
            prompt_tokens     INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            reasoning_tokens  INTEGER DEFAULT 0,
            cached_tokens     INTEGER DEFAULT 0,
            total_tokens      INTEGER DEFAULT 0,
            ttft_ms           INTEGER,
            created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_ai_msg_conv_id ON ai_messages (conversation_id)",
        # ── engines ───────────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS engines (
            id           SERIAL PRIMARY KEY,
            name         VARCHAR(200) NOT NULL,
            process_name VARCHAR(200) NOT NULL DEFAULT '',
            description  TEXT DEFAULT '',
            is_active    BOOLEAN DEFAULT TRUE,
            sort_order   INTEGER DEFAULT 0,
            created_by   VARCHAR REFERENCES users(id) ON DELETE SET NULL,
            created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_engines_sort ON engines (sort_order)",
        "ALTER TABLE engines ADD COLUMN IF NOT EXISTS process_name VARCHAR(200) NOT NULL DEFAULT ''",
        # ── user_config_engines ───────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS user_config_engines (
            id         SERIAL PRIMARY KEY,
            config_id  INTEGER NOT NULL REFERENCES user_configs(id) ON DELETE CASCADE,
            engine_id  INTEGER NOT NULL REFERENCES engines(id) ON DELETE CASCADE,
            sort_order INTEGER DEFAULT 0,
            CONSTRAINT uq_config_engine UNIQUE (config_id, engine_id)
        )""",
        "CREATE INDEX IF NOT EXISTS idx_uce_config_id ON user_config_engines (config_id)",
        # ── run_outputs ───────────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS run_outputs (
            id              SERIAL PRIMARY KEY,
            user_id         VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            run_log_id      INTEGER REFERENCES run_logs(id) ON DELETE SET NULL,
            display_name    VARCHAR(500) NOT NULL,
            config_name     VARCHAR(255) DEFAULT '',
            engine_name     VARCHAR(255) DEFAULT '',
            process_name    VARCHAR(255) DEFAULT '',
            row_count       INTEGER DEFAULT 0,
            file_size_bytes INTEGER DEFAULT 0,
            csv_content     BYTEA NOT NULL,
            created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_run_outputs_user_id ON run_outputs (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_run_outputs_created  ON run_outputs (created_at)",
        # ── scheduled_runs ────────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS scheduled_runs (
            id            SERIAL PRIMARY KEY,
            user_id       VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            config_id     INTEGER NOT NULL REFERENCES user_configs(id) ON DELETE CASCADE,
            label         VARCHAR(255) DEFAULT '',
            frequency     VARCHAR(20) NOT NULL DEFAULT 'daily',
            run_hour      INTEGER DEFAULT 0,
            run_minute    INTEGER DEFAULT 0,
            day_of_week   INTEGER DEFAULT 0,
            day_of_month  INTEGER DEFAULT 1,
            is_active     BOOLEAN DEFAULT TRUE,
            next_run_at   TIMESTAMP WITH TIME ZONE,
            last_run_at   TIMESTAMP WITH TIME ZONE,
            last_status   VARCHAR(20) DEFAULT '',
            created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_scheduled_runs_user_id  ON scheduled_runs (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_scheduled_runs_next_run ON scheduled_runs (next_run_at)",
        # ── notification_settings ─────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS notification_settings (
            user_id           VARCHAR PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            notify_on_success BOOLEAN DEFAULT TRUE,
            notify_on_failure BOOLEAN DEFAULT TRUE,
            email_enabled     BOOLEAN DEFAULT FALSE,
            email_address     VARCHAR(255) DEFAULT '',
            slack_webhook_url TEXT DEFAULT '',
            teams_webhook_url TEXT DEFAULT '',
            updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        # ── data_quality_rules ────────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS data_quality_rules (
            id         SERIAL PRIMARY KEY,
            user_id    VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            config_id  INTEGER NOT NULL REFERENCES user_configs(id) ON DELETE CASCADE,
            name       VARCHAR(255) NOT NULL,
            rule_type  VARCHAR(50) NOT NULL,
            parameters JSONB DEFAULT '{}',
            is_active  BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_dq_rules_config_id ON data_quality_rules (config_id)",
        "CREATE INDEX IF NOT EXISTS idx_dq_rules_user_id   ON data_quality_rules (user_id)",
        # ── data_quality_results ──────────────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS data_quality_results (
            id           SERIAL PRIMARY KEY,
            run_log_id   INTEGER NOT NULL REFERENCES run_logs(id) ON DELETE CASCADE,
            rule_id      INTEGER NOT NULL REFERENCES data_quality_rules(id) ON DELETE CASCADE,
            rule_name    VARCHAR(255) DEFAULT '',
            rule_type    VARCHAR(50) DEFAULT '',
            passed       BOOLEAN NOT NULL,
            actual_value VARCHAR(500) DEFAULT '',
            message      TEXT DEFAULT '',
            checked_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_dq_results_run_log_id ON data_quality_results (run_log_id)",
        "CREATE INDEX IF NOT EXISTS idx_dq_results_rule_id    ON data_quality_results (rule_id)",
        # ── analysis_results ──────────────────────────────────────────────────────
        "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS run_output_id INTEGER",
        "CREATE INDEX IF NOT EXISTS idx_analysis_results_run_output ON analysis_results (run_output_id)",
        # ── pg_notify trigger for wide_events (supports future LISTEN-based SSE) ──
        """CREATE OR REPLACE FUNCTION notify_wide_events_inserted()
        RETURNS trigger AS $$
        BEGIN
            PERFORM pg_notify(
                'wide_events_inserted',
                json_build_object('id', NEW.id, 'created_at', NEW.created_at)::text
            );
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql""",
        "DROP TRIGGER IF EXISTS wide_events_inserted_notify ON wide_events",
        """CREATE TRIGGER wide_events_inserted_notify
        AFTER INSERT ON wide_events
        FOR EACH ROW EXECUTE FUNCTION notify_wide_events_inserted()""",
    ]
    ok = 0
    for stmt in stmts:
        try:
            with engine.connect() as conn:
                conn.execute(text(stmt))
                conn.commit()
            ok += 1
        except Exception as exc:
            log.warning("Migration statement skipped: %s | %s", stmt.strip()[:80], exc)
    log.info("Schema migrations: %d/%d statements applied", ok, len(stmts))


def _init():
    global _engine, _SessionLocal
    if _engine is not None:
        return

    settings = get_settings()
    url = os.environ.get("DATABASE_URL", "") or settings.database_url
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    _validate_database_url(url)
    url = _resolve_postgres_driver(url)

    # Neon requires SSL; TCP keepalives keep the socket alive during idle periods
    # so Neon's 5-min serverless timeout doesn't drop pool connections silently.
    connect_args: dict = {"connect_timeout": 10}
    if "neon.tech" in url:
        connect_args.update({
            "sslmode":            "require",
            "keepalives":         1,
            "keepalives_idle":    30,   # start probes after 30 s idle
            "keepalives_interval": 10,  # probe every 10 s
            "keepalives_count":   5,    # give up after 5 failed probes
        })

    log.info("Connecting to database (driver: %s)", url.split("://")[0])
    _engine = create_engine(
        url,
        connect_args=connect_args,
        pool_pre_ping=True,     # validate connections before handing them out
        pool_size=5,
        max_overflow=10,
        pool_recycle=120,       # recycle every 2 min — safely under Neon's 5-min idle timeout
        pool_timeout=30,        # raise after 30 s if no connection available
    )
    _SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False)

    from models import Base
    Base.metadata.create_all(_engine)

    # create_all skips indexes on existing tables — create them explicitly
    for table in Base.metadata.tables.values():
        for index in table.indexes:
            index.create(_engine, checkfirst=True)

    _migrate_columns(_engine)

    log.info("Database ready — tables: %s", ", ".join(Base.metadata.tables.keys()))


def get_db() -> Session:
    _init()
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    _init()


def init_db(retries: int = 5, delay: float = 3.0) -> None:
    """Eagerly initialise the database at startup with exponential back-off.

    Call this from the FastAPI lifespan so connection failures surface
    immediately with clear log messages rather than silently on the first
    incoming request.
    """
    import time
    for attempt in range(1, retries + 1):
        try:
            _init()
            log.info("Database initialised successfully (attempt %d)", attempt)
            return
        except Exception as exc:
            if attempt == retries:
                log.error("Database init failed after %d attempts: %s", retries, exc)
                raise
            wait = delay * (2 ** (attempt - 1))   # 3 s, 6 s, 12 s, 24 s …
            log.warning("Database init attempt %d/%d failed (%s) — retrying in %.0f s",
                        attempt, retries, exc, wait)
            time.sleep(wait)


def health_check() -> dict:
    """Return a dict with 'ok' bool and 'latency_ms' int."""
    import time
    t0 = time.monotonic()
    try:
        _init()
        with _engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"ok": True, "latency_ms": round((time.monotonic() - t0) * 1000)}
    except Exception as exc:
        log.error("DB health check failed: %s", exc)
        return {"ok": False, "latency_ms": round((time.monotonic() - t0) * 1000), "error": str(exc)}
