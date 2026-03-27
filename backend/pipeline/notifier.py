from __future__ import annotations

from app.core.supabase import get_supabase


def save_drafts_and_notify(supabase_client, thread_id: str, drafts: dict, agent_id: str = "gmail_followup") -> dict:
    if supabase_client is None:
        supabase_client = get_supabase()
    draft_payload = {
        "thread_id": thread_id,
        "agent_id": agent_id,
        "draft_1": drafts["draft_1"],
        "draft_2": drafts["draft_2"],
        "draft_3": drafts["draft_3"],
        "status": "pending",
    }

    insert_response = supabase_client.table("drafts").insert(draft_payload).execute()
    if not insert_response.data:
        raise RuntimeError(f"Failed to create draft record for thread {thread_id}")

    draft_record = insert_response.data[0]

    # Fetch current follow_up_count and increment it.
    thread_resp = supabase_client.table("lead_threads").select("follow_up_count").eq("id", thread_id).limit(1).execute()
    current_count = (thread_resp.data[0]["follow_up_count"] if thread_resp.data else 0) or 0
    supabase_client.table("lead_threads").update({
        "status": "pending_approval",
        "follow_up_count": current_count + 1,
    }).eq("id", thread_id).execute()

    return draft_record
