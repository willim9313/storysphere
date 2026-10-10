"""One batch per book and kind: the mutex behind the three analyze-all endpoints.

``POST …/analyze-all`` (#7g events, #7h characters, #15j symbols) skips items
that are already cached, but only once each item's result lands. A second run
started while the first is still going sees the same uncached items and pays
the LLM for every one of them again. Nothing on the task itself says which
book it belongs to, so the page cannot find a running batch after a remount
either — this registry is what both the 409 and the ``…/active`` lookups read.

The check (:func:`conflict`) and the claim (:func:`hold`) are synchronous and
the endpoints call them with no ``await`` in between, so two requests cannot
both pass the check on the same event loop. Whether the held task is still
going is read from :mod:`storysphere.api.task_registry`, which
:func:`storysphere.api.task_runner.launch` registers and the supervisor
unregisters on completion, failure and cancellation alike — so an entry never
outlives its task.

Like :mod:`storysphere.api.task_registry`, this is in-process state: valid for
a single uvicorn worker, and empty after a restart (when the background tasks
it tracked are gone too).
"""

from __future__ import annotations

from fastapi.responses import JSONResponse

from storysphere.api import task_registry
from storysphere.api.schemas.common import ErrorResponse

_running: dict[tuple[str, str], str] = {}


def running(kind: str, book_id: str) -> str | None:
    """Task id of the batch of *kind* running for *book_id*, or None."""
    key = (kind, book_id)
    task_id = _running.get(key)
    if task_id is not None and not task_registry.is_live(task_id):
        del _running[key]
        return None
    return task_id


def conflict(kind: str, book_id: str) -> JSONResponse | None:
    """409 ``batch_running`` when a batch of *kind* is already running for the book."""
    if running(kind, book_id) is None:
        return None
    body = ErrorResponse(
        detail=f"A {kind} batch is already running for book '{book_id}'",
        code="batch_running",
    )
    return JSONResponse(status_code=409, content=body.model_dump())


def hold(kind: str, book_id: str, task_id: str) -> None:
    """Mark *task_id* — already handed to ``task_runner.launch`` — as the book's
    running batch of *kind*."""
    _running[(kind, book_id)] = task_id
