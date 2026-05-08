"""LangGraph HITL ingestion graph.

Replaces the asyncio.Event-based review_registry with durable checkpoint-based
pause/resume.  The graph has three nodes:

  phase1_node        — calls IngestionWorkflow.run_phase1(), sets awaiting_review
  chapter_review_node — interrupt() here; on resume applies reviewed chapters
  phase2_node        — calls IngestionWorkflow.run_phase2(), sets completed

Graph state is checkpointed to SQLite after each node, so a server restart
does not lose progress.  thread_id == task_id.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

logger = logging.getLogger(__name__)


class IngestionState(TypedDict):
    # ── Inputs (set once, never mutated) ────────────────────────────────
    file_path: str
    title: str | None
    author: str | None
    language: str | None
    task_id: str
    # ── Phase 1 output ───────────────────────────────────────────────────
    doc_id: str | None
    # ── Phase 2 accumulated results (filled by phase2_node) ─────────────
    errors: list[str]
    chapters: int
    paragraphs: int
    paragraphs_embedded: int
    keywords_extracted: int
    chapters_summarized: int
    book_summary_generated: bool
    entities: int
    relations: int
    events: int
    imagery_count: int
    timeline_detection: dict | None


async def phase1_node(state: IngestionState) -> dict:
    from api.deps import get_kg_service  # noqa: PLC0415
    from api.store import task_store  # noqa: PLC0415
    from workflows.ingestion import IngestionWorkflow  # noqa: PLC0415

    task_id = state["task_id"]
    kg_service = get_kg_service()
    workflow = IngestionWorkflow(kg_service=kg_service)

    doc = await workflow.run_phase1(
        Path(state["file_path"]),
        title=state.get("title"),
        author=state.get("author"),
        language=state.get("language"),
        progress_cb=lambda pct, stage, *, sub_progress=None, sub_total=None, sub_stage=None:
            task_store.set_progress(task_id, pct, stage, sub_progress=sub_progress, sub_total=sub_total, sub_stage=sub_stage),
        murmur_cb=lambda event: task_store.append_murmur(task_id, event),
    )

    # Signal frontend that review is needed — must happen after run_phase1 returns
    task_store.set_awaiting_review(task_id, doc.id)
    logger.info("phase1_node done: doc_id=%s, task=%s awaiting review", doc.id, task_id)
    return {"doc_id": doc.id}


async def chapter_review_node(state: IngestionState) -> dict:
    """Pause here for HITL chapter review.

    On the first pass, interrupt() checkpoints the graph and raises GraphInterrupt.
    When the graph is resumed with Command(resume=chapters_data), execution
    continues from this point with chapters_data as the return value of interrupt().
    """
    from api.store import task_store  # noqa: PLC0415
    from services.document_service import DocumentService  # noqa: PLC0415
    from workflows.ingestion import _rebuild_chapters  # noqa: PLC0415

    chapters_data: list[dict] | None = interrupt({"doc_id": state["doc_id"]})

    if chapters_data:
        doc_svc = DocumentService()
        await doc_svc.init_db()
        doc = await doc_svc.get_document(state["doc_id"])
        if doc is not None:
            doc.chapters = _rebuild_chapters(doc, chapters_data)
            await doc_svc.replace_chapters(doc)
            logger.info(
                "chapter_review_node: applied %d chapters for doc=%s",
                len(doc.chapters),
                state["doc_id"],
            )

    task_store.set_running(state["task_id"])
    return {}


async def phase2_node(state: IngestionState) -> dict:
    from api.deps import get_kg_service  # noqa: PLC0415
    from api.schemas.books import TimelineDetectionResponse  # noqa: PLC0415
    from api.store import task_store  # noqa: PLC0415
    from workflows.ingestion import IngestionWorkflow  # noqa: PLC0415

    task_id = state["task_id"]
    doc_id = state["doc_id"]

    kg_service = get_kg_service()
    workflow = IngestionWorkflow(kg_service=kg_service)

    result = await workflow.run_phase2(
        doc_id,
        task_id=task_id,
        progress_cb=lambda pct, stage, *, sub_progress=None, sub_total=None, sub_stage=None:
            task_store.set_progress(task_id, pct, stage, sub_progress=sub_progress, sub_total=sub_total, sub_stage=sub_stage),
        murmur_cb=lambda event: task_store.append_murmur(task_id, event),
    )

    task_result: dict = {
        "bookId": result.document_id,
        "failedSteps": result.errors,
    }
    if result.timeline_detection is not None:
        task_result["timelineDetection"] = TimelineDetectionResponse.model_validate(
            result.timeline_detection.model_dump()
        ).model_dump(by_alias=True)

    task_store.set_completed(task_id, result=task_result)
    logger.info(
        "phase2_node done: task=%s entities=%d relations=%d events=%d errors=%d",
        task_id,
        result.entities,
        result.relations,
        result.events,
        len(result.errors),
    )

    return {
        "errors": result.errors,
        "chapters": result.chapters,
        "paragraphs": result.paragraphs,
        "paragraphs_embedded": result.paragraphs_embedded,
        "keywords_extracted": result.keywords_extracted,
        "chapters_summarized": result.chapters_summarized,
        "book_summary_generated": result.book_summary_generated,
        "entities": result.entities,
        "relations": result.relations,
        "events": result.events,
        "imagery_count": result.imagery_extracted,
        "timeline_detection": task_result.get("timelineDetection"),
    }


def build_ingestion_graph(checkpointer):
    """Compile the ingestion graph with the given LangGraph checkpointer."""
    graph: StateGraph = StateGraph(IngestionState)
    graph.add_node("phase1", phase1_node)
    graph.add_node("chapter_review", chapter_review_node)
    graph.add_node("phase2", phase2_node)
    graph.add_edge(START, "phase1")
    graph.add_edge("phase1", "chapter_review")
    graph.add_edge("chapter_review", "phase2")
    graph.add_edge("phase2", END)
    return graph.compile(checkpointer=checkpointer)
