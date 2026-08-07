"""SQLite persistence layer for imagery / symbol analysis results.

Connection management follows src/services/analysis_cache.py conventions:
- Each public method opens its own aiosqlite connection context
- _ensure_tables() is called on every connection (idempotent via IF NOT EXISTS)

Also hosts the SEP (Symbol Evidence Profile) assembler — a pure data-aggregation
step (no LLM) that pulls from SymbolService + DocumentService + KGService and
persists the result in AnalysisCache under ``sep:{book_id}:{imagery_id}``.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING

import aiosqlite

from storysphere.domain.documents import ChapterRole
from storysphere.domain.imagery import ImageryEntity, ImageryType, SymbolOccurrence
from storysphere.domain.symbol_analysis import (
    SEP,
    CoOccurringEntityRef,
    CoOccurringImageryRef,
    SEPOccurrenceContext,
    SymbolOverview,
    SymbolOverviewItem,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable

    from storysphere.domain.documents import Document, Paragraph
    from storysphere.domain.entities import Entity
    from storysphere.services.analysis_cache import AnalysisCache
    from storysphere.services.document_service import DocumentService
    from storysphere.services.kg_service import KGService
    from storysphere.services.symbol_graph_service import SymbolGraphService

logger = logging.getLogger(__name__)

_SEP_ASSEMBLER_TAG = "symbol_service_v1"
_SEP_PEAK_CHAPTER_COUNT = 3

# Ally lists are read as a complete set (the UI shows a count next to the top few),
# so take the whole neighbourhood rather than a display-sized slice. Matches the
# ceiling #15c allows for its own top_k.
_OVERVIEW_ALLY_LIMIT = 50

_CREATE_IMAGERY_TABLE = """\
CREATE TABLE IF NOT EXISTS imagery_entities (
    id                      TEXT PRIMARY KEY,
    book_id                 TEXT NOT NULL,
    term                    TEXT NOT NULL,
    imagery_type            TEXT NOT NULL,
    aliases_json            TEXT NOT NULL DEFAULT '[]',
    frequency               INTEGER NOT NULL DEFAULT 0,
    chapter_distribution_json TEXT NOT NULL DEFAULT '{}'
);
"""

_CREATE_IMAGERY_INDEX = """\
CREATE INDEX IF NOT EXISTS idx_imagery_book ON imagery_entities(book_id);
"""

_CREATE_OCCURRENCE_TABLE = """\
CREATE TABLE IF NOT EXISTS symbol_occurrences (
    id                  TEXT PRIMARY KEY,
    imagery_id          TEXT NOT NULL,
    book_id             TEXT NOT NULL,
    paragraph_id        TEXT NOT NULL,
    chapter_number      INTEGER NOT NULL,
    position            INTEGER NOT NULL,
    context_window      TEXT NOT NULL DEFAULT '',
    co_occurring_json   TEXT NOT NULL DEFAULT '[]'
);
"""

_CREATE_OCCURRENCE_INDEX_IMAGERY = """\
CREATE INDEX IF NOT EXISTS idx_occ_imagery ON symbol_occurrences(imagery_id);
"""

_CREATE_OCCURRENCE_INDEX_BOOK = """\
CREATE INDEX IF NOT EXISTS idx_occ_book ON symbol_occurrences(book_id);
"""


class SymbolService:
    """Async SQLite store for ImageryEntity and SymbolOccurrence records."""

    def __init__(self, db_path: str = "./var/symbol_store.db") -> None:
        self._db_path = db_path

    async def _ensure_tables(self, db: aiosqlite.Connection) -> None:
        await db.execute(_CREATE_IMAGERY_TABLE)
        await db.execute(_CREATE_IMAGERY_INDEX)
        await db.execute(_CREATE_OCCURRENCE_TABLE)
        await db.execute(_CREATE_OCCURRENCE_INDEX_IMAGERY)
        await db.execute(_CREATE_OCCURRENCE_INDEX_BOOK)
        await db.commit()

    async def init_db(self) -> None:
        """Explicitly initialise tables. Call from IngestionWorkflow at startup."""
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_tables(db)

    # ── ImageryEntity ──────────────────────────────────────────────────────────

    async def save_imagery(self, entity: ImageryEntity) -> None:
        """Upsert an ImageryEntity record."""
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_tables(db)
            await db.execute(
                """\
                INSERT OR REPLACE INTO imagery_entities
                    (id, book_id, term, imagery_type, aliases_json, frequency,
                     chapter_distribution_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    entity.id,
                    entity.book_id,
                    entity.term,
                    entity.imagery_type.value,
                    json.dumps(entity.aliases, ensure_ascii=False),
                    entity.frequency,
                    json.dumps(entity.chapter_distribution, ensure_ascii=False),
                ),
            )
            await db.commit()
        logger.debug("Saved imagery entity id=%s term=%s", entity.id, entity.term)

    async def get_imagery_list(self, book_id: str) -> list[ImageryEntity]:
        """Return all ImageryEntity records for a book, ordered by frequency desc."""
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_tables(db)
            cursor = await db.execute(
                """\
                SELECT id, book_id, term, imagery_type, aliases_json, frequency,
                       chapter_distribution_json
                FROM imagery_entities
                WHERE book_id = ?
                ORDER BY frequency DESC
                """,
                (book_id,),
            )
            rows = await cursor.fetchall()
        return [self._row_to_imagery(r) for r in rows]

    async def get_imagery_by_id(self, imagery_id: str) -> ImageryEntity | None:
        """Return a single ImageryEntity or None."""
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_tables(db)
            cursor = await db.execute(
                """\
                SELECT id, book_id, term, imagery_type, aliases_json, frequency,
                       chapter_distribution_json
                FROM imagery_entities WHERE id = ?
                """,
                (imagery_id,),
            )
            row = await cursor.fetchone()
        if row is None:
            return None
        return self._row_to_imagery(row)

    # ── SymbolOccurrence ───────────────────────────────────────────────────────

    async def save_occurrence(self, occ: SymbolOccurrence) -> None:
        """Upsert a SymbolOccurrence record."""
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_tables(db)
            await db.execute(
                """\
                INSERT OR REPLACE INTO symbol_occurrences
                    (id, imagery_id, book_id, paragraph_id, chapter_number,
                     position, context_window, co_occurring_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    occ.id,
                    occ.imagery_id,
                    occ.book_id,
                    occ.paragraph_id,
                    occ.chapter_number,
                    occ.position,
                    occ.context_window,
                    json.dumps(occ.co_occurring_terms, ensure_ascii=False),
                ),
            )
            await db.commit()

    async def get_occurrences(self, imagery_id: str) -> list[SymbolOccurrence]:
        """Return all occurrences for an imagery entity, ordered by chapter/position."""
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_tables(db)
            cursor = await db.execute(
                """\
                SELECT id, imagery_id, book_id, paragraph_id, chapter_number,
                       position, context_window, co_occurring_json
                FROM symbol_occurrences
                WHERE imagery_id = ?
                ORDER BY chapter_number ASC, position ASC
                """,
                (imagery_id,),
            )
            rows = await cursor.fetchall()
        return [self._row_to_occurrence(r) for r in rows]

    async def get_occurrences_by_book(self, book_id: str) -> list[SymbolOccurrence]:
        """Return all occurrences for a book."""
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_tables(db)
            cursor = await db.execute(
                """\
                SELECT id, imagery_id, book_id, paragraph_id, chapter_number,
                       position, context_window, co_occurring_json
                FROM symbol_occurrences
                WHERE book_id = ?
                ORDER BY chapter_number ASC, position ASC
                """,
                (book_id,),
            )
            rows = await cursor.fetchall()
        return [self._row_to_occurrence(r) for r in rows]

    async def delete_by_book(self, book_id: str) -> int:
        """Delete all imagery and occurrence records for a book. Returns deleted count."""
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_tables(db)
            cursor = await db.execute(
                "DELETE FROM symbol_occurrences WHERE book_id = ?", (book_id,)
            )
            occ_count = cursor.rowcount
            cursor = await db.execute(
                "DELETE FROM imagery_entities WHERE book_id = ?", (book_id,)
            )
            img_count = cursor.rowcount
            await db.commit()
        total = occ_count + img_count
        logger.debug("Deleted %d records for book_id=%s", total, book_id)
        return total

    # ── private helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _row_to_imagery(row: tuple) -> ImageryEntity:
        id_, book_id, term, imagery_type, aliases_json, frequency, dist_json = row
        return ImageryEntity(
            id=id_,
            book_id=book_id,
            term=term,
            imagery_type=ImageryType(imagery_type),
            aliases=json.loads(aliases_json),
            frequency=frequency,
            chapter_distribution={int(k): v for k, v in json.loads(dist_json).items()},
        )

    @staticmethod
    def _row_to_occurrence(row: tuple) -> SymbolOccurrence:
        id_, imagery_id, book_id, paragraph_id, chapter_number, position, ctx, co_json = row
        return SymbolOccurrence(
            id=id_,
            imagery_id=imagery_id,
            book_id=book_id,
            paragraph_id=paragraph_id,
            chapter_number=chapter_number,
            position=position,
            context_window=ctx,
            co_occurring_terms=json.loads(co_json),
        )

    # ── SEP (Symbol Evidence Profile) — B-022 ─────────────────────────────────

    async def assemble_sep(
        self,
        imagery_id: str,
        book_id: str,
        doc_service: DocumentService,
        kg_service: KGService,
        cache: AnalysisCache,
        force: bool = False,
    ) -> SEP:
        """Assemble a SEP for a single imagery entity.

        Pure data aggregation (no LLM). Pulls ImageryEntity + occurrences
        (self), paragraphs (doc_service), and events (kg_service) in parallel,
        then persists the result under ``sep:{book_id}:{imagery_id}``.

        Args:
            imagery_id: The imagery entity ID.
            book_id: The book's document ID.
            doc_service: DocumentService for paragraph lookup.
            kg_service: KGService for event lookup.
            cache: AnalysisCache for persistence.
            force: If True, bypass cache and re-assemble.

        Returns:
            The assembled SEP (also persisted to cache).

        Raises:
            ValueError: If the imagery entity is not found or book_id mismatches.
        """
        cache_key = _sep_cache_key(book_id, imagery_id)

        if not force:
            cached = await cache.get_as(cache_key, SEP)
            if cached is not None:
                logger.debug("SymbolService: cache hit for %s", cache_key)
                return cached

        entity, occurrences, document, events = await asyncio.gather(
            self.get_imagery_by_id(imagery_id),
            self.get_occurrences(imagery_id),
            doc_service.get_document(book_id),
            kg_service.get_events(document_id=book_id),
        )

        if entity is None:
            raise ValueError(f"SymbolService: imagery not found: {imagery_id!r}")
        if entity.book_id != book_id:
            raise ValueError(
                f"SymbolService: imagery {imagery_id!r} belongs to "
                f"book {entity.book_id!r}, not {book_id!r}"
            )
        if document is None:
            raise ValueError(f"SymbolService: book not found: {book_id!r}")

        paragraph_by_id = {
            p.id: p for ch in document.chapters for p in ch.paragraphs
        }

        occurrence_contexts: list[SEPOccurrenceContext] = []
        for occ in occurrences:
            paragraph = paragraph_by_id.get(occ.paragraph_id)
            occurrence_contexts.append(
                SEPOccurrenceContext(
                    occurrence_id=occ.id,
                    paragraph_id=occ.paragraph_id,
                    chapter_number=occ.chapter_number,
                    position=occ.position,
                    paragraph_text=paragraph.text if paragraph is not None else "",
                    context_window=occ.context_window,
                )
            )
        entity_ids, entity_counts = _count_co_occurring_entities(
            occurrences, paragraph_by_id
        )

        chapters_with_imagery = set(entity.chapter_distribution.keys())
        event_ids = [
            ev.id for ev in events if ev.chapter in chapters_with_imagery
        ]

        peak_chapters = [
            ch for ch, _ in sorted(
                entity.chapter_distribution.items(),
                key=lambda kv: kv[1],
                reverse=True,
            )
        ][:_SEP_PEAK_CHAPTER_COUNT]

        sep = SEP(
            imagery_id=entity.id,
            book_id=entity.book_id,
            term=entity.term,
            imagery_type=entity.imagery_type.value,
            frequency=entity.frequency,
            occurrence_contexts=occurrence_contexts,
            co_occurring_entity_ids=sorted(entity_ids),
            co_occurring_entity_counts=entity_counts,
            co_occurring_event_ids=event_ids,
            chapter_distribution=dict(entity.chapter_distribution),
            peak_chapters=peak_chapters,
            assembled_by=_SEP_ASSEMBLER_TAG,
        )

        await cache.set(cache_key, sep.model_dump(mode="json"))
        logger.debug(
            "SymbolService: assembled SEP imagery=%s book=%s contexts=%d entities=%d events=%d",
            imagery_id,
            book_id,
            len(occurrence_contexts),
            len(entity_ids),
            len(event_ids),
        )
        return sep

    async def assemble_overview(
        self,
        book_id: str,
        doc_service: DocumentService,
        kg_service: KGService,
        symbol_graph: SymbolGraphService,
        cache: AnalysisCache,
        force: bool = False,
    ) -> SymbolOverview:
        """Assemble the book-wide behavioural signals for every imagery entity.

        Pure data aggregation (no LLM), and the book-wide counterpart to
        ``assemble_sep``. Loads the document, the event list, and the entity list
        **once each** — calling ``assemble_sep`` per imagery entity re-loads all
        three every time, so ranking a 29-symbol book cost 11 full document loads.

        Deliberately omits per-occurrence paragraph text: the page shows quotes
        only for the selected symbol, which fetches them separately.

        ``interpretation`` is left ``None`` on every item. Interpretations change
        under HITL review independently of this aggregate, so folding them into
        the same cache entry would serve stale review badges; the router overlays
        them per request.

        Args:
            book_id: The book's document ID.
            doc_service: DocumentService for paragraph and chapter-role lookup.
            kg_service: KGService for events and co-occurring entity resolution.
            symbol_graph: SymbolGraphService for imagery-to-imagery co-occurrence.
            cache: AnalysisCache for persistence.
            force: If True, bypass cache and re-assemble.

        Returns:
            The assembled SymbolOverview (also persisted to cache).

        Raises:
            ValueError: If the book is not found.
        """
        cache_key = _overview_cache_key(book_id)

        if not force:
            cached = await cache.get_as(cache_key, SymbolOverview)
            if cached is not None:
                logger.debug("SymbolService: cache hit for %s", cache_key)
                return cached

        entities, occurrences, document, events, kg_entities = await asyncio.gather(
            self.get_imagery_list(book_id),
            self.get_occurrences_by_book(book_id),
            doc_service.get_document(book_id),
            kg_service.get_events(document_id=book_id),
            kg_service.list_entities(document_id=book_id),
        )

        if document is None:
            raise ValueError(f"SymbolService: book not found: {book_id!r}")

        paragraph_by_id = {p.id: p for ch in document.chapters for p in ch.paragraphs}
        entity_by_id = {e.id: e for e in kg_entities}
        chapter_roles = {ch.number: ch.role.value for ch in document.chapters}

        def is_body(chapter: int) -> bool:
            # Fall back to the numeric rule for chapter numbers the document has no
            # entry for, matching the frontend's BODY_CHAPTER_MIN.
            role = chapter_roles.get(chapter)
            return role == ChapterRole.body.value if role is not None else chapter >= 1

        entity_paragraph_counts, body_paragraph_count = _count_entity_paragraphs(
            document, is_body
        )

        body_events_by_chapter: dict[int, int] = {}
        for ev in events:
            if is_body(ev.chapter):
                body_events_by_chapter[ev.chapter] = (
                    body_events_by_chapter.get(ev.chapter, 0) + 1
                )

        occurrences_by_imagery: dict[str, list[SymbolOccurrence]] = {}
        for occ in occurrences:
            occurrences_by_imagery.setdefault(occ.imagery_id, []).append(occ)

        if not symbol_graph._ensure_graph(book_id):
            await symbol_graph.build_graph(book_id, self)
        imagery_by_term = {e.term: e for e in entities}

        items: list[SymbolOverviewItem] = []
        global_chapter_max = 1
        for entity in entities:
            co_pairs = await symbol_graph.get_co_occurrences(
                book_id=book_id, term=entity.term, top_k=_OVERVIEW_ALLY_LIMIT
            )
            items.append(
                _build_overview_item(
                    entity=entity,
                    occurrences=occurrences_by_imagery.get(entity.id, []),
                    paragraph_by_id=paragraph_by_id,
                    entity_by_id=entity_by_id,
                    entity_paragraph_counts=entity_paragraph_counts,
                    body_events_by_chapter=body_events_by_chapter,
                    is_body=is_body,
                    co_pairs=co_pairs,
                    imagery_by_term=imagery_by_term,
                )
            )
            for chapter, count in entity.chapter_distribution.items():
                if is_body(chapter):
                    global_chapter_max = max(global_chapter_max, count)

        overview = SymbolOverview(
            book_id=book_id,
            body_chapter_count=document.body_chapter_count,
            body_paragraph_count=body_paragraph_count,
            chapter_roles=chapter_roles,
            global_chapter_max=global_chapter_max,
            items=items,
            assembled_by=_SEP_ASSEMBLER_TAG,
        )

        await cache.set(cache_key, overview.model_dump(mode="json"))
        logger.debug(
            "SymbolService: assembled overview book=%s imagery=%d body_chapters=%d max=%d",
            book_id,
            len(items),
            overview.body_chapter_count,
            global_chapter_max,
        )
        return overview

    async def get_sep(
        self,
        imagery_id: str,
        book_id: str,
        cache: AnalysisCache,
    ) -> SEP | None:
        """Return a cached SEP or None if missing."""
        return await cache.get_as(_sep_cache_key(book_id, imagery_id), SEP)


def _sep_cache_key(book_id: str, imagery_id: str) -> str:
    return f"sep:{book_id}:{imagery_id}"


def _overview_cache_key(book_id: str) -> str:
    return f"symbol_overview:{book_id}"


def _count_entity_paragraphs(
    document: Document,
    is_body: Callable[[int], bool],
) -> tuple[dict[str, int], int]:
    """Count body paragraphs per entity, and body paragraphs in total.

    This is the base rate a symbol's character attachment is measured against.
    Without it "71% of occurrences sit with this character" is unfalsifiable — a
    protagonist present in most paragraphs produces that number by chance.

    One pass over the book, on data ``assemble_overview`` has already loaded.
    """
    paragraph_counts: dict[str, int] = {}
    total = 0
    for chapter in document.chapters:
        if not is_body(chapter.number):
            continue
        for paragraph in chapter.paragraphs:
            total += 1
            if not paragraph.entities:
                continue
            for entity_id in {pe.entity_id for pe in paragraph.entities}:
                paragraph_counts[entity_id] = paragraph_counts.get(entity_id, 0) + 1
    return paragraph_counts, total


def _resolve_co_occurring_entities(
    entity_counts: dict[str, int],
    body_counts: dict[str, int],
    entity_paragraph_counts: dict[str, int],
    entity_by_id: dict[str, Entity],
    term: str,
) -> tuple[list[CoOccurringEntityRef], int | None]:
    """Turn ``{entity_id: count}`` into named, typed refs sorted by strength.

    Returns the refs and the count for the entity sharing ``term`` as its name.
    A symbol always co-occurs with the KG entity of the same name, and that hit
    outranks every real one — 「海」's top co-occurrence is the location 「海」, 12
    times — so it is removed from the list and reported separately, letting the
    UI say it was filtered instead of silently dropping it.

    Entity IDs with no matching entity are skipped; a dangling reference cannot
    be shown or explained.
    """
    self_match_count: int | None = None
    resolved: list[CoOccurringEntityRef] = []
    for entity_id, count in entity_counts.items():
        kg_entity = entity_by_id.get(entity_id)
        if kg_entity is None:
            continue
        if kg_entity.name == term:
            self_match_count = count
            continue
        resolved.append(
            CoOccurringEntityRef(
                id=kg_entity.id,
                name=kg_entity.name,
                entity_type=kg_entity.entity_type.value,
                count=count,
                body_count=body_counts.get(entity_id, 0),
                paragraph_count=entity_paragraph_counts.get(entity_id, 0),
            )
        )
    resolved.sort(key=lambda ref: (-ref.count, ref.name))
    return resolved, self_match_count


def _build_overview_item(
    entity: ImageryEntity,
    occurrences: list[SymbolOccurrence],
    paragraph_by_id: dict[str, Paragraph],
    entity_by_id: dict[str, Entity],
    entity_paragraph_counts: dict[str, int],
    body_events_by_chapter: dict[int, int],
    is_body: Callable[[int], bool],
    co_pairs: list[tuple[str, int]],
    imagery_by_term: dict[str, ImageryEntity],
) -> SymbolOverviewItem:
    """Assemble one imagery entity's overview row from pre-loaded book data."""
    body_occurrences = [o for o in occurrences if is_body(o.chapter_number)]
    _, entity_counts = _count_co_occurring_entities(occurrences, paragraph_by_id)
    _, body_counts = _count_co_occurring_entities(body_occurrences, paragraph_by_id)
    resolved, self_match_count = _resolve_co_occurring_entities(
        entity_counts,
        body_counts,
        entity_paragraph_counts,
        entity_by_id,
        entity.term,
    )

    # Body chapters only: events sharing a chapter with a colophon mention are not
    # narrative attachment, and counting them inflates every polluted symbol.
    event_count = sum(
        body_events_by_chapter.get(chapter, 0)
        for chapter in entity.chapter_distribution
        if is_body(chapter)
    )

    allies: list[CoOccurringImageryRef] = []
    for co_term, count in co_pairs:
        ally = imagery_by_term.get(co_term)
        if ally is None:
            continue
        allies.append(
            CoOccurringImageryRef(
                term=co_term,
                imagery_id=ally.id,
                co_occurrence_count=count,
                imagery_type=ally.imagery_type.value,
            )
        )

    return SymbolOverviewItem(
        id=entity.id,
        book_id=entity.book_id,
        term=entity.term,
        imagery_type=entity.imagery_type.value,
        aliases=entity.aliases,
        frequency=entity.frequency,
        chapter_distribution=dict(entity.chapter_distribution),
        first_chapter=(
            min(entity.chapter_distribution) if entity.chapter_distribution else None
        ),
        co_occurring_entities=resolved,
        self_match_count=self_match_count,
        co_occurring_event_count=event_count,
        co_occurring_imagery=allies,
    )


def _count_co_occurring_entities(
    occurrences: Iterable[SymbolOccurrence],
    paragraph_by_id: dict[str, Paragraph],
) -> tuple[set[str], dict[str, int]]:
    """Count, per KG entity, how many of these occurrences share its paragraph.

    The counting unit is the ``(occurrence, entity)`` pair: an entity named three
    times in one paragraph still co-occurs once with an imagery occurrence in
    that paragraph.

    Shared by ``assemble_sep`` (one imagery entity) and ``assemble_overview``
    (all of them) so the two cannot drift apart on what "co-occurrence" counts.
    """
    entity_ids: set[str] = set()
    counts: dict[str, int] = {}
    for occ in occurrences:
        paragraph = paragraph_by_id.get(occ.paragraph_id)
        if paragraph is None or not paragraph.entities:
            continue
        seen_in_paragraph: set[str] = set()
        for pe in paragraph.entities:
            entity_ids.add(pe.entity_id)
            if pe.entity_id not in seen_in_paragraph:
                counts[pe.entity_id] = counts.get(pe.entity_id, 0) + 1
                seen_in_paragraph.add(pe.entity_id)
    return entity_ids, counts
