"""
SSH/SFTP client for Windows hosts running OpenSSH.

Windows Server 2019+ and Windows 10+ ship OpenSSH as an optional feature.
When installed, SFTP works on port 22 with the same Windows credentials.

To install on the remote Windows server (elevated PowerShell):
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
    Start-Service sshd
    Set-Service -Name sshd -StartupType Automatic
    New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22

Path note: OpenSSH on Windows accepts both Windows paths (C:\\Users\\Admin)
and Unix-style paths (/C:/Users/Admin). Use whichever your server supports.
"""
from __future__ import annotations
import io
import stat as _stat
from datetime import datetime, timezone
import paramiko
from logger import get_logger

log = get_logger("win_ssh_client")


def _connect(host: str, username: str, password: str,
             port: int = 22) -> tuple[paramiko.SSHClient, paramiko.SFTPClient]:
    """Open SSH connection and SFTP subsystem; caller must close both."""
    ssh = paramiko.SSHClient()
    # WarningPolicy logs unknown host keys instead of silently trusting them.
    ssh.set_missing_host_key_policy(paramiko.WarningPolicy())
    ssh.connect(hostname=host, port=port, username=username, password=password,
                timeout=30, banner_timeout=30)
    sftp = ssh.open_sftp()
    return ssh, sftp


def test_connection(host: str, username: str, password: str,
                    port: int = 22, **_) -> dict:
    """Test SSH connectivity and return basic server info."""
    log.info("win_ssh:test_connection  %s:%d  user=%s", host, port, username)
    ssh, sftp = _connect(host, username, password, port)
    try:
        _, stdout, _ = ssh.exec_command("hostname")
        computer = stdout.read().decode().strip()
        log.info("win_ssh:test_connection OK  %s  computer=%s", host, computer)
        return {
            "ComputerName": computer or host,
            "Username":     username,
            "Protocol":     "SSH/SFTP",
        }
    finally:
        sftp.close()
        ssh.close()


def list_directory(host: str, username: str, password: str,
                   path: str, port: int = 22, **_) -> list[dict]:
    """List a directory via SFTP."""
    log.info("win_ssh:list_directory  %s  path=%s", host, path)
    ssh, sftp = _connect(host, username, password, port)
    try:
        attrs = sftp.listdir_attr(path)
        items = []
        for a in attrs:
            is_dir = bool(_stat.S_ISDIR(a.st_mode)) if a.st_mode else False
            mtime  = datetime.fromtimestamp(a.st_mtime, tz=timezone.utc).isoformat() if a.st_mtime else ""
            items.append({
                "Name":      a.filename,
                "Type":      "dir" if is_dir else "file",
                "SizeBytes": a.st_size if not is_dir else None,
                "Modified":  mtime,
            })
        items.sort(key=lambda x: (0 if x["Type"] == "dir" else 1, x["Name"].lower()))
        log.info("win_ssh:list_directory  %s  path=%s  items=%d", host, path, len(items))
        return items
    finally:
        sftp.close()
        ssh.close()


def download_file(host: str, username: str, password: str,
                  path: str, port: int = 22, **_) -> bytes:
    """Download a file via SFTP and return raw bytes."""
    log.info("win_ssh:download_file  %s  path=%s", host, path)
    ssh, sftp = _connect(host, username, password, port)
    try:
        buf = io.BytesIO()
        sftp.getfo(path, buf)
        data = buf.getvalue()
        log.info("win_ssh:download_file  %s  path=%s  size=%d bytes", host, path, len(data))
        return data
    finally:
        sftp.close()
        ssh.close()


def read_file(host: str, username: str, password: str,
              path: str, port: int = 22, max_kb: int = 512, **_) -> str:
    """Read a text file via SFTP. Truncates at max_kb KB."""
    log.info("win_ssh:read_file  %s  path=%s", host, path)
    data  = download_file(host, username, password, path, port)
    limit = max_kb * 1024
    text  = data[:limit].decode("utf-8", errors="replace")
    if len(data) > limit:
        text += f"\n\n[... truncated at {max_kb} KB ...]"
    log.info("win_ssh:read_file  %s  path=%s  len=%d", host, path, len(text))
    return text


def download_csv(remote_path: str, _settings) -> bytes:
    """Adapter for the run pipeline — reads win_* fields from _settings."""
    port = int(getattr(_settings, "win_port", 22))
    return download_file(
        _settings.win_host, _settings.win_username, _settings.win_password,
        remote_path, port=port,
    )
