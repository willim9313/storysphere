"""SQLite persistence layer for imagery / symbol analysis results.

Connection management follows src/services/analysis_cache.py conventions:
- Each public method opens its own aiosqlite connection context
- _ensure_tables() is called on every connection (idempotent via IF NOT EXISTS)
"""

from __future__ import annotations

import json
import logging

import aiosqlite

from domain.imagery import ImageryEntity, ImageryType, SymbolOccurrence

logger = logging.getLogger(__name__)

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

    def __init__(self, db_path: str = "./data/symbol_store.db") -> None:
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
