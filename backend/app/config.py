from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    flask_env: str = "development"
    flask_secret_key: str = "unsafe-development-key"
    frontend_origin: str = "http://localhost:3000"
    supabase_url: str | None = None
    supabase_anon_key: str | None = None

