import time
import httpx
from config import get_settings
from logger import get_logger

log = get_logger("peoplesoft")


def _build_url(base_url: str, endpoint: str) -> str:
    endpoint = endpoint.strip()
    if endpoint.startswith(("http://", "https://")):
        return endpoint
    base = base_url.strip().rstrip("/")
    if endpoint and not endpoint.startswith("/"):
        endpoint = "/" + endpoint
    url = base + endpoint
    if not url.startswith(("http://", "https://")):
        raise ValueError(
            f"Invalid URL '{url}' — Base URL must start with http:// or https://. "
            "Check the Base URL field in Settings."
        )
    return url


def _build_auth(settings):
    if settings.ps_auth_type == "basic":
        return httpx.BasicAuth(settings.ps_username, settings.ps_password), {}
    if settings.ps_auth_type == "bearer":
        return None, {"Authorization": f"Bearer {settings.ps_password}"}
    return None, {}


def trigger_engine(_settings=None) -> dict:
    settings = _settings or get_settings()
    url = _build_url(settings.ps_base_url, settings.ps_endpoint)
    auth, headers = _build_auth(settings)
    body = {"processname": settings.ps_process_name} if settings.ps_process_name else {}

    log.info("Triggering PeopleSoft engine  POST %s  (process: %s)", url, settings.ps_process_name)
    t0 = time.time()

    with httpx.Client(timeout=300, follow_redirects=False) as client:
        response = client.post(url, auth=auth, headers=headers, json=body)
        elapsed = round((time.time() - t0) * 1000)

        if response.is_redirect:
            location = response.headers.get("location", "")
            log.warning("PeopleSoft trigger returned redirect → %s (auth failure?)", location)
            raise httpx.HTTPStatusError(
                f"Authentication failed — PeopleSoft returned a login redirect (302). "
                f"Verify PS_USERNAME, PS_PASSWORD, and PS_AUTH_TYPE in Settings. "
                f"Redirect location: {location}",
                request=response.request,
                response=response,
            )

        log.info("PeopleSoft trigger response  HTTP %s  (%d ms)", response.status_code, elapsed)
        response.raise_for_status()
        data = response.json()
        log.info("Trigger complete — InstanceID: %s", data.get("InstanceID", "(none)"))
        return data


def poll_status(instance_id: str, _settings=None, max_wait: int = 600, poll_interval: int = 5) -> dict:
    settings = _settings or get_settings()
    base_url = _build_url(settings.ps_base_url, settings.ps_status_endpoint)
    url = f"{base_url.rstrip('/')}/{instance_id}"
    auth, headers = _build_auth(settings)

    log.info("Polling status  GET %s  (max wait: %ds, interval: %ds)", url, max_wait, poll_interval)
    elapsed = 0

    with httpx.Client(timeout=30, follow_redirects=False) as client:
        while elapsed < max_wait:
            time.sleep(poll_interval)
            elapsed += poll_interval
            t0 = time.time()
            response = client.get(url, auth=auth, headers=headers)
            rtt = round((time.time() - t0) * 1000)

            # PeopleSoft returns 5xx while the process is still queued or running.
            # Continue polling; only hard-fail on 4xx (auth/config errors).
            if response.status_code >= 500:
                log.warning(
                    "Poll [%3ds elapsed]  HTTP %s — process still starting, will retry  (%d ms)",
                    elapsed, response.status_code, rtt,
                )
                continue

            response.raise_for_status()  # 4xx → raise immediately

            data = response.json()
            report_id = data.get("ReportID", "")
            status = data.get("STATUS", "")
            log.info(
                "Poll [%3ds elapsed]  HTTP %s  STATUS=%r  ReportID=%r  (%d ms)",
                elapsed, response.status_code, status, report_id, rtt,
            )
            if report_id or status.lower() == "success":
                log.info("Poll complete — ReportID: %s  STATUS: %s", report_id, status)
                return data

    raise TimeoutError(
        f"Process did not complete after {max_wait}s (Instance ID: {instance_id})"
    )
