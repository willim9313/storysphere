"""LinkPredictionStore — SQLite-backed persistence for inferred relations (F-01)."""

from __future__ import annotations

import json
import logging
import time
from typing import Optional

import aiosqlite

from domain.inferred_relations import InferenceStatus, InferredRelation

logger = logging.getLogger(__name__)

_CREATE_TABLE = """\
CREATE TABLE IF NOT EXISTS inferred_relations (
    id          TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    source_id   TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    data        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  REAL NOT NULL,
    updated_at  REAL NOT NULL
)
"""

_CREATE_INDEXES = [
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_pair ON inferred_relations (document_id, source_id, target_id)",
    "CREATE INDEX IF NOT EXISTS idx_doc_status ON inferred_relations (document_id, status)",
]


class LinkPredictionStore:
    """Async SQLite store for inferred relation candidates."""

    def __init__(self, db_path: str = "./data/inferred_relations.db") -> None:
        self._db_path = db_path

    async def _ensure_schema(self, db: aiosqlite.Connection) -> None:
        await db.execute(_CREATE_TABLE)
        for idx in _CREATE_INDEXES:
            await db.execute(idx)
        await db.commit()

    async def upsert(self, ir: InferredRelation) -> None:
        data = ir.model_dump_json()
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_schema(db)
            # ON CONFLICT preserves the existing id and created_at to avoid UUID rotation.
            await db.execute(
                """INSERT INTO inferred_relations
                   (id, document_id, source_id, target_id, data, status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT (document_id, source_id, target_id) DO UPDATE SET
                       data = excluded.data,
                       status = excluded.status,
                       updated_at = excluded.updated_at""",
                (ir.id, ir.document_id, ir.source_id, ir.target_id,
                 data, ir.status.value, ir.created_at, ir.updated_at),
            )
            await db.commit()

    async def get(self, ir_id: str) -> Optional[InferredRelation]:
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_schema(db)
            cursor = await db.execute(
                "SELECT data FROM inferred_relations WHERE id = ?", (ir_id,)
            )
            row = await cursor.fetchone()
        if row is None:
            return None
        return InferredRelation.model_validate_json(row[0])

    async def list_by_document(
        self,
        document_id: str,
        status: Optional[InferenceStatus] = None,
    ) -> list[InferredRelation]:
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_schema(db)
            if status is not None:
                cursor = await db.execute(
                    "SELECT data FROM inferred_relations WHERE document_id = ? AND status = ? ORDER BY updated_at DESC",
                    (document_id, status.value),
                )
            else:
                cursor = await db.execute(
                    "SELECT data FROM inferred_relations WHERE document_id = ? ORDER BY updated_at DESC",
                    (document_id,),
                )
            rows = await cursor.fetchall()
        return [InferredRelation.model_validate_json(row[0]) for row in rows]

    async def update_status(
        self,
        ir_id: str,
        status: InferenceStatus,
        confirmed_relation_id: Optional[str] = None,
    ) -> None:
        now = time.time()
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_schema(db)
            # Fetch existing, patch status fields, re-serialize
            cursor = await db.execute(
                "SELECT data FROM inferred_relations WHERE id = ?", (ir_id,)
            )
            row = await cursor.fetchone()
            if row is None:
                return
            data = json.loads(row[0])
            data["status"] = status.value
            data["updated_at"] = now
            if confirmed_relation_id is not None:
                data["confirmed_relation_id"] = confirmed_relation_id
            await db.execute(
                "UPDATE inferred_relations SET data = ?, status = ?, updated_at = ? WHERE id = ?",
                (json.dumps(data), status.value, now, ir_id),
            )
            await db.commit()
        logger.debug("InferredRelation %s → %s", ir_id, status.value)

    async def delete_by_document(self, document_id: str) -> int:
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_schema(db)
            cursor = await db.execute(
                "DELETE FROM inferred_relations WHERE document_id = ?", (document_id,)
            )
            await db.commit()
            count = cursor.rowcount
        logger.info("Deleted %d inferred relations for document %s", count, document_id)
        return count
