import logging

from fastapi import HTTPException, status

from app.core.supabase import get_supabase
from services.email_service import send_confirmation_email, send_password_reset_email

supabase = get_supabase()
logger = logging.getLogger(__name__)


def _extract_error_text(error: Exception) -> str:
    parts: list[str] = []

    for attr in ("message", "detail", "code"):
        value = getattr(error, attr, None)
        if value:
            parts.append(str(value))

    response = getattr(error, "response", None)
    if response is not None:
        for attr in ("text", "content"):
            value = getattr(response, attr, None)
            if value:
                parts.append(str(value))

    parts.append(str(error))
    return " ".join(part for part in parts if part).lower()


def sign_up(email: str, password: str) -> dict:
    # Use Supabase Admin to create the user.
    # This prevents the default Supabase email from being sent.
    generic_signup_message = "If this email is new, you'll receive a confirmation shortly."
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
        # We explicitly point it to /auth/callback so the browser can exchange the token for a session cookie.
        from app.core.config import get_settings
        settings = get_settings()
        redirect_to = f"{settings.frontend_url}/auth/callback"
        
        link_response = supabase.auth.admin.generate_link({
            "type": "signup",
            "email": email,
            "options": {"redirect_to": redirect_to}
        })
        
        if link_response.properties and link_response.properties.action_link:
            send_confirmation_email(email, link_response.properties.action_link)
        
        # We don't return a session because the user is not confirmed yet.
        # This matches the 'Confirm Email: ON' behavior.
        return {"message": generic_signup_message}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Sign up failure: %s", e)
        error_text = _extract_error_text(e)
        duplicate_phrases = [
            "already registered",
            "already exists",
            "already in use",
            "duplicate key",
            "unique constraint",
            "email exists",
            "email already",
            "user already exists",
            "email address has already been registered",
            "email address is already registered",
        ]
        if any(p in error_text for p in duplicate_phrases):
            return {"message": generic_signup_message}
        elif "password" in error_text and ("weak" in error_text or "at least" in error_text or "too short" in error_text):
            detail = "Password is too weak. Please use a stronger password."
        elif "invalid" in error_text and "email" in error_text:
            detail = "Please provide a valid email address."
        else:
            detail = "Something went wrong. Please try again."
        raise HTTPException(status_code=400, detail=detail)


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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication failed") from exc

    if user_response.user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication failed")

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
