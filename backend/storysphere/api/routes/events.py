"""N-09c、N-09f：SSE 串流（04 §3.4）。"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Header, Query, Request
from fastapi.responses import StreamingResponse

from storysphere.api.deps import BookDep, EventBusDep, SessionDep
from storysphere.api.errors import not_found, validation_error
from storysphere.api.events import Event, EventBus, book_stream, job_stream
from storysphere.api.routes.jobs import TERMINAL_STATUSES
from storysphere.store.tables import Job

router = APIRouter(tags=["events"])

HEARTBEAT_SECONDS = 15.0
_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def frame(event: Event) -> str:
    lines = [] if event.seq is None else [f"id: {event.seq}"]
    lines += [f"event: {event.type}", f"data: {json.dumps(event.data, ensure_ascii=False)}"]
    return "\n".join(lines) + "\n\n"


def resume_point(after: int | None, last_event_id: str | None) -> int | None:
    """`?after=` 優先，其次 `Last-Event-ID` 標頭；都沒有＝只收即時事件。"""
    if after is not None:
        return after
    if last_event_id is None:
        return None
    try:
        return int(last_event_id)
    except ValueError as exc:
        raise validation_error("Last-Event-ID: not an event id issued by this API") from exc


async def _stream(
    request: Request,
    bus: EventBus,
    key: str,
    after: int | None,
    *,
    start_seq: int = 0,
    closing: Event | None = None,
) -> AsyncIterator[str]:
    """Replay, then live events with a heartbeat. ``closing`` set＝the job already ended."""
    events = bus.subscribe(key, after, start_seq=start_seq)
    next_event: asyncio.Future[Event] | None = None
    try:
        if closing is not None:
            # job 已經是終態：補完緩衝裡的，再送一次最後狀態就關（沒有新事件會來了）。
            replay = bus.replay(key, after, start_seq=start_seq)
            for event in replay:
                yield frame(event)
            if not any(_ends_job(event) for event in replay):
                yield frame(closing)
            return
        next_event = asyncio.ensure_future(anext(events))
        while True:
            done, _ = await asyncio.wait({next_event}, timeout=HEARTBEAT_SECONDS)
            if await request.is_disconnected():
                return
            if not done:
                yield ": ping\n\n"
                continue
            event = next_event.result()
            yield frame(event)
            if key.startswith("job:") and _ends_job(event):
                return
            next_event = asyncio.ensure_future(anext(events))
    finally:
        # 斷線時串流在等下一筆事件的途中被取消：先收掉那個等待，才能關掉訂閱。
        if next_event is not None and not next_event.done():
            next_event.cancel()
            await asyncio.gather(next_event, return_exceptions=True)
        await events.aclose()


def _ends_job(event: Event) -> bool:
    return event.type == "job.status" and event.data.get("status") in TERMINAL_STATUSES


@router.get("/jobs/{job_id}/events")
async def job_events(
    job_id: str,
    request: Request,
    session: SessionDep,
    bus: EventBusDep,
    after: Annotated[int | None, Query(ge=0)] = None,
    last_event_id: Annotated[str | None, Header()] = None,
) -> StreamingResponse:
    """N-09c 單一 job 的事件；job 進入終態後送最後一個 `job.status` 並關閉。"""
    job = await session.get(Job, job_id)
    if job is None:
        raise not_found("Job", job_id)
    point = resume_point(after, last_event_id)
    closing = None
    if job.status in TERMINAL_STATUSES:
        closing = Event(
            None,
            "job.status",
            {
                "jobId": job.id,
                "kind": job.kind,
                "status": job.status,
                "progress": job.progress,
                "stage": job.stage,
                "errorKind": job.error_kind,
            },
        )
    return StreamingResponse(
        _stream(request, bus, job_stream(job_id), point, start_seq=job.last_seq, closing=closing),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.get("/books/{book_id}/events")
async def book_events(
    book: BookDep,
    request: Request,
    bus: EventBusDep,
    after: Annotated[int | None, Query(ge=0)] = None,
    last_event_id: Annotated[str | None, Header()] = None,
) -> StreamingResponse:
    """N-09f 整本書的事件：該書所有 job 的事件。不會自己結束。"""
    return StreamingResponse(
        _stream(request, bus, book_stream(book.id), resume_point(after, last_event_id)),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
