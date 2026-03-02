from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BASE_DIR))

from pipeline.pre_qualifier import should_follow_up


def _base_context(messages: list[dict]) -> dict:
    return {
        "thread": {
            "id": "thread-1",
            "channel": "gmail",
            "contact_name": "Lead Name",
            "status": "active",
        },
        "messages": messages,
        "business_profile": {
            "business_name": "Actiio",
            "industry": "SaaS",
            "target_customer": "SMB founders",
            "core_offer": "AI follow-up drafts",
            "preferred_tone": "balanced",
        },
    }


def _next_month_context() -> dict:
    return _base_context(
        [
            {
                "inbound": {"direction": "inbound", "content": "Can you share pricing?"},
                "outbound": {"direction": "outbound", "content": "Sure, plans start at $29/mo."},
            },
            {
                "inbound": {"direction": "inbound", "content": "Looks good, let's reconnect next month."},
                "outbound": {"direction": "outbound", "content": "Sounds good, I will check back then."},
            },
        ]
    )


def _quote_ghost_context() -> dict:
    return _base_context(
        [
            {
                "inbound": {"direction": "inbound", "content": "Please send a quote for 10 seats."},
                "outbound": {"direction": "outbound", "content": "Shared quote and setup details."},
            },
            {
                "inbound": None,
                "outbound": {"direction": "outbound", "content": "Did you get a chance to review the quote?"},
            },
        ]
    )


def _fake_call_claude(system_prompt: str, user_prompt: str) -> str:
    if "reconnect next month" in user_prompt.lower():
        return '{"should_follow_up": false, "reason": "Lead asked to reconnect next month."}'
    return '{"should_follow_up": true, "reason": "Quote sent and lead went quiet."}'


def test_pre_qualifier_should_follow_up() -> None:
    import pipeline.pre_qualifier as pre_qualifier

    original_call = pre_qualifier._call_claude
    pre_qualifier._call_claude = _fake_call_claude
    try:
        next_month_result = should_follow_up(_next_month_context())
        quote_ghost_result = should_follow_up(_quote_ghost_context())

        print("next_month_result:", next_month_result)
        print("quote_ghost_result:", quote_ghost_result)

        assert next_month_result["should_follow_up"] is False
        assert quote_ghost_result["should_follow_up"] is True
    finally:
        pre_qualifier._call_claude = original_call


if __name__ == "__main__":
    test_pre_qualifier_should_follow_up()
