"""Langfuse tracing configuration.

Langfuse traces all LangChain / LangGraph calls when a ``CallbackHandler``
is passed via ``config={"callbacks": [handler]}`` to each invoke/stream call.

Call ``configure_langfuse()`` once at application startup.  Use
``get_langfuse_handler()`` to retrieve the singleton handler for injection.

For non-LangChain code, use the ``@observe`` decorator re-exported below
to create custom spans that nest inside the active trace.  Import it from
here rather than from ``langfuse`` directly: the local version degrades to a
no-op when langfuse is not installed, which keeps tracing optional.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_handler: object | None = None


try:
    from langfuse import observe
except ImportError:  # pragma: no cover - langfuse is an optional dev dependency
    def observe(**_kw):  # type: ignore[misc]
        """No-op stand-in for ``langfuse.observe`` when langfuse is absent.

        Langfuse is a development-time observability tool, not part of the
        execution path.  Every ``@observe`` in this codebase has to survive
        langfuse not being installed, and this decorator is what makes that
        true: it accepts the same keyword arguments and returns the function
        untouched.

        This is the single place in the backend that names the ``langfuse``
        package for span decoration.  Swapping or dropping the tracing vendor
        means editing here, not seven modules.

        What this deliberately does **not** do is decorate anything itself.
        Span names and boundaries (``analysis.character.cep``,
        ``extract.keywords``) are semantic choices made by the author of each
        call site.  No shared LLM helper opens a span on their behalf — see
        ``core/llm_call.py``, which calls the model without touching tracing.
        """
        def _decorate(fn):
            return fn

        return _decorate


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

    host = settings.langfuse_base_url or "https://cloud.langfuse.com"
    try:
        from langfuse.langchain import CallbackHandler  # noqa: PLC0415

        _handler = CallbackHandler()
    except Exception as exc:
        logger.warning("Failed to initialise Langfuse CallbackHandler: %s", exc)
        return False

    # Constructing the handler proves nothing about the keys — it does not talk
    # to the server. Without this probe, wrong credentials produce a process
    # that logs "tracing enabled", answers every request normally, and silently
    # drops every span; the only way to notice is to go count traces in the UI.
    # That happened on 2026-09-12 (public/secret pasted into each other's slot),
    # and it cost a full measurement run to spot.
    if not _auth_ok(host):
        _handler = None
        return False

    logger.info("Langfuse tracing enabled — host: %s", host)
    return True


def _auth_ok(host: str) -> bool:
    """Verify the configured keys against the server.

    Three outcomes, deliberately not two:

    - verified      → tracing proceeds.
    - **rejected**  → ERROR naming the two things that actually go wrong, and
      the caller disables tracing. A handler that cannot authenticate is pure
      per-call overhead, and leaving it installed would keep the "enabled" log
      line lying.
    - unverifiable  → a network blip at startup is not a configuration error,
      so this warns and lets tracing proceed. Being unable to *check* the keys
      is not evidence that they are wrong.
    """
    try:
        from langfuse import get_client  # noqa: PLC0415
        from langfuse.api import UnauthorizedError  # noqa: PLC0415

        if get_client().auth_check():
            return True
    except UnauthorizedError:
        # `auth_check()` RAISES on rejection rather than returning False, so a
        # bare `except Exception` here would file "wrong keys" under "could not
        # check" and leave tracing on — which is the exact failure this probe
        # exists to catch. Verified by running it with the keys swapped
        # (B-061: a new guard has to be seen going red).
        pass
    except Exception as exc:
        logger.warning(
            "Langfuse credentials could not be verified (%s: %s) — tracing left "
            "on; if spans never appear, check the keys and host first",
            type(exc).__name__,
            exc,
        )
        return True

    logger.error(
        "Langfuse rejected the configured credentials (host: %s) — tracing "
        "DISABLED. Check that LANGFUSE_PUBLIC_KEY holds the pk-lf-… value and "
        "LANGFUSE_SECRET_KEY the sk-lf-… one (swapping them is the usual "
        "cause), and that LANGFUSE_BASE_URL names the right region.",
        host,
    )
    return False


def get_langfuse_handler():
    """Return the singleton ``CallbackHandler``, or ``None`` if tracing is off."""
    return _handler


def update_span(**kwargs) -> None:
    """Update the current Langfuse span with metadata. No-op when tracing is off."""
    if _handler is None:
        return
    try:
        from langfuse import get_client as _get_client  # noqa: PLC0415

        _get_client().update_current_span(**kwargs)
    except Exception:
        pass
