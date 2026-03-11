"""LangSmith tracing configuration.

LangChain auto-traces all LLM calls, chain invocations, and LangGraph steps
when the following environment variables are set:

    LANGCHAIN_TRACING_V2=true
    LANGCHAIN_API_KEY=ls__...
    LANGCHAIN_PROJECT=storysphere

Call ``configure_langsmith()`` once at application startup (before any LLM
calls are made) to activate tracing based on ``Settings``.

For non-LangChain orchestration code, use the ``@traceable`` decorator from
``langsmith`` to create custom spans that appear as parent traces in the UI.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


def configure_langsmith(settings=None) -> bool:
    """Configure LangSmith tracing from Settings.

    Args:
        settings: ``Settings`` instance.  Reads from ``get_settings()`` if None.

    Returns:
        ``True`` if tracing was enabled, ``False`` otherwise.
    """
    if settings is None:
        from config.settings import get_settings  # noqa: PLC0415
        settings = get_settings()

    if not settings.langchain_tracing:
        logger.debug("LangSmith tracing disabled (LANGCHAIN_TRACING=false)")
        return False

    if not settings.langchain_api_key:
        logger.warning(
            "LangSmith tracing enabled but LANGCHAIN_API_KEY is not set — tracing skipped"
        )
        return False

    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
    os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project
    if settings.langchain_endpoint:
        os.environ["LANGCHAIN_ENDPOINT"] = settings.langchain_endpoint

    logger.info(
        "LangSmith tracing enabled — project: %s endpoint: %s",
        settings.langchain_project,
        settings.langchain_endpoint or "https://api.smith.langchain.com",
    )
    return True


def is_tracing_enabled() -> bool:
    """Return True if LangSmith tracing is currently active."""
    return os.environ.get("LANGCHAIN_TRACING_V2", "").lower() == "true"
