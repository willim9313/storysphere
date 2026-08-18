"""Helpers shared by the book routers.

``books.py`` was split into several routers that all serve the ``/books``
prefix (reader, graph, timeline, analysis).  The few helpers more than one
of them needs live here rather than being imported across routers.
"""

from __future__ import annotations

from datetime import datetime, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def cleanup_ingestion_checkpoint(task_id: str) -> None:
    """Drop the LangGraph checkpoint thread for a finished/cancelled ingestion."""
    from storysphere.api.deps import delete_ingestion_checkpoint  # noqa: PLC0415

    await delete_ingestion_checkpoint(task_id)
