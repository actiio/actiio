from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from googleapiclient.discovery import build

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BASE_DIR))

from integrations.gmail.auth import get_credentials
from integrations.gmail.parser import parse_message, parse_thread


def main() -> None:
    user_id = os.getenv("GMAIL_TEST_USER_ID")
    if not user_id:
        raise RuntimeError("Set GMAIL_TEST_USER_ID in your environment")

    credentials = get_credentials(user_id)
    service = build("gmail", "v1", credentials=credentials, cache_discovery=False)

    profile = service.users().getProfile(userId="me").execute()
    owner_email = profile.get("emailAddress")

    threads = service.users().threads().list(userId="me", maxResults=5).execute().get("threads", [])

    print("=== THREADS ===")
    for thread_ref in threads:
        raw_thread = service.users().threads().get(userId="me", id=thread_ref["id"], format="full").execute()
        parsed = parse_thread(raw_thread, owner_email=owner_email)
        print(json.dumps(parsed, indent=2))

    print("\n=== MESSAGES (LATEST 5) ===")
    messages = service.users().messages().list(userId="me", maxResults=5).execute().get("messages", [])
    for message_ref in messages:
        raw_message = service.users().messages().get(userId="me", id=message_ref["id"], format="full").execute()
        parsed_message = parse_message(raw_message, owner_email=owner_email)
        print(json.dumps(parsed_message, indent=2))


if __name__ == "__main__":
    main()
