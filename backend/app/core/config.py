from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Actiio Backend"
    app_env: str = "development"
    api_prefix: str = "/api"

    supabase_url: str
    supabase_service_key: str = Field(validation_alias="SUPABASE_SERVICE_KEY")
    anthropic_api_key: Optional[str] = Field(default=None, validation_alias="ANTHROPIC_API_KEY")
    openai_api_key: Optional[str] = Field(default=None, validation_alias="OPENAI_API_KEY")
    openai_model: Optional[str] = Field(default="gpt-4o", validation_alias="OPENAI_MODEL")
    ai_provider: Optional[str] = Field(default="ollama", validation_alias="AI_PROVIDER")
    ollama_base_url: Optional[str] = Field(default="http://localhost:11434", validation_alias="OLLAMA_BASE_URL")
    ollama_model: Optional[str] = Field(default="qwen2.5:7b", validation_alias="OLLAMA_MODEL")

    google_client_id: Optional[str] = Field(default=None, validation_alias="GOOGLE_CLIENT_ID")
    google_client_secret: Optional[str] = Field(default=None, validation_alias="GOOGLE_CLIENT_SECRET")
    google_redirect_uri: Optional[str] = Field(default=None, validation_alias="GOOGLE_REDIRECT_URI")
    google_pubsub_topic: Optional[str] = Field(default=None, validation_alias="GOOGLE_PUBSUB_TOPIC")
    frontend_url: Optional[str] = Field(default="http://localhost:3000", validation_alias="FRONTEND_URL")
    whatsapp_verify_token: Optional[str] = Field(default=None, validation_alias="WHATSAPP_VERIFY_TOKEN")
    whatsapp_api_version: Optional[str] = Field(default="v21.0", validation_alias="WHATSAPP_API_VERSION")
    stripe_secret_key: Optional[str] = Field(default=None, validation_alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: Optional[str] = Field(default=None, validation_alias="STRIPE_WEBHOOK_SECRET")
    stripe_price_id: Optional[str] = Field(default=None, validation_alias="STRIPE_PRICE_ID")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()
