from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from googleapiclient.discovery import build
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.middleware.subscription import require_active_subscription
from integrations.gmail.auth import get_auth_url, get_credentials, handle_callback
from integrations.gmail.sender import send_gmail
from integrations.gmail.sync import initial_sync
from integrations.gmail.webhook import handle_pubsub_notification
from app.core.config import get_settings

router = APIRouter(prefix="/gmail", tags=["gmail"])


class GmailAuthUrlResponse(BaseModel):
    auth_url: str


class GmailSyncResponse(BaseModel):
    leads_found: int


class GmailSendRequest(BaseModel):
    thread_id: str
    gmail_thread_id: str
    last_gmail_message_id: str
    contact_email: str
    subject: str = Field(min_length=1, max_length=255)
    message_body: str = Field(min_length=1)


@router.get("/auth", response_model=GmailAuthUrlResponse)
def gmail_auth(current_user=Depends(get_current_user)):
    try:
        auth_url = get_auth_url(current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return GmailAuthUrlResponse(auth_url=auth_url)


@router.get("/callback")
def gmail_callback(
    code: str = Query(...),
    state: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
):
    effective_user_id = state or user_id
    if not effective_user_id:
        raise HTTPException(status_code=400, detail="Missing user_id/state in callback")

    try:
        handle_callback(code=code, user_id=effective_user_id)
        credentials = get_credentials(effective_user_id)
        service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        initial_sync(effective_user_id, service)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    settings = get_settings()
    redirect_url = (settings.frontend_url or "http://localhost:3000").rstrip("/") + "/onboarding?gmail_connected=1"
    return RedirectResponse(url=redirect_url)


@router.post("/sync", response_model=GmailSyncResponse)
def gmail_sync(current_user=Depends(get_current_user), _=Depends(require_active_subscription)):
    try:
        credentials = get_credentials(current_user.id)
        service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        leads_found = initial_sync(current_user.id, service)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return GmailSyncResponse(leads_found=leads_found)


@router.post("/webhook")
def gmail_webhook(payload: Dict[str, Any] = Body(...)):
    try:
        result = handle_pubsub_notification(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return result


@router.post("/send")
def gmail_send(payload: GmailSendRequest, current_user=Depends(get_current_user), _=Depends(require_active_subscription)):
    try:
        result = send_gmail(
            user_id=current_user.id,
            thread_id=payload.thread_id,
            gmail_thread_id=payload.gmail_thread_id,
            last_gmail_message_id=payload.last_gmail_message_id,
            contact_email=payload.contact_email,
            subject=payload.subject,
            message_body=payload.message_body,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"status": "sent", **result}
