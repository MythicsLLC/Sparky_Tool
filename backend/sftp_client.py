import io
import paramiko
from config import get_settings

settings = get_settings()


def download_csv() -> bytes:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=settings.sftp_host,
            port=settings.sftp_port,
            username=settings.sftp_username,
            password=settings.sftp_password,
        )
        sftp = client.open_sftp()
        buf = io.BytesIO()
        sftp.getfo(settings.sftp_remote_path, buf)
        buf.seek(0)
        return buf.read()
    finally:
        client.close()
