"""Tests for task cancellation and restart reconciliation.

Coverage:
  - POST /tasks/:id/cancel — awaiting_review tasks are marked terminal even
    though no asyncio task exists (they are paused at the review interrupt)
  - POST /tasks/:id/cancel — 404 unknown / 409 already finished
  - _reconcile_stale_tasks — pending/running marked failed after restart,
    awaiting_review preserved
"""

from __future__ import annotations

import uuid

import pytest


def _make_task(status_setter=None) -> str:
    from storysphere.api.store import task_store

    task_id = f"test-{uuid.uuid4()}"
    task_store.create(task_id, kind="ingestion")
    if status_setter:
        status_setter(task_store, task_id)
    return task_id


class TestCancelEndpoint:
    def test_unknown_task_returns_404(self, client):
        resp = client.post(f"/api/v1/tasks/no-such-{uuid.uuid4()}/cancel")
        assert resp.status_code == 404

    def test_finished_task_returns_409(self, client):
        task_id = _make_task(lambda s, t: s.set_completed(t, result={}))
        resp = client.post(f"/api/v1/tasks/{task_id}/cancel")
        assert resp.status_code == 409

    def test_awaiting_review_is_cancelled_terminally(self, client):
        task_id = _make_task(
            lambda s, t: s.set_awaiting_review(t, f"book-{uuid.uuid4()}")
        )
        resp = client.post(f"/api/v1/tasks/{task_id}/cancel")
        assert resp.status_code == 204

        status = client.get(f"/api/v1/tasks/{task_id}/status").json()
        assert status["status"] == "error"
        assert status["error"] == "cancelled"

    def test_running_without_registry_entry_returns_409(self, client):
        # A 'running' task with no asyncio task behind it can't be cancelled
        task_id = _make_task(lambda s, t: s.set_running(t))
        resp = client.post(f"/api/v1/tasks/{task_id}/cancel")
        assert resp.status_code == 409


class TestReconcileStaleTasks:
    @pytest.mark.asyncio
    async def test_running_marked_failed_awaiting_review_kept(self):
        from storysphere.api.main import _reconcile_stale_tasks
        from storysphere.api.store import get_task

        running_id = _make_task(lambda s, t: s.set_running(t))
        awaiting_id = _make_task(
            lambda s, t: s.set_awaiting_review(t, f"book-{uuid.uuid4()}")
        )

        await _reconcile_stale_tasks()

        running = await get_task(running_id)
        assert running.status == "error"
        assert "重啟" in running.error

        awaiting = await get_task(awaiting_id)
        assert awaiting.status == "awaiting_review"
