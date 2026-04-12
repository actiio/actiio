from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


def _ensure_safe_password(value: str) -> str:
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise ValueError("Password contains unsupported control characters")
    return value


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    _validate_password = field_validator("password")(_ensure_safe_password)


class SignInRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    _validate_password = field_validator("password")(_ensure_safe_password)


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class SignUpResponse(BaseModel):
    message: str


class UserResponse(BaseModel):
    id: str
    email: Optional[EmailStr] = None
    display_name: Optional[str] = None
    subscription_status: Optional[str] = None
    gmail_display_name: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
