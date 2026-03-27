from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Optional

from fastapi import HTTPException, Request, status


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        now = time.time()
        cutoff = now - window_seconds
        with self._lock:
            bucket = self._events[key]
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()

            if len(bucket) >= limit:
                retry_after = max(1, int(bucket[0] + window_seconds - now))
                return False, retry_after

            bucket.append(now)
            return True, 0


rate_limiter = SlidingWindowRateLimiter()


def client_ip_from_request(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    return request.client.host if request.client else "unknown"


def enforce_rate_limit(
    *,
    key: str,
    limit: int,
    window_seconds: int,
    detail: str,
) -> None:
    allowed, retry_after = rate_limiter.check(key, limit=limit, window_seconds=window_seconds)
    if allowed:
        return

    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=detail,
        headers={"Retry-After": str(retry_after)},
    )


def enforce_auth_attempt_limit(
    *,
    request: Request,
    email: str,
    action: str,
    per_email_ip_limit: int,
    per_email_ip_window_seconds: int,
) -> None:
    ip = client_ip_from_request(request)
    key = f"auth:{action}:{email}:{ip}"
    enforce_rate_limit(
        key=key,
        limit=per_email_ip_limit,
        window_seconds=per_email_ip_window_seconds,
        detail="Too many authentication attempts. Please try again later.",
    )


def enforce_send_quota(
    *,
    user_id: str,
    channel: str,
    hourly_limit: int,
    daily_limit: int,
) -> None:
    enforce_rate_limit(
        key=f"send:{channel}:hour:{user_id}",
        limit=hourly_limit,
        window_seconds=60 * 60,
        detail="Hourly send quota reached. Please try again later.",
    )
    enforce_rate_limit(
        key=f"send:{channel}:day:{user_id}",
        limit=daily_limit,
        window_seconds=60 * 60 * 24,
        detail="Daily send quota reached. Please try again tomorrow.",
    )


def check_request_rate_limit(
    *,
    request: Request,
    key_scope: str,
    limit: int,
    window_seconds: int,
) -> Optional[int]:
    ip = client_ip_from_request(request)
    key = f"req:{key_scope}:{ip}"
    allowed, retry_after = rate_limiter.check(key, limit=limit, window_seconds=window_seconds)
    if allowed:
        return None
    return retry_after
