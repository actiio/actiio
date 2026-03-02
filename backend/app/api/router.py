from fastapi import APIRouter

from app.api.routes_auth import router as auth_router
from app.api.routes_business_profile import router as business_profile_router
from app.api.routes_gmail import router as gmail_router
from app.api.routes_health import router as health_router
from app.api.routes_stripe import router as stripe_router
from app.api.routes_threads import router as threads_router
from app.api.routes_whatsapp import router as whatsapp_router

router = APIRouter()
router.include_router(health_router)
router.include_router(auth_router)
router.include_router(business_profile_router)
router.include_router(stripe_router)
router.include_router(gmail_router)
router.include_router(whatsapp_router)
router.include_router(threads_router)
