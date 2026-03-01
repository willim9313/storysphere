"""Unit tests for DocumentService.get_chapter_summary (Phase 3)."""

from __future__ import annotations

import pytest

from domain.documents import Chapter, Document, FileType, Paragraph
from services.document_service import DocumentService


def _make_document_with_summaries() -> Document:
    chapters = [
        Chapter(
            number=1,
            title="The Beginning",
            summary="Alice meets Bob in the garden.",
            paragraphs=[
                Paragraph(text="It was a fine day.", chapter_number=1, position=0),
            ],
        ),
        Chapter(
            number=2,
            title="The Journey",
            summary="They travel to the mountains.",
            paragraphs=[
                Paragraph(text="The road was long.", chapter_number=2, position=0),
            ],
        ),
        Chapter(
            number=3,
            title="No Summary",
            summary=None,
            paragraphs=[
                Paragraph(text="Mystery chapter.", chapter_number=3, position=0),
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
async def service(tmp_path):
    url = f"sqlite+aiosqlite:///{tmp_path}/test.db"
    svc = DocumentService(database_url=url)
    await svc.init_db()
    return svc


class TestGetChapterSummary:
    @pytest.mark.asyncio
    async def test_returns_summary(self, service):
        doc = _make_document_with_summaries()
        await service.save_document(doc)

        summary = await service.get_chapter_summary(doc.id, chapter_number=1)
        assert summary == "Alice meets Bob in the garden."

    @pytest.mark.asyncio
    async def test_returns_none_for_no_summary(self, service):
        doc = _make_document_with_summaries()
        await service.save_document(doc)

        summary = await service.get_chapter_summary(doc.id, chapter_number=3)
        assert summary is None

    @pytest.mark.asyncio
    async def test_returns_none_for_nonexistent_chapter(self, service):
        doc = _make_document_with_summaries()
        await service.save_document(doc)

        summary = await service.get_chapter_summary(doc.id, chapter_number=99)
        assert summary is None

    @pytest.mark.asyncio
    async def test_returns_none_for_nonexistent_document(self, service):
        summary = await service.get_chapter_summary("nonexistent", chapter_number=1)
        assert summary is None
