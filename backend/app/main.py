from fastapi import FastAPI
import os
import ssl
from fastapi.middleware.cors import CORSMiddleware
from urllib.parse import urlparse

from app.api.router import router as api_router
from app.core.config import get_settings


settings = get_settings()

# Bypass SSL certificate validation for development
if os.environ.get("BYPASS_SSL", "1") == "1":
    try:
        ssl._create_default_https_context = ssl._create_unverified_context
        print("WARNING: SSL certificate validation is DISABLED for outgoing requests.")
    except Exception as e:
        print(f"Failed to bypass SSL validation: {e}")

app = FastAPI(title=settings.app_name)
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
    allow_origins=["*"], # For development, simplify to allow all while debugging CORS
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    import traceback
    print(f"CRITICAL ERROR: {exc}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "error": str(exc)},
    )

from fastapi.responses import JSONResponse
app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/")
def root():
    return {"name": settings.app_name, "environment": settings.app_env}
