import logging
import os
import ssl
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.rate_limit import check_request_rate_limit
from app.api.router import router as api_router
from app.core.config import get_settings
from app.core.limiter import limiter


settings = get_settings()
logger = logging.getLogger(__name__)

# Bypass SSL certificate validation for development only when explicitly opted in
if settings.app_env == "development" and settings.bypass_ssl:
    try:
        ssl._create_default_https_context = ssl._create_unverified_context
        logger.warning("SSL certificate validation is disabled for outgoing requests — development mode with BYPASS_SSL=true.")
    except Exception as exc:
        logger.exception("Failed to disable SSL verification: %s", exc)

app = FastAPI(title=settings.app_name)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
allowed_origin = (settings.frontend_url or "http://localhost:3000").strip().rstrip("/")
allowed_origins = {allowed_origin, "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"}

# Local dev hardening: allow localhost/127.0.0.1 equivalents on same port.
parsed = urlparse(allowed_origin)
if parsed.scheme in {"http", "https"} and parsed.hostname in {"localhost", "127.0.0.1"} and parsed.port:
    allowed_origins.add(f"{parsed.scheme}://localhost:{parsed.port}")
    allowed_origins.add(f"{parsed.scheme}://127.0.0.1:{parsed.port}")
    # Local dev convenience when Next auto-switches between 3000 and 3001.
    for dev_port in (3000, 3001):
        allowed_origins.add(f"{parsed.scheme}://localhost:{dev_port}")
        allowed_origins.add(f"{parsed.scheme}://127.0.0.1:{dev_port}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allowed_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app.add_middleware(SecurityHeadersMiddleware)

@app.middleware("http")
async def rate_limit_middleware(request, call_next):
    api_prefix = settings.api_prefix.rstrip("/")
    path = request.url.path
    if path.startswith(f"{api_prefix}/"):
        if path.startswith(f"{api_prefix}/auth/"):
            retry_after = check_request_rate_limit(
                request=request,
                key_scope="auth",
                limit=settings.auth_rate_limit_per_minute,
                window_seconds=60,
            )
        elif path == f"{api_prefix}/gmail/webhook" or path == f"{api_prefix}/cashfree/webhook":
            retry_after = check_request_rate_limit(
                request=request,
                key_scope="webhook",
                limit=settings.webhook_rate_limit_per_minute,
                window_seconds=60,
            )
        else:
            retry_after = check_request_rate_limit(
                request=request,
                key_scope="api",
                limit=settings.api_rate_limit_per_minute,
                window_seconds=60,
            )

        if retry_after is not None:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down."},
                headers={"Retry-After": str(retry_after)},
            )

    return await call_next(request)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.exception("Unhandled application error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"},
    )

app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/")
def root():
    return {"name": settings.app_name, "status": "ok"}
