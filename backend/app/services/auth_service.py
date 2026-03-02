from fastapi import HTTPException, status

from app.core.supabase import get_supabase

supabase = get_supabase()


def sign_up(email: str, password: str) -> dict:
    response = supabase.auth.sign_up({"email": email, "password": password})
    session = response.session

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Signup succeeded but no session returned. Check email confirmation settings.",
        )

    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
    }


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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc

    if user_response.user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found for token")

    return user_response.user
