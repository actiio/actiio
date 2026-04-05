from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import get_current_user, validate_agent_id
from app.core.supabase import get_supabase
from app.middleware.subscription import require_active_subscription
from app.core.sanitization import sanitize_payload

router = APIRouter(prefix="/agents", tags=["agents"])
supabase = get_supabase()


def _requires_gmail(agent_id: str, channel: str | None) -> bool:
    return channel == "gmail" or agent_id == "gmail_followup"


def _safe_agent_id_set(table_name: str, user_id: str) -> set[str]:
    try:
        query = (
            supabase.table(table_name)
            .select("agent_id")
            .eq("user_id", user_id)
        )
        if table_name == "gmail_connections":
            query = query.eq("is_active", True).eq("status", "connected")
        response = query.execute()
    except Exception:
        return set()
    return {row["agent_id"] for row in (response.data or []) if row.get("agent_id")}


def _legacy_agent_ids(agent_id: str) -> list[str]:
    if agent_id == "gmail_followup":
        return ["follow_up", "actiio"]
    return []


def _has_agent_row(table_name: str, user_id: str, agent_id: str) -> bool:
    try:
        response = (
            supabase.table(table_name)
            .select("id", count="exact")
            .eq("user_id", user_id)
            .eq("agent_id", agent_id)
            .limit(1)
            .execute()
        )
        if response.data:
            return True

        legacy_ids = _legacy_agent_ids(agent_id)
        if not legacy_ids:
            return False

        legacy_response = (
            supabase.table(table_name)
            .select("id,agent_id")
            .eq("user_id", user_id)
            .in_("agent_id", legacy_ids)
            .limit(1)
            .execute()
        )
    except Exception:
        return False

    if not legacy_response.data:
        return False

    legacy_agent_id = legacy_response.data[0].get("agent_id")
    if legacy_agent_id:
        try:
            (
                supabase.table(table_name)
                .update({"agent_id": agent_id})
                .eq("user_id", user_id)
                .eq("agent_id", legacy_agent_id)
                .execute()
            )
        except Exception:
            pass
    return True


