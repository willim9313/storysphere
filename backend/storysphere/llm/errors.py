"""Classify a failed LLM step (02 §7).

搬自舊 repo `core/error_handling.py`：`rate_limited` 讓 job 轉 `paused_quota`，
`blocked` 不重試，其餘可重試。
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal

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


def raise_if_blocked(response: Any) -> None:
    """Raise if the provider reported refusing the prompt.

    搬自舊 repo。拒絕是確定性的（同一份 prompt 每次都被拒），所以和「空回應」分開：
    空回應可能是暫時的。
    """
    # 只在真的是 mapping 時才當 metadata 讀；duck-typed 物件的 .get() 會回傳另一個物件，
    # 不能當成拒絕原因。
    meta = getattr(response, "response_metadata", None)
    feedback = meta.get("prompt_feedback") if isinstance(meta, Mapping) else None
    reason = feedback.get("block_reason") if isinstance(feedback, Mapping) else None
    if reason is not None:
        # Gemini 回的是 enum；str() 會帶類別前綴，所以優先取 `.name`。
        raise LLMResponseBlocked(
            "provider_blocked", getattr(reason, "name", None) or str(reason)
        )


def llm_text(response: Any) -> str:
    """Return a response's text; raise `LLMResponseBlocked` when the provider gave none.

    `content` 可能是字串，也可能是 content blocks 的 list（取 `type == "text"` 的 `text`，
    以及純字串元素）。langchain_google_genai 在 prompt 被擋時不丟例外，只回空內容，
    所以空內容也要在這裡攔下來。
    """
    raise_if_blocked(response)

    content = getattr(response, "content", None)
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, Mapping) and block.get("type") == "text":
                value = block.get("text")
                if isinstance(value, str):
                    parts.append(value)
        text = "".join(parts)
    else:
        text = ""
    if not text.strip():
        raise LLMResponseBlocked("provider_empty")
    return text
