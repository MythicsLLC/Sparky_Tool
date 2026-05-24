import paramiko
from config import get_settings
from logger import get_logger

log = get_logger("scp")


def download_csv(remote_path: str | None = None, _settings=None) -> bytes:
    settings = _settings or get_settings()
    path = remote_path or settings.sftp_remote_path

    log.info("SSH/SCP connect  %s@%s:%d  path=%s",
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
