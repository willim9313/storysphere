"""Books, chapters and paragraphs: tables and the read/write functions.

入庫第一步（解析、切章、切段）的產物存在這裡；`BookParagraphSource` 讓證據寫入層
用段落原文驗證引文。匯入這個模組就會把三張表註冊到 `Base.metadata`（`db.init_db` 會匯入）。

交易慣例同 `store/evidence_writer.py`：這裡的函式只 flush，不 commit，由呼叫端決定交易邊界。
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from storysphere.domain.documents import (
    Chapter,
    ChapterRole,
    Document,
    FileType,
    Paragraph,
    ParagraphRole,
)
from storysphere.domain.genres import GENRES
from storysphere.store.tables import Base, _NullableJSON, _utcnow


class BookRow(Base):
    """一本書。"""

    __tablename__ = "books"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String)
    author: Mapped[str | None] = mapped_column(String, nullable=True)
    file_path: Mapped[str] = mapped_column(String)
    file_type: Mapped[str] = mapped_column(String)
    language: Mapped[str] = mapped_column(String, default="en")
    genre_profile: Mapped[dict[str, Any] | None] = mapped_column(_NullableJSON, nullable=True)
    genre_override: Mapped[str | None] = mapped_column(String, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ChapterRow(Base):
    """章節；`number` 是故事章號，前後附屬內容不佔號（見 `assign_chapter_numbers`）。"""

    __tablename__ = "chapters"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    book_id: Mapped[str] = mapped_column(String, ForeignKey("books.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    role: Mapped[str] = mapped_column(String, default="body")


class ParagraphRow(Base):
    """段落；證據引文的 `paragraph_id` 指向這裡的 id。"""

    __tablename__ = "paragraphs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    chapter_id: Mapped[str] = mapped_column(String, ForeignKey("chapters.id"), index=True)
    book_id: Mapped[str] = mapped_column(String, index=True)
    chapter_number: Mapped[int] = mapped_column(Integer)
    # 章內位置，從 0 起算。
    position: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String, default="body")
    # 章節標題在 text 裡的字元範圍 [start, end]；沒有標題時是 NULL。
    title_span: Mapped[list[int] | None] = mapped_column(_NullableJSON, nullable=True)


def _as_utc(value: datetime | None) -> datetime | None:
    """SQLite 讀回來的時間不帶時區；存進去的都是 UTC，這裡補回來。"""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _chapter_rows(document: Document) -> list[ChapterRow | ParagraphRow]:
    rows: list[ChapterRow | ParagraphRow] = []
    for chapter in document.chapters:
        rows.append(
            ChapterRow(
                id=chapter.id,
                book_id=document.id,
                number=chapter.number,
                title=chapter.title,
                role=chapter.role.value,
            )
        )
    for chapter in document.chapters:
        for para in chapter.paragraphs:
            rows.append(
                ParagraphRow(
                    id=para.id,
                    chapter_id=chapter.id,
                    book_id=document.id,
                    chapter_number=para.chapter_number,
                    position=para.position,
                    text=para.text,
                    role=para.role.value,
                    title_span=list(para.title_span) if para.title_span is not None else None,
                )
            )
    return rows


async def save_book(session: AsyncSession, document: Document) -> None:
    """Insert a ``Document`` with all its chapters and paragraphs."""
    session.add(
        BookRow(
            id=document.id,
            title=document.title,
            author=document.author,
            file_path=document.file_path,
            file_type=document.file_type.value,
            language=document.language,
            genre_profile=document.genre_profile,
            genre_override=document.genre_override,
            uploaded_at=document.uploaded_at,
            processed_at=document.processed_at,
        )
    )
    # 先 flush 書，再 flush 章節與段落：外鍵檢查是開著的，順序不能反。
    await session.flush()
    session.add_all(_chapter_rows(document))
    await session.flush()


async def get_book(session: AsyncSession, book_id: str) -> Document | None:
    """Load a full ``Document`` (chapters by number, paragraphs by position)."""
    book = await session.get(BookRow, book_id)
    if book is None:
        return None

    chapter_rows = (
        await session.scalars(
            select(ChapterRow).where(ChapterRow.book_id == book_id).order_by(ChapterRow.number)
        )
    ).all()

    chapters: list[Chapter] = []
    for chapter_row in chapter_rows:
        paragraph_rows = (
            await session.scalars(
                select(ParagraphRow)
                .where(ParagraphRow.chapter_id == chapter_row.id)
                .order_by(ParagraphRow.position)
            )
        ).all()
        chapters.append(
            Chapter(
                id=chapter_row.id,
                number=chapter_row.number,
                title=chapter_row.title,
                role=ChapterRole(chapter_row.role),
                paragraphs=[
                    Paragraph(
                        id=row.id,
                        text=row.text,
                        chapter_number=row.chapter_number,
                        position=row.position,
                        role=ParagraphRole(row.role),
                        title_span=tuple(row.title_span) if row.title_span else None,
                    )
                    for row in paragraph_rows
                ],
            )
        )

    return Document(
        id=book.id,
        title=book.title,
        author=book.author,
        file_path=book.file_path,
        file_type=FileType(book.file_type),
        chapters=chapters,
        language=book.language,
        genre_profile=book.genre_profile,
        genre_override=book.genre_override,
        uploaded_at=_as_utc(book.uploaded_at),
        processed_at=_as_utc(book.processed_at),
    )


async def set_genre_profile(
    session: AsyncSession, book_id: str, profile: dict[str, Any] | None
) -> None:
    """Write ``books.genre_profile`` (S3 的產出)；不動 ``genre_override``。"""
    book = await session.get(BookRow, book_id)
    if book is None:
        raise LookupError(f"Book '{book_id}' not found")
    book.genre_profile = profile
    await session.flush()


async def set_genre_override(session: AsyncSession, book_id: str, genre: str | None) -> None:
    """Write ``books.genre_override`` (使用者改主題材；``None`` 清除)；不動 ``genre_profile``。

    只寫這一欄，不讀原文、不叫 LLM（02 §5）。
    """
    if genre is not None and genre not in GENRES:
        raise ValueError(f"Unknown genre '{genre}'")
    book = await session.get(BookRow, book_id)
    if book is None:
        raise LookupError(f"Book '{book_id}' not found")
    book.genre_override = genre
    await session.flush()


async def replace_chapters(session: AsyncSession, document: Document) -> None:
    """Delete all chapters/paragraphs of a book and re-insert from ``document``.

    切章審閱改了章節結構之後用。`books` 那一列不動。

    注意：`document.chapters` 是空的時候，這本書的章節與段落會全部被刪掉。
    「空清單＝照原樣接受」的判斷在呼叫端做，這裡不擋。
    """
    await session.execute(delete(ParagraphRow).where(ParagraphRow.book_id == document.id))
    await session.execute(delete(ChapterRow).where(ChapterRow.book_id == document.id))
    # 同一個 session 先前若讀過這些列，identity map 裡還留著；清掉才不會和重新插入的同 id 列衝突。
    session.expire_all()
    session.add_all(_chapter_rows(document))
    await session.flush()


class BookParagraphSource:
    """`ParagraphSource` backed by the ``paragraphs`` table."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_texts(self, paragraph_ids: Iterable[str]) -> dict[str, str]:
        """Return {paragraph_id: text} for the ids that exist."""
        ids = list(paragraph_ids)
        if not ids:
            return {}
        rows = await self._session.execute(
            select(ParagraphRow.id, ParagraphRow.text).where(ParagraphRow.id.in_(ids))
        )
        return {row.id: row.text for row in rows}
