"""N-10a–k：Agent Gateway（04 §4.10）。

邏輯都在 `gateway/service.Gateway`；這裡只做驗證與形狀。session token 不回給 UI。
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from storysphere.api.deps import BookDep, EventBusDep, PagingDep, SessionDep
from storysphere.api.errors import ApiError, not_found
from storysphere.api.routes.books import effective_genre
from storysphere.api.routes.events import _SSE_HEADERS, _stream, resume_point
from storysphere.api.schemas.agent import (
    ApprovalIn,
    MessageIn,
    NoteDraft,
    SessionDetail,
    SessionIn,
    SessionListItem,
    SessionOut,
    TraceItem,
    TracePage,
    TurnOut,
)
from storysphere.api.schemas.common import next_cursor
from storysphere.gateway.service import PERMISSION_LEVEL, Gateway
from storysphere.mcp.runtime import session_stream
from storysphere.store.agent import AgentSessionRow, TraceCallRow
from storysphere.store.books import BookRow

router = APIRouter(tags=["agent"])


def get_gateway(request: Request) -> Gateway:
    gateway = getattr(request.app.state, "gateway", None)
    if gateway is None:
        raise ApiError(503, "gateway_unavailable", "Agent gateway is not running.")
    return gateway


GatewayDep = Annotated[Gateway, Depends(get_gateway)]


def _out(row: AgentSessionRow) -> SessionOut:
    return SessionOut(
        session_id=row.id,
        backend=row.backend,
        book_id=row.book_id,
        genre=row.genre,
        model=row.model,
        skills=row.skills,
        allowed_tools=row.allowed_tools,
        permission_level=PERMISSION_LEVEL,
        status=row.status,
    )


@router.post("/agent/sessions", status_code=201)
async def open_session(body: SessionIn, session: SessionDep, gateway: GatewayDep) -> SessionOut:
    """N-10a 開 session；claude-code 啟動失敗仍回 201，`status=error`，原因走 SSE。"""
    book = await session.get(BookRow, body.book_id)
    if book is None:
        raise not_found("Book", body.book_id)
    genre = body.genre or effective_genre(book)
    model = body.model if body.backend == "deepagents" else None
    row = await gateway.open(book=book, backend=body.backend, genre=genre, model=model)
    return _out(row)


@router.get("/books/{book_id}/agent/sessions")
async def list_sessions(book: BookDep, session: SessionDep) -> list[SessionListItem]:
    """N-10b 這本書的 session，新到舊。"""
    rows = await session.scalars(
        select(AgentSessionRow)
        .where(AgentSessionRow.book_id == book.id)
        .order_by(AgentSessionRow.created_at.desc())
    )
    return [
        SessionListItem(
            session_id=row.id,
            backend=row.backend,
            model=row.model,
            status=row.status,
            created_at=row.created_at,
            open_draft_count=sum(1 for d in row.drafts_json if d.get("state") == "open"),
        )
        for row in rows
    ]


@router.get("/agent/sessions/{session_id}")
async def get_session(
    session_id: str, gateway: GatewayDep, bus: EventBusDep
) -> SessionDetail:
    """N-10c 設定、狀態、對話旁白。"""
    row = await gateway.get(session_id)
    return SessionDetail(
        **_out(row).model_dump(),
        messages=row.messages_json,
        last_seq=bus.last_seq(session_stream(session_id)),
    )


@router.post("/agent/sessions/{session_id}/messages", status_code=202)
async def send_message(session_id: str, body: MessageIn, gateway: GatewayDep) -> TurnOut:
    """N-10d 送訊息；回覆走 N-10e。"""
    return TurnOut(turn_id=await gateway.send(session_id, body.text))


@router.get("/agent/sessions/{session_id}/events")
async def session_events(
    session_id: str,
    request: Request,
    gateway: GatewayDep,
    bus: EventBusDep,
    after: Annotated[int | None, Query(ge=0)] = None,
    last_event_id: Annotated[str | None, Header()] = None,
) -> StreamingResponse:
    """N-10e AgentEvent 的 SSE（§5.1）；補抓規則同 §3.4。"""
    await gateway.get(session_id)
    point = resume_point(after, last_event_id)
    return StreamingResponse(
        _stream(request, bus, session_stream(session_id), point),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post("/agent/sessions/{session_id}/approvals/{request_id}", status_code=204)
async def resolve_approval(
    session_id: str, request_id: str, body: ApprovalIn, gateway: GatewayDep
) -> Response:
    """N-10f 回應 `approval_request`。"""
    await gateway.resolve_approval(session_id, request_id, body.allow)
    return Response(status_code=204)


@router.post("/agent/sessions/{session_id}/cancel", status_code=204)
async def cancel_turn(session_id: str, gateway: GatewayDep) -> Response:
    """N-10g 中止這一輪（不關 session、不取消已送出的 job）。"""
    await gateway.cancel(session_id)
    return Response(status_code=204)


@router.delete("/agent/sessions/{session_id}", status_code=204)
async def close_session(session_id: str, gateway: GatewayDep) -> Response:
    """N-10h 關閉；session 與 trace 保留。"""
    await gateway.close(session_id)
    return Response(status_code=204)


@router.get("/agent/sessions/{session_id}/trace")
async def get_trace(
    session_id: str, session: SessionDep, gateway: GatewayDep, paging: PagingDep
) -> TracePage:
    """N-10i 工具呼叫紀錄，依 seq。"""
    await gateway.get(session_id)
    where = TraceCallRow.session_id == session_id
    total = await session.scalar(select(func.count()).select_from(TraceCallRow).where(where)) or 0
    rows = list(
        await session.scalars(
            select(TraceCallRow)
            .where(where)
            .order_by(TraceCallRow.seq)
            .offset(paging.offset)
            .limit(paging.limit)
        )
    )
    items = [
        TraceItem(
            seq=row.seq,
            turn_id=row.turn_id,
            tool=row.tool,
            args=row.args_json,
            status=row.status,
            result_evidence_ids=row.result_evidence_ids,
            result_run_ids=row.result_run_ids,
            job_id=row.job_id,
            approval_request_id=row.approval_request_id,
            error_code=row.error_code,
            started_at=row.started_at,
            duration_ms=row.duration_ms,
        )
        for row in rows
    ]
    return TracePage(
        items=items, next_cursor=next_cursor(paging.offset, len(items), total), total=total
    )


@router.get("/agent/sessions/{session_id}/drafts")
async def list_drafts(session_id: str, gateway: GatewayDep) -> list[NoteDraft]:
    """N-10j 本 session 的筆記草稿。"""
    row = await gateway.get(session_id)
    return [NoteDraft.model_validate(draft) for draft in row.drafts_json]


@router.delete("/agent/sessions/{session_id}/drafts/{draft_id}", status_code=204)
async def discard_draft(session_id: str, draft_id: str, gateway: GatewayDep) -> Response:
    """N-10k 草稿卡的「捨棄」。"""
    await gateway.discard_draft(session_id, draft_id)
    return Response(status_code=204)
