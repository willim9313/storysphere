"""Unit tests for DocumentService keyword storage (Phase 2b)."""

from __future__ import annotations

import pytest

from domain.documents import Chapter, Document, FileType, Paragraph
from services.document_service import DocumentService


def _make_document() -> Document:
    chapters = [
        Chapter(
            number=1,
            title="The Beginning",
            paragraphs=[
                Paragraph(text="It was a fine day.", chapter_number=1, position=0),
            ],
        ),
        Chapter(
            number=2,
            title="The Journey",
            paragraphs=[
                Paragraph(text="The road was long.", chapter_number=2, position=0),
            ],
        ),
    ]
    return Document(
        title="Test Novel",
        author="Author",
        file_path="/tmp/test.pdf",
        file_type=FileType.PDF,
        chapters=chapters,
    )


@pytest.fixture
async def service():
    svc = DocumentService(database_url="sqlite+aiosqlite:///:memory:")
    await svc.init_db()
    return svc


class TestChapterKeywords:
    async def test_save_and_get_chapter_keywords(self, service):
        doc = _make_document()
        await service.save_document(doc)

        keywords = {"hero": 0.9, "villain": 0.7, "quest": 0.5}
        await service.save_chapter_keywords(doc.id, 1, keywords)

        result = await service.get_chapter_keywords(doc.id, 1)
        assert result == keywords

    async def test_get_chapter_keywords_none_when_not_set(self, service):
        doc = _make_document()
        await service.save_document(doc)
        result = await service.get_chapter_keywords(doc.id, 1)
        assert result is None

    async def test_get_chapter_keywords_nonexistent_chapter(self, service):
        doc = _make_document()
        await service.save_document(doc)
        result = await service.get_chapter_keywords(doc.id, 99)
        assert result is None


class TestBookKeywords:
    async def test_save_and_get_book_keywords(self, service):
        doc = _make_document()
        await service.save_document(doc)

        keywords = {"adventure": 0.95, "friendship": 0.8}
        await service.save_book_keywords(doc.id, keywords)

        result = await service.get_book_keywords(doc.id)
        assert result == keywords

    async def test_get_book_keywords_none_when_not_set(self, service):
        doc = _make_document()
        await service.save_document(doc)
        result = await service.get_book_keywords(doc.id)
        assert result is None


class TestSearchChaptersByKeyword:
    async def test_search_finds_matching_chapters(self, service):
        doc = _make_document()
        await service.save_document(doc)

        await service.save_chapter_keywords(doc.id, 1, {"hero": 0.9, "quest": 0.5})
        await service.save_chapter_keywords(doc.id, 2, {"hero": 0.7, "journey": 0.8})

        results = await service.search_chapters_by_keyword(doc.id, "hero")
        assert len(results) == 2
        assert results[0]["chapter_number"] == 1
        assert results[0]["score"] == 0.9
        assert results[1]["chapter_number"] == 2

    async def test_search_no_match(self, service):
        doc = _make_document()
        await service.save_document(doc)
        await service.save_chapter_keywords(doc.id, 1, {"hero": 0.9})

        results = await service.search_chapters_by_keyword(doc.id, "nonexistent")
        assert results == []
