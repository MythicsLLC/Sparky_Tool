"""
VPN tunnel management for Sparky Tool.

Establishes a VPN connection before Windows server access (WinRM/SMB/SSH)
and tears it down afterwards.

Supported types:
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

# How long to wait (seconds) for VPN to establish a route.
CONNECT_TIMEOUT = 45


# ── public API ────────────────────────────────────────────────────────────────

def vpn_connect(settings: SimpleNamespace):
    """
    Start the VPN for the given config namespace.

    Returns a context object passed to vpn_disconnect().
    Returns None if vpn_type is 'none' or vpn_enabled is False.

    Raises RuntimeError if the VPN fails to connect within CONNECT_TIMEOUT.
    """
    if not getattr(settings, "vpn_enabled", False):
        return None
    vpn_type = getattr(settings, "vpn_type", "none") or "none"
    if vpn_type == "none":
        return None

    log.info("VPN connect  type=%s  host=%s", vpn_type, getattr(settings, "vpn_host", ""))

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

    if vpn_type in ("openconnect", "openvpn"):
        proc = ctx.get("proc")
        if proc and proc.poll() is None:
            try:
                proc.send_signal(signal.SIGTERM)
                proc.wait(timeout=10)
            except Exception as exc:
                log.warning("VPN disconnect error: %s", exc)
                try:
                    proc.kill()
                except Exception:
                    pass

    if vpn_type == "wireguard":
        iface = ctx.get("iface", "wg-sparky")
        conf  = ctx.get("conf_path")
        try:
            subprocess.run(["wg-quick", "down", conf or iface], timeout=15, check=False)
        except Exception as exc:
            log.warning("WireGuard down failed: %s", exc)

    if vpn_type == "ssh_tunnel":
        proc = ctx.get("proc")
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                pass

    # Clean up temp files
    for path in ctx.get("temp_files", []):
        try:
            os.unlink(path)
        except Exception:
            pass


# ── test helper ───────────────────────────────────────────────────────────────

def vpn_test(settings: SimpleNamespace) -> dict:
    """
    Try to connect the VPN and immediately disconnect.
    Returns {"ok": True} or {"ok": False, "error": "..."}.
    """
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


# ── openconnect (Cisco AnyConnect / GlobalProtect / Pulse) ───────────────────

def _connect_openconnect(s: SimpleNamespace):
    if not shutil.which("openconnect"):
        raise RuntimeError(
            "openconnect is not installed on the server. "
            "Install it with: apt-get install -y openconnect"
        )

    host     = s.vpn_host.strip()
    username = getattr(s, "vpn_username", "").strip()
    password = getattr(s, "vpn_password", "").strip()
    extra    = getattr(s, "vpn_extra", "").strip()   # group / authgroup / realm
    port     = getattr(s, "vpn_port", None)

    if port:
        host = f"{host}:{port}"

    cmd = ["openconnect", "--non-interactive", "--no-dtls", f"--user={username}"]
    if extra:
        cmd += [f"--authgroup={extra}"]
    cmd.append(host)

    # Feed password via stdin
    log.debug("openconnect cmd: %s", " ".join(cmd))
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

    _wait_for_vpn_route(proc, timeout=CONNECT_TIMEOUT)
    return {"type": "openconnect", "proc": proc, "temp_files": []}


# ── openvpn ───────────────────────────────────────────────────────────────────

def _connect_openvpn(s: SimpleNamespace):
    if not shutil.which("openvpn"):
        raise RuntimeError(
            "openvpn is not installed on the server. "
            "Install it with: apt-get install -y openvpn"
        )

    extra    = getattr(s, "vpn_extra", "").strip()   # .ovpn config file content
    username = getattr(s, "vpn_username", "").strip()
    password = getattr(s, "vpn_password", "").strip()
    temp_files = []

    if not extra:
        # Build a minimal config from host/port/user fields
        host = s.vpn_host.strip()
        port = getattr(s, "vpn_port", None) or 1194
        extra = f"client\ndev tun\nproto udp\nremote {host} {port}\nresolv-retry infinite\nnobind\npersist-key\npersist-tun\n"

    # Write config to temp file
    fd, conf_path = tempfile.mkstemp(suffix=".ovpn")
    os.close(fd)
    with open(conf_path, "w") as fh:
        fh.write(extra)
    temp_files.append(conf_path)

    cmd = ["openvpn", "--config", conf_path, "--auth-nocache"]

    if username and password:
        fd2, creds_path = tempfile.mkstemp()
        os.close(fd2)
        with open(creds_path, "w") as fh:
            fh.write(f"{username}\n{password}\n")
        cmd += ["--auth-user-pass", creds_path]
        temp_files.append(creds_path)

    log.debug("openvpn cmd: %s", " ".join(cmd))
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    _wait_for_vpn_route(proc, timeout=CONNECT_TIMEOUT, keyword="Initialization Sequence Completed")
    return {"type": "openvpn", "proc": proc, "temp_files": temp_files}


# ── wireguard ─────────────────────────────────────────────────────────────────

def _connect_wireguard(s: SimpleNamespace):
    if not shutil.which("wg-quick"):
        raise RuntimeError(
            "wg-quick is not installed. Install WireGuard: apt-get install -y wireguard"
        )

    conf_content = getattr(s, "vpn_extra", "").strip()
    if not conf_content:
        raise RuntimeError("WireGuard requires a configuration (paste your wg0.conf in the Extra field).")

    fd, conf_path = tempfile.mkstemp(suffix=".conf")
    os.close(fd)
    with open(conf_path, "w") as fh:
        fh.write(conf_content)
    os.chmod(conf_path, 0o600)

    result = subprocess.run(["wg-quick", "up", conf_path], capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        os.unlink(conf_path)
        raise RuntimeError(f"WireGuard failed: {result.stderr.strip() or result.stdout.strip()}")

    log.info("WireGuard up  conf=%s", conf_path)
    return {"type": "wireguard", "conf_path": conf_path, "temp_files": [conf_path]}


# ── ssh tunnel (SOCKS5 proxy / local port forward) ────────────────────────────

def _connect_ssh_tunnel(s: SimpleNamespace):
    if not shutil.which("ssh"):
        raise RuntimeError("ssh client not found on the server.")

    host     = s.vpn_host.strip()
    port     = getattr(s, "vpn_port", None) or 22
    username = getattr(s, "vpn_username", "").strip()
    extra    = getattr(s, "vpn_extra", "").strip()   # e.g. "-L 5985:win-host:5985"

    # Build the SSH command — create a SOCKS5 proxy on localhost:1080 by default
    local_socks = "1080"
    cmd = [
        "ssh", "-N", "-o", "StrictHostKeyChecking=no",
        "-D", local_socks,
        "-p", str(port),
    ]
    # Allow extra port-forward args from the Extra field
    if extra:
        cmd += extra.split()
    cmd.append(f"{username}@{host}" if username else host)

    log.debug("ssh tunnel cmd: %s", " ".join(cmd))
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(3)   # SSH doesn't print "connected" — brief wait is sufficient
    if proc.poll() is not None:
        out = proc.stdout.read().decode(errors="replace")[:400]
        raise RuntimeError(f"SSH tunnel exited immediately: {out}")

    log.info("SSH tunnel established  socks5=localhost:%s", local_socks)
    return {"type": "ssh_tunnel", "proc": proc, "temp_files": []}


# ── helper ────────────────────────────────────────────────────────────────────

def _wait_for_vpn_route(proc, timeout=CONNECT_TIMEOUT, keyword=None):
    """
    Poll subprocess stdout for a success keyword, or fall back to checking
    that the process is still alive after CONNECT_TIMEOUT.
    """
    deadline = time.time() + timeout
    buf = ""

    # Default success keyword for openconnect
    if keyword is None:
        keyword = "Connected as"

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

    # Timeout — if process is still alive, assume connection is OK (some
    # VPN clients don't print a clear "connected" message)
    if proc.poll() is None:
        log.warning("VPN connect timed out waiting for keyword — process alive, proceeding")
        return

    raise RuntimeError(f"VPN did not connect within {timeout}s. Last output: {buf[-400:]}")


def _readline_nonblocking(proc):
    """Read a line from stdout without blocking if nothing is available."""
    import select
    if proc.stdout and select.select([proc.stdout], [], [], 0.1)[0]:
        return proc.stdout.readline().decode(errors="replace")
    return ""
