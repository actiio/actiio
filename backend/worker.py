from __future__ import annotations

import logging

from apscheduler.schedulers.blocking import BlockingScheduler

from app.core.supabase import get_supabase

from googleapiclient.discovery import build
from integrations.gmail.auth import GmailConnectionExpiredError, get_credentials
from integrations.gmail.sync import initial_sync
from services.email_service import (
    send_weekly_digest_email,
    send_subscription_renewal_reminder,
    send_subscription_expired_email
)
from app.core.utils import parse_supabase_timestamp
from datetime import datetime, timedelta, timezone

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("worker")
ACTIVE_AGENTS = [
    {"id": "gmail_followup", "channel": "gmail"},
]


def run_pipeline_cycle() -> None:
    logger.info("Pipeline cycle skipped: follow-up drafting is manual-first")


def sync_all_gmail_accounts() -> None:
    supabase = get_supabase()
    logger.info("Automatic Gmail sync started")
    connections = (
        supabase.table("gmail_connections")
        .select("user_id, agent_id, status, is_active")
        .eq("agent_id", "gmail_followup")
        .eq("is_active", True)
        .execute()
    )
    
    if not connections.data:
        logger.info("No Gmail connections found for sync")
        return

    successes = 0
    failures = 0
    total_leads = 0
    total_replied_threads = 0
    total_updated_threads = 0

    for conn in connections.data:
        user_id = conn["user_id"]
        agent_id = conn["agent_id"]
        if conn.get("status") == "disconnected":
            logger.info("Skipping Gmail sync for disconnected connection user_id=%s agent_id=%s", user_id, agent_id)
            continue
        
        try:
            credentials = get_credentials(user_id, agent_id=agent_id)
            service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
            sync_result = initial_sync(user_id, service, agent_id=agent_id)
            leads_found = sync_result.get("leads_found", 0)
            replied_threads = sync_result.get("replied_threads", 0)
            updated_threads = sync_result.get("updated_threads", 0)
            total_leads += leads_found
            total_replied_threads += replied_threads
            total_updated_threads += updated_threads
            successes += 1
            logger.info(
                "Sync success for user %s (%s): leads=%d replies=%d updated=%d",
                user_id,
                agent_id,
                leads_found,
                replied_threads,
                updated_threads,
            )
        except GmailConnectionExpiredError as exc:
            failures += 1
            logger.warning("Sync skipped for user %s (%s): Gmail connection expired: %s", user_id, agent_id, exc)
        except Exception as exc:
            failures += 1
            logger.error("Sync failed for user %s (%s): %s", user_id, agent_id, exc)

    logger.info(
        "Automatic Gmail sync complete | connections=%d successes=%d failures=%d total_leads=%d total_replies=%d total_updated=%d",
        len(connections.data),
        successes,
        failures,
        total_leads,
        total_replied_threads,
        total_updated_threads,
    )


def send_all_weekly_digests() -> None:
    """Collect pipeline stats and send a weekly digest to all active users."""
    supabase = get_supabase()
    logger.info("Starting weekly digest distribution")

    # 1. Get all active users who have at least one active agent connection
    connections_resp = (
        supabase.table("gmail_connections")
        .select("user_id")
        .eq("is_active", True)
        .execute()
    )
    
    if not connections_resp.data:
        logger.info("No active users found for weekly digest")
        return

    # De-duplicate user_ids
    user_ids = list(set([c["user_id"] for c in connections_resp.data]))
    logger.info("Found %d active users for potential digests", len(user_ids))

    sent_count = 0
    for user_id in user_ids:
        try:
            # Get user email from profiles
            profile_resp = (
                supabase.table("profiles")
                .select("email")
                .eq("id", user_id)
                .maybe_single()
                .execute()
            )
            
            if not profile_resp or not profile_resp.data:
                continue
                
            email = profile_resp.data["email"]

            # Count threads waiting on the user (pending_approval)
            pending_resp = (
                supabase.table("lead_threads")
                .select("id", count="exact")
                .eq("user_id", user_id)
                .eq("status", "pending_approval")
                .execute()
            )
            pending_count = pending_resp.count or 0

            # Count threads waiting on the lead (active)
            active_resp = (
                supabase.table("lead_threads")
                .select("id", count="exact")
                .eq("user_id", user_id)
                .eq("status", "active")
                .execute()
            )
            active_count = active_resp.count or 0

            # Only send if there is actual activity to report
            if pending_count > 0 or active_count > 0:
                send_weekly_digest_email(email, pending_count, active_count)
                sent_count += 1
                logger.info("Sent weekly digest to %s (pending=%d, active=%d)", email, pending_count, active_count)
        
        except Exception as exc:
            logger.error("Failed to process weekly digest for user %s: %s", user_id, exc)

    logger.info("Weekly digest distribution complete | sent=%d", sent_count)


