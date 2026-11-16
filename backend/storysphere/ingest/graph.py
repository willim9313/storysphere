"""LangGraph ingestion graph: P1 → chapter review (HITL pause) → unit stages → S2–S5 → finish.

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
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from storysphere.ingest.document_processing import DocumentProcessingPipeline
from storysphere.ingest.review import apply_review
from storysphere.ingest.s2 import run_s2
from storysphere.ingest.s2.imagery import Embedder
from storysphere.ingest.s3 import has_s3_input, run_s3
from storysphere.ingest.s4 import has_s4_input, run_s4
from storysphere.ingest.unit_runner import QuotaPaused, UnitStage, run_stage
from storysphere.ingest.units import build_units
from storysphere.methods.engine import default_method_engine
from storysphere.methods.s5 import has_runnable_card, has_s5_input, run_s5
from storysphere.store.books import get_book, replace_chapters, save_book
from storysphere.store.ingest_units import IngestUnitOutputRow, list_units
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
    concurrency: int,
) -> dict[str, Any]:
    """逐單位跑每個抽取步驟（02 §2、§7）。

    所有 stage 同時跑；每個 stage 內部同時跑 ``concurrency`` 個單位。續跑時整個節點重跑一次，但 `run_stage`
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
                group.create_task(
                    run_stage(
                        session_factory,
                        stage,
                        units,
                        retry_delay=retry_delay,
                        concurrency=concurrency,
                    )
                )
    except BaseExceptionGroup as group_exc:
        errors = list(group_exc.exceptions)
        raise next((e for e in errors if isinstance(e, QuotaPaused)), errors[0]) from None
    return {}


async def s2_node(
    state: IngestState, *, session_factory: SessionFactory, embedder: Embedder | None
) -> dict[str, Any]:
    """S2 整併（02 §4）：把 S1 的原始輸出整併成第 1 層證據。不叫 LLM。

    沒有任何 S1 輸出（沒設 stage）時直接跳過。整個節點可重跑：新的一批取代舊的一批。
    """
    book_id = state["book_id"]
    async with session_factory() as session:
        has_output = await session.scalar(
            select(func.count())
            .select_from(IngestUnitOutputRow)
            .where(IngestUnitOutputRow.book_id == book_id)
        )
    if not has_output:
        return {}

    async with session_factory() as session, session.begin():
        job = await session.get(Job, state["job_id"])
        job.status = "running"
        job.stage = "s2"

    report = await run_s2(session_factory, book_id, job_id=state["job_id"], embedder=embedder)

    async with session_factory() as session, session.begin():
        job = await session.get(Job, state["job_id"])
        # result_json 要整個換掉（見 finish_node）。
        job.result_json = {**(job.result_json or {}), "s2": report.to_dict()}
    return {}


async def s3_node(
    state: IngestState, *, session_factory: SessionFactory, genre_llm: Any, retry_delay: float
) -> dict[str, Any]:
    """S3 題材判定（02 §5）：一次 LLM 呼叫，寫 `books.genre_profile`。

    沒有可用的 S1b 訊號（沒設 stage、輸出不是 S1b 的形狀、或一個訊號都沒有）時跳過，
    不建模型也不叫 LLM。429 會從這裡往外丟 `QuotaPaused`，續跑時重跑這個節點。
    """
    book_id = state["book_id"]
    if not await has_s3_input(session_factory, book_id):
        return {}

    async with session_factory() as session, session.begin():
        job = await session.get(Job, state["job_id"])
        job.status = "running"
        job.stage = "s3"

    await run_s3(
        session_factory, book_id, job_id=state["job_id"], llm=genre_llm, retry_delay=retry_delay
    )
    return {}


async def s4_node(
    state: IngestState,
    *,
    session_factory: SessionFactory,
    deep_llm: Any,
    consolidate_llm: Any,
    retry_delay: float,
    concurrency: int,
) -> dict[str, Any]:
    """S4 深度抽取＋整併（02 §6）：資訊控制機制的第 1 層證據。

    沒有 `genre_profile` 或沒有 `info_control` 訊號的單位時跳過（job 的 stage 不變、
    不建模型也不叫 LLM）。429 會從這裡往外丟 `QuotaPaused`；續跑時重跑這個節點，S4a 只補
    還沒 `done` 的單位。
    """
    book_id = state["book_id"]
    if not await has_s4_input(session_factory, book_id):
        return {}

    async with session_factory() as session, session.begin():
        job = await session.get(Job, state["job_id"])
        job.status = "running"
        job.stage = "s4"

    report = await run_s4(
        session_factory,
        book_id,
        job_id=state["job_id"],
        deep_llm=deep_llm,
        consolidate_llm=consolidate_llm,
        concurrency=concurrency,
        retry_delay=retry_delay,
    )
    if report is not None:
        async with session_factory() as session, session.begin():
            job = await session.get(Job, state["job_id"])
            # result_json 要整個換掉（見 finish_node）。
            job.result_json = {**(job.result_json or {}), "s4": report.to_dict()}
    return {}


