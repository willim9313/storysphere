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

Single-item runs (``POST /books/:bookId/events/:eventId/analyze``, #7e) are held
the same way with an ``item_id``: two of them on the same event would pay for
the same analysis twice.

Like :mod:`storysphere.api.task_registry`, this is in-process state: valid for
a single uvicorn worker, and empty after a restart (when the background tasks
it tracked are gone too).
"""

from __future__ import annotations

from fastapi.responses import JSONResponse

from storysphere.api import task_registry
from storysphere.api.schemas.common import ErrorResponse

# (kind, book_id, item_id) → task_id; item_id is None for a whole-book batch.
_running: dict[tuple[str, str, str | None], str] = {}


def running(kind: str, book_id: str, item_id: str | None = None) -> str | None:
    """Task id of the run of *kind* going for *book_id* (and *item_id*), or None."""
    key = (kind, book_id, item_id)
    task_id = _running.get(key)
    if task_id is not None and not task_registry.is_live(task_id):
        del _running[key]
        return None
    return task_id


def running_items(kind: str, book_id: str) -> dict[str, str]:
    """``{item_id: task_id}`` for every single-item run of *kind* going for the book."""
    keys = [k for k in _running if k[0] == kind and k[1] == book_id and k[2] is not None]
    items = {k[2]: running(*k) for k in keys}
    return {item: task_id for item, task_id in items.items() if task_id is not None}


def conflict(kind: str, book_id: str, item_id: str | None = None) -> JSONResponse | None:
    """409 when a run of *kind* is already going for the book (or the item).

    ``code`` is ``batch_running`` for a whole-book batch, ``analysis_running``
    for a single item.
    """
    if running(kind, book_id, item_id) is None:
        return None
    if item_id is None:
        detail = f"A {kind} batch is already running for book '{book_id}'"
        code = "batch_running"
    else:
        detail = f"An analysis of {kind} '{item_id}' is already running"
        code = "analysis_running"
    body = ErrorResponse(detail=detail, code=code)
    return JSONResponse(status_code=409, content=body.model_dump())


def hold(kind: str, book_id: str, task_id: str, item_id: str | None = None) -> None:
    """Mark *task_id* — already handed to ``task_runner.launch`` — as the book's
    running batch of *kind*, or the running analysis of *item_id*."""
    _running[(kind, book_id, item_id)] = task_id
