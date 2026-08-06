"""Which analysis caches a pipeline step invalidates.

Re-running a pipeline step regenerates the entities and events that the
downstream analyses were built from, so their cached results stop describing
the book. Nothing else drops them: entries no longer expire on their own, and
the ids they are keyed by change, so a stale entry would otherwise sit there
until someone cleared it by hand.

Dropping is wholesale, ``review_status`` included. A human verdict on an event
id that no longer exists cannot be carried over, and keeping it would attach a
reviewed marker to an analysis nobody reviewed.
"""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)

# ``{book}`` is substituted with the document id. Patterns use SQLite LIKE
# syntax, so ``%`` matches the per-entity/per-event tail of a key family.
_DERIVED_CACHES: dict[str, tuple[str, ...]] = {
    # Chapter summaries feed the Hero's Journey mapping.
    "summarization": (
        "hero_journey:{book}",
    ),
    # Events and entities are re-extracted, so every analysis keyed by one goes.
    "feature-extraction": (
        "event:{book}:%",
        "character:{book}:%",
        "epistemic:{book}:%",
        "narrative_structure:{book}",
        "hero_journey:{book}",
        "temporal_analysis:{book}",
        "tension_lines:{book}",
        "tension_theme:{book}",
    ),
    # Entities and relations are rebuilt; CEP, epistemic state and voice
    # profiles all read from them.
    "knowledge-graph": (
        "character:{book}:%",
        "epistemic:{book}:%",
        "voice_profile:{book}:%",
    ),
    # Imagery entities are re-discovered, taking their evidence profiles and
    # interpretations with them.
    "symbol-discovery": (
        "sep:{book}:%",
        "symbol_analysis:{book}:%",
    ),
}

# A full ingestion runs every step.
ALL_STEPS = tuple(_DERIVED_CACHES)


def patterns_for(step: str, book_id: str) -> list[str]:
    """Return the LIKE patterns a step invalidates for one book."""
    return [p.format(book=book_id) for p in _DERIVED_CACHES.get(step, ())]


def teu_keys_for(event_ids: list[str]) -> list[str]:
    """Return the TEU keys for the given events.

    TEUs are keyed by event id alone, with no book id, so they cannot be
    matched by pattern — the ids have to be collected from the KG *before* the
    step regenerates them.
    """
    return [f"teu:{eid}" for eid in event_ids]


async def invalidate_for_steps(
    cache,
    book_id: str,
    steps: tuple[str, ...] | list[str],
    teu_keys: list[str] | None = None,
) -> None:
    """Drop every analysis cache derived from ``steps`` for one book.

    Failures are logged and swallowed: losing a cache entry is recoverable by
    re-analysing, but failing the rerun task the user just watched succeed is
    not what they asked for.
    """
    patterns = sorted({p for step in steps for p in patterns_for(step, book_id)})
    patterns += teu_keys or []
    if not patterns:
        return
    try:
        await asyncio.gather(*[cache.invalidate(p) for p in patterns])
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "Analysis cache invalidation failed for book=%s steps=%s: %s",
            book_id, list(steps), exc,
        )
    else:
        logger.info(
            "Invalidated analysis caches for book=%s steps=%s (%d patterns)",
            book_id, list(steps), len(patterns),
        )
