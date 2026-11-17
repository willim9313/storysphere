"""FastAPI dependencies: everything is read from ``app.state`` (set up in ``main.lifespan``)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.api.errors import ApiError, not_found
from storysphere.api.events import EventBus
from storysphere.api.schemas.common import DEFAULT_LIMIT, MAX_LIMIT, decode_cursor
from storysphere.api.tasks import JobTasks
from storysphere.ingest.s1 import build_s1_stages
from storysphere.ingest.service import IngestService
from storysphere.llm.router import LlmUnconfigured, task_available
from storysphere.llm.settings import load_settings
from storysphere.methods.engine import MethodEngine
from storysphere.methods.jobs import MethodJobs
from storysphere.registry.loader import Registry
from storysphere.store.books import BookRow


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.session_factory() as session:
        yield session


def get_registry(request: Request) -> Registry:
    return request.app.state.registry


def get_method_engine(request: Request) -> MethodEngine:
    return request.app.state.method_engine


SessionDep = Annotated[AsyncSession, Depends(get_session)]
RegistryDep = Annotated[Registry, Depends(get_registry)]
MethodEngineDep = Annotated[MethodEngine, Depends(get_method_engine)]


async def get_book_row(book_id: str, session: SessionDep) -> BookRow:
    """The book in the path, or 404."""
    book = await session.get(BookRow, book_id)
    if book is None:
        raise not_found("Book", book_id)
    return book


BookDep = Annotated[BookRow, Depends(get_book_row)]


class Paging:
    """`limit`／`cursor` query parameters (04 §1.3)."""

    def __init__(
        self,
        limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
        cursor: str | None = None,
    ) -> None:
        self.limit = limit
        self.offset = decode_cursor(cursor)


PagingDep = Annotated[Paging, Depends()]


def require_llm_task(task: str) -> None:
    """503 `llm_unconfigured` when ``task`` has no usable model (04 §1.6); no job is created."""
    if not task_available(load_settings(), task):
        raise ApiError(503, "llm_unconfigured", f"No usable model for task '{task}'.")


def get_ingest_service(request: Request) -> IngestService:
    """The ingest service; built on first use because building S1 needs a usable model."""
    state = request.app.state
    if state.ingest_service is None:
        try:
            stages = build_s1_stages()
        except LlmUnconfigured as exc:
            raise ApiError(503, "llm_unconfigured", str(exc)) from exc
        state.ingest_service = IngestService(
            state.session_factory,
            state.checkpointer,
            stages=stages,
            method_engine=state.method_engine,
        )
    return state.ingest_service


def get_job_tasks(request: Request) -> JobTasks:
    return request.app.state.job_tasks


def get_method_jobs(request: Request) -> MethodJobs:
    return request.app.state.method_jobs


def get_event_bus(request: Request) -> EventBus:
    return request.app.state.event_bus


IngestServiceDep = Annotated[IngestService, Depends(get_ingest_service)]
JobTasksDep = Annotated[JobTasks, Depends(get_job_tasks)]
MethodJobsDep = Annotated[MethodJobs, Depends(get_method_jobs)]
EventBusDep = Annotated[EventBus, Depends(get_event_bus)]
