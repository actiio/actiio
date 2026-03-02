from __future__ import annotations

from typing import Any, Dict

from app.core.supabase import get_supabase

supabase = get_supabase()
from integrations.whatsapp.auth import get_connection_by_phone_number_id
from integrations.whatsapp.parser import parse_inbound_messages


def _find_or_create_thread(user_id: str, parsed_message: Dict[str, Any]) -> str:
    wa_id = parsed_message.get("from_wa_id")

    existing = (
        supabase.table("lead_threads")
        .select("id")
        .eq("user_id", user_id)
        .eq("whatsapp_chat_id", wa_id)
        .limit(1)
        .execute()
    )

    if existing.data:
        return existing.data[0]["id"]

    created = (
        supabase.table("lead_threads")
        .insert(
            {
                "user_id": user_id,
                "contact_name": parsed_message.get("contact_name"),
                "contact_phone": wa_id,
                "whatsapp_chat_id": wa_id,
                "channel": "whatsapp",
                "status": "active",
            }
        )
        .execute()
    )

    return created.data[0]["id"]


def handle_webhook_event(payload: Dict[str, Any]) -> Dict[str, Any]:
    parsed_messages = parse_inbound_messages(payload)
    processed = 0

    for message in parsed_messages:
        phone_number_id = message.get("phone_number_id")
        if not phone_number_id:
            continue

        connection = get_connection_by_phone_number_id(phone_number_id)
        user_id = connection["user_id"]

        thread_id = _find_or_create_thread(user_id, message)

        exists = (
            supabase.table("messages")
            .select("id")
            .eq("thread_id", thread_id)
            .eq("whatsapp_message_id", message.get("whatsapp_message_id"))
            .limit(1)
            .execute()
        )
        if exists.data:
            continue

        (
            supabase.table("messages")
            .insert(
                {
                    "thread_id": thread_id,
                    "direction": "inbound",
                    "content": message.get("content", ""),
                    "timestamp": message.get("timestamp"),
                    "whatsapp_message_id": message.get("whatsapp_message_id"),
                }
            )
            .execute()
        )

        (
            supabase.table("lead_threads")
            .update(
                {
                    "status": "active",
                    "last_inbound_at": message.get("timestamp"),
                    "contact_name": message.get("contact_name"),
                    "contact_phone": message.get("from_wa_id"),
                    "whatsapp_chat_id": message.get("from_wa_id"),
                }
            )
            .eq("id", thread_id)
            .execute()
        )

        processed += 1

    return {"status": "ok", "processed": processed}
