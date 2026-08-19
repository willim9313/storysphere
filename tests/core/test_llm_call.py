"""Tests for the shared LLM call shape: retry policy and `call_llm`."""

from __future__ import annotations

import asyncio
import inspect
from unittest.mock import AsyncMock, MagicMock

import pytest

from storysphere.core.error_handling import LLMResponseBlocked
from storysphere.core.llm_call import (
    RETRYABLE,
    LLM_RETRY,
    call_llm,
    llm_retry,
)
from storysphere.core.token_callback import (
    get_llm_service_context,
    set_llm_book_context,
    set_llm_service_context,
)


@pytest.fixture(autouse=True)
def _clear_context():
    """Attribution lives in contextvars; keep tests from leaking into each other."""
    set_llm_service_context("unset")
    set_llm_book_context(None)
    yield
    set_llm_service_context("unset")
    set_llm_book_context(None)


def _fake_llm(text="ok"):
    """A stand-in chat model whose `ainvoke` returns an AIMessage-ish object."""
    llm = MagicMock()
    response = MagicMock()
    response.content = text
    llm.ainvoke = AsyncMock(return_value=response)
    return llm


class TestRetryablePolicy:
    def test_default_set_is_value_and_key_error(self):
        assert RETRYABLE == (ValueError, KeyError)

    def test_blocked_response_is_outside_the_retryable_set(self):
        """B-073: a policy refusal is permanent, so retrying it burns three calls.

        The guard is that `LLMResponseBlocked` does not inherit from anything
        in RETRYABLE. If someone ever makes it a ValueError subclass, blocked
        symbols silently go back to costing 3x.
        """
        assert not issubclass(LLMResponseBlocked, RETRYABLE)

    def test_retries_three_times_then_reraises(self):
        calls = []

        @llm_retry(max_wait=0, min_wait=0)
        async def flaky():
            calls.append(1)
            raise ValueError("nope")

        with pytest.raises(ValueError):
            asyncio.run(flaky())
        assert len(calls) == 3

    def test_stops_retrying_once_it_succeeds(self):
        calls = []

        @LLM_RETRY
        async def recovers():
            calls.append(1)
            if len(calls) < 2:
                raise KeyError("missing")
            return "done"

        assert asyncio.run(recovers()) == "done"
        assert len(calls) == 2

    def test_exception_outside_the_set_is_not_retried(self):
        calls = []

        @llm_retry(ValueError)
        async def blocked():
            calls.append(1)
            raise LLMResponseBlocked("prohibited")

        with pytest.raises(LLMResponseBlocked):
            asyncio.run(blocked())
        assert len(calls) == 1

    def test_reraise_false_wraps_in_retry_error(self):
        from tenacity import RetryError

        @llm_retry(min_wait=0, max_wait=0, reraise=False)
        async def always_fails():
            raise ValueError("nope")

        with pytest.raises(RetryError):
            asyncio.run(always_fails())

    def test_shared_decorator_does_not_share_attempt_state(self):
        """Two functions wearing the same decorator object must be independent.

        `LLM_RETRY` is a module-level singleton applied at nine call sites; if
        tenacity reused one Retrying across them, a failure in one service
        would eat another service's attempts.
        """
        first_calls, second_calls = [], []

        @LLM_RETRY
        async def first():
            first_calls.append(1)
            if len(first_calls) < 3:
                raise ValueError()
            return "first"

        @LLM_RETRY
        async def second():
            second_calls.append(1)
            return "second"

        assert asyncio.run(first()) == "first"
        assert asyncio.run(second()) == "second"
        assert len(first_calls) == 3
        assert len(second_calls) == 1


class TestCallLlmSignature:
    def test_book_id_is_required(self):
        """The whole point of the helper: attribution cannot be forgotten.

        If `book_id` ever grows a default, every call site silently reverts to
        the old "hope someone upstream set it" behaviour.
        """
        param = inspect.signature(call_llm).parameters["book_id"]
        assert param.default is inspect.Parameter.empty
        assert param.kind is inspect.Parameter.KEYWORD_ONLY

    def test_all_context_arguments_are_keyword_only(self):
        sig = inspect.signature(call_llm)
        positional = [
            n
            for n, p in sig.parameters.items()
            if p.kind is inspect.Parameter.POSITIONAL_OR_KEYWORD
        ]
        assert positional == ["llm"]


