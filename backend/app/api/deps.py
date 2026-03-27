from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.supabase import get_supabase
from app.core.utils import is_valid_agent_id
from app.services.auth_service import get_user_from_token

bearer_scheme = HTTPBearer(auto_error=False)
supabase = get_supabase()


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    user = get_user_from_token(credentials.credentials)
    request.state.rate_limit_user_id = str(user.id)
    return user


def validate_agent_id(agent_id: str | None, *, default: str = "gmail_followup") -> str:
    normalized = (agent_id or default).strip()
    if not is_valid_agent_id(normalized):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid agent_id")

    response = (
        supabase.table("agents")
        .select("id")
        .eq("id", normalized)
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    return normalized
