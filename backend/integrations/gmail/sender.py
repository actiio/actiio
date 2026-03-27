from __future__ import annotations

import base64
import binascii
import html
import mimetypes
import os
from datetime import datetime, timezone
from email import policy
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import re
import logging
from typing import Dict, Optional

from googleapiclient.discovery import build

from app.core.config import get_settings
from app.core.sanitization import sanitize_text
from app.core.supabase import get_supabase

supabase = get_supabase()
from integrations.gmail.auth import get_credentials
logger = logging.getLogger(__name__)

MAX_TOTAL_ATTACHMENTS = 5
MAX_CUSTOM_ATTACHMENTS = 3
MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
ALLOWED_ATTACHMENT_EXTENSIONS = {
    "pdf",
    "doc",
    "docx",
    "ppt",
    "pptx",
    "xls",
    "xlsx",
    "csv",
    "txt",
    "png",
    "jpg",
    "jpeg",
    "webp",
}
ALLOWED_ATTACHMENT_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "text/plain",
    "image/png",
    "image/jpeg",
    "image/webp",
}
_SIGN_OFF_RE = re.compile(
    r"(?im)^(best|regards|kind regards|warm regards|thanks|thank you|sincerely|cheers)[,!]?\s*$"
)
_GREETING_RE = re.compile(r"^(hi|hello|hey)\b.*[,!:]?$", re.IGNORECASE)


