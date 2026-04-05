from __future__ import annotations

import sys
from pathlib import Path

from google.auth.exceptions import RefreshError

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BASE_DIR))

from integrations.gmail import auth


class _FakeExecute:
    def __init__(self, data):
        self.data = data

    def execute(self):
        return type("Result", (), {"data": self.data})()


class _FakeDeleteQuery:
    def __init__(self, supabase):
        self.supabase = supabase
        self.filters: dict[str, str] = {}

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def execute(self):
        self.supabase.deleted_filters = dict(self.filters)
        return type("Result", (), {"data": []})()


class _FakeSelectQuery:
    def __init__(self, row):
        self.row = row

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        return type("Result", (), {"data": [self.row]})()


class _FakeSupabase:
    def __init__(self, row):
        self.row = row
        self.deleted_filters: dict[str, str] | None = None

    def table(self, name):
        if name != "gmail_connections":
            raise AssertionError(f"Unexpected table: {name}")
        return self

    def select(self, *_args, **_kwargs):
        return _FakeSelectQuery(self.row)

    def delete(self):
        return _FakeDeleteQuery(self)


def test_get_credentials_clears_revoked_connection() -> None:
    original_supabase = auth.supabase
    original_refresh = auth.Credentials.refresh

    fake_supabase = _FakeSupabase(
        {
            "user_id": "user-123",
            "agent_id": "gmail_followup",
            "access_token": "old-access-token",
            "refresh_token": "old-refresh-token",
            "token_expiry": "2025-01-01T00:00:00+00:00",
        }
    )

    def _fake_refresh(self, _request):
        raise RefreshError(
            "invalid_grant: Token has been expired or revoked.",
            {"error": "invalid_grant"},
        )

    auth.supabase = fake_supabase
    auth.Credentials.refresh = _fake_refresh

    try:
        try:
            auth.get_credentials("user-123")
            raise AssertionError("Expected GmailConnectionExpiredError")
        except auth.GmailConnectionExpiredError:
            pass

        assert fake_supabase.deleted_filters == {
            "user_id": "user-123",
            "agent_id": "gmail_followup",
        }
    finally:
        auth.supabase = original_supabase
        auth.Credentials.refresh = original_refresh
