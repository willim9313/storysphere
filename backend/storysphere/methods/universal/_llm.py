"""通用層方法共用的 LLM 小工具：帶重試的 JSON 呼叫、由事件文字判斷書的語言。

重試的精神沿用 `ingest/unit_runner.MAX_ATTEMPTS`：429 不重試、直接往外丟（引擎會分類成
`rate_limited`）；被擋與未設定不重試；其餘（含解析失敗）最多試 `MAX_ATTEMPTS` 次，仍失敗就丟出最後的例外。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Sequence
from typing import Any, TypeVar

from langchain_core.messages import HumanMessage, SystemMessage

from storysphere.ingest.language_detection import detect_language, get_language_display_name
from storysphere.ingest.unit_runner import MAX_ATTEMPTS
from storysphere.llm.errors import classify_step_failure, describe_exception, llm_text
from storysphere.llm.json_output import extract_json_from_text

logger = logging.getLogger(__name__)

# 兩次重試之間等多久（秒）；測試把它改成 0。
RETRY_DELAY_S = 2.0

# 方法內彼此獨立的 LLM 呼叫（EV2 的各窗、EV1 的各邊界事件）同時最多幾個在跑。
LLM_CONCURRENCY = 6

T = TypeVar("T")


class LlmOutputError(ValueError):
    """The model answered, but not in the shape the prompt asked for."""


def book_language(texts: Sequence[str]) -> str:
    """書的語言代碼：由事件描述的前段文字判斷（方法不讀原文，只讀證據）。"""
    return detect_language("\n".join(texts))


def language_display_name(texts: Sequence[str]) -> str:
    return get_language_display_name(book_language(texts))


async def ainvoke_json(
    llm: Any,
    system: str,
    user: str,
    parse: Callable[[Any], T],
    *,
    label: str,
) -> T:
    """Call the model; `parse(json_value)` raises `LlmOutputError` for unusable output → retry."""
    messages = [SystemMessage(system), HumanMessage(user)]
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            text = llm_text(await llm.ainvoke(messages))
            value, error = extract_json_from_text(text)
            if value is None:
                raise LlmOutputError(f"{label}: no JSON in the answer ({error})")
            return parse(value)
        except Exception as exc:
            kind = classify_step_failure(exc)
            if kind in ("rate_limited", "blocked", "llm_unconfigured") or attempt == MAX_ATTEMPTS:
                raise
            logger.warning("%s attempt %d failed: %s", label, attempt, describe_exception(exc))
            if RETRY_DELAY_S:
                await asyncio.sleep(RETRY_DELAY_S)
    raise AssertionError("unreachable")  # pragma: no cover


async def gather_limited(
    factories: Sequence[Callable[[], Awaitable[T]]], limit: int = LLM_CONCURRENCY
) -> list[T]:
    """Run the awaitables the factories create, at most `limit` at a time; results keep input order.

    One failure cancels the rest, waits for them to finish, then re-raises. With several errors at
    once a rate-limit error wins (the engine turns it into `paused_quota`), else the first one in
    input order. Never raises an `ExceptionGroup`.
    """
    if limit < 1:
        raise ValueError("limit must be at least 1")
    semaphore = asyncio.Semaphore(limit)
    failed = False

    async def guarded(factory: Callable[[], Awaitable[T]]) -> T:
        nonlocal failed
        async with semaphore:
            if failed:  # 別的呼叫已失敗：排隊中的不要再開始（省掉白花的 LLM 呼叫）
                raise asyncio.CancelledError
            try:
                return await factory()
            except Exception:
                failed = True
                raise

    tasks = [asyncio.ensure_future(guarded(f)) for f in factories]
    if not tasks:
        return []
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
    finally:
        for task in tasks:
            task.cancel()  # no-op for finished tasks
        await asyncio.gather(*tasks, return_exceptions=True)
    errors = [t.exception() for t in tasks if not t.cancelled() and t.exception() is not None]
    if errors:
        raise next((e for e in errors if classify_step_failure(e) == "rate_limited"), errors[0])
    return [t.result() for t in tasks]


def items_of(value: Any) -> list[Any]:
    """The `items` list of an answer (`{"items": [...]}` or a bare list); anything else is an error."""
    items = value.get("items") if isinstance(value, dict) else value
    if not isinstance(items, list):
        raise LlmOutputError("answer has no 'items' list")
    return items


def clamp_unit(value: Any) -> float | None:
    """A number in [0, 1] (clamped); None if it is not a real number."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return min(1.0, max(0.0, float(value)))
