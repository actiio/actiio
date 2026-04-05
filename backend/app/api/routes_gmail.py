from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from googleapiclient.discovery import build
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.api.deps import get_current_user, validate_agent_id
from app.middleware.subscription import require_active_subscription
from app.core.config import get_settings
from app.core.limiter import limiter, user_or_ip_key_func
from app.core.rate_limit import enforce_send_quota
from app.core.sanitization import sanitize_payload
from app.core.supabase import get_supabase
from app.core.utils import raise_internal_error
from integrations.gmail.auth import GmailConnectionExpiredError, get_auth_url, get_credentials, handle_callback, parse_state
from integrations.gmail.sender import send_gmail
from integrations.gmail.sync import initial_sync
from integrations.gmail.sync import initial_sync
router = APIRouter(prefix="/gmail", tags=["gmail"])
settings = get_settings()
supabase = get_supabase()
logger = logging.getLogger(__name__)


class GmailAuthUrlResponse(BaseModel):
    auth_url: str


class GmailSyncResponse(BaseModel):
    leads_found: int
    updated_threads: int = 0
    replied_threads: int = 0
    last_synced_at: Optional[str] = None


class GmailStatusResponse(BaseModel):
    connected: bool
    status: Optional[str] = None
    email: Optional[str] = None
    display_name: Optional[str] = None
    last_synced_at: Optional[str] = None


class GmailSendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    agent_id: str = Field(default="gmail_followup", min_length=1)
    thread_id: str = Field(min_length=36, max_length=36)
    gmail_thread_id: str
    last_gmail_message_id: str
    contact_email: EmailStr
    subject: str = Field(min_length=1, max_length=255)
    message_body: str = Field(min_length=1, max_length=10000)
    attachment_path: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_content_base64: Optional[str] = None
    attachment_mime_type: Optional[str] = None
    attachments: Optional[list["GmailAttachmentInput"]] = None
    selected_draft: Optional[dict[str, Any]] = None


class GmailAttachmentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attachment_path: Optional[str] = Field(default=None, max_length=500)
    attachment_name: Optional[str] = Field(default=None, max_length=255)
    attachment_content_base64: Optional[str] = Field(default=None, max_length=25_000_000)
    attachment_mime_type: Optional[str] = Field(default=None, max_length=120)


class GmailAgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    agent_id: str = Field(default="gmail_followup", min_length=1, max_length=120)


GmailSendRequest.model_rebuild()
GmailAgentRequest.model_rebuild()


def _resolve_agent_id_from_payload(payload: dict[str, Any] | None) -> str:
    if not isinstance(payload, dict):
        return "gmail_followup"
    requested_agent_id = payload.get("agent_id")
    if not isinstance(requested_agent_id, str) or not requested_agent_id.strip():
        return "gmail_followup"
    return validate_agent_id(requested_agent_id)


