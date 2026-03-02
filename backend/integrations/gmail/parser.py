from __future__ import annotations

import base64
from datetime import datetime, timezone
from email.utils import parseaddr
from typing import Any, Dict, List, Optional


def _decode_body(payload: Dict[str, Any]) -> str:
    body_data = payload.get("body", {}).get("data")
    if body_data:
        return base64.urlsafe_b64decode(body_data + "==").decode("utf-8", errors="ignore")

    for part in payload.get("parts", []) or []:
        mime_type = part.get("mimeType", "")
        if mime_type in ("text/plain", "text/html"):
            data = part.get("body", {}).get("data")
            if data:
                return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="ignore")

    return ""


def _headers_map(headers: List[Dict[str, str]]) -> Dict[str, str]:
    return {header.get("name", "").lower(): header.get("value", "") for header in headers}


def parse_message(raw_gmail_message: Dict[str, Any], owner_email: Optional[str] = None) -> Dict[str, Any]:
    payload = raw_gmail_message.get("payload", {})
    headers = _headers_map(payload.get("headers", []))

    from_raw = headers.get("from", "")
    to_raw = headers.get("to", "")
    from_name, from_email = parseaddr(from_raw)
    _, to_email = parseaddr(to_raw)

    internal_date_ms = raw_gmail_message.get("internalDate")
    timestamp = None
    if internal_date_ms:
        dt = datetime.fromtimestamp(int(internal_date_ms) / 1000, tz=timezone.utc)
        timestamp = dt.isoformat()

    direction = "inbound"
    if owner_email:
        sender = (from_email or "").strip().lower()
        owner = owner_email.strip().lower()
        if sender == owner:
            direction = "outbound"

    subject = headers.get("subject", "")
    body = _decode_body(payload).strip()
    combined_text = f"{subject}\n{body}".lower()
    sender_lower = (from_email or "").strip().lower()
    list_unsubscribe = headers.get("list-unsubscribe", "")
    precedence = headers.get("precedence", "").lower()
    auto_submitted = headers.get("auto-submitted", "").lower()
    x_autoreply = headers.get("x-autoreply", "").lower()

    is_automated = (
        bool(list_unsubscribe)
        or precedence in {"bulk", "list", "junk"}
        or auto_submitted in {"auto-generated", "auto-replied"}
        or x_autoreply in {"yes", "auto-replied"}
        or sender_lower.startswith("no-reply@")
        or sender_lower.startswith("noreply@")
        or sender_lower.startswith("donotreply@")
        or sender_lower.startswith("do-not-reply@")
    )
    is_promotional = any(
        keyword in combined_text
        for keyword in (
            "unsubscribe",
            "view in browser",
            "manage preferences",
            "marketing email",
            "newsletter",
            "weekly digest",
            "flash sale",
            "promo code",
            "coupon",
            "receipt",
            "order confirmation",
            "payment received",
        )
    )

    return {
        "gmail_message_id": raw_gmail_message.get("id"),
        "gmail_thread_id": raw_gmail_message.get("threadId"),
        "subject": subject,
        "sender_name": from_name,
        "sender_email": from_email,
        "recipient_email": to_email,
        "body": body,
        "timestamp": timestamp,
        "direction": direction,
        "is_automated": is_automated,
        "is_promotional": is_promotional,
    }


def parse_thread(raw_gmail_thread: Dict[str, Any], owner_email: Optional[str] = None) -> Dict[str, Any]:
    parsed_messages = [parse_message(message, owner_email=owner_email) for message in raw_gmail_thread.get("messages", [])]

    first_message = parsed_messages[0] if parsed_messages else {}
    contact_name = first_message.get("sender_name")
    contact_email = first_message.get("sender_email")

    if owner_email:
        owner = owner_email.strip().lower()
        for message in parsed_messages:
            sender = (message.get("sender_email") or "").strip().lower()
            recipient = (message.get("recipient_email") or "").strip().lower()
            if sender != owner and sender:
                contact_name = message.get("sender_name")
                contact_email = message.get("sender_email")
                break
            if recipient and recipient != owner:
                contact_email = message.get("recipient_email")

    return {
        "gmail_thread_id": raw_gmail_thread.get("id"),
        "subject": first_message.get("subject", ""),
        "contact_name": contact_name,
        "contact_email": contact_email,
        "messages": parsed_messages,
    }
