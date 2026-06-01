import os
import httpx
from jose import jwt, JWTError
from fastapi import HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert
from datetime import datetime, timezone

from config import get_settings
from database import get_db
from models import User
from logger import get_logger

log = get_logger("auth")

security = HTTPBearer(auto_error=False)

_jwks_cache: dict | None = None
_jwks_fetched_at: float = 0.0
_JWKS_TTL = 3600.0   # refresh signing keys every hour


def _fetch_jwks() -> dict:
    """Fetch JWKS from Clerk with 2 attempts and a 10-second timeout each."""
    settings = get_settings()
    url = os.environ.get("CLERK_JWKS_URL", "") or settings.clerk_jwks_url
    if not url:
        raise RuntimeError("CLERK_JWKS_URL is not set")
    last_exc: Exception | None = None
    for attempt in range(2):
        try:
            resp = httpx.get(url, timeout=10)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            last_exc = exc
            log.warning("JWKS fetch attempt %d failed: %s", attempt + 1, exc)
    raise RuntimeError(f"JWKS unavailable after 2 attempts: {last_exc}")


def _get_jwks(force_refresh: bool = False) -> dict:
    global _jwks_cache, _jwks_fetched_at
    import time
    now = time.monotonic()
    if _jwks_cache is None or force_refresh or (now - _jwks_fetched_at) > _JWKS_TTL:
        _jwks_cache = _fetch_jwks()
        _jwks_fetched_at = now
        log.debug("JWKS refreshed  keys=%d", len(_jwks_cache.get("keys", [])))
    return _jwks_cache


def _verify_token(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        jwks = _get_jwks()
        key = next((k for k in jwks["keys"] if k.get("kid") == kid), None)
        if not key:
            # kid not found — could be key rotation; refresh JWKS once and retry
            log.info("JWT kid=%s not in cached JWKS, refreshing", kid)
            jwks = _get_jwks(force_refresh=True)
            key = next((k for k in jwks["keys"] if k.get("kid") == kid), None)
        if not key:
            log.warning("JWT rejected — signing key kid=%s not in JWKS", kid)
            raise HTTPException(401, "Token signing key not found in JWKS")
        return jwt.decode(token, key, algorithms=["RS256"], options={"verify_aud": False})
    except JWTError as exc:
        log.warning("JWT validation failed: %s", exc)
        raise HTTPException(401, f"Invalid token: {exc}")


def _fetch_clerk_user(user_id: str) -> dict:
    """Call the Clerk Backend API to get email and name for a user."""
    settings = get_settings()
    secret = os.environ.get("CLERK_API_SECRET", "") or settings.clerk_api_secret
    if not secret:
        log.debug("CLERK_API_SECRET not set — skipping Clerk API user fetch")
        return {}
    try:
        resp = httpx.get(
            f"https://api.clerk.com/v1/users/{user_id}",
            headers={"Authorization": f"Bearer {secret}"},
            timeout=10,
        )
        if resp.status_code == 200:
            log.debug("Clerk API returned profile for user %s", user_id)
            return resp.json()
        log.warning("Clerk API returned HTTP %s for user %s", resp.status_code, user_id)
    except Exception as exc:
        log.warning("Clerk API fetch failed for user %s: %s", user_id, exc)
    return {}


def _extract_user_info(payload: dict) -> tuple[str, str, str]:
    """Return (email, first_name, last_name) from a JWT payload, falling back to Clerk API."""
    user_id = payload.get("sub", "")
    email      = payload.get("email", "")
    first_name = payload.get("given_name", "") or payload.get("first_name", "")
    last_name  = payload.get("family_name", "") or payload.get("last_name", "")

    if not email:
        clerk = _fetch_clerk_user(user_id)
        # Primary email address
        primary_id = clerk.get("primary_email_address_id", "")
        for ea in clerk.get("email_addresses", []):
            if ea.get("id") == primary_id:
                email = ea.get("email_address", "")
                break
        if not email and clerk.get("email_addresses"):
            email = clerk["email_addresses"][0].get("email_address", "")
        if not first_name:
            first_name = clerk.get("first_name") or ""
        if not last_name:
            last_name = clerk.get("last_name") or ""

    # Last-resort fallback so the unique constraint never fires on an empty string
    if not email:
        email = f"{user_id}@unknown.clerk"

    return email, first_name, last_name


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> str:
    if not credentials:
        raise HTTPException(401, "Authentication required")
    payload = _verify_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "No user ID in token")
    return user_id


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(401, "Authentication required")
    payload = _verify_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "No user ID in token")

    now = datetime.now(timezone.utc)
    email, first_name, last_name = _extract_user_info(payload)

    # Upsert: INSERT … ON CONFLICT (id) DO UPDATE last_seen_at.
    # This is atomic and handles concurrent first-logins without a race condition.
    existing = db.query(User).filter(User.id == user_id).first()
    is_new = existing is None

    stmt = (
        pg_insert(User)
        .values(
            id=user_id,
            email=email,
            first_name=first_name,
            last_name=last_name,
            role="user",
            onboarded=False,
            created_at=now,
            last_seen_at=now,
        )
        .on_conflict_do_update(
            index_elements=["id"],
            set_={"last_seen_at": now},
        )
    )
    db.execute(stmt)
    db.commit()

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(500, "User record missing after upsert")

    # Cache the verified identity on request.state so the wide-event middleware
    # can read it without re-parsing or re-verifying the JWT.
    request.state.auth_user_id   = user.id
    request.state.auth_user_name = f"{user.first_name} {user.last_name}".strip() or user.email

    if is_new:
        log.info("New user registered: %s (%s)", user.email, user_id)
    else:
        log.debug("User login: %s (%s)", user.email, user_id)

    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return user
