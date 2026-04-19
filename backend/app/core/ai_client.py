from openai import OpenAI
from app.core.config import get_settings
import logging
import time

logger = logging.getLogger(__name__)

# ─── Primary: Groq (free tier) ───────────────────────────────
# Each task uses a different model so they have separate
# rate limit buckets. Simple tasks use smaller/faster models,
# complex tasks use the best model.

# Simple YES/NO classification
# Fast, lightweight, high rate limit
LEAD_CLASSIFICATION_MODEL = "llama-3.1-8b-instant"

# Simple judgment call
# Different bucket from lead classifier
PRE_QUALIFICATION_MODEL = "gemma2-9b-it"

# Complex JSON output with nuanced analysis
# Needs best model for accuracy
THREAD_CLASSIFICATION_MODEL = "llama-3.3-70b-versatile"

# Best writing quality for drafts
# Same model as thread classification
# but separate calls so limits shared
DRAFT_GENERATION_MODEL = "llama-3.3-70b-versatile"

# Backward compatibility
DEFAULT_MODEL = THREAD_CLASSIFICATION_MODEL

# ─── Fallback: OpenAI (paid, ultra-reliable) ─────────────────
# GPT-4o-mini: ~$0.15/1M input, ~$0.60/1M output
# Activates ONLY when Groq is completely down or rate limited.
# Maps each task type to the cheapest model that can handle it.

FALLBACK_MODEL_MAP = {
    "lead_classification": "gpt-4o-mini",   # simple YES/NO
    "pre_qualification":   "gpt-4o-mini",   # simple judgment
    "classification":      "gpt-4o-mini",   # JSON output
    "generation":          "gpt-4o-mini",   # draft writing
}

FALLBACK_DEFAULT_MODEL = "gpt-4o-mini"


def get_ai_client() -> OpenAI:
    """Primary Groq client (OpenAI-compatible endpoint)."""
    settings = get_settings()
    return OpenAI(
        base_url="https://api.groq.com/openai/v1",
        api_key=settings.groq_api_key,
    )


def _get_fallback_client() -> OpenAI | None:
    """Fallback OpenAI client. Returns None if no API key configured."""
    settings = get_settings()
    if not settings.openai_api_key:
        return None
    return OpenAI(api_key=settings.openai_api_key)


def _call_provider(
    client: OpenAI,
    model: str,
    messages: list,
    max_tokens: int,
    temperature: float,
    provider_name: str,
    task_type: str,
    max_retries: int = 3,
) -> str | None:
    """
    Attempt a chat completion against a single provider.
    Returns the response text on success, None if all retries fail.
    """
    last_error = None

    for attempt in range(max_retries):
        try:
            logger.info(
                f"Calling {provider_name} [{task_type}]: "
                f"{model} (attempt {attempt + 1}/{max_retries})"
            )

            response = client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )

            content = response.choices[0].message.content

            if content:
                logger.info(
                    f"{provider_name} [{task_type}] success: {model}"
                )
                return content.strip()

            logger.warning(
                f"{provider_name} [{task_type}] empty content"
            )

        except Exception as e:
            last_error = e
            error_str = str(e)

            if '429' in error_str:
                wait_time = 5 * (attempt + 1)
                logger.warning(
                    f"{provider_name} rate limited [{task_type}]. "
                    f"Waiting {wait_time}s."
                )
                time.sleep(wait_time)
            else:
                logger.warning(
                    f"{provider_name} [{task_type}] failed "
                    f"(attempt {attempt + 1}): {e}"
                )
                time.sleep(1.0)

            continue

    if last_error:
        logger.warning(
            f"{provider_name} [{task_type}] exhausted "
            f"{max_retries} retries. Last error: {last_error}"
        )
    return None


def call_ai_with_fallback(
    messages: list,
    max_tokens: int = 2000,
    temperature: float = 0.0,
    task_type: str = "classification"
) -> str:
    """
    Call AI with automatic provider fallback.

    Flow:
      1. Try Groq (free) with up to 3 retries
      2. If Groq fails entirely, fall back to OpenAI (paid)
         with up to 2 retries
      3. Raise only if both providers fail

    task_type options:
    - "lead_classification" → llama-3.1-8b-instant
      (fast, simple YES/NO, high daily limit)

    - "pre_qualification" → gemma2-9b-it
      (simple judgment, separate rate bucket)

    - "classification" → llama-3.3-70b-versatile
      (complex JSON, thread analysis)

    - "generation" → llama-3.3-70b-versatile
      (draft writing, best quality)
    """
    # ── 1. Primary: Groq ──────────────────────────────────────
    groq_model_map = {
        "lead_classification": LEAD_CLASSIFICATION_MODEL,
        "pre_qualification": PRE_QUALIFICATION_MODEL,
        "classification": THREAD_CLASSIFICATION_MODEL,
        "generation": DRAFT_GENERATION_MODEL,
    }

    groq_model = groq_model_map.get(
        task_type,
        THREAD_CLASSIFICATION_MODEL
    )

    groq_client = get_ai_client()
    result = _call_provider(
        client=groq_client,
        model=groq_model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        provider_name="Groq",
        task_type=task_type,
        max_retries=3,
    )

    if result is not None:
        return result

    # ── 2. Fallback: OpenAI ───────────────────────────────────
    fallback_client = _get_fallback_client()

    if fallback_client is None:
        raise Exception(
            f"Groq [{task_type}] failed after 3 attempts "
            f"and no OPENAI_API_KEY is configured for fallback."
        )

    fallback_model = FALLBACK_MODEL_MAP.get(
        task_type,
        FALLBACK_DEFAULT_MODEL
    )

    logger.warning(
        f"Groq [{task_type}] failed. "
        f"Falling back to OpenAI ({fallback_model})."
    )

    result = _call_provider(
        client=fallback_client,
        model=fallback_model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        provider_name="OpenAI",
        task_type=task_type,
        max_retries=2,
    )

    if result is not None:
        return result

    raise Exception(
        f"All providers failed for [{task_type}]. "
        f"Groq and OpenAI both exhausted retries."
    )

def clean_json_response(text: str) -> str:
    """Strip markdown code blocks from JSON."""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()
