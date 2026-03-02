from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from anthropic import Anthropic

from app.core.config import get_settings
from app.core.supabase import get_supabase
from integrations.gmail.parser import parse_thread

supabase = get_supabase()

LEAD_CLASSIFIER_SYSTEM_PROMPT = """You are a sales lead classifier. Your job is to determine if an email thread represents an active sales conversation — meaning a real human being is a potential buyer, prospect, or lead for a product or service.

Reply with only the word YES or NO. No explanation.

Classify as YES if:
- Someone is inquiring about a product or service
- There is a quote, proposal, or pricing discussion
- Someone expressed interest in buying or learning more
- There is a follow-up on a previous sales conversation

Classify as NO if:
- This is a newsletter or marketing email
- This is an automated notification or receipt
- This is an internal team conversation
- This is a calendar invite or scheduling system email
- This is a support ticket or customer service thread
- There is no clear buying intent"""


def is_obvious_non_lead_thread(parsed_thread: Dict[str, Any]) -> bool:
    messages = parsed_thread.get("messages", [])
    if not messages:
        return True

    inbound_messages = [m for m in messages if m.get("direction") == "inbound"]
    if not inbound_messages:
        return True

    # If all inbound messages are clearly automated/promotional, skip classification.
    if all((m.get("is_automated") or m.get("is_promotional")) for m in inbound_messages):
        return True

    combined_text = " ".join(
        f"{m.get('subject', '')} {m.get('body', '')}".lower() for m in inbound_messages
    )
    hard_no_lead_keywords = (
        "unsubscribe",
        "newsletter",
        "view in browser",
        "manage preferences",
        "payment receipt",
        "order confirmation",
        "automated message",
        "this is an automated",
        "support ticket",
        "calendar invite",
        "do not reply",
    )
    return any(keyword in combined_text for keyword in hard_no_lead_keywords)


def _anthropic_client() -> Anthropic:
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is required for Gmail lead classification")
    return Anthropic(api_key=settings.anthropic_api_key)


def _call_ollama(system_prompt: str, user_prompt: str) -> str:
    settings = get_settings()
    base_url = (settings.ollama_base_url or "http://localhost:11434").rstrip("/")
    model = settings.ollama_model or "qwen2.5:7b"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "options": {"temperature": 0},
    }
    with httpx.Client(timeout=300.0) as client:
        response = client.post(f"{base_url}/api/chat", json=payload)
        response.raise_for_status()
        data = response.json()
    return ((data.get("message") or {}).get("content") or "").strip().upper()


def _format_thread(thread_messages: List[Dict[str, Any]]) -> str:
    lines: List[str] = []
    for message in thread_messages:
        sender_name = (message.get("sender_name") or "").strip()
        sender_email = (message.get("sender_email") or "").strip()
        sender = sender_name or sender_email or message.get("direction", "unknown")
        timestamp = message.get("timestamp") or "unknown-time"
        body = (message.get("body") or "").strip()
        if len(body) > 1200:
            body = body[:1200] + "...[truncated]"
        lines.append(f"[{timestamp}] {sender}: {body}")
    return "\n".join(lines)


def _extract_response_text(content_blocks: List[Any]) -> str:
    text_chunks: List[str] = []
    for block in content_blocks:
        text = getattr(block, "text", None)
        if text:
            text_chunks.append(text.strip())
    return " ".join(text_chunks).strip().upper()


def _call_openai(system_prompt: str, user_prompt: str) -> str:
    settings = get_settings()
    if not settings.openai_api_key:
         raise RuntimeError("OPENAI_API_KEY is required for Gmail lead classification when AI_PROVIDER is openai")
    
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.openai_model or "gpt-4o",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0,
    }

    print(f"DEBUG: Calling OpenAI model {payload['model']} for lead sync...")
    with httpx.Client(timeout=600.0) as client:
        response = client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()

    return (data["choices"][0]["message"]["content"] or "").strip().upper()


def classify_is_lead(thread_messages: List[Dict[str, Any]]) -> bool:
    formatted_thread = _format_thread(thread_messages)
    user_prompt = f"""Here is the email thread:
{formatted_thread}

Is this a sales lead conversation?"""

    settings = get_settings()
    provider = (settings.ai_provider or "ollama").lower()

    if provider == "ollama":
        response_text = _call_ollama(LEAD_CLASSIFIER_SYSTEM_PROMPT, user_prompt)
    elif provider == "openai":
        response_text = _call_openai(LEAD_CLASSIFIER_SYSTEM_PROMPT, user_prompt)
    else:
        client = _anthropic_client()
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            system=LEAD_CLASSIFIER_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
            temperature=0,
            max_tokens=8,
        )
        response_text = _extract_response_text(response.content)
    return response_text.startswith("YES")


