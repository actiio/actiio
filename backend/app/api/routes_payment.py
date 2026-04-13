"""Payment routes for Actiio subscription billing via Cashfree."""

import base64
import hashlib
import hmac
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode
from uuid import uuid4

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import get_current_user, validate_agent_id
from app.core.config import get_settings
from app.core.limiter import limiter, user_or_ip_key_func
from app.core.supabase import get_supabase

router = APIRouter(prefix="/payment", tags=["payment"])
cashfree_router = APIRouter(prefix="/cashfree", tags=["cashfree"])
settings = get_settings()
supabase = get_supabase()
logger = logging.getLogger(__name__)

_CASHFREE_TIMEOUT = 30.0
_ORDER_AMOUNT = 499
_ORDER_CURRENCY = "INR"
_SUBSCRIPTION_DAYS = 30
_SUBSCRIPTION_API_VERSION = "2025-01-01"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cashfree_headers(api_version: str = "2023-08-01") -> dict[str, str]:
    return {
        "x-client-id": settings.cashfree_app_id or "",
        "x-client-secret": settings.cashfree_secret_key or "",
        "x-api-version": api_version,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _cashfree_url(path: str) -> str:
    return f"{settings.cashfree_base_url}{path}"


def _cashfree_return_base_url() -> str:
    configured = (settings.cashfree_return_url or "").strip().rstrip("/")
    if configured:
        return configured

    frontend = (settings.frontend_url or "http://localhost:3000").strip().rstrip("/")
    return f"{frontend}/subscriptions"


def _cashfree_return_url(**params: str) -> str:
    return f"{_cashfree_return_base_url()}?{urlencode(params)}"


def _generate_order_id(user_id: str, agent_id: str) -> str:
    ts = int(time.time())
    return f"ACTIIO-{user_id[:8]}-{agent_id}-{ts}"


def _generate_subscription_id(user_id: str, agent_id: str) -> str:
    ts = int(time.time())
    suffix = uuid4().hex[:8]
    return f"ACTIIO-SUB-{user_id[:8]}-{agent_id}-{ts}-{suffix}"


def _generate_subscription_payment_id(subscription_id: str, schedule_date: datetime) -> str:
    date_key = schedule_date.strftime("%Y%m%d")
    return f"ACTIIO-PAY-{subscription_id[:32]}-{date_key}"


def _verify_webhook_signature(
    raw_body: bytes, timestamp: str, received_signature: str
) -> bool:
    secret = settings.cashfree_secret_key
    if not secret:
        return False
    message = timestamp.encode("utf-8") + raw_body
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
    ).decode("utf-8")
    return hmac.compare_digest(expected, received_signature)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_user_row(user_id: str, user_email: str) -> None:
    """Ensure the public user mirror exists before writing FK-backed tables."""
    email = user_email or f"{user_id}@unknown.actiio.local"
    (
        supabase.table("users")
        .upsert(
            {
                "id": user_id,
                "email": email,
            },
            on_conflict="id",
        )
        .execute()
    )


def _subscription_plan_details() -> dict[str, Any]:
    if settings.cashfree_plan_id:
        return {
            "plan_id": settings.cashfree_plan_id,
            "plan_name": "Actiio Monthly",
            "plan_type": "ON_DEMAND",
        }

    return {
        "plan_name": "Actiio Monthly",
        "plan_type": "ON_DEMAND",
        "plan_max_amount": _ORDER_AMOUNT,
        "plan_currency": _ORDER_CURRENCY,
    }


def _extract_subscription_id(payload_data: dict[str, Any]) -> str | None:
    subscription_details = payload_data.get("subscription_details") or {}
    payment_gateway_details = payload_data.get("payment_gateway_details") or {}
    return (
        payload_data.get("subscription_id")
        or subscription_details.get("subscription_id")
        or payment_gateway_details.get("gateway_subscription_id")
        or payload_data.get("cf_subscription_id")
        or subscription_details.get("cf_subscription_id")
    )


