from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status

from app.api.deps import get_current_user, validate_agent_id
from app.core.supabase import get_supabase
from app.core.utils import parse_supabase_timestamp

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
    """Check user_subscriptions table for an active, non-expired agent subscription.

    An active subscription requires:
      - status = "active"
      - current_period_end > now()

    If the subscription is active but expired, the status is automatically
    flipped to "expired" and access is denied. No grace period.
    """
    agent_id = validate_agent_id(await _resolve_agent_id(request))
    now = datetime.now(timezone.utc)

    response = (
        supabase.table("user_subscriptions")
        .select("id, status, current_period_end")
        .eq("user_id", current_user.id)
        .eq("agent_id", agent_id)
        .limit(1)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "subscription_required",
                "agent_id": agent_id,
                "message": f"Active subscription required for {agent_id} agent",
            },
        )

    row = response.data[0]
    sub_status = row.get("status")
    period_end_raw = row.get("current_period_end")

    if sub_status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "subscription_required",
                "agent_id": agent_id,
                "message": f"Active subscription required for {agent_id} agent",
            },
        )

    # Verify the subscription hasn't expired
    if period_end_raw:
        period_end = parse_supabase_timestamp(period_end_raw)
        if period_end and period_end <= now:
            # Auto-expire: flip status to "expired" immediately
            (
                supabase.table("user_subscriptions")
                .update({
                    "status": "expired",
                    "updated_at": now.isoformat(),
                })
                .eq("id", row["id"])
                .execute()
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "subscription_expired",
                    "agent_id": agent_id,
                    "message": f"Your subscription for {agent_id} has expired. Please renew to continue.",
                },
            )
    else:
        # No period_end set — treat as invalid
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "subscription_required",
                "agent_id": agent_id,
                "message": f"Active subscription required for {agent_id} agent",
            },
        )

    return current_user
