from typing import Optional

from fastapi import Depends, HTTPException, Request, status

from app.api.deps import get_current_user, validate_agent_id
from app.core.supabase import get_supabase

supabase = get_supabase()


async def _resolve_agent_id(request: Request) -> str:
    path_agent = request.path_params.get("agent_id")
    if isinstance(path_agent, str) and path_agent.strip():
        return path_agent

    query_agent = request.query_params.get("agent_id")
    if query_agent:
        return query_agent

    if request.method in {"POST", "PUT", "PATCH"}:
        try:
            body = await request.json()
        except Exception:
            body = None
        if isinstance(body, dict):
            return body.get("agent_id") or "gmail_followup"

    return "gmail_followup"


async def require_active_subscription(request: Request, current_user=Depends(get_current_user)):
    """Check user_subscriptions table for an active agent subscription."""
    agent_id = validate_agent_id(await _resolve_agent_id(request))
    response = (
        supabase.table("user_subscriptions")
        .select("status")
        .eq("user_id", current_user.id)
        .eq("agent_id", agent_id)
        .eq("status", "active")
        .execute()
    )

    if not response.data:
        # Fall back to legacy users.subscription_status for the original combined follow-up product.
        if agent_id == "gmail_followup":
            legacy = (
                supabase.table("users")
                .select("subscription_status")
                .eq("id", current_user.id)
                .limit(1)
                .execute()
            )
            if legacy.data and legacy.data[0].get("subscription_status") == "active":
                return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "subscription_required",
                "agent_id": agent_id,
                "message": f"Active subscription required for {agent_id} agent",
            },
        )

    return current_user
