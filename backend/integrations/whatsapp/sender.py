from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict

import httpx

from app.core.config import get_settings
from app.core.supabase import get_supabase

supabase = get_supabase()
from integrations.whatsapp.auth import get_connection


def _get_thread(user_id: str, thread_id: str) -> Dict:
    response = (
        supabase.table("lead_threads")
        .select("id,contact_phone,whatsapp_chat_id")
        .eq("id", thread_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise ValueError("Lead thread not found")

    return response.data[0]


def send_whatsapp(user_id: str, thread_id: str, message_body: str) -> Dict:
    connection = get_connection(user_id)
    thread = _get_thread(user_id, thread_id)

    to_number = thread.get("whatsapp_chat_id") or thread.get("contact_phone")
    if not to_number:
        raise ValueError("Thread contact phone is required to send WhatsApp message")

    settings = get_settings()
    api_version = settings.whatsapp_api_version or "v21.0"

    url = f"https://graph.facebook.com/{api_version}/{connection['phone_number_id']}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "text",
        "text": {"body": message_body},
    }
    headers = {"Authorization": f"Bearer {connection['access_token']}", "Content-Type": "application/json"}

    with httpx.Client(timeout=20.0) as client:
        resp = client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    message_id = (data.get("messages") or [{}])[0].get("id")
    now = datetime.now(timezone.utc).isoformat()

    (
        supabase.table("messages")
        .insert(
            {
                "thread_id": thread_id,
                "direction": "outbound",
                "content": message_body,
                "timestamp": now,
                "whatsapp_message_id": message_id,
            }
        )
        .execute()
    )

    (
        supabase.table("lead_threads")
        .update({"status": "active", "last_outbound_at": now})
        .eq("id", thread_id)
        .execute()
    )

    return {"whatsapp_message_id": message_id, "thread_id": thread_id}
