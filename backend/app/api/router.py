from fastapi import APIRouter

from app.api.routes_auth import router as auth_router
from app.api.routes_business_profile import router as business_profile_router
from app.api.routes_gmail import router as gmail_router
from app.api.routes_health import router as health_router
from app.api.routes_agents import router as agents_router
from app.api.routes_payment import router as payment_router
from app.api.routes_threads import router as threads_router

router = APIRouter()
router.include_router(health_router)
router.include_router(auth_router)
router.include_router(business_profile_router)
router.include_router(payment_router)
router.include_router(agents_router)
router.include_router(gmail_router)
router.include_router(threads_router)
