"""Guards the ``isolated_task_store`` autouse fixture in ``tests/conftest.py``.

Without these, a regression in the fixture is silent: tests would go back to
sharing one store — and, on a machine without a ``.env``, back to writing into
the real ``./var/tasks.db``.  Nothing would fail loudly; results would just
start depending on execution order and on rows left behind by earlier runs.

The two tests below deliberately write a task with **the same id**.  If they
shared a store, whichever ran second would see the other's row.
"""

from __future__ import annotations


def _create(task_id: str = "shared-id") -> None:
    from storysphere.api.store import task_store

    task_store.create(task_id, kind="tension", title="隔離測試")


class TestEachTestGetsAnEmptyStore:
    def test_first_writer_starts_empty(self):
        from storysphere.api.store import task_store

        assert task_store.list() == []
        _create()
        assert len(task_store.list()) == 1

    def test_second_writer_also_starts_empty(self):
        from storysphere.api.store import task_store

        assert task_store.list() == [], "leaked from another test"
        _create()
        assert len(task_store.list()) == 1


class TestRoutersSeeTheSameStore:
    def test_router_module_holds_the_isolated_instance(self):
        """Routers bind the singleton at import time, so they need patching too."""
        from storysphere.api.routers import tasks as tasks_router
        from storysphere.api.store import task_store

        assert tasks_router.task_store is task_store

    def test_task_written_here_is_visible_to_the_endpoint(self, client):
        from storysphere.api.store import task_store

        task_store.create("visible-1", kind="tension", title="看得到嗎")

        resp = client.get("/api/v1/tasks/visible-1/status")
        assert resp.status_code == 200
        assert resp.json()["taskId"] == "visible-1"


class TestBackendIsNotAmbient:
    def test_store_is_in_memory_regardless_of_env(self):
        """The suite must not depend on whether a ``.env`` exists."""
        from storysphere.api.store import MemoryTaskStore, task_store

        assert isinstance(task_store, MemoryTaskStore)
