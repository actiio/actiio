from __future__ import annotations

import sys
from pathlib import Path

from fastapi import HTTPException

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BASE_DIR))

from app.services import auth_service


class _DuplicateEmailError(Exception):
    def __init__(self) -> None:
        super().__init__("User already exists")
        self.message = "A user with this email address has already been registered"
        self.code = "email_exists"


class _FakeAdminAuth:
    def create_user(self, _payload):
        raise _DuplicateEmailError()


class _FakeAuth:
    admin = _FakeAdminAuth()


class _FakeSupabase:
    auth = _FakeAuth()


def test_sign_up_returns_specific_error_for_duplicate_email() -> None:
    original_supabase = auth_service.supabase
    auth_service.supabase = _FakeSupabase()

    try:
        try:
            auth_service.sign_up("test@example.com", "Password123!")
            raise AssertionError("Expected duplicate email signup to fail")
        except HTTPException as exc:
            assert exc.status_code == 400
            assert exc.detail == "An account with this email already exists. Please sign in instead."
    finally:
        auth_service.supabase = original_supabase
