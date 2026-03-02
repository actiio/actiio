from pydantic import BaseModel, Field


class BusinessProfileUpsert(BaseModel):
    business_name: str = Field(min_length=1, max_length=150)
    industry: str = Field(min_length=1, max_length=100)
    target_customer: str = Field(min_length=1, max_length=300)
    core_offer: str = Field(min_length=1, max_length=500)
    price_range: str = Field(min_length=1, max_length=100)
    differentiator: str = Field(min_length=1, max_length=500)
    preferred_tone: str = Field(min_length=1, max_length=50)
    silence_threshold_hours: int = Field(default=48, ge=1, le=720)


class BusinessProfileResponse(BusinessProfileUpsert):
    user_id: str
