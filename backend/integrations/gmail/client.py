from __future__ import annotations

from typing import Dict

from google.auth.exceptions import RefreshError, TransportError
from googleapiclient.discovery import build

from integrations.gmail.auth import get_credentials
from integrations.gmail.parser import parse_thread


class GmailDisconnectedError(Exception):
    """Raised when Gmail access is no longer valid for the user."""


def build_gmail_service(user_id: str, agent_id: str = "gmail_followup"):
    credentials = get_credentials(user_id, agent_id=agent_id)
    return build("gmail", "v1", credentials=credentials, cache_discovery=False)


def fetch_parsed_thread(user_id: str, agent_id: str, gmail_thread_id: str) -> Dict[str, object]:
    try:
        service = build_gmail_service(user_id=user_id, agent_id=agent_id)
        profile = service.users().getProfile(userId="me").execute()
        owner_email = profile.get("emailAddress")
        raw_thread = service.users().threads().get(
            userId="me",
            id=gmail_thread_id,
            format="full",
        ).execute()
        return parse_thread(raw_thread, owner_email=owner_email)
    except (RefreshError, TransportError) as exc:
        raise GmailDisconnectedError("Gmail connection was disconnected. Please reconnect your Gmail account.") from exc
    except Exception as exc:
        error_text = str(exc).lower()
        if "401" in error_text or "invalid_grant" in error_text:
            raise GmailDisconnectedError("Gmail connection was disconnected. Please reconnect your Gmail account.") from exc
        raise exc
