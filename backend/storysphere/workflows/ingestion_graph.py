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
from functools import partial
from pathlib import Path
from typing import TYPE_CHECKING, Protocol, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

if TYPE_CHECKING:
    from storysphere.workflows.ingestion import IngestionResult

logger = logging.getLogger(__name__)


class IngestionReporter(Protocol):
    """Where a single ingestion run reports its progress to.

    Implemented by the API layer (which owns the task store and the wire
    format); the graph only knows this interface, so nothing here has to
    import from ``storysphere.api``.
    """

    def progress(
        self,
        pct: int,
        stage: str,
        *,
        step_key: str | None = None,
        sub_progress: int | None = None,
        sub_total: int | None = None,
        sub_stage: str | None = None,
    ) -> None: ...

    async def murmur(
        self,
        step_key: str,
        event_type: str,
        content: str,
        *,
        meta: dict | None = None,
        raw_content: str | None = None,
    ) -> None: ...

    def awaiting_review(self, doc_id: str) -> None: ...

    def running(self) -> None: ...

    def completed(self, result: IngestionResult) -> dict: ...


class ReporterFactory(Protocol):
    """Builds the reporter for one task. The graph is shared across tasks."""

    def __call__(self, task_id: str) -> IngestionReporter: ...


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


async def phase1_node(
    state: IngestionState, *, kg_service, make_reporter: ReporterFactory
) -> dict:
    from storysphere.workflows.ingestion import IngestionWorkflow  # noqa: PLC0415

    task_id = state["task_id"]
    reporter = make_reporter(task_id)
    workflow = IngestionWorkflow(kg_service=kg_service)

    doc = await workflow.run_phase1(
        Path(state["file_path"]),
        title=state.get("title"),
        author=state.get("author"),
        language=state.get("language"),
        progress_cb=reporter.progress,
        murmur_cb=reporter.murmur,
    )

    # Signal frontend that review is needed — must happen after run_phase1 returns
    reporter.awaiting_review(doc.id)
    logger.info("phase1_node done: doc_id=%s, task=%s awaiting review", doc.id, task_id)
    return {"doc_id": doc.id}


async def chapter_review_node(
    state: IngestionState, *, make_reporter: ReporterFactory
) -> dict:
    """Pause here for HITL chapter review.

    On the first pass, interrupt() checkpoints the graph and raises GraphInterrupt.
    When the graph is resumed with Command(resume=chapters_data), execution
    continues from this point with chapters_data as the return value of interrupt().
    """
    from storysphere.services.document_service import DocumentService  # noqa: PLC0415
    from storysphere.workflows.ingestion import (  # noqa: PLC0415
        _apply_paragraph_splits,
        _apply_role_overrides,
        _rebuild_chapters,
    )

    resume_value: list[dict] | dict | None = interrupt({"doc_id": state["doc_id"]})

    chapters_data: list[dict] | None
    role_overrides: dict[str, str] = {}
    paragraph_splits: dict[str, list[int]] = {}
    if isinstance(resume_value, list):
        chapters_data = resume_value  # legacy format: bare chapter list
    elif isinstance(resume_value, dict):
        chapters_data = resume_value.get("chapters")
        role_overrides = resume_value.get("role_overrides") or {}
        paragraph_splits = resume_value.get("paragraph_splits") or {}
    else:
        chapters_data = None

    # An empty or absent chapter list means "accept the detected structure":
    # there is nothing to rebuild. Rebuilding from an empty list would produce
    # a document with zero chapters, and replace_chapters would then delete
    # every chapter and paragraph row the book has — so this guard is also what
    # keeps a malformed payload from wiping the book.
    if chapters_data:
        doc_svc = DocumentService()
        await doc_svc.init_db()
        doc = await doc_svc.get_document(state["doc_id"])
        if doc is not None:
            # Splits first: role_overrides and chapters_data indices refer to
            # the post-split flat paragraph order.
            _apply_paragraph_splits(doc, paragraph_splits)
            _apply_role_overrides(doc, role_overrides)
            doc.chapters = _rebuild_chapters(doc, chapters_data)
            await doc_svc.replace_chapters(doc)
            logger.info(
                "chapter_review_node: applied %d chapters for doc=%s",
                len(doc.chapters),
                state["doc_id"],
            )

    make_reporter(state["task_id"]).running()
    return {}


async def phase2_node(
    state: IngestionState, *, kg_service, make_reporter: ReporterFactory
) -> dict:
    from storysphere.workflows.ingestion import IngestionWorkflow  # noqa: PLC0415

    task_id = state["task_id"]
    doc_id = state["doc_id"]

    reporter = make_reporter(task_id)
    workflow = IngestionWorkflow(kg_service=kg_service)

    result = await workflow.run_phase2(
        doc_id,
        progress_cb=reporter.progress,
        murmur_cb=reporter.murmur,
    )

    # The reporter owns the wire shape of the task result and hands back what
    # it stored, so the graph can echo the same payload into its own state.
    task_result = reporter.completed(result)
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


def build_ingestion_graph(checkpointer, *, kg_service, make_reporter: ReporterFactory):
    """Compile the ingestion graph with the given LangGraph checkpointer.

    ``kg_service`` and ``make_reporter`` are supplied by the composition root
    (the API lifespan) so this module stays free of any dependency on the API
    layer.  The nodes are looked up as module globals here, which keeps them
    patchable in tests.
    """
    deps = {"kg_service": kg_service, "make_reporter": make_reporter}
    graph: StateGraph = StateGraph(IngestionState)
    graph.add_node("phase1", partial(phase1_node, **deps))
    graph.add_node("chapter_review", partial(chapter_review_node, make_reporter=make_reporter))
    graph.add_node("phase2", partial(phase2_node, **deps))
    graph.add_edge(START, "phase1")
    graph.add_edge("phase1", "chapter_review")
    graph.add_edge("chapter_review", "phase2")
    graph.add_edge("phase2", END)
    return graph.compile(checkpointer=checkpointer)