async def s5_node(
    state: IngestState, *, session_factory: SessionFactory, method_engine: Any
) -> dict[str, Any]:
    """S5 預設觸發（02 §8）：依題材的視角逐張結果卡經方法引擎執行。

    書裡沒有任何證據時跳過；尚未實作的方法跳過並記在 `result_json["s5"]`，不讓入庫失敗
    （全部跳過時 job 的 stage 不變）。
    429 會從這裡往外丟 `QuotaPaused`；續跑時重跑這個節點，本 job 已完成的卡不重跑。
    """
    book_id = state["book_id"]
    if not await has_s5_input(session_factory, book_id):
        return {}

    engine = method_engine or default_method_engine(session_factory)
    if await has_runnable_card(engine, book_id):
        # 全部要跳過時不動 job 的 stage（和 S2–S4 跳過時一樣）。
        async with session_factory() as session, session.begin():
            job = await session.get(Job, state["job_id"])
            job.status = "running"
            job.stage = "s5"

    report = await run_s5(engine, book_id, job_id=state["job_id"])

    async with session_factory() as session, session.begin():
        job = await session.get(Job, state["job_id"])
        # result_json 要整個換掉（見 finish_node）。
        job.result_json = {**(job.result_json or {}), "s5": report.to_dict()}
    if report.quota_paused:
        raise QuotaPaused
    return {}


async def finish_node(state: IngestState, *, session_factory: SessionFactory) -> dict[str, Any]:
    """把 job 標成完成。

    S5 之後的入庫步驟插在這個節點之前。有單位失敗也算完成（04 §3.2）。
    """
    async with session_factory() as session, session.begin():
        doc = await get_book(session, state["book_id"])
        job = await session.get(Job, state["job_id"])
        units = await list_units(session, state["book_id"])
        profile = doc.genre_profile if doc is not None else None
        # result_json 要整個換掉；原地改 dict，SQLAlchemy 不會發現有變動。
        job.result_json = {
            **(job.result_json or {}),
            "chapterCount": doc.body_chapter_count if doc is not None else 0,
            "paragraphCount": doc.total_paragraphs if doc is not None else 0,
            "failedUnitCount": sum(1 for u in units if u.status == "failed"),
            "genre": profile.get("primary") if profile else None,
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
    embedder: Embedder | None = None,
    genre_llm: Any = None,
    deep_llm: Any = None,
    consolidate_llm: Any = None,
    concurrency: int = 4,
    method_engine: Any = None,
) -> Any:
    """Compile the ingestion graph with the given LangGraph checkpointer.

    ``embedder`` 是 S2 意象分群用的嵌入函式；沒給時 S2 才 lazy 載入 sentence-transformers。
    ``genre_llm`` 是 S3 用的 LLM（測試注入）；沒給時 S3 才呼叫 `llm_for("genre_detection")`。
    ``deep_llm``／``consolidate_llm`` 是 S4a／S4b 用的，沒給時 S4 才呼叫 `llm_for(...)`。
    ``concurrency`` 是每個 stage 內同時跑的單位數（S1、S4a）。
    ``method_engine`` 是 S5 用的方法引擎；沒給時 S5 才載入正式的 registry 與實作。
    """
    graph: StateGraph = StateGraph(IngestState)
    graph.add_node("p1", partial(p1_node, session_factory=session_factory))
    graph.add_node("review", partial(review_node, session_factory=session_factory))
    graph.add_node(
        "units",
        partial(
            units_node,
            session_factory=session_factory,
            stages=stages,
            retry_delay=retry_delay,
            concurrency=concurrency,
        ),
    )
    graph.add_node("s2", partial(s2_node, session_factory=session_factory, embedder=embedder))
    graph.add_node(
        "s3",
        partial(s3_node, session_factory=session_factory, genre_llm=genre_llm, retry_delay=retry_delay),
    )
    graph.add_node(
        "s4",
        partial(
            s4_node,
            session_factory=session_factory,
            deep_llm=deep_llm,
            consolidate_llm=consolidate_llm,
            retry_delay=retry_delay,
            concurrency=concurrency,
        ),
    )
    graph.add_node(
        "s5", partial(s5_node, session_factory=session_factory, method_engine=method_engine)
    )
    graph.add_node("finish", partial(finish_node, session_factory=session_factory))
    graph.add_edge(START, "p1")
    graph.add_edge("p1", "review")
    graph.add_edge("review", "units")
    graph.add_edge("units", "s2")
    graph.add_edge("s2", "s3")
    graph.add_edge("s3", "s4")
    graph.add_edge("s4", "s5")
    graph.add_edge("s5", "finish")
    graph.add_edge("finish", END)
    return graph.compile(checkpointer=checkpointer)
