"""Classify a failed LLM step (02 §7).

搬自舊 repo `core/error_handling.py`：`rate_limited` 讓 job 轉 `paused_quota`，
`blocked` 不重試，其餘可重試。
"""

from __future__ import annotations

from typing import Literal

from storysphere.llm.router import LlmUnconfigured

StepErrorKind = Literal["rate_limited", "llm_unconfigured", "blocked", "timeout", "other"]


class LLMResponseBlocked(Exception):
    """The provider refused the prompt, or returned nothing at all.

    刻意不是 `ValueError`／`KeyError`：拒絕是確定性的，同一份 prompt 重試只會再被拒一次。
    """

    def __init__(
        self,
        reason: Literal["provider_blocked", "provider_empty"],
        detail: str = "",
    ) -> None:
        self.reason = reason
        self.detail = detail
        if reason == "provider_blocked":
            message = f"LLM provider blocked the prompt ({detail}); no content was returned."
        else:
            message = "LLM provider returned an empty response with no reason given."
        super().__init__(message)


_RATE_LIMIT_TYPE_SIGNALS = (
    "ratelimit",
    "resourceexhausted",
    "quotaexceeded",
    "toomanyrequests",
    "overloaded",
)
_RATE_LIMIT_TEXT_SIGNALS = ("429", "rate limit", "quota", "resource exhausted", "overloaded")


def is_rate_limit_error(exc: BaseException) -> bool:
    """True for a rate-limit / quota-exhausted error from any provider."""
    type_name = type(exc).__name__.lower()
    text = str(exc).lower()
    return any(s in type_name for s in _RATE_LIMIT_TYPE_SIGNALS) or any(
        s in text for s in _RATE_LIMIT_TEXT_SIGNALS
    )


def _exception_chain(exc: BaseException) -> list[BaseException]:
    chain: list[BaseException] = []
    seen: set[int] = set()
    cur: BaseException | None = exc
    while cur is not None and id(cur) not in seen:
        chain.append(cur)
        seen.add(id(cur))
        cur = cur.__cause__ or cur.__context__
    return chain


def classify_step_failure(exc: BaseException) -> StepErrorKind:
    """Kind of a failed ingestion/method step."""
    chain = _exception_chain(exc)
    if any(isinstance(e, LLMResponseBlocked) for e in chain):
        return "blocked"
    if any(isinstance(e, LlmUnconfigured) for e in chain):
        return "llm_unconfigured"
    if any(is_rate_limit_error(e) for e in chain):
        return "rate_limited"
    if any(isinstance(e, TimeoutError) for e in chain):
        return "timeout"
    return "other"


def describe_exception(exc: BaseException) -> str:
    """`str(exc)`, or the type name when that is empty (e.g. `TimeoutError()`)."""
    return str(exc) or type(exc).__name__
