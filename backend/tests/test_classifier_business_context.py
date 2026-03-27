from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BASE_DIR))

from pipeline.classifier import classify_thread


def _base_context() -> dict:
    return {
        "thread": {
            "id": "thread-1",
            "channel": "gmail",
            "contact_name": "Lead Name",
            "status": "active",
            "follow_up_count": 0,
        },
        "messages": [
            {
                "inbound": {
                    "direction": "inbound",
                    "content": "Hi, I'd like details about your commercial real estate services.",
                    "timestamp": "2026-03-10T10:00:00Z",
                },
                "outbound": {
                    "direction": "outbound",
                    "content": "Absolutely. We help investors source and close commercial property deals.",
                    "timestamp": "2026-03-10T10:15:00Z",
                },
            }
        ],
        "business_profile": {
            "business_name": "Skyline Realty",
            "industry": "Real estate",
            "target_customer": "Property investors and buyers",
            "core_offer": "Commercial real estate advisory and property sourcing",
            "price_range": None,
            "differentiator": "Hands-on deal support",
        },
    }


def test_classifier_allows_aligned_business_context() -> None:
    import pipeline.classifier as classifier

    original_call = classifier._call_ollama
    original_settings = classifier.get_settings
    classifier.get_settings = lambda: SimpleNamespace(ai_provider="ollama")
    classifier._call_ollama = lambda system_prompt, user_prompt, temperature: """
    {
      "stage": "quote_sent",
      "intent": "positive",
      "follow_up_number": 1,
      "objection_type": "none",
      "channel": "gmail",
      "business_context_fit": "aligned",
      "confidence": "high"
    }
    """
    try:
        result = classify_thread(_base_context())
        assert result["business_context_fit"] == "aligned"
    finally:
        classifier.get_settings = original_settings
        classifier._call_ollama = original_call


def test_classifier_marks_out_of_scope_business_context() -> None:
    import pipeline.classifier as classifier

    original_call = classifier._call_ollama
    original_settings = classifier.get_settings
    classifier.get_settings = lambda: SimpleNamespace(ai_provider="ollama")
    classifier._call_ollama = lambda system_prompt, user_prompt, temperature: """
    {
      "stage": "new_inquiry",
      "intent": "positive",
      "follow_up_number": 0,
      "objection_type": "none",
      "channel": "gmail",
      "business_context_fit": "out_of_scope",
      "confidence": "high"
    }
    """
    try:
        result = classify_thread(_base_context())
        assert result["business_context_fit"] == "out_of_scope"
    finally:
        classifier.get_settings = original_settings
        classifier._call_ollama = original_call


if __name__ == "__main__":
    test_classifier_allows_aligned_business_context()
    test_classifier_marks_out_of_scope_business_context()
