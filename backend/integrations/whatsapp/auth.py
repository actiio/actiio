from __future__ import annotations

from typing import Dict

from app.core.supabase import get_supabase

supabase = get_supabase()


def save_connection(
    user_id: str,
    phone_number_id: str,
    access_token: str,
    business_account_id: str = "",
    display_phone_number: str = "",
) -> Dict:
    response = (
        supabase.table("whatsapp_connections")
        .upsert(
            {
                "user_id": user_id,
                "phone_number_id": phone_number_id,
                "access_token": access_token,
                "business_account_id": business_account_id or None,
                "display_phone_number": display_phone_number or None,
            },
            on_conflict="user_id",
        )
        .execute()
    )

    if not response.data:
        raise ValueError("Failed to save WhatsApp connection")

    return response.data[0]


def get_connection(user_id: str) -> Dict:
    response = (
        supabase.table("whatsapp_connections")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise ValueError("WhatsApp connection not found")

    return response.data[0]


def get_connection_by_phone_number_id(phone_number_id: str) -> Dict:
    response = (
        supabase.table("whatsapp_connections")
        .select("*")
        .eq("phone_number_id", phone_number_id)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise ValueError("WhatsApp connection not found for phone_number_id")

    return response.data[0]
