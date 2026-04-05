from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from app.api.deps import get_current_user, validate_agent_id
from app.core.limiter import limiter, user_or_ip_key_func
from app.middleware.subscription import require_active_subscription
from app.core.supabase import get_supabase
from app.core.utils import parse_supabase_timestamp
from integrations.gmail.client import GmailDisconnectedError, fetch_parsed_thread
from pipeline.draft_generator import generate_drafts
from pipeline.notifier import save_drafts_and_notify
from pipeline.thread_loader import load_thread_context

supabase = get_supabase()

router = APIRouter(tags=["threads"])
logger = logging.getLogger(__name__)


def _get_current_gmail_account_email(user_id: str, agent_id: str) -> str | None:
    response = (
        supabase.table("gmail_connections")
        .select("email,status")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if not response.data:
        return None
    row = response.data[0]
    if row.get("status") == "disconnected":
        return None
    email = (row.get("email") or "").strip().lower()
    return email or None


def _stored_recent_messages(thread_id: str, limit: int = 2) -> list[dict[str, Any]]:
    message_response = (
        supabase.table("messages")
        .select("subject,timestamp,direction,gmail_message_id,has_attachments,attachment_names,preview_snippet")
        .eq("thread_id", thread_id)
        .order("timestamp", desc=True)
        .limit(limit)
        .execute()
    )
    return list(reversed(message_response.data or []))


def _live_recent_messages(user_id: str, agent_id: str, gmail_thread_id: str, limit: int = 2) -> list[dict[str, Any]]:
    parsed_thread = fetch_parsed_thread(
        user_id=user_id,
        agent_id=agent_id,
        gmail_thread_id=gmail_thread_id,
    )
    return [
        {
            "content": message.get("body", "") or "",
            "subject": message.get("subject"),
            "timestamp": message.get("timestamp"),
            "direction": message.get("direction"),
            "gmail_message_id": message.get("gmail_message_id"),
            "has_attachments": bool(message.get("has_attachments")),
            "attachment_names": message.get("attachment_names") or [],
        }
        for message in parsed_thread.get("messages", [])[-limit:]
    ]


def _parse_iso(value: str | None) -> datetime | None:
    dt = parse_supabase_timestamp(value.strip() if value else value)
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class ThreadUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Optional[Literal["active"]] = None


def _fetch_threads_response(user_id: str, agent_id: str):
    gmail_account_email = _get_current_gmail_account_email(user_id, agent_id)
    if not gmail_account_email:
        return type("Result", (), {"data": []})()

    try:
        return (
            supabase.table("lead_threads")
            .select(
                "id,user_id,agent_id,gmail_account_email,contact_name,contact_email,contact_phone,subject,channel,status,close_reason,last_inbound_at,last_outbound_at,follow_up_count,created_at,gmail_thread_id"
            )
            .eq("user_id", user_id)
            .eq("agent_id", agent_id)
            .eq("gmail_account_email", gmail_account_email)
            .in_("status", ["active", "pending_approval", "needs_review", "closed"])
            .order("last_inbound_at", desc=True)
            .execute()
        )
    except Exception:
        fallback = (
            supabase.table("lead_threads")
            .select(
                "id,user_id,agent_id,gmail_account_email,contact_name,contact_email,contact_phone,subject,channel,status,last_inbound_at,last_outbound_at,follow_up_count,created_at,gmail_thread_id"
            )
            .eq("user_id", user_id)
            .eq("agent_id", agent_id)
            .eq("gmail_account_email", gmail_account_email)
            .in_("status", ["active", "pending_approval", "needs_review", "closed"])
            .order("last_inbound_at", desc=True)
            .execute()
        )
        for row in fallback.data or []:
            row["close_reason"] = None
        return fallback


@router.get("/threads")
@router.get("/agents/{agent_id}/threads")
async def get_threads(agent_id: str = "gmail_followup", current_user=Depends(get_current_user), _=Depends(require_active_subscription)):
    agent_id = validate_agent_id(agent_id)
    threads_response = _fetch_threads_response(current_user.id, agent_id)

    threads = threads_response.data or []
    thread_ids = [thread.get("id") for thread in threads if thread.get("id")]

    pending_draft_thread_ids: set[str] = set()
    if thread_ids:
        drafts_response = (
            supabase.table("drafts")
            .select("thread_id,status,created_at")
            .in_("thread_id", thread_ids)
            .eq("agent_id", agent_id)
            .order("created_at", desc=True)
            .execute()
        )
        latest_draft_by_thread: dict[str, dict[str, Any]] = {}
        for row in drafts_response.data or []:
            thread_id = row.get("thread_id")
            if not thread_id or thread_id in latest_draft_by_thread:
                continue
            latest_draft_by_thread[thread_id] = row

        for thread in threads:
            thread_id = thread.get("id")
            if not thread_id:
                continue
            latest_draft = latest_draft_by_thread.get(thread_id)
            if not latest_draft or latest_draft.get("status") != "pending":
                continue

            latest_draft_at = _parse_iso(latest_draft.get("created_at"))
            last_outbound_at = _parse_iso(thread.get("last_outbound_at"))

            # If a message was already sent after this draft was created, treat it as no longer pending.
            if latest_draft_at and last_outbound_at and last_outbound_at >= latest_draft_at:
                continue

            pending_draft_thread_ids.add(thread_id)

    enriched: List[Dict[str, Any]] = []
    for thread in threads:
        recent_messages = _stored_recent_messages(thread["id"], limit=2)
        last_message = recent_messages[-1] if recent_messages else None
        subject = (thread.get("subject") or "").strip()
        if not subject and last_message:
            subject = (last_message.get("subject") or "").strip()

        enriched.append(
            {
                **thread,
                "subject": subject or None,
                "has_pending_draft": thread.get("id") in pending_draft_thread_ids,
                "has_attachments": any(bool(message.get("has_attachments")) for message in recent_messages),
                "last_message_preview": (last_message.get("preview_snippet", "") if last_message else ""),
                "last_message": last_message,
                "recent_messages": recent_messages,
                "message_count": (
                    supabase.table("messages")
                    .select("id", count="exact")
                    .eq("thread_id", thread["id"])
                    .execute()
                    .count
                    or 0
                ),
                "stage_label": None,
            }
        )

    return {"threads": enriched}


@router.patch("/threads/{thread_id}")
@router.patch("/agents/{agent_id}/threads/{thread_id}")
async def update_thread(
    thread_id: str,
    payload: ThreadUpdateRequest,
    agent_id: str = "gmail_followup",
    current_user=Depends(get_current_user),
    _=Depends(require_active_subscription),
):
    agent_id = validate_agent_id(agent_id)
    thread_id_str = str(UUID(thread_id))
    gmail_account_email = _get_current_gmail_account_email(current_user.id, agent_id)
    thread_response = (
        supabase.table("lead_threads")
        .select("id,status,close_reason,follow_up_count")
        .eq("id", thread_id_str)
        .eq("user_id", current_user.id)
        .eq("agent_id", agent_id)
        .eq("gmail_account_email", gmail_account_email)
        .limit(1)
        .execute()
    )
    if not thread_response.data:
        raise HTTPException(status_code=404, detail="Thread not found")

    if payload.status == "active":
        try:
            updated = (
                supabase.table("lead_threads")
                .update({
                    "status": "active",
                    "close_reason": None,
                    "follow_up_count": 0,
                })
                .eq("id", thread_id_str)
                .eq("user_id", current_user.id)
                .eq("agent_id", agent_id)
                .execute()
            )
        except Exception:
            updated = (
                supabase.table("lead_threads")
                .update({
                    "status": "active",
                    "follow_up_count": 0,
                })
                .eq("id", thread_id_str)
                .eq("user_id", current_user.id)
                .eq("agent_id", agent_id)
                .execute()
            )
        logger.info("Thread %s reopened manually", thread_id_str)
        return {"thread": updated.data[0] if updated.data else None}

    raise HTTPException(status_code=400, detail="Unsupported thread update")


@router.post("/threads/{thread_id}/ignore")
@router.post("/agents/{agent_id}/threads/{thread_id}/ignore")
async def ignore_thread(
    thread_id: str,
    agent_id: str = "gmail_followup",
    current_user=Depends(get_current_user),
    _=Depends(require_active_subscription),
):
    agent_id = validate_agent_id(agent_id)
    thread_id_str = str(UUID(thread_id))
    gmail_account_email = _get_current_gmail_account_email(current_user.id, agent_id)
    thread_response = (
        supabase.table("lead_threads")
        .select("id")
        .eq("id", thread_id_str)
        .eq("user_id", current_user.id)
        .eq("agent_id", agent_id)
        .eq("gmail_account_email", gmail_account_email)
        .limit(1)
        .execute()
    )
    if not thread_response.data:
        raise HTTPException(status_code=404, detail="Thread not found")

    updated = (
        supabase.table("lead_threads")
        .update({"status": "ignored"})
        .eq("id", thread_id_str)
        .eq("user_id", current_user.id)
        .eq("agent_id", agent_id)
        .execute()
    )
    logger.info("Thread %s ignored manually", thread_id_str)
    return {"success": True}


@router.get("/drafts/{thread_id}")
@router.get("/agents/{agent_id}/drafts/{thread_id}")
async def get_thread_drafts(thread_id: str, agent_id: str = "gmail_followup", current_user=Depends(get_current_user), _=Depends(require_active_subscription)):
    agent_id = validate_agent_id(agent_id)
    thread_id_str = str(UUID(thread_id))
    gmail_account_email = _get_current_gmail_account_email(current_user.id, agent_id)
    thread_response = (
        supabase.table("lead_threads")
        .select("id")
        .eq("id", thread_id_str)
        .eq("user_id", current_user.id)
        .eq("agent_id", agent_id)
        .eq("gmail_account_email", gmail_account_email)
        .limit(1)
        .execute()
    )

    if not thread_response.data:
        raise HTTPException(status_code=404, detail="Thread not found")

    drafts_response = (
        supabase.table("drafts")
        .select("id,thread_id,draft_1,draft_2,draft_3,selected_draft,status,created_at")
        .eq("thread_id", thread_id_str)
        .eq("agent_id", agent_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not drafts_response.data:
        return {"drafts": None}

    return {"drafts": drafts_response.data[0]}


@router.get("/threads/{thread_id}/recent-messages")
@router.get("/agents/{agent_id}/threads/{thread_id}/recent-messages")
async def get_thread_recent_messages(thread_id: str, agent_id: str = "gmail_followup", current_user=Depends(get_current_user), _=Depends(require_active_subscription)):
    agent_id = validate_agent_id(agent_id)
    thread_id_str = str(UUID(thread_id))
    gmail_account_email = _get_current_gmail_account_email(current_user.id, agent_id)
    thread_response = (
        supabase.table("lead_threads")
        .select("id,subject,gmail_thread_id")
        .eq("id", thread_id_str)
        .eq("user_id", current_user.id)
        .eq("agent_id", agent_id)
        .eq("gmail_account_email", gmail_account_email)
        .limit(1)
        .execute()
    )
    if not thread_response.data:
        raise HTTPException(status_code=404, detail="Thread not found")

    thread_row = thread_response.data[0]
    gmail_thread_id = thread_row.get("gmail_thread_id")
    try:
        recent_messages = (
            _live_recent_messages(
                user_id=current_user.id,
                agent_id=agent_id,
                gmail_thread_id=gmail_thread_id,
                limit=2,
            )
            if gmail_thread_id
            else []
        )
    except GmailDisconnectedError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except Exception:
        logger.exception("Failed to fetch live Gmail messages for thread %s", thread_id_str)
        recent_messages = _stored_recent_messages(thread_id_str, limit=2)

    subject = (thread_row.get("subject") or "").strip()
    if not subject and recent_messages:
        subject = (recent_messages[-1].get("subject") or "").strip()

    return {
        "thread_id": thread_id_str,
        "subject": subject or None,
        "recent_messages": recent_messages,
    }


@router.post("/threads/{thread_id}/generate-follow-up")
@router.post("/agents/{agent_id}/threads/{thread_id}/generate-follow-up")
@limiter.limit("30/hour", key_func=user_or_ip_key_func)
async def generate_follow_up_for_thread(
    request: Request,
    thread_id: str,
    agent_id: str = "gmail_followup",
    current_user=Depends(get_current_user),
    _=Depends(require_active_subscription),
):
    agent_id = validate_agent_id(agent_id)
    thread_id_str = str(UUID(thread_id))
    gmail_account_email = _get_current_gmail_account_email(current_user.id, agent_id)
    thread_response = (
        supabase.table("lead_threads")
        .select("id,user_id,status")
        .eq("id", thread_id_str)
        .eq("user_id", current_user.id)
        .eq("agent_id", agent_id)
        .eq("gmail_account_email", gmail_account_email)
        .limit(1)
        .execute()
    )
    if not thread_response.data:
        raise HTTPException(status_code=404, detail="Thread not found")

    thread = thread_response.data[0]
    if thread.get("status") == "closed":
        raise HTTPException(status_code=400, detail="Cannot generate follow-up for closed thread")

    logger.info("Generating follow-up for thread %s (user=%s)", thread_id_str, current_user.id)
    try:
        context = load_thread_context(supabase, thread_id=thread_id_str, user_id=current_user.id, agent_id=agent_id)
        logger.info("Context loaded for thread %s", thread_id_str)

        # Guard against excessively large context (potential injection vector).
        MAX_THREAD_CONTENT_LENGTH = 10000
        import json as _json
        context_json = _json.dumps(context.get("messages", []), default=str)
        if len(context_json) > MAX_THREAD_CONTENT_LENGTH:
            logger.warning(
                "Thread content truncated for thread %s — exceeded maximum length (%d chars)",
                thread_id_str, len(context_json),
            )
    except GmailDisconnectedError as exc:
        logger.warning("Gmail disconnected while loading thread context for thread %s: %s", thread_id_str, exc)
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Context loading failed for thread %s: %s", thread_id_str, exc)
        (
            supabase.table("lead_threads")
            .update({"status": "needs_review"})
            .eq("id", thread_id_str)
            .execute()
        )
        return {
            "status": "needs_review",
            "thread_id": thread_id_str,
            "reason": "context_load_failed",
        }

    try:
        drafts = generate_drafts(context, None, desired_outcome="ask_decision")
        draft_record = save_drafts_and_notify(supabase, thread_id=thread_id_str, drafts=drafts, agent_id=agent_id)
        logger.info("Drafts generated and saved for thread %s", thread_id_str)
    except Exception as exc:
        logger.exception("Draft generation failed for thread %s: %s", thread_id_str, exc)
        (
            supabase.table("lead_threads")
            .update({"status": "needs_review"})
            .eq("id", thread_id_str)
            .execute()
        )
        return {
            "status": "needs_review",
            "thread_id": thread_id_str,
            "reason": "draft_generation_failed",
        }

    return {"status": "queued_for_approval", "thread_id": thread_id_str, "draft_id": draft_record["id"], "drafts": draft_record}
