"""
VPN tunnel management for Sparky Tool.

Establishes a VPN connection before Windows server access (WinRM/SMB/SSH)
and tears it down afterwards.

Supported types:
  fortinet     — Fortinet FortiGate SSL VPN (openfortivpn)
  openconnect  — Cisco AnyConnect, GlobalProtect, Pulse Secure, F5 BIG-IP
  openvpn      — OpenVPN (config file content stored in vpn_extra)
  wireguard    — WireGuard (wg-quick, config in vpn_extra)
  ssh_tunnel   — SSH SOCKS5 proxy / port forward (no OS VPN driver needed)
  none         — no VPN (pass-through)
"""

import os
import re
import shutil
import signal
import subprocess
import tempfile
import time
from types import SimpleNamespace

from logger import get_logger

log = get_logger("vpn")

CONNECT_TIMEOUT = 45

# ── input validation patterns ─────────────────────────────────────────────────

# Safe hostname/IP: letters, digits, dots, hyphens, optional :port — no leading dash
_SAFE_HOST_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]*(:\d{1,5})?$')

# Safe username: no shell metacharacters or option-prefix dash
_SAFE_USER_RE = re.compile(r'^[A-Za-z0-9@._\-]+$')

# OpenVPN directives that execute shell commands — strict denylist for belt-and-suspenders,
# but the primary defence is the allowlist check below.
_OPENVPN_EXEC_DIRECTIVES = re.compile(
    r'^\s*(script-security|up|down|route-up|route-pre-down|ipchange|'
    r'client-connect|client-disconnect|tls-verify|learn-address|'
    r'auth-user-pass-verify|plugin|setenv\s+PATH)\b',
    re.IGNORECASE | re.MULTILINE,
)

# WireGuard keys that are safe — anything else (PreUp/PostUp/PreDown/PostDown/…) is rejected.
_WG_SAFE_KEYS = frozenset({
    'privatekey', 'address', 'dns', 'mtu', 'listenport', 'table',   # [Interface]
    'publickey', 'presharedkey', 'allowedips', 'endpoint', 'persistentkeepalive',  # [Peer]
})

# SSH -L port-forward: only this exact form is accepted in vpn_extra
_SSH_L_RE = re.compile(r'^\d{1,5}:[A-Za-z0-9._-]+:\d{1,5}$')


def _validate_host(host: str, label: str = "VPN host") -> None:
    if not host or not _SAFE_HOST_RE.match(host):
        raise RuntimeError(
            f"{label} {host!r} contains invalid characters. "
            "Use a plain hostname or IP address (no leading dashes or shell metacharacters)."
        )


def _validate_user(value: str, label: str) -> None:
    if value and not _SAFE_USER_RE.match(value):
        raise RuntimeError(
            f"{label} {value!r} contains invalid characters."
        )


def _validate_openvpn_config(content: str) -> None:
    """Reject any OpenVPN config that contains script-execution directives."""
    match = _OPENVPN_EXEC_DIRECTIVES.search(content)
    if match:
        raise RuntimeError(
            f"OpenVPN config contains a disallowed directive: {match.group().strip()!r}. "
            "Remove script-security, up/down hooks, and plugin lines."
        )


