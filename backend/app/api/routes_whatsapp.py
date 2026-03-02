from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.middleware.subscription import require_active_subscription
from integrations.whatsapp.auth import save_connection
from integrations.whatsapp.sender import send_whatsapp
from integrations.whatsapp.webhook import handle_webhook_event

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


class WhatsAppConnectRequest(BaseModel):
    phone_number_id: str = Field(min_length=1)
    access_token: str = Field(min_length=1)
    business_account_id: Optional[str] = None
    display_phone_number: Optional[str] = None


class WhatsAppSendRequest(BaseModel):
    thread_id: str = Field(min_length=1)
    message_body: str = Field(min_length=1)


@router.post("/connect")
def whatsapp_connect(payload: WhatsAppConnectRequest, current_user=Depends(get_current_user)):
    try:
        connection = save_connection(
            user_id=current_user.id,
            phone_number_id=payload.phone_number_id,
            access_token=payload.access_token,
            business_account_id=payload.business_account_id or "",
            display_phone_number=payload.display_phone_number or "",
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"status": "connected", "connection": connection}


@router.get("/webhook")
def verify_whatsapp_webhook(
    hub_mode: Optional[str] = Query(default=None, alias="hub.mode"),
    hub_verify_token: Optional[str] = Query(default=None, alias="hub.verify_token"),
    hub_challenge: Optional[str] = Query(default=None, alias="hub.challenge"),
):
    settings = get_settings()
    expected_token = settings.whatsapp_verify_token

    if hub_mode == "subscribe" and expected_token and hub_verify_token == expected_token and hub_challenge:
        return int(hub_challenge)

    raise HTTPException(status_code=403, detail="Webhook verification failed")


@router.post("/webhook")
def whatsapp_webhook(payload: Dict[str, Any] = Body(...)):
    try:
        return handle_webhook_event(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/send")
def whatsapp_send(payload: WhatsAppSendRequest, current_user=Depends(get_current_user), _=Depends(require_active_subscription)):
    try:
        result = send_whatsapp(
            user_id=current_user.id,
            thread_id=payload.thread_id,
            message_body=payload.message_body,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"status": "sent", **result}
