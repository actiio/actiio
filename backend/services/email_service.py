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
    user_email: str, 
    agent_name: str, 
    expiry_date: datetime,
    amount: float = 499.0,
    payment_id: Optional[str] = None
) -> None:
    """Send a premium activation email with a payment receipt summary."""
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

    # Format receipt section
    receipt_html = f"""
    <div style="margin: 32px 0; padding: 24px; background: #f9fafb; border-radius: 12px; border: 1px solid #f3f4f6;">
      <h3 style="margin: 0 0 16px; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">Payment Summary</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 15px; line-height: 2;">
        <tr>
          <td style="color: #6b7280;">Description</td>
          <td align="right" style="font-weight: 700; color: #111827;">{agent_name}</td>
        </tr>
        <tr>
          <td style="color: #6b7280;">Amount Paid</td>
          <td align="right" style="font-weight: 700; color: #111827;">₹{amount:,.2f}</td>
        </tr>
        <tr>
          <td style="color: #6b7280;">Reference ID</td>
          <td align="right" style="font-family: monospace; font-size: 13px; color: #111827;">{payment_id or "N/A"}</td>
        </tr>
        <tr>
          <td style="color: #6b7280;">Access Until</td>
          <td align="right" style="font-weight: 700; color: #059669;">{expiry_str}</td>
        </tr>
      </table>
    </div>
    """

    html = f"""\
    <div style="margin:0;padding:32px 16px;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:48px;box-sizing:border-box;">
        <div style="display:flex;align-items:center;gap:12px;font-size:24px;font-weight:700;letter-spacing:-0.02em;margin:0 0 24px;">
          <img src="{logo_url}" alt="Actiio logo" width="32" height="32" style="display:block;width:32px;height:32px;border-radius:8px;" />
          <span>Actiio</span>
        </div>
        <h1 style="font-size:28px;line-height:1.2;margin:0 0 16px;">You're all set, {user_name}.</h1>
        <p style="font-size:16px;line-height:1.7;color:#444444;margin:0 0 16px;">
          Your agent is active!
        </p>
        
        {receipt_html}

        <p style="font-size:16px;line-height:1.7;color:#444444;margin:0 0 28px;">
          Head over to your dashboard to manage your leads and follow-ups.
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
                "subject": f"Receipt: Your {agent_name} is active!",
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
    """Send a mobile-friendly confirmation email that matches the simple card layout."""
    settings = get_settings()
    logo_url = _get_logo_url()

    if not settings.resend_api_key:
        logger.warning("Skipping confirmation email because Resend is not configured")
        return

    resend.api_key = settings.resend_api_key

    logo_markup = (
        f'''
        <table border="0" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:middle;">
              <img src="{logo_url}" alt="Actiio" width="40" height="40" style="display:block;width:40px;height:40px;border:0;outline:none;text-decoration:none;">
            </td>
            <td style="padding-left:12px;vertical-align:middle;font-size:32px;line-height:32px;font-weight:800;letter-spacing:-0.04em;color:#111111;">
              Actiio
            </td>
          </tr>
        </table>
        '''
        if logo_url
        else '<div style="font-size:32px;line-height:32px;font-weight:800;letter-spacing:-0.04em;color:#111111;"><span style="color:#00BF63;">A</span>ctiio</div>'
    )

    html = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {{ margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111111; }}
        @media (max-width: 600px) {{
          .shell {{ padding: 20px 12px !important; }}
          .card {{ border-radius: 20px !important; }}
          .section {{ padding-left: 24px !important; padding-right: 24px !important; }}
          .headline {{ font-size: 30px !important; line-height: 1.14 !important; }}
          .copy {{ font-size: 16px !important; line-height: 1.6 !important; }}
          .button {{ display: block !important; width: 100% !important; box-sizing: border-box; text-align: center !important; min-width: 0 !important; }}
        }}
      </style>
    </head>
    <body>
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" class="shell" style="padding: 32px 16px;">
            <table class="card" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 680px; background-color: #ffffff; border-radius: 26px; overflow: hidden;">
              <tr>
                <td class="section" style="padding: 56px 56px 28px;">
                  {logo_markup}
                </td>
              </tr>
              <tr>
                <td class="section" style="padding: 0 56px 20px;">
                  <h1 class="headline" style="font-size: 42px; font-weight: 800; letter-spacing: -0.05em; margin: 0 0 22px; line-height: 1.08; color:#111111;">
                    Confirm your email
                  </h1>
                  <p class="copy" style="max-width: 520px; font-size: 20px; line-height: 1.65; color: #5f6368; margin: 0 0 36px;">
                    Thanks for signing up for Actiio. Click the button below to verify your email address and get started.
                  </p>
                  <table border="0" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" bgcolor="#22c55e" style="border-radius: 18px;">
                        <a class="button" href="{confirmation_link}" style="display: inline-block; min-width: 220px; padding: 18px 28px; font-size: 18px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 18px; text-align: center;">
                          Confirm email
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="section" style="padding: 52px 56px 56px;">
                  <div style="height:1px;background:#e8eaed;margin-bottom:28px;"></div>
                  <p style="font-size: 14px; line-height: 1.7; color: #8b9096; margin: 0;">
                    Team Actiio · <a href="https://actiio.co" style="color: #2563eb; text-decoration: underline;">actiio.co</a>
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
        f'''
        <table border="0" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:middle;">
              <img src="{logo_url}" alt="Actiio" width="40" height="40" style="display:block;width:40px;height:40px;border:0;outline:none;text-decoration:none;">
            </td>
            <td style="padding-left:12px;vertical-align:middle;font-size:32px;line-height:32px;font-weight:800;letter-spacing:-0.04em;color:#111111;">
              Actiio
            </td>
          </tr>
        </table>
        '''
        if logo_url
        else '<div style="font-size:32px;line-height:32px;font-weight:800;letter-spacing:-0.04em;color:#111111;"><span style="color:#00BF63;">A</span>ctiio</div>'
    )

    html = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {{ margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111111; }}
        @media (max-width: 600px) {{
          .shell {{ padding: 20px 12px !important; }}
          .card {{ border-radius: 20px !important; }}
          .section {{ padding-left: 24px !important; padding-right: 24px !important; }}
          .headline {{ font-size: 30px !important; line-height: 1.14 !important; }}
          .copy {{ font-size: 16px !important; line-height: 1.6 !important; }}
          .button {{ display: block !important; width: 100% !important; box-sizing: border-box; text-align: center !important; }}
        }}
      </style>
    </head>
    <body>
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" class="shell" style="padding: 32px 16px;">
            <table class="card" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 680px; background-color: #ffffff; border-radius: 26px; overflow: hidden;">
              <tr>
                <td class="section" style="padding: 56px 56px 28px;">
                  {logo_markup}
                </td>
              </tr>
              <tr>
                <td class="section" style="padding: 0 56px 20px;">
                  <h1 class="headline" style="font-size: 42px; font-weight: 800; letter-spacing: -0.05em; margin: 0 0 22px; line-height: 1.08; color:#111111;">
                    Reset your password
                  </h1>
                  <p class="copy" style="max-width: 520px; font-size: 20px; line-height: 1.65; color: #5f6368; margin: 0 0 36px;">
                    We received a request to reset your Actiio password. Click the button below to choose a new one. If you didn't request this, you can safely ignore this email.
                  </p>
                  <table border="0" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" bgcolor="#22c55e" style="border-radius: 18px;">
                        <a class="button" href="{reset_link}" style="display: inline-block; min-width: 220px; padding: 18px 28px; font-size: 18px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 18px; text-align: center;">
                          Reset password
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="section" style="padding: 52px 56px 56px;">
                  <div style="height:1px;background:#e8eaed;margin-bottom:28px;"></div>
                  <p style="font-size: 14px; line-height: 1.7; color: #8b9096; margin: 0;">
                    Team Actiio · <a href="https://actiio.co" style="color: #2563eb; text-decoration: underline;">actiio.co</a> · If you didn't request this, ignore this email.
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

def send_weekly_digest_email(
    user_email: str, 
    pending_count: int, 
    active_count: int
) -> None:
    """Send a minimalist weekly status update to the user."""
    settings = get_settings()

    if not user_email:
        return

    if not settings.resend_api_key:
        logger.warning("Skipping weekly digest for %s because RESEND_API_KEY is not configured", user_email)
        return

    logo_url = _get_logo_url()
    dashboard_url = (settings.frontend_url or "http://localhost:3000").rstrip("/")
    user_name = user_email.split("@")[0].title()

    resend.api_key = settings.resend_api_key

    # Subject line logic
    if pending_count > 0:
        subject = f"📬 Action Required: {pending_count} drafts waiting for approval"
    else:
        subject = "📈 Weekly Update: Your Follow-up Pipeline"

    html = f"""
    <div style="margin:0;padding:32px 16px;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:48px;box-sizing:border-box;">
        <div style="display:flex;align-items:center;gap:12px;font-size:24px;font-weight:700;letter-spacing:-0.02em;margin:0 0 24px;">
          <img src="{logo_url}" alt="Actiio logo" width="32" height="32" style="display:block;width:32px;height:32px;border-radius:8px;" />
          <span>Actiio</span>
        </div>
        
        <h1 style="font-size:24px;line-height:1.2;margin:0 0 16px;">Weekly Pipeline Update</h1>
        <p style="font-size:16px;line-height:1.7;color:#444444;margin:0 0 32px;">
          Hi {user_name}, here is a quick look at where your leads stand this week.
        </p>

        <div style="margin-bottom:24px; padding:24px; border-radius:12px; background:#f9fafb; border:1px solid #f3f4f6;">
          <div style="font-size:14px; color:#6b7280; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Waiting on You</div>
          <div style="font-size:32px; font-weight:800; color:#111827;">{pending_count} <span style="font-size:16px; font-weight:500; color:#4b5563;">Drafts</span></div>
          <p style="font-size:14px; color:#6b7280; margin-top:8px;">Needs your approval before they can be sent.</p>
        </div>

        <div style="margin-bottom:32px; padding:24px; border-radius:12px; background:#f9fafb; border:1px solid #f3f4f6;">
          <div style="font-size:14px; color:#6b7280; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Waiting on Leads</div>
          <div style="font-size:32px; font-weight:800; color:#111827;">{active_count} <span style="font-size:16px; font-weight:500; color:#4b5563;">Active</span></div>
          <p style="font-size:14px; color:#6b7280; margin-top:8px;">Leads we have contacted and are monitoring for a reply.</p>
        </div>

        <a href="{dashboard_url}" style="display:inline-block;background:#22c55e;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 22px;border-radius:8px;">
          Go to Dashboard
        </a>
        
        <p style="font-size:13px;line-height:1.6;color:#777777;margin:32px 0 0;">Team Actiio · actiio.co</p>
      </div>
    </div>
    """

    try:
        resend.Emails.send({
            "from": "Actiio <noreply@actiio.co>",
            "to": [user_email],
            "subject": subject,
            "html": html,
        })
    except Exception as exc:
        logger.error("Failed to send weekly digest to %s: %s", user_email, exc)


def send_subscription_renewal_reminder(
    user_email: str, 
    agent_name: str, 
    expiry_date: datetime,
    autopay_enabled: bool = False
) -> None:
    """Send a reminder 3 days before a subscription expires or renews."""
    settings = get_settings()
    if not user_email or not settings.resend_api_key:
        return

    logo_url = _get_logo_url()
    dashboard_url = (settings.frontend_url or "http://localhost:3000").rstrip("/")
    expiry_str = expiry_date.strftime("%B %d, %Y")
    resend.api_key = settings.resend_api_key

    subject = f"⚠️ Your {agent_name} expires in 3 days"
    headline = "Your agent's coverage is ending."
    body = f"Your subscription for <strong>{agent_name}</strong> will expire on <strong>{expiry_str}</strong>. To ensure your leads are still monitored without interruption, please renew your subscription manually."
    cta_text = "Renew Now"

    html = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#ffffff;">
        <tr>
          <td align="center" style="padding: 40px 16px; background-color:#f8fafc;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:24px;box-shadow:0 10px 25px rgba(0,0,0,0.05);border:1px solid #f1f5f9;">
              <tr>
                <td style="padding: 40px;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="padding-bottom: 24px;">
                        <table border="0" cellpadding="0" cellspacing="0">
                          <tr>
                            <td><img src="{logo_url}" alt="Actiio" width="32" height="32" style="display:block;border-radius:8px;"></td>
                            <td style="padding-left:12px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.02em;">Actiio</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:#111111;">{headline}</h1>
                        <p style="margin:0 0 28px;font-size:16px;line-height:1.7;color:#4b5563;">{body}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 0 32px;">
                        <a href="{dashboard_url}/billing" style="display:inline-block;background-color:#22c55e;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 32px;border-radius:12px;">
                          {cta_text}
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td style="height:1px;background-color:#eeeeee;"></td>
                    </tr>
                    <tr>
                      <td style="padding-top:24px;font-size:13px;line-height:1.6;color:#9ca3af;">
                        Team Actiio · <a href="https://actiio.co" style="color:#9ca3af;text-decoration:underline;">actiio.co</a>
                      </td>
                    </tr>
                  </table>
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
            "subject": subject,
            "html": html,
        })
    except Exception as exc:
        logger.error("Failed to send renewal reminder to %s: %s", user_email, exc)


def send_subscription_expired_email(user_email: str, agent_name: str) -> None:
    """Send a notice when a subscription has officially expired."""
    settings = get_settings()
    if not user_email or not settings.resend_api_key:
        return

    logo_url = _get_logo_url()
    dashboard_url = (settings.frontend_url or "http://localhost:3000").rstrip("/")
    resend.api_key = settings.resend_api_key

    html = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#ffffff;">
        <tr>
          <td align="center" style="padding: 40px 16px; background-color:#f8fafc;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:24px;box-shadow:0 10px 25px rgba(0,0,0,0.05);border:1px solid #f1f5f9;">
              <tr>
                <td style="padding: 40px;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="padding-bottom: 24px;">
                        <table border="0" cellpadding="0" cellspacing="0">
                          <tr>
                            <td><img src="{logo_url}" alt="Actiio" width="32" height="32" style="display:block;border-radius:8px;"></td>
                            <td style="padding-left:12px;font-size:24px;font-weight:700;color:#111111;letter-spacing:-0.02em;">Actiio</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;color:#111111;">Your agent has expired.</h1>
                        <p style="margin:0 0 28px;font-size:16px;line-height:1.7;color:#4b5563;">
                          The subscription for <strong>{agent_name}</strong> has ended. Your agent has stopped following up with leads. 
                          Reactivate now to restore service and resume your pipeline.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 10px 0 32px;">
                        <a href="{dashboard_url}/billing" style="display:inline-block;background-color:#22c55e;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 32px;border-radius:12px;">
                          Reactivate Agent
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td style="height:1px;background-color:#eeeeee;"></td>
                    </tr>
                    <tr>
                      <td style="padding-top:24px;font-size:13px;line-height:1.6;color:#9ca3af;">
                        Team Actiio · <a href="https://actiio.co" style="color:#9ca3af;text-decoration:underline;">actiio.co</a>
                      </td>
                    </tr>
                  </table>
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
            "subject": f"🚨 Action Required: Your {agent_name} has expired",
            "html": html,
        })
    except Exception as exc:
        logger.error("Failed to send expiry notice to %s: %s", user_email, exc)