def _select_last_message_pairs(messages: List[Dict[str, Any]], pair_count: int = 5) -> List[Dict[str, Any]]:
    if not messages:
        return []
    max_messages = pair_count * 2
    return messages[-max_messages:]


def _last_timestamp(messages: List[Dict[str, Any]], direction: str) -> Optional[str]:
    values = [m.get("timestamp") for m in messages if m.get("direction") == direction and m.get("timestamp")]
    if not values:
        return None
    return max(values)


def _upsert_lead_thread(user_id: str, parsed_thread: Dict[str, Any], classified_at: str) -> str:
    existing = (
        supabase.table("lead_threads")
        .select("id")
        .eq("user_id", user_id)
        .eq("gmail_thread_id", parsed_thread["gmail_thread_id"])
        .limit(1)
        .execute()
    )

    messages = parsed_thread.get("messages", [])
    payload = {
        "user_id": user_id,
        "contact_name": parsed_thread.get("contact_name"),
        "contact_email": parsed_thread.get("contact_email"),
        "channel": "gmail",
        "gmail_thread_id": parsed_thread["gmail_thread_id"],
        "status": "active",
        "last_inbound_at": _last_timestamp(messages, "inbound"),
        "last_outbound_at": _last_timestamp(messages, "outbound"),
        "last_classified_at": classified_at,
    }

    if existing.data:
        thread_id = existing.data[0]["id"]
        supabase.table("lead_threads").update(payload).eq("id", thread_id).execute()
        return thread_id

    created = supabase.table("lead_threads").insert(payload).execute()
    return created.data[0]["id"]


def _store_messages(thread_id: str, messages: List[Dict[str, Any]]) -> None:
    for message in messages:
        gmail_message_id = message.get("gmail_message_id")
        if not gmail_message_id:
            continue

        exists = (
            supabase.table("messages")
            .select("id")
            .eq("thread_id", thread_id)
            .eq("gmail_message_id", gmail_message_id)
            .limit(1)
            .execute()
        )
        if exists.data:
            continue

        supabase.table("messages").insert(
            {
                "thread_id": thread_id,
                "direction": message.get("direction", "inbound"),
                "content": message.get("body", "") or "",
                "timestamp": message.get("timestamp"),
                "gmail_message_id": gmail_message_id,
            }
        ).execute()


def _store_lead_thread(user_id: str, parsed_thread: Dict[str, Any]) -> str:
    classified_at = datetime.now(timezone.utc).isoformat()
    thread_id = _upsert_lead_thread(user_id=user_id, parsed_thread=parsed_thread, classified_at=classified_at)
    recent_window = _select_last_message_pairs(parsed_thread.get("messages", []), pair_count=5)
    _store_messages(thread_id, recent_window)
    return thread_id


def initial_sync(user_id: str, gmail_service: Any) -> int:
    profile = gmail_service.users().getProfile(userId="me").execute()
    owner_email = profile.get("emailAddress")
    (
        supabase.table("gmail_connections")
        .update({"email": owner_email})
        .eq("user_id", user_id)
        .execute()
    )

    query = "newer_than:7d -category:promotions -category:social -category:updates -category:forums"
    list_response = gmail_service.users().threads().list(userId="me", maxResults=100, q=query).execute()
    thread_ids = list_response.get("threads", [])

    leads_found = 0
    for thread_ref in thread_ids:
        raw_thread = gmail_service.users().threads().get(userId="me", id=thread_ref["id"], format="full").execute()
        parsed_thread = parse_thread(raw_thread, owner_email=owner_email)

        messages = parsed_thread.get("messages", [])
        if is_obvious_non_lead_thread(parsed_thread):
            continue

        if not classify_is_lead(messages):
            continue

        _store_lead_thread(user_id=user_id, parsed_thread=parsed_thread)
        leads_found += 1

    return leads_found


def sync_recent_threads(user_id: str, gmail_service: Any) -> int:
    # Backward-compatible alias for existing route callers.
    return initial_sync(user_id=user_id, gmail_service=gmail_service)


def track_thread_if_lead(user_id: str, parsed_thread: Dict[str, Any]) -> Optional[str]:
    if is_obvious_non_lead_thread(parsed_thread):
        return None
    messages = parsed_thread.get("messages", [])
    if not classify_is_lead(messages):
        return None
    return _store_lead_thread(user_id=user_id, parsed_thread=parsed_thread)
