"""
Quick test for the AI fallback mechanism.

Run from the backend directory:
  python test_fallback.py

Tests:
  1. Normal Groq call (should succeed)
  2. Forced Groq failure → OpenAI fallback (should succeed if OPENAI_API_KEY is set)
"""

import os
import sys
import logging

# Load .env before anything else
from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(levelname)-7s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

from app.core.ai_client import (
    call_ai_with_fallback,
    get_ai_client,
    _get_fallback_client,
    _call_provider,
)
from app.core.config import get_settings

SIMPLE_MESSAGES = [
    {"role": "system", "content": "Reply with exactly: PONG"},
    {"role": "user", "content": "PING"},
]


def test_groq_direct():
    """Test 1: Normal Groq call."""
    print("\n" + "=" * 50)
    print("TEST 1: Direct Groq call")
    print("=" * 50)
    try:
        result = call_ai_with_fallback(
            messages=SIMPLE_MESSAGES,
            max_tokens=10,
            temperature=0.0,
            task_type="lead_classification",
        )
        print(f"✅ Groq responded: '{result}'")
        return True
    except Exception as e:
        print(f"❌ Groq failed: {e}")
        return False


def test_fallback_triggers():
    """Test 2: Force Groq to fail, verify OpenAI picks up."""
    print("\n" + "=" * 50)
    print("TEST 2: Forced fallback to OpenAI")
    print("=" * 50)

    settings = get_settings()
    if not settings.openai_api_key:
        print("⚠️  OPENAI_API_KEY is not set in .env — skipping fallback test.")
        print("   Add your key and re-run to verify the fallback works.")
        return None

    # Create a Groq client with a deliberately bad API key
    from openai import OpenAI
    bad_groq = OpenAI(
        base_url="https://api.groq.com/openai/v1",
        api_key="gsk_INVALID_KEY_FOR_TESTING",
    )

    print("→ Calling Groq with an invalid key (should fail)...")
    groq_result = _call_provider(
        client=bad_groq,
        model="llama-3.1-8b-instant",
        messages=SIMPLE_MESSAGES,
        max_tokens=10,
        temperature=0.0,
        provider_name="Groq",
        task_type="test",
        max_retries=1,  # Only 1 retry to keep it fast
    )

    if groq_result is not None:
        print(f"⚠️  Groq unexpectedly succeeded: '{groq_result}'")
        return False

    print("✅ Groq failed as expected.")

    print("→ Calling OpenAI fallback...")
    fallback_client = _get_fallback_client()
    fallback_result = _call_provider(
        client=fallback_client,
        model="gpt-4o-mini",
        messages=SIMPLE_MESSAGES,
        max_tokens=10,
        temperature=0.0,
        provider_name="OpenAI",
        task_type="test",
        max_retries=1,
    )

    if fallback_result is not None:
        print(f"✅ OpenAI fallback responded: '{fallback_result}'")
        return True
    else:
        print("❌ OpenAI fallback also failed!")
        return False


def test_config_check():
    """Test 0: Verify config is loaded."""
    print("\n" + "=" * 50)
    print("CONFIG CHECK")
    print("=" * 50)
    settings = get_settings()

    groq_set = bool(settings.groq_api_key)
    openai_set = bool(settings.openai_api_key)

    print(f"  GROQ_API_KEY:   {'✅ Set' if groq_set else '❌ Missing'}")
    print(f"  OPENAI_API_KEY: {'✅ Set' if openai_set else '⚠️  Not set (fallback disabled)'}")

    return groq_set


if __name__ == "__main__":
    print("🧪 AI Fallback Test Suite")
    print("─" * 50)

    if not test_config_check():
        print("\n❌ GROQ_API_KEY is missing. Cannot run tests.")
        sys.exit(1)

    results = {}
    results["groq_direct"] = test_groq_direct()
    results["fallback"] = test_fallback_triggers()

    print("\n" + "=" * 50)
    print("RESULTS")
    print("=" * 50)
    for name, passed in results.items():
        if passed is None:
            icon = "⚠️  SKIPPED"
        elif passed:
            icon = "✅ PASSED"
        else:
            icon = "❌ FAILED"
        print(f"  {name}: {icon}")

    print()
    if results["fallback"] is None:
        print("💡 Add OPENAI_API_KEY to .env to fully test the fallback.")