def _get_current_gmail_account_email(user_id: str, agent_id: str) -> str | None:
    response = (
        supabase.table("gmail_connections")
        .select("email,status")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if not response.data:
        return None
    row = response.data[0]
    if row.get("status") == "disconnected":
        return None
    email = (row.get("email") or "").strip().lower()
    return email or None


def _run_initial_sync_after_connect(user_id: str, agent_id: str) -> None:
    try:
        credentials = get_credentials(user_id, agent_id=agent_id)
        service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        initial_sync(user_id, service, agent_id=agent_id)
    except GmailConnectionExpiredError as exc:
        logger.warning("Post-connect Gmail auth expired for user %s (%s): %s", user_id, agent_id, exc)
    except Exception as exc:
        logger.warning("Post-connect Gmail sync failed for user %s (%s): %s", user_id, agent_id, exc)


@router.get("/auth", response_model=GmailAuthUrlResponse)
def gmail_auth(agent_id: str = Query(default="gmail_followup"), current_user=Depends(get_current_user)):
    agent_id = validate_agent_id(agent_id)
    try:
        auth_url = get_auth_url(current_user.id, agent_id=agent_id)
    except Exception as exc:
        raise_internal_error(logger, message="Failed to generate Gmail auth URL", exc=exc)
    return GmailAuthUrlResponse(auth_url=auth_url)


@router.get("/callback")
def gmail_callback(
    background_tasks: BackgroundTasks,
    code: str = Query(...),
    state: Optional[str] = Query(default=None),
):
    parsed_user_id, agent_id = parse_state(state)
    if not parsed_user_id:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    agent_id = validate_agent_id(agent_id)

    try:
        handle_callback(code=code, user_id=parsed_user_id, agent_id=agent_id)
        background_tasks.add_task(_run_initial_sync_after_connect, parsed_user_id, agent_id)
    except Exception as exc:
        raise_internal_error(
            logger,
            message="Failed to complete Gmail OAuth callback",
            exc=exc,
            detail="Failed to connect Gmail account.",
        )
    settings = get_settings()
    redirect_url = (
        (settings.frontend_url or "http://localhost:3000").rstrip("/")
        + f"/agents/{agent_id}/settings?gmail_connected=1"
    )
    return RedirectResponse(url=redirect_url)


@router.post("/sync", response_model=GmailSyncResponse)
@limiter.limit("10/hour", key_func=user_or_ip_key_func)
def gmail_sync(
    request: Request,
    payload: dict[str, Any] | None = Body(default=None),
    current_user=Depends(get_current_user),
    _=Depends(require_active_subscription),
):
    agent_id = _resolve_agent_id_from_payload(payload)
    try:
        credentials = get_credentials(current_user.id, agent_id=agent_id)
        service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        sync_result = initial_sync(current_user.id, service, agent_id=agent_id)
        connection = (
            supabase.table("gmail_connections")
            .select("last_synced_at,created_at")
            .eq("user_id", current_user.id)
            .eq("agent_id", agent_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
    except GmailConnectionExpiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Gmail connection expired. Please reconnect your Gmail account.",
        ) from exc
    except Exception as exc:
        raise_internal_error(logger, message="Failed to sync Gmail inbox", exc=exc, detail="Failed to sync Gmail inbox.")

    connection_row = connection.data[0] if connection.data else {}
    return GmailSyncResponse(
        leads_found=sync_result.get("leads_found", 0),
        updated_threads=sync_result.get("updated_threads", 0),
        replied_threads=sync_result.get("replied_threads", 0),
        last_synced_at=(connection_row.get("last_synced_at") or connection_row.get("created_at")),
    )


@router.post("/send")
def gmail_send(
    request: Request,
    payload: GmailSendRequest,
    current_user=Depends(get_current_user),
    _=Depends(require_active_subscription),
):
    agent_id = validate_agent_id(payload.agent_id)
    gmail_account_email = _get_current_gmail_account_email(current_user.id, agent_id)
    thread_response = (
        supabase.table("lead_threads")
        .select("id,gmail_thread_id,contact_email")
        .eq("id", payload.thread_id)
        .eq("user_id", current_user.id)
        .eq("agent_id", agent_id)
        .eq("gmail_account_email", gmail_account_email)
        .limit(1)
        .execute()
    )
    if not thread_response.data:
        raise HTTPException(status_code=404, detail="Thread not found")

    thread = thread_response.data[0]
    if thread.get("gmail_thread_id") != payload.gmail_thread_id:
        raise HTTPException(status_code=400, detail="Thread metadata mismatch")
    if thread.get("contact_email") and thread["contact_email"].lower() != payload.contact_email.lower():
        raise HTTPException(status_code=400, detail="Contact email mismatch")

    clean_payload = sanitize_payload(
        payload.model_dump(),
        preserve_newlines_keys={"message_body"},
    )
    enforce_send_quota(
        user_id=current_user.id,
        channel="gmail",
        hourly_limit=settings.send_limit_per_hour,
        daily_limit=settings.send_limit_per_day,
    )
    try:
        result = send_gmail(
            user_id=current_user.id,
            agent_id=agent_id,
            thread_id=clean_payload["thread_id"],
            gmail_thread_id=clean_payload["gmail_thread_id"],
            last_gmail_message_id=clean_payload["last_gmail_message_id"],
            contact_email=clean_payload["contact_email"],
            subject=clean_payload["subject"],
            message_body=clean_payload["message_body"],
            attachment_path=clean_payload.get("attachment_path"),
            attachment_name=clean_payload.get("attachment_name"),
            attachment_content_base64=clean_payload.get("attachment_content_base64"),
            attachment_mime_type=clean_payload.get("attachment_mime_type"),
            attachments=clean_payload.get("attachments"),
            selected_draft=clean_payload.get("selected_draft"),
        )
    except GmailConnectionExpiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Gmail connection expired. Please reconnect your Gmail account.",
        ) from exc
    except Exception as exc:
        raise_internal_error(logger, message="Failed to send Gmail reply", exc=exc, detail="Failed to send Gmail reply.")

    return {"status": "sent", **result}


@router.get("/status", response_model=GmailStatusResponse)
def gmail_status(agent_id: str = Query(default="gmail_followup"), current_user=Depends(get_current_user)):
    agent_id = validate_agent_id(agent_id)
    response = (
        supabase.table("gmail_connections")
        .select("id,email,display_name,last_synced_at,created_at,status")
        .eq("user_id", current_user.id)
        .eq("agent_id", agent_id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if not response.data:
        return GmailStatusResponse(connected=False, status=None, email=None, display_name=None, last_synced_at=None)
    row = response.data[0]
    connection_status = row.get("status") or "connected"
    return GmailStatusResponse(
        connected=connection_status != "disconnected",
        status=connection_status,
        email=row.get("email"),
        display_name=row.get("display_name"),
        last_synced_at=(row.get("last_synced_at") or row.get("created_at")),
    )


@router.post("/disconnect")
def gmail_disconnect(
    payload: dict[str, Any] | None = Body(default=None),
    current_user=Depends(get_current_user),
):
    agent_id = _resolve_agent_id_from_payload(payload)
    (
        supabase.table("gmail_connections")
        .update(
            {
                "status": "disconnected",
                "access_token": "",
                "refresh_token": None,
                "token_expiry": None,
            }
        )
        .eq("user_id", current_user.id)
        .eq("agent_id", agent_id)
        .eq("is_active", True)
        .execute()
    )
    return {"status": "disconnected"}
