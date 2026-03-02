from __future__ import annotations

from typing import Optional

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.supabase import get_supabase

router = APIRouter(prefix="/stripe", tags=["stripe"])
settings = get_settings()
supabase = get_supabase()


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


def _update_subscription_status(customer_id: str, status_value: str) -> None:
    (
        supabase.table("users")
        .update({"subscription_status": status_value})
        .eq("stripe_customer_id", customer_id)
        .execute()
    )


@router.post("/create-checkout-session")
def create_checkout_session(current_user=Depends(get_current_user)):
    if not settings.stripe_secret_key or not settings.stripe_price_id:
        raise HTTPException(status_code=400, detail="Stripe is not configured")

    customer_id = _get_or_create_customer(current_user.id, current_user.email)

    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": settings.stripe_price_id, "quantity": 1}],
        success_url=f"{(settings.frontend_url or 'http://localhost:3000').rstrip('/')}/dashboard?subscribed=true",
        cancel_url=f"{(settings.frontend_url or 'http://localhost:3000').rstrip('/')}/pricing",
    )

    return {"url": session.url}


@router.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: Optional[str] = Header(default=None, alias="stripe-signature")):
    if not settings.stripe_secret_key or not settings.stripe_webhook_secret:
        raise HTTPException(status_code=400, detail="Stripe webhook is not configured")

    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(payload=payload, sig_header=stripe_signature, secret=settings.stripe_webhook_secret)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid webhook payload: {exc}") from exc

    event_type = event.get("type")
    data_object = event.get("data", {}).get("object", {})

    if event_type == "checkout.session.completed":
        customer_id = data_object.get("customer")
        if customer_id:
            _update_subscription_status(customer_id, "active")

    elif event_type == "customer.subscription.deleted":
        customer_id = data_object.get("customer")
        if customer_id:
            _update_subscription_status(customer_id, "inactive")

    elif event_type == "invoice.payment_failed":
        customer_id = data_object.get("customer")
        if customer_id:
            _update_subscription_status(customer_id, "past_due")

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

    portal_session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{(settings.frontend_url or 'http://localhost:3000').rstrip('/')}/settings",
    )

    return {"url": portal_session.url}
