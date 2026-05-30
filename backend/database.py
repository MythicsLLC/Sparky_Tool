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
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS vpn_enabled BOOLEAN DEFAULT FALSE",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS vpn_type VARCHAR DEFAULT 'none'",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS vpn_host VARCHAR DEFAULT ''",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS vpn_port INTEGER",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS vpn_username VARCHAR DEFAULT ''",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS vpn_password_enc TEXT DEFAULT ''",
        "ALTER TABLE user_configs ADD COLUMN IF NOT EXISTS vpn_extra TEXT DEFAULT ''",
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

    # Neon requires SSL; pass it explicitly so it works even if stripped from URL
    connect_args = {"sslmode": "require"} if "neon.tech" in url else {}

    log.info("Connecting to database (driver: %s)", url.split("://")[0])
    _engine = create_engine(
        url,
        connect_args=connect_args,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
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


def health_check() -> bool:
    """Returns True if a query can be executed against the DB."""
    try:
        _init()
        with _engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        log.error("DB health check failed: %s", exc)
        return False
