"""ConceptInferenceStore — SQLite-backed persistence for inferred concepts (B-092).

Mirrors ``LinkPredictionStore`` (F-01); the two side-stores exist for the same
reason and are kept in the same shape so neither has to be re-learned.
"""

from __future__ import annotations

import json
import logging
import time

import aiosqlite

from storysphere.domain.inferred_concepts import InferenceStatus, InferredConcept

logger = logging.getLogger(__name__)

_CREATE_TABLE = """\
CREATE TABLE IF NOT EXISTS inferred_concepts (
    id          TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    name        TEXT NOT NULL,
    data        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  REAL NOT NULL,
    updated_at  REAL NOT NULL
)
"""

_CREATE_INDEXES = [
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_concept_name ON inferred_concepts (document_id, name)",
    "CREATE INDEX IF NOT EXISTS idx_concept_doc_status ON inferred_concepts (document_id, status)",
]


class ConceptInferenceStore:
    """Async SQLite store for inferred thematic concept candidates."""

    def __init__(self, db_path: str = "./var/inferred_concepts.db") -> None:
        self._db_path = db_path

    async def _ensure_schema(self, db: aiosqlite.Connection) -> None:
        await db.execute(_CREATE_TABLE)
        for idx in _CREATE_INDEXES:
            await db.execute(idx)
        await db.commit()

    async def upsert(self, concept: InferredConcept) -> None:
        """Insert *concept*, or refresh the existing row for the same proposition.

        A re-run must not resurrect something a human already rejected, nor
        silently un-confirm something already adopted — a rejected proposition
        that came back as pending would go straight back into the next TEU
        prompt.  So an existing row keeps its id, created_at and status, and
        only the LLM's own output (description, evidence, confidence) is
        refreshed.
        """
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_schema(db)
            cursor = await db.execute(
                "SELECT data FROM inferred_concepts WHERE document_id = ? AND name = ?",
                (concept.document_id, concept.name),
            )
            row = await cursor.fetchone()

            if row is None:
                await db.execute(
                    """INSERT INTO inferred_concepts
                       (id, document_id, name, data, status, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (concept.id, concept.document_id, concept.name,
                     concept.model_dump_json(), concept.status.value,
                     concept.created_at, concept.updated_at),
                )
            else:
                existing = InferredConcept.model_validate_json(row[0])
                merged = concept.model_copy(
                    update={
                        "id": existing.id,
                        "status": existing.status,
                        "confirmed_entity_id": existing.confirmed_entity_id,
                        "created_at": existing.created_at,
                        "updated_at": time.time(),
                    }
                )
                await db.execute(
                    "UPDATE inferred_concepts SET data = ?, updated_at = ? WHERE id = ?",
                    (merged.model_dump_json(), merged.updated_at, merged.id),
                )
            await db.commit()

    async def get(self, concept_id: str) -> InferredConcept | None:
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_schema(db)
            cursor = await db.execute(
                "SELECT data FROM inferred_concepts WHERE id = ?", (concept_id,)
            )
            row = await cursor.fetchone()
        if row is None:
            return None
        return InferredConcept.model_validate_json(row[0])

    async def list_by_document(
        self,
        document_id: str,
        status: InferenceStatus | None = None,
    ) -> list[InferredConcept]:
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_schema(db)
            if status is not None:
                cursor = await db.execute(
                    "SELECT data FROM inferred_concepts WHERE document_id = ? AND status = ?"
                    " ORDER BY updated_at DESC",
                    (document_id, status.value),
                )
            else:
                cursor = await db.execute(
                    "SELECT data FROM inferred_concepts WHERE document_id = ?"
                    " ORDER BY updated_at DESC",
                    (document_id,),
                )
            rows = await cursor.fetchall()
        return [InferredConcept.model_validate_json(row[0]) for row in rows]

    async def update_status(
        self,
        concept_id: str,
        status: InferenceStatus,
        confirmed_entity_id: str | None = None,
    ) -> None:
        now = time.time()
        async with aiosqlite.connect(self._db_path) as db:
            await self._ensure_schema(db)
            cursor = await db.execute(
                "SELECT data FROM inferred_concepts WHERE id = ?", (concept_id,)
            )
            row = await cursor.fetchone()
            if row is None:
                return
            data = json.loads(row[0])
            data["status"] = status.value
            data["updated_at"] = now
            if confirmed_entity_id is not None:
                data["confirmed_entity_id"] = confirmed_entity_id
            await db.execute(
                "UPDATE inferred_concepts SET data = ?, status = ?, updated_at = ? WHERE id = ?",
                (json.dumps(data), status.value, now, concept_id),
            )
            await db.commit()
        logger.debug("InferredConcept %s → %s", concept_id, status.value)