def _is_successful_charge(payload_data: dict[str, Any]) -> bool:
    payment_type = str(payload_data.get("payment_type") or "").upper()
    payment_status = str(payload_data.get("payment_status") or "").upper()
    try:
        payment_amount = float(payload_data.get("payment_amount") or 0)
    except (TypeError, ValueError):
        payment_amount = 0

    if payment_type == "AUTH":
        return False
    return payment_status == "SUCCESS" and payment_amount >= _ORDER_AMOUNT


async def _raise_subscription_charge(
    subscription_id: str,
    schedule_date: datetime,
    remarks: str,
) -> None:
    payment_id = _generate_subscription_payment_id(subscription_id, schedule_date)
    charge_payload = {
        "subscription_id": subscription_id,
        "payment_id": payment_id,
        "payment_type": "CHARGE",
        "payment_amount": _ORDER_AMOUNT,
        "payment_currency": _ORDER_CURRENCY,
        "payment_remarks": remarks,
        "payment_schedule_date": schedule_date.isoformat(),
    }

    try:
        async with httpx.AsyncClient(timeout=_CASHFREE_TIMEOUT) as client:
            resp = await client.post(
                _cashfree_url("/subscriptions/pay"),
                headers=_cashfree_headers(_SUBSCRIPTION_API_VERSION),
                json=charge_payload,
            )
            resp_data = resp.json()
            if resp.status_code not in (200, 201):
                logger.error(
                    "Cashfree subscription charge failed: %s %s",
                    resp.status_code,
                    resp_data,
                )
    except httpx.HTTPError as exc:
        logger.exception("Cashfree subscription charge API request failed: %s", exc)


async def _sync_autopay_authorization_from_cashfree(row: dict[str, Any]) -> dict[str, Any]:
    subscription_id = row.get("cashfree_subscription_id")
    if not subscription_id or row.get("autopay_enabled"):
        return row

    try:
        async with httpx.AsyncClient(timeout=_CASHFREE_TIMEOUT) as client:
            resp = await client.get(
                _cashfree_url(f"/subscriptions/{subscription_id}"),
                headers=_cashfree_headers(_SUBSCRIPTION_API_VERSION),
            )
            resp_data = resp.json()
            if resp.status_code not in (200, 201):
                logger.warning(
                    "Cashfree fetch subscription failed: %s %s",
                    resp.status_code,
                    resp_data,
                )
                return row
    except httpx.HTTPError as exc:
        logger.warning("Cashfree fetch subscription request failed: %s", exc)
        return row

    auth_details = resp_data.get("authorization_details") or {}
    subscription_status = str(resp_data.get("subscription_status") or "").upper()
    auth_status = str(auth_details.get("authorization_status") or "").upper()
    logger.info(
        "Checking autopay status for %s: sub_status=%s, auth_status=%s",
        subscription_id, subscription_status, auth_status
    )
    if subscription_status == "ACTIVE" or auth_status in ("ACTIVE", "SUCCESS"):
        updated = {
            "autopay_enabled": True,
            "status": "active", # Ensure status flips to active upon successful autopay authorization
            "updated_at": _now_utc().isoformat(),
        }
        (
            supabase.table("user_subscriptions")
            .update(updated)
            .eq("id", row["id"])
            .execute()
        )
        return {**row, **updated}

    # Cleanup: If the setup was cancelled or never finished, clear the pending ID.
    if (
        not row.get("autopay_enabled")
        and subscription_id
        and subscription_status in ("INITIALIZED", "LINK_EXPIRED", "CANCELLED", "PENDING", "DEACTIVATED")
    ):
        logger.info("Clearing abandoned autopay setup for %s", subscription_id)
        updated = {
            "cashfree_subscription_id": None, # Clear the ID so UI reverts to "Set up autopay"
            "updated_at": _now_utc().isoformat(),
        }
        # If it was also holding the status in pending, reset it
        if row.get("status") == "payment_pending" and not row.get("cashfree_order_id"):
            updated["status"] = "expired"
            
        (
            supabase.table("user_subscriptions")
            .update(updated)
            .eq("id", row["id"])
            .execute()
        )
        return {**row, **updated}

    return row


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class CreateOrderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    agent_id: str = Field(default="gmail_followup", min_length=1, max_length=120)

