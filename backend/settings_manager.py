from pathlib import Path
from dotenv import set_key
from logger import get_logger

log = get_logger("settings")

ENV_PATH = Path(__file__).parent / ".env"

ALLOWED_KEYS = {
    "ps_base_url", "ps_auth_type", "ps_username", "ps_password", "ps_endpoint",
    "ps_status_endpoint", "ps_process_name",
    "retrieval_method",
    "sftp_host", "sftp_port", "sftp_username", "sftp_password", "sftp_remote_path",
    "cors_origins",
}

_SENSITIVE = {"ps_password", "sftp_password"}


def update_env(updates: dict) -> None:
    ENV_PATH.touch(exist_ok=True)
    written = []
    for key, value in updates.items():
        k = key.lower()
        if k in ALLOWED_KEYS:
            set_key(str(ENV_PATH), key.upper(), str(value))
            display = "***" if k in _SENSITIVE else repr(str(value))
            written.append(f"{key.upper()}={display}")
    if written:
        log.info("Settings persisted to .env: %s", "  ".join(written))
    else:
        log.debug("update_env called with no recognized keys")
