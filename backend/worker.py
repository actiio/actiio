from __future__ import annotations

import logging

from apscheduler.schedulers.blocking import BlockingScheduler

from app.core.supabase import get_supabase

from googleapiclient.discovery import build
from integrations.gmail.auth import get_credentials
from integrations.gmail.sync import initial_sync

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
        .select("user_id, agent_id")
        .eq("agent_id", "gmail_followup")
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

def main() -> None:
    scheduler = BlockingScheduler()
    scheduler.add_job(sync_all_gmail_accounts, "interval", minutes=3, id="gmail-sync-task", max_instances=1)

    # Run once immediately
    sync_all_gmail_accounts()
    scheduler.start()


if __name__ == "__main__":
    main()
