from __future__ import annotations

import base64
from datetime import datetime, timezone
from email.mime.text import MIMEText
from typing import Dict

from googleapiclient.discovery import build

from app.core.supabase import get_supabase

supabase = get_supabase()
from integrations.gmail.auth import get_credentials


def send_gmail(
    user_id: str,
    thread_id: str,
    gmail_thread_id: str,
    last_gmail_message_id: str,
    contact_email: str,
    subject: str,
    message_body: str,
) -> Dict:
    credentials = get_credentials(user_id)
    service = build("gmail", "v1", credentials=credentials, cache_discovery=False)

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

        # Only add Re: if not already present
        if original_subject and not subject.lower().startswith("re:"):
             subject = f"Re: {original_subject}"
        elif not subject.lower().startswith("re:"):
             subject = f"Re: {subject}"

        # Build References: existing References + the last Message-ID
        if last_message_id_header:
            if existing_references:
                references = f"{existing_references} {last_message_id_header}"
            else:
                references = last_message_id_header
        else:
            references = existing_references

    except Exception as e:
        print(f"DEBUG: Failed to fetch metadata for threading: {e}")
        last_message_id_header = None
        references = None
        if not subject.lower().startswith("re:"):
            subject = f"Re: {subject}"

    # 2. Build the reply email
    mime_message = MIMEText(message_body)
    mime_message['To'] = contact_email
    mime_message['Subject'] = subject
    if last_message_id_header:
        mime_message['In-Reply-To'] = last_message_id_header
    if references:
        mime_message['References'] = references

    raw = base64.urlsafe_b64encode(mime_message.as_bytes()).decode()

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
            "content": message_body,
            "gmail_message_id": sent_id,
            "timestamp": now,
        })
        .execute()
    )

    # Update lead thread record
    # Get current follow_up_count for manual increment (or use rpc if available)
    thread_data = supabase.table("lead_threads").select("follow_up_count").eq("id", thread_id).single().execute()
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

    return {"gmail_message_id": sent_id, "thread_id": thread_id}
