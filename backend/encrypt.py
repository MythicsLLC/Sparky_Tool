import logging
import os
from cryptography.fernet import Fernet, InvalidToken

_log = logging.getLogger("sparky.encrypt")


def _get_fernet() -> Fernet:
    # Prefer explicit env var; fall back to pydantic-settings (.env loader)
    key = os.environ.get("ENCRYPTION_KEY", "")
    if not key:
        from config import get_settings
        key = get_settings().encryption_key
    if not key:
        raise RuntimeError(
            "ENCRYPTION_KEY is not set. Generate one with: "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode())


def encrypt(value: str) -> str:
    if not value:
        return ""
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    """Decrypt a Fernet-encrypted string.

    Returns an empty string (instead of raising) when the ciphertext was
    encrypted with a different key — e.g. after an ENCRYPTION_KEY rotation
    without re-encrypting stored credentials.  The caller should treat an
    empty result as "no credential available" and surface a clear error to
    the user rather than crashing with an opaque 500.
    """
    if not value:
        return ""
    try:
        return _get_fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        _log.warning(
            "decrypt: InvalidToken — stored credential may have been encrypted "
            "with a different ENCRYPTION_KEY; returning empty string"
        )
        return ""
    except Exception as exc:
        _log.warning("decrypt: unexpected error (%s); returning empty string", exc)
        return ""
