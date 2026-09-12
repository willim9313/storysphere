"""Unit tests for DocumentService keyword storage (Phase 2b)."""

from __future__ import annotations

import pytest
from storysphere.domain.documents import Chapter, Document, FileType, Paragraph
from storysphere.services.document_service import DocumentService


def _make_document(
    *,
    chapter_keywords: dict[int, dict[str, float]] | None = None,
    book_keywords: dict[str, float] | None = None,
) -> Document:
    """A document whose keywords are seeded the way production seeds them.

    The feature-extraction pipeline sets ``chapter.keywords`` / ``doc.keywords``
    on the objects and lets ``save_document`` persist them; there is no
    single-field writer in the production path (B-118 removed the two that
    nothing called). Seeding through the bulk path is therefore not a
    workaround — it is what these getters actually read in production.
    """
    chapter_keywords = chapter_keywords or {}
    chapters = [
        Chapter(
            number=1,
            title="The Beginning",
            keywords=chapter_keywords.get(1),
            paragraphs=[
                Paragraph(text="It was a fine day.", chapter_number=1, position=0),
            ],
        ),
        Chapter(
            number=2,
            title="The Journey",
            keywords=chapter_keywords.get(2),
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
        keywords=book_keywords,
        chapters=chapters,
    )


@pytest.fixture
async def service():
    svc = DocumentService(database_url="sqlite+aiosqlite:///:memory:")
    await svc.init_db()
    return svc


class TestChapterKeywords:
    async def test_save_and_get_chapter_keywords(self, service):
        keywords = {"hero": 0.9, "villain": 0.7, "quest": 0.5}
        doc = _make_document(chapter_keywords={1: keywords})
        await service.save_document(doc)

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
        keywords = {"adventure": 0.95, "friendship": 0.8}
        doc = _make_document(book_keywords=keywords)
        await service.save_document(doc)

        result = await service.get_book_keywords(doc.id)
        assert result == keywords

    async def test_get_book_keywords_none_when_not_set(self, service):
        doc = _make_document()
        await service.save_document(doc)
        result = await service.get_book_keywords(doc.id)
        assert result is None


class TestSearchChaptersByKeyword:
    async def test_search_finds_matching_chapters(self, service):
        doc = _make_document(chapter_keywords={
            1: {"hero": 0.9, "quest": 0.5},
            2: {"hero": 0.7, "journey": 0.8},
        })
        await service.save_document(doc)

        results = await service.search_chapters_by_keyword(doc.id, "hero")
        assert len(results) == 2
        assert results[0].chapter_number == 1
        assert results[0].score == 0.9
        assert results[1].chapter_number == 2

    async def test_search_no_match(self, service):
        doc = _make_document(chapter_keywords={1: {"hero": 0.9}})
        await service.save_document(doc)

        results = await service.search_chapters_by_keyword(doc.id, "nonexistent")
        assert results == []


class TestParagraphKeywords:
    """段落層 keywords 要能存回來 —— B-102。

    這一段鏈原本只缺中間一節：feature-extraction 逐段抽 keywords、也寫進 Qdrant
    payload，但 `paragraphs` 表沒有欄位，讀回來永遠是 None。閱讀頁的 chunk 關鍵字
    標籤（`ChunkCard`）因此**恆不顯示**——條件式 `chunk.keywords.length > 0` 永遠假。

    三條讀取路徑各測一次：整份文件、逐章段落、依實體查段落。少補任何一條，
    畫面上就是某些地方有標籤、某些地方沒有。
    """

    @pytest.mark.asyncio
    async def test_get_document_round_trips_them(self, service):
        doc = _make_document()
        doc.chapters[0].paragraphs[0].keywords = {"劍": 0.9, "雨": 0.4}
        await service.save_document(doc)

        back = await service.get_document(doc.id)
        assert back.chapters[0].paragraphs[0].keywords == {"劍": 0.9, "雨": 0.4}

    @pytest.mark.asyncio
    async def test_get_paragraphs_round_trips_them(self, service):
        doc = _make_document()
        doc.chapters[0].paragraphs[0].keywords = {"劍": 0.9}
        await service.save_document(doc)

        paragraphs = await service.get_paragraphs(doc.id, 1)
        assert paragraphs[0].keywords == {"劍": 0.9}

    @pytest.mark.asyncio
    async def test_a_paragraph_without_keywords_stays_none(self, service):
        """空 dict 與「沒抽過」是兩回事，但兩者都不該變成 `{}` 之外的東西。"""
        doc = _make_document()
        await service.save_document(doc)

        paragraphs = await service.get_paragraphs(doc.id, 1)
        assert paragraphs[0].keywords is None

    @pytest.mark.asyncio
    async def test_replace_chapters_keeps_them(self, service):
        """章節審閱會走 replace_chapters —— 那條路徑也要帶上 keywords。"""
        doc = _make_document()
        await service.save_document(doc)

        doc.chapters[0].paragraphs[0].keywords = {"風": 0.5}
        await service.replace_chapters(doc)

        paragraphs = await service.get_paragraphs(doc.id, 1)
        assert paragraphs[0].keywords == {"風": 0.5}
