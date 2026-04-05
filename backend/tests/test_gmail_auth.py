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
        self.table_name: str | None = None
        self.filters: dict[str, str] = {}

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def execute(self):
        self.supabase.deleted_filters[self.table_name or "unknown"] = dict(self.filters)
        return type("Result", (), {"data": []})()


class _FakeUpdateQuery:
    def __init__(self, supabase, payload):
        self.supabase = supabase
        self.payload = payload
        self.table_name: str | None = None
        self.filters: dict[str, str] = {}

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def execute(self):
        self.supabase.updated_rows[self.table_name or "unknown"] = {
            "payload": dict(self.payload),
            "filters": dict(self.filters),
        }
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
    def __init__(self, rows_by_table):
        self.rows_by_table = rows_by_table
        self.updated_rows: dict[str, dict[str, dict[str, str]]] = {}
        self.upserted_rows: dict[str, dict[str, str | None]] = {}
        self.current_table: str | None = None

    def table(self, name):
        self.current_table = name
        return self

    def select(self, *_args, **_kwargs):
        return _FakeSelectQuery(self.rows_by_table.get(self.current_table))

    def update(self, payload):
        query = _FakeUpdateQuery(self, payload)
        query.table_name = self.current_table
        return query

    def upsert(self, payload, **_kwargs):
        self.upserted_rows[self.current_table or "unknown"] = dict(payload)
        return _FakeExecute([payload])


def test_get_credentials_marks_revoked_connection_disconnected() -> None:
    original_supabase = auth.supabase
    original_refresh = auth.Credentials.refresh

    fake_supabase = _FakeSupabase(
        {"gmail_connections": {
            "user_id": "user-123",
            "agent_id": "gmail_followup",
            "access_token": "old-access-token",
            "refresh_token": "old-refresh-token",
            "token_expiry": "2025-01-01T00:00:00+00:00",
        }}
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

        assert fake_supabase.updated_rows["gmail_connections"] == {
            "payload": {"status": "disconnected"},
            "filters": {
                "user_id": "user-123",
                "agent_id": "gmail_followup",
            },
        }
    finally:
        auth.supabase = original_supabase
        auth.Credentials.refresh = original_refresh
