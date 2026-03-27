from __future__ import annotations

from typing import Any

from app.core.supabase import get_supabase


from datetime import datetime, timedelta, timezone

def get_threads_to_follow_up(supabase_client=None, agent_id: str = "gmail_followup") -> list[dict[str, Any]]:
    if supabase_client is None:
        supabase_client = get_supabase()
    
    # 48 hour threshold for follow-up
    threshold_dt = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
    
    # Fetch active threads for this agent
    response = (
        supabase_client.table("lead_threads")
        .select("*")
        .eq("agent_id", agent_id)
        .eq("status", "active")
        .execute()
    )
    threads = response.data or []
    
    to_follow_up = []
    for thread in threads:
        last_inbound = thread.get("last_inbound_at")
        last_outbound = thread.get("last_outbound_at")
        
        # Case A: Lead sent last, no salesperson reply, older than threshold
        if last_inbound and (not last_outbound or last_inbound > last_outbound):
            if last_inbound < threshold_dt:
                to_follow_up.append(thread)
                continue
                
        # Case B: Salesperson sent last, no lead reply, older than threshold
        if last_outbound and (not last_inbound or last_outbound > last_inbound):
            if last_outbound < threshold_dt:
                to_follow_up.append(thread)
                continue
                
    return to_follow_up
