"""Ingestion service: create an ingest job, run it to the review pause, resume it.

REST 端點（N-01b、N-02d、N-02e）之後呼叫的服務層。這裡只做「建 job → 跑到審閱 →
送出審閱跑完」；SSE、取消、重試、背景工作的管理屬於後面的任務。
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.types import Command
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from storysphere.ingest.graph import NoExtractableText, build_ingest_graph
from storysphere.ingest.review import build_review_data
from storysphere.store.books import get_book
from storysphere.store.tables import Job

logger = logging.getLogger(__name__)

# 審閱暫停點的 checkpoint；和 var/neo.db 分開的另一個 SQLite 檔。
CHECKPOINT_PATH = Path(__file__).resolve().parents[3] / "var" / "ingestion_checkpoints.db"

INGEST_KIND = "ingest"


@asynccontextmanager
async def open_checkpointer(path: Path = CHECKPOINT_PATH) -> AsyncIterator[AsyncSqliteSaver]:
    """Open the LangGraph SQLite checkpointer stored at ``path``."""
    path.parent.mkdir(parents=True, exist_ok=True)
    async with AsyncSqliteSaver.from_conn_string(str(path)) as checkpointer:
        await checkpointer.setup()
        yield checkpointer


class ReviewStateError(Exception):
    """The review window of a book is not open (API 409; ``code`` says why).

    - ``review_not_open``  — 沒有入庫 job，或還沒走到審閱點。
    - ``review_closed``    — job 已經 `error` 或 `cancelled`，沒有東西可審。
    - ``review_submitted`` — `running`／`done` 且已有 bookId：審閱已經送出過。
    """

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _review_conflict_code(job: Job | None) -> str:
    if job is None:
        return "review_not_open"
    if job.status in ("error", "cancelled"):
        return "review_closed"
    if job.status in ("running", "done") and (job.result_json or {}).get("bookId"):
        return "review_submitted"
    return "review_not_open"


def _error_kind(exc: BaseException) -> str:
    if isinstance(exc, NoExtractableText):
        return "no_extractable_text"
    if isinstance(exc, FileNotFoundError):
        return "file_not_found"
    # pipeline 對不認得的副檔名丟 ValueError("Unsupported file type: ...")。
    if isinstance(exc, ValueError) and str(exc).startswith("Unsupported file type"):
        return "unsupported_format"
    return "internal"


class IngestService:
    """Drives the ingestion graph for ``ingest`` jobs."""

    def __init__(
        self, session_factory: async_sessionmaker[AsyncSession], checkpointer: Any
    ) -> None:
        self._session_factory = session_factory
        self._graph = build_ingest_graph(checkpointer, session_factory=session_factory)

    async def create_job(
        self,
        file_path: Path,
        *,
        title: str | None = None,
        author: str | None = None,
        language: str | None = None,
    ) -> str:
        """Insert a pending ``ingest`` job for the uploaded file; return its id."""
        job = Job(
            kind=INGEST_KIND,
            status="pending",
            title=title or Path(file_path).stem,
            params_json={
                "file_path": str(file_path),
                "title": title,
                "author": author,
                "language": language,
            },
        )
        async with self._session_factory() as session, session.begin():
            session.add(job)
        return job.id

    async def run_to_review(self, job_id: str) -> None:
        """Run P1 for the job until the graph pauses for chapter review.

        P1 失敗時把 job 標成 `error`，不往外丟。
        """
        async with self._session_factory() as session:
            job = await session.get(Job, job_id)
            if job is None:
                raise LookupError(f"Job '{job_id}' not found")
            params = job.params_json or {}

        initial_state = {
            "job_id": job_id,
            "file_path": params.get("file_path"),
            "title": params.get("title"),
            "author": params.get("author"),
            "language": params.get("language"),
            "book_id": None,
        }
        await self._run(job_id, initial_state)

    async def get_review_data(self, book_id: str) -> dict[str, Any]:
        """Chapter/paragraph data for review; only while the job is ``awaiting_review``."""
        async with self._session_factory() as session:
            await self._open_review_job(session, book_id)
            doc = await get_book(session, book_id)
        if doc is None:
            raise ReviewStateError("review_not_open")
        return build_review_data(doc)

    async def submit_review(self, book_id: str, payload: dict[str, Any]) -> None:
        """Submit the review and run the rest of the graph to the end."""
        async with self._session_factory() as session:
            job = await self._open_review_job(session, book_id)

        # 一定要是帶固定 key 的 dict：Command(resume=None) 與 Command(resume={})
        # 都會被 LangGraph 當成「沒有給續跑值」。
        resume_value = {
            "chapters": payload.get("chapters"),
            "role_overrides": payload.get("role_overrides") or {},
            "paragraph_splits": payload.get("paragraph_splits") or {},
        }
        await self._run(job.id, Command(resume=resume_value))

    # ── internals ────────────────────────────────────────────────────────────

    async def _open_review_job(self, session: AsyncSession, book_id: str) -> Job:
        """該書最近一個 ingest job；不在 `awaiting_review` 就丟 ReviewStateError。"""
        job = (
            await session.scalars(
                select(Job)
                .where(Job.book_id == book_id, Job.kind == INGEST_KIND)
                .order_by(Job.created_at.desc())
                .limit(1)
            )
        ).first()
        if job is None or job.status != "awaiting_review":
            raise ReviewStateError(_review_conflict_code(job))
        return job

    async def _run(self, job_id: str, graph_input: Any) -> None:
        config = {"configurable": {"thread_id": job_id}}
        try:
            await self._graph.ainvoke(graph_input, config=config)
        except Exception as exc:
            logger.exception("Ingest job %s failed", job_id)
            async with self._session_factory() as session, session.begin():
                job = await session.get(Job, job_id)
                job.status = "error"
                job.error = str(exc)
                job.error_kind = _error_kind(exc)
                job.finished_at = datetime.now(UTC)
