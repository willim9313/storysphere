"""N-08g 大腦測試（05 §6「大腦」那一列）。

開一個暫時 session，請大腦呼叫一次 `list_genre_elements`，以 `trace_calls` 有這筆為準；測完關掉。
session 需要一本書：取書庫裡最早的一本，沒有書時 `session` 這項不通過。
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select

from storysphere.api.errors import ApiError
from storysphere.gateway.service import Gateway
from storysphere.mcp.runtime import session_stream
from storysphere.store.agent import TraceCallRow
from storysphere.store.books import BookRow

PROBE_TOOL = "list_genre_elements"
PROBE_PROMPT = (
    f"Connectivity test: call the tool `{PROBE_TOOL}` exactly once, then reply with the single word OK."
)


def _check(check: str, ok: bool, detail: str) -> dict[str, Any]:
    return {"check": check, "ok": ok, "detail": detail}


def _last_error(gateway: Gateway, session_id: str) -> str:
    for event in reversed(gateway.env.bus.replay(session_stream(session_id), 0)):
        if event.type == "error":
            data = event.data.get("data", {})
            return f"{data.get('code')}: {data.get('message')}"
    return ""


async def run_brain_test(gateway: Gateway, backend: str) -> dict[str, Any]:
    async with gateway.session_factory() as db:
        book = await db.scalar(select(BookRow).order_by(BookRow.uploaded_at).limit(1))
    if book is None:
        return {"backend": backend, "checks": [_check("session", False, "需要書庫裡至少有一本書")]}
    try:
        row = await gateway.open(book=book, backend=backend, genre=None, model=None)
    except ApiError as err:
        return {"backend": backend, "checks": [_check("session", False, err.detail)]}
    checks: list[dict[str, Any]] = []
    try:
        if row.status != "ready":
            checks.append(_check("session", False, _last_error(gateway, row.id) or row.status))
            return {"backend": backend, "checks": checks}
        checks.append(_check("session", True, "session 已建立"))
        await gateway.send(row.id, PROBE_PROMPT)
        await gateway.wait_turn(row.id)
        async with gateway.session_factory() as db:
            called = await db.scalar(
                select(TraceCallRow.id).where(
                    TraceCallRow.session_id == row.id, TraceCallRow.tool == PROBE_TOOL
                )
            )
        detail = f"已呼叫 {PROBE_TOOL}" if called else (
            _last_error(gateway, row.id) or f"大腦沒有呼叫 {PROBE_TOOL}"
        )
        checks.append(_check("tool_call", called is not None, detail))
        return {"backend": backend, "checks": checks}
    finally:
        await gateway.close(row.id)