def check_subscription_billing() -> None:
    """Check for upcoming renewals (3 days out) and handle final expiries."""
    supabase = get_supabase()
    now = datetime.now(timezone.utc)
    logger.info("Starting daily billing and expiry check")

    # 1. Renewal Reminders (3 days before current_period_end)
    reminder_target = now + timedelta(days=3)
    # Define a window (e.g., within the next 24 hours of that target date)
    start_3d = (reminder_target - timedelta(hours=12)).isoformat()
    end_3d = (reminder_target + timedelta(hours=12)).isoformat()

    upcoming_resp = (
        supabase.table("user_subscriptions")
        .select("*, profiles!inner(email)")
        .eq("status", "active")
        .gte("current_period_end", start_3d)
        .lte("current_period_end", end_3d)
        .execute()
    )
    
    reminders_sent = 0
    for sub in upcoming_resp.data or []:
        email = sub.get("profiles", {}).get("email")
        if not email:
            continue
            
        send_subscription_renewal_reminder(
            user_email=email,
            agent_name=sub["agent_id"].replace("_", " ").title(),
            expiry_date=parse_supabase_timestamp(sub["current_period_end"]),
            autopay_enabled=sub.get("autopay_enabled", False)
        )
        reminders_sent += 1

    # 2. Final Expiries (Past their current_period_end but still status='active')
    expired_resp = (
        supabase.table("user_subscriptions")
        .select("*, profiles!inner(email)")
        .eq("status", "active")
        .lt("current_period_end", now.isoformat())
        .execute()
    )
    
    expiries_processed = 0
    for sub in expired_resp.data or []:
        email = sub.get("profiles", {}).get("email")
        if not email:
            continue
            
        # Update status to expired
        supabase.table("user_subscriptions").update({
            "status": "expired",
            "updated_at": now.isoformat()
        }).eq("id", sub["id"]).execute()
        
        send_subscription_expired_email(
            user_email=email,
            agent_name=sub["agent_id"].replace("_", " ").title()
        )
        expiries_processed += 1

    logger.info(
        "Daily billing check complete | reminders_sent=%d expiries_processed=%d",
        reminders_sent,
        expiries_processed
    )

def main() -> None:
    scheduler = BlockingScheduler()
    scheduler.add_job(sync_all_gmail_accounts, "interval", minutes=20, id="gmail-sync-task", max_instances=1)

    # Weekly Digest: Every Monday at 9:00 AM
    scheduler.add_job(
        send_all_weekly_digests, 
        "cron", 
        day_of_week="mon", 
        hour=9, 
        minute=0, 
        id="weekly-digest-task"
    )

    # Daily Billing: Every night at midnight
    scheduler.add_job(
        check_subscription_billing,
        "cron",
        hour=0,
        minute=0,
        id="daily-billing-task"
    )

    # Run once immediately
    sync_all_gmail_accounts()
    scheduler.start()


if __name__ == "__main__":
    main()
