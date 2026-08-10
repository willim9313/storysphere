"""Provider refusals must be named, not mistaken for malformed JSON (B-076).

langchain_google_genai does not raise when Gemini blocks a prompt — it logs a
warning and returns an AIMessage with empty content. Every analysis path used to
read .content directly and hand it to extract_json_from_text, so a refusal
surfaced as ``no_json_found``: a complaint about the JSON extractor, which had
done nothing wrong.
"""

from __future__ import annotations

from enum import Enum
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from storysphere.core.error_handling import (
    LLMResponseBlocked,
    llm_text,
    raise_if_blocked,
)


class _BlockReason(Enum):
    """google.genai hands back an enum, not a string."""

    PROHIBITED_CONTENT = "PROHIBITED_CONTENT"


def _blocked(reason=_BlockReason.PROHIBITED_CONTENT):
    return SimpleNamespace(
        content="",
        response_metadata={"prompt_feedback": {"block_reason": reason}},
    )


class TestLlmText:
    def test_returns_content_when_the_provider_answered(self):
        assert llm_text(SimpleNamespace(content='{"a": 1}')) == '{"a": 1}'

    def test_a_block_raises_rather_than_reaching_the_json_extractor(self):
        with pytest.raises(LLMResponseBlocked) as exc:
            llm_text(_blocked())
        assert exc.value.reason == "provider_blocked"
        assert "no_json_found" not in str(exc.value)

    def test_the_enum_is_unwrapped_to_its_name(self):
        # str() would yield "_BlockReason.PROHIBITED_CONTENT" — the class prefix
        # travels all the way to whatever displays the detail.
        with pytest.raises(LLMResponseBlocked) as exc:
            llm_text(_blocked())
        assert exc.value.detail == "PROHIBITED_CONTENT"

    def test_a_plain_string_reason_also_works(self):
        with pytest.raises(LLMResponseBlocked) as exc:
            llm_text(_blocked("SAFETY"))
        assert exc.value.detail == "SAFETY"

    @pytest.mark.parametrize("content", ["", "   ", "\n\t"])
    def test_empty_content_is_reported_as_such(self, content):
        with pytest.raises(LLMResponseBlocked) as exc:
            llm_text(SimpleNamespace(content=content))
        assert exc.value.reason == "provider_empty"

    def test_not_a_ValueError_so_retry_policies_leave_it_alone(self):
        # Several services retry ValueError/KeyError. A refusal is deterministic,
        # so retrying spends a call to be told exactly the same thing.
        with pytest.raises(LLMResponseBlocked) as exc:
            llm_text(_blocked())
        assert not isinstance(exc.value, ValueError | KeyError)

    def test_metadata_that_is_not_a_mapping_is_ignored(self):
        # A MagicMock answers .get() with another MagicMock, which is not None —
        # read naively that is indistinguishable from a block reason, and it
        # would fail every test in the suite that mocks an LLM this way.
        response = MagicMock()
        response.content = '{"ok": true}'
        assert llm_text(response) == '{"ok": true}'


class TestRaiseIfBlocked:
    """The deterministic half on its own, for callers that retry empties."""

    def test_raises_on_a_block(self):
        with pytest.raises(LLMResponseBlocked):
            raise_if_blocked(_blocked())

    def test_says_nothing_about_empty_content(self):
        # SummaryService relies on this: its own empty-summary ValueError is
        # retryable on purpose, because an unexplained empty response may be
        # transient in a way a refusal never is.
        assert raise_if_blocked(SimpleNamespace(content="")) is None
