"""Token Usage API — exposes LLM token consumption statistics."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from storysphere.api.deps import get_doc_service, get_token_store

router = APIRouter(prefix="/token-usage", tags=["token-usage"])


@router.get("", summary="Token usage statistics")
async def get_token_usage(
    store=Depends(get_token_store),
    doc_service=Depends(get_doc_service),
    range: str = Query(  # noqa: A002
        default="7d",
        description="Time range: today | 7d | 30d | all",
        pattern=r"^(today|7d|30d|all)$",
    ),
    book_id: str | None = Query(
        default=None,
        alias="bookId",
        description=(
            "Narrow every section to one book. Pass '__unattributed__' for the "
            "calls that carry no book."
        ),
    ),
) -> dict[str, Any]:
    """Return aggregated token usage with daily and per-book breakdowns.

    Book titles are joined in here rather than in the store: token usage and
    documents live in separate SQLite files with no relation between them, and
    the store must not reach across into the document service.

    A row in ``byBook`` can have a ``bookId`` with ``title: null`` — the book
    was deleted but its spending is still on record. ``bookId: null`` is the
    separate case of a call that was never attributed to any book.
    """
    from storysphere.core.token_store import TokenUsageStore  # noqa: PLC0415

    since, until = TokenUsageStore.range_to_timestamps(range)
    usage = await store.get_usage(since=since, until=until, book_id=book_id)
    daily = await store.get_daily_usage(since=since, until=until, book_id=book_id)

    titles = {doc.id: doc.title for doc in await doc_service.list_documents()}
    by_book = [
        {**row, "title": titles.get(row["bookId"])} for row in usage.get("byBook", [])
    ]

    return {**usage, "byBook": by_book, "daily": daily}
