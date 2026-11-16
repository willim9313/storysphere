"""LangGraph ingestion graph: P1 → chapter review (HITL pause) → unit stages → finish.

沿用舊 repo `workflows/ingestion_graph.py` 的做法：審閱用 `interrupt()` 暫停，圖的狀態
checkpoint 到 SQLite，伺服器重啟後仍可從審閱點續跑。thread_id == job id。

job 的狀態轉移（04 §3.2）由各節點自己寫進 `jobs` 表。
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from functools import partial
from pathlib import Path
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from storysphere.ingest.document_processing import DocumentProcessingPipeline
from storysphere.ingest.review import apply_review
from storysphere.ingest.unit_runner import QuotaPaused, UnitStage, run_stage
from storysphere.ingest.units import build_units
from storysphere.store.books import get_book, replace_chapters, save_book
from storysphere.store.ingest_units import list_units
from storysphere.store.tables import Job

logger = logging.getLogger(__name__)

SessionFactory = async_sessionmaker[AsyncSession]


class NoExtractableText(Exception):
    """The file parsed but yielded no paragraphs (e.g. an empty or image-only file)."""


class IngestState(TypedDict):
    # ── 輸入（建立後不再變動） ──
    job_id: str
    file_path: str
    title: str | None
    author: str | None
    language: str | None
    # ── P1 的產出 ──
    book_id: str | None


async def p1_node(state: IngestState, *, session_factory: SessionFactory) -> dict[str, Any]:
    """P1：解析、切章、切段，存進 books／chapters／paragraphs，然後等審閱。"""
    job_id = state["job_id"]

    async with session_factory() as session, session.begin():
        job = await session.get(Job, job_id)
        job.status = "running"
        job.stage = "p1"
        job.started_at = datetime.now(UTC)

    doc = await DocumentProcessingPipeline().run(
        Path(state["file_path"]),
        title=state.get("title"),
        author=state.get("author"),
        language=state.get("language"),
    )
    # 抽不出任何文字就在存書之前停下來，不要留下一本空書。
    if doc.total_paragraphs == 0:
        raise NoExtractableText("No text could be extracted from the file")

    # 存書與 job 進入 awaiting_review 在同一個交易：看得到 bookId 就一定讀得到書。
    async with session_factory() as session, session.begin():
        await save_book(session, doc)
        job = await session.get(Job, job_id)
        job.book_id = doc.id
        job.result_json = {"bookId": doc.id}
        job.status = "awaiting_review"
        job.stage = "review"

    logger.info("p1_node done: book_id=%s, job=%s awaiting review", doc.id, job_id)
    return {"book_id": doc.id}


async def review_node(state: IngestState, *, session_factory: SessionFactory) -> dict[str, Any]:
    """章節審閱的暫停點。

    第一次走到這裡時 `interrupt()` 會 checkpoint 並暫停；之後用
    `Command(resume=payload)` 續跑，`interrupt()` 回傳 payload，從這裡往下執行。
    """
    payload = interrupt({"book_id": state["book_id"]})

    async with session_factory() as session, session.begin():
        doc = await get_book(session, state["book_id"])
        # apply_review 回傳 False＝照原樣接受，不重寫章節（空清單會把整本書刪光）。
        if doc is not None and apply_review(doc, payload if isinstance(payload, dict) else {}):
            await replace_chapters(session, doc)
            logger.info(
                "review_node: applied %d chapters for book=%s", len(doc.chapters), doc.id
            )
        job = await session.get(Job, state["job_id"])
        job.status = "running"

    return {}


async def units_node(
    state: IngestState,
    *,
    session_factory: SessionFactory,
    stages: Sequence[UnitStage],
    retry_delay: float,
) -> dict[str, Any]:
    """逐單位跑每個抽取步驟（02 §2、§7）。

    所有 stage 同時跑（stage 內部仍依序跑單位）。續跑時整個節點重跑一次，但 `run_stage`
    只處理還沒 `done` 的單位。429 會從這裡往外丟 `QuotaPaused`，由 service 把 job 轉成
    `paused_quota`；多個 stage 同時失敗時，有 `QuotaPaused` 就丟它，否則丟第一個例外。
    """
    if not stages:
        return {}

    async with session_factory() as session, session.begin():
        doc = await get_book(session, state["book_id"])
        job = await session.get(Job, state["job_id"])
        job.status = "running"
        job.stage = "s1"

    units = build_units(doc)
    try:
        async with asyncio.TaskGroup() as group:
            for stage in stages:
                group.create_task(run_stage(session_factory, stage, units, retry_delay=retry_delay))
    except BaseExceptionGroup as group_exc:
        errors = list(group_exc.exceptions)
        raise next((e for e in errors if isinstance(e, QuotaPaused)), errors[0]) from None
    return {}


async def finish_node(state: IngestState, *, session_factory: SessionFactory) -> dict[str, Any]:
    """把 job 標成完成。

    T09 之後的入庫步驟（S2…）插在這個節點之前。有單位失敗也算完成（04 §3.2）。
    """
    async with session_factory() as session, session.begin():
        doc = await get_book(session, state["book_id"])
        job = await session.get(Job, state["job_id"])
        units = await list_units(session, state["book_id"])
        # result_json 要整個換掉；原地改 dict，SQLAlchemy 不會發現有變動。
        job.result_json = {
            **(job.result_json or {}),
            "chapterCount": doc.body_chapter_count if doc is not None else 0,
            "paragraphCount": doc.total_paragraphs if doc is not None else 0,
            "failedUnitCount": sum(1 for u in units if u.status == "failed"),
        }
        job.status = "done"
        job.progress = 100
        job.finished_at = datetime.now(UTC)

    return {}


def build_ingest_graph(
    checkpointer: Any,
    *,
    session_factory: SessionFactory,
    stages: Sequence[UnitStage] = (),
    retry_delay: float = 1.0,
) -> Any:
    """Compile the ingestion graph with the given LangGraph checkpointer."""
    graph: StateGraph = StateGraph(IngestState)
    graph.add_node("p1", partial(p1_node, session_factory=session_factory))
    graph.add_node("review", partial(review_node, session_factory=session_factory))
    graph.add_node(
        "units",
        partial(
            units_node, session_factory=session_factory, stages=stages, retry_delay=retry_delay
        ),
    )
    graph.add_node("finish", partial(finish_node, session_factory=session_factory))
    graph.add_edge(START, "p1")
    graph.add_edge("p1", "review")
    graph.add_edge("review", "units")
    graph.add_edge("units", "finish")
    graph.add_edge("finish", END)
    return graph.compile(checkpointer=checkpointer)
