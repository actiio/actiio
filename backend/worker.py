from __future__ import annotations

import logging

from apscheduler.schedulers.blocking import BlockingScheduler

from app.core.supabase import get_supabase

supabase = get_supabase()
from pipeline.classifier import ClassificationError, classify_thread
from pipeline.draft_generator import generate_drafts
from pipeline.notifier import save_drafts_and_notify
from pipeline.pre_qualifier import should_follow_up
from pipeline.silence_detector import get_threads_to_follow_up
from pipeline.thread_loader import load_thread_context

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("worker")


def run_pipeline_cycle() -> None:
    logger.info("Pipeline cycle started")
    threads = get_threads_to_follow_up(supabase)
    logger.info("Found %d threads eligible for follow-up", len(threads))

    processed = 0
    queued_for_approval = 0
    needs_review = 0
    failures = 0

    for thread in threads:
        thread_id = thread["id"]
        user_id = thread["user_id"]
        processed += 1

        try:
            context = load_thread_context(supabase, thread_id=thread_id, user_id=user_id)
            pre_qual_result = should_follow_up(context)
            reason = pre_qual_result.get("reason", "No reason provided")

            if not pre_qual_result.get("should_follow_up", True):
                logger.info(f"Thread {thread_id} skipped by pre-qualifier: {reason}")
                continue

            logger.info(f"Thread {thread_id} approved for follow-up: {reason}")
            classification = classify_thread(context)
        except ClassificationError as exc:
            needs_review += 1
            logger.warning("ClassificationError for thread %s: %s", thread_id, exc)
            (
                supabase.table("lead_threads")
                .update({"status": "needs_review"})
                .eq("id", thread_id)
                .execute()
            )
            continue
        except Exception as exc:
            failures += 1
            logger.exception("Failed before draft generation for thread %s: %s", thread_id, exc)
            continue

        try:
            drafts = generate_drafts(context, classification, desired_outcome="ask_decision")
            draft_id = save_drafts_and_notify(supabase, thread_id=thread_id, drafts=drafts)
            queued_for_approval += 1
            logger.info("Thread %s queued for approval (draft_id=%s)", thread_id, draft_id)
        except Exception as exc:
            failures += 1
            logger.exception("Failed during draft generation/notify for thread %s: %s", thread_id, exc)

    logger.info(
        "Pipeline cycle complete | processed=%d queued=%d needs_review=%d failures=%d",
        processed,
        queued_for_approval,
        needs_review,
        failures,
    )


def main() -> None:
    scheduler = BlockingScheduler()
    scheduler.add_job(run_pipeline_cycle, "interval", minutes=30, id="lead-followup-pipeline", max_instances=1)

    run_pipeline_cycle()
    scheduler.start()


if __name__ == "__main__":
    main()
