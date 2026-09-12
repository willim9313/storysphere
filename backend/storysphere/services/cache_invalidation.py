"""How a pipeline step affects the analyses derived from it.

Re-running a step regenerates the entities and events the downstream analyses
were built from, so their cached results stop describing the book. What to do
about that depends on how the cache entry is keyed:

The question is **not** how an entry is keyed but whether *this* step
regenerates what the key names. Both maps below are per-step for that reason:
the same family is deleted by one step and reported stale by another.

**Deleted** — the step regenerates the ids in the key, so the entries become
unreachable: no read path can name them again. ``event:`` and ``teu:`` under
"knowledge-graph", which re-extracts every Event; ``character:``,
``epistemic:`` and ``voice_profile:`` likewise, since entity ids are reborn
with the graph; ``sep:`` and ``symbol_analysis:`` under "symbol-discovery".
Marking these would mark something nobody can see, and keeping them only
consumes space.

``symbol_overview:`` is keyed by book id but deleted alongside them, because it
holds no human input — it is a projection of the symbol, entity and event tables,
so recomputing it costs one assembly pass while keeping it would serve a symbol
set the book no longer has.

**Reported stale** — the entry stays reachable but was built from output the
step has since replaced. Two kinds sit here:

- Keyed by book id — ``narrative_structure:``, ``hero_journey:``,
  ``temporal_analysis:``, ``tension_lines:``, ``tension_theme:``. These are
  where the human review state lives: NarrativeStructure.review_status, and
  TensionLine / TensionTheme review_status together with the text a
  ``modified`` review rewrote. Deleting them would throw away work that cannot
  be recomputed.
- Keyed by an id **this** step does not regenerate — ``event:`` and
  ``character:`` under "feature-extraction" (B-111). That step embeds
  paragraphs and extracts keywords; it holds no reference to the KG, so the
  ids in those keys survive it untouched. They are not orphaned, merely built
  on evidence that moved, and deleting them destroyed LLM output that was
  still perfectly reachable.

A family named in neither map for a step is one that step cannot affect:
``epistemic:`` under "feature-extraction" is the worked example —
EpistemicStateService takes only kg_service, llm and cache, so re-embedding
paragraphs neither orphans nor ages it.

Staleness is derived, not stored: an entry is stale when its ``created``
predates the last run of a step it derives from. That needs no field on the
analysis models, and it cannot drift out of sync with the data the way a
stored flag can.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

logger = logging.getLogger(__name__)

# ``{book}`` is substituted with the document id. Patterns use SQLite LIKE
# syntax, so ``%`` matches the per-entity/per-event tail of a key family.
#
# Entries keyed by an id the step regenerates — unreachable afterwards, deleted.
_ORPHANED_CACHES: dict[str, tuple[str, ...]] = {
    "summarization": (),
    # Embeds paragraphs and extracts keywords. It regenerates no id at all —
    # it holds no reference to the KG — so nothing keyed by an entity or event
    # id becomes unreachable here (B-111). `event:` and `character:` do derive
    # from its output and are reported stale below; `epistemic:` does not
    # derive from it at all and is named nowhere.
    "feature-extraction": (
        # Carries per-symbol event counts.
        "symbol_overview:{book}",
    ),
    "knowledge-graph": (
        "character:{book}:%",
        "epistemic:{book}:%",
        "voice_profile:{book}:%",
        # This is the step that re-extracts events, so every event id in a
        # cache key stops existing here (B-108). Left off originally because
        # the event-derived rules were all hung on "feature-extraction", which
        # only embeds paragraphs and extracts keywords — it never touches an
        # Event. The keys were not merely stale afterwards, they were
        # unreachable: nothing can ask for an id the graph no longer has.
        "event:{book}:%",
        # Carries co-occurring entities resolved to name and type.
        "symbol_overview:{book}",
    ),
    "symbol-discovery": (
        "sep:{book}:%",
        "symbol_analysis:{book}:%",
        # Needs its own pattern rather than riding on the one above: that one
        # requires a literal ':' where these keys carry '_', so it never matches
        # them. (LIKE also reads '_' as a single-char wildcard, which is why the
        # separation is worth stating instead of leaving to the eye.)
        "symbol_analysis_block:{book}:%",
        "symbol_overview:{book}",
    ),
}

# Entries keyed by book id — still readable afterwards, kept and reported stale.
_STALED_CACHES: dict[str, tuple[str, ...]] = {
    # Chapter summaries feed the Hero's Journey mapping.
    "summarization": (
        "hero_journey:{book}",
    ),
    # B-111 settled the question B-108 left open. These do age with a re-run:
    # `AnalysisService` builds EEP text evidence from a vector search
    # (analysis_service.py:789) and CEP from a vector search plus
    # `get_entity_keywords` (:471, :485) — both are this step's output. So the
    # two id-keyed families belong here, not in the delete list: their ids
    # survive, and deleting them threw away LLM output nobody asked to lose.
    # `epistemic:` is absent from both lists on purpose — EpistemicStateService
    # takes only kg_service / llm / cache, so this step cannot age it.
    "feature-extraction": (
        "event:{book}:%",
        "character:{book}:%",
        "narrative_structure:{book}",
        "hero_journey:{book}",
        "temporal_analysis:{book}",
        "tension_lines:{book}",
        "tension_theme:{book}",
    ),
    # Events are re-extracted here — the comment above used to say this while
    # sitting on the wrong step (B-108). Every book-level analysis built on
    # events ages when they are regenerated.
    "knowledge-graph": (
        "narrative_structure:{book}",
        "hero_journey:{book}",
        "temporal_analysis:{book}",
        "tension_lines:{book}",
        "tension_theme:{book}",
    ),
    "symbol-discovery": (),
}

# Which steps each book-keyed family derives from — the inverse of the map
# above, used to date an entry against the runs that could have aged it.
_STALE_SOURCES: dict[str, tuple[str, ...]] = {
    family: tuple(
        step for step, pats in _STALED_CACHES.items()
        if any(p.startswith(family + ":") for p in pats)
    )
    for family in {
        p.split(":")[0] for pats in _STALED_CACHES.values() for p in pats
    }
}

# A full ingestion runs every step.
ALL_STEPS = tuple(_ORPHANED_CACHES)


def patterns_for(step: str, book_id: str) -> list[str]:
    """Return the LIKE patterns a step deletes for one book."""
    return [p.format(book=book_id) for p in _ORPHANED_CACHES.get(step, ())]


def stale_sources(cache_key: str) -> tuple[str, ...]:
    """Return the pipeline steps a book-keyed cache entry derives from.

    Empty for a key family that is deleted rather than staled, which reads as
    "never stale" — the entry would not be there to ask about.
    """
    return _STALE_SOURCES.get(cache_key.split(":")[0], ())


# Step name as used in the maps above → the PipelineStatus field prefix.
_STEP_FIELD = {
    "summarization": "summarization",
    "feature-extraction": "feature_extraction",
    "knowledge-graph": "knowledge_graph",
    "symbol-discovery": "symbol_discovery",
}


async def staleness(cache, cache_key: str, pipeline_status) -> tuple[bool, str | None]:
    """Report whether a cached analysis predates the data it was built from.

    Compares the entry's ``created`` against the completion time of each step
    it derives from. Returns ``(is_stale, step)``, where ``step`` names the
    rerun that overtook it.

    Reports fresh whenever the question cannot be answered rather than
    guessing: a family that is deleted on rerun instead of staled, an entry
    that is not there, or a step with no recorded completion — the last means
    it last ran before these timestamps existed, and calling every such book
    stale would flag the entire library at once.
    """
    sources = stale_sources(cache_key)
    if not sources:
        return False, None

    created = await cache.created_at(cache_key)
    if created is None:
        return False, None
    created_at = datetime.fromtimestamp(created, UTC)

    for step in sources:
        ran_at = getattr(pipeline_status, f"{_STEP_FIELD[step]}_at", None)
        if ran_at is None:
            continue
        if ran_at.tzinfo is None:
            ran_at = ran_at.replace(tzinfo=UTC)
        if ran_at > created_at:
            return True, step
    return False, None


def teu_keys_for(event_ids: list[str]) -> list[str]:
    """Return the TEU keys for the given events.

    TEUs are keyed by event id alone, with no book id, so they cannot be
    matched by pattern — the ids have to be collected from the KG *before* the
    step regenerates them, which is "knowledge-graph" (B-108).
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
