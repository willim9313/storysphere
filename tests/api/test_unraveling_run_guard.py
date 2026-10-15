"""One build-overview run per book: #8d reruns and #10e concept inference (#19c).

A knowledge-graph rerun replaces what concept inference reads, and a second
rerun of a step pays the LLM again for output the first is still writing — so
the four rerun steps and concept inference share one lock per book.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tests.api.conftest import hanging_call, poll_until_terminal

BOOK_ID = "doc-1"  # matches the mock_doc fixture's canonical book id
OTHER_BOOK = "doc-2"

_OPS = ["summarization", "feature-extraction", "knowledge-graph", "symbol-discovery", "concepts"]


@pytest.fixture
def guard_client(mock_doc, mock_kg):
    """TestClient whose reruns and concept inferences never finish on their own."""
    from storysphere.api import deps
    from storysphere.api.main import create_app

    app = create_app()

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    app.router.lifespan_context = _noop_lifespan

    doc = mock_doc.get_document.side_effect

    async def _get_doc(doc_id):
        return await doc("doc-1") if doc_id in (BOOK_ID, OTHER_BOOK) else None

    mock_doc.get_document = AsyncMock(side_effect=_get_doc)
    mock_doc.get_document_language = AsyncMock(return_value="zh")
    mock_ci = AsyncMock()
    mock_ci.run_inference.side_effect = hanging_call()
    app.dependency_overrides[deps.get_doc_service] = lambda: mock_doc
    app.dependency_overrides[deps.get_kg_service] = lambda: mock_kg
    app.dependency_overrides[deps.get_concept_inference_service] = lambda: mock_ci

    with (
        patch("storysphere.api.llm_guard._primary_config_error", lambda: None),
        patch("storysphere.api.routers.books._rerun_step", side_effect=hanging_call()),
        TestClient(app, raise_server_exceptions=True) as client,
    ):
        yield client

    app.dependency_overrides.clear()


def _start(client, op: str, book: str = BOOK_ID):
    if op == "concepts":
        return client.post(f"/api/v1/books/{book}/inferred-concepts/run")
    return client.post(f"/api/v1/books/{book}/rerun/{op}")


def _cancel(client, *task_ids: str) -> None:
    for task_id in task_ids:
        client.post(f"/api/v1/tasks/{task_id}/cancel")
        poll_until_terminal(client, task_id)


class TestUnravelingRunGuard:
    @pytest.mark.parametrize("first", _OPS)
    @pytest.mark.parametrize("second", _OPS)
    def test_any_run_blocks_every_op(self, guard_client, first, second):
        task_id = _start(guard_client, first).json()["taskId"]

        resp = _start(guard_client, second)
        assert resp.status_code == 409
        assert resp.json()["code"] == "batch_running"

        _cancel(guard_client, task_id)

    def test_other_book_is_not_blocked(self, guard_client):
        first = _start(guard_client, "knowledge-graph").json()["taskId"]

        resp = _start(guard_client, "knowledge-graph", book=OTHER_BOOK)
        assert resp.status_code == 202

        _cancel(guard_client, first, resp.json()["taskId"])

    def test_a_run_can_start_once_the_previous_one_ends(self, guard_client):
        first = _start(guard_client, "summarization").json()["taskId"]
        _cancel(guard_client, first)

        resp = _start(guard_client, "concepts")
        assert resp.status_code == 202

        _cancel(guard_client, resp.json()["taskId"])

    def test_unknown_book_is_still_404_not_409(self, guard_client):
        task_id = _start(guard_client, "knowledge-graph").json()["taskId"]

        assert _start(guard_client, "summarization", book="no-such-book").status_code == 404

        _cancel(guard_client, task_id)


class TestRunningUnraveling:
    @pytest.mark.parametrize("op", _OPS)
    def test_names_the_op_and_task(self, guard_client, op):
        task_id = _start(guard_client, op).json()["taskId"]

        resp = guard_client.get(f"/api/v1/books/{BOOK_ID}/unraveling/running")
        assert resp.status_code == 200
        assert resp.json() == {"op": op, "taskId": task_id}

        _cancel(guard_client, task_id)

    def test_is_null_when_nothing_runs(self, guard_client):
        resp = guard_client.get(f"/api/v1/books/{BOOK_ID}/unraveling/running")
        assert resp.json() == {"op": None, "taskId": None}

    def test_is_null_once_the_run_ends(self, guard_client):
        task_id = _start(guard_client, "knowledge-graph").json()["taskId"]
        _cancel(guard_client, task_id)

        resp = guard_client.get(f"/api/v1/books/{BOOK_ID}/unraveling/running")
        assert resp.json() == {"op": None, "taskId": None}

    def test_another_books_run_is_not_reported(self, guard_client):
        task_id = _start(guard_client, "concepts", book=OTHER_BOOK).json()["taskId"]

        resp = guard_client.get(f"/api/v1/books/{BOOK_ID}/unraveling/running")
        assert resp.json() == {"op": None, "taskId": None}

        _cancel(guard_client, task_id)
