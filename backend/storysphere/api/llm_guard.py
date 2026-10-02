"""Pre-flight check for endpoints that are about to spend LLM tokens.

Analysis triggers launch a background task, so with no provider configured the
request used to be accepted (2xx) and the failure only surfaced inside the task.
Call :func:`require_llm_provider` right before launching — *after* the
endpoint's own 404/409/422 validation, so existing error behaviour is unchanged
— to answer ``503`` up front instead.
"""

from __future__ import annotations

from fastapi import HTTPException


def _primary_config_error() -> str | None:
    from storysphere.core.llm_client import LLMClient  # noqa: PLC0415

    # A fresh client reads the live settings; the singleton would pin the
    # settings it was built with.
    return LLMClient().primary_config_error()


def require_llm_provider() -> None:
    """Raise ``HTTPException(503)`` when the primary LLM provider is not configured."""
    error = _primary_config_error()
    if error is not None:
        raise HTTPException(status_code=503, detail=f"LLM provider is not configured: {error}")
