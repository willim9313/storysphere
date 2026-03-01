"""Unit tests for VectorService (Qdrant in-memory backend)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

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
    return VectorService(client=qdrant_client, collection_name="test", vector_size=4)


class TestEnsureCollection:
    @pytest.mark.asyncio
    async def test_creates_collection(self, service, qdrant_client):
        await service.ensure_collection()
        names = [c.name for c in qdrant_client.get_collections().collections]
        assert "test" in names

    @pytest.mark.asyncio
    async def test_idempotent(self, service):
        await service.ensure_collection()
        await service.ensure_collection()  # should not raise


class TestUpsertAndSearch:
    @pytest.mark.asyncio
    async def test_upsert_paragraphs(self, service):
        await service.ensure_collection()
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
            ]
        )
        assert count == 2

    @pytest.mark.asyncio
    async def test_upsert_empty(self, service):
        await service.ensure_collection()
        count = await service.upsert_paragraphs([])
        assert count == 0

    @pytest.mark.asyncio
    async def test_search_returns_results(self, service):
        await service.ensure_collection()
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
            ]
        )
        # Mock embedding to return a vector close to p1
        with patch.object(service, "_embed", new_callable=AsyncMock) as mock_embed:
            mock_embed.return_value = [0.9, 0.1, 0.0, 0.0]
            results = await service.search("hero bravery", top_k=2)

        assert len(results) == 2
        assert results[0]["text"] == "The hero fought bravely."
        assert results[0]["score"] > results[1]["score"]

    @pytest.mark.asyncio
    async def test_search_with_document_filter(self, service):
        await service.ensure_collection()
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
                {
                    "id": "00000000-0000-0000-0000-000000000002",
                    "embedding": [0.9, 0.1, 0.0, 0.0],
                    "text": "Doc2 content.",
                    "document_id": "doc2",
                    "chapter_number": 1,
                    "position": 0,
                },
            ]
        )
        # Need to create payload index for filtering
        service._client.create_payload_index(
            collection_name="test",
            field_name="document_id",
            field_schema="keyword",
        )
        with patch.object(service, "_embed", new_callable=AsyncMock) as mock_embed:
            mock_embed.return_value = [1.0, 0.0, 0.0, 0.0]
            results = await service.search("content", top_k=5, document_id="doc1")

        assert len(results) == 1
        assert results[0]["document_id"] == "doc1"
