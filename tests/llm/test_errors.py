"""失敗分類：429／額度、被拒絕、未設定、逾時。"""

from __future__ import annotations

import pytest
from storysphere.llm.errors import (
    LLMResponseBlocked,
    classify_step_failure,
    describe_exception,
    is_rate_limit_error,
    llm_text,
)
from storysphere.llm.router import LlmUnconfigured


class ResourceExhausted(Exception):
    pass


class TestIsRateLimitError:
    @pytest.mark.parametrize(
        "exc",
        [
            ResourceExhausted("boom"),
            RuntimeError("Error code: 429 - too many requests"),
            RuntimeError("You exceeded your current quota"),
            RuntimeError("Rate limit reached"),
        ],
    )
    def test_rate_limited(self, exc):
        assert is_rate_limit_error(exc)

    def test_plain_error_is_not(self):
        assert not is_rate_limit_error(ValueError("bad json"))


class TestClassifyStepFailure:
    def test_rate_limited(self):
        assert classify_step_failure(RuntimeError("429")) == "rate_limited"

    def test_rate_limited_in_cause(self):
        try:
            try:
                raise ResourceExhausted("x")
            except ResourceExhausted as inner:
                raise RuntimeError("call failed") from inner
        except RuntimeError as exc:
            assert classify_step_failure(exc) == "rate_limited"

    def test_blocked_wins_over_rate_limit_text(self):
        exc = LLMResponseBlocked("provider_blocked", "quota-looking detail 429")
        assert classify_step_failure(exc) == "blocked"

    def test_llm_unconfigured(self):
        assert classify_step_failure(LlmUnconfigured("core_extraction")) == "llm_unconfigured"

    def test_timeout(self):
        assert classify_step_failure(TimeoutError()) == "timeout"

    def test_other(self):
        assert classify_step_failure(ValueError("bad json")) == "other"


class TestDescribeException:
    def test_empty_message_falls_back_to_type_name(self):
        assert describe_exception(TimeoutError()) == "TimeoutError"

    def test_message(self):
        assert describe_exception(ValueError("bad json")) == "bad json"


class FakeResponse:
    def __init__(self, content, response_metadata=None) -> None:
        self.content = content
        self.response_metadata = response_metadata or {}


class TestLlmText:
    def test_string(self):
        assert llm_text(FakeResponse("hello")) == "hello"

    def test_list_blocks_join_text_and_strings(self):
        content = [
            {"type": "thinking", "thinking": "hmm"},
            {"type": "text", "text": "{\"a\": "},
            "1}",
        ]
        assert llm_text(FakeResponse(content)) == '{"a": 1}'

    @pytest.mark.parametrize("content", ["", "  \n", [], [{"type": "thinking", "thinking": "x"}], None])
    def test_empty_is_blocked(self, content):
        with pytest.raises(LLMResponseBlocked) as info:
            llm_text(FakeResponse(content))
        assert info.value.reason == "provider_empty"

    def test_block_reason(self):
        response = FakeResponse("", {"prompt_feedback": {"block_reason": "SAFETY"}})
        with pytest.raises(LLMResponseBlocked) as info:
            llm_text(response)
        assert (info.value.reason, info.value.detail) == ("provider_blocked", "SAFETY")
