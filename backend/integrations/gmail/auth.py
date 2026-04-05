from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Dict, Tuple
from urllib.error import URLError
from urllib.request import Request as UrlRequest, urlopen

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from app.core.config import get_settings
from app.core.supabase import get_supabase
from app.core.utils import parse_supabase_timestamp, sign_state_token, verify_state_token

supabase = get_supabase()

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
]


class GmailConnectionExpiredError(Exception):
    """Raised when a stored Gmail OAuth connection can no longer be refreshed."""


def _to_aware_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _to_naive_utc(dt: datetime) -> datetime:
    return _to_aware_utc(dt).replace(tzinfo=None)


def _client_config() -> Dict:
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret or not settings.google_redirect_uri:
        raise ValueError("Google OAuth environment variables are missing")
    return {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }


def _encode_state(user_id: str, agent_id: str) -> str:
    settings = get_settings()
    return sign_state_token(
        {"user_id": user_id, "agent_id": agent_id},
        settings.state_signing_secret,
        max_age_seconds=10 * 60,
    )


def parse_state(state: str | None) -> Tuple[str | None, str]:
    if not state:
        return None, "gmail_followup"
    settings = get_settings()
    payload = verify_state_token(state, settings.state_signing_secret)
    if not payload:
        return None, "gmail_followup"

    return payload.get("user_id"), payload.get("agent_id") or "gmail_followup"


def get_auth_url(user_id: str, agent_id: str = "gmail_followup") -> str:
    settings = get_settings()
    flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=settings.google_redirect_uri)
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=_encode_state(user_id=user_id, agent_id=agent_id),
    )
    return auth_url


def _fetch_google_userinfo(access_token: str | None) -> Tuple[str, str | None]:
    if not access_token:
        return "", None

    request = UrlRequest(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    try:
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError, URLError):
        return "", None

    email = (payload.get("email") or "").strip()
    display_name = (payload.get("name") or "").strip() or None
    return email, display_name


def _get_active_connection(user_id: str, agent_id: str) -> Dict | None:
    response = (
        supabase.table("gmail_connections")
        .select("*")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


def _mark_connection_disconnected(connection_id: str) -> None:
    (
        supabase.table("gmail_connections")
        .update({"status": "disconnected"})
        .eq("id", connection_id)
        .execute()
    )


def handle_callback(code: str, user_id: str, agent_id: str = "gmail_followup") -> Dict:
    settings = get_settings()
    flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=settings.google_redirect_uri)
    flow.fetch_token(code=code)

    credentials = flow.credentials
    token_expiry = _to_aware_utc(credentials.expiry).isoformat() if credentials.expiry else None

    gmail_email, display_name = _fetch_google_userinfo(credentials.token)
    normalized_email = gmail_email.strip().lower() if gmail_email else ""

    (
        supabase.table("gmail_connections")
        .update({"is_active": False})
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .execute()
    )

    response = (
        supabase.table("gmail_connections")
        .upsert(
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "email": normalized_email,
                "display_name": display_name,
                "access_token": credentials.token,
                "refresh_token": credentials.refresh_token,
                "token_expiry": token_expiry,
                "is_active": True,
                "status": "connected",
            },
            on_conflict="user_id,agent_id,email",
        )
        .execute()
    )

    return response.data[0] if response.data else {}


def get_credentials(user_id: str, agent_id: str = "gmail_followup") -> Credentials:
    settings = get_settings()
    row = _get_active_connection(user_id, agent_id)
    if not row:
        raise ValueError("Gmail connection not found for user")
    expiry = row.get("token_expiry")
    parsed_expiry = None
    if expiry:
        parsed_expiry = parse_supabase_timestamp(expiry)
        parsed_expiry = _to_naive_utc(parsed_expiry)
    credentials = Credentials(
        token=row.get("access_token"),
        refresh_token=row.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=SCOPES,
        expiry=parsed_expiry,
    )

    if credentials.expired and not credentials.refresh_token:
        _mark_connection_disconnected(row["id"])
        raise GmailConnectionExpiredError("Gmail connection is missing a refresh token")

    if credentials.expired and credentials.refresh_token:
        try:
            credentials.refresh(Request())
        except RefreshError as exc:
            error_text = str(exc).lower()
            if "invalid_grant" in error_text or "expired or revoked" in error_text:
                _mark_connection_disconnected(row["id"])
                raise GmailConnectionExpiredError("Gmail connection expired or was revoked") from exc
            raise
        new_expiry_dt = _to_aware_utc(credentials.expiry) if credentials.expiry else datetime.now(timezone.utc)
        new_expiry = new_expiry_dt.isoformat()
        (
            supabase.table("gmail_connections")
            .update(
                {
                    "access_token": credentials.token,
                    "refresh_token": credentials.refresh_token,
                    "token_expiry": new_expiry,
                    "status": "connected",
                }
            )
            .eq("id", row["id"])
            .execute()
        )

    return credentials
