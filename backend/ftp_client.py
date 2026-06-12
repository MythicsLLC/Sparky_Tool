"""
ftp_client.py — FTP / FTPS file retrieval using stdlib ftplib.

Supports plain FTP (port 21) and explicit FTPS (AUTH TLS on port 21).
Passive mode is the default for NAT/firewall compatibility.

Directory listing strategy (most → least capable):
  1. MLSD  — RFC 3659, structured facts, best metadata
  2. LIST  — Unix/IIS parseable output, distinguishes dirs from files
  3. NLST  — names only, last resort (all items reported as 'file')
"""
from __future__ import annotations
import ftplib
import io
import re
from logger import get_logger

log = get_logger("ftp_client")


def _connect(host: str, port: int, username: str, password: str,
             tls: bool, passive: bool) -> ftplib.FTP:
    """Open and authenticate an FTP(S) connection. Caller must call ftp.quit()."""
    if not username:
        raise ValueError(
            "FTP username is not configured — set FTP credentials in Settings (Section 04)."
        )
    ftp: ftplib.FTP = ftplib.FTP_TLS() if tls else ftplib.FTP()
    ftp.connect(host, port, timeout=15)
    ftp.login(username, password or "")
    if tls:
        ftp.prot_p()   # encrypt data channel — must come after login()
    ftp.set_pasv(passive)
    log.info("ftp:connect  %s:%d  user=%s  tls=%s  passive=%s",
             host, port, username or "anonymous", tls, passive)
    return ftp


# ── LIST output parsers ───────────────────────────────────────────────────────

# Unix:  drwxr-xr-x  2 user group  4096 Jan  1 12:00 dirname
_UNIX_RE = re.compile(
    r'^([dl-])\S+\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\w+\s+[\d ]\d\s+[\d:]+\s+(.+)$'
)
# Windows/IIS:  01-01-2024  12:00AM       <DIR>          dirname
#           or  01-01-2024  12:00AM                 1234 filename.txt
_WIN_RE = re.compile(
    r'^\d{2}-\d{2}-\d{2,4}\s+\d{2}:\d{2}(?:AM|PM)\s+(<DIR>|\d+)\s+(.+)$'
)


def _parse_list_line(line: str) -> dict | None:
    line = line.strip()
    if not line:
        return None

    m = _UNIX_RE.match(line)
    if m:
        type_char, size_str, name = m.groups()
        name = name.split(' -> ')[0].strip()   # strip symlink target
        if name in ('.', '..'):
            return None
        item_type = 'dir' if type_char == 'd' else 'file'
        return {'name': name, 'type': item_type,
                'size': int(size_str) if item_type == 'file' else None, 'modified': None}

    m = _WIN_RE.match(line)
    if m:
        size_or_dir, name = m.groups()
        name = name.strip()
        if name in ('.', '..'):
            return None
        item_type = 'dir' if size_or_dir == '<DIR>' else 'file'
        return {'name': name, 'type': item_type,
                'size': int(size_or_dir) if item_type == 'file' else None, 'modified': None}

    return None


# ── Public API ────────────────────────────────────────────────────────────────

def download_csv(remote_path: str | None = None, _settings=None) -> bytes:
    """Download a remote file and return raw bytes. Called by the run engine."""
    host     = _settings.ftp_host
    port     = _settings.ftp_port or 21
    username = _settings.ftp_username
    password = _settings.ftp_password   # decrypted by _config_to_ns in main.py
    tls      = getattr(_settings, "ftp_connection_type", "ftp") == "ftps"
    passive  = getattr(_settings, "ftp_passive", True)
    path     = remote_path or _settings.ftp_remote_path

    log.info("ftp:download_csv  %s:%d  path=%s  tls=%s", host, port, path, tls)
    ftp = _connect(host, port, username, password, tls, passive)
    try:
        buf = io.BytesIO()
        ftp.retrbinary(f"RETR {path}", buf.write)
        buf.seek(0)
        data = buf.read()
        log.info("ftp:download_csv OK  %d bytes", len(data))
        return data
    finally:
        ftp.quit()


def test_connection(host: str, port: int, username: str, password: str,
                    tls: bool = False, passive: bool = True) -> dict:
    """Test FTP connectivity. Returns ComputerName, Protocol, Welcome."""
    ftp = _connect(host, port, username, password, tls, passive)
    try:
        welcome = ftp.getwelcome()
        return {
            "ComputerName": host,
            "Protocol": "FTPS (Explicit TLS)" if tls else "FTP",
            "Welcome": welcome,
        }
    finally:
        ftp.quit()


def list_directory(host: str, port: int, username: str, password: str,
                   path: str, tls: bool = False, passive: bool = True) -> list[dict]:
    """List a directory. Returns [{name, type, size, modified}].

    Tries MLSD → LIST → NLST in order of decreasing capability.
    Only NLST loses directory type information.
    """
    ftp = _connect(host, port, username, password, tls, passive)
    try:
        # ── Strategy 1: MLSD (RFC 3659) ──────────────────────────────────────
        try:
            items: list[dict] = []
            for name, facts in ftp.mlsd(path):
                if name in (".", ".."):
                    continue
                item_type = "dir" if facts.get("type") in ("dir", "cdir", "pdir") else "file"
                size = int(facts["size"]) if facts.get("size") else None
                raw_mod = facts.get("modify", "")
                modified = None
                if raw_mod and len(raw_mod) >= 14:
                    m = raw_mod
                    modified = f"{m[:4]}-{m[4:6]}-{m[6:8]}T{m[8:10]}:{m[10:12]}:{m[12:14]}"
                items.append({"name": name, "type": item_type, "size": size, "modified": modified})
            log.info("ftp:list_directory MLSD  path=%s  items=%d", path, len(items))
            return items
        except (ftplib.error_perm, ftplib.error_reply):
            pass

        # ── Strategy 2: LIST (Unix/IIS parseable) ────────────────────────────
        try:
            lines: list[str] = []
            ftp.retrlines(f"LIST {path}", lines.append)
            items = [r for line in lines if (r := _parse_list_line(line)) is not None]
            if items:
                log.info("ftp:list_directory LIST  path=%s  items=%d", path, len(items))
                return items
        except (ftplib.error_perm, ftplib.error_reply):
            pass

        # ── Strategy 3: NLST (names only, all reported as 'file') ────────────
        items = []
        for entry in ftp.nlst(path):
            bare = entry.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
            if bare not in (".", "..") and bare:
                items.append({"name": bare, "type": "file", "size": None, "modified": None})
        log.info("ftp:list_directory NLST  path=%s  items=%d", path, len(items))
        return items

    finally:
        ftp.quit()


def read_file(host: str, port: int, username: str, password: str,
              path: str, tls: bool = False, passive: bool = True,
              max_kb: int = 256) -> str:
    """Download the first max_kb KB of a file and return it as UTF-8 text."""
    ftp = _connect(host, port, username, password, tls, passive)
    try:
        buf = io.BytesIO()
        ftp.retrbinary(f"RETR {path}", buf.write, blocksize=8192)
        buf.seek(0)
        data = buf.read(max_kb * 1024)
        log.info("ftp:read_file  path=%s  bytes_read=%d", path, len(data))
        return data.decode("utf-8", errors="replace")
    finally:
        ftp.quit()
