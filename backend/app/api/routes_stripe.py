from __future__ import annotations

import logging
from typing import Literal, Optional

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import get_current_user, validate_agent_id
from app.core.config import get_settings
from app.core.limiter import limiter, user_or_ip_key_func
from app.core.supabase import get_supabase
from app.core.utils import raise_internal_error

router = APIRouter(prefix="/stripe", tags=["stripe"])
settings = get_settings()
supabase = get_supabase()
logger = logging.getLogger(__name__)


if settings.stripe_secret_key:
    stripe.api_key = settings.stripe_secret_key


def _get_or_create_customer(user_id: str, email: Optional[str]) -> str:
    user_response = (
        supabase.table("users")
        .select("stripe_customer_id")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )

    existing_customer_id = user_response.data[0].get("stripe_customer_id") if user_response.data else None

    if existing_customer_id:
        try:
            stripe.Customer.retrieve(existing_customer_id)
            return existing_customer_id
        except Exception:
            pass

    customer = stripe.Customer.create(
        email=email,
        metadata={"user_id": user_id},
    )
    customer_id = customer["id"]

    (
        supabase.table("users")
        .update({"stripe_customer_id": customer_id})
        .eq("id", user_id)
        .execute()
    )

    return customer_id


def _resolve_stripe_price_id(agent_id: str, plan: str) -> str:
    """Look up the correct Stripe price ID for an agent + plan combo."""
    # Legacy compatibility: allow old combined agent price vars to seed the original Gmail follow-up product.
    if agent_id == "gmail_followup":
        if plan == "free" and settings.stripe_actiio_free_price_id:
            return settings.stripe_actiio_free_price_id
        if plan == "pro" and settings.stripe_actiio_pro_price_id:
            return settings.stripe_actiio_pro_price_id

    # Fall back to agents table
    agent_resp = (
        supabase.table("agents")
        .select("stripe_free_price_id, stripe_pro_price_id")
        .eq("id", agent_id)
        .limit(1)
        .execute()
    )
    if not agent_resp.data:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")

    agent = agent_resp.data[0]
    price_id = agent.get(f"stripe_{plan}_price_id")
    if not price_id:
        # Last resort: fall back to the global STRIPE_PRICE_ID
        if settings.stripe_price_id:
            return settings.stripe_price_id
        raise HTTPException(status_code=400, detail=f"No Stripe price configured for agent '{agent_id}' plan '{plan}'")

    return price_id


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    agent_id: str = Field(default="gmail_followup", min_length=1, max_length=120)
    plan: Literal["free", "pro"] = "free"


@router.post("/create-checkout-session")
@limiter.limit("10/hour", key_func=user_or_ip_key_func)
def create_checkout_session(request: Request, body: CheckoutRequest, current_user=Depends(get_current_user)):
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=400, detail="Stripe is not configured")

    agent_id = validate_agent_id(body.agent_id)
    price_id = _resolve_stripe_price_id(agent_id, body.plan)
    customer_id = _get_or_create_customer(current_user.id, current_user.email)

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=customer_id,
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{(settings.frontend_url or 'http://localhost:3000').rstrip('/')}/agents?subscribed=true",
            cancel_url=f"{(settings.frontend_url or 'http://localhost:3000').rstrip('/')}/agents",
            metadata={
                "user_id": str(current_user.id),
                "agent_id": agent_id,
                "plan": body.plan,
            },
        )
    except Exception as exc:
        raise_internal_error(
            logger,
            message="Failed to create Stripe checkout session",
            exc=exc,
            detail="Failed to create checkout session.",
        )

    return {"url": session.url}


@router.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: Optional[str] = Header(default=None, alias="stripe-signature")):
    if not settings.stripe_secret_key or not settings.stripe_webhook_secret:
        raise HTTPException(status_code=400, detail="Stripe webhook is not configured")
    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing Stripe signature")

    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(payload=payload, sig_header=stripe_signature, secret=settings.stripe_webhook_secret)
    except Exception as exc:
        raise_internal_error(logger, message="Invalid Stripe webhook payload", exc=exc, detail="Invalid Stripe webhook payload.")

    event_type = event.get("type")
    data_object = event.get("data", {}).get("object", {})

    if event_type == "checkout.session.completed":
        metadata = data_object.get("metadata", {})
        user_id = metadata.get("user_id")
        agent_id = metadata.get("agent_id", "gmail_followup")
        plan = metadata.get("plan", "free")
        customer_id = data_object.get("customer")
        subscription_id = data_object.get("subscription")

        # Fetch subscription to get period end
        current_period_end = None
        if subscription_id:
            try:
                subscription = stripe.Subscription.retrieve(subscription_id)
                import datetime
                # Strip 10-digit unix to ISO 8601
                ts = subscription.get("current_period_end")
                if ts:
                    current_period_end = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat()
            except Exception:
                pass

        if user_id:
            # Upsert into user_subscriptions
            (
                supabase.table("user_subscriptions")
                .upsert(
                    {
                        "user_id": user_id,
                        "agent_id": agent_id,
                        "plan": plan,
                        "status": "active",
                        "stripe_customer_id": customer_id,
                        "stripe_subscription_id": subscription_id,
                        "current_period_end": current_period_end,
                    },
                    on_conflict="user_id,agent_id",
                )
                .execute()
            )

    elif event_type == "customer.subscription.deleted":
        subscription_id = data_object.get("id")
        if subscription_id:
            (
                supabase.table("user_subscriptions")
                .update({"status": "canceled"})
                .eq("stripe_subscription_id", subscription_id)
                .execute()
            )

    elif event_type == "invoice.payment_failed":
        subscription_id = data_object.get("subscription")
        if subscription_id:
            (
                supabase.table("user_subscriptions")
                .update({"status": "past_due"})
                .eq("stripe_subscription_id", subscription_id)
                .execute()
            )

    return {"received": True}


@router.post("/create-portal-session")
def create_portal_session(current_user=Depends(get_current_user)):
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=400, detail="Stripe is not configured")

    user_response = (
        supabase.table("users")
        .select("stripe_customer_id")
        .eq("id", current_user.id)
        .limit(1)
        .execute()
    )

    if not user_response.data or not user_response.data[0].get("stripe_customer_id"):
        raise HTTPException(status_code=400, detail="No Stripe customer found for user")

    customer_id = user_response.data[0]["stripe_customer_id"]

    try:
        portal_session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{(settings.frontend_url or 'http://localhost:3000').rstrip('/')}/agents",
        )
    except Exception as exc:
        raise_internal_error(
            logger,
            message="Failed to create Stripe billing portal session",
            exc=exc,
            detail="Failed to create billing portal session.",
        )

    return {"url": portal_session.url}
