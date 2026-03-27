from fastapi import APIRouter, Depends, Request
from slowapi.util import get_remote_address

from app.core.limiter import limiter
from app.core.config import get_settings
from app.core.rate_limit import enforce_auth_attempt_limit
from app.core.sanitization import sanitize_email
from app.core.supabase import get_supabase
from app.api.deps import get_current_user
from app.schemas.auth import AuthResponse, SignInRequest, SignUpRequest, UserResponse
from app.services.auth_service import sign_in, sign_up

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()
supabase = get_supabase()


@router.post("/sign-up", response_model=AuthResponse)
@limiter.limit("5/minute", key_func=get_remote_address)
def sign_up_route(payload: SignUpRequest, request: Request):
    safe_email = sanitize_email(payload.email)
    enforce_auth_attempt_limit(
        request=request,
        email=safe_email,
        action="sign-up",
        per_email_ip_limit=settings.auth_attempt_limit_per_15min,
        per_email_ip_window_seconds=15 * 60,
    )
    tokens = sign_up(safe_email, payload.password)
    return AuthResponse(**tokens)


@router.post("/sign-in", response_model=AuthResponse)
@limiter.limit("10/minute", key_func=get_remote_address)
def sign_in_route(payload: SignInRequest, request: Request):
    safe_email = sanitize_email(payload.email)
    enforce_auth_attempt_limit(
        request=request,
        email=safe_email,
        action="sign-in",
        per_email_ip_limit=settings.auth_attempt_limit_per_15min,
        per_email_ip_window_seconds=15 * 60,
    )
    tokens = sign_in(safe_email, payload.password)
    return AuthResponse(**tokens)


@router.get("/me", response_model=UserResponse)
def me(current_user=Depends(get_current_user)):
    user_metadata = getattr(current_user, "user_metadata", None) or {}
    app_display_name = (
        user_metadata.get("full_name")
        or user_metadata.get("name")
        or user_metadata.get("display_name")
        or " ".join(
            part
            for part in [user_metadata.get("first_name"), user_metadata.get("last_name")]
            if part
        ).strip()
        or None
    )

    sub_row = (
        supabase.table("user_subscriptions")
        .select("status")
        .eq("user_id", current_user.id)
        .eq("agent_id", "gmail_followup")
        .execute()
    )

    subscription_status = None
    if sub_row.data:
        statuses = {row.get("status") for row in sub_row.data}
        if "active" in statuses:
            subscription_status = "active"
        elif "past_due" in statuses:
            subscription_status = "past_due"
        elif "canceled" in statuses:
            subscription_status = "canceled"
        elif "inactive" in statuses:
            subscription_status = "inactive"
    else:
        # Fall back to legacy users.subscription_status
        user_row = (
            supabase.table("users")
            .select("subscription_status")
            .eq("id", current_user.id)
            .limit(1)
            .execute()
        )
        if user_row.data:
            subscription_status = user_row.data[0].get("subscription_status")

    gmail_row = (
        supabase.table("gmail_connections")
        .select("display_name")
        .eq("user_id", current_user.id)
        .eq("agent_id", "gmail_followup")
        .limit(1)
        .execute()
    )
    gmail_display_name = None
    if gmail_row.data:
        gmail_display_name = gmail_row.data[0].get("display_name")

    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        display_name=app_display_name,
        subscription_status=subscription_status,
        gmail_display_name=gmail_display_name,
    )
