from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal


class LLMResponseBlocked(Exception):
    """The provider refused the prompt, or returned nothing at all.

    Deliberately not a ``ValueError`` or ``KeyError``: several services retry
    those, and a refusal is deterministic — the same prompt is refused every
    time, so a retry spends a call to be told the same thing.
    """

    def __init__(
        self,
        reason: Literal["provider_blocked", "provider_empty"],
        detail: str = "",
    ) -> None:
        self.reason = reason
        self.detail = detail
        if reason == "provider_blocked":
            message = (
                f"LLM provider blocked the prompt ({detail}); no content was "
                f"returned. This is deterministic — retrying the same prompt "
                f"will be blocked again."
            )
        else:
            message = (
                "LLM provider returned an empty response with no reason given."
            )
        super().__init__(message)


def raise_if_blocked(response: Any) -> None:
    """Raise if the provider reported refusing the prompt.

    Split out from :func:`llm_text` because the two failures differ in kind. A
    block is deterministic — the same prompt is refused every time, so retrying
    only spends another call. An empty response with no reason given may well be
    transient, and a caller that retries it (``SummaryService`` does) is right
    to. Callers that only want the deterministic half use this.
    """
    # Only read these as metadata if they really are mappings. Providers differ
    # in what they attach, and a duck-typed object that answers .get() with
    # another object would otherwise be read as a block reason.
    meta = getattr(response, "response_metadata", None)
    feedback = meta.get("prompt_feedback") if isinstance(meta, Mapping) else None
    reason = feedback.get("block_reason") if isinstance(feedback, Mapping) else None
    if reason is not None:
        # An enum on the Gemini path — str() would carry the class prefix
        # ("BlockedReason.PROHIBITED_CONTENT") into whatever displays it.
        raise LLMResponseBlocked(
            "provider_blocked", getattr(reason, "name", None) or str(reason)
        )


def llm_text(response: Any) -> str:
    """Return a response's text, raising when the provider gave none.

    ``langchain_google_genai`` does not raise when Gemini blocks a prompt — it
    logs a warning and hands back an ``AIMessage`` with empty content. The
    refusal is therefore invisible both to the caller and to ``with_fallbacks``,
    which only switches provider on a raised exception.

    Every analysis path used to read ``response.content`` directly and pass it
    to ``extract_json_from_text``, so a refusal surfaced as ``no_json_found`` —
    a message about the JSON extractor, which had done nothing wrong. That cost
    a backlog entry and an investigation aimed at the wrong file (B-073).

    ``prompt_feedback`` is Gemini's; the empty-content check is the generic net
    that catches the same shape from any other provider.
    """
    raise_if_blocked(response)

    content = getattr(response, "content", None)
    if not isinstance(content, str) or not content.strip():
        raise LLMResponseBlocked("provider_empty")
    return content


def is_rate_limit_error(exc: Exception) -> bool:
    """Return True if exc is a rate-limit / quota-exhausted error from any LLM provider.

    Covers Gemini (ResourceExhausted), OpenAI (RateLimitError),
    Anthropic (RateLimitError / OverloadedError), and LangChain wrappers.
    """
    type_name = type(exc).__name__.lower()
    cause_name = type(exc.__cause__).__name__.lower() if exc.__cause__ else ""
    err_str = str(exc).lower()
    signals = ("ratelimit", "resourceexhausted", "quotaexceeded", "toomanyrequests", "overloaded")
    return (
        any(s in type_name for s in signals)
        or any(s in cause_name for s in signals)
        or "429" in err_str
        or "rate limit" in err_str
        or "quota" in err_str
        or "resource exhausted" in err_str
        or "overloaded" in err_str
    )