def _build_preview_snippet(content: str | None, limit: int = 120) -> str:
    cleaned = (content or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    cleaned = re.sub(r"(^|\n)\s*On .+wrote:\s*$.*", "", cleaned, flags=re.IGNORECASE | re.MULTILINE | re.DOTALL)
    cleaned = re.sub(r"(^|\n)\s*From:\s.+$", "", cleaned, flags=re.IGNORECASE | re.MULTILINE)
    cleaned = re.sub(r"(^|\n)\s*>.*$", "", cleaned, flags=re.MULTILINE)
    cleaned = " ".join(cleaned.split())
    if not cleaned:
        return ""
    return cleaned[:limit]


def clean_subject_for_reply(subject: str) -> str:
    """
    Ensure subject has exactly one Re: prefix.
    Handles Re:, RE:, re:, Re: Re:, etc.
    """
    if not subject:
        return "Re: (no subject)"

    # Strip all existing Re: prefixes
    # regardless of case or spacing
    cleaned = re.sub(r"^(re:\s*)+", "", subject, flags=re.IGNORECASE).strip()

    # Add exactly one Re:
    return f"Re: {cleaned}"


def _display_name_from_email(email_value: str | None) -> str | None:
    if not email_value or "@" not in email_value:
        return None
    local_part = email_value.split("@", 1)[0]
    cleaned = re.sub(r"[._-]+", " ", local_part).strip()
    if not cleaned:
        return None
    return " ".join(part.capitalize() for part in cleaned.split())


def _build_signature_block(user_id: str, sender_email: str | None) -> str:
    business_name = None
    email_footer = None
    try:
        profile = (
            supabase.table("business_profiles")
            .select("business_name,email_footer")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if profile.data:
            business_name = (profile.data[0].get("business_name") or "").strip() or None
            email_footer = sanitize_text(profile.data[0].get("email_footer") or "", preserve_newlines=True).strip() or None
    except Exception as exc:
        logger.warning("Failed to load business profile for signature block (user=%s): %s", user_id, exc)

    if email_footer:
        return email_footer

    sender_name = _display_name_from_email(sender_email)
    signature_lines = ["Best,"]

    if sender_name:
        signature_lines.append(sender_name)
    if business_name and business_name not in signature_lines:
        signature_lines.append(business_name)

    return "\n".join(signature_lines)


def _strip_trailing_signature(text: str) -> str:
    lines = text.rstrip().split("\n")
    for index in range(len(lines) - 1, -1, -1):
        if _SIGN_OFF_RE.match(lines[index].strip()):
            return "\n".join(lines[:index]).rstrip()
    return text.rstrip()


def _normalize_email_body(message_body: str, *, user_id: str, sender_email: str | None) -> str:
    text = message_body.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        return text

    lines = [line.rstrip() for line in text.split("\n")]
    normalized_lines: list[str] = []
    for index, line in enumerate(lines):
        normalized_lines.append(line)
        if index == 0 and _GREETING_RE.match(line.strip()):
            next_line = lines[index + 1].strip() if index + 1 < len(lines) else ""
            if next_line:
                normalized_lines.append("")

    normalized = "\n".join(normalized_lines)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized).strip()

    signature_block = _build_signature_block(user_id, sender_email)
    if signature_block:
        normalized = _strip_trailing_signature(normalized)
        if signature_block not in normalized:
            normalized = f"{normalized}\n\n{signature_block}".strip()

    return normalized


def _build_html_body(message_body: str) -> str:
    paragraph_blocks = []
    blocks = [block.strip() for block in re.split(r"\n{2,}", message_body.strip()) if block.strip()]
    last_index = len(blocks) - 1
    for index, clean_block in enumerate(blocks):
        html_block = html.escape(clean_block).replace("\n", "<br>")
        margin_bottom = "10px"
        if index == 0:
            margin_bottom = "12px"
        elif index == last_index:
            margin_bottom = "0"
        paragraph_blocks.append(
            f'<p style="margin: 0 0 {margin_bottom}; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.55; color: #333333;">{html_block}</p>'
        )

    return "<html><body>" + "".join(paragraph_blocks) + "</body></html>"


def _validate_attachment_metadata(file_name: str, mime_type: str) -> tuple[str, str]:
    file_name = sanitize_text(file_name or "attachment", preserve_newlines=False).strip()
    if not file_name:
        raise ValueError("Attachment name is required")
    if "/" in file_name or "\\" in file_name or ".." in file_name:
        raise ValueError("Invalid attachment name")

    extension = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    normalized_mime = sanitize_text(mime_type or "application/octet-stream", preserve_newlines=False).strip().lower()

    if extension not in ALLOWED_ATTACHMENT_EXTENSIONS:
        raise ValueError("Unsupported attachment file type")
    if normalized_mime not in ALLOWED_ATTACHMENT_MIME_TYPES:
        guessed = mimetypes.guess_type(file_name)[0]
        if not guessed or guessed.lower() not in ALLOWED_ATTACHMENT_MIME_TYPES:
            raise ValueError("Unsupported attachment MIME type")
        normalized_mime = guessed.lower()

    return file_name, normalized_mime

def _load_attachment_from_storage(
    user_id: str, attachment_path: Optional[str], attachment_name: Optional[str]
) -> Optional[tuple[bytes, str, str]]:
    attachment_path = sanitize_text(attachment_path or "", preserve_newlines=False)
    attachment_name = sanitize_text(attachment_name or "", preserve_newlines=False) if attachment_name else None
    if not attachment_path:
        return None

    # Require user-scoped object paths: <user_id>/<filename>
    if not attachment_path.startswith(f"{user_id}/"):
        raise ValueError("Invalid attachment path")
    if ".." in attachment_path or "\\" in attachment_path:
        raise ValueError("Invalid attachment path")

    settings = get_settings()
    bucket = settings.sales_assets_bucket or "sales-assets"

    payload = supabase.storage.from_(bucket).download(attachment_path)
    if not payload:
        raise ValueError("Attachment file not found")

    file_name = attachment_name or os.path.basename(attachment_path) or "attachment"
    mime_type = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
    file_name, mime_type = _validate_attachment_metadata(file_name, mime_type)
    return payload, file_name, mime_type


def _load_attachment_from_payload(
    attachment_content_base64: Optional[str],
    attachment_name: Optional[str],
    attachment_mime_type: Optional[str],
) -> Optional[tuple[bytes, str, str]]:
    if not attachment_content_base64:
        return None

    try:
        payload = base64.b64decode(sanitize_text(attachment_content_base64, preserve_newlines=False))
    except binascii.Error as exc:
        raise ValueError("Invalid attachment base64 payload") from exc

    # Keep request payloads bounded.
    if len(payload) > MAX_ATTACHMENT_BYTES:
        raise ValueError("Attachment exceeds 15 MB limit")

    file_name = sanitize_text((attachment_name or "attachment").strip(), preserve_newlines=False)
    mime_type = sanitize_text(
        (attachment_mime_type or mimetypes.guess_type(file_name)[0] or "application/octet-stream").strip(),
        preserve_newlines=False,
    )
    file_name, mime_type = _validate_attachment_metadata(file_name, mime_type)
    return payload, file_name, mime_type


def send_gmail(
    user_id: str,
    agent_id: str,
    thread_id: str,
    gmail_thread_id: str,
    last_gmail_message_id: str,
    contact_email: str,
    subject: str,
    message_body: str,
    attachment_path: Optional[str] = None,
    attachment_name: Optional[str] = None,
    attachment_content_base64: Optional[str] = None,
    attachment_mime_type: Optional[str] = None,
    attachments: Optional[list[dict]] = None,
    selected_draft: Optional[dict] = None,
) -> Dict:
    subject = sanitize_text(subject, preserve_newlines=False)
    message_body = sanitize_text(message_body, preserve_newlines=True)
    credentials = get_credentials(user_id, agent_id=agent_id)
    service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
    sender_email = None
    try:
        profile = service.users().getProfile(userId="me").execute()
        sender_email = profile.get("emailAddress")
    except Exception as exc:
        logger.warning("Failed to fetch Gmail sender profile for user %s: %s", user_id, exc)
    message_body = _normalize_email_body(message_body, user_id=user_id, sender_email=sender_email)

    # 1. Fetch metadata for last_gmail_message_id to get correct headers for threading
    try:
        msg_meta = service.users().messages().get(
            userId='me',
            id=last_gmail_message_id,
            format='metadata',
            metadataHeaders=['Message-ID', 'References', 'Subject', 'From']
        ).execute()

        headers = {h["name"].lower(): h["value"] for h in msg_meta.get("payload", {}).get("headers", [])}
        last_message_id_header = headers.get("message-id")
        existing_references = headers.get("references", "")
        original_subject = headers.get("subject", "")

        # Fix subject prefix stacking
        subject = clean_subject_for_reply(subject or original_subject)

        # Build References: existing References + the last Message-ID
        if last_message_id_header:
            if existing_references:
                references = f"{existing_references} {last_message_id_header}"
            else:
                references = last_message_id_header
        else:
            references = existing_references

    except Exception as exc:
        logger.warning("Failed to fetch Gmail threading metadata for thread %s: %s", thread_id, exc)
        last_message_id_header = None
        references = None
        subject = clean_subject_for_reply(subject)

    # 2. Build the reply email
    normalized_attachments = list(attachments or [])
    if attachment_path or attachment_content_base64:
        normalized_attachments.append(
            {
                "attachment_path": attachment_path,
                "attachment_name": attachment_name,
                "attachment_content_base64": attachment_content_base64,
                "attachment_mime_type": attachment_mime_type,
            }
        )

    custom_count = sum(1 for item in normalized_attachments if item.get("attachment_content_base64"))
    if custom_count > MAX_CUSTOM_ATTACHMENTS:
        raise ValueError(f"Too many custom attachments. Max {MAX_CUSTOM_ATTACHMENTS}.")
    if len(normalized_attachments) > MAX_TOTAL_ATTACHMENTS:
        raise ValueError(f"Too many attachments. Max {MAX_TOTAL_ATTACHMENTS}.")

    attachment_parts = []
    for item in normalized_attachments:
        attachment = _load_attachment_from_payload(
            attachment_content_base64=item.get("attachment_content_base64"),
            attachment_name=item.get("attachment_name"),
            attachment_mime_type=item.get("attachment_mime_type"),
        )
        if not attachment:
            attachment = _load_attachment_from_storage(
                user_id=user_id,
                attachment_path=item.get("attachment_path"),
                attachment_name=item.get("attachment_name"),
            )
        if attachment:
            attachment_parts.append(attachment)

    plain_text = message_body
    html_content = _build_html_body(message_body)

    body_message = MIMEMultipart("alternative")
    body_message.attach(MIMEText(plain_text, "plain", "utf-8"))
    body_message.attach(MIMEText(html_content, "html", "utf-8"))

    if attachment_parts:
        mime_message = MIMEMultipart()
        mime_message.attach(body_message)
        for payload, file_name, mime_type in attachment_parts:
            if "/" in mime_type:
                main_type, sub_type = mime_type.split("/", 1)
            else:
                main_type, sub_type = "application", "octet-stream"
            part = MIMEBase(main_type, sub_type)
            part.set_payload(payload)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", f'attachment; filename="{file_name}"')
            mime_message.attach(part)
    else:
        mime_message = body_message

    mime_message['To'] = contact_email
    mime_message['Subject'] = subject
    if last_message_id_header:
        mime_message['In-Reply-To'] = last_message_id_header
    if references:
        mime_message['References'] = references

    # Preserve paragraph line breaks in plaintext body; avoid auto-wrapping at ~78 chars.
    raw = base64.urlsafe_b64encode(
        mime_message.as_bytes(policy=policy.SMTP.clone(max_line_length=998))
    ).decode()

    # 3. Send via Gmail API
    # CRITICAL: threadId must be passed to keep the message in the existing thread
    sent = service.users().messages().send(
        userId='me',
        body={
            'raw': raw,
            'threadId': gmail_thread_id
        }
    ).execute()
    sent_id = sent.get("id")

    # 4. Success handling - update database
    now = datetime.now(timezone.utc).isoformat()
    
    # Store the sent message
    (
        supabase.table("messages")
        .insert({
            "thread_id": thread_id,
            "direction": "outbound",
            "subject": subject,
            "preview_snippet": _build_preview_snippet(message_body),
            "gmail_message_id": sent_id,
            "timestamp": now,
        })
        .execute()
    )

    # Update lead thread record
    # Get current follow_up_count for manual increment (or use rpc if available)
    thread_data = (
        supabase.table("lead_threads")
        .select("follow_up_count")
        .eq("id", thread_id)
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .single()
        .execute()
    )
    current_count = thread_data.data.get("follow_up_count", 0) if thread_data.data else 0

    (
        supabase.table("lead_threads")
        .update({
            "status": "active",
            "last_outbound_at": now,
            "follow_up_count": current_count + 1
        })
        .eq("id", thread_id)
        .execute()
    )

    (
        supabase.table("drafts")
        .update(
            {
                "status": "sent",
                "selected_draft": selected_draft,
                "draft_1": None,
                "draft_2": None,
                "draft_3": None,
            }
        )
        .eq("thread_id", thread_id)
        .eq("agent_id", agent_id)
        .eq("status", "pending")
        .execute()
    )

    return {"gmail_message_id": sent_id, "thread_id": thread_id}
