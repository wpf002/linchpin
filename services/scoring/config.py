"""Startup configuration. Validated once, fails fast when wrong."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", Path(".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(alias="DATABASE_URL")
    wikimedia_user_agent: str = Field(
        default="linchpin/0.1 (https://github.com/wpf002/linchpin)",
        alias="WIKIMEDIA_USER_AGENT",
    )
    tmdb_api_key: str = Field(default="", alias="TMDB_API_KEY")
    cache_dir: Path = Field(default=REPO_ROOT / "data" / "cache")
    corpus_dir: Path = Field(default=REPO_ROOT / "data" / "corpus")
    request_timeout_seconds: float = Field(default=20.0)

    @field_validator("database_url")
    @classmethod
    def _require_postgres(cls, value: str) -> str:
        if not value.startswith(("postgres://", "postgresql://")):
            raise ValueError("DATABASE_URL must be a PostgreSQL connection string")
        return value

    @property
    def psycopg_url(self) -> str:
        return self.database_url.replace("postgresql+psycopg://", "postgresql://")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()  # type: ignore[call-arg]
    settings.cache_dir.mkdir(parents=True, exist_ok=True)
    settings.corpus_dir.mkdir(parents=True, exist_ok=True)
    return settings