def _validate_wireguard_config(content: str) -> None:
    """
    Parse the WireGuard config and reject any key not in the known-safe allowlist.
    This blocks PreUp/PostUp/PreDown/PostDown and any other execution hooks.
    """
    for lineno, raw in enumerate(content.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith('#') or line.startswith('['):
            continue
        if '=' not in line:
            raise RuntimeError(
                f"WireGuard config line {lineno} has unexpected format: {line!r}"
            )
        key = line.split('=', 1)[0].strip().lower()
        if key not in _WG_SAFE_KEYS:
            raise RuntimeError(
                f"WireGuard config contains disallowed key {line.split('=',1)[0].strip()!r} "
                f"on line {lineno}. Only standard interface and peer keys are permitted "
                "(PreUp/PostUp/PreDown/PostDown are not allowed)."
            )


def _validate_ssh_extra(extra: str) -> list[str]:
    """
    Accept only explicit -L port-forward lines (one per line).
    Returns a flat list of ["-L", "localport:host:remoteport"] pairs.
    Rejects anything else — no free-form SSH flags.
    """
    args = []
    for lineno, raw in enumerate(extra.splitlines(), 1):
        line = raw.strip()
        if not line:
            continue
        # Strip a leading "-L" prefix if the user included it
        if line.startswith('-L'):
            line = line[2:].strip()
        if not _SSH_L_RE.match(line):
            raise RuntimeError(
                f"SSH extra field line {lineno} is not a valid port-forward "
                f"(expected format: localport:host:remoteport, got {line!r}). "
                "Only -L port-forwards are accepted."
            )
        args += ["-L", line]
    return args


# ── public API ────────────────────────────────────────────────────────────────

def vpn_connect(settings: SimpleNamespace):
    """
    Start the VPN for the given config namespace.
    Returns a context object passed to vpn_disconnect(), or None if VPN is disabled.
    Raises RuntimeError on validation failure or connection timeout.
    """
    if not getattr(settings, "vpn_enabled", False):
        return None
    vpn_type = getattr(settings, "vpn_type", "none") or "none"
    if vpn_type == "none":
        return None

    log.info("VPN connect  type=%s  host=%s", vpn_type, getattr(settings, "vpn_host", ""))

    if vpn_type == "fortinet":
        return _connect_fortinet(settings)
    if vpn_type == "openconnect":
        return _connect_openconnect(settings)
    if vpn_type == "openvpn":
        return _connect_openvpn(settings)
    if vpn_type == "wireguard":
        return _connect_wireguard(settings)
    if vpn_type == "ssh_tunnel":
        return _connect_ssh_tunnel(settings)

    raise RuntimeError(f"Unknown VPN type: {vpn_type!r}")


def vpn_disconnect(ctx):
    """Tear down a VPN connection established by vpn_connect()."""
    if ctx is None:
        return
    vpn_type = ctx.get("type")
    log.info("VPN disconnect  type=%s", vpn_type)

    if vpn_type in ("openconnect", "openvpn", "ssh_tunnel"):
        proc = ctx.get("proc")
        if proc and proc.poll() is None:
            try:
                proc.send_signal(signal.SIGTERM)
                proc.wait(timeout=10)
            except Exception as exc:
                log.warning("VPN terminate error: %s", exc)
                try:
                    proc.kill()
                except Exception:
                    pass

    if vpn_type == "wireguard":
        conf = ctx.get("conf_path")
        if conf:
            try:
                subprocess.run(["wg-quick", "down", conf], timeout=15, check=False)
            except Exception as exc:
                log.warning("WireGuard down failed: %s", exc)

    for path in ctx.get("temp_files", []):
        try:
            os.unlink(path)
        except Exception:
            pass


def vpn_test(settings: SimpleNamespace) -> dict:
    """Connect then immediately disconnect. Returns {"ok": True} or {"ok": False, "error": …}."""
    ctx = None
    try:
        ctx = vpn_connect(settings)
        return {"ok": True}
    except RuntimeError as exc:
        return {"ok": False, "error": str(exc)}
    finally:
        try:
            vpn_disconnect(ctx)
        except Exception:
            pass


# ── fortinet (openfortivpn) ───────────────────────────────────────────────────

# Trusted-cert fingerprint: 64 hex chars (SHA-256), optionally colon-separated
_CERT_FP_RE = re.compile(r'^[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){31}$|^[0-9a-fA-F]{64}$')


def _connect_fortinet(s: SimpleNamespace):
    if not shutil.which("openfortivpn"):
        raise RuntimeError(
            "openfortivpn is not installed. Install with: apt-get install -y openfortivpn"
        )

    host     = s.vpn_host.strip()
    port     = getattr(s, "vpn_port", None) or 443
    username = getattr(s, "vpn_username", "").strip()
    password = getattr(s, "vpn_password", "").strip()
    # vpn_extra holds the trusted certificate fingerprint (SHA-256).
    # Enterprise FortiGate gateways almost always require this.
    trusted_cert = getattr(s, "vpn_extra", "").strip()

    _validate_host(host, "FortiGate gateway")
    _validate_user(username, "VPN username")

    if trusted_cert and not _CERT_FP_RE.match(trusted_cert):
        raise RuntimeError(
            "Trusted certificate fingerprint must be a 64-char hex string "
            "(SHA-256), e.g. ab12cd34… or ab:12:cd:34:…"
        )

    # openfortivpn gateway:port -u user --password=pass [--trusted-cert=fp]
    cmd = [
        "openfortivpn",
        f"{host}:{port}",
        f"--username={username}",
        "--password-from-stdin",
    ]
    if trusted_cert:
        # Normalise to colon-separated form that openfortivpn expects
        fp = trusted_cert.replace(":", "")
        fp_colon = ":".join(fp[i:i+2] for i in range(0, len(fp), 2))
        cmd.append(f"--trusted-cert={fp_colon}")

    log.debug("openfortivpn  host=%s:%s  user=%s  cert=%s",
              host, port, username, "yes" if trusted_cert else "no")

    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    if password:
        try:
            proc.stdin.write((password + "\n").encode())
            proc.stdin.flush()
        except Exception:
            pass

    _wait_for_vpn_output(proc, timeout=CONNECT_TIMEOUT, keyword="Tunnel is up and running")
    return {"type": "fortinet", "proc": proc, "temp_files": []}


# ── openconnect ───────────────────────────────────────────────────────────────

def _connect_openconnect(s: SimpleNamespace):
    if not shutil.which("openconnect"):
        raise RuntimeError(
            "openconnect is not installed. Install with: apt-get install -y openconnect"
        )

    host     = s.vpn_host.strip()
    username = getattr(s, "vpn_username", "").strip()
    password = getattr(s, "vpn_password", "").strip()
    group    = getattr(s, "vpn_extra", "").strip()   # authgroup / realm
    port     = getattr(s, "vpn_port", None)

    # Validate all user-supplied values before they reach subprocess
    _validate_host(host, "VPN gateway")
    _validate_user(username, "VPN username")
    _validate_user(group, "VPN group/realm")

    if port:
        host = f"{host}:{port}"

    cmd = ["openconnect", "--non-interactive", "--no-dtls"]
    if username:
        cmd.append(f"--user={username}")
    if group:
        cmd.append(f"--authgroup={group}")
    # Insert -- to prevent host from being parsed as an option flag
    cmd += ["--", host]

    log.debug("openconnect  host=%s  user=%s  group=%s", host, username, group)
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    if password:
        try:
            proc.stdin.write((password + "\n").encode())
            proc.stdin.flush()
        except Exception:
            pass

    _wait_for_vpn_output(proc, timeout=CONNECT_TIMEOUT)
    return {"type": "openconnect", "proc": proc, "temp_files": []}


# ── openvpn ───────────────────────────────────────────────────────────────────

def _connect_openvpn(s: SimpleNamespace):
    if not shutil.which("openvpn"):
        raise RuntimeError(
            "openvpn is not installed. Install with: apt-get install -y openvpn"
        )

    config   = getattr(s, "vpn_extra", "").strip()
    username = getattr(s, "vpn_username", "").strip()
    password = getattr(s, "vpn_password", "").strip()
    temp_files = []

    if not config:
        host = s.vpn_host.strip()
        port = getattr(s, "vpn_port", None) or 1194
        _validate_host(host, "OpenVPN remote host")
        config = f"client\ndev tun\nproto udp\nremote {host} {port}\nresolv-retry infinite\nnobind\npersist-key\npersist-tun\n"

    # Block shell-execution directives before writing to disk
    _validate_openvpn_config(config)

    fd, conf_path = tempfile.mkstemp(suffix=".ovpn")
    os.close(fd)
    os.chmod(conf_path, 0o600)
    with open(conf_path, "w") as fh:
        fh.write(config)
    temp_files.append(conf_path)

    # --script-security 0 ensures no up/down scripts run even if config slips through
    cmd = ["openvpn", "--config", conf_path, "--auth-nocache", "--script-security", "0"]

    if username and password:
        fd2, creds_path = tempfile.mkstemp()
        os.close(fd2)
        os.chmod(creds_path, 0o600)
        with open(creds_path, "w") as fh:
            fh.write(f"{username}\n{password}\n")
        cmd += ["--auth-user-pass", creds_path]
        temp_files.append(creds_path)

    log.debug("openvpn  conf=%s", conf_path)
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    _wait_for_vpn_output(proc, timeout=CONNECT_TIMEOUT, keyword="Initialization Sequence Completed")
    return {"type": "openvpn", "proc": proc, "temp_files": temp_files}


# ── wireguard ─────────────────────────────────────────────────────────────────

def _connect_wireguard(s: SimpleNamespace):
    if not shutil.which("wg-quick"):
        raise RuntimeError(
            "wg-quick is not installed. Install with: apt-get install -y wireguard-tools"
        )

    conf_content = getattr(s, "vpn_extra", "").strip()
    if not conf_content:
        raise RuntimeError("WireGuard requires a configuration (paste your wg0.conf in the Extra field).")

    # Block PreUp/PostUp/PreDown/PostDown and any unknown keys before writing to disk
    _validate_wireguard_config(conf_content)

    fd, conf_path = tempfile.mkstemp(suffix=".conf")
    os.close(fd)
    os.chmod(conf_path, 0o600)
    with open(conf_path, "w") as fh:
        fh.write(conf_content)

    result = subprocess.run(["wg-quick", "up", conf_path], capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        os.unlink(conf_path)
        raise RuntimeError(f"WireGuard failed: {result.stderr.strip() or result.stdout.strip()}")

    log.info("WireGuard up  conf=%s", conf_path)
    return {"type": "wireguard", "conf_path": conf_path, "temp_files": [conf_path]}


# ── ssh tunnel ────────────────────────────────────────────────────────────────

def _connect_ssh_tunnel(s: SimpleNamespace):
    if not shutil.which("ssh"):
        raise RuntimeError("ssh client not found on the server.")

    host     = s.vpn_host.strip()
    port     = getattr(s, "vpn_port", None) or 22
    username = getattr(s, "vpn_username", "").strip()
    extra    = getattr(s, "vpn_extra", "").strip()

    _validate_host(host, "SSH jump host")
    _validate_user(username, "SSH username")

    # Always create a SOCKS5 proxy on localhost:1080
    cmd = [
        "ssh", "-N",
        "-o", "StrictHostKeyChecking=no",
        "-o", "BatchMode=yes",
        "-D", "1080",
        "-p", str(int(port)),
    ]

    # Only accept -L port-forward lines from vpn_extra — nothing else
    if extra:
        cmd += _validate_ssh_extra(extra)

    # Insert -- to prevent host from being interpreted as an SSH option
    target = f"{username}@{host}" if username else host
    cmd += ["--", target]

    log.debug("ssh tunnel  host=%s  port=%d  user=%s", host, port, username)
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(3)
    if proc.poll() is not None:
        out = proc.stdout.read().decode(errors="replace")[:400]
        raise RuntimeError(f"SSH tunnel exited immediately: {out}")

    log.info("SSH tunnel established  socks5=localhost:1080")
    return {"type": "ssh_tunnel", "proc": proc, "temp_files": []}


# ── helpers ───────────────────────────────────────────────────────────────────

def _wait_for_vpn_output(proc, timeout=CONNECT_TIMEOUT, keyword=None):
    """Poll stdout for a success keyword; fall back to liveness check on timeout."""
    if keyword is None:
        keyword = "Connected as"

    deadline = time.time() + timeout
    buf = ""

    while time.time() < deadline:
        if proc.poll() is not None:
            out = buf + (proc.stdout.read().decode(errors="replace") if proc.stdout else "")
            raise RuntimeError(f"VPN process exited unexpectedly. Output: {out[:500]}")

        line = _readline_nonblocking(proc)
        if line:
            buf += line
            log.debug("VPN: %s", line.rstrip())
            if keyword.lower() in line.lower():
                log.info("VPN connected  keyword=%r", keyword)
                return

        time.sleep(0.5)

    if proc.poll() is None:
        log.warning("VPN connect timed out waiting for %r — process alive, proceeding", keyword)
        return

    raise RuntimeError(f"VPN did not connect within {timeout}s. Last output: {buf[-400:]}")


def _readline_nonblocking(proc):
    import select
    if proc.stdout and select.select([proc.stdout], [], [], 0.1)[0]:
        return proc.stdout.readline().decode(errors="replace")
    return ""
