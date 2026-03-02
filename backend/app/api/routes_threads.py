from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user
from app.middleware.subscription import require_active_subscription
from app.core.supabase import get_supabase
from pipeline.classifier import ClassificationError, classify_thread
from pipeline.draft_generator import generate_drafts
from pipeline.notifier import save_drafts_and_notify
from pipeline.thread_loader import load_thread_context

supabase = get_supabase()

router = APIRouter(tags=["threads"], dependencies=[Depends(require_active_subscription)])


@router.get("/threads")
def get_threads(current_user=Depends(get_current_user)):
    threads_response = (
        supabase.table("lead_threads")
        .select(
            "id,user_id,contact_name,contact_email,contact_phone,channel,status,last_inbound_at,last_outbound_at,follow_up_count,created_at,gmail_thread_id"
        )
        .eq("user_id", current_user.id)
        .in_("status", ["active", "pending_approval", "needs_review"])
        .order("last_inbound_at", desc=True)
        .limit(50)
        .execute()
    )

    threads = threads_response.data or []

    enriched: List[Dict[str, Any]] = []
    for thread in threads:
        message_response = (
            supabase.table("messages")
            .select("content,timestamp,direction,gmail_message_id")
            .eq("thread_id", thread["id"])
            .order("timestamp", desc=True)
            .limit(1)
            .execute()
        )

        last_message = message_response.data[0] if message_response.data else None
        preview = (last_message.get("content", "") if last_message else "")[:100]

        enriched.append(
            {
                **thread,
                "last_message_preview": preview,
                "last_message": last_message,
            }
        )

    return {"threads": enriched}


@router.get("/drafts/{thread_id}")
def get_thread_drafts(thread_id: str, current_user=Depends(get_current_user)):
    thread_response = (
        supabase.table("lead_threads")
        .select("id")
        .eq("id", thread_id)
        .eq("user_id", current_user.id)
        .limit(1)
        .execute()
    )

    if not thread_response.data:
        raise HTTPException(status_code=404, detail="Thread not found")

    drafts_response = (
        supabase.table("drafts")
        .select("id,thread_id,draft_1,draft_2,draft_3,selected_draft,status,created_at")
        .eq("thread_id", thread_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not drafts_response.data:
        return {"drafts": None}

    return {"drafts": drafts_response.data[0]}


@router.post("/threads/{thread_id}/generate-follow-up")
def generate_follow_up_for_thread(thread_id: str, current_user=Depends(get_current_user)):
    thread_response = (
        supabase.table("lead_threads")
        .select("id,user_id,status")
        .eq("id", thread_id)
        .eq("user_id", current_user.id)
        .limit(1)
        .execute()
    )
    if not thread_response.data:
        raise HTTPException(status_code=404, detail="Thread not found")

    thread = thread_response.data[0]
    if thread.get("status") == "closed":
        raise HTTPException(status_code=400, detail="Cannot generate follow-up for closed thread")

    print(f"DEBUG: Generating follow-up for thread {thread_id}...")
    try:
        context = load_thread_context(supabase, thread_id=thread_id, user_id=current_user.id)
        print(f"DEBUG: Context loaded. Calling classifier for thread {thread_id}...")
        classification = classify_thread(context)
        print(f"DEBUG: Thread {thread_id} classified: {classification}")
    except ClassificationError as exc:
        (
            supabase.table("lead_threads")
            .update({"status": "needs_review"})
            .eq("id", thread_id)
            .execute()
        )
        return {
            "status": "needs_review",
            "thread_id": thread_id,
            "reason": str(exc),
        }
    except Exception as exc:
        (
            supabase.table("lead_threads")
            .update({"status": "needs_review"})
            .eq("id", thread_id)
            .execute()
        )
        return {
            "status": "needs_review",
            "thread_id": thread_id,
            "reason": f"classification_failed: {exc}",
        }

    try:
        drafts = generate_drafts(context, classification, desired_outcome="ask_decision")
        draft_id = save_drafts_and_notify(supabase, thread_id=thread_id, drafts=drafts)
    except Exception as exc:
        (
            supabase.table("lead_threads")
            .update({"status": "needs_review"})
            .eq("id", thread_id)
            .execute()
        )
        return {
            "status": "needs_review",
            "thread_id": thread_id,
            "reason": f"draft_generation_failed: {exc}",
        }

    return {"status": "queued_for_approval", "thread_id": thread_id, "draft_id": draft_id}
