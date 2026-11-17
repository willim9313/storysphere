"""Ingestion service: create an ingest job, run it to the review pause, resume it.

REST 端點（N-01b、N-02d、N-02e）之後呼叫的服務層。這裡做「建 job → 跑到審閱 →
送出審閱跑完」，以及額度暫停、重啟中斷後的續跑（02 §7）；SSE、取消、背景工作的管理
屬於後面的任務。
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.types import Command
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from storysphere.ingest.graph import NoExtractableText, build_ingest_graph
from storysphere.ingest.review import build_review_data
from storysphere.ingest.s2.imagery import Embedder
from storysphere.ingest.unit_runner import QuotaPaused, UnitStage
from storysphere.llm.router import LlmUnconfigured
from storysphere.store.books import get_book
from storysphere.store.ingest_units import IngestUnitRow, reset_running_units
from storysphere.store.tables import Job, Run

logger = logging.getLogger(__name__)

# 審閱暫停點的 checkpoint；和 var/neo.db 分開的另一個 SQLite 檔。
CHECKPOINT_PATH = Path(__file__).resolve().parents[3] / "var" / "ingestion_checkpoints.db"

INGEST_KIND = "ingest"
TERMINAL_STATUSES = ("done", "error", "cancelled")


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


class JobStateError(Exception):
    """The job is not in a state that allows the action (API 409 `invalid_state`)."""

    code = "invalid_state"


async def mark_interrupted_jobs(session_factory: async_sessionmaker[AsyncSession]) -> int:
    """Server start-up: every job still `running` becomes `interrupted` (02 §7).

    不自動續跑；使用者按續跑才繼續。回傳被改掉的 job 數。
    """
    async with session_factory() as session, session.begin():
        result = await session.execute(
            update(Job).where(Job.status == "running").values(status="interrupted")
        )
        await reset_running_units(session)
    return result.rowcount


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
    if isinstance(exc, LlmUnconfigured):
        return "llm_unconfigured"
    if isinstance(exc, FileNotFoundError):
        return "file_not_found"
    # pipeline 對不認得的副檔名丟 ValueError("Unsupported file type: ...")。
    if isinstance(exc, ValueError) and str(exc).startswith("Unsupported file type"):
        return "unsupported_format"
    return "internal"


async def open_review_job(session: AsyncSession, book_id: str) -> Job:
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


async def mark_cancelled(
    session_factory: async_sessionmaker[AsyncSession], checkpointer: Any, job_id: str
) -> None:
    """Bookkeeping of N-09d, after the job's background task (if any) has stopped.

    job 標 `cancelled`；它還在跑的 run 標 `cancelled`；這本書執行中的單位退回 `pending`；
    刪掉這個 job 的 checkpoint（取消是終態，不會再續跑）。已完成的單位與已寫入的證據保留。
    不需要模型，所以不經 `IngestService`。
    """
    async with session_factory() as session, session.begin():
        job = await session.get(Job, job_id)
        if job is None:
            raise LookupError(f"Job '{job_id}' not found")
        if job.status in TERMINAL_STATUSES:
            raise JobStateError(job.status)
        job.status = "cancelled"
        job.finished_at = datetime.now(UTC)
        await session.execute(
            update(Run)
            .where(Run.job_id == job_id, Run.status.in_(("queued", "running")))
            .values(status="cancelled", finished_at=datetime.now(UTC))
        )
        if job.book_id is not None:
            await session.execute(
                update(IngestUnitRow)
                .where(IngestUnitRow.book_id == job.book_id, IngestUnitRow.status == "running")
                .values(status="pending")
            )
    await checkpointer.adelete_thread(job_id)


async def review_data(
    session_factory: async_sessionmaker[AsyncSession], book_id: str
) -> dict[str, Any]:
    """N-02d 的資料（snake_case）；不需要模型，所以不經 `IngestService`。"""
    async with session_factory() as session:
        await open_review_job(session, book_id)
        doc = await get_book(session, book_id)
    if doc is None:
        raise ReviewStateError("review_not_open")
    return build_review_data(doc)


class IngestService:
    """Drives the ingestion graph for ``ingest`` jobs."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        checkpointer: Any,
        *,
        stages: Sequence[UnitStage] = (),
        retry_delay: float = 1.0,
        embedder: Embedder | None = None,
        genre_llm: Any = None,
        deep_llm: Any = None,
        consolidate_llm: Any = None,
        concurrency: int = 4,
        method_engine: Any = None,
    ) -> None:
        self._session_factory = session_factory
        self._graph = build_ingest_graph(
            checkpointer,
            session_factory=session_factory,
            stages=stages,
            retry_delay=retry_delay,
            embedder=embedder,
            genre_llm=genre_llm,
            deep_llm=deep_llm,
            consolidate_llm=consolidate_llm,
            concurrency=concurrency,
            method_engine=method_engine,
        )

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
        return await review_data(self._session_factory, book_id)

    async def submit_review(self, book_id: str, payload: dict[str, Any]) -> None:
        """Submit the review and run the rest of the graph to the end."""
        job_id = await self.claim_review(book_id)
        await self.continue_after_review(job_id, payload)

    async def claim_review(self, book_id: str) -> str:
        """Check the review is open and mark the job `running`; return the job id.

        REST 先呼叫這個（同步回 409），再把 `continue_after_review` 丟到背景跑。標成 `running`
        之後同一份審閱不能再送第二次（`review_submitted`）。
        """
        async with self._session_factory() as session, session.begin():
            job = await self._open_review_job(session, book_id)
            job.status = "running"
            return job.id

    async def continue_after_review(self, job_id: str, payload: dict[str, Any]) -> None:
        """Run the graph from the review pause to the end (the job was claimed)."""
        # 一定要是帶固定 key 的 dict：Command(resume=None) 與 Command(resume={})
        # 都會被 LangGraph 當成「沒有給續跑值」。
        resume_value = {
            "chapters": payload.get("chapters"),
            "role_overrides": payload.get("role_overrides") or {},
            "paragraph_splits": payload.get("paragraph_splits") or {},
        }
        await self._run(job_id, Command(resume=resume_value))

    async def resume(self, job_id: str) -> None:
        """Continue a `paused_quota`／`interrupted` job; only units not `done` are run."""
        await self.claim_resume(job_id)
        await self.continue_resumed(job_id)

    async def claim_resume(self, job_id: str) -> None:
        """Check the job can be resumed and put it back to `pending` (04 §3.2)."""
        async with self._session_factory() as session, session.begin():
            job = await session.get(Job, job_id)
            if job is None:
                raise LookupError(f"Job '{job_id}' not found")
            if job.status not in ("paused_quota", "interrupted"):
                raise JobStateError(job.status)
            job.status = "pending"

    async def continue_resumed(self, job_id: str) -> None:
        """Run a claimed job from where it stopped."""
        config = {"configurable": {"thread_id": job_id}}
        snapshot = await self._graph.aget_state(config)
        if snapshot.next:
            # 從上次沒跑完的節點接著跑。
            await self._run(job_id, None)
        else:
            # 連第一個 checkpoint 都還沒寫就中斷了：從頭來。
            await self.run_to_review(job_id)

    # ── internals ────────────────────────────────────────────────────────────

    async def _open_review_job(self, session: AsyncSession, book_id: str) -> Job:
        return await open_review_job(session, book_id)

    async def _run(self, job_id: str, graph_input: Any) -> None:
        config = {"configurable": {"thread_id": job_id}}
        try:
            await self._graph.ainvoke(graph_input, config=config)
        except QuotaPaused:
            # 額度用完不算失敗（04 §3.2）；已完成的單位留著，之後續跑。
            logger.info("Ingest job %s paused: quota exhausted", job_id)
            async with self._session_factory() as session, session.begin():
                job = await session.get(Job, job_id)
                job.status = "paused_quota"
        except Exception as exc:
            logger.exception("Ingest job %s failed", job_id)
            async with self._session_factory() as session, session.begin():
                job = await session.get(Job, job_id)
                job.status = "error"
                job.error = str(exc)
                job.error_kind = _error_kind(exc)
                job.finished_at = datetime.now(UTC)
