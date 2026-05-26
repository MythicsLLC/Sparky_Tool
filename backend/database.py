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
    """Add columns introduced after initial deployment (idempotent — safe to run on every startup)."""
    stmts = [
        "ALTER TABLE run_logs ADD COLUMN IF NOT EXISTS ps_process_name VARCHAR DEFAULT ''",
        "ALTER TABLE run_logs ADD COLUMN IF NOT EXISTS sftp_skipped BOOLEAN DEFAULT FALSE",
        "ALTER TABLE run_logs ADD COLUMN IF NOT EXISTS skip_reason TEXT DEFAULT ''",
        "ALTER TABLE run_logs ADD COLUMN IF NOT EXISTS failed_step VARCHAR DEFAULT ''",
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
    ]
    try:
        with engine.connect() as conn:
            for stmt in stmts:
                conn.execute(text(stmt))
            conn.commit()
        log.info("Schema migrations applied")
    except Exception as exc:
        log.warning("Schema migration failed (non-fatal): %s", exc)


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
