"""TokenTrackingHandler — LangChain callback for automatic token usage tracking.

Attaches to ``BaseChatModel`` via ``callbacks=[handler]`` at construction time.
Extracts token counts from ``AIMessage.usage_metadata`` (normalised by LangChain
across all providers) and records them to both :class:`MetricsCollector` and
:class:`TokenUsageStore`.

Service context is propagated via :func:`set_llm_service_context` using
:mod:`contextvars`, so each service only needs a single line before calling
``ainvoke``.
"""

from __future__ import annotations

import asyncio
import contextvars
import logging
import time
from typing import Any
from uuid import UUID

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Service context (contextvars)
# ---------------------------------------------------------------------------

_current_service: contextvars.ContextVar[str] = contextvars.ContextVar(
    "_current_service", default="unknown"
)

_current_book_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "_current_book_id", default=None
)


# ---------------------------------------------------------------------------
# Main event loop reference (set by lifespan for cross-thread scheduling)
# ---------------------------------------------------------------------------

_main_event_loop: asyncio.AbstractEventLoop | None = None


def set_main_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Store a reference to the main event loop for cross-thread async scheduling."""
    global _main_event_loop
    _main_event_loop = loop


def set_llm_service_context(service: str, book_id: str | None = None) -> None:
    """Set the current LLM service context for token tracking.

    Call this before ``llm.ainvoke()`` in each service module::

        set_llm_service_context("summary")
        result = await self._llm.ainvoke(messages)
    """
    _current_service.set(service)
    if book_id is not None:
        _current_book_id.set(book_id)


def get_llm_service_context() -> tuple[str, str | None]:
    """Return ``(service, book_id)`` from the current context."""
    return _current_service.get(), _current_book_id.get()


# ---------------------------------------------------------------------------
# Callback handler
# ---------------------------------------------------------------------------


class TokenTrackingHandler(BaseCallbackHandler):
    """LangChain callback that records token usage per LLM call.

    Parameters
    ----------
    provider:
        Provider name (``"gemini"``, ``"openai"``, ``"anthropic"``, ``"local"``).
    model:
        Model identifier (e.g. ``"gemini-2.0-flash"``).
    token_store:
        Optional :class:`TokenUsageStore` for persistent recording.
        If ``None``, only in-memory metrics are recorded.
    """

    def __init__(
        self,
        provider: str,
        model: str,
        token_store: Any | None = None,
    ) -> None:
        super().__init__()
        self.provider = provider
        self.model = model
        self._token_store = token_store
        # Track start time per run_id
        self._start_times: dict[UUID, float] = {}

    # -- lifecycle hooks ---------------------------------------------------

    def on_llm_start(
        self,
        serialized: dict[str, Any],
        prompts: list[str],
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        self._start_times[run_id] = time.perf_counter()

    def on_llm_end(
        self,
        response: LLMResult,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        latency_ms = self._calc_latency(run_id)
        prompt_tokens, completion_tokens, total_tokens = self._extract_tokens(response)
        service, book_id = get_llm_service_context()

        self._record_metrics(
            service=service,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            latency_ms=latency_ms,
            success=True,
        )
        self._schedule_store(
            service=service,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            latency_ms=latency_ms,
            success=True,
            book_id=book_id,
        )

    def on_llm_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        latency_ms = self._calc_latency(run_id)
        service, book_id = get_llm_service_context()
        error_name = type(error).__name__

        self._record_metrics(
            service=service,
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            latency_ms=latency_ms,
            success=False,
            error=error_name,
        )
        self._schedule_store(
            service=service,
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            latency_ms=latency_ms,
            success=False,
            book_id=book_id,
            error=error_name,
        )

    # -- internal helpers --------------------------------------------------

    def _calc_latency(self, run_id: UUID) -> float:
        start = self._start_times.pop(run_id, None)
        if start is None:
            return 0.0
        return (time.perf_counter() - start) * 1000

    @staticmethod
    def _extract_tokens(response: LLMResult) -> tuple[int, int, int]:
        """Extract token counts from LLMResult.

        Tries multiple paths in priority order:
        1. ``generations[0][0].message.usage_metadata`` (LangChain v0.3+ normalised)
        2. ``llm_output`` dict (older LangChain / some providers)

        ``usage_metadata`` may be a dict or a Pydantic model depending on the
        provider integration, so we support both access styles.
        """

        def _get(obj: Any, key: str, default: int = 0) -> int:
            """Get a value from a dict or object attribute."""
            if isinstance(obj, dict):
                return obj.get(key, default) or default
            return getattr(obj, key, default) or default

        # Path 1: usage_metadata on the AIMessage (preferred)
        try:
            gen = response.generations[0][0]
            msg = getattr(gen, "message", None)
            if msg is not None:
                usage = getattr(msg, "usage_metadata", None)
                if usage is not None:
                    input_t = _get(usage, "input_tokens")
                    output_t = _get(usage, "output_tokens")
                    total_t = _get(usage, "total_tokens") or (input_t + output_t)
                    if input_t or output_t or total_t:
                        return input_t, output_t, total_t
        except (IndexError, AttributeError):
            pass

        # Path 2: llm_output dict
        llm_output = response.llm_output or {}
        token_usage = llm_output.get("token_usage") or llm_output.get("usage") or {}
        if token_usage:
            prompt = token_usage.get("prompt_tokens", 0) or 0
            completion = token_usage.get("completion_tokens", 0) or 0
            total = token_usage.get("total_tokens", 0) or (prompt + completion)
            return prompt, completion, total

        return 0, 0, 0

    def _record_metrics(
        self,
        *,
        service: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        latency_ms: float,
        success: bool,
        error: str | None = None,
    ) -> None:
        """Record to in-process MetricsCollector."""
        try:
            from core.metrics import get_metrics

            get_metrics().record_llm_call(
                provider=self.provider,
                model=self.model,
                service=service,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                success=success,
                latency_ms=latency_ms,
                error=error,
            )
        except Exception:
            logger.debug("Failed to record metrics", exc_info=True)

    def _schedule_store(
        self,
        *,
        service: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        latency_ms: float,
        success: bool,
        book_id: str | None = None,
        error: str | None = None,
    ) -> None:
        """Schedule async write to TokenUsageStore (fire-and-forget).

        LangChain callbacks are synchronous, so we need to bridge to async.
        We try multiple strategies:
        1. If a running event loop exists in this thread, create a task.
        2. Otherwise, use the stored event loop reference via
           ``run_coroutine_threadsafe`` (works from callback threads).
        3. As a last resort, spin up a one-shot event loop in a thread.
        """
        if self._token_store is None:
            return

        coro = self._token_store.record(
            provider=self.provider,
            model=self.model,
            service=service,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            latency_ms=latency_ms,
            success=success,
            book_id=book_id,
            error=error,
        )

        # Strategy 1: running loop in this thread
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coro)
            return
        except RuntimeError:
            pass

        # Strategy 2: use the main event loop (stored globally by lifespan)
        main_loop = _main_event_loop
        if main_loop is not None and main_loop.is_running():
            asyncio.run_coroutine_threadsafe(coro, main_loop)
            return

        # Strategy 3: run in a dedicated thread
        import threading

        def _run() -> None:
            try:
                asyncio.run(coro)
            except Exception:
                logger.debug("Background store write failed", exc_info=True)

        threading.Thread(target=_run, daemon=True).start()
