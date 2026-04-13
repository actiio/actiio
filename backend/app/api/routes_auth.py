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


@router.post("/forgot-password")
@limiter.limit("5/minute", key_func=get_remote_address)
def forgot_password_route(
    payload: ForgotPasswordRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    from fastapi import HTTPException
    
    safe_email = sanitize_email(payload.email)
    enforce_auth_attempt_limit(
        request=request,
        email=safe_email,
        action="forgot-password",
        per_email_ip_limit=settings.auth_attempt_limit_per_15min,
        per_email_ip_window_seconds=15 * 60,
    )
    
    # Redirect back to the frontend reset-password page
    redirect_to = f"{settings.frontend_url}/reset-password"
    
    try:
        # Check existence by generating the recovery link synchronously.
        # This allows us to return a 404 if the user doesn't exist.
        res = supabase.auth.admin.generate_link({
            "type": "recovery",
            "email": safe_email,
            "options": {"redirect_to": redirect_to}
        })
        
        if res.properties and res.properties.action_link:
            # User exists, queue the email delivery
            background_tasks.add_task(send_password_reset_email, safe_email, res.properties.action_link)
            return {"message": "A reset link has been sent to your email."}
        else:
            # Fallback to standard Supabase reset if somehow the link wasn't returned
            background_tasks.add_task(request_password_reset, safe_email, redirect_to)
            return {"message": "If that email exists, a reset link has been sent."}
            
    except Exception as e:
        # If Supabase returns 'User not found', we explicitly tell the user.
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail="No account found with this email.")
            
        # For other errors, log and fallback to the generic background task
        import logging
        logging.getLogger(__name__).error(f"Password reset request failed for {safe_email}: {e}")
        background_tasks.add_task(request_password_reset, safe_email, redirect_to)
        return {"message": "If that email exists, a reset link has been sent."}

