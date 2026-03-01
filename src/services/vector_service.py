"""VectorService — Qdrant-backed semantic search.

Wraps ``qdrant-client`` for embedding-based paragraph retrieval.
In development/test mode (``app_env == "development"`` or explicit flag),
an in-memory ``QdrantClient(":memory:")`` is used automatically.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from qdrant_client import QdrantClient, models

logger = logging.getLogger(__name__)


class VectorService:
    """Semantic search over paragraph embeddings stored in Qdrant.

    Usage::

        svc = VectorService()                  # auto-detects dev vs prod
        await svc.ensure_collection()          # idempotent
        results = await svc.search("who is the hero?", top_k=5)
    """

    def __init__(
        self,
        client: QdrantClient | None = None,
        collection_name: str | None = None,
        vector_size: int | None = None,
        in_memory: bool | None = None,
    ) -> None:
        from config.settings import get_settings  # noqa: PLC0415

        settings = get_settings()
        self._collection = collection_name or settings.qdrant_collection
        self._vector_size = vector_size or settings.qdrant_vector_size

        if client is not None:
            self._client = client
        else:
            use_memory = in_memory if in_memory is not None else settings.is_development
            if use_memory:
                self._client = QdrantClient(":memory:")
                logger.info("VectorService: using in-memory Qdrant")
            else:
                self._client = QdrantClient(
                    url=settings.qdrant_url,
                    api_key=settings.qdrant_api_key or None,
                )
                logger.info("VectorService: connecting to %s", settings.qdrant_url)

        self._embedding_fn = None  # lazy

    # ── Collection management ─────────────────────────────────────────────────

    async def ensure_collection(self) -> None:
        """Create the collection if it doesn't exist (idempotent)."""
        existing = [c.name for c in self._client.get_collections().collections]
        if self._collection in existing:
            logger.debug("VectorService: collection '%s' already exists", self._collection)
            return
        self._client.create_collection(
            collection_name=self._collection,
            vectors_config=models.VectorParams(
                size=self._vector_size,
                distance=models.Distance.COSINE,
            ),
        )
        logger.info("VectorService: created collection '%s'", self._collection)

    # ── Search ────────────────────────────────────────────────────────────────

    async def search(
        self,
        query_text: str,
        top_k: int = 5,
        document_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Semantic search: embed *query_text* → Qdrant search → return scored paragraphs.

        Returns list of dicts with keys:
            ``id``, ``score``, ``text``, ``document_id``, ``chapter_number``, ``position``
        """
        query_vector = await self._embed(query_text)

        search_filter = None
        if document_id:
            search_filter = models.Filter(
                must=[
                    models.FieldCondition(
                        key="document_id",
                        match=models.MatchValue(value=document_id),
                    )
                ]
            )

        hits = self._client.query_points(
            collection_name=self._collection,
            query=query_vector,
            limit=top_k,
            query_filter=search_filter,
            with_payload=True,
        )

        results: list[dict[str, Any]] = []
        for point in hits.points:
            payload = point.payload or {}
            results.append(
                {
                    "id": str(point.id),
                    "score": point.score,
                    "text": payload.get("text", ""),
                    "document_id": payload.get("document_id", ""),
                    "chapter_number": payload.get("chapter_number", 0),
                    "position": payload.get("position", 0),
                }
            )
        return results

    # ── Upsert (used by ingestion / tests) ────────────────────────────────────

    async def upsert_paragraphs(
        self,
        paragraphs: list[dict[str, Any]],
    ) -> int:
        """Insert or update paragraph vectors.

        Each dict must contain ``id``, ``embedding``, and payload fields
        (``text``, ``document_id``, ``chapter_number``, ``position``).

        Returns number of points upserted.
        """
        if not paragraphs:
            return 0

        points = [
            models.PointStruct(
                id=p["id"],
                vector=p["embedding"],
                payload={
                    "text": p.get("text", ""),
                    "document_id": p.get("document_id", ""),
                    "chapter_number": p.get("chapter_number", 0),
                    "position": p.get("position", 0),
                },
            )
            for p in paragraphs
        ]
        self._client.upsert(
            collection_name=self._collection,
            points=points,
        )
        return len(points)

    # ── Private: embedding ────────────────────────────────────────────────────

    async def _embed(self, text: str) -> list[float]:
        """Embed a single query string (lazy-loads the embedding model)."""
        if self._embedding_fn is None:
            from pipelines.feature_extraction.embedding_generator import (
                _get_embeddings,
            )

            self._embedding_fn = _get_embeddings()

        import asyncio

        loop = asyncio.get_running_loop()
        vector = await loop.run_in_executor(
            None, self._embedding_fn.embed_query, text
        )
        return vector
