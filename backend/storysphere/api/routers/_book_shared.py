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


async def analysis_staleness(cache, cache_key: str, document) -> tuple[bool, str | None]:
    """Report ``(is_stale, step)`` for one cached analysis, never raising.

    Wraps :func:`~storysphere.services.cache_invalidation.staleness` with the
    degradation the four analysis endpoints need. Both list endpoints build
    their items inside a ``try`` whose ``except`` moves the entry to
    *unanalyzed*, and the character detail endpoint's ``except`` turns into a
    404 — so an exception raised in here would not surface as an error, it
    would quietly rewrite a present analysis into an absent one. That is the
    exact failure shape B-111's sibling bug had, so the guard lives at the one
    place all four call instead of in four copies.

    A missing document is the ordinary case, not an error: ``staleness``
    already answers "fresh" whenever it cannot tell, and this matches it.
    """
    import logging  # noqa: PLC0415

    from storysphere.services.cache_invalidation import staleness  # noqa: PLC0415

    if document is None:
        return False, None
    try:
        return await staleness(cache, cache_key, document.pipeline_status)
    except Exception:  # noqa: BLE001
        logging.getLogger(__name__).warning(
            "Staleness check failed for key=%s; reporting fresh", cache_key,
            exc_info=True,
        )
        return False, None
