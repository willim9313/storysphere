"""DocumentService — SQLite-backed async document and paragraph storage.

Uses SQLAlchemy 2.x async engine with aiosqlite.  The schema is minimal:
- ``documents``  — one row per ingested novel.
- ``chapters``   — one row per chapter.
- ``paragraphs`` — one row per paragraph (text + embedding as JSON blob).

Phase 2 stores only the serialised domain objects; Phase 3 retrieval tools
will query this via the service interface.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from sqlalchemy import Column, ForeignKey, Integer, String, Text, select
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from domain.documents import Chapter, Document, FileType, Paragraph

logger = logging.getLogger(__name__)


# ── ORM models ───────────────────────────────────────────────────────────────


class _Base(DeclarativeBase):
    pass


class _DocumentRow(_Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    author = Column(String, nullable=True)
    file_path = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    processed_at = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    keywords_json = Column(Text, nullable=True)  # JSON-encoded dict[str, float]


class _ChapterRow(_Base):
    __tablename__ = "chapters"

    id = Column(String, primary_key=True)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    number = Column(Integer, nullable=False)
    title = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    keywords_json = Column(Text, nullable=True)  # JSON-encoded dict[str, float]


class _ParagraphRow(_Base):
    __tablename__ = "paragraphs"

    id = Column(String, primary_key=True)
    chapter_id = Column(String, ForeignKey("chapters.id"), nullable=False)
    document_id = Column(String, nullable=False)
    chapter_number = Column(Integer, nullable=False)
    position = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    embedding_json = Column(Text, nullable=True)  # JSON-encoded list[float]


# ── Service ──────────────────────────────────────────────────────────────────


class DocumentService:
    """Async CRUD service for documents, chapters, and paragraphs.

    Usage::

        service = DocumentService()
        await service.init_db()        # create tables (idempotent)
        await service.save_document(doc)
        doc = await service.get_document(doc_id)
    """

    def __init__(self, database_url: Optional[str] = None) -> None:
        from config.settings import get_settings  # noqa: PLC0415

        settings = get_settings()
        url = database_url or settings.database_url
        self._engine = create_async_engine(url, echo=False)
        self._session_factory = async_sessionmaker(
            self._engine, expire_on_commit=False, class_=AsyncSession
        )

    async def init_db(self) -> None:
        """Create all tables (idempotent — safe to call on every startup)."""
        async with self._engine.begin() as conn:
            await conn.run_sync(_Base.metadata.create_all)
        logger.info("DocumentService: database tables initialised")

    # ── Save ─────────────────────────────────────────────────────────────────

    async def save_document(self, document: Document) -> None:
        """Persist a ``Document`` (and all its chapters/paragraphs) to SQLite.

        Chapters and paragraphs are upserted (delete-then-insert for simplicity).
        """
        async with self._session_factory() as session:
            async with session.begin():
                # Upsert document row
                await session.merge(
                    _DocumentRow(
                        id=document.id,
                        title=document.title,
                        author=document.author,
                        file_path=document.file_path,
                        file_type=document.file_type.value,
                        processed_at=(
                            document.processed_at.isoformat()
                            if document.processed_at
                            else None
                        ),
                        summary=document.summary,
                    )
                )

                for chapter in document.chapters:
                    await session.merge(
                        _ChapterRow(
                            id=chapter.id,
                            document_id=document.id,
                            number=chapter.number,
                            title=chapter.title,
                            summary=chapter.summary,
                        )
                    )
                    for para in chapter.paragraphs:
                        await session.merge(
                            _ParagraphRow(
                                id=para.id,
                                chapter_id=chapter.id,
                                document_id=document.id,
                                chapter_number=para.chapter_number,
                                position=para.position,
                                text=para.text,
                                embedding_json=(
                                    json.dumps(para.embedding) if para.embedding else None
                                ),
                            )
                        )

        logger.info(
            "DocumentService.save_document: id=%s chapters=%d paragraphs=%d",
            document.id,
            document.total_chapters,
            document.total_paragraphs,
        )

    # ── Fetch ─────────────────────────────────────────────────────────────────

    async def get_document(self, document_id: str) -> Optional[Document]:
        """Retrieve a full ``Document`` (with chapters and paragraphs) by ID."""
        async with self._session_factory() as session:
            doc_row = await session.get(_DocumentRow, document_id)
            if doc_row is None:
                return None

            # Fetch chapters
            ch_result = await session.execute(
                select(_ChapterRow)
                .where(_ChapterRow.document_id == document_id)
                .order_by(_ChapterRow.number)
            )
            chapter_rows = ch_result.scalars().all()

            chapters: list[Chapter] = []
            for ch_row in chapter_rows:
                # Fetch paragraphs for this chapter
                para_result = await session.execute(
                    select(_ParagraphRow)
                    .where(_ParagraphRow.chapter_id == ch_row.id)
                    .order_by(_ParagraphRow.position)
                )
                para_rows = para_result.scalars().all()
                paragraphs = [
                    Paragraph(
                        id=pr.id,
                        text=pr.text,
                        chapter_number=pr.chapter_number,
                        position=pr.position,
                        embedding=(
                            json.loads(pr.embedding_json) if pr.embedding_json else None
                        ),
                    )
                    for pr in para_rows
                ]
                chapters.append(
                    Chapter(
                        id=ch_row.id,
                        number=ch_row.number,
                        title=ch_row.title,
                        summary=ch_row.summary,
                        paragraphs=paragraphs,
                    )
                )

            from datetime import datetime  # noqa: PLC0415

            return Document(
                id=doc_row.id,
                title=doc_row.title,
                author=doc_row.author,
                file_path=doc_row.file_path,
                file_type=FileType(doc_row.file_type),
                chapters=chapters,
                summary=doc_row.summary,
                processed_at=(
                    datetime.fromisoformat(doc_row.processed_at)
                    if doc_row.processed_at
                    else None
                ),
            )

    async def list_documents(self) -> list[dict[str, str]]:
        """Return a lightweight list of {id, title, file_type} dicts."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(_DocumentRow.id, _DocumentRow.title, _DocumentRow.file_type)
            )
            return [
                {"id": row.id, "title": row.title, "file_type": row.file_type}
                for row in result.all()
            ]

    async def get_chapter_summary(
        self,
        document_id: str,
        chapter_number: int,
    ) -> str | None:
        """Return the summary text for a specific chapter, or None."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(_ChapterRow.summary).where(
                    _ChapterRow.document_id == document_id,
                    _ChapterRow.number == chapter_number,
                )
            )
            row = result.scalar_one_or_none()
            return row  # summary text or None

    async def get_paragraphs(
        self,
        document_id: str,
        chapter_number: Optional[int] = None,
    ) -> list[Paragraph]:
        """Return paragraphs for a document, optionally filtered by chapter."""
        async with self._session_factory() as session:
            query = select(_ParagraphRow).where(
                _ParagraphRow.document_id == document_id
            )
            if chapter_number is not None:
                query = query.where(_ParagraphRow.chapter_number == chapter_number)
            query = query.order_by(_ParagraphRow.chapter_number, _ParagraphRow.position)
            result = await session.execute(query)
            return [
                Paragraph(
                    id=pr.id,
                    text=pr.text,
                    chapter_number=pr.chapter_number,
                    position=pr.position,
                    embedding=(
                        json.loads(pr.embedding_json) if pr.embedding_json else None
                    ),
                )
                for pr in result.scalars().all()
            ]

    async def get_book_summary(self, document_id: str) -> str | None:
        """Return the book-level summary for a document, or None."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(_DocumentRow.summary).where(_DocumentRow.id == document_id)
            )
            return result.scalar_one_or_none()

    async def save_chapter_summary(
        self, document_id: str, chapter_number: int, summary: str
    ) -> None:
        """Update (or set) the summary for a single chapter."""
        async with self._session_factory() as session:
            async with session.begin():
                result = await session.execute(
                    select(_ChapterRow).where(
                        _ChapterRow.document_id == document_id,
                        _ChapterRow.number == chapter_number,
                    )
                )
                row = result.scalar_one_or_none()
                if row is not None:
                    row.summary = summary

    async def save_book_summary(self, document_id: str, summary: str) -> None:
        """Update (or set) the book-level summary for a document."""
        async with self._session_factory() as session:
            async with session.begin():
                row = await session.get(_DocumentRow, document_id)
                if row is not None:
                    row.summary = summary

    # ── Keywords ─────────────────────────────────────────────────────────────

    async def save_chapter_keywords(
        self, document_id: str, chapter_number: int, keywords: dict[str, float]
    ) -> None:
        """Store keyword scores for a chapter."""
        async with self._session_factory() as session:
            async with session.begin():
                result = await session.execute(
                    select(_ChapterRow).where(
                        _ChapterRow.document_id == document_id,
                        _ChapterRow.number == chapter_number,
                    )
                )
                row = result.scalar_one_or_none()
                if row is not None:
                    row.keywords_json = json.dumps(keywords, ensure_ascii=False)

    async def get_chapter_keywords(
        self, document_id: str, chapter_number: int
    ) -> dict[str, float] | None:
        """Return keyword scores for a chapter, or None."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(_ChapterRow.keywords_json).where(
                    _ChapterRow.document_id == document_id,
                    _ChapterRow.number == chapter_number,
                )
            )
            raw = result.scalar_one_or_none()
            if raw is None:
                return None
            return json.loads(raw)

    async def save_book_keywords(
        self, document_id: str, keywords: dict[str, float]
    ) -> None:
        """Store keyword scores for a book."""
        async with self._session_factory() as session:
            async with session.begin():
                row = await session.get(_DocumentRow, document_id)
                if row is not None:
                    row.keywords_json = json.dumps(keywords, ensure_ascii=False)

    async def get_book_keywords(self, document_id: str) -> dict[str, float] | None:
        """Return keyword scores for a book, or None."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(_DocumentRow.keywords_json).where(_DocumentRow.id == document_id)
            )
            raw = result.scalar_one_or_none()
            if raw is None:
                return None
            return json.loads(raw)

    async def search_chapters_by_keyword(
        self, document_id: str, keyword: str
    ) -> list[dict[str, object]]:
        """Find chapters containing a specific keyword. Returns list of dicts."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(_ChapterRow).where(
                    _ChapterRow.document_id == document_id,
                    _ChapterRow.keywords_json.isnot(None),
                ).order_by(_ChapterRow.number)
            )
            matches: list[dict[str, object]] = []
            keyword_lower = keyword.lower()
            for row in result.scalars().all():
                kws = json.loads(row.keywords_json)
                if keyword_lower in kws:
                    matches.append({
                        "chapter_number": row.number,
                        "title": row.title,
                        "score": kws[keyword_lower],
                    })
            return matches

    # ── Delete ────────────────────────────────────────────────────────────────

    async def delete_document(self, document_id: str) -> None:
        """Delete a document and all its chapters and paragraphs."""
        async with self._session_factory() as session:
            async with session.begin():
                await session.execute(
                    sa_delete(_ParagraphRow).where(
                        _ParagraphRow.document_id == document_id
                    )
                )
                await session.execute(
                    sa_delete(_ChapterRow).where(
                        _ChapterRow.document_id == document_id
                    )
                )
                await session.execute(
                    sa_delete(_DocumentRow).where(
                        _DocumentRow.id == document_id
                    )
                )
        logger.info(
            "DocumentService.delete_document: id=%s", document_id
        )
