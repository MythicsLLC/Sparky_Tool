"""Email (SMTP) and webhook notifications fired after run completion."""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from logger import get_logger

log = get_logger("notifier")


def _smtp_cfg():
    from config import get_settings
    s = get_settings()
    return {
        "host":    getattr(s, "smtp_host",     ""),
        "port":    getattr(s, "smtp_port",     587),
        "user":    getattr(s, "smtp_user",     ""),
        "passwd":  getattr(s, "smtp_password", ""),
        "sender":  getattr(s, "smtp_from",     ""),
        "use_tls": getattr(s, "smtp_use_tls",  True),
    }


def _send_email(to: str, subject: str, body_html: str) -> None:
    cfg = _smtp_cfg()
    if not cfg["host"] or not cfg["sender"]:
        log.debug("SMTP not configured — skipping email to %s", to)
        return
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = cfg["sender"]
    msg["To"]      = to
    msg.attach(MIMEText(body_html, "html"))
    try:
        if cfg["use_tls"]:
            server = smtplib.SMTP(cfg["host"], cfg["port"])
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(cfg["host"], cfg["port"])
        if cfg["user"]:
            server.login(cfg["user"], cfg["passwd"])
        server.sendmail(cfg["sender"], [to], msg.as_string())
        server.quit()
        log.info("Email sent  to=%s  subject=%r", to, subject)
    except Exception as exc:
        log.warning("Email send failed  to=%s  error=%s", to, exc)


def _send_webhook(url: str, payload: dict) -> None:
    if not url:
        return
    try:
        import httpx
        httpx.post(url, json=payload, timeout=10).raise_for_status()
        log.info("Webhook OK  url=%s", url[:60])
    except Exception as exc:
        log.warning("Webhook failed  url=%s  error=%s", url[:60], exc)


def _email_body(config_name: str, results: list, total_rows: int, run_status: str) -> str:
    color = "#2e7d32" if run_status == "success" else "#c62828"
    rows_html = "".join(
        f"<tr>"
        f"<td style='padding:6px 12px;border-bottom:1px solid #eee'>{r.get('engine_name','')}</td>"
        f"<td style='padding:6px 12px;border-bottom:1px solid #eee'>"
        f"{'✅ OK' if r.get('status') != 'error' else '❌ Error'}</td>"
        f"<td style='padding:6px 12px;border-bottom:1px solid #eee'>{r.get('row_count', 0):,}</td>"
        f"<td style='padding:6px 12px;border-bottom:1px solid #eee'>{r.get('error', '') or '—'}</td>"
        f"</tr>"
        for r in results
    )
    return f"""
<html><body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto">
<h2 style="color:{color}">Sparky Tool — {config_name}</h2>
<p>Run <strong>{run_status}</strong>. {total_rows:,} total rows extracted.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
<thead><tr style="background:#f5f5f5;text-align:left">
  <th style="padding:8px 12px">Engine</th>
  <th style="padding:8px 12px">Status</th>
  <th style="padding:8px 12px">Rows</th>
  <th style="padding:8px 12px">Error</th>
</tr></thead>
<tbody>{rows_html}</tbody>
</table>
<p style="margin-top:24px;color:#888;font-size:12px">Sent by Sparky Tool.</p>
</body></html>"""


def notify_run_complete(*, db, user_id: str, config_name: str, run_results: list) -> None:
    """Dispatch email + webhooks after all engines finish. Always non-fatal."""
    try:
        from models import NotificationSetting, User

        ns = db.query(NotificationSetting).filter(NotificationSetting.user_id == user_id).first()
        if not ns:
            return

        has_error  = any(r.get("status") == "error" for r in run_results)
        run_status = "error" if has_error else "success"

        if run_status == "success" and not ns.notify_on_success:
            return
        if run_status == "error" and not ns.notify_on_failure:
            return

        user      = db.query(User).filter(User.id == user_id).first()
        recipient = ns.email_address or (user.email if user else "")
        total     = sum(r.get("row_count", 0) for r in run_results)
        icon      = "✅" if run_status == "success" else "❌"
        subject   = f"{icon} Sparky Tool — {config_name} run {run_status}"

        if ns.email_enabled and recipient:
            _send_email(recipient, subject, _email_body(config_name, run_results, total, run_status))

        engines = [r.get("engine_name", "") for r in run_results]

        if ns.slack_webhook_url:
            _send_webhook(ns.slack_webhook_url, {
                "text": f"{icon} *{config_name}* run {run_status}  |  {total:,} rows",
                "attachments": [{
                    "color": "good" if run_status == "success" else "danger",
                    "fields": [
                        {"title": "Config",   "value": config_name,        "short": True},
                        {"title": "Status",   "value": run_status.upper(), "short": True},
                        {"title": "Engines",  "value": ", ".join(engines), "short": True},
                        {"title": "Rows",     "value": f"{total:,}",       "short": True},
                    ],
                }],
            })

        if ns.teams_webhook_url:
            _send_webhook(ns.teams_webhook_url, {
                "@type": "MessageCard",
                "@context": "https://schema.org/extensions",
                "summary": subject,
                "themeColor": "0078D4" if run_status == "success" else "D43900",
                "title": subject,
                "sections": [{"facts": [
                    {"name": "Config",  "value": config_name},
                    {"name": "Status",  "value": run_status.upper()},
                    {"name": "Rows",    "value": f"{total:,}"},
                    {"name": "Engines", "value": ", ".join(engines)},
                ]}],
            })

    except Exception as exc:
        log.warning("notify_run_complete failed (non-fatal): %s", exc)
