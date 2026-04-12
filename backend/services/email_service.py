from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from app.core.config import get_settings
import resend


logger = logging.getLogger(__name__)


def _get_reconnect_url() -> str:
    settings = get_settings()
    base_url = (settings.frontend_url or "http://localhost:3000").rstrip("/")
    return f"{base_url}/settings"


def _get_logo_url() -> str:
    settings = get_settings()
    base_url = (settings.frontend_url or "http://localhost:3000").rstrip("/")
    return f"{base_url}/logo.png"


def send_gmail_disconnection_alert(user_email: Optional[str], gmail_email: Optional[str]) -> None:
    settings = get_settings()
    gmail_label = (gmail_email or "your Gmail account").strip()

    if not user_email:
        logger.warning("Skipping Gmail disconnection alert because user_email is missing for Gmail account %s", gmail_label)
        return

    if not settings.resend_api_key:
        logger.warning("Skipping Gmail disconnection alert for %s because RESEND_API_KEY is not configured", user_email)
        return

    reconnect_url = _get_reconnect_url()
    logo_url = _get_logo_url()
    resend.api_key = settings.resend_api_key

    html = f"""
    <div style="margin:0;padding:32px 16px;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:48px;box-sizing:border-box;">
        <div style="display:flex;align-items:center;gap:12px;font-size:24px;font-weight:700;letter-spacing:-0.02em;margin:0 0 24px;">
          <img src="{logo_url}" alt="Actiio logo" width="32" height="32" style="display:block;width:32px;height:32px;border-radius:8px;" />
          <span>Actiio</span>
        </div>
        <h1 style="font-size:28px;line-height:1.2;margin:0 0 16px;">Your Gmail connection was disconnected</h1>
        <p style="font-size:16px;line-height:1.7;color:#444444;margin:0 0 28px;">
          Your Gmail account {gmail_label} has been disconnected from Actiio. Your leads are no longer being tracked.
          Click below to reconnect and resume your follow-ups.
        </p>
        <a href="{reconnect_url}" style="display:inline-block;background:#22c55e;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 22px;border-radius:8px;">
          Reconnect Gmail
        </a>
        <p style="font-size:13px;line-height:1.6;color:#777777;margin:32px 0 0;">Team Actiio · actiio.co</p>
      </div>
    </div>
    """

    try:
        resend.Emails.send(
            {
                "from": "Actiio <noreply@actiio.co>",
                "to": [user_email],
                "subject": "Your Gmail connection was disconnected",
                "html": html,
            }
        )
    except Exception as exc:  # pragma: no cover - third-party delivery failure
        logger.error(
            "Failed to send Gmail disconnection alert to %s for Gmail account %s: %s",
            user_email,
            gmail_label,
            exc,
        )


def send_subscription_activated_email(
    user_email: str, agent_name: str, expiry_date: datetime
) -> None:
    """Send a premium activation email after successful subscription payment."""
    settings = get_settings()

    if not user_email:
        logger.warning("Skipping activation email because user_email is missing")
        return

    if not settings.resend_api_key:
        logger.warning(
            "Skipping activation email for %s because RESEND_API_KEY is not configured",
            user_email,
        )
        return

    logo_url = _get_logo_url()
    dashboard_url = (settings.frontend_url or "http://localhost:3000").rstrip("/")
    user_name = user_email.split("@")[0].title()
    expiry_str = expiry_date.strftime("%B %d, %Y")

    resend.api_key = settings.resend_api_key

    html = f"""\
    <div style="margin:0;padding:32px 16px;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:48px;box-sizing:border-box;">
        <div style="display:flex;align-items:center;gap:12px;font-size:24px;font-weight:700;letter-spacing:-0.02em;margin:0 0 24px;">
          <img src="{logo_url}" alt="Actiio logo" width="32" height="32" style="display:block;width:32px;height:32px;border-radius:8px;" />
          <span>Actiio</span>
        </div>
        <h1 style="font-size:28px;line-height:1.2;margin:0 0 16px;">You're all set, {user_name}.</h1>
        <p style="font-size:16px;line-height:1.7;color:#444444;margin:0 0 8px;">
          Your <strong>{agent_name}</strong> is now active until <strong>{expiry_str}</strong>.
        </p>
        <p style="font-size:16px;line-height:1.7;color:#444444;margin:0 0 28px;">
          Start syncing your Gmail to track your leads.
        </p>
        <a href="{dashboard_url}" style="display:inline-block;background:#22c55e;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 22px;border-radius:8px;">
          Go to Dashboard
        </a>
        <p style="font-size:13px;line-height:1.6;color:#777777;margin:32px 0 0;">Team Actiio · actiio.co</p>
      </div>
    </div>
    """

    try:
        resend.Emails.send(
            {
                "from": "Actiio <noreply@actiio.co>",
                "to": [user_email],
                "subject": "Your Actiio subscription is active 🎉",
                "html": html,
            }
        )
    except Exception as exc:  # pragma: no cover - third-party delivery failure
        logger.error(
            "Failed to send subscription activation email to %s: %s",
            user_email,
            exc,
        )
