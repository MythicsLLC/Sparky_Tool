"""
WinRM-based Windows Server client.

Supports four authentication transports:
  ntlm      — NTLM (default). Works for local/domain accounts. Requires the
              account to be in Administrators or Remote Management Users.
  basic     — HTTP Basic auth. Simplest, but requires the server to have
              AllowUnencrypted=true: run on the server:
                winrm set winrm/config/service/auth @{Basic="true"}
                winrm set winrm/config/service @{AllowUnencrypted="true"}
  negotiate — Tries Kerberos first then falls back to NTLM.  Best choice for
              domain-joined machines.
  kerberos  — Kerberos-only (domain accounts; needs krb5 libs installed).

Port 5985 = HTTP (default), 5986 = HTTPS.
"""

from __future__ import annotations
import base64
import json

from winrm.protocol import Protocol
from logger import get_logger

log = get_logger("windows_client")

# Auth types that cannot use WS-Man message encryption over plain HTTP
_NO_ENCRYPT_TRANSPORTS = {"basic", "certificate", "plaintext"}


def _protocol(host: str, username: str, password: str,
              port: int = 5985, use_ssl: bool = False,
              auth_type: str = "ntlm") -> Protocol:
    """
    Build a winrm.Protocol instance with an explicit, unambiguous endpoint URL.

    Using Protocol directly (rather than winrm.Session) ensures the scheme we
    construct is used verbatim — Session._build_url() re-derives the scheme
    from the transport type in some pywinrm versions, which can accidentally
    switch http:// to https://.
    """
    port = int(port)   # guard against string values arriving from Pydantic

    # Derive scheme from the well-known WinRM ports; only fall back to use_ssl
    # for non-standard port numbers.
    if port == 5985:
        scheme = "http"
    elif port == 5986:
        scheme = "https"
    else:
        scheme = "https" if use_ssl else "http"

    endpoint = f"{scheme}://{host}:{port}/wsman"
    log.info("win:protocol  endpoint=%s  transport=%s  user=%s", endpoint, auth_type, username)

    kw: dict = dict(
        endpoint=endpoint,
        transport=auth_type,
        username=username,
        password=password,
        server_cert_validation="ignore",   # accept self-signed certs on HTTPS
    )
    # Basic / plain-text transports cannot use WS-Man message encryption; tell
    # pywinrm not to attempt it so it doesn't refuse to send over plain HTTP.
    if scheme == "http" and auth_type in _NO_ENCRYPT_TRANSPORTS:
        kw["message_encryption"] = "never"

    return Protocol(**kw)


def _run_ps(proto: Protocol, ps_script: str) -> str:
    """
    Execute a PowerShell script via an open WinRM Protocol and return stdout.

    Encodes the script as UTF-16-LE base64 (same as Session.run_ps) and passes
    it via -EncodedCommand so special characters in the script are safe.
    """
    encoded = base64.b64encode(ps_script.encode("utf_16_le")).decode("ascii")
    shell_id = proto.open_shell()
    try:
        cmd_id = proto.run_command(shell_id, "powershell",
                                   [f"-encodedcommand {encoded}"])
        try:
            stdout, stderr, rc = proto.get_command_output(shell_id, cmd_id)
        finally:
            proto.cleanup_command(shell_id, cmd_id)
    finally:
        proto.close_shell(shell_id)

    if rc != 0:
        err = stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(err or "WinRM command returned non-zero exit code")
    return stdout.decode("utf-8", errors="replace")


# ── Public API ────────────────────────────────────────────────────────────────

def test_connection(host: str, username: str, password: str,
                    port: int = 5985, use_ssl: bool = False,
                    auth_type: str = "ntlm") -> dict:
    """
    Verify WinRM connectivity and authentication.
    Returns computer name, OS caption, PowerShell version, and logged-in username.
    """
    log.info("win:test_connection  %s:%d  user=%s  auth=%s", host, port, username, auth_type)
    p = _protocol(host, username, password, port, use_ssl, auth_type)
    out = _run_ps(p, """
$info = [PSCustomObject]@{
    ComputerName = $env:COMPUTERNAME
    OSVersion    = (Get-WmiObject Win32_OperatingSystem).Caption
    PSVersion    = "$($PSVersionTable.PSVersion.Major).$($PSVersionTable.PSVersion.Minor)"
    Username     = $env:USERNAME
}
ConvertTo-Json $info -Compress
""")
    data = json.loads(out.strip())
    log.info("win:test_connection OK  host=%s  computer=%s  os=%s",
             host, data.get("ComputerName"), data.get("OSVersion"))
    return data


