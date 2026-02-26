"""Unit tests for DocumentService (SQLite/aiosqlite backend)."""

from __future__ import annotations

import pytest

from domain.documents import Chapter, Document, FileType, Paragraph
from services.document_service import DocumentService


def _make_document(num_chapters: int = 2, paras_per_chapter: int = 3) -> Document:
    chapters = []
    for ch_num in range(1, num_chapters + 1):
        paragraphs = [
            Paragraph(
                text=f"Chapter {ch_num} paragraph {i}.",
                chapter_number=ch_num,
                position=i,
                embedding=[0.1] * 384 if i == 0 else None,
            )
            for i in range(paras_per_chapter)
        ]
        chapters.append(Chapter(number=ch_num, title=f"Chapter {ch_num}", paragraphs=paragraphs))
    return Document(
        title="Test Novel",
        author="Test Author",
        file_path="/tmp/test.pdf",
        file_type=FileType.PDF,
        chapters=chapters,
    )


@pytest.fixture
async def service(tmp_path):
    url = f"sqlite+aiosqlite:///{tmp_path}/test.db"
    svc = DocumentService(database_url=url)
    await svc.init_db()
    return svc


class TestDocumentServiceSave:
    @pytest.mark.asyncio
    async def test_save_and_retrieve(self, service):
        doc = _make_document()
        await service.save_document(doc)

        retrieved = await service.get_document(doc.id)
        assert retrieved is not None
        assert retrieved.id == doc.id
        assert retrieved.title == "Test Novel"
        assert retrieved.total_chapters == 2

    @pytest.mark.asyncio
    async def test_retrieved_paragraphs_count(self, service):
        doc = _make_document(num_chapters=2, paras_per_chapter=3)
        await service.save_document(doc)

        retrieved = await service.get_document(doc.id)
        assert retrieved.total_paragraphs == 6

    @pytest.mark.asyncio
    async def test_embedding_roundtrip(self, service):
        """Embeddings stored as JSON should be recovered correctly."""
        doc = _make_document(num_chapters=1, paras_per_chapter=1)
        doc.chapters[0].paragraphs[0].embedding = [0.5] * 384
        await service.save_document(doc)

        retrieved = await service.get_document(doc.id)
        para = retrieved.chapters[0].paragraphs[0]
        assert para.embedding is not None
        assert len(para.embedding) == 384
        assert abs(para.embedding[0] - 0.5) < 1e-6

    @pytest.mark.asyncio
    async def test_get_nonexistent_document_returns_none(self, service):
        result = await service.get_document("nonexistent-id")
        assert result is None

    @pytest.mark.asyncio
    async def test_list_documents(self, service):
        doc1 = _make_document()
        doc2 = _make_document()
        doc2.title = "Another Novel"
        await service.save_document(doc1)
        await service.save_document(doc2)

        docs = await service.list_documents()
        assert len(docs) == 2
        titles = {d["title"] for d in docs}
        assert "Test Novel" in titles
        assert "Another Novel" in titles


class TestDocumentServiceGetParagraphs:
    @pytest.mark.asyncio
    async def test_get_all_paragraphs(self, service):
        doc = _make_document(num_chapters=2, paras_per_chapter=3)
        await service.save_document(doc)

        paragraphs = await service.get_paragraphs(doc.id)
        assert len(paragraphs) == 6

    @pytest.mark.asyncio
    async def test_get_paragraphs_filtered_by_chapter(self, service):
        doc = _make_document(num_chapters=2, paras_per_chapter=3)
        await service.save_document(doc)

        paragraphs = await service.get_paragraphs(doc.id, chapter_number=1)
        assert len(paragraphs) == 3
        assert all(p.chapter_number == 1 for p in paragraphs)

    @pytest.mark.asyncio
    async def test_paragraphs_ordered_by_position(self, service):
        doc = _make_document(num_chapters=1, paras_per_chapter=5)
        await service.save_document(doc)

        paragraphs = await service.get_paragraphs(doc.id, chapter_number=1)
        positions = [p.position for p in paragraphs]
        assert positions == sorted(positions)


class TestDocumentServiceIdempotency:
    @pytest.mark.asyncio
    async def test_save_twice_does_not_duplicate(self, service):
        """Saving the same document twice (upsert) should not create duplicates."""
        doc = _make_document(num_chapters=1, paras_per_chapter=2)
        await service.save_document(doc)
        await service.save_document(doc)  # second save = upsert

        docs = await service.list_documents()
        assert len(docs) == 1
