from functools import lru_cache
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    ps_base_url: str = ""
    ps_auth_type: str = "basic"
    ps_username: str = ""
    ps_password: str = ""
    ps_endpoint: str = ""
    ps_status_endpoint: str = ""
    ps_process_name: str = ""

    retrieval_method: str = "sftp"

    sftp_host: str = ""
    sftp_port: int = 22
    sftp_username: str = ""
    sftp_password: str = ""
    sftp_remote_path: str = ""
    ps_webserver_path: str = ""

    cors_origins: str = "http://localhost:3000"

    # Auth & DB (new)
    database_url: str = ""
    clerk_jwks_url: str = ""
    clerk_api_key: str = ""
    clerk_api_secret: str = ""
    encryption_key: str = ""

    # SMTP — for run completion email notifications
    smtp_host:     str  = ""
    smtp_port:     int  = 587
    smtp_user:     str  = ""
    smtp_password: str  = ""
    smtp_from:     str  = ""
    smtp_use_tls:  bool = True

    # Vercel API — for System Analytics admin tab
    vercel_token:   str = ""
    vercel_team_id: str = ""

    # Allow extra environment variables (e.g. local dev keys) without failing
    model_config = {"env_file": ".env", "case_sensitive": False, "extra": "ignore"}

@lru_cache
def get_settings() -> Settings:
    return Settings()
