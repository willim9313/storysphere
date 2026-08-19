"""Shared bookkeeping for background tasks.

Routers hand a coroutine to :func:`launch` and stop worrying about the task
store.  What used to be copy-pasted into every ``_run_*`` function — set
running, catch, mark done or failed, deregister — lives here once.

The contract for a runner coroutine is deliberately small:

* **return a value** → the task completes and that value becomes ``result``
* **raise :class:`TaskAborted`** → the task fails with that exact message.
  This is the "stop early, but for a reason the user should read" path
  (quota exhausted, nothing to process); it exists because ``return`` cannot
  express failure once the supervisor owns ``set_completed``
* **raise anything else** → the task fails with ``str(exc)`` and a traceback
  in the log
* **get cancelled** → the task is marked failed with ``"cancelled"`` and the
  ``CancelledError`` is re-raised so asyncio can finish tearing it down

Registering with :mod:`storysphere.api.task_registry` is not optional here.
It is what makes ``POST /tasks/:taskId/cancel`` work, and doing it in one
place is the point: hand-written runners only remembered to do it twice out
of twenty.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Coroutine
from functools import partial
from typing import Any

from storysphere.api import task_registry
from storysphere.api.store import task_store

logger = logging.getLogger(__name__)


class TaskAborted(Exception):
    """Stop the task early with a message meant for the user.

    Carries no traceback into the log — an aborted task is an expected
    outcome, not a defect.  Use it where a runner previously called
    ``task_store.set_failed(...)`` and returned.
    """


def launch(task_id: str, coro: Coroutine[Any, Any, Any]) -> asyncio.Task:
    """Run *coro* in the background under the supervisor, and make it cancellable.

    The task is registered before this returns, so a ``cancel`` arriving on
    the very next request already finds it.

    ``task_store.create(task_id, ...)`` stays with the endpoint: the task has
    to exist in the store before the client is handed its id, and only the
    endpoint knows the ``kind`` and ``title``.
    """
    task = asyncio.create_task(_supervise(task_id, coro))
    task_registry.register(task_id, task)
    task.add_done_callback(partial(_finalize_if_never_started, task_id, coro))
    return task


def _finalize_if_never_started(
    task_id: str, coro: Coroutine[Any, Any, Any], task: asyncio.Task
) -> None:
    """Cover the one case :func:`_supervise` cannot report on: its own body
    never ran.

    A task cancelled before the event loop gives it its first tick leaves
    ``_supervise`` unstarted — no ``set_running``, no ``except``, no
    ``finally`` — so the task would sit at ``pending`` forever and *coro*
    would never be awaited.  Rare in production (the endpoint returns 202
    many ticks before a cancel request can arrive) but not impossible, and
    a task stuck at ``pending`` has no way back.

    Both calls are idempotent, so the ordinary cancellation path — where
    ``_supervise`` already did this work — is unharmed: closing a finished
    coroutine is a no-op, and the store is simply written the same terminal
    state twice.
    """
    if not task.cancelled():
        return
    coro.close()
    task_store.set_failed(task_id, error="cancelled")
    task_registry.unregister(task_id)


async def _supervise(task_id: str, coro: Coroutine[Any, Any, Any]) -> None:
    task_store.set_running(task_id)
    try:
        result = await coro
        task_store.set_completed(task_id, result=result)
    except TaskAborted as exc:
        logger.warning("Task %s aborted: %s", task_id, exc)
        task_store.set_failed(task_id, error=str(exc))
    except asyncio.CancelledError:
        # Not an error condition — someone asked for this.  Re-raised so the
        # event loop can complete the cancellation; swallowing it would leave
        # asyncio believing the task refused to stop.
        task_store.set_failed(task_id, error="cancelled")
        raise
    except Exception as exc:
        logger.exception("Task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
    finally:
        task_registry.unregister(task_id)


def progress(task_id: str) -> Callable[..., None]:
    """Build the ``progress_callback`` that services already expect.

    Replaces the ``lambda pct, stage: task_store.set_progress(task_id, pct, stage)``
    written out at each call site.  Keyword arguments pass straight through to
    :meth:`set_progress`, so the batch runners keep their ``sub_progress`` /
    ``sub_total`` item counts.
    """

    def _report(pct: int, stage: str, **kwargs: Any) -> None:
        task_store.set_progress(task_id, pct, stage, **kwargs)

    return _report
