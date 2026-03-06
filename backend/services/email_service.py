import os
import smtplib
import time
from email.message import EmailMessage
from typing import Any, Dict

from backend.services.supabase_client import supabase


def _env_flag(name: str, default: str = "false") -> bool:
    return os.environ.get(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _get_rate_window_limit() -> int:
    try:
        return int(os.environ.get("EMAIL_MAX_SENT_PER_MINUTE", "30"))
    except ValueError:
        return 30


def _within_rate_limit() -> bool:
    """
    Simple DB-backed rate limiting: count how many drafts have status 'sent'
    in the last 60 seconds and compare against EMAIL_MAX_SENT_PER_MINUTE.
    """
    window_seconds = 60
    cutoff_time = time.time() - window_seconds
    cutoff_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(cutoff_time))
    try:
        res = supabase.table("draft_artifacts").select("id", count="exact").eq("status", "sent").gte("created_at", cutoff_str).execute()
        max_per_min = _get_rate_window_limit()
        count = getattr(res, "count", None)
        if count is None:
            # Older supabase client: derive from data length
            count = len(res.data or [])
        return count < max_per_min
    except Exception:
        # On any error, fail closed (do not send more)
        return False


def _build_email_message(artifact: Dict[str, Any], sandbox_to: str, default_from: str) -> EmailMessage:
    sp = artifact.get("structured_payload") or {}
    original_to = (sp.get("to") or "").strip()
    subject = (sp.get("subject") or "Supply chain mitigation update").strip()
    body = (sp.get("body") or artifact.get("preview") or "").strip()

    msg = EmailMessage()
    msg["From"] = default_from
    msg["To"] = sandbox_to or original_to
    # Always include original recipient in subject for traceability in sandbox
    if sandbox_to and original_to and sandbox_to != original_to:
        msg["Subject"] = f"[SANDBOX] {subject} (orig to: {original_to})"
    else:
        msg["Subject"] = subject

    if not body:
        body = "(no body content)"

    if sandbox_to and original_to and sandbox_to != original_to:
        prefixed = f"(This email was sent to SANDBOX address instead of the original recipient.)\nOriginal To: {original_to}\n\n{body}"
        msg.set_content(prefixed)
    else:
        msg.set_content(body)
    return msg


def send_email_for_draft(artifact: Dict[str, Any], approved_by: str) -> Dict[str, Any]:
    """
    Send a draft email artifact via SMTP, with strong safeguards:

    - EMAIL_ENABLED must be true to send anything.
    - Always require a sandbox/test inbox EMAIL_SANDBOX_TO; if not set, skip send.
    - Enforce a simple per-minute rate limit using draft_artifacts.status='sent'.
    - Never send without an approval actor.
    """
    if not approved_by:
        return {"sent": False, "reason": "missing_approved_by"}

    if not _env_flag("EMAIL_ENABLED", "false"):
        return {"sent": False, "reason": "email_disabled"}

    sandbox_to = os.environ.get("EMAIL_SANDBOX_TO", "").strip()
    if not sandbox_to:
        # Require explicit sandbox inbox to avoid accidental production sends.
        return {"sent": False, "reason": "missing_sandbox_to"}

    if not _within_rate_limit():
        return {"sent": False, "reason": "rate_limited"}

    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    smtp_port_raw = os.environ.get("SMTP_PORT", "").strip() or "587"
    smtp_user = os.environ.get("SMTP_USERNAME", "").strip()
    smtp_password = os.environ.get("SMTP_PASSWORD", "").strip()
    email_from = os.environ.get("EMAIL_FROM", smtp_user or "no-reply@example.com").strip()

    if not smtp_host or not smtp_user or not smtp_password:
        return {"sent": False, "reason": "smtp_not_configured"}

    try:
        smtp_port = int(smtp_port_raw)
    except ValueError:
        smtp_port = 587

    if (artifact.get("type") or "").lower() != "email":
        return {"sent": False, "reason": "not_email_artifact"}

    msg = _build_email_message(artifact, sandbox_to=sandbox_to, default_from=email_from)

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
        return {"sent": True, "to": msg["To"], "subject": msg["Subject"]}
    except Exception as e:
        return {"sent": False, "reason": "smtp_error", "error": str(e)}

