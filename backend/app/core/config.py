from functools import lru_cache
from typing import Optional
from urllib.parse import urlparse

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Actiio Backend"
    app_env: str = "development"
    api_prefix: str = "/api"

    supabase_url: str
    supabase_service_key: str = Field(validation_alias="SUPABASE_SERVICE_KEY")
    openai_api_key: Optional[str] = Field(default=None, validation_alias="OPENAI_API_KEY")
    groq_api_key: str = Field(default="", validation_alias="GROQ_API_KEY")

    google_client_id: Optional[str] = Field(default=None, validation_alias="GOOGLE_CLIENT_ID")
    google_client_secret: Optional[str] = Field(default=None, validation_alias="GOOGLE_CLIENT_SECRET")
    google_redirect_uri: Optional[str] = Field(default=None, validation_alias="GOOGLE_REDIRECT_URI")
    frontend_url: Optional[str] = Field(default="http://localhost:3000", validation_alias="FRONTEND_URL")
    app_secret_key: Optional[str] = Field(default=None, validation_alias="APP_SECRET_KEY")
    stripe_secret_key: Optional[str] = Field(default=None, validation_alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: Optional[str] = Field(default=None, validation_alias="STRIPE_WEBHOOK_SECRET")
    stripe_price_id: Optional[str] = Field(default=None, validation_alias="STRIPE_PRICE_ID")
    stripe_actiio_free_price_id: Optional[str] = Field(default=None, validation_alias="STRIPE_ACTIIO_FREE_PRICE_ID")
    stripe_actiio_pro_price_id: Optional[str] = Field(default=None, validation_alias="STRIPE_ACTIIO_PRO_PRICE_ID")
    sales_assets_bucket: Optional[str] = Field(default="sales-assets", validation_alias="SALES_ASSETS_BUCKET")
    bypass_ssl: bool = Field(default=False, validation_alias="BYPASS_SSL")
    api_rate_limit_per_minute: int = Field(default=120, validation_alias="API_RATE_LIMIT_PER_MINUTE")
    auth_rate_limit_per_minute: int = Field(default=30, validation_alias="AUTH_RATE_LIMIT_PER_MINUTE")
    auth_attempt_limit_per_15min: int = Field(default=8, validation_alias="AUTH_ATTEMPT_LIMIT_PER_15MIN")
    send_limit_per_hour: int = Field(default=30, validation_alias="SEND_LIMIT_PER_HOUR")
    send_limit_per_day: int = Field(default=200, validation_alias="SEND_LIMIT_PER_DAY")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore")

    @field_validator("frontend_url")
    @classmethod
    def validate_frontend_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = value.strip()
        if normalized == "*":
            raise ValueError("FRONTEND_URL must be a specific origin, not '*'.")
        parsed = urlparse(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("FRONTEND_URL must be a valid http(s) origin.")
        return normalized.rstrip("/")

    @property
    def state_signing_secret(self) -> str:
        return self.app_secret_key or self.supabase_service_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
