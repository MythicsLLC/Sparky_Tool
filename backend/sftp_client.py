import io
import paramiko
from config import get_settings
from logger import get_logger

log = get_logger("sftp")


def _make_ssh_client() -> paramiko.SSHClient:
    """Return an SSHClient with a safe host-key policy.

    Uses WarningPolicy so unknown host keys produce a log warning rather than
    being silently accepted (AutoAddPolicy) or causing hard failures in
    environments without a known_hosts file (RejectPolicy).  Set
    SSH_KNOWN_HOSTS=/path/to/known_hosts in the environment to enable strict
    host-key verification via RejectPolicy.
    """
    import os
    client = paramiko.SSHClient()
    known_hosts = os.environ.get("SSH_KNOWN_HOSTS", "")
    if known_hosts:
        client.load_host_keys(known_hosts)
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        log.debug("SSH strict host-key checking enabled from %s", known_hosts)
    else:
        client.set_missing_host_key_policy(paramiko.WarningPolicy())
    return client


def download_csv(remote_path: str | None = None, _settings=None) -> bytes:
    settings = _settings or get_settings()
    path = remote_path or settings.sftp_remote_path

    log.info("SFTP connect  %s@%s:%d  path=%s",
             settings.sftp_username, settings.sftp_host, settings.sftp_port, path)

    client = _make_ssh_client()
    try:
        client.connect(
            hostname=settings.sftp_host,
            port=settings.sftp_port,
            username=settings.sftp_username,
            password=settings.sftp_password,
            timeout=30,
            banner_timeout=30,
        )
        log.info("SFTP authenticated — opening channel")
        sftp = client.open_sftp()
        buf = io.BytesIO()
        sftp.getfo(path, buf)
        buf.seek(0)
        data = buf.read()
        log.info("SFTP download complete — %d bytes (%.1f KB)", len(data), len(data) / 1024)
        return data
    except paramiko.AuthenticationException as exc:
        log.error("SFTP authentication failed for %s@%s: %s", settings.sftp_username, settings.sftp_host, exc)
        raise
    except FileNotFoundError:
        log.error("SFTP remote path not found: %s", path)
        raise
    except Exception as exc:
        log.error("SFTP error (%s): %s", type(exc).__name__, exc)
        raise
    finally:
        client.close()
