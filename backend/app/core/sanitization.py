from __future__ import annotations

import re
import unicodedata
from typing import Any, Optional


_SCRIPT_TAG_RE = re.compile(r"(?is)<\s*script.*?>.*?<\s*/\s*script\s*>")
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")
_CONTROL_CHARS_KEEP_NEWLINES_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")
_WHITESPACE_RE = re.compile(r"\s+")


def sanitize_text(value: str, *, preserve_newlines: bool = False) -> str:
    text = unicodedata.normalize("NFKC", value)
    text = _SCRIPT_TAG_RE.sub("", text)
    if preserve_newlines:
        text = _CONTROL_CHARS_KEEP_NEWLINES_RE.sub("", text)
        text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    else:
        text = _CONTROL_CHARS_RE.sub("", text)
        text = _WHITESPACE_RE.sub(" ", text).strip()
    return text


def sanitize_email(value: str) -> str:
    return sanitize_text(value, preserve_newlines=False).lower()


def sanitize_payload(
    value: Any,
    *,
    preserve_newlines_keys: Optional[set[str]] = None,
    current_key: Optional[str] = None,
) -> Any:
    preserve_newlines_keys = preserve_newlines_keys or set()

    if isinstance(value, str):
        return sanitize_text(value, preserve_newlines=current_key in preserve_newlines_keys)
    if isinstance(value, list):
        return [sanitize_payload(item, preserve_newlines_keys=preserve_newlines_keys, current_key=current_key) for item in value]
    if isinstance(value, dict):
        return {
            key: sanitize_payload(item, preserve_newlines_keys=preserve_newlines_keys, current_key=key)
            for key, item in value.items()
        }
    return value