def _last_synced_for_agent(user_id: str, agent_id: str) -> str | None:
    table_name = "gmail_connections" if _requires_gmail(agent_id, None) else None
    if not table_name:
        return None
    try:
        response = (
            supabase.table(table_name)
            .select("last_synced_at,created_at")
            .eq("user_id", user_id)
            .eq("agent_id", agent_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
    except Exception:
        return None
    if not response.data:
        return None
    row = response.data[0]
    return row.get("last_synced_at") or row.get("created_at")


def _parse_thread_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _is_waiting_on_you(thread: dict) -> bool:
    status = thread.get("status")
    if status in {"pending_approval", "needs_review"}:
        return True
    if status != "active":
        return False

    last_inbound = _parse_thread_timestamp(thread.get("last_inbound_at"))
    last_outbound = _parse_thread_timestamp(thread.get("last_outbound_at"))

    if last_inbound and (last_outbound is None or last_inbound >= last_outbound):
        return True

    return False


def _is_waiting_on_lead(thread: dict) -> bool:
    return thread.get("status") == "active" and not _is_waiting_on_you(thread)


def _thread_counts_for_agent(user_id: str, agent_id: str) -> dict[str, int | str | None]:
    # Fetch all threads for this user and agent in ONE query instead of multiple count calls
    query = (
        supabase.table("lead_threads")
        .select("id,status,last_inbound_at,last_outbound_at")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
    )
    if _requires_gmail(agent_id, None):
        connection = (
            supabase.table("gmail_connections")
            .select("email,status")
            .eq("user_id", user_id)
            .eq("agent_id", agent_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        row = connection.data[0] if connection.data else {}
        gmail_email = (row.get("email") or "").strip().lower()
        if not gmail_email or row.get("status") == "disconnected":
            return {
                "needs_attention": 0,
                "active_leads": 0,
                "total_leads": 0,
                "last_synced": _last_synced_for_agent(user_id, agent_id),
            }
        query = query.eq("gmail_account_email", gmail_email)
    resp = query.execute()
    threads = resp.data or []
    visible_threads = [thread for thread in threads if thread.get("status") != "ignored"]

    pending_count = sum(1 for t in visible_threads if _is_waiting_on_you(t))
    active_count = sum(1 for t in visible_threads if _is_waiting_on_lead(t))
    total_count = len(visible_threads)

    last_synced = _last_synced_for_agent(user_id, agent_id)

    return {
        "needs_attention": pending_count,
        "active_leads": active_count,
        "total_leads": total_count,
        "last_synced": last_synced,
    }


@router.get("")
def get_agents(current_user=Depends(get_current_user)):
    """Return all agents with the current user's subscription status for each."""
    agents_resp = (
        supabase.table("agents")
        .select("*")
        .order("sort_order")
        .execute()
    )
    agents = agents_resp.data or []

    subs_resp = (
        supabase.table("user_subscriptions")
        .select("*")
        .eq("user_id", current_user.id)
        .execute()
    )
    subs_by_agent = {s["agent_id"]: s for s in (subs_resp.data or [])}

    # Also check waitlist status
    waitlisted_agents = _safe_agent_id_set("agent_waitlist", current_user.id)
    profile_agents = _safe_agent_id_set("business_profiles", current_user.id)

    # Pre-fetch legacy user subscription (so we don't query it inside the loop)
    legacy_user_resp = (
        supabase.table("users")
        .select("subscription_status")
        .eq("id", current_user.id)
        .limit(1)
        .execute()
    )
    legacy_sub_active = legacy_user_resp.data and legacy_user_resp.data[0].get("subscription_status") == "active"

    # Pre-fetch gmail connections in one go
    gmail_connections = _safe_agent_id_set("gmail_connections", current_user.id)

    result = []
    for agent in agents:
        sub = subs_by_agent.get(agent["id"])

        # Fallback to legacy status if no active subscription row is found for gmail_followup
        if (not sub or sub.get("status") != "active") and agent["id"] == "gmail_followup":
            if legacy_sub_active:
                # Create a virtual active subscription for the UI/API checks
                sub = {
                    "id": f"legacy_{current_user.id}",
                    "user_id": current_user.id,
                    "agent_id": agent["id"],
                    "status": "active",
                    "plan": "pro"
                }

        has_profile = agent["id"] in profile_agents
        requires_gmail = _requires_gmail(agent["id"], agent.get("channel"))
        
        has_gmail = False
        if requires_gmail:
            if agent["id"] in gmail_connections:
                has_gmail = True
            else:
                legacy_ids = _legacy_agent_ids(agent["id"])
                if any(lid in gmail_connections for lid in legacy_ids):
                    has_gmail = True

        result.append({
            "agent": agent,
            "subscription": sub,
            "on_waitlist": agent["id"] in waitlisted_agents,
            "business_profile_configured": has_profile,
            "gmail_connected": has_gmail,
            "setup_complete": has_profile and (has_gmail or not requires_gmail),
            "thread_summary": _thread_counts_for_agent(current_user.id, agent["id"]) if sub and sub.get("status") == "active" else None,
        })

    return result


@router.get("/{agent_id}/threads/summary")
def get_agent_threads_summary(
    agent_id: str,
    current_user=Depends(get_current_user),
    _=Depends(require_active_subscription),
):
    agent_id = validate_agent_id(agent_id)
    return _thread_counts_for_agent(current_user.id, agent_id)


@router.get("/summary")
def get_agents_summary(current_user=Depends(get_current_user)):
    # 1. Fetch all threads for THE USER in ONE GO
    threads_resp = (
        supabase.table("lead_threads")
        .select("id,status,agent_id,last_inbound_at,last_outbound_at")
        .eq("user_id", current_user.id)
        .execute()
    )
    all_threads = threads_resp.data or []
    
    # Identify which agents have active subscriptions
    active_subs_resp = (
        supabase.table("user_subscriptions")
        .select("agent_id")
        .eq("user_id", current_user.id)
        .eq("status", "active")
        .execute()
    )
    active_agent_ids = {row["agent_id"] for row in (active_subs_resp.data or []) if row.get("agent_id")}

    # 2. Process counts in Python memory
    total_needs_attention = 0
    total_active_leads = 0
    total_leads = 0
    
    # Filter threads only for active agents
    active_threads = [
        t for t in all_threads
        if t.get("agent_id") in active_agent_ids and t.get("status") != "ignored"
    ]
    
    for t in active_threads:
        if _is_waiting_on_you(t):
            total_needs_attention += 1
        elif _is_waiting_on_lead(t):
            total_active_leads += 1
        total_leads += 1

    # 3. Last week's outbound stats
    week_start = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    thread_ids = [t["id"] for t in active_threads]
    
    follow_ups_sent_this_week = 0
    if thread_ids:
        # Do ONE query for messages in bulk across all threads
        sent_resp = (
            supabase.table("messages")
            .select("id", count="exact")
            .in_("thread_id", thread_ids[:1000]) # Cap at 1000 for safety
            .eq("direction", "outbound")
            .gte("timestamp", week_start)
            .execute()
        )
        follow_ups_sent_this_week = sent_resp.count or 0

    return {
        "total_needs_attention": total_needs_attention,
        "total_active_leads": total_active_leads,
        "total_leads": total_leads,
        "follow_ups_sent_this_week": follow_ups_sent_this_week,
    }


class WaitlistRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: Literal["dashboard", "pricing", "agents", "other"] = Field(default="agents")


class SuggestSkillRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    skill: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)


class SupportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    agent_id: str = Field(default="gmail_followup", min_length=1, max_length=120)
    subject: str = Field(..., min_length=1, max_length=160)
    message: str = Field(..., min_length=10, max_length=4000)


@router.post("/suggest-skill")
def suggest_skill(
    payload: SuggestSkillRequest,
    current_user=Depends(get_current_user),
):
    """Store a skill suggestion for future agents."""
    data = sanitize_payload(
        payload.model_dump(),
        preserve_newlines_keys={"description"},
    )
    try:
        supabase.table("suggested_skills").insert({
            "user_id": str(current_user.id),
            "skill": data.get("skill"),
            "description": data.get("description"),
        }).execute()
    except Exception as exc:
        logger.exception("Failed to store skill suggestion: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save suggestion.")

    return {"success": True}


@router.post("/support-request")
def submit_support_request(
    payload: SupportRequest,
    current_user=Depends(get_current_user),
):
    data = sanitize_payload(
        payload.model_dump(),
        preserve_newlines_keys={"message"},
    )
    agent_id = validate_agent_id(data.get("agent_id"))
    try:
        supabase.table("support_requests").insert({
            "user_id": str(current_user.id),
            "agent_id": agent_id,
            "subject": data.get("subject"),
            "message": data.get("message"),
        }).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to save support request.") from exc

    return {"success": True}


@router.post("/{agent_id}/waitlist")
def join_waitlist(agent_id: str, current_user=Depends(get_current_user)):
    """Add the current user to the waitlist for a coming-soon agent."""
    agent_id = validate_agent_id(agent_id)
    email = current_user.email
    if not email:
        raise HTTPException(status_code=400, detail="User email not found")

    (
        supabase.table("agent_waitlist")
        .upsert(
            {
                "user_id": str(current_user.id),
                "agent_id": agent_id,
                "email": email,
            },
            on_conflict="user_id,agent_id",
        )
        .execute()
    )

    return {"success": True}
