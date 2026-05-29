"""Settings info endpoint — read-only snapshot of runtime configuration.

GET /api/v1/settings/info
"""

from __future__ import annotations

from importlib.metadata import version as _pkg_version

from fastapi import APIRouter

from api.schemas.settings_info import SettingsInfoResponse

router = APIRouter(prefix="/settings", tags=["settings"])


def _v(pkg: str) -> str:
    try:
        return _pkg_version(pkg)
    except Exception:
        return "?"


@router.get("/info")
async def get_settings_info() -> SettingsInfoResponse:
    """Return read-only snapshot of the current runtime configuration."""
    from config.settings import get_settings  # noqa: PLC0415

    s = get_settings()

    provider_model_map = {
        "gemini": s.gemini_model,
        "openai": s.openai_model,
        "anthropic": s.anthropic_model,
        "local": s.local_llm_model or "(none)",
    }
    primary_model = provider_model_map.get(s.primary_llm_provider, "unknown")

    import sys  # noqa: PLC0415
    python_version = (
        f"{sys.version_info.major}"
        f".{sys.version_info.minor}"
        f".{sys.version_info.micro}"
    )

    backend_packages: list[list[str]] = [
        ["Python", python_version],
        ["FastAPI", _v("fastapi")],
        ["LangChain", _v("langchain")],
        ["LangGraph", _v("langgraph")],
        ["Qdrant Client", _v("qdrant-client")],
        ["sentence-transformers", _v("sentence-transformers")],
        ["Neo4j Driver", _v("neo4j")],
    ]

    # Frontend package versions from design-time constants.
    # Keep in sync with frontend/package.json when upgrading.
    frontend_packages: list[list[str]] = [
        ["React", "19.x"],
        ["TypeScript", "5.x"],
        ["TanStack Query", "5.x"],
        ["React Router", "6.x"],
        ["Cytoscape.js", "3.x"],
        ["i18next", "26.x"],
    ]

    return SettingsInfoResponse(
        app_version=_v("storysphere"),
        app_env=s.app_env,
        primary_llm_provider=s.primary_llm_provider,
        primary_model=primary_model,
        analysis_temperature=s.analysis_temperature,
        chat_agent_temperature=s.chat_agent_temperature,
        local_llm_model=s.local_llm_model or "(none)",
        database_url=s.database_url,
        analysis_cache_db_path=s.analysis_cache_db_path,
        qdrant_local_path=s.qdrant_local_path,
        kg_persistence_path=s.kg_persistence_path,
        frontend_packages=frontend_packages,
        backend_packages=backend_packages,
    )
