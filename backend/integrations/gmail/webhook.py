from __future__ import annotations

import base64
import json
from typing import Any, Dict, List, Optional

from googleapiclient.discovery import build

from app.core.supabase import get_supabase

supabase = get_supabase()
from integrations.gmail.auth import get_credentials
from integrations.gmail.parser import parse_message, parse_thread
from integrations.gmail.sync import track_thread_if_lead


def _find_user_id_by_email(email: str) -> str:
    response = (
        supabase.table("gmail_connections")
        .select("user_id")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    if not response.data:
        raise ValueError("No Gmail connection for email in webhook")
    return response.data[0]["user_id"]


def _find_tracked_thread(user_id: str, gmail_thread_id: str) -> Optional[Dict[str, Any]]:
    existing = (
        supabase.table("lead_threads")
        .select("id,status")
        .eq("user_id", user_id)
        .eq("gmail_thread_id", gmail_thread_id)
        .limit(1)
        .execute()
    )
    return existing.data[0] if existing.data else None


def _list_new_message_ids(service: Any, history_id: Optional[str]) -> List[str]:
    if not history_id:
        latest = service.users().messages().list(userId="me", maxResults=1).execute().get("messages", [])
        return [item["id"] for item in latest if item.get("id")]

    try:
        start_history_id = max(1, int(history_id) - 1)
        history_response = (
            service.users()
            .history()
            .list(userId="me", startHistoryId=str(start_history_id), historyTypes=["messageAdded"])
            .execute()
        )
    except Exception:
        latest = service.users().messages().list(userId="me", maxResults=1).execute().get("messages", [])
        return [item["id"] for item in latest if item.get("id")]

    message_ids: List[str] = []
    for item in history_response.get("history", []) or []:
        for added in item.get("messagesAdded", []) or []:
            message = added.get("message", {})
            message_id = message.get("id")
            if message_id:
                message_ids.append(message_id)

    # Dedupe while preserving order.
    deduped: List[str] = []
    seen = set()
    for message_id in message_ids:
        if message_id in seen:
            continue
        seen.add(message_id)
        deduped.append(message_id)
    return deduped


def _store_message_if_missing(thread_id: str, parsed_message: Dict[str, Any]) -> bool:
    gmail_message_id = parsed_message.get("gmail_message_id")
    if not gmail_message_id:
        return False

    exists = (
        supabase.table("messages")
        .select("id")
        .eq("thread_id", thread_id)
        .eq("gmail_message_id", gmail_message_id)
        .limit(1)
        .execute()
    )

    if exists.data:
        return False

    (
        supabase.table("messages")
        .insert(
            {
                "thread_id": thread_id,
                "direction": parsed_message.get("direction", "inbound"),
                "content": parsed_message.get("body", "") or "",
                "timestamp": parsed_message.get("timestamp"),
                "gmail_message_id": gmail_message_id,
            }
        )
        .execute()
    )
    return True


def _reset_pending_followup(thread_id: str) -> None:
    # Invalidate stale drafts – the conversation has moved forward.
    (
        supabase.table("drafts")
        .update({"status": "sent"})
        .eq("thread_id", thread_id)
        .eq("status", "pending")
        .execute()
    )


def _update_thread_activity(thread_id: str, parsed_message: Dict[str, Any]) -> None:
    direction = parsed_message.get("direction")
    timestamp = parsed_message.get("timestamp")
    if direction == "inbound":
        _reset_pending_followup(thread_id)
        (
            supabase.table("lead_threads")
            .update({"last_inbound_at": timestamp, "status": "active"})
            .eq("id", thread_id)
            .execute()
        )
    else:
        (
            supabase.table("lead_threads")
            .update({"last_outbound_at": timestamp})
            .eq("id", thread_id)
            .execute()
        )


def handle_pubsub_notification(payload: Dict) -> Dict:
    envelope = payload.get("message", {})
    data_b64 = envelope.get("data")
    if not data_b64:
        return {"status": "ignored", "reason": "no_data"}

    decoded = json.loads(base64.b64decode(data_b64).decode("utf-8"))
    email_address = decoded.get("emailAddress")
    if not email_address:
        return {"status": "ignored", "reason": "missing_email"}

    history_id = decoded.get("historyId")
    user_id = _find_user_id_by_email(email_address)
    credentials = get_credentials(user_id)
    service = build("gmail", "v1", credentials=credentials, cache_discovery=False)

    owner_email = email_address
    message_ids = _list_new_message_ids(service, history_id=history_id)
    if not message_ids:
        return {"status": "ok", "processed": 0}

    processed = 0
    tracked = 0
    ignored = 0
    tracked_thread_ids: List[str] = []

    for message_id in message_ids:
        raw_message = service.users().messages().get(userId="me", id=message_id, format="full").execute()
        parsed_message = parse_message(raw_message, owner_email=owner_email)
        gmail_thread_id = parsed_message.get("gmail_thread_id")
        if not gmail_thread_id:
            ignored += 1
            continue

        thread = _find_tracked_thread(user_id=user_id, gmail_thread_id=gmail_thread_id)
        if thread:
            thread_id = thread["id"]
            _store_message_if_missing(thread_id=thread_id, parsed_message=parsed_message)
            _update_thread_activity(thread_id=thread_id, parsed_message=parsed_message)
            tracked += 1
            processed += 1
            tracked_thread_ids.append(thread_id)
            continue

        raw_thread = service.users().threads().get(userId="me", id=gmail_thread_id, format="full").execute()
        parsed_thread = parse_thread(raw_thread, owner_email=owner_email)
        tracked_thread_id = track_thread_if_lead(user_id=user_id, parsed_thread=parsed_thread)
        if not tracked_thread_id:
            ignored += 1
            continue

        tracked += 1
        processed += 1
        tracked_thread_ids.append(tracked_thread_id)

    return {
        "status": "ok",
        "processed": processed,
        "tracked": tracked,
        "ignored": ignored,
        "thread_ids": tracked_thread_ids,
    }
