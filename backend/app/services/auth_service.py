import logging

from fastapi import HTTPException, status

from app.core.supabase import get_supabase
from services.email_service import send_confirmation_email, send_password_reset_email

supabase = get_supabase()
logger = logging.getLogger(__name__)


def sign_up(email: str, password: str) -> dict:
    # Use Supabase Admin to create the user.
    # This prevents the default Supabase email from being sent.
    try:
        user_response = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": False  # User must confirm via OUR email link
        })
        user = user_response.user
        
        if not user:
            raise HTTPException(status_code=400, detail="Failed to create user.")

        # Generate OUR custom confirmation link
        link_response = supabase.auth.admin.generate_link({
            "type": "signup",
            "email": email,
        })
        
        if link_response.properties and link_response.properties.action_link:
            send_confirmation_email(email, link_response.properties.action_link)
        
        # We don't return a session because the user is not confirmed yet.
        # This matches the 'Confirm Email: ON' behavior.
        return {"message": "Please check your email to confirm your account."}

    except Exception as e:
        logger.error("Sign up failure: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


def sign_in(email: str, password: str) -> dict:
    response = supabase.auth.sign_in_with_password({"email": email, "password": password})
    session = response.session

    if session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
    }


def get_user_from_token(token: str):
    try:
        user_response = supabase.auth.get_user(token)
    except Exception as exc:
        logger.warning("Auth token validation failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc

    if user_response.user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found for token")

    return user_response.user


def request_password_reset(email: str, redirect_to: str) -> None:
    try:
        # 1. Check if user exists (optional, but good for UX if handled)
        # 2. Generate recovery link
        res = supabase.auth.admin.generate_link({
            "type": "recovery",
            "email": email,
            "options": {"redirect_to": redirect_to}
        })
        
        if res.properties and res.properties.action_link:
            send_password_reset_email(email, res.properties.action_link)
        else:
            # Fallback to standard Supabase reset if admin link fails
            supabase.auth.reset_password_for_email(email, {"redirect_to": redirect_to})
            
    except Exception as e:
        logger.error("Password reset request failed for %s: %s", email, e)
        # Fallback to standard Supabase reset
        supabase.auth.reset_password_for_email(email, {"redirect_to": redirect_to})
