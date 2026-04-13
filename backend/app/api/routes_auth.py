from fastapi import APIRouter, BackgroundTasks, Depends, Request
from slowapi.util import get_remote_address

from app.core.limiter import limiter
from app.core.config import get_settings
from app.core.rate_limit import enforce_auth_attempt_limit
from app.core.sanitization import sanitize_email
from app.core.supabase import get_supabase
from app.api.deps import get_current_user
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    SignInRequest,
    SignUpResponse,
    SignUpRequest,
    UserResponse,
)
from app.services.auth_service import request_password_reset, sign_in, sign_up
from services.email_service import send_password_reset_email

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()
supabase = get_supabase()


@router.post("/sign-up", response_model=SignUpResponse)
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
    result = sign_up(safe_email, payload.password)
    return SignUpResponse(**result)


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
        elif "cancelled" in statuses:
            subscription_status = "cancelled"
        elif "pending" in statuses:
            subscription_status = "pending"

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


import logging as _logging
_forgot_password_logger = _logging.getLogger(__name__)

# Per-email rate limit for forgot-password: max 3 per email per hour
_forgot_password_email_tracker: dict[str, list[float]] = {}
_FORGOT_PASSWORD_PER_EMAIL_LIMIT = 3
_FORGOT_PASSWORD_PER_EMAIL_WINDOW = 3600  # 1 hour

def _check_forgot_password_email_limit(email: str) -> bool:
    """Return True if the email has exceeded the per-email forgot-password limit."""
    import time as _time
    now = _time.time()
    cutoff = now - _FORGOT_PASSWORD_PER_EMAIL_WINDOW
    timestamps = _forgot_password_email_tracker.get(email, [])
    timestamps = [t for t in timestamps if t > cutoff]
    _forgot_password_email_tracker[email] = timestamps
    if len(timestamps) >= _FORGOT_PASSWORD_PER_EMAIL_LIMIT:
        return True
    timestamps.append(now)
    return False


@router.post("/forgot-password")
@limiter.limit("5/minute", key_func=get_remote_address)
def forgot_password_route(
    payload: ForgotPasswordRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    safe_email = sanitize_email(payload.email)
    enforce_auth_attempt_limit(
        request=request,
        email=safe_email,
        action="forgot-password",
        per_email_ip_limit=settings.auth_attempt_limit_per_15min,
        per_email_ip_window_seconds=15 * 60,
    )

    # Generic response — never reveal whether the email exists.
    generic_response = {"message": "If an account exists with this email, you will receive a password reset link shortly."}

    # Per-email rate limit: max 3 reset requests per email per hour.
    if _check_forgot_password_email_limit(safe_email):
        _forgot_password_logger.info("Forgot-password per-email rate limit hit for %s", safe_email)
        return generic_response

    # Redirect back to the frontend reset-password page
    redirect_to = f"{settings.frontend_url}/reset-password"

    try:
        res = supabase.auth.admin.generate_link({
            "type": "recovery",
            "email": safe_email,
            "options": {"redirect_to": redirect_to}
        })

        if res.properties and res.properties.action_link:
            background_tasks.add_task(send_password_reset_email, safe_email, res.properties.action_link)
        else:
            background_tasks.add_task(request_password_reset, safe_email, redirect_to)

    except Exception as e:
        # Log the actual error internally but never expose it to the client.
        _forgot_password_logger.error("Password reset request failed for %s: %s", safe_email, e)
        # If user not found, still return the generic message — no information leak.
        # For other errors, attempt fallback silently.
        if "not found" not in str(e).lower():
            background_tasks.add_task(request_password_reset, safe_email, redirect_to)

    return generic_response

