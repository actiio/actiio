from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.schemas.auth import AuthResponse, SignInRequest, SignUpRequest, UserResponse
from app.services.auth_service import sign_in, sign_up

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/sign-up", response_model=AuthResponse)
def sign_up_route(payload: SignUpRequest):
    tokens = sign_up(payload.email, payload.password)
    return AuthResponse(**tokens)


@router.post("/sign-in", response_model=AuthResponse)
def sign_in_route(payload: SignInRequest):
    tokens = sign_in(payload.email, payload.password)
    return AuthResponse(**tokens)


@router.get("/me", response_model=UserResponse)
def me(current_user=Depends(get_current_user)):
    return UserResponse(id=current_user.id, email=current_user.email)
