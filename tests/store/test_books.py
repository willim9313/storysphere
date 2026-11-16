from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from storysphere.domain.documents import (
    Chapter,
    ChapterRole,
    Document,
    FileType,
    Paragraph,
    ParagraphRole,
)
from storysphere.store.books import (
    BookParagraphSource,
    BookRow,
    ChapterRow,
    ParagraphRow,
    get_book,
    replace_chapters,
    save_book,
)
from storysphere.store.evidence_writer import QuoteDraft, WriteContext, write_evidence
from storysphere.store.tables import EvidenceQuote

from tests.store.conftest import make_draft

HOLMES = "第一章 演繹的科學\n夏洛克·福爾摩斯從壁爐架的角落拿下一個瓶子。"


def make_document() -> Document:
    """序（不佔章號）＋兩章正文；第一章有標題段與分隔線。"""
    preface = Chapter(
        number=0,
        title="序",
        role=ChapterRole.preface,
        paragraphs=[Paragraph(id="p-pre", text="譯者的話。", chapter_number=0, position=0)],
    )
    first = Chapter(
        number=1,
        title="演繹的科學",
        paragraphs=[
            Paragraph(id="p-1", text=HOLMES, chapter_number=1, position=0, title_span=(0, 9)),
            Paragraph(
                id="p-sep", text="***", chapter_number=1, position=1, role=ParagraphRole.separator
            ),
            Paragraph(id="p-2", text="摩斯坦小姐每年都會收到一顆珍珠。", chapter_number=1, position=2),
        ],
    )
    second = Chapter(
        number=2,
        paragraphs=[Paragraph(id="p-3", text="箱子裡裝滿了寶石。", chapter_number=2, position=0)],
    )
    # 故意不照章號、位置的順序放，讀回來要是排好的。
    first.paragraphs.reverse()
    return Document(
        id="book-1",
        title="四簽名",
        author="柯南·道爾",
        file_path="/books/sign_of_four.txt",
        file_type=FileType.TXT,
        language="zh-tw",
        chapters=[second, first, preface],
        processed_at=datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC),
    )


async def _count(session, table) -> int:
    return await session.scalar(select(func.count()).select_from(table))


class TestSaveAndGet:
    async def test_round_trip_book_fields(self, session):
        document = make_document()
        await save_book(session, document)
        session.expire_all()

        loaded = await get_book(session, "book-1")

        assert (loaded.title, loaded.author, loaded.language) == ("四簽名", "柯南·道爾", "zh-tw")
        assert (loaded.file_path, loaded.file_type) == ("/books/sign_of_four.txt", FileType.TXT)
        assert loaded.uploaded_at == document.uploaded_at
        assert loaded.processed_at == document.processed_at
        assert loaded.uploaded_at.tzinfo is not None

    async def test_genre_fields_default_to_none(self, session):
        await save_book(session, make_document())
        session.expire_all()

        loaded = await get_book(session, "book-1")

        assert loaded.genre_profile is None
        assert loaded.genre_override is None

    async def test_genre_fields_round_trip(self, session):
        document = make_document()
        document.genre_profile = {"primary": "mystery", "confidence": 0.9}
        document.genre_override = "mystery"
        await save_book(session, document)
        session.expire_all()

        loaded = await get_book(session, "book-1")

        assert loaded.genre_profile == {"primary": "mystery", "confidence": 0.9}
        assert loaded.genre_override == "mystery"

    async def test_chapters_ordered_by_number_paragraphs_by_position(self, session):
        await save_book(session, make_document())
        session.expire_all()

        loaded = await get_book(session, "book-1")

        assert [c.number for c in loaded.chapters] == [0, 1, 2]
        assert [c.title for c in loaded.chapters] == ["序", "演繹的科學", None]
        assert [p.id for p in loaded.chapters[1].paragraphs] == ["p-1", "p-sep", "p-2"]
        assert [p.position for p in loaded.chapters[1].paragraphs] == [0, 1, 2]

    async def test_roles_and_title_span_preserved(self, session):
        await save_book(session, make_document())
        session.expire_all()

        loaded = await get_book(session, "book-1")

        assert [c.role for c in loaded.chapters] == [
            ChapterRole.preface,
            ChapterRole.body,
            ChapterRole.body,
        ]
        titled, separator, plain = loaded.chapters[1].paragraphs
        assert titled.title_span == (0, 9)
        assert titled.text == HOLMES
        assert separator.role == ParagraphRole.separator
        assert (plain.role, plain.title_span) == (ParagraphRole.body, None)

    async def test_missing_book_returns_none(self, session):
        assert await get_book(session, "nope") is None


