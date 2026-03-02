from __future__ import annotations

from typing import Any

from app.core.supabase import get_supabase


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


def load_thread_context(supabase_client, thread_id: str, user_id: str) -> dict[str, Any]:
    if supabase_client is None:
        supabase_client = get_supabase()
    thread_response = (
        supabase_client.table("lead_threads")
        .select("*")
        .eq("id", thread_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not thread_response.data:
        raise ValueError(f"Thread not found: {thread_id}")

    thread = thread_response.data[0]

    message_response = (
        supabase_client.table("messages")
        .select("id,direction,content,timestamp")
        .eq("thread_id", thread_id)
        .order("timestamp", desc=True)
        .limit(10)
        .execute()
    )
    latest_messages = list(reversed(message_response.data or []))
    message_pairs = _pair_messages(latest_messages)

    profile_response = (
        supabase_client.table("business_profiles")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not profile_response.data:
        raise ValueError(f"Business profile not found for user: {user_id}")

    business_profile = profile_response.data[0]

    return {
        "thread": thread,
        "messages": message_pairs,
        "business_profile": business_profile,
    }
