from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from google.auth.exceptions import RefreshError, TransportError

from app.core.supabase import get_supabase
from app.core.utils import mask_email, parse_supabase_timestamp, sanitize_ai_context, sanitize_email_content
from integrations.gmail.parser import parse_thread
from pipeline.lead_classifier import classify_is_lead
from integrations.gmail.auth import GmailConnectionExpiredError
from services.email_service import send_gmail_disconnection_alert

supabase = get_supabase()
logger = logging.getLogger(__name__)


def _empty_sync_result() -> Dict[str, int]:
    return {
        "leads_found": 0,
        "updated_threads": 0,
        "replied_threads": 0,
        "classified_threads": 0,
        "skipped_audited_threads": 0,
        "processed_threads": 0,
    }


def _get_gmail_connection(user_id: str, agent_id: str) -> Optional[Dict[str, Any]]:
    response = (
        supabase.table("gmail_connections")
        .select("id,email,status,last_synced_at")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


def _get_user_email(user_id: str) -> Optional[str]:
    response = (
        supabase.table("users")
        .select("email")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not response.data:
        return None
    return response.data[0].get("email")


def _is_gmail_disconnection_error(exc: Exception) -> bool:
    if isinstance(exc, (TransportError, RefreshError)):
        return True
    error_text = str(exc).lower()
    return "401" in error_text or "invalid_grant" in error_text


def _handle_gmail_disconnection(
    connection_id: Optional[str],
    user_id: str,
    agent_id: str,
    gmail_email: Optional[str],
    current_status: Optional[str],
    exc: Exception,
) -> None:
    gmail_label = gmail_email or "unknown"
    already_disconnected = current_status == "disconnected"

    if connection_id:
        (
            supabase.table("gmail_connections")
            .update({"status": "disconnected"})
            .eq("id", connection_id)
            .execute()
        )

    logger.warning(
        "Gmail disconnection detected for user_id=%s agent_id=%s gmail_email=%s: %s",
        user_id,
        agent_id,
        mask_email(gmail_label),
        exc,
    )

    if already_disconnected:
        return

    user_email = _get_user_email(user_id)
    send_gmail_disconnection_alert(user_email=user_email, gmail_email=gmail_label)
    logger.info(
        "Gmail disconnection alert processed for user_id=%s agent_id=%s gmail_email=%s user_email=%s",
        user_id,
        agent_id,
        mask_email(gmail_label),
        mask_email(user_email or ""),
    )


def _build_preview_snippet(content: str | None, limit: int = 120) -> str:
    cleaned = sanitize_email_content(content or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    cleaned = " ".join(cleaned.split())
    if not cleaned:
        return ""
    return cleaned[:limit]


def _latest_message_info(messages: List[Dict[str, Any]]) -> tuple[Optional[str], Optional[str]]:
    latest_timestamp: Optional[str] = None
    latest_message_id: Optional[str] = None
    latest_dt: Optional[datetime] = None

    for message in messages:
        timestamp = message.get("timestamp")
        parsed = _parse_timestamp(timestamp)
        if parsed is None:
            continue
        if latest_dt is None or parsed >= latest_dt:
            latest_dt = parsed
            latest_timestamp = timestamp
            latest_message_id = message.get("gmail_message_id")

    if latest_timestamp or latest_message_id:
        return latest_timestamp, latest_message_id

    if messages:
        last_message = messages[-1]
        return last_message.get("timestamp"), last_message.get("gmail_message_id")

    return None, None


def _get_last_synced_at(connection_row: Optional[Dict[str, Any]]) -> Optional[datetime]:
    if not connection_row:
        return None
    return parse_supabase_timestamp(connection_row.get("last_synced_at"))


def _build_sync_query(last_synced_at: Optional[datetime]) -> str:
    if last_synced_at is None:
        return "newer_than:7d"

    lookback = last_synced_at - timedelta(minutes=5)
    return f"after:{int(lookback.timestamp())}"


def _get_thread_audit(user_id: str, agent_id: str, gmail_account_email: str, gmail_thread_id: str) -> Optional[Dict[str, Any]]:
    response = (
        supabase.table("thread_audits")
        .select("classification_status,last_message_at,last_gmail_message_id,last_checked_at")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .eq("gmail_account_email", gmail_account_email)
        .eq("gmail_thread_id", gmail_thread_id)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


def _upsert_thread_audit(
    user_id: str,
    agent_id: str,
    gmail_account_email: str,
    parsed_thread: Dict[str, Any],
    classification_status: str,
) -> None:
    last_message_at, last_gmail_message_id = _latest_message_info(parsed_thread.get("messages", []))
    supabase.table("thread_audits").upsert(
        {
            "user_id": user_id,
            "agent_id": agent_id,
            "gmail_account_email": gmail_account_email,
            "gmail_thread_id": parsed_thread["gmail_thread_id"],
            "classification_status": classification_status,
            "last_message_at": last_message_at,
            "last_gmail_message_id": last_gmail_message_id,
            "last_checked_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="user_id,agent_id,gmail_account_email,gmail_thread_id",
    ).execute()


def _audit_matches_latest_message(audit_row: Optional[Dict[str, Any]], messages: List[Dict[str, Any]]) -> bool:
    if not audit_row:
        return False

    last_message_at, last_gmail_message_id = _latest_message_info(messages)
    if audit_row.get("last_gmail_message_id") and last_gmail_message_id:
        return audit_row.get("last_gmail_message_id") == last_gmail_message_id

    if audit_row.get("last_message_at") and last_message_at:
        return audit_row.get("last_message_at") == last_message_at

    return False


def _cleanup_old_thread_audits(user_id: str, agent_id: str, gmail_account_email: str, retention_days: int = 90) -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).isoformat()
    (
        supabase.table("thread_audits")
        .delete()
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .eq("gmail_account_email", gmail_account_email)
        .eq("classification_status", "not_lead")
        .lt("last_checked_at", cutoff)
        .execute()
    )

def is_system_email(parsed_message: dict) -> bool:
    """
    Returns True only for provably automated 
    system emails that are never sales leads.
    Checks headers only — no keyword matching
    on email body or subject.
    """
    sender = (
        parsed_message.get('sender_email') or ''
    ).strip().lower()
    
    # Automated sender prefixes
    automated_prefixes = (
        'no-reply@',
        'noreply@',
        'donotreply@',
        'do-not-reply@',
        'mailer-daemon@',
        'postmaster@',
        'notifications@',
        'notification@',
        'automated@',
        'welcome@',
        'registration@',
        'newsletter@',
        'marketing@',
        'promotions@',
        'bounces@',
        'bounce@',
        'billing@',
        'invoice+',
        'receipt+',
        'statements+',
        'statement+',
        'follow-suggestions@',
    )
    
    # Domains that are exclusively used for automated platforms/socials
    automated_domains = (
        'facebookmail.com',
        'mail.instagram.com',
        'priority.instagram.com',
        'linkedin.com',
        'redditmail.com',
        'twitter.com',
        'stripe.com',
        'github.com',
        'instagram.com',
    
    )
    
    if any(sender.startswith(p) for p in automated_prefixes):
        return True
        
    domain = sender.split('@')[-1] if '@' in sender else ''
    if domain in automated_domains:
        return True
    
    return False


def _fetch_business_profile(user_id: str, agent_id: str) -> Optional[Dict[str, Any]]:
    try:
        resp = (
            supabase.table("business_profiles")
            .select("*")
            .eq("user_id", user_id)
            .eq("agent_id", agent_id)
            .limit(1)
            .execute()
        )
        return sanitize_ai_context(resp.data[0], context_id=f"{user_id}:{agent_id}") if resp.data else None
    except Exception:
        return None
def format_thread_for_classification(messages: list) -> str:
    """
    Format all messages in a thread for the lead classifier.
    Show full conversation context including attachments.
    """
    if not messages:
        return ""

    formatted = []
    for msg in messages:
        direction = msg.get("direction", "inbound")
        content = msg.get("content") or msg.get("body") or ""
        content = sanitize_email_content(content)
        sender = "Salesperson" if direction == "outbound" else "Contact"
        
        # Add attachment info to context
        attachment_info = ""
        attachments = msg.get("attachment_names") or []
        if attachments:
            attachment_info = f"\n[ATTACHMENTS: {', '.join(attachments)}]"
            
        formatted.append(f"{sender}: {content}{attachment_info}")

    return "\n\n".join(formatted)
def _select_last_message_pairs(messages: List[Dict[str, Any]], pair_count: int = 5) -> List[Dict[str, Any]]:
    if not messages:
        return []
    max_messages = pair_count * 2
    return messages[-max_messages:]


def _last_timestamp(messages: List[Dict[str, Any]], direction: str) -> Optional[str]:
    values = [m.get("timestamp") for m in messages if m.get("direction") == direction and m.get("timestamp")]
    if not values:
        return None
    return max(values)


def _parse_timestamp(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _count_unseen_messages(thread_id: str, messages: List[Dict[str, Any]]) -> tuple[int, int]:
    message_ids = [
        message.get("gmail_message_id")
        for message in messages
        if message.get("gmail_message_id")
    ]
    if not message_ids:
        return 0, 0

    existing = (
        supabase.table("messages")
        .select("gmail_message_id")
        .eq("thread_id", thread_id)
        .in_("gmail_message_id", message_ids)
        .execute()
    )
    existing_ids = {
        row.get("gmail_message_id")
        for row in (existing.data or [])
        if row.get("gmail_message_id")
    }

    unseen_total = 0
    unseen_inbound = 0
    for message in messages:
        message_id = message.get("gmail_message_id")
        if not message_id or message_id in existing_ids:
            continue
        unseen_total += 1
        if message.get("direction") == "inbound":
            unseen_inbound += 1

    return unseen_total, unseen_inbound


def _has_unseen_inbound_reply(thread_id: str, messages: List[Dict[str, Any]]) -> bool:
    inbound_message_ids = [
        message.get("gmail_message_id")
        for message in messages
        if message.get("direction") == "inbound" and message.get("gmail_message_id")
    ]
    if not inbound_message_ids:
        return False

    existing = (
        supabase.table("messages")
        .select("gmail_message_id")
        .eq("thread_id", thread_id)
        .in_("gmail_message_id", inbound_message_ids)
        .execute()
    )
    existing_ids = {
        row.get("gmail_message_id")
        for row in (existing.data or [])
        if row.get("gmail_message_id")
    }
    return any(message_id not in existing_ids for message_id in inbound_message_ids)


def _upsert_lead_thread(
    user_id: str,
    agent_id: str,
    gmail_account_email: str,
    parsed_thread: Dict[str, Any],
    classified_at: str,
) -> str:
    existing = (
        supabase.table("lead_threads")
        .select("id,status,last_inbound_at,last_outbound_at")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .eq("gmail_account_email", gmail_account_email)
        .eq("gmail_thread_id", parsed_thread["gmail_thread_id"])
        .limit(1)
        .execute()
    )

    messages = parsed_thread.get("messages", [])
    payload = {
        "user_id": user_id,
        "agent_id": agent_id,
        "gmail_account_email": gmail_account_email,
        "contact_name": parsed_thread.get("contact_name"),
        "contact_email": parsed_thread.get("contact_email"),
        "subject": parsed_thread.get("subject") or "",
        "channel": "gmail",
        "gmail_thread_id": parsed_thread["gmail_thread_id"],
        "last_inbound_at": _last_timestamp(messages, "inbound"),
        "last_outbound_at": _last_timestamp(messages, "outbound"),
        "last_classified_at": classified_at,
    }

    if existing.data:
        existing_row = existing.data[0]
        thread_id = existing_row["id"]
        previous_last_inbound = _parse_timestamp(existing_row.get("last_inbound_at"))
        next_last_inbound = _parse_timestamp(payload["last_inbound_at"])

        should_reactivate_ignored = (
            existing_row.get("status") == "ignored"
            and _has_unseen_inbound_reply(thread_id, messages)
            and next_last_inbound is not None
            and (previous_last_inbound is None or next_last_inbound >= previous_last_inbound)
        )
        if should_reactivate_ignored:
            payload["status"] = "active"

        # Preserve workflow state for tracked threads (pending_approval / needs_review).
        supabase.table("lead_threads").update(payload).eq("id", thread_id).execute()
        return thread_id

    payload["status"] = "active"
    created = supabase.table("lead_threads").insert(payload).execute()
    return created.data[0]["id"]


def _is_tracked_thread(user_id: str, agent_id: str, gmail_account_email: str, gmail_thread_id: str) -> bool:
    existing = (
        supabase.table("lead_threads")
        .select("id")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .eq("gmail_account_email", gmail_account_email)
        .eq("gmail_thread_id", gmail_thread_id)
        .limit(1)
        .execute()
    )
    return bool(existing.data)


def _store_messages(thread_id: str, messages: List[Dict[str, Any]]) -> None:
    for message in messages:
        gmail_message_id = message.get("gmail_message_id")
        if not gmail_message_id:
            continue

        # Store only message metadata; fetch sensitive bodies live from Gmail when needed.
        supabase.table("messages").upsert(
            {
                "thread_id": thread_id,
                "direction": message.get("direction", "inbound"),
                "subject": message.get("subject", "") or "",
                "preview_snippet": _build_preview_snippet(message.get("body")),
                "header_message_id": message.get("header_message_id"),
                "reply_to": message.get("reply_to"),
                "cc": message.get("cc"),
                "sender_email": message.get("sender_email"),
                "has_attachments": bool(message.get("has_attachments")),
                "attachment_names": message.get("attachment_names") or [],
                "timestamp": message.get("timestamp"),
                "gmail_message_id": gmail_message_id,
            },
            on_conflict="gmail_message_id"
        ).execute()


def _store_lead_thread(user_id: str, agent_id: str, gmail_account_email: str, parsed_thread: Dict[str, Any]) -> str:
    classified_at = datetime.now(timezone.utc).isoformat()
    thread_id = _upsert_lead_thread(
        user_id=user_id,
        agent_id=agent_id,
        gmail_account_email=gmail_account_email,
        parsed_thread=parsed_thread,
        classified_at=classified_at,
    )
    recent_window = _select_last_message_pairs(parsed_thread.get("messages", []), pair_count=5)
    _store_messages(thread_id, recent_window)
    return thread_id


def _refresh_tracked_thread(
    user_id: str,
    agent_id: str,
    gmail_account_email: str,
    parsed_thread: Dict[str, Any],
) -> tuple[int, int]:
    existing_thread = (
        supabase.table("lead_threads")
        .select("id")
        .eq("user_id", user_id)
        .eq("agent_id", agent_id)
        .eq("gmail_account_email", gmail_account_email)
        .eq("gmail_thread_id", parsed_thread["gmail_thread_id"])
        .limit(1)
        .execute()
    )

    updated_threads = 0
    replied_threads = 0
    if existing_thread.data:
        thread_id = existing_thread.data[0]["id"]
        unseen_total, unseen_inbound = _count_unseen_messages(thread_id, parsed_thread.get("messages", []))
        if unseen_total > 0:
            updated_threads += 1
        if unseen_inbound > 0:
            replied_threads += 1

    _store_lead_thread(
        user_id=user_id,
        agent_id=agent_id,
        gmail_account_email=gmail_account_email,
        parsed_thread=parsed_thread,
    )
    _upsert_thread_audit(
        user_id=user_id,
        agent_id=agent_id,
        gmail_account_email=gmail_account_email,
        parsed_thread=parsed_thread,
        classification_status="lead",
    )
    return updated_threads, replied_threads


def initial_sync(user_id: str, gmail_service: Any, agent_id: str = "gmail_followup") -> Dict[str, int]:
    sync_started_at = datetime.now(timezone.utc)
    connection = _get_gmail_connection(user_id=user_id, agent_id=agent_id) or {}
    connection_id = connection.get("id")
    connection_status = connection.get("status")
    owner_email = connection.get("email")

    try:
        profile = gmail_service.users().getProfile(userId="me").execute()
        owner_email = profile.get("emailAddress") or owner_email
    except Exception as exc:
        if _is_gmail_disconnection_error(exc):
            _handle_gmail_disconnection(
                connection_id=connection_id,
                user_id=user_id,
                agent_id=agent_id,
                gmail_email=owner_email,
                current_status=connection_status,
                exc=exc,
            )
            raise GmailConnectionExpiredError("Gmail connection was disconnected. Please reconnect your Gmail account.") from exc
        raise

    last_synced_at = _get_last_synced_at(connection)
    if connection_id:
        (
            supabase.table("gmail_connections")
            .update({"email": owner_email, "status": "connected"})
            .eq("id", connection_id)
            .execute()
        )
    connection_status = "connected"

    query = _build_sync_query(last_synced_at)
    logger.info("Running Gmail sync for user %s with query: %s", user_id, query)
    gmail_account_email = (owner_email or "").strip().lower()

    business_profile = _fetch_business_profile(user_id, agent_id)
    leads_found = 0
    updated_threads = 0
    replied_threads = 0
    classified_threads = 0
    skipped_audited_threads = 0
    processed_threads = 0
    next_page_token: Optional[str] = None

    while True:
        list_kwargs: Dict[str, Any] = {
            "userId": "me",
            "maxResults": 50,
            "q": query,
        }
        if next_page_token:
            list_kwargs["pageToken"] = next_page_token

        try:
            list_response = gmail_service.users().threads().list(**list_kwargs).execute()
        except Exception as exc:
            if _is_gmail_disconnection_error(exc):
                _handle_gmail_disconnection(
                    connection_id=connection_id,
                    user_id=user_id,
                    agent_id=agent_id,
                    gmail_email=owner_email,
                    current_status=connection_status,
                    exc=exc,
                )
                raise GmailConnectionExpiredError("Gmail connection was disconnected. Please reconnect your Gmail account.") from exc
            raise
        thread_refs = list_response.get("threads", [])
        if not thread_refs:
            break

        for thread_ref in thread_refs:
            gmail_thread_id = thread_ref.get("id")
            if not gmail_thread_id:
                continue

            processed_threads += 1
            try:
                raw_thread = gmail_service.users().threads().get(userId="me", id=gmail_thread_id, format="full").execute()
            except Exception as exc:
                if _is_gmail_disconnection_error(exc):
                    _handle_gmail_disconnection(
                        connection_id=connection_id,
                        user_id=user_id,
                        agent_id=agent_id,
                        gmail_email=owner_email,
                        current_status=connection_status,
                        exc=exc,
                    )
                    raise GmailConnectionExpiredError("Gmail connection was disconnected. Please reconnect your Gmail account.") from exc
                raise
            parsed_thread = parse_thread(raw_thread, owner_email=owner_email)
            gmail_thread_id = parsed_thread["gmail_thread_id"]

            if _is_tracked_thread(
                user_id=user_id,
                agent_id=agent_id,
                gmail_account_email=gmail_account_email,
                gmail_thread_id=gmail_thread_id,
            ):
                updated, replied = _refresh_tracked_thread(
                    user_id=user_id,
                    agent_id=agent_id,
                    gmail_account_email=gmail_account_email,
                    parsed_thread=parsed_thread,
                )
                updated_threads += updated
                replied_threads += replied
                continue

            messages = parsed_thread.get("messages", [])
            first_message = messages[0] if messages else {}
            audit_row = _get_thread_audit(
                user_id=user_id,
                agent_id=agent_id,
                gmail_account_email=gmail_account_email,
                gmail_thread_id=gmail_thread_id,
            )

            if audit_row and audit_row.get("classification_status") == "lead":
                _store_lead_thread(
                    user_id=user_id,
                    agent_id=agent_id,
                    gmail_account_email=gmail_account_email,
                    parsed_thread=parsed_thread,
                )
                _upsert_thread_audit(
                    user_id=user_id,
                    agent_id=agent_id,
                    gmail_account_email=gmail_account_email,
                    parsed_thread=parsed_thread,
                    classification_status="lead",
                )
                continue

            if is_system_email(first_message):
                _upsert_thread_audit(
                    user_id=user_id,
                    agent_id=agent_id,
                    gmail_account_email=gmail_account_email,
                    parsed_thread=parsed_thread,
                    classification_status="not_lead",
                )
                continue

            if audit_row and audit_row.get("classification_status") == "not_lead" and _audit_matches_latest_message(audit_row, messages):
                skipped_audited_threads += 1
                continue

            time.sleep(4.0)
            try:
                is_lead = classify_is_lead(format_thread_for_classification(messages), business_profile=business_profile)
            except Exception as exc:
                logger.error("AI call failed for thread %s: %s", gmail_thread_id, exc)
                raise

            classified_threads += 1
            logger.info("Thread %s classification result: %s", gmail_thread_id, is_lead)

            if is_lead:
                _store_lead_thread(
                    user_id=user_id,
                    agent_id=agent_id,
                    gmail_account_email=gmail_account_email,
                    parsed_thread=parsed_thread,
                )
                _upsert_thread_audit(
                    user_id=user_id,
                    agent_id=agent_id,
                    gmail_account_email=gmail_account_email,
                    parsed_thread=parsed_thread,
                    classification_status="lead",
                )
                leads_found += 1
                continue

            _upsert_thread_audit(
                user_id=user_id,
                agent_id=agent_id,
                gmail_account_email=gmail_account_email,
                parsed_thread=parsed_thread,
                classification_status="not_lead",
            )

        next_page_token = list_response.get("nextPageToken")
        if not next_page_token:
            break

    if connection_id:
        (
            supabase.table("gmail_connections")
            .update({"last_synced_at": sync_started_at.isoformat()})
            .eq("id", connection_id)
            .execute()
        )
    _cleanup_old_thread_audits(user_id=user_id, agent_id=agent_id, gmail_account_email=gmail_account_email)

    return {
        "leads_found": leads_found,
        "updated_threads": updated_threads,
        "replied_threads": replied_threads,
        "classified_threads": classified_threads,
        "skipped_audited_threads": skipped_audited_threads,
        "processed_threads": processed_threads,
    }


def sync_recent_threads(user_id: str, gmail_service: Any, agent_id: str = "gmail_followup") -> Dict[str, int]:
    # Backward-compatible alias for existing route callers.
    return initial_sync(user_id=user_id, gmail_service=gmail_service, agent_id=agent_id)