class TestReplaceChapters:
    async def test_rows_replaced_and_book_row_kept(self, session):
        document = make_document()
        await save_book(session, document)
        loaded = await get_book(session, "book-1")

        loaded.chapters = [
            Chapter(
                id="ch-new",
                number=1,
                title="合併後",
                paragraphs=[
                    Paragraph(id="p-new", text="新的段落。", chapter_number=1, position=0),
                    # 沿用舊 id 的段落也要能重新寫入。
                    Paragraph(id="p-2", text="摩斯坦小姐。", chapter_number=1, position=1),
                ],
            )
        ]
        loaded.title = "不該被寫回去的書名"
        await replace_chapters(session, loaded)
        session.expire_all()

        after = await get_book(session, "book-1")
        assert [c.id for c in after.chapters] == ["ch-new"]
        assert [(p.id, p.text) for p in after.chapters[0].paragraphs] == [
            ("p-new", "新的段落。"),
            ("p-2", "摩斯坦小姐。"),
        ]
        assert after.title == "四簽名"
        assert after.uploaded_at == document.uploaded_at
        assert await _count(session, BookRow) == 1
        assert await _count(session, ChapterRow) == 1
        assert await _count(session, ParagraphRow) == 2

    async def test_old_paragraphs_gone(self, session):
        document = make_document()
        await save_book(session, document)

        document.chapters = [document.chapters[0]]
        await replace_chapters(session, document)

        texts = await BookParagraphSource(session).get_texts(["p-pre", "p-1", "p-sep", "p-3"])
        assert texts == {"p-3": "箱子裡裝滿了寶石。"}

    async def test_other_books_untouched(self, session):
        await save_book(session, make_document())
        other = Document(
            id="book-2",
            title="另一本",
            file_path="/books/other.txt",
            file_type=FileType.TXT,
            chapters=[
                Chapter(
                    number=1,
                    paragraphs=[Paragraph(id="q-1", text="別的書。", chapter_number=1, position=0)],
                )
            ],
        )
        await save_book(session, other)

        document = make_document()
        document.chapters = document.chapters[:1]
        await replace_chapters(session, document)
        session.expire_all()

        assert (await get_book(session, "book-2")).total_paragraphs == 1


class TestBookParagraphSource:
    async def test_returns_texts_for_existing_ids(self, session):
        await save_book(session, make_document())

        texts = await BookParagraphSource(session).get_texts(["p-1", "p-3"])

        assert texts == {"p-1": HOLMES, "p-3": "箱子裡裝滿了寶石。"}

    async def test_missing_ids_omitted(self, session):
        await save_book(session, make_document())

        texts = await BookParagraphSource(session).get_texts({"p-2", "no-such-paragraph"})

        assert texts == {"p-2": "摩斯坦小姐每年都會收到一顆珍珠。"}

    async def test_no_ids_returns_empty(self, session):
        assert await BookParagraphSource(session).get_texts([]) == {}

    async def test_quote_verified_against_stored_paragraph(self, session):
        await save_book(session, make_document())
        ctx = WriteContext(book_id="book-1", source="extraction", produced_via="pipeline")
        draft = make_draft(
            "event",
            confidence=0.9,
            quotes=[QuoteDraft(paragraph_id="p-1", text="福爾摩斯從壁爐架的角落拿下一個瓶子")],
        )

        event = await write_evidence(session, ctx, draft, BookParagraphSource(session))

        quote = await session.scalar(
            select(EvidenceQuote).where(EvidenceQuote.evidence_id == event.id)
        )
        assert quote.verified is True
        assert HOLMES[quote.start : quote.end] == quote.text
        assert event.confidence == 0.9
