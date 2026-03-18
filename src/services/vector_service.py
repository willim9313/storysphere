"""VectorService — Qdrant-backed semantic search with per-book collections.

Each book gets its own Qdrant collection (``storysphere_book_{document_id}``),
enabling clean isolation, fast deletion (drop collection), and simpler
per-book management.

In development/test mode (``app_env == "development"`` or explicit flag),
an in-memory ``QdrantClient(":memory:")`` is used automatically.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from qdrant_client import QdrantClient, models

logger = logging.getLogger(__name__)


class VectorService:
    """Semantic search over paragraph embeddings stored in Qdrant.

    Each book's vectors live in a dedicated collection named
    ``{prefix}_{document_id}``.  The service routes all operations
    to the correct collection based on the ``document_id`` parameter.

    Usage::

        svc = VectorService()
        await svc.ensure_collection("book-123")
        await svc.upsert_paragraphs(paragraphs, document_id="book-123")
        results = await svc.search("who is the hero?", document_id="book-123")
    """

    def __init__(
        self,
        client: QdrantClient | None = None,
        vector_size: int | None = None,
        in_memory: bool | None = None,
        prefix: str | None = None,
    ) -> None:
        from config.settings import get_settings  # noqa: PLC0415

        settings = get_settings()
        self._prefix = prefix or settings.qdrant_collection_prefix
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
        self._created_collections: set[str] = set()  # local cache to avoid repeated checks

    # ── Collection naming ──────────────────────────────────────────────────

    @staticmethod
    def collection_name_for(document_id: str, prefix: str = "storysphere_book") -> str:
        """Derive the Qdrant collection name for a given book."""
        return f"{prefix}_{document_id}"

    def _col(self, document_id: str) -> str:
        """Shorthand: collection name for *document_id* using this instance's prefix."""
        return self.collection_name_for(document_id, self._prefix)

    # ── Collection management ─────────────────────────────────────────────

    async def ensure_collection(self, document_id: str) -> None:
        """Create the per-book collection if it doesn't exist (idempotent)."""
        name = self._col(document_id)
        if name in self._created_collections:
            return
        existing = [c.name for c in self._client.get_collections().collections]
        if name in existing:
            self._created_collections.add(name)
            logger.debug("VectorService: collection '%s' already exists", name)
            return
        self._client.create_collection(
            collection_name=name,
            vectors_config=models.VectorParams(
                size=self._vector_size,
                distance=models.Distance.COSINE,
            ),
        )
        self._created_collections.add(name)
        logger.info("VectorService: created collection '%s'", name)

    async def delete_collection(self, document_id: str) -> bool:
        """Drop a book's collection. Returns True if deleted."""
        name = self._col(document_id)
        existing = [c.name for c in self._client.get_collections().collections]
        if name not in existing:
            return False
        self._client.delete_collection(collection_name=name)
        self._created_collections.discard(name)
        logger.info("VectorService: deleted collection '%s'", name)
        return True

    def list_book_collections(self) -> list[str]:
        """Return document_ids that have collections (filter by prefix)."""
        prefix_with_sep = f"{self._prefix}_"
        doc_ids: list[str] = []
        for col in self._client.get_collections().collections:
            if col.name.startswith(prefix_with_sep):
                doc_ids.append(col.name[len(prefix_with_sep):])
        return doc_ids

    # ── Search ────────────────────────────────────────────────────────────

    async def search(
        self,
        query_text: str,
        top_k: int = 5,
        document_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Semantic search: embed *query_text* → Qdrant search → return scored paragraphs.

        When *document_id* is provided, searches only that book's collection.
        When *document_id* is None, searches across all book collections and
        merges results by score.

        Returns list of dicts with keys:
            ``id``, ``score``, ``text``, ``document_id``, ``chapter_number``, ``position``
        """
        query_vector = await self._embed(query_text)

        if document_id is not None:
            return self._search_collection(
                self._col(document_id), query_vector, top_k
            )

        # Cross-book search
        doc_ids = self.list_book_collections()
        if not doc_ids:
            return []

        tasks = [
            asyncio.ensure_future(
                asyncio.get_running_loop().run_in_executor(
                    None,
                    lambda col=self._col(did): self._client.query_points(
                        collection_name=col,
                        query=query_vector,
                        limit=top_k,
                        with_payload=True,
                    ),
                )
            )
            for did in doc_ids
        ]
        results_lists = await asyncio.gather(*tasks, return_exceptions=True)

        merged: list[dict[str, Any]] = []
        for res in results_lists:
            if isinstance(res, Exception):
                logger.warning("Cross-book search error: %s", res)
                continue
            merged.extend(self._parse_hits(res))

        merged.sort(key=lambda r: r["score"], reverse=True)
        return merged[:top_k]

    def _search_collection(
        self, collection_name: str, query_vector: list[float], top_k: int
    ) -> list[dict[str, Any]]:
        """Search a single collection (sync, called from async context)."""
        hits = self._client.query_points(
            collection_name=collection_name,
            query=query_vector,
            limit=top_k,
            with_payload=True,
        )
        return self._parse_hits(hits)

    @staticmethod
    def _parse_hits(hits) -> list[dict[str, Any]]:
        """Extract result dicts from Qdrant query_points response."""
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

    # ── Keyword search ──────────────────────────────────────────────────

    async def search_by_keyword(
        self,
        keyword: str,
        top_k: int = 10,
        document_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Search paragraphs by keyword match on the ``keywords`` payload field.

        When *document_id* is provided, searches only that book's collection.
        When *document_id* is None, searches across all book collections.

        Returns list of dicts with: ``id``, ``text``, ``document_id``,
        ``chapter_number``, ``position``, ``keyword_scores``.
        """
        kw_filter = models.Filter(
            must=[
                models.FieldCondition(
                    key="keywords",
                    match=models.MatchValue(value=keyword.lower()),
                )
            ]
        )

        if document_id is not None:
            return self._scroll_keyword(self._col(document_id), kw_filter, top_k)

        # Cross-book keyword search
        doc_ids = self.list_book_collections()
        if not doc_ids:
            return []

        merged: list[dict[str, Any]] = []
        for did in doc_ids:
            merged.extend(
                self._scroll_keyword(self._col(did), kw_filter, top_k)
            )
        return merged[:top_k]

    def _scroll_keyword(
        self, collection_name: str, kw_filter: models.Filter, top_k: int
    ) -> list[dict[str, Any]]:
        """Scroll a single collection for keyword matches."""
        scroll_result = self._client.scroll(
            collection_name=collection_name,
            scroll_filter=kw_filter,
            limit=top_k,
            with_payload=True,
        )

        results: list[dict[str, Any]] = []
        points = scroll_result[0] if isinstance(scroll_result, tuple) else scroll_result
        for point in points:
            payload = point.payload or {}
            results.append(
                {
                    "id": str(point.id),
                    "text": payload.get("text", ""),
                    "document_id": payload.get("document_id", ""),
                    "chapter_number": payload.get("chapter_number", 0),
                    "position": payload.get("position", 0),
                    "keyword_scores": payload.get("keyword_scores", {}),
                }
            )
        return results

    # ── Upsert (used by ingestion / tests) ────────────────────────────────

    async def upsert_paragraphs(
        self,
        paragraphs: list[dict[str, Any]],
        document_id: str | None = None,
    ) -> int:
        """Insert or update paragraph vectors into a book's collection.

        Each dict must contain ``id``, ``embedding``, and payload fields
        (``text``, ``document_id``, ``chapter_number``, ``position``).

        When *document_id* is provided, targets that book's collection.
        Otherwise infers from the first paragraph's ``document_id`` field.

        Returns number of points upserted.
        """
        if not paragraphs:
            return 0

        doc_id = document_id or paragraphs[0].get("document_id", "")
        if not doc_id:
            raise ValueError("document_id is required for upsert_paragraphs")

        await self.ensure_collection(doc_id)
        collection_name = self._col(doc_id)

        points = [
            models.PointStruct(
                id=p["id"],
                vector=p["embedding"],
                payload={
                    "text": p.get("text", ""),
                    "document_id": p.get("document_id", ""),
                    "chapter_number": p.get("chapter_number", 0),
                    "position": p.get("position", 0),
                    "keywords": p.get("keywords", []),
                    "keyword_scores": p.get("keyword_scores", {}),
                },
            )
            for p in paragraphs
        ]
        self._client.upsert(
            collection_name=collection_name,
            points=points,
        )
        return len(points)

    # ── Private: embedding ────────────────────────────────────────────────

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
