"""Tests for TokenTrackingHandler (src/core/token_callback.py)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from core.token_callback import (
    TokenTrackingHandler,
    get_llm_service_context,
    set_llm_service_context,
)


# ---------------------------------------------------------------------------
# contextvars helpers
# ---------------------------------------------------------------------------


class TestServiceContext:
    def test_default(self):
        # Reset to default by setting unknown
        set_llm_service_context("unknown")
        service, book_id = get_llm_service_context()
        assert service == "unknown"

    def test_set_and_get(self):
        set_llm_service_context("analysis", book_id="book-42")
        service, book_id = get_llm_service_context()
        assert service == "analysis"
        assert book_id == "book-42"

    def test_set_without_book_id(self):
        set_llm_service_context("chat")
        service, _ = get_llm_service_context()
        assert service == "chat"


# ---------------------------------------------------------------------------
# Token extraction
# ---------------------------------------------------------------------------


def _make_response_with_usage_metadata(input_t=100, output_t=50, total_t=150):
    """Build a mock LLMResult with usage_metadata on the AIMessage."""
    usage_meta = MagicMock()
    usage_meta.input_tokens = input_t
    usage_meta.output_tokens = output_t
    usage_meta.total_tokens = total_t

    msg = MagicMock()
    msg.usage_metadata = usage_meta

    gen = MagicMock()
    gen.message = msg

    response = MagicMock()
    response.generations = [[gen]]
    response.llm_output = None
    return response


def _make_response_with_llm_output(prompt=200, completion=80, total=280):
    """Build a mock LLMResult with token_usage in llm_output."""
    gen = MagicMock()
    gen.message = None

    response = MagicMock()
    response.generations = [[gen]]
    response.llm_output = {
        "token_usage": {
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "total_tokens": total,
        }
    }
    return response


def _make_empty_response():
    """Build a mock LLMResult with no token info."""
    gen = MagicMock()
    gen.message = None

    response = MagicMock()
    response.generations = [[gen]]
    response.llm_output = {}
    return response


class TestTokenExtraction:
    def test_extract_from_usage_metadata(self):
        response = _make_response_with_usage_metadata(100, 50, 150)
        prompt, completion, total = TokenTrackingHandler._extract_tokens(response)
        assert (prompt, completion, total) == (100, 50, 150)

    def test_extract_from_llm_output(self):
        response = _make_response_with_llm_output(200, 80, 280)
        prompt, completion, total = TokenTrackingHandler._extract_tokens(response)
        assert (prompt, completion, total) == (200, 80, 280)

    def test_extract_fallback_zeros(self):
        response = _make_empty_response()
        prompt, completion, total = TokenTrackingHandler._extract_tokens(response)
        assert (prompt, completion, total) == (0, 0, 0)


# ---------------------------------------------------------------------------
# on_llm_end / on_llm_error
# ---------------------------------------------------------------------------


class TestOnLlmEnd:
    @patch("core.metrics.get_metrics")
    def test_records_metrics(self, mock_get_metrics):
        mock_metrics = MagicMock()
        mock_get_metrics.return_value = mock_metrics

        handler = TokenTrackingHandler(provider="gemini", model="gemini-2.0-flash")
        run_id = uuid4()

        set_llm_service_context("summary")
        handler.on_llm_start({}, ["test"], run_id=run_id)
        response = _make_response_with_usage_metadata(100, 50, 150)
        handler.on_llm_end(response, run_id=run_id)

        mock_metrics.record_llm_call.assert_called_once()
        call_kw = mock_metrics.record_llm_call.call_args
        assert call_kw.kwargs["provider"] == "gemini"
        assert call_kw.kwargs["model"] == "gemini-2.0-flash"
        assert call_kw.kwargs["prompt_tokens"] == 100
        assert call_kw.kwargs["success"] is True

    @patch("core.metrics.get_metrics")
    def test_on_llm_error_records_failure(self, mock_get_metrics):
        mock_metrics = MagicMock()
        mock_get_metrics.return_value = mock_metrics

        handler = TokenTrackingHandler(provider="openai", model="gpt-4o-mini")
        run_id = uuid4()

        set_llm_service_context("chat")
        handler.on_llm_start({}, ["test"], run_id=run_id)
        handler.on_llm_error(RuntimeError("rate limit"), run_id=run_id)

        mock_metrics.record_llm_call.assert_called_once()
        call_kw = mock_metrics.record_llm_call.call_args
        assert call_kw.kwargs["success"] is False
        assert call_kw.kwargs["error"] == "RuntimeError"


class TestStoreScheduling:
    @pytest.mark.asyncio
    async def test_schedules_store_write(self):
        mock_store = AsyncMock()
        handler = TokenTrackingHandler(
            provider="gemini", model="gemini-2.0-flash", token_store=mock_store
        )
        run_id = uuid4()

        set_llm_service_context("analysis")

        with patch("core.metrics.get_metrics") as mock_gm:
            mock_gm.return_value = MagicMock()
            handler.on_llm_start({}, ["test"], run_id=run_id)
            response = _make_response_with_usage_metadata(300, 100, 400)
            handler.on_llm_end(response, run_id=run_id)

        # Allow the created task to run
        import asyncio
        await asyncio.sleep(0.05)

        mock_store.record.assert_called_once()
        call_kw = mock_store.record.call_args
        assert call_kw.kwargs["provider"] == "gemini"
        assert call_kw.kwargs["total_tokens"] == 400

    def test_no_store_no_error(self):
        """Handler without token_store should not raise."""
        handler = TokenTrackingHandler(provider="gemini", model="gemini-2.0-flash")
        run_id = uuid4()

        with patch("core.metrics.get_metrics") as mock_gm:
            mock_gm.return_value = MagicMock()
            handler.on_llm_start({}, ["test"], run_id=run_id)
            response = _make_response_with_usage_metadata()
            handler.on_llm_end(response, run_id=run_id)
        # Should not raise
