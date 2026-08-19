"""Tests for the shared background-task supervisor.

Coverage:
  - launch() → returned value becomes the task result
  - launch() → the task is "running" while the coroutine runs
  - TaskAborted carries its own message to the user, no traceback
  - any other exception fails the task with str(exc)
  - cancellation marks the task failed and re-raises CancelledError
  - the registry slot is released on every path (so a finished task is no
    longer reported as cancellable)
  - progress() writes through, including the batch item counts

Every test runs against its own ``MemoryTaskStore`` rather than the process
singleton.  Two reasons, both load-bearing:

* **Determinism.** ``Settings.task_store_backend`` defaults to ``"sqlite"``,
  and ``SQLiteTaskStore``'s synchronous writes are fire-and-forget while an
  event loop is running — an async test reading back what it just wrote would
  race.  A test that depends on whether a ``.env`` happens to exist is not a
  test of this module.
* **Scope.** What is under test here is the supervisor's bookkeeping, not the
  store's persistence.  The store has its own tests.
"""

from __future__ import annotations

import asyncio

import pytest


@pytest.fixture
def store(monkeypatch):
    """Swap the module-level singleton for a fresh in-memory store."""
    from storysphere.api import task_runner
    from storysphere.api.store import MemoryTaskStore

    fresh = MemoryTaskStore()
    monkeypatch.setattr(task_runner, "task_store", fresh)
    return fresh


@pytest.fixture
def task_id(store) -> str:
    """A task that already exists in the store, as the endpoint would leave it."""
    store.create("task-1", kind="tension", title="測試任務")
    return "task-1"


class TestCompletion:
    async def test_returned_value_becomes_the_result(self, store, task_id):
        from storysphere.api import task_runner

        async def _work():
            return {"lines": 3, "coverage": 0.8}

        await task_runner.launch(task_id, _work())

        task = store.get(task_id)
        assert task.status == "done"
        assert task.result == {"lines": 3, "coverage": 0.8}
        assert task.progress == 100

    async def test_runner_returning_none_still_completes(self, store, task_id):
        """Several runners have no meaningful result — that is not a failure."""
        from storysphere.api import task_runner

        async def _work():
            return None

        await task_runner.launch(task_id, _work())

        assert store.get(task_id).status == "done"

    async def test_status_is_running_while_the_work_runs(self, store, task_id):
        from storysphere.api import task_runner

        seen: dict[str, str] = {}

        async def _work():
            seen["status"] = store.get(task_id).status
            return {}

        await task_runner.launch(task_id, _work())

        assert seen["status"] == "running"


class TestFailure:
    async def test_exception_fails_the_task_with_its_message(self, store, task_id):
        from storysphere.api import task_runner

        async def _work():
            raise RuntimeError("KG 連線失敗")

        await task_runner.launch(task_id, _work())

        task = store.get(task_id)
        assert task.status == "error"
        assert task.error == "KG 連線失敗"

    async def test_aborted_task_reports_its_own_message(self, store, task_id):
        """The rate-limit path: stop early, but say why in the user's words."""
        from storysphere.api import task_runner

        message = "API 配額已達上限，已處理 7/20 個事件。請稍後再試。"

        async def _work():
            raise task_runner.TaskAborted(message)

        await task_runner.launch(task_id, _work())

        task = store.get(task_id)
        assert task.status == "error"
        assert task.error == message

    async def test_abort_does_not_complete_the_task(self, store, task_id):
        """Guards the trap the batch runners would otherwise fall into.

        They currently ``set_failed(...)`` then ``return``.  Under a supervisor
        that completes on return, a bare ``return`` would silently turn an
        aborted run into a successful one — hence TaskAborted.
        """
        from storysphere.api import task_runner

        async def _work():
            raise task_runner.TaskAborted("配額用盡")

        await task_runner.launch(task_id, _work())

        assert store.get(task_id).status != "done"


class TestCancellation:
    async def test_cancel_marks_failed_and_propagates(self, store, task_id):
        from storysphere.api import task_registry, task_runner

        started = asyncio.Event()

        async def _work():
            started.set()
            await asyncio.sleep(60)

        task = task_runner.launch(task_id, _work())
        await started.wait()

        assert task_registry.cancel(task_id) is True
        with pytest.raises(asyncio.CancelledError):
            await task

        result = store.get(task_id)
        assert result.status == "error"
        assert result.error == "cancelled"

    async def test_launched_task_is_registered_before_launch_returns(self, store, task_id):
        """A cancel arriving on the very next request has to find the task."""
        from storysphere.api import task_registry, task_runner

        async def _work():
            await asyncio.sleep(60)

        task = task_runner.launch(task_id, _work())

        assert task_registry.cancel(task_id) is True
        with pytest.raises(asyncio.CancelledError):
            await task

    async def test_cancel_before_the_supervisor_starts_still_lands_terminal(
        self, store, task_id
    ):
        """Cancelled on the same tick as launch — _supervise never runs.

        Without the done-callback the task would sit at "pending" forever,
        with no way for the user to clear it.
        """
        from storysphere.api import task_registry, task_runner

        async def _work():
            await asyncio.sleep(60)

        task = task_runner.launch(task_id, _work())
        # No await in between: the supervisor has not had a tick yet.
        task_registry.cancel(task_id)

        with pytest.raises(asyncio.CancelledError):
            await task
        await asyncio.sleep(0)  # let the done-callback run

        result = store.get(task_id)
        assert result.status == "error"
        assert result.error == "cancelled"


class TestRegistryRelease:
    @pytest.mark.parametrize(
        "outcome",
        ["success", "exception", "abort"],
        ids=["completed", "failed", "aborted"],
    )
    async def test_slot_is_released_on_every_path(self, store, task_id, outcome):
        from storysphere.api import task_registry, task_runner

        async def _work():
            if outcome == "exception":
                raise RuntimeError("boom")
            if outcome == "abort":
                raise task_runner.TaskAborted("停了")
            return {}

        await task_runner.launch(task_id, _work())

        # Nothing left to cancel — the slot was freed in the ``finally``.
        assert task_registry.cancel(task_id) is False


class TestProgress:
    def test_writes_progress_and_stage_through(self, store, task_id):
        from storysphere.api import task_runner

        task_runner.progress(task_id)(42, "組裝 TEU")

        task = store.get(task_id)
        assert task.progress == 42
        assert task.stage == "組裝 TEU"

    def test_forwards_batch_item_counts(self, store, task_id):
        """The task panel renders "已分析 N/M" from these, not from the bar."""
        from storysphere.api import task_runner

        task_runner.progress(task_id)(50, "分析事件 5/10", sub_progress=5, sub_total=10)

        task = store.get(task_id)
        assert task.sub_progress == 5
        assert task.sub_total == 10
