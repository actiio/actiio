from functools import lru_cache
from typing import Optional
from urllib.parse import urlparse

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Actiio Backend"
    app_env: str = "production"
    api_prefix: str = "/api"

    supabase_url: str
    supabase_service_key: str = Field(validation_alias="SUPABASE_SERVICE_KEY")
    openai_api_key: Optional[str] = Field(default=None, validation_alias="OPENAI_API_KEY")
    groq_api_key: str = Field(default="", validation_alias="GROQ_API_KEY")

    google_client_id: Optional[str] = Field(default=None, validation_alias="GOOGLE_CLIENT_ID")
    google_client_secret: Optional[str] = Field(default=None, validation_alias="GOOGLE_CLIENT_SECRET")
    google_redirect_uri: Optional[str] = Field(default=None, validation_alias="GOOGLE_REDIRECT_URI")
    frontend_url: Optional[str] = Field(default="http://localhost:3000", validation_alias="FRONTEND_URL")
    email_logo_url: Optional[str] = Field(default=None, validation_alias="EMAIL_LOGO_URL")
    resend_api_key: Optional[str] = Field(default=None, validation_alias="RESEND_API_KEY")
    app_secret_key: Optional[str] = Field(default=None, validation_alias="APP_SECRET_KEY")
    cashfree_app_id: Optional[str] = Field(default=None, validation_alias="CASHFREE_APP_ID")
    cashfree_secret_key: Optional[str] = Field(default=None, validation_alias="CASHFREE_SECRET_KEY")
    cashfree_env: str = Field(default="sandbox", validation_alias="CASHFREE_ENV")
    cashfree_plan_id: Optional[str] = Field(default=None, validation_alias="CASHFREE_PLAN_ID")
    cashfree_return_url: Optional[str] = Field(default=None, validation_alias="CASHFREE_RETURN_URL")
    cashfree_billing_enabled: bool = Field(default=False, validation_alias="CASHFREE_BILLING_ENABLED")
    sales_assets_bucket: Optional[str] = Field(default="sales-assets", validation_alias="SALES_ASSETS_BUCKET")
    bypass_ssl: bool = Field(default=False, validation_alias="BYPASS_SSL")
    api_rate_limit_per_minute: int = Field(default=120, validation_alias="API_RATE_LIMIT_PER_MINUTE")
    auth_rate_limit_per_minute: int = Field(default=30, validation_alias="AUTH_RATE_LIMIT_PER_MINUTE")
    webhook_rate_limit_per_minute: int = Field(default=60, validation_alias="WEBHOOK_RATE_LIMIT_PER_MINUTE")
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

    @field_validator("email_logo_url")
    @classmethod
    def validate_email_logo_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = value.strip()
        if not normalized:
            return None
        parsed = urlparse(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("EMAIL_LOGO_URL must be a valid http(s) URL.")
        return normalized

    @property
    def state_signing_secret(self) -> str:
        if not self.app_secret_key:
            if self.app_env != "development":
                raise ValueError(
                    "APP_SECRET_KEY must be set in non-development environments. "
                    "Generate a strong random secret and set it in your .env file."
                )
            # Development-only fallback — never used in production.
            return self.supabase_service_key
        return self.app_secret_key

    @property
    def cashfree_base_url(self) -> str:
        if self.cashfree_env == "production":
            return "https://api.cashfree.com/pg"
        return "https://sandbox.cashfree.com/pg"


@lru_cache
def get_settings() -> Settings:
    return Settings()
