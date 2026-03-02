from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.core.supabase import get_supabase


def _parse_timestamp(value: Optional[str]) -> Optional[datetime]:
    if value is None:
        return None
    # Supabase returns UTC timestamps as ISO8601, often ending with Z.
    return datetime.fromisoformat(value.replace("Z", "+00:00"))

def get_threads_to_follow_up(supabase_client=None) -> list[dict[str, Any]]:
    if supabase_client is None:
        supabase_client = get_supabase()
    profiles_response = supabase_client.table("business_profiles").select("user_id,silence_threshold_hours").execute()
    profiles = profiles_response.data or []

    flagged_threads: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc)

    for profile in profiles:
        user_id = profile.get("user_id")
        if not user_id:
            continue

        silence_threshold_hours = int(profile.get("silence_threshold_hours") or 48)
        cutoff = now - timedelta(hours=silence_threshold_hours)
        cutoff_iso = cutoff.isoformat()

        threads_response = (
            supabase_client.table("lead_threads")
            .select(
                "id,user_id,status,last_inbound_at,last_outbound_at,channel,contact_name,contact_email,contact_phone,escalation_level,follow_up_count,created_at"
            )
            .eq("user_id", user_id)
            .eq("status", "active")
            .not_.is_("last_inbound_at", "null")
            .lt("last_inbound_at", cutoff_iso)
            .lt("follow_up_count", 4)
            .execute()
        )

        threads = threads_response.data or []
        for thread in threads:
            last_inbound_at = _parse_timestamp(thread.get("last_inbound_at"))
            if last_inbound_at is None:
                continue

            last_outbound_at = _parse_timestamp(thread.get("last_outbound_at"))
            if last_outbound_at is not None and last_outbound_at >= last_inbound_at:
                continue

            flagged_threads.append(thread)

    return flagged_threads
