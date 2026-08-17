"""Tests for the LangGraph ingestion graph's review pause and resume.

``ingestion_graph.py`` had no coverage at all, which is how two defects in the
resume path survived:

1. Resuming with ``Command(resume=None)`` — what "accept the detected chapter
   structure as-is" used to send — raises ``UnboundLocalError`` inside
   LangGraph itself (``pregel/_loop.py``: ``resume_is_map`` is assigned only
   inside the ``resume is not None`` branch but read outside it). Verified
   present in every published version from 0.5.4 through 1.2.11, so neither
   upgrading nor pinning back fixes it — the caller must not send ``None``.

2. Resuming with an empty chapter list rebuilt the document into *zero*
   chapters, and ``replace_chapters`` then deleted every chapter and paragraph
   row for the book.

These run the real graph against a real checkpointer; only the two phase nodes
are stubbed, because the thing under test is the pause/resume plumbing.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

DOC_ID = "book-under-review"


async def _fake_phase1(state):
    return {"doc_id": DOC_ID}


async def _fake_phase2(state):
    return {"chapters": 3, "errors": []}


def _initial_state(task_id: str) -> dict:
    return {
        "file_path": "/tmp/x.pdf",
        "title": "T",
        "author": None,
        "language": None,
        "task_id": task_id,
        "doc_id": None,
        "errors": [],
        "chapters": 0,
        "paragraphs": 0,
        "paragraphs_embedded": 0,
        "keywords_extracted": 0,
        "chapters_summarized": 0,
        "book_summary_generated": False,
        "entities": 0,
        "relations": 0,
        "events": 0,
        "imagery_count": 0,
        "timeline_detection": None,
    }


class _GraphHarness:
    """Builds the real graph with the two phase nodes stubbed out."""

    def __init__(self, doc_service):
        self.doc_service = doc_service

    def __enter__(self):
        from storysphere.workflows import ingestion_graph as mod

        self._patches = [
            patch.object(mod, "phase1_node", _fake_phase1),
            patch.object(mod, "phase2_node", _fake_phase2),
            # chapter_review_node builds its own DocumentService
            patch.object(mod, "DocumentService", create=True),
        ]
        for p in self._patches[:2]:
            p.start()
        self._doc_patch = patch(
            "storysphere.services.document_service.DocumentService",
            return_value=self.doc_service,
        )
        self._doc_patch.start()
        self._store_patch = patch("storysphere.api.store.task_store")
        self._store_patch.start()

        self.graph = mod.build_ingestion_graph(MemorySaver())
        return self

    def __exit__(self, *exc):
        for p in self._patches[:2]:
            p.stop()
        self._doc_patch.stop()
        self._store_patch.stop()
        return False


def _doc_service(document=None):
    svc = AsyncMock()
    svc.get_document.return_value = document
    return svc


def _make_document(n_chapters: int = 3):
    from storysphere.domain.documents import Chapter, Document, FileType, Paragraph

    return Document(
        id=DOC_ID,
        title="T",
        file_path="/tmp/x.pdf",
        file_type=FileType.PDF,
        chapters=[
            Chapter(
                number=i,
                title=f"Ch {i}",
                paragraphs=[Paragraph(text=f"P{i}", chapter_number=i, position=0)],
            )
            for i in range(1, n_chapters + 1)
        ],
    )


async def _run_to_review(graph, task_id):
    """Invoke the graph; it should stop at the review interrupt."""
    from langgraph.errors import GraphInterrupt

    config = {"configurable": {"thread_id": task_id}}
    try:
        await graph.ainvoke(_initial_state(task_id), config=config)
    except GraphInterrupt:
        pass
    return config


class TestAcceptDetectedStructure:
    """The "接受章節" path: resume without rebuilding anything."""

    @pytest.mark.asyncio
    async def test_resume_accepting_as_is_completes(self):
        """Regression: this used to raise UnboundLocalError inside LangGraph.

        The resume value carried by "accept as-is" must never be ``None``.
        """
        doc = _make_document()
        svc = _doc_service(doc)
        with _GraphHarness(svc) as h:
            config = await _run_to_review(h.graph, "task-accept")

            result = await h.graph.ainvoke(
                Command(resume={"chapters": None, "role_overrides": {}, "paragraph_splits": {}}),
                config=config,
            )

        assert result["doc_id"] == DOC_ID
        # Nothing was rebuilt, so the document was never rewritten
        svc.replace_chapters.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_accepting_leaves_chapters_untouched(self):
        doc = _make_document(n_chapters=4)
        svc = _doc_service(doc)
        with _GraphHarness(svc) as h:
            config = await _run_to_review(h.graph, "task-untouched")
            await h.graph.ainvoke(
                Command(resume={"chapters": None, "role_overrides": {}, "paragraph_splits": {}}),
                config=config,
            )

        assert len(doc.chapters) == 4


class TestEmptyChapterListIsRefused:
    """Guard against wiping a book's chapters."""

    @pytest.mark.asyncio
    async def test_empty_chapter_list_does_not_delete_the_document(self):
        doc = _make_document(n_chapters=3)
        svc = _doc_service(doc)
        with _GraphHarness(svc) as h:
            config = await _run_to_review(h.graph, "task-empty")
            await h.graph.ainvoke(
                Command(resume={"chapters": [], "role_overrides": {}, "paragraph_splits": {}}),
                config=config,
            )

        assert len(doc.chapters) == 3
        svc.replace_chapters.assert_not_awaited()


class TestReviewedStructureIsApplied:
    """The normal path still rebuilds as before."""

    @pytest.mark.asyncio
    async def test_submitted_chapters_replace_the_detected_ones(self):
        doc = _make_document(n_chapters=3)
        svc = _doc_service(doc)
        with _GraphHarness(svc) as h:
            config = await _run_to_review(h.graph, "task-applied")
            await h.graph.ainvoke(
                Command(
                    resume={
                        "chapters": [
                            {"title": "Merged", "role": "body", "start_paragraph_index": 0},
                        ],
                        "role_overrides": {},
                        "paragraph_splits": {},
                    }
                ),
                config=config,
            )

        svc.replace_chapters.assert_awaited_once()
        assert len(doc.chapters) == 1
        assert doc.chapters[0].title == "Merged"