CreateOrderRequest.model_rebuild()

class CreateAutopayRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    agent_id: str = Field(default="gmail_followup", min_length=1, max_length=120)

CreateAutopayRequest.model_rebuild()

class RenewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    agent_id: str = Field(default="gmail_followup", min_length=1, max_length=120)

RenewRequest.model_rebuild()


# ---------------------------------------------------------------------------
# POST /payment/create-order
# ---------------------------------------------------------------------------

@router.post("/create-order")
@limiter.limit("10/hour", key_func=user_or_ip_key_func)
async def create_order(
    request: Request,
    body: CreateOrderRequest = Body(default_factory=CreateOrderRequest),
    current_user=Depends(get_current_user),
):
    """Create a Cashfree payment order for a new agent subscription."""
    if not settings.cashfree_app_id or not settings.cashfree_secret_key:
        raise HTTPException(status_code=400, detail="Payment provider is not configured.")

    agent_id = validate_agent_id(body.agent_id)
    user_id = str(current_user.id)
    user_email = getattr(current_user, "email", "") or ""
    _ensure_user_row(user_id, user_email)

    # Check for existing active subscription
    existing = (
        supabase.table("user_subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .limit(1)
        .execute()
    )

    row = existing.data[0] if existing.data else None
    if row and row.get("status") == "active":
        period_end = row.get("current_period_end")
        if period_end:
            from app.core.utils import parse_supabase_timestamp
            expiry_dt = parse_supabase_timestamp(period_end)
            if expiry_dt and expiry_dt > _now_utc():
                return {
                    "status": "already_active",
                    "expiry": period_end,
                }
            # Expired — will be handled below as a new order

    # Build Cashfree order
    order_id = _generate_order_id(user_id, agent_id)
    order_payload: dict[str, Any] = {
        "order_id": order_id,
        "order_amount": _ORDER_AMOUNT,
        "order_currency": _ORDER_CURRENCY,
        "customer_details": {
            "customer_id": user_id,
            "customer_email": user_email,
            "customer_phone": "9999999999",
        },
        "order_meta": {
            "return_url": _cashfree_return_url(order_id=order_id, agent_id=agent_id),
        },
    }

    try:
        async with httpx.AsyncClient(timeout=_CASHFREE_TIMEOUT) as client:
            resp = await client.post(
                _cashfree_url("/orders"),
                headers=_cashfree_headers(),
                json=order_payload,
            )
            resp_data = resp.json()
            if resp.status_code not in (200, 201):
                logger.error(
                    "Cashfree create order failed: %s %s", resp.status_code, resp_data
                )
                raise HTTPException(
                    status_code=502,
                    detail=resp_data.get("message", "Failed to create payment order."),
                )
    except httpx.HTTPError as exc:
        logger.exception("Cashfree order API request failed: %s", exc)
        raise HTTPException(
            status_code=502, detail="Failed to create payment order."
        ) from exc

    payment_session_id = resp_data.get("payment_session_id")
    if not payment_session_id:
        logger.error("Cashfree response missing payment_session_id: %s", resp_data)
        raise HTTPException(
            status_code=502, detail="Payment provider did not return a session."
        )

    # Upsert subscription row
    (
        supabase.table("user_subscriptions")
        .upsert(
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "status": "payment_pending",
                "cashfree_order_id": order_id,
                "cashfree_payment_id": None,
                "autopay_enabled": False,
                "updated_at": _now_utc().isoformat(),
            },
            on_conflict="user_id,agent_id",
        )
        .execute()
    )

    return {
        "payment_session_id": payment_session_id,
        "order_id": order_id,
    }


# ---------------------------------------------------------------------------
# POST /payment/create-autopay
# ---------------------------------------------------------------------------

