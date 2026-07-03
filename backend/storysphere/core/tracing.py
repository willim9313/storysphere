"""Langfuse tracing configuration.

Langfuse traces all LangChain / LangGraph calls when a ``CallbackHandler``
is passed via ``config={"callbacks": [handler]}`` to each invoke/stream call.

Call ``configure_langfuse()`` once at application startup.  Use
``get_langfuse_handler()`` to retrieve the singleton handler for injection.

For non-LangChain code, use the ``@observe`` decorator from ``langfuse``
to create custom spans that nest inside the active trace.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_handler: object | None = None


def configure_langfuse(settings=None) -> bool:
    """Configure Langfuse tracing from Settings.

    Sets the required environment variables so that ``CallbackHandler()``
    and ``@observe`` can initialise without explicit key arguments.

    Args:
        settings: ``Settings`` instance.  Reads from ``get_settings()`` if None.

    Returns:
        ``True`` if tracing was enabled, ``False`` otherwise.
    """
    global _handler

    if settings is None:
        from storysphere.config.settings import get_settings  # noqa: PLC0415

        settings = get_settings()

    if not settings.langfuse_enabled:
        logger.debug("Langfuse tracing disabled (LANGFUSE_ENABLED=false)")
        return False

    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        logger.warning(
            "Langfuse tracing enabled but LANGFUSE_PUBLIC_KEY or "
            "LANGFUSE_SECRET_KEY is not set — tracing skipped"
        )
        return False

    os.environ["LANGFUSE_PUBLIC_KEY"] = settings.langfuse_public_key
    os.environ["LANGFUSE_SECRET_KEY"] = settings.langfuse_secret_key
    os.environ["LANGFUSE_TRACING_ENABLED"] = "true"
    # Sampling keeps trace volume (and Langfuse billable units) in check under
    # heavy chat load; 1.0 = trace everything (default, unchanged behaviour).
    os.environ["LANGFUSE_SAMPLE_RATE"] = str(settings.langfuse_sample_rate)
    if settings.langfuse_base_url:
        os.environ["LANGFUSE_BASE_URL"] = settings.langfuse_base_url

    try:
        from langfuse.langchain import CallbackHandler  # noqa: PLC0415

        _handler = CallbackHandler()
        logger.info(
            "Langfuse tracing enabled — host: %s",
            settings.langfuse_base_url or "https://cloud.langfuse.com",
        )
        return True
    except Exception as exc:
        logger.warning("Failed to initialise Langfuse CallbackHandler: %s", exc)
        return False


def get_langfuse_handler():
    """Return the singleton ``CallbackHandler``, or ``None`` if tracing is off."""
    return _handler


def is_tracing_enabled() -> bool:
    """Return True if Langfuse tracing is currently active."""
    return _handler is not None


def update_span(**kwargs) -> None:
    """Update the current Langfuse span with metadata. No-op when tracing is off."""
    if _handler is None:
        return
    try:
        from langfuse import get_client as _get_client  # noqa: PLC0415

        _get_client().update_current_span(**kwargs)
    except Exception:
        pass
