"""Unit tests for VectorService (Qdrant in-memory backend, per-book collections)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from qdrant_client import QdrantClient

from services.vector_service import VectorService


@pytest.fixture
def qdrant_client():
    """In-memory Qdrant client for testing."""
    return QdrantClient(":memory:")


@pytest.fixture
def service(qdrant_client):
    """VectorService with in-memory backend."""
    return VectorService(client=qdrant_client, vector_size=4, prefix="test")


class TestCollectionNaming:
    def test_collection_name_for(self):
        assert VectorService.collection_name_for("doc1") == "storysphere_book_doc1"
        assert VectorService.collection_name_for("doc1", "custom") == "custom_doc1"

    def test_col_uses_instance_prefix(self, service):
        assert service._col("abc") == "test_abc"


class TestEnsureCollection:
    @pytest.mark.asyncio
    async def test_creates_collection(self, service, qdrant_client):
        await service.ensure_collection("doc-test")
        names = [c.name for c in qdrant_client.get_collections().collections]
        assert "test_doc-test" in names

    @pytest.mark.asyncio
    async def test_idempotent(self, service):
        await service.ensure_collection("doc1")
        await service.ensure_collection("doc1")  # should not raise


class TestDeleteCollection:
    @pytest.mark.asyncio
    async def test_delete_existing(self, service, qdrant_client):
        await service.ensure_collection("doc1")
        result = await service.delete_collection("doc1")
        assert result is True
        names = [c.name for c in qdrant_client.get_collections().collections]
        assert "test_doc1" not in names

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self, service):
        result = await service.delete_collection("no-such-doc")
        assert result is False


class TestListBookCollections:
    @pytest.mark.asyncio
    async def test_list_empty(self, service):
        assert service.list_book_collections() == []

    @pytest.mark.asyncio
    async def test_list_multiple(self, service):
        await service.ensure_collection("doc1")
        await service.ensure_collection("doc2")
        ids = service.list_book_collections()
        assert sorted(ids) == ["doc1", "doc2"]


class TestUpsertAndSearch:
    @pytest.mark.asyncio
    async def test_upsert_paragraphs(self, service):
        count = await service.upsert_paragraphs(
            [
                {
                    "id": "00000000-0000-0000-0000-000000000001",
                    "embedding": [0.1, 0.2, 0.3, 0.4],
                    "text": "Hello world",
                    "document_id": "doc1",
                    "chapter_number": 1,
                    "position": 0,
                },
                {
                    "id": "00000000-0000-0000-0000-000000000002",
                    "embedding": [0.5, 0.6, 0.7, 0.8],
                    "text": "Goodbye world",
                    "document_id": "doc1",
                    "chapter_number": 1,
                    "position": 1,
                },
            ],
            document_id="doc1",
        )
        assert count == 2

    @pytest.mark.asyncio
    async def test_upsert_empty(self, service):
        count = await service.upsert_paragraphs([])
        assert count == 0

    @pytest.mark.asyncio
    async def test_upsert_infers_document_id(self, service):
        """When document_id not passed explicitly, infer from first paragraph."""
        count = await service.upsert_paragraphs(
            [
                {
                    "id": "00000000-0000-0000-0000-000000000010",
                    "embedding": [0.1, 0.2, 0.3, 0.4],
                    "text": "Inferred doc",
                    "document_id": "doc-inferred",
                    "chapter_number": 1,
                    "position": 0,
                },
            ],
        )
        assert count == 1
        assert "doc-inferred" in service.list_book_collections()

    @pytest.mark.asyncio
    async def test_search_returns_results(self, service):
        await service.upsert_paragraphs(
            [
                {
                    "id": "00000000-0000-0000-0000-000000000001",
                    "embedding": [1.0, 0.0, 0.0, 0.0],
                    "text": "The hero fought bravely.",
                    "document_id": "doc1",
                    "chapter_number": 1,
                    "position": 0,
                },
                {
                    "id": "00000000-0000-0000-0000-000000000002",
                    "embedding": [0.0, 1.0, 0.0, 0.0],
                    "text": "The villain laughed.",
                    "document_id": "doc1",
                    "chapter_number": 2,
                    "position": 0,
                },
            ],
            document_id="doc1",
        )
        with patch.object(service, "_embed", new_callable=AsyncMock) as mock_embed:
            mock_embed.return_value = [0.9, 0.1, 0.0, 0.0]
            results = await service.search("hero bravery", top_k=2, document_id="doc1")

        assert len(results) == 2
        assert results[0]["text"] == "The hero fought bravely."
        assert results[0]["score"] > results[1]["score"]

    @pytest.mark.asyncio
    async def test_cross_book_search(self, service):
        """Search across multiple book collections when document_id=None."""
        await service.upsert_paragraphs(
            [
                {
                    "id": "00000000-0000-0000-0000-000000000001",
                    "embedding": [1.0, 0.0, 0.0, 0.0],
                    "text": "Doc1 content.",
                    "document_id": "doc1",
                    "chapter_number": 1,
                    "position": 0,
                },
            ],
            document_id="doc1",
        )
        await service.upsert_paragraphs(
            [
                {
                    "id": "00000000-0000-0000-0000-000000000002",
                    "embedding": [0.9, 0.1, 0.0, 0.0],
                    "text": "Doc2 content.",
                    "document_id": "doc2",
                    "chapter_number": 1,
                    "position": 0,
                },
            ],
            document_id="doc2",
        )
        with patch.object(service, "_embed", new_callable=AsyncMock) as mock_embed:
            mock_embed.return_value = [1.0, 0.0, 0.0, 0.0]
            results = await service.search("content", top_k=5)

        assert len(results) == 2
        doc_ids = {r["document_id"] for r in results}
        assert doc_ids == {"doc1", "doc2"}
