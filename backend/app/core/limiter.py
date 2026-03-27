from __future__ import annotations

import base64
import hashlib
import json
from typing import Any

from slowapi import Limiter
from slowapi.util import get_remote_address


def _decode_jwt_payload(token: str) -> dict[str, Any] | None:
    parts = token.split(".")
    if len(parts) != 3:
        return None

    payload = parts[1]
    padding = "=" * (-len(payload) % 4)
    try:
        decoded = base64.urlsafe_b64decode(payload + padding).decode("utf-8")
        data = json.loads(decoded)
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return None

    return data if isinstance(data, dict) else None


def _authorization_token(request) -> str | None:
    authorization = request.headers.get("authorization", "")
    if not authorization.lower().startswith("bearer "):
        return None
    token = authorization[7:].strip()
    return token or None


def user_or_ip_key_func(request) -> str:
    token = _authorization_token(request)
    if token:
        payload = _decode_jwt_payload(token)
        subject = payload.get("sub") if payload else None
        if isinstance(subject, str) and subject.strip():
            return f"user:{subject}"
        return f"token:{hashlib.sha256(token.encode('utf-8')).hexdigest()}"

    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=get_remote_address)
