import os
import paramiko
from config import get_settings
from logger import get_logger

log = get_logger("scp")


def _make_ssh_client() -> paramiko.SSHClient:
    """Return an SSHClient with a safe host-key policy (mirrors sftp_client)."""
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

    log.info("SSH/SCP connect  %s@%s:%d  path=%s",
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
        log.info("SSH authenticated — executing cat %s", path)
        _, stdout, stderr = client.exec_command(f"cat {path}")
        data = stdout.read()
        err = stderr.read()
        if not data and err:
            msg = err.decode().strip()
            log.error("SSH/SCP exec returned no data — stderr: %s", msg)
            raise RuntimeError(msg)
        log.info("SSH/SCP read complete — %d bytes (%.1f KB)", len(data), len(data) / 1024)
        return data
    except paramiko.AuthenticationException as exc:
        log.error("SSH authentication failed for %s@%s: %s", settings.sftp_username, settings.sftp_host, exc)
        raise
    except Exception as exc:
        log.error("SSH/SCP error (%s): %s", type(exc).__name__, exc)
        raise
    finally:
        client.close()
