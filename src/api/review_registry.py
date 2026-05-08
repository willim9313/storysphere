"""In-process registry for chapter review pause/resume.

When the ingestion workflow reaches the chapter-review checkpoint it registers
an asyncio.Event here and awaits it.  The POST /review endpoint calls
``notify()`` to unblock the workflow and pass the reviewed chapter structure.
"""

from __future__ import annotations

import asyncio
from typing import Any

_events: dict[str, asyncio.Event] = {}
_results: dict[str, Any] = {}


def register(book_id: str) -> asyncio.Event:
    """Create and register a new Event for *book_id*. Returns the Event."""
    event = asyncio.Event()
    _events[book_id] = event
    return event


async def wait(book_id: str) -> Any | None:
    """Suspend until ``notify()`` is called for *book_id*.

    Returns the data passed to ``notify()``, or ``None`` if not found.
    Cleans up on ``CancelledError`` so the registry stays consistent.
    """
    event = _events.get(book_id)
    if event is None:
        return None
    try:
        await event.wait()
    except asyncio.CancelledError:
        _events.pop(book_id, None)
        _results.pop(book_id, None)
        raise
    return _results.pop(book_id, None)


def notify(book_id: str, data: Any) -> bool:
    """Unblock the waiting workflow and pass *data* to it.

    Returns ``True`` if a waiter existed, ``False`` otherwise.
    """
    event = _events.pop(book_id, None)
    if event is None:
        return False
    _results[book_id] = data
    event.set()
    return True


def is_waiting(book_id: str) -> bool:
    """Return True if the workflow for *book_id* is paused at the review step."""
    return book_id in _events
