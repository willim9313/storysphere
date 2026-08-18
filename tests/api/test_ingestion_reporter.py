"""Tests for ``TaskStoreReporter`` — the API side of the ingestion reporter port.

The workflow layer no longer imports the task store or the murmur wire model;
it calls the ``IngestionReporter`` protocol and this adapter does the rest.
That seam is worth pinning because ``IngestionWorkflow``'s murmur helper
swallows exceptions: if the adapter's signature stopped matching what the
workflow calls, murmur events would silently stop appearing rather than fail.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from storysphere.api.ingestion_reporter import TaskStoreReporter
from storysphere.api.store import task_store
from storysphere.domain.timeline import TimelineDetectionResult
from storysphere.workflows.ingestion import IngestionResult


def _task() -> str:
    """A unique id — task_store is a global singleton shared across tests."""
    task_id = str(uuid4())
    task_store.create(task_id, kind="ingestion", title="t")
    return task_id


class TestMurmur:
    @pytest.mark.asyncio
    async def test_stores_event_with_all_fields(self):
        task_id = _task()
        reporter = TaskStoreReporter(task_id)

        await reporter.murmur(
            "summarization",
            "topic",
            "a tidbit",
            meta={"chapter": 3},
            raw_content="raw text",
        )

        events = await task_store.get_murmur_events(task_id)
        assert len(events) == 1
        assert events[0].step_key == "summarization"
        assert events[0].type == "topic"
        assert events[0].content == "a tidbit"
        assert events[0].meta == {"chapter": 3}
        assert events[0].raw_content == "raw text"

    @pytest.mark.asyncio
    async def test_optional_fields_default_to_none(self):
        task_id = _task()
        await TaskStoreReporter(task_id).murmur("knowledgeGraph", "character", "Ahab")

        events = await task_store.get_murmur_events(task_id)
        assert events[0].meta is None
        assert events[0].raw_content is None

    @pytest.mark.asyncio
    async def test_seq_is_assigned_by_the_store(self):
        task_id = _task()
        reporter = TaskStoreReporter(task_id)
        for content in ("a", "b", "c"):
            await reporter.murmur("summarization", "topic", content)

        events = await task_store.get_murmur_events(task_id)
        assert [e.seq for e in events] == [0, 1, 2]


class TestStatusForwarding:
    def test_progress_reaches_the_store(self):
        task_id = _task()
        TaskStoreReporter(task_id).progress(
            42, "半途", step_key="summarization", sub_progress=3, sub_total=7
        )

        task = task_store.get(task_id)
        assert task.progress == 42
        assert task.stage == "半途"
        assert task.step_key == "summarization"
        assert task.sub_progress == 3
        assert task.sub_total == 7

    def test_awaiting_review_carries_the_book_id(self):
        task_id = _task()
        TaskStoreReporter(task_id).awaiting_review("book-7")

        task = task_store.get(task_id)
        assert task.status == "awaiting_review"
        assert task.result == {"bookId": "book-7"}

    def test_running(self):
        task_id = _task()
        TaskStoreReporter(task_id).running()
        assert task_store.get(task_id).status == "running"


class TestCompleted:
    def _result(self, timeline: TimelineDetectionResult | None = None) -> IngestionResult:
        return IngestionResult(
            document_id="book-1",
            document_title="Moby Dick",
            errors=["summarization"],
            timeline_detection=timeline,
        )

    def test_returns_and_stores_the_camel_case_payload(self):
        task_id = _task()
        payload = TaskStoreReporter(task_id).completed(self._result())

        assert payload == {"bookId": "book-1", "failedSteps": ["summarization"]}
        task = task_store.get(task_id)
        assert task.status == "done"
        assert task.result == payload

    def test_timeline_detection_is_camel_cased(self):
        task_id = _task()
        timeline = TimelineDetectionResult(
            book_id="book-1",
            chapter_count=12,
            event_count=40,
            ranked_event_count=31,
            chapter_mode_viable=True,
            story_mode_viable=True,
        )
        payload = TaskStoreReporter(task_id).completed(self._result(timeline))

        assert "timelineDetection" in payload
        # snake_case fields must not leak into the wire payload
        assert "chapterCount" in payload["timelineDetection"]
        assert "chapter_count" not in payload["timelineDetection"]

    def test_absent_timeline_detection_is_omitted(self):
        task_id = _task()
        payload = TaskStoreReporter(task_id).completed(self._result())
        assert "timelineDetection" not in payload


class TestCompositionRoot:
    """Pins the wiring that ``main.py``'s lifespan performs.

    The API test suite replaces lifespan with a no-op, so nothing else would
    catch a signature mismatch between ``build_ingestion_graph`` and the
    reporter the API supplies — it would surface only at server startup.
    """

    def test_graph_builds_with_the_real_reporter(self):
        from unittest.mock import AsyncMock

        from langgraph.checkpoint.memory import MemorySaver
        from storysphere.workflows.ingestion_graph import build_ingestion_graph

        graph = build_ingestion_graph(
            MemorySaver(),
            kg_service=AsyncMock(),
            make_reporter=TaskStoreReporter,
        )

        nodes = {n for n in graph.get_graph().nodes if not n.startswith("__")}
        assert nodes == {"phase1", "chapter_review", "phase2"}

    def test_reporter_satisfies_the_protocol_surface(self):
        from storysphere.workflows.ingestion_graph import IngestionReporter

        required = {
            name
            for name in vars(IngestionReporter)
            if not name.startswith("_")
        }
        assert required, "protocol surface should not be empty"
        missing = required - set(dir(TaskStoreReporter))
        assert not missing, f"TaskStoreReporter is missing {missing}"
