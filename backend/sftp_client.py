import io
import paramiko
from config import get_settings
from logger import get_logger

log = get_logger("sftp")


def download_csv(remote_path: str | None = None, _settings=None) -> bytes:
    settings = _settings or get_settings()
    path = remote_path or settings.sftp_remote_path

    log.info("SFTP connect  %s@%s:%d  path=%s",
             settings.sftp_username, settings.sftp_host, settings.sftp_port, path)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=settings.sftp_host,
            port=settings.sftp_port,
            username=settings.sftp_username,
            password=settings.sftp_password,
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