@router.post("/create-autopay")
@limiter.limit("10/hour", key_func=user_or_ip_key_func)
async def create_autopay_subscription(
    request: Request,
    body: CreateAutopayRequest = Body(default_factory=CreateAutopayRequest),
    current_user=Depends(get_current_user),
):
    """Create a Cashfree subscription mandate for recurring autopay."""
    if not settings.cashfree_app_id or not settings.cashfree_secret_key:
        raise HTTPException(status_code=400, detail="Payment provider is not configured.")

    agent_id = validate_agent_id(body.agent_id)
    user_id = str(current_user.id)
    user_email = getattr(current_user, "email", "") or ""
    customer_name = user_email.split("@")[0] if user_email else "Actiio Customer"
    _ensure_user_row(user_id, user_email)

    existing = (
        supabase.table("user_subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .limit(1)
        .execute()
    )
    row = existing.data[0] if existing.data else None
    if row and row.get("autopay_enabled") and row.get("cashfree_subscription_id"):
        return {
            "status": "already_enabled",
            "subscription_id": row["cashfree_subscription_id"],
        }

    now = _now_utc()
    subscription_id = _generate_subscription_id(user_id, agent_id)
    expiry_time = now + timedelta(days=3650)

    subscription_payload: dict[str, Any] = {
        "subscription_id": subscription_id,
        "customer_details": {
            "customer_id": user_id,
            "customer_name": customer_name,
            "customer_email": user_email,
            "customer_phone": "9999999999",
        },
        "plan_details": _subscription_plan_details(),
        "authorization_details": {
            "authorization_amount": 1,
            "authorization_amount_refund": True,
        },
        "subscription_meta": {
            "return_url": _cashfree_return_url(
                subscription_id=subscription_id,
                agent_id=agent_id,
                autopay="true",
            ),
            "notification_channel": ["EMAIL", "SMS"],
        },
        "subscription_note": f"Actiio monthly autopay for {agent_id}",
        "subscription_tags": {
            "user_id": user_id,
            "agent_id": agent_id,
        },
        "subscription_expiry_time": expiry_time.isoformat(),
    }

    try:
        async with httpx.AsyncClient(timeout=_CASHFREE_TIMEOUT) as client:
            resp = await client.post(
                _cashfree_url("/subscriptions"),
                headers=_cashfree_headers(_SUBSCRIPTION_API_VERSION),
                json=subscription_payload,
            )
            resp_data = resp.json()
            if resp.status_code not in (200, 201):
                logger.error(
                    "Cashfree create subscription failed: %s %s",
                    resp.status_code,
                    resp_data,
                )
                raise HTTPException(
                    status_code=502,
                    detail=resp_data.get("message", "Failed to create autopay setup."),
                )
    except httpx.HTTPError as exc:
        logger.exception("Cashfree subscription API request failed: %s", exc)
        raise HTTPException(
            status_code=502, detail="Failed to create autopay setup."
        ) from exc

    subscription_session_id = resp_data.get("subscription_session_id")
    if not subscription_session_id:
        logger.error("Cashfree response missing subscription_session_id: %s", resp_data)
        raise HTTPException(
            status_code=502, detail="Payment provider did not return an autopay session."
        )

    current_status = row.get("status") if row else None
    # Only switch to payment_pending if the subscription is not already established (active or expired).
    # This prevents the UI from flipping to a "Pending" card if the user just initiates autopay setup but cancels.
    next_status = current_status if current_status in ("active", "expired") else "payment_pending"
    (
        supabase.table("user_subscriptions")
        .upsert(
            {
                "user_id": user_id,
                "agent_id": agent_id,
                "status": next_status,
                "cashfree_subscription_id": subscription_id,
                "autopay_enabled": False,
                "updated_at": now.isoformat(),
            },
            on_conflict="user_id,agent_id",
        )
        .execute()
    )

    return {
        "subscription_session_id": subscription_session_id,
        "subscription_id": subscription_id,
    }


# ---------------------------------------------------------------------------
# POST /cashfree/webhook
# ---------------------------------------------------------------------------

@cashfree_router.post("/webhook")
async def payment_webhook(request: Request):
    """Handle Cashfree payment webhooks. No auth required."""
    if not settings.cashfree_secret_key:
        raise HTTPException(status_code=400, detail="Webhook secret not configured.")

    raw_body = await request.body()
    timestamp = request.headers.get("x-webhook-timestamp", "")
    signature = request.headers.get("x-webhook-signature", "")

    if not timestamp or not signature:
        raise HTTPException(status_code=400, detail="Missing webhook signature headers.")
    if not _verify_webhook_signature(raw_body, timestamp, signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    # --- Replay protection: reject requests with stale timestamps (>5 min) ---
    try:
        ts_value = float(timestamp)
        # If timestamp is in milliseconds (length usually > 10 digits), convert to seconds
        if ts_value > 1e11:
            ts_value = ts_value / 1000.0
            
        if abs(time.time() - ts_value) > 300:
            logger.warning("Webhook rejected: stale timestamp %s (current time: %f)", timestamp, time.time())
            raise HTTPException(status_code=400, detail="Webhook timestamp too old.")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid webhook timestamp format.")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.")

    # --- Idempotency: deduplicate by event_id ---
    event_id = (
        payload.get("data", {}).get("payment", {}).get("cf_payment_id")
        or payload.get("data", {}).get("subscription_details", {}).get("subscription_id")
        or f"{timestamp}-{hashlib.sha256(raw_body).hexdigest()[:16]}"
    )
    try:
        existing = (
            supabase.table("processed_webhooks")
            .select("id")
            .eq("event_id", event_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            logger.info("Webhook already processed, skipping: event_id=%s", event_id)
            return {"received": True, "duplicate": True}
        supabase.table("processed_webhooks").insert({"event_id": event_id}).execute()
    except Exception as exc:
        # If the idempotency check fails, log but continue processing
        # to avoid dropping legitimate webhooks due to transient DB issues.
        logger.warning("Idempotency check failed for event_id=%s: %s", event_id, exc)

    event_type = str(payload.get("type", "")).upper()
    data = payload.get("data", {})

    if event_type.startswith("SUBSCRIPTION_"):
        return await _handle_subscription_webhook(event_type, data)

    order_data = data.get("order", {})
    payment_data = data.get("payment", {})

    cashfree_order_id = order_data.get("order_id")
    cashfree_payment_id = (
        payment_data.get("cf_payment_id")
        or payment_data.get("payment_id")
    )
    # Bank / gateway reference — proves the money actually moved
    cashfree_transaction_id = (
        payment_data.get("bank_reference")
        or payment_data.get("payment_utr")
        or payment_data.get("transaction_id")
    )

    if not cashfree_order_id:
        logger.warning("Webhook missing order_id: %s", payload)
        return {"received": True}

    # Look up local subscription
    local = (
        supabase.table("user_subscriptions")
        .select("id, user_id, agent_id, status, current_period_end")
        .eq("cashfree_order_id", cashfree_order_id)
        .limit(1)
        .execute()
    )
    row = local.data[0] if local.data else None
    if not row:
        logger.warning(
            "No subscription found for cashfree_order_id=%s", cashfree_order_id
        )
        return {"received": True}

    if event_type in ("PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_SUCCESS"):
        now = _now_utc()

        # Early renewal: extend from existing expiry if it's still in the future
        base_date = now
        old_period_end_raw = row.get("current_period_end")
        if old_period_end_raw:
            from app.core.utils import parse_supabase_timestamp
            old_period_end = parse_supabase_timestamp(old_period_end_raw)
            if old_period_end and old_period_end > now:
                base_date = old_period_end

        new_period_end = base_date + timedelta(days=_SUBSCRIPTION_DAYS)

        (
            supabase.table("user_subscriptions")
            .update(
                {
                    "status": "active",
                    "current_period_start": now.isoformat(),
                    "current_period_end": new_period_end.isoformat(),
                    "cashfree_payment_id": str(cashfree_payment_id) if cashfree_payment_id else None,
                    "cashfree_transaction_id": str(cashfree_transaction_id) if cashfree_transaction_id else None,
                    "updated_at": now.isoformat(),
                }
            )
            .eq("id", row["id"])
            .execute()
        )

        # Send activation email
        _send_activation_email_safe(
            user_id=row["user_id"],
            agent_id=row["agent_id"],
            expiry_date=new_period_end,
        )

    elif event_type in ("PAYMENT_FAILED_WEBHOOK", "PAYMENT_FAILED"):
        (
            supabase.table("user_subscriptions")
            .update(
                {
                    "status": "payment_failed",
                    "updated_at": _now_utc().isoformat(),
                }
            )
            .eq("id", row["id"])
            .execute()
        )

    return {"received": True}


async def _handle_subscription_webhook(event_type: str, data: dict[str, Any]) -> dict[str, bool]:
    cashfree_subscription_id = _extract_subscription_id(data)
    if not cashfree_subscription_id:
        logger.warning("Subscription webhook missing subscription_id: %s", data)
        return {"received": True}

    local = (
        supabase.table("user_subscriptions")
        .select("id, user_id, agent_id, status, current_period_end")
        .eq("cashfree_subscription_id", cashfree_subscription_id)
        .limit(1)
        .execute()
    )
    row = local.data[0] if local.data else None
    if not row:
        logger.warning(
            "No subscription found for cashfree_subscription_id=%s",
            cashfree_subscription_id,
        )
        return {"received": True}

    now = _now_utc()
    if event_type == "SUBSCRIPTION_STATUS_CHANGED":
        subscription_details = data.get("subscription_details") or {}
        subscription_status = str(
            subscription_details.get("subscription_status") or ""
        ).upper()

        if subscription_status in ("ACTIVE", "BANK_APPROVAL_PENDING"):
            update_data: dict[str, Any] = {
                "autopay_enabled": True,
                "updated_at": now.isoformat(),
            }
            if row.get("status") != "active":
                update_data["status"] = "payment_pending"
            (
                supabase.table("user_subscriptions")
                .update(update_data)
                .eq("id", row["id"])
                .execute()
            )
        elif subscription_status in (
            "CUSTOMER_CANCELLED",
            "CUSTOMER_PAUSED",
            "CANCELLED",
            "EXPIRED",
            "LINK_EXPIRED",
            "CARD_EXPIRED",
        ):
            update_data = {
                "autopay_enabled": False,
                "updated_at": now.isoformat(),
            }
            if row.get("status") != "active":
                update_data["status"] = "expired"
            (
                supabase.table("user_subscriptions")
                .update(update_data)
                .eq("id", row["id"])
                .execute()
            )

    elif event_type == "SUBSCRIPTION_AUTH_STATUS":
        auth_details = data.get("authorization_details") or {}
        auth_status = str(auth_details.get("authorization_status") or "").upper()
        payment_status = str(data.get("payment_status") or "").upper()
        auth_ok = auth_status in ("ACTIVE", "SUCCESS") or payment_status == "SUCCESS"
        update_data = {
            "autopay_enabled": auth_ok,
            "cashfree_payment_id": str(data.get("cf_payment_id") or data.get("payment_id") or ""),
            "cashfree_transaction_id": str(data.get("cf_txn_id") or ""),
            "updated_at": now.isoformat(),
        }
        if auth_ok:
            update_data["status"] = "active"
        elif row.get("status") != "active":
            update_data["status"] = "payment_failed"
        (
            supabase.table("user_subscriptions")
            .update(update_data)
            .eq("id", row["id"])
            .execute()
        )
        if auth_ok:
            schedule_date = now + timedelta(minutes=2)
            remarks = "first autopay charge"
            old_period_end_raw = row.get("current_period_end")
            if row.get("status") == "active" and old_period_end_raw:
                from app.core.utils import parse_supabase_timestamp
                old_period_end = parse_supabase_timestamp(old_period_end_raw)
                if old_period_end and old_period_end > schedule_date:
                    schedule_date = old_period_end
                    remarks = "next autopay charge"
            await _raise_subscription_charge(
                cashfree_subscription_id,
                schedule_date=schedule_date,
                remarks=remarks,
            )

    elif event_type == "SUBSCRIPTION_PAYMENT_SUCCESS" and _is_successful_charge(data):
        base_date = now
        old_period_end_raw = row.get("current_period_end")
        if old_period_end_raw:
            from app.core.utils import parse_supabase_timestamp
            old_period_end = parse_supabase_timestamp(old_period_end_raw)
            if old_period_end and old_period_end > now:
                base_date = old_period_end

        new_period_end = base_date + timedelta(days=_SUBSCRIPTION_DAYS)
        (
            supabase.table("user_subscriptions")
            .update(
                {
                    "status": "active",
                    "autopay_enabled": True,
                    "current_period_start": now.isoformat(),
                    "current_period_end": new_period_end.isoformat(),
                    "cashfree_payment_id": str(data.get("cf_payment_id") or data.get("payment_id") or ""),
                    "cashfree_transaction_id": str(data.get("cf_txn_id") or ""),
                    "updated_at": now.isoformat(),
                }
            )
            .eq("id", row["id"])
            .execute()
        )
        _send_activation_email_safe(
            user_id=row["user_id"],
            agent_id=row["agent_id"],
            expiry_date=new_period_end,
        )

    elif event_type in ("SUBSCRIPTION_PAYMENT_FAILED", "SUBSCRIPTION_PAYMENT_CANCELLED"):
        update_data = {
            "autopay_enabled": row.get("status") == "active",
            "updated_at": now.isoformat(),
        }
        if row.get("status") != "active":
            update_data["status"] = "payment_failed"
        (
            supabase.table("user_subscriptions")
            .update(update_data)
            .eq("id", row["id"])
            .execute()
        )

    return {"received": True}


def _send_activation_email_safe(
    user_id: str, agent_id: str, expiry_date: datetime
) -> None:
    """Send the activation email, swallowing exceptions so the webhook always returns 200."""
    try:
        # Look up user email
        user_row = (
            supabase.table("users")
            .select("email")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        user_email = user_row.data[0]["email"] if user_row.data else None
        if not user_email:
            logger.warning("Cannot send activation email: no email for user %s", user_id)
            return

        # Look up agent name
        agent_row = (
            supabase.table("agents")
            .select("name")
            .eq("id", agent_id)
            .limit(1)
            .execute()
        )
        agent_name = agent_row.data[0]["name"] if agent_row.data else agent_id

        from services.email_service import send_subscription_activated_email
        send_subscription_activated_email(
            user_email=user_email,
            agent_name=agent_name,
            expiry_date=expiry_date,
        )
    except Exception as exc:
        logger.error("Failed to send activation email for user %s: %s", user_id, exc)


# ---------------------------------------------------------------------------
# GET /payment/status/{agent_id}
# ---------------------------------------------------------------------------

@router.get("/status/{agent_id}")
async def get_payment_status(
    agent_id: str, current_user=Depends(get_current_user)
):
    """Return current subscription status for user + agent."""
    agent_id = validate_agent_id(agent_id)
    user_id = str(current_user.id)

    response = (
        supabase.table("user_subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .limit(1)
        .execute()
    )

    if not response.data:
        return {
            "agent_id": agent_id,
            "status": "none",
            "current_period_end": None,
            "autopay_enabled": False,
            "days_remaining": 0,
        }

    row = response.data[0]
    row = await _sync_autopay_authorization_from_cashfree(row)
    now = _now_utc()
    sub_status = row.get("status", "none")
    period_end_raw = row.get("current_period_end")
    days_remaining = 0

    if period_end_raw:
        from app.core.utils import parse_supabase_timestamp
        period_end = parse_supabase_timestamp(period_end_raw)
        if period_end:
            if period_end > now:
                days_remaining = max(0, (period_end - now).days)
            elif sub_status == "active":
                # Expired — flip status
                sub_status = "expired"
                (
                    supabase.table("user_subscriptions")
                    .update({"status": "expired", "updated_at": now.isoformat()})
                    .eq("id", row["id"])
                    .execute()
                )

    return {
        "agent_id": agent_id,
        "status": sub_status,
        "current_period_end": period_end_raw,
        "autopay_enabled": row.get("autopay_enabled", False),
        "cashfree_subscription_id": row.get("cashfree_subscription_id"),
        "days_remaining": days_remaining,
    }


# ---------------------------------------------------------------------------
# POST /payment/renew
# ---------------------------------------------------------------------------

@router.post("/renew")
@limiter.limit("10/hour", key_func=user_or_ip_key_func)
async def renew_subscription(
    request: Request,
    body: RenewRequest = Body(default_factory=RenewRequest),
    current_user=Depends(get_current_user),
):
    """Renew an existing subscription. Early renewal extends from current expiry."""
    if not settings.cashfree_app_id or not settings.cashfree_secret_key:
        raise HTTPException(status_code=400, detail="Payment provider is not configured.")

    agent_id = validate_agent_id(body.agent_id)
    user_id = str(current_user.id)
    user_email = getattr(current_user, "email", "") or ""

    existing = (
        supabase.table("user_subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .limit(1)
        .execute()
    )

    if not existing.data:
        raise HTTPException(
            status_code=404,
            detail="No subscription found for this agent. Use create-order instead.",
        )

    row = existing.data[0]
    current_status = row.get("status")

    # Auto-expire if needed
    now = _now_utc()
    if current_status == "active" and row.get("current_period_end"):
        from app.core.utils import parse_supabase_timestamp
        period_end = parse_supabase_timestamp(row["current_period_end"])
        if period_end and period_end <= now:
            current_status = "expired"
            (
                supabase.table("user_subscriptions")
                .update({"status": "expired", "updated_at": now.isoformat()})
                .eq("id", row["id"])
                .execute()
            )

    if current_status not in ("active", "expired"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot renew subscription with status '{current_status}'. Only active or expired subscriptions can be renewed.",
        )

    # Create new Cashfree order
    order_id = _generate_order_id(user_id, agent_id)
    order_payload: dict[str, Any] = {
        "order_id": order_id,
        "order_amount": _ORDER_AMOUNT,
        "order_currency": _ORDER_CURRENCY,
        "customer_details": {
            "customer_id": user_id,
            "customer_email": user_email,
            "customer_phone": "9999999999",
        },
        "order_meta": {
            "return_url": _cashfree_return_url(order_id=order_id, agent_id=agent_id),
        },
    }

    try:
        async with httpx.AsyncClient(timeout=_CASHFREE_TIMEOUT) as client:
            resp = await client.post(
                _cashfree_url("/orders"),
                headers=_cashfree_headers(),
                json=order_payload,
            )
            resp_data = resp.json()
            if resp.status_code not in (200, 201):
                logger.error(
                    "Cashfree create order failed: %s %s", resp.status_code, resp_data
                )
                raise HTTPException(
                    status_code=502,
                    detail=resp_data.get("message", "Failed to create renewal order."),
                )
    except httpx.HTTPError as exc:
        logger.exception("Cashfree renewal API request failed: %s", exc)
        raise HTTPException(
            status_code=502, detail="Failed to create renewal order."
        ) from exc

    payment_session_id = resp_data.get("payment_session_id")
    if not payment_session_id:
        logger.error("Cashfree response missing payment_session_id: %s", resp_data)
        raise HTTPException(
            status_code=502, detail="Payment provider did not return a session."
        )

    # Store the old period_end so the webhook can extend from it
    # We tag this as a renewal by storing the old expiry in a metadata note
    (
        supabase.table("user_subscriptions")
        .update(
            {
                "status": "payment_pending",
                "cashfree_order_id": order_id,
                "updated_at": now.isoformat(),
            }
        )
        .eq("id", row["id"])
        .execute()
    )

    return {
        "payment_session_id": payment_session_id,
        "order_id": order_id,
    }
