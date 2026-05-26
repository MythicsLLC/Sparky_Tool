"""
SMB (Windows File Sharing) client using smbprotocol/smbclient.

SMB/CIFS is Windows' native file-sharing protocol (port 445).
It is typically enabled by default on all Windows servers — no server
configuration is required.

Admin shares give Administrators access to any drive without creating
explicit shares:
    \\host\C$  →  C:\
    \\host\D$  →  D:\
"""
from __future__ import annotations
from datetime import datetime, timezone
import smbclient
from logger import get_logger

log = get_logger("smb_client")


def _register(host: str, username: str, password: str,
              port: int = 445, domain: str = "") -> None:
    """Register (or refresh) an SMB session for this host."""
    kw: dict = dict(username=username, password=password, port=port)
    if domain:
        kw["domain"] = domain
    smbclient.register_session(host, **kw)


def _to_unc(host: str, path: str) -> str:
    """
    Convert a local Windows path to a UNC path using admin shares.

    'C:\\Users\\Admin\\file' → '\\\\host\\C$\\Users\\Admin\\file'
    '\\\\host\\share\\path'  → returned unchanged
    'C$\\path'               → '\\\\host\\C$\\path'
    """
    p = path.replace("/", "\\")
    if p.startswith("\\\\"):
        return p
    if len(p) >= 2 and p[1] == ":":
        drive = p[0].upper()
        rest  = p[2:].lstrip("\\")
        return f"\\\\{host}\\{drive}$\\{rest}" if rest else f"\\\\{host}\\{drive}$"
    # Already a share reference or bare path — prepend host
    return f"\\\\{host}\\{p.lstrip(chr(92))}"


def test_connection(host: str, username: str, password: str,
                    share: str = "C$", domain: str = "",
                    port: int = 445) -> dict:
    """Test SMB connectivity by listing the root of the share."""
    log.info("smb:test_connection  %s  share=%s  user=%s  domain=%s",
             host, share, username, domain or "(local)")
    _register(host, username, password, port, domain)
    unc     = f"\\\\{host}\\{share}"
    entries = list(smbclient.scandir(unc))
    log.info("smb:test_connection OK  %s  share=%s  items=%d", host, share, len(entries))
    return {
        "ComputerName": host,
        "Share":        share,
        "RootEntries":  len(entries),
        "Protocol":     "SMB",
    }


def list_directory(host: str, username: str, password: str,
                   path: str, share: str = "C$", domain: str = "",
                   port: int = 445) -> list[dict]:
    """List directory contents via SMB."""
    log.info("smb:list_directory  %s  path=%s", host, path)
    _register(host, username, password, port, domain)
    unc   = _to_unc(host, path)
    items = []
    for entry in smbclient.scandir(unc):
        try:
            s     = entry.stat()
            mtime = datetime.fromtimestamp(s.st_mtime, tz=timezone.utc).isoformat()
            size  = s.st_size if not entry.is_dir() else None
        except Exception:
            mtime, size = "", None
        items.append({
            "Name":      entry.name,
            "Type":      "dir" if entry.is_dir() else "file",
            "SizeBytes": size,
            "Modified":  mtime,
        })
    items.sort(key=lambda x: (0 if x["Type"] == "dir" else 1, x["Name"].lower()))
    log.info("smb:list_directory  %s  path=%s  items=%d", host, path, len(items))
    return items


def download_file(host: str, username: str, password: str,
                  path: str, domain: str = "", port: int = 445) -> bytes:
    """Download a file via SMB and return its raw bytes."""
    log.info("smb:download_file  %s  path=%s", host, path)
    _register(host, username, password, port, domain)
    unc = _to_unc(host, path)
    with smbclient.open_file(unc, mode="rb") as f:
        data = f.read()
    log.info("smb:download_file  %s  path=%s  size=%d bytes", host, path, len(data))
    return data


def read_file(host: str, username: str, password: str,
              path: str, domain: str = "", port: int = 445,
              max_kb: int = 512) -> str:
    """Read a text file via SMB. Truncates at max_kb KB."""
    log.info("smb:read_file  %s  path=%s", host, path)
    _register(host, username, password, port, domain)
    unc = _to_unc(host, path)
    with smbclient.open_file(unc, mode="r", encoding="utf-8", errors="replace") as f:
        content = f.read(max_kb * 1024)
    if len(content) == max_kb * 1024:
        content += f"\n\n[... truncated at {max_kb} KB ...]"
    log.info("smb:read_file  %s  path=%s  len=%d", host, path, len(content))
    return content


def download_csv(remote_path: str, _settings) -> bytes:
    """Adapter for the run pipeline — reads win_* fields from _settings."""
    domain = getattr(_settings, "win_domain", "")
    port   = int(getattr(_settings, "win_port", 445))
    return download_file(
        _settings.win_host, _settings.win_username, _settings.win_password,
        remote_path, domain=domain, port=port,
    )
