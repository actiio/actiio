from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

from app.core.config import get_settings
import resend


logger = logging.getLogger(__name__)


def _get_reconnect_url() -> str:
    settings = get_settings()
    base_url = (settings.frontend_url or "http://localhost:3000").rstrip("/")
    return f"{base_url}/settings"


def _get_logo_url() -> Optional[str]:
    settings = get_settings()
    if settings.email_logo_url:
        return settings.email_logo_url

    base_url = (settings.frontend_url or "").rstrip("/")
    if not base_url:
        return None

    parsed = urlparse(base_url)
    hostname = (parsed.hostname or "").lower()
    if hostname in {"localhost", "127.0.0.1"}:
        return None

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


def send_confirmation_email(user_email: str, confirmation_link: str) -> None:
    """Send a premium account confirmation email."""
    settings = get_settings()
    logo_url = _get_logo_url()

    if not settings.resend_api_key:
        logger.warning("Skipping confirmation email because Resend is not configured")
        return

    resend.api_key = settings.resend_api_key

    html = f"""
    <!DOCTYPE html>
    <html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <!--[if !mso]><!-->
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap" rel="stylesheet">
      <!--<![endif]-->
      <style>
        :root {{ color-scheme: light dark; supported-color-schemes: light dark; }}
        body {{ -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-size-adjust: 100%; }}
        @media (max-width: 600px) {{
          .container {{ width: 100% !important; border-radius: 0 !important; border: none !important; }}
          .mobile-padding {{ padding: 32px 24px !important; }}
        }}
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #000000; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #000000;">
        <tr>
          <td align="center" style="padding: 24px 16px;">
            <table class="container" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 440px; background-color: #111111; border: 1px solid #222222; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
              <tr>
                <td align="center" class="mobile-padding" style="padding: 48px 40px 24px;">
                  <img src="{logo_url}" alt="Actiio" width="56" height="56" style="display: block; border-radius: 14px; filter: drop-shadow(0 0 12px rgba(0, 191, 99, 0.4));">
                </td>
              </tr>
              <tr>
                <td align="center" class="mobile-padding" style="padding: 0 40px 48px;">
                  <h1 style="color: #ffffff !important; font-size: 32px; font-weight: 800; letter-spacing: -0.04em; margin: 0 0 16px; line-height: 1.1; display: block;">Welcome to Actiio.</h1>
                  <p style="color: #A1A1AA !important; font-size: 16px; line-height: 1.6; margin: 0 0 32px; display: block;">Never lose a warm lead again. Confirm your account to start automating your follow-ups.</p>
                  <table border="0" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" bgcolor="#00BF63" style="border-radius: 100px;">
                        <a href="{confirmation_link}" style="display: inline-block; padding: 18px 36px; font-size: 16px; font-weight: 700; color: #ffffff !important; text-decoration: none; border-radius: 100px; text-align: center;">Confirm Account</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding: 24px; border-top: 1px solid #222222; background-color: #0c0c0c;">
                  <p style="color: #71717A !important; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; margin: 0;">© 2026 Actiio AI · Scale Intelligence</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    try:
        resend.Emails.send({
            "from": "Actiio <noreply@actiio.co>",
            "to": [user_email],
            "subject": "👋 Welcome to Actiio! Confirm your signup",
            "html": html,
        })
    except Exception as exc:
        logger.error("Failed to send confirmation email to %s: %s", user_email, exc)


def send_password_reset_email(user_email: str, reset_link: str) -> None:
    """Send a cleaner password reset email with a safe branding fallback."""
    settings = get_settings()
    logo_url = _get_logo_url()

    if not settings.resend_api_key:
        logger.warning("Skipping password reset email because Resend is not configured")
        return

    resend.api_key = settings.resend_api_key

    logo_markup = (
        f'<img src="{logo_url}" alt="Actiio" width="40" height="40" style="display:block;width:40px;height:40px;border:0;outline:none;text-decoration:none;">'
        if logo_url
        else '<div style="width:40px;height:40px;border-radius:12px;background:#111827;color:#ffffff;font-size:20px;font-weight:800;line-height:40px;text-align:center;">A</div>'
    )

    html = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
        body {{ margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; }}
        @media (max-width: 600px) {{
          .shell {{ padding: 20px 12px !important; }}
          .card {{ border-radius: 20px !important; }}
          .section {{ padding: 28px 24px !important; }}
          .headline {{ font-size: 30px !important; }}
          .button {{ display: block !important; width: 100% !important; box-sizing: border-box; }}
        }}
      </style>
    </head>
    <body>
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" class="shell" style="padding: 32px 16px;">
            <table class="card" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 28px; overflow: hidden; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);">
              <tr>
                <td class="section" style="padding: 32px 40px 20px;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="vertical-align: middle;">{logo_markup}</td>
                      <td style="padding-left: 14px; vertical-align: middle;">
                        <div style="font-size: 18px; font-weight: 800; color: #111827; letter-spacing: -0.03em;">Actiio</div>
                        <div style="font-size: 12px; color: #6b7280; padding-top: 2px;">Password reset request</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="section" style="padding: 0 40px 12px;">
                  <div style="display:inline-block;background:#ecfdf3;color:#047857;border:1px solid #a7f3d0;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:700;letter-spacing:0.02em;">
                    Secure access
                  </div>
                  <h1 class="headline" style="font-size: 36px; font-weight: 800; letter-spacing: -0.05em; margin: 18px 0 14px; line-height: 1.05; color:#111827;">
                    Reset your password
                  </h1>
                  <p style="font-size: 16px; line-height: 1.7; color: #4b5563; margin: 0 0 18px;">
                    We received a request to reset the password for your Actiio account. Use the button below to choose a new password.
                  </p>
                  <p style="font-size: 16px; line-height: 1.7; color: #4b5563; margin: 0 0 32px;">
                    For your security, this link expires in 1 hour. If you did not request this, you can safely ignore this email.
                  </p>
                  <table border="0" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" bgcolor="#00BF63" style="border-radius: 999px;">
                        <a class="button" href="{reset_link}" style="display: inline-block; padding: 16px 28px; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 999px; text-align: center;">
                          Reset Password
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="section" style="padding: 28px 40px 36px;">
                  <div style="height:1px;background:#e5e7eb;margin-bottom:20px;"></div>
                  <p style="font-size: 13px; line-height: 1.7; color: #6b7280; margin: 0 0 10px;">
                    Button not working? Copy and paste this link into your browser:
                  </p>
                  <p style="margin: 0 0 18px; word-break: break-all;">
                    <a href="{reset_link}" style="color: #047857; font-size: 13px; line-height: 1.6; text-decoration: underline;">{reset_link}</a>
                  </p>
                  <p style="font-size: 12px; line-height: 1.6; color: #9ca3af; margin: 0;">
                    Actiio AI
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    try:
        resend.Emails.send({
            "from": "Actiio <noreply@actiio.co>",
            "to": [user_email],
            "subject": "🔒 Reset your Actiio password",
            "html": html,
        })
    except Exception as exc:
        logger.error("Failed to send password reset email to %s: %s", user_email, exc)
