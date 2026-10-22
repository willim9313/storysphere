"""Response schema for GET /api/v1/settings/info."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class SettingsInfoResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    app_version: str
    app_env: str
    primary_llm_provider: str
    primary_model: str
    # Same verdict as the 503 pre-flight (``primary_config_error() is None``); never the key itself.
    primary_provider_ready: bool
    # The .env variable that would make the primary provider usable, e.g. ``GEMINI_API_KEY``.
    primary_credential_env: str
    analysis_temperature: float
    chat_agent_temperature: float
    local_llm_model: str
    database_url: str
    analysis_cache_db_path: str
    qdrant_local_path: str
    kg_persistence_path: str
    frontend_packages: list[list[str]]
    backend_packages: list[list[str]]