def list_directory(host: str, username: str, password: str,
                   path: str,
                   port: int = 5985, use_ssl: bool = False,
                   auth_type: str = "ntlm") -> list[dict]:
    """
    List the contents of `path` on the remote Windows host.
    Returns a list of dicts: name, type ('dir'|'file'), size_bytes, modified.
    """
    log.info("win:list_directory  %s  path=%s  auth=%s", host, path, auth_type)
    safe_path = path.replace("'", "''")
    ps_cmd = f"""
try {{
    $items = Get-ChildItem -Path '{safe_path}' -Force -ErrorAction Stop |
        Sort-Object @{{Expression={{$_.PSIsContainer}};Descending=$true}}, Name |
        Select-Object Name,
            @{{Name='Type';Expression={{if($_.PSIsContainer){{'dir'}}else{{'file'}}}}}},
            @{{Name='SizeBytes';Expression={{if($_.PSIsContainer){{$null}}else{{$_.Length}}}}}},
            @{{Name='Modified';Expression={{$_.LastWriteTime.ToString('o')}}}}
    if ($items) {{
        ConvertTo-Json @($items) -Compress
    }} else {{
        '[]'
    }}
}} catch {{
    Write-Error $_.Exception.Message
    exit 1
}}
"""
    p = _protocol(host, username, password, port, use_ssl, auth_type)
    out = _run_ps(p, ps_cmd).strip()
    if not out:
        return []
    data = json.loads(out)
    if isinstance(data, dict):   # PowerShell returns a plain object for 1-item dirs
        data = [data]
    log.info("win:list_directory  %s  path=%s  items=%d", host, path, len(data))
    return data


def download_csv(remote_path: str, _settings) -> bytes:
    """
    Download any file from a Windows host via WinRM and return raw bytes.

    Uses base64 to safely transfer binary/non-UTF-8 content through
    PowerShell's text-only stdout without byte corruption.
    """
    safe_path = remote_path.replace("'", "''")
    ps_cmd = f"""
try {{
    $bytes = [System.IO.File]::ReadAllBytes('{safe_path}')
    [Convert]::ToBase64String($bytes)
}} catch {{
    Write-Error $_.Exception.Message
    exit 1
}}
"""
    auth = getattr(_settings, "win_auth_type", "ntlm")
    log.info("win:download_csv  %s  path=%s  auth=%s", _settings.win_host, remote_path, auth)
    p = _protocol(
        _settings.win_host, _settings.win_username, _settings.win_password,
        _settings.win_port, _settings.win_use_ssl, auth,
    )
    b64 = _run_ps(p, ps_cmd).strip()
    data = base64.b64decode(b64)
    log.info("win:download_csv  %s  path=%s  size=%d bytes",
             _settings.win_host, remote_path, len(data))
    return data


def read_file(host: str, username: str, password: str,
              path: str,
              port: int = 5985, use_ssl: bool = False,
              auth_type: str = "ntlm",
              max_kb: int = 512) -> str:
    """
    Read a text file on the remote Windows host.
    Truncates at `max_kb` KB to avoid transferring huge files.
    """
    log.info("win:read_file  %s  path=%s  auth=%s", host, path, auth_type)
    safe_path = path.replace("'", "''")
    max_chars = max_kb * 1024
    ps_cmd = f"""
try {{
    $raw = Get-Content -Path '{safe_path}' -Raw -Encoding UTF8 -ErrorAction Stop
    if ($raw -eq $null) {{ $raw = '' }}
    if ($raw.Length -gt {max_chars}) {{
        $raw.Substring(0, {max_chars}) + "`n`n[... truncated at {max_kb} KB ...]"
    }} else {{
        $raw
    }}
}} catch {{
    Write-Error $_.Exception.Message
    exit 1
}}
"""
    p = _protocol(host, username, password, port, use_ssl, auth_type)
    content = _run_ps(p, ps_cmd)
    log.info("win:read_file  %s  path=%s  len=%d", host, path, len(content))
    return content
