import os
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


def _clip_text(value: Any, *, default: str, max_length: int) -> str:
    text = str(value or default).strip() or default
    return text[:max_length]


def _coerce_sales_asset(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None

    path = str(value.get("path") or "").strip()
    if not path:
        return None

    name = _clip_text(value.get("name") or os.path.basename(path) or "attachment", default="attachment", max_length=255)
    mime_type = _clip_text(value.get("mime_type"), default="application/octet-stream", max_length=120)
    uploaded_at = _clip_text(value.get("uploaded_at"), default="1970-01-01T00:00:00Z", max_length=80)
    asset_id = _clip_text(value.get("id") or f"{path}:{name}", default=name, max_length=120)

    try:
        size = int(value.get("size") or 0)
    except (TypeError, ValueError):
        size = 0

    return {
        "id": asset_id,
        "name": name,
        "path": path[:500],
        "mime_type": mime_type,
        "size": max(size, 0),
        "uploaded_at": uploaded_at,
    }


class SalesAsset(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=255)
    path: str = Field(min_length=1, max_length=500)
    mime_type: str = Field(min_length=1, max_length=120)
    size: int = Field(ge=0)
    uploaded_at: str = Field(min_length=1, max_length=80)


class BusinessProfileUpsert(BaseModel):
    agent_id: str = Field(default="gmail_followup", min_length=1, max_length=120)
    business_name: str = Field(min_length=1, max_length=150)
    industry: str = Field(min_length=1, max_length=100)
    target_customer: str = Field(min_length=1, max_length=2000)
    core_offer: str = Field(min_length=1, max_length=3000)
    price_range: Optional[str] = Field(default=None, max_length=100)
    differentiator: Optional[str] = Field(default=None, max_length=3000)
    email_footer: Optional[str] = Field(default=None, max_length=2000)
    sales_assets: list[SalesAsset] = Field(default_factory=list)

    @field_validator("sales_assets", mode="before")
    @classmethod
    def normalize_sales_assets(cls, value: Any) -> list[dict[str, Any]]:
        if value is None:
            return []
        if not isinstance(value, list):
            return []

        normalized_assets: list[dict[str, Any]] = []
        for item in value:
            normalized = _coerce_sales_asset(item)
            if normalized is not None:
                normalized_assets.append(normalized)
        return normalized_assets


class BusinessProfileResponse(BusinessProfileUpsert):
    user_id: str
