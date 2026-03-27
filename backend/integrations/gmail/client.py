from __future__ import annotations

from typing import Dict

from googleapiclient.discovery import build

from integrations.gmail.auth import get_credentials
from integrations.gmail.parser import parse_thread


def build_gmail_service(user_id: str, agent_id: str = "gmail_followup"):
    credentials = get_credentials(user_id, agent_id=agent_id)
    return build("gmail", "v1", credentials=credentials, cache_discovery=False)


def fetch_parsed_thread(user_id: str, agent_id: str, gmail_thread_id: str) -> Dict[str, object]:
    service = build_gmail_service(user_id=user_id, agent_id=agent_id)
    profile = service.users().getProfile(userId="me").execute()
    owner_email = profile.get("emailAddress")
    raw_thread = service.users().threads().get(
        userId="me",
        id=gmail_thread_id,
        format="full",
    ).execute()
    return parse_thread(raw_thread, owner_email=owner_email)
