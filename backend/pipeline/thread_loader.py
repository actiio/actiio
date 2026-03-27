from __future__ import annotations

from typing import Any

from app.core.supabase import get_supabase
from app.core.utils import sanitize_ai_context, sanitize_email_content
from integrations.gmail.client import fetch_parsed_thread


def _pair_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pairs: list[dict[str, Any]] = []

    for message in messages:
        direction = message.get("direction")
        if direction == "inbound":
            pairs.append({"inbound": message, "outbound": None})
            continue

        if direction == "outbound" and pairs and pairs[-1]["outbound"] is None:
            pairs[-1]["outbound"] = message
        else:
            pairs.append({"inbound": None, "outbound": message})

    return pairs[-5:]


def _sanitize_messages(messages: list[dict[str, Any]], thread_id: str) -> list[dict[str, Any]]:
    """Sanitize message content to prevent prompt injection."""
    sanitized = []
    for msg in messages:
        msg_copy = dict(msg)
        if msg_copy.get("content"):
            msg_copy["content"] = sanitize_email_content(
                msg_copy["content"], thread_id=thread_id,
            )
        sanitized.append(msg_copy)
    return sanitized


def load_thread_context(supabase_client, thread_id: str, user_id: str, agent_id: str = "gmail_followup") -> dict[str, Any]:
    if supabase_client is None:
        supabase_client = get_supabase()
    thread_response = (
        supabase_client.table("lead_threads")
        .select("*")
        .eq("id", thread_id)
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .limit(1)
        .execute()
    )
    if not thread_response.data:
        raise ValueError(f"Thread not found: {thread_id}")

    thread = thread_response.data[0]

    gmail_thread_id = thread.get("gmail_thread_id")
    if not gmail_thread_id:
        raise ValueError(f"Gmail thread id missing for thread: {thread_id}")

    parsed_thread = fetch_parsed_thread(
        user_id=user_id,
        agent_id=agent_id,
        gmail_thread_id=gmail_thread_id,
    )
    latest_messages = [
        {
            "id": message.get("gmail_message_id"),
            "direction": message.get("direction"),
            "content": message.get("body", "") or "",
            "timestamp": message.get("timestamp"),
            "has_attachments": bool(message.get("has_attachments")),
            "attachment_names": message.get("attachment_names") or [],
        }
        for message in parsed_thread.get("messages", [])[-10:]
    ]
    latest_messages = _sanitize_messages(latest_messages, thread_id=thread_id)
    message_pairs = _pair_messages(latest_messages)

    profile_response = (
        supabase_client.table("business_profiles")
        .select("*")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .limit(1)
        .execute()
    )
    if not profile_response.data:
        raise ValueError(f"Business profile not found for user: {user_id}")

    business_profile = sanitize_ai_context(profile_response.data[0], context_id=thread_id)
    
    # Identify which follow-up case applies
    last_inbound = thread.get("last_inbound_at")
    last_outbound = thread.get("last_outbound_at")
    
    followup_case = "lead_silent" # Default Case A: lead went quiet after replying
    if last_outbound and (not last_inbound or last_outbound > last_inbound):
        followup_case = "awaiting_response" # Case B: salesperson sent something, waiting for lead response

    return {
        "thread": thread,
        "messages": message_pairs,
        "business_profile": business_profile,
        "followup_case": followup_case,
    }