class TestCallLlm:
    @pytest.mark.asyncio
    async def test_returns_response_text(self):
        llm = _fake_llm("the answer")
        out = await call_llm(
            llm, system="sys", human="hum", service="analysis", book_id="book-1"
        )
        assert out == "the answer"

    @pytest.mark.asyncio
    async def test_sends_system_then_human(self):
        llm = _fake_llm()
        await call_llm(
            llm, system="SYS", human="HUM", service="analysis", book_id=None
        )
        (messages,), _ = llm.ainvoke.call_args
        assert [type(m).__name__ for m in messages] == ["SystemMessage", "HumanMessage"]
        assert [m.content for m in messages] == ["SYS", "HUM"]

    @pytest.mark.asyncio
    async def test_sets_attribution_before_invoking(self):
        seen = {}

        llm = MagicMock()

        async def _capture(_messages):
            seen["ctx"] = get_llm_service_context()
            response = MagicMock()
            response.content = "ok"
            return response

        llm.ainvoke = _capture
        await call_llm(
            llm, system="s", human="h", service="extraction", book_id="book-9"
        )
        assert seen["ctx"] == ("extraction", "book-9")

    @pytest.mark.asyncio
    async def test_none_book_id_inherits_an_outer_attribution(self):
        """Ingestion sets the book once at the top and lets services below inherit."""
        set_llm_service_context("ingestion", book_id="book-outer")
        llm = _fake_llm()
        await call_llm(llm, system="s", human="h", service="summary", book_id=None)
        service, book_id = get_llm_service_context()
        assert (service, book_id) == ("summary", "book-outer")

    @pytest.mark.asyncio
    async def test_explicit_book_id_overrides_an_outer_one(self):
        set_llm_service_context("ingestion", book_id="book-outer")
        llm = _fake_llm()
        await call_llm(llm, system="s", human="h", service="analysis", book_id="book-inner")
        assert get_llm_service_context() == ("analysis", "book-inner")

    @pytest.mark.asyncio
    async def test_blocked_response_raises_rather_than_returning_empty(self):
        """`llm_text` is what turns a provider block into an exception (B-073)."""
        llm = MagicMock()
        response = MagicMock()
        response.content = ""
        response.response_metadata = {}
        llm.ainvoke = AsyncMock(return_value=response)
        with pytest.raises(LLMResponseBlocked):
            await call_llm(
                llm, system="s", human="h", service="analysis", book_id="book-1"
            )

    @pytest.mark.asyncio
    async def test_on_context_set_runs_after_context_and_before_invoke(self):
        order = []

        llm = MagicMock()

        async def _invoke(_messages):
            order.append(("invoke", get_llm_service_context()))
            response = MagicMock()
            response.content = "ok"
            return response

        llm.ainvoke = _invoke

        def _hook():
            order.append(("hook", get_llm_service_context()))

        await call_llm(
            llm,
            system="s",
            human="h",
            service="keyword",
            book_id="book-2",
            on_context_set=_hook,
        )
        assert [step for step, _ in order] == ["hook", "invoke"]
        assert order[0][1] == ("keyword", "book-2")

    @pytest.mark.asyncio
    async def test_no_hook_is_fine(self):
        llm = _fake_llm("x")
        assert (
            await call_llm(
                llm, system="s", human="h", service="analysis", book_id="b"
            )
            == "x"
        )


class TestNoTracingInTheSharedPath:
    def test_call_llm_is_not_decorated(self):
        """Tracing stays owned by call sites — see core/tracing.py.

        A `@observe` here would make every LLM call a span named after this
        function, and would put langfuse on the execution path of every
        service rather than leaving it optional.
        """
        assert call_llm.__module__ == "storysphere.core.llm_call"
        assert call_llm.__qualname__ == "call_llm"
        assert not hasattr(call_llm, "__wrapped__")

    def test_module_imports_neither_langfuse_nor_tracing(self):
        import ast

        import storysphere.core.llm_call as mod

        tree = ast.parse(inspect.getsource(mod))
        imported = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module)
            elif isinstance(node, ast.Import):
                imported.update(a.name for a in node.names)
        assert not any(
            name.startswith("langfuse") or name.endswith("core.tracing")
            for name in imported
        ), f"tracing leaked into the shared LLM path: {sorted(imported)}"
