from __future__ import annotations

import base64
import email.utils
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import logging
import re

logger = logging.getLogger(__name__)


def _normalize_contact_name(name: str, email_addr: str) -> Optional[str]:
    candidate = (name or "").strip().strip('"').strip("'")
    email_value = (email_addr or "").strip().lower()

    if not candidate:
        return None
    if "@" in candidate:
        return None
    if email_value and candidate.lower() == email_value:
        return None

    # Reject raw username-like handles such as "schizojeesh", "john_92", or "sales-team123".
    if not re.search(r"[A-Z\s]", candidate) and re.fullmatch(r"[a-z0-9._-]+", candidate):
        return None

    cleaned = re.sub(r"\s{2,}", " ", candidate).strip()
    return cleaned or None

def _strip_html(html: str) -> str:
    """
    Strip HTML tags and decode entities
    to get plain text from HTML emails.
    """
    import re
    import html as html_module
    
    # Remove style blocks
    html = re.sub(
        r'<style[^>]*>.*?</style>',
        '',
        html,
        flags=re.DOTALL | re.IGNORECASE
    )
    
    # Remove script blocks
    html = re.sub(
        r'<script[^>]*>.*?</script>',
        '',
        html,
        flags=re.DOTALL | re.IGNORECASE
    )
    
    # Replace block elements with newlines
    html = re.sub(
        r'<br\s*/?>',
        '\n',
        html,
        flags=re.IGNORECASE
    )
    html = re.sub(
        r'</p>|</div>|</tr>',
        '\n',
        html,
        flags=re.IGNORECASE
    )
    
    # Remove all remaining tags
    html = re.sub(r'<[^>]+>', '', html)
    
    # Decode HTML entities
    html = html_module.unescape(html)
    
    # Clean up whitespace
    html = re.sub(r'\n{3,}', '\n\n', html)
    html = re.sub(r'[ \t]+', ' ', html)
    
    return html.strip()



def _decode_body(payload: Dict[str, Any]) -> str:
    """
    Recursively extract plain text body from 
    a Gmail message payload.
    
    Handles all multipart structures:
    - text/plain (simple email)
    - text/html (html only email)
    - multipart/alternative (text + html)
    - multipart/mixed (text + attachments)
    - multipart/related (html + inline images)
    - Deeply nested combinations
    
    Priority: text/plain > text/html
    Never returns attachment content.
    """
    mime_type = payload.get('mimeType', '')
    parts = payload.get('parts', [])
    body_data = payload.get('body', {}).get('data')
    
    # Base case: this IS the text content
    if mime_type == 'text/plain' and body_data:
        try:
            return base64.urlsafe_b64decode(
                body_data + '=='
            ).decode('utf-8', errors='replace').strip()
        except Exception:
            return ''
    
    # Base case: HTML only — strip tags
    if mime_type == 'text/html' and body_data:
        try:
            html = base64.urlsafe_b64decode(
                body_data + '=='
            ).decode('utf-8', errors='replace')
            return _strip_html(html).strip()
        except Exception:
            return ''
    
    # If no parts to recurse into, nothing to return
    if not parts:
        return ''
    
    # Multipart: collect text/plain and text/html 
    # separately, prefer plain text
    plain_text = ''
    html_text = ''
    
    for part in parts:
        part_mime = part.get('mimeType', '')
        part_body_data = part.get('body', {}).get('data')
        
        # Direct text/plain leaf
        if part_mime == 'text/plain' and part_body_data:
            try:
                text = base64.urlsafe_b64decode(
                    part_body_data + '=='
                ).decode('utf-8', errors='replace').strip()
                if text:
                    plain_text = text
            except Exception:
                pass
        
        # Direct text/html leaf
        elif part_mime == 'text/html' and part_body_data:
            try:
                html = base64.urlsafe_b64decode(
                    part_body_data + '=='
                ).decode('utf-8', errors='replace')
                text = _strip_html(html).strip()
                if text:
                    html_text = text
            except Exception:
                pass
        
        # Nested multipart — recurse
        # but ONLY for multipart types
        # Never recurse into attachments
        elif part_mime.startswith('multipart/'):
            nested = _decode_body(part)
            if nested:
                # If we found plain text in nested,
                # it takes priority
                if not plain_text:
                    plain_text = nested
        
        # Skip everything else:
        # application/pdf, image/jpeg, etc.
        # These are attachments, not body text
    
    return plain_text or html_text or ''


def _headers_map(headers: List[Dict[str, str]]) -> Dict[str, str]:
    return {header.get("name", "").lower(): header.get("value", "") for header in headers}


def _collect_attachment_names(payload: Dict[str, Any]) -> List[str]:
    attachment_names: List[str] = []

    def walk(part: Dict[str, Any]) -> None:
        filename = (part.get("filename") or "").strip()
        body = part.get("body") or {}
        attachment_id = body.get("attachmentId")
        if filename and attachment_id:
            attachment_names.append(filename)

        for child in part.get("parts", []) or []:
            if isinstance(child, dict):
                walk(child)

    walk(payload)

    deduped: List[str] = []
    seen = set()
    for name in attachment_names:
        if name in seen:
            continue
        seen.add(name)
        deduped.append(name)
    return deduped


def parse_from_header(from_header: str) -> tuple:
    """
    Parse From header into (name, email) tuple.

    Examples:
    "John Smith <john@gmail.com>"
      → ("John Smith", "john@gmail.com")

    "john@gmail.com"
      → ("john@gmail.com", "john@gmail.com")

    "<john@gmail.com>"
      → ("john@gmail.com", "john@gmail.com")
    """
    if not from_header:
        return (None, "")

    name, email_addr = email.utils.parseaddr(from_header)
    email_addr = email_addr.strip()
    normalized_name = _normalize_contact_name(name, email_addr)
    return (normalized_name, email_addr)


def parse_message(raw_gmail_message: Dict[str, Any], owner_email: Optional[str] = None) -> Dict[str, Any]:
    payload = raw_gmail_message.get("payload", {})
    headers = _headers_map(payload.get("headers", []))

    from_raw = headers.get("from", "")
    to_raw = headers.get("to", "")
    from_name, from_email = parse_from_header(from_raw)
    _, to_email = email.utils.parseaddr(to_raw)

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
    attachment_names = _collect_attachment_names(payload)

    if not body:
        logger.warning(
            f"Empty body parsed for message "
            f"{raw_gmail_message.get('id')} "
            f"with mime_type: "
            f"{payload.get('mimeType', 'unknown')}"
        )

    return {
        "gmail_message_id": raw_gmail_message.get("id"),
        "gmail_thread_id": raw_gmail_message.get("threadId"),
        "header_message_id": headers.get("message-id"),
        "reply_to": headers.get("reply-to"),
        "cc": headers.get("cc"),
        "subject": subject,
        "sender_name": from_name,
        "sender_email": from_email,
        "recipient_email": to_email,
        "body": body,
        "has_attachments": bool(attachment_names),
        "attachment_names": attachment_names,
        "timestamp": timestamp,
        "direction": direction,
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
