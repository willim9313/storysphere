"""Tests for GET /api/v1/tasks — LLM Task Center 子任務 B.

Coverage:
  - returns a JSON array
  - a seeded active task appears with camelCase metadata fields
  - response items never carry murmur events
"""

from __future__ import annotations

from uuid import uuid4


def _seed_active(kind: str | None = None, title: str | None = None) -> str:
    """Create a running task in the global store. Returns task_id."""
    from api.store import task_store

    task_id = f"tasklist-{uuid4()}"
    task_store.create(task_id, kind=kind, title=title)
    task_store.set_running(task_id)
    return task_id


class TestListTasksEndpoint:
    def test_returns_array(self, client):
        resp = client.get("/api/v1/tasks")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_seeded_task_appears_with_metadata(self, client):
        task_id = _seed_active(kind="tension", title="第3章 張力分析")
        resp = client.get("/api/v1/tasks")
        assert resp.status_code == 200
        match = next((t for t in resp.json() if t["taskId"] == task_id), None)
        assert match is not None
        assert match["status"] == "running"
        assert match["kind"] == "tension"
        assert match["title"] == "第3章 張力分析"
        assert match["createdAt"] is not None  # camelCase per to_camel

    def test_items_have_no_murmur_events(self, client):
        _seed_active()
        resp = client.get("/api/v1/tasks")
        assert all(t["murmurEvents"] == [] for t in resp.json())
