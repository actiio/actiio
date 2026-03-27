from __future__ import annotations

import json
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BASE_DIR))

from app.core.ai_client import DEFAULT_MODEL, get_ai_client
from pipeline.classifier import classify_thread
from pipeline.draft_generator import generate_drafts


def build_sample_context() -> dict:
    return {
        "thread": {
            "id": "sample-thread-1",
            "channel": "gmail",
            "contact_name": "Sarah",
            "contact_email": "sarah@example.com",
            "status": "active",
            "follow_up_count": 1,
        },
        "messages": [
            {
                "inbound": {
                    "direction": "inbound",
                    "content": "Hey, can you send the pricing for your lead follow-up tool?",
                    "timestamp": "2026-02-20T10:00:00Z",
                },
                "outbound": {
                    "direction": "outbound",
                    "content": "Absolutely. Plans start at $29/month, and I can include setup details if useful.",
                    "timestamp": "2026-02-20T10:15:00Z",
                },
            },
            {
                "inbound": {
                    "direction": "inbound",
                    "content": "Looks good. We are comparing with one other option this week.",
                    "timestamp": "2026-02-21T09:00:00Z",
                },
                "outbound": {
                    "direction": "outbound",
                    "content": "Makes sense. If helpful, I can share how teams usually decide in under 15 minutes.",
                    "timestamp": "2026-02-21T09:20:00Z",
                },
            },
            {
                "inbound": {
                    "direction": "inbound",
                    "content": "Can we revisit next week?",
                    "timestamp": "2026-02-22T11:00:00Z",
                },
                "outbound": {
                    "direction": "outbound",
                    "content": "Sure, happy to. Would Wednesday or Thursday be better for a quick decision call?",
                    "timestamp": "2026-02-22T11:12:00Z",
                },
            },
        ],
        "business_profile": {
            "business_name": "Actiio",
            "industry": "SaaS",
            "target_customer": "SMBs and solo salespeople",
            "core_offer": "AI follow-up drafts for silent leads",
            "price_range": "$29/month",
            "differentiator": "Context-aware drafts from real thread history",
        },
    }


def test_openrouter_connection() -> None:
    client = get_ai_client()
    response = client.chat.completions.create(
        model=DEFAULT_MODEL,
        messages=[
            {"role": "user", "content": "Say hello in one word"}
        ],
    )
    print("OpenRouter connection test:")
    print(response.choices[0].message.content)
    print("✓ OpenRouter API working")


def main() -> None:
    provider = (os.getenv("AI_PROVIDER") or "ollama").lower()
    if provider != "ollama" and not os.getenv("OPENROUTER_API_KEY"):
        raise RuntimeError("OPENROUTER_API_KEY is required when AI_PROVIDER is openrouter")
    if provider != "ollama":
        test_openrouter_connection()

    context = build_sample_context()
    classification = classify_thread(context)
    drafts = generate_drafts(context, classification, desired_outcome="ask_decision")

    print("=== CLASSIFICATION ===")
    print(json.dumps(classification, indent=2))
    print("\n=== DRAFTS ===")
    print(json.dumps(drafts, indent=2))


if __name__ == "__main__":
    main()
