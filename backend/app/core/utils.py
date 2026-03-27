from __future__ import annotations

from datetime import datetime
import base64
import hashlib
import hmac
import json
import logging
import re
import time
from typing import Any
from urllib.parse import urlparse

from fastapi import HTTPException, status


def parse_supabase_timestamp(ts: str | None) -> datetime | None:
    """
    Parse Supabase timestamps robustly.
    Handles variable microsecond precision that Python 3.9 fromisoformat() rejects.
    """
    if not ts:
        return None

    ts = re.sub(
        r"\.(\d+)([+-]\d{2}:\d{2}|Z)$",
        lambda m: "." + m.group(1).ljust(6, "0") + m.group(2),
        ts,
    )
    ts = ts.replace("Z", "+00:00")
    return datetime.fromisoformat(ts)


_AGENT_ID_RE = re.compile(r"^[a-z0-9_]{1,120}$")


def is_valid_agent_id(agent_id: str) -> bool:
    return bool(_AGENT_ID_RE.fullmatch(agent_id))


def safe_relative_redirect_path(value: str | None, *, default: str = "/agents") -> str:
    if not value:
        return default

    candidate = value.strip()
    if not candidate.startswith("/") or candidate.startswith("//"):
        return default

    parsed = urlparse(candidate)
    if parsed.scheme or parsed.netloc:
        return default

    return candidate


def raise_internal_error(
    logger: logging.Logger,
    *,
    message: str,
    exc: Exception,
    status_code: int = status.HTTP_400_BAD_REQUEST,
    detail: str = "Request could not be processed.",
) -> None:
    logger.exception("%s: %s", message, exc)
    raise HTTPException(status_code=status_code, detail=detail) from exc


def sign_state_token(payload: dict[str, Any], secret: str, *, max_age_seconds: int = 600) -> str:
    body = dict(payload)
    body["exp"] = int(time.time()) + max_age_seconds
    encoded = base64.urlsafe_b64encode(
        json.dumps(body, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    ).decode("ascii").rstrip("=")
    signature = hmac.new(secret.encode("utf-8"), encoded.encode("utf-8"), hashlib.sha256).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return f"{encoded}.{encoded_signature}"


def verify_state_token(token: str | None, secret: str) -> dict[str, Any] | None:
    if not token or "." not in token:
        return None

    encoded_payload, encoded_signature = token.rsplit(".", 1)
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        encoded_payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    actual_signature = _urlsafe_b64decode(encoded_signature)
    if actual_signature is None or not hmac.compare_digest(actual_signature, expected_signature):
        return None

    payload_bytes = _urlsafe_b64decode(encoded_payload)
    if payload_bytes is None:
        return None

    try:
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None

    if not isinstance(payload, dict):
        return None

    expires_at = payload.get("exp")
    if not isinstance(expires_at, int) or expires_at < int(time.time()):
        return None

    return payload


def _urlsafe_b64decode(value: str) -> bytes | None:
    padding = "=" * (-len(value) % 4)
    try:
        return base64.urlsafe_b64decode(value + padding)
    except ValueError:
        return None


_logger = logging.getLogger(__name__)

def sanitize_email_content(text: str, *, thread_id: str = "") -> str:
    """
    Sanitize email content before passing to AI to prevent prompt injection.

    Removes or neutralizes common injection patterns without destroying
    legitimate email content.
    """
    if not text:
        return text

    original_length = len(text)

    # Truncate extremely long emails — legitimate sales emails
    # are rarely longer than 2000 chars.
    if len(text) > 3000:
        text = text[:3000] + "\n[Message truncated]"

    # Neutralize obvious system prompt injection patterns.
    injection_patterns = [
        r'ignore\s+(all\s+)?previous\s+instructions',
        r'disregard\s+(all\s+)?previous',
        r'forget\s+(all\s+)?previous\s+instructions',
        r'new\s+instructions\s*:',
        r'system\s*:\s*override',
        r'\[system\s*:',
        r'\[instruction\s*:',
        r'you\s+are\s+now\s+a\s+different',
        r'pretend\s+you\s+are',
        r'act\s+as\s+if\s+you\s+are',
        r'override\s+business\s+profile',
        r'ignore\s+business\s+constraints',
    ]

    sanitized = False
    for pattern in injection_patterns:
        text, count = re.subn(
            pattern,
            '[content removed]',
            text,
            flags=re.IGNORECASE,
        )
        if count > 0:
            sanitized = True

    if sanitized:
        _logger.warning(
            "Potential prompt injection detected and sanitized in thread %s",
            thread_id or "(unknown)",
        )

    return text


def sanitize_ai_context(value: Any, *, context_id: str = "") -> Any:
    """
    Recursively sanitize text that will be passed to an AI model.

    This is separate from storage sanitization: the goal here is to reduce
    prompt-injection risk across both email content and user-authored business
    profile fields without mutating non-string values.
    """
    if isinstance(value, str):
        return sanitize_email_content(value, thread_id=context_id)
    if isinstance(value, list):
        return [sanitize_ai_context(item, context_id=context_id) for item in value]
    if isinstance(value, dict):
        return {
            key: sanitize_ai_context(item, context_id=context_id)
            for key, item in value.items()
        }
    return value
