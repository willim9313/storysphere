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


class _ChapterRow(_Base):
    __tablename__ = "chapters"

    id = Column(String, primary_key=True)
    document_id = Column(String, ForeignKey("documents.id"), nullable=False)
    number = Column(Integer, nullable=False)
    title = Column(String, nullable=True)
    summary = Column(Text, nullable=True)


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
