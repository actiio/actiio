from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from app.core.config import get_settings
from app.core.supabase import get_supabase

supabase = get_supabase()

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
]


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


def get_auth_url(user_id: str) -> str:
    settings = get_settings()
    flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=settings.google_redirect_uri)
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=user_id,
    )
    return auth_url


def handle_callback(code: str, user_id: str) -> Dict:
    settings = get_settings()
    flow = Flow.from_client_config(_client_config(), scopes=SCOPES, redirect_uri=settings.google_redirect_uri)
    flow.fetch_token(code=code)

    credentials = flow.credentials
    token_expiry = _to_aware_utc(credentials.expiry).isoformat() if credentials.expiry else None

    gmail_email = ""
    # Use tokeninfo endpoint via credentials id_token/email is not guaranteed; set later during sync if empty.

    response = (
        supabase.table("gmail_connections")
        .upsert(
            {
                "user_id": user_id,
                "email": gmail_email,
                "access_token": credentials.token,
                "refresh_token": credentials.refresh_token,
                "token_expiry": token_expiry,
            },
            on_conflict="user_id",
        )
        .execute()
    )

    return response.data[0] if response.data else {}


def get_credentials(user_id: str) -> Credentials:
    settings = get_settings()
    response = (
        supabase.table("gmail_connections")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise ValueError("Gmail connection not found for user")

    row = response.data[0]
    expiry = row.get("token_expiry")
    parsed_expiry = None
    if expiry:
        parsed_expiry = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
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

    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
        new_expiry_dt = _to_aware_utc(credentials.expiry) if credentials.expiry else datetime.now(timezone.utc)
        new_expiry = new_expiry_dt.isoformat()
        (
            supabase.table("gmail_connections")
            .update(
                {
                    "access_token": credentials.token,
                    "refresh_token": credentials.refresh_token,
                    "token_expiry": new_expiry,
                }
            )
            .eq("user_id", user_id)
            .execute()
        )

    return credentials
