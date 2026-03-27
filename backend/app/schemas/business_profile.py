from pydantic import BaseModel, Field
from typing import Optional


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
    target_customer: str = Field(min_length=1, max_length=300)
    core_offer: str = Field(min_length=1, max_length=500)
    price_range: Optional[str] = Field(default=None, max_length=100)
    differentiator: Optional[str] = Field(default=None, max_length=500)
    email_footer: Optional[str] = Field(default=None, max_length=1200)
    sales_assets: list[SalesAsset] = Field(default_factory=list)


class BusinessProfileResponse(BusinessProfileUpsert):
    user_id: str
