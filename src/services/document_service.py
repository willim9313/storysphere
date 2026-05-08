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

from sqlalchemy import Column, ForeignKey, Integer, String, Text, func, select
from sqlalchemy import delete as sa_delete
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from domain.documents import Chapter, Document, FileType, Paragraph, ParagraphEntity, PipelineStatus
from services.query_models import ChapterKeywordMatch, DocumentSummary

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
    language = Column(String, nullable=False, server_default="en")
    timeline_config_json = Column(Text, nullable=True)  # JSON-encoded TimelineConfig
    pipeline_status_json = Column(Text, nullable=True)  # JSON-encoded PipelineStatus


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
    entities_json = Column(Text, nullable=True)  # JSON-encoded list[ParagraphEntity]
    title_span_json = Column(Text, nullable=True)  # JSON-encoded [start, end] or null


# ── Service ──────────────────────────────────────────────────────────────────


class DocumentService:
    """Async CRUD service for documents, chapters, and paragraphs.

    Usage::

        service = DocumentService()
        await service.init_db()        # create tables (idempotent)
        await service.save_document(doc)
        doc = await service.get_document(doc_id)
    """

    def __init__(self, database_url: str | None = None) -> None:
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
        # Migrations: add columns to existing tables
        async with self._engine.begin() as conn:
            for stmt in [
                "ALTER TABLE paragraphs ADD COLUMN entities_json TEXT",
                "ALTER TABLE documents ADD COLUMN language TEXT NOT NULL DEFAULT 'en'",
                "ALTER TABLE documents ADD COLUMN timeline_config_json TEXT",
                "ALTER TABLE documents ADD COLUMN pipeline_status_json TEXT",
                "ALTER TABLE paragraphs ADD COLUMN title_span_json TEXT",
            ]:
                try:
                    await conn.execute(sa_text(stmt))
                except Exception:
                    pass  # column already exists
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
                        keywords_json=(
                            json.dumps(document.keywords, ensure_ascii=False)
                            if document.keywords
                            else None
                        ),
                        language=document.language,
                        timeline_config_json=(
                            document.timeline_config.model_dump_json()
                            if document.timeline_config
                            else None
                        ),
                        pipeline_status_json=document.pipeline_status.model_dump_json(),
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
                            keywords_json=(
                                json.dumps(chapter.keywords, ensure_ascii=False)
                                if chapter.keywords
                                else None
                            ),
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
                                entities_json=(
                                    json.dumps(
                                        [e.model_dump() for e in para.entities],
                                        ensure_ascii=False,
                                    )
                                    if para.entities
                                    else None
                                ),
                                title_span_json=(
                                    json.dumps(list(para.title_span))
                                    if para.title_span is not None
                                    else None
                                ),
                            )
                        )

        logger.info(
            "DocumentService.save_document: id=%s chapters=%d paragraphs=%d",
            document.id,
            document.total_chapters,
            document.total_paragraphs,
        )

    async def replace_chapters(self, document: Document) -> None:
        """Delete all chapters/paragraphs for a document and re-insert.

        Used after a chapter-review step changes the chapter structure.
        The document row itself is not modified.
        """
        async with self._session_factory() as session:
            async with session.begin():
                await session.execute(
                    sa_delete(_ParagraphRow).where(
                        _ParagraphRow.document_id == document.id
                    )
                )
                await session.execute(
                    sa_delete(_ChapterRow).where(
                        _ChapterRow.document_id == document.id
                    )
                )
                for chapter in document.chapters:
                    session.add(
                        _ChapterRow(
                            id=chapter.id,
                            document_id=document.id,
                            number=chapter.number,
                            title=chapter.title,
                            summary=chapter.summary,
                            keywords_json=(
                                json.dumps(chapter.keywords, ensure_ascii=False)
                                if chapter.keywords
                                else None
                            ),
                        )
                    )
                    for para in chapter.paragraphs:
                        session.add(
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
                                entities_json=(
                                    json.dumps(
                                        [e.model_dump() for e in para.entities],
                                        ensure_ascii=False,
                                    )
                                    if para.entities
                                    else None
                                ),
                                title_span_json=(
                                    json.dumps(list(para.title_span))
                                    if para.title_span is not None
                                    else None
                                ),
                            )
                        )
        logger.info(
            "DocumentService.replace_chapters: id=%s chapters=%d paragraphs=%d",
            document.id,
            document.total_chapters,
            document.total_paragraphs,
        )

    # ── Fetch ─────────────────────────────────────────────────────────────────

    async def get_document(self, document_id: str) -> Document | None:
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
                        entities=(
                            [ParagraphEntity(**e) for e in json.loads(pr.entities_json)]
                            if pr.entities_json
                            else None
                        ),
                        title_span=(
                            tuple(json.loads(pr.title_span_json))
                            if pr.title_span_json
                            else None
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
                        keywords=(
                            json.loads(ch_row.keywords_json)
                            if ch_row.keywords_json
                            else None
                        ),
                        paragraphs=paragraphs,
                    )
                )

            from datetime import datetime  # noqa: PLC0415

            from domain.timeline import TimelineConfig  # noqa: PLC0415

            return Document(
                id=doc_row.id,
                title=doc_row.title,
                author=doc_row.author,
                file_path=doc_row.file_path,
                file_type=FileType(doc_row.file_type),
                chapters=chapters,
                summary=doc_row.summary,
                keywords=(
                    json.loads(doc_row.keywords_json)
                    if doc_row.keywords_json
                    else None
                ),
                language=doc_row.language or "en",
                processed_at=(
                    datetime.fromisoformat(doc_row.processed_at)
                    if doc_row.processed_at
                    else None
                ),
                timeline_config=(
                    TimelineConfig.model_validate_json(doc_row.timeline_config_json)
                    if doc_row.timeline_config_json
                    else None
                ),
                pipeline_status=(
                    PipelineStatus.model_validate_json(doc_row.pipeline_status_json)
                    if doc_row.pipeline_status_json
                    else PipelineStatus()
                ),
            )

    async def update_pipeline_status(self, document_id: str, pipeline_status: PipelineStatus) -> None:
        """Update only the pipeline_status column for a document."""
        async with self._session_factory() as session:
            async with session.begin():
                await session.execute(
                    sa_text(
                        "UPDATE documents SET pipeline_status_json = :json WHERE id = :id"
                    ),
                    {"json": pipeline_status.model_dump_json(), "id": document_id},
                )

    async def get_document_language(self, document_id: str) -> str:
        """Return the detected/configured language for a document, or ``'en'``."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(_DocumentRow.language).where(_DocumentRow.id == document_id)
            )
            return result.scalar_one_or_none() or "en"

    async def list_documents(self) -> list[DocumentSummary]:
        """Return a lightweight list of all documents."""
        async with self._session_factory() as session:
            chapter_count = (
                func.count(_ChapterRow.id).label("chapter_count")
            )
            result = await session.execute(
                select(
                    _DocumentRow.id,
                    _DocumentRow.title,
                    _DocumentRow.file_type,
                    _DocumentRow.pipeline_status_json,
                    chapter_count,
                )
                .outerjoin(_ChapterRow, _ChapterRow.document_id == _DocumentRow.id)
                .group_by(_DocumentRow.id)
            )
            return [
                DocumentSummary(
                    id=row.id,
                    title=row.title,
                    file_type=row.file_type,
                    chapter_count=row.chapter_count,
                    pipeline_status_json=row.pipeline_status_json,
                )
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
        chapter_number: int | None = None,
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
                    entities=(
                        [ParagraphEntity(**e) for e in json.loads(pr.entities_json)]
                        if pr.entities_json
                        else None
                    ),
                )
                for pr in result.scalars().all()
            ]

    async def get_paragraphs_by_entity(
        self,
        document_id: str,
        entity_id: str,
    ) -> list[tuple[str, int, str | None, Paragraph]]:
        """Return paragraphs that mention a specific entity.

        Returns a list of (chapter_id, chapter_number, chapter_title, Paragraph)
        tuples, ordered by chapter_number then position.
        """
        async with self._session_factory() as session:
            query = (
                select(_ParagraphRow, _ChapterRow.id, _ChapterRow.title)
                .join(_ChapterRow, _ParagraphRow.chapter_id == _ChapterRow.id)
                .where(
                    _ParagraphRow.document_id == document_id,
                    _ParagraphRow.entities_json.isnot(None),
                )
                .order_by(_ParagraphRow.chapter_number, _ParagraphRow.position)
            )
            result = await session.execute(query)
            rows = result.all()

        matches: list[tuple[str, int, str | None, Paragraph]] = []
        for pr, ch_id, ch_title in rows:
            entities_list = json.loads(pr.entities_json)
            if not any(e.get("entity_id") == entity_id for e in entities_list):
                continue
            paragraph = Paragraph(
                id=pr.id,
                text=pr.text,
                chapter_number=pr.chapter_number,
                position=pr.position,
                embedding=(
                    json.loads(pr.embedding_json) if pr.embedding_json else None
                ),
                entities=[ParagraphEntity(**e) for e in entities_list],
            )
            matches.append((ch_id, pr.chapter_number, ch_title, paragraph))
        return matches

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
    ) -> list[ChapterKeywordMatch]:
        """Find chapters containing a specific keyword."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(_ChapterRow).where(
                    _ChapterRow.document_id == document_id,
                    _ChapterRow.keywords_json.isnot(None),
                ).order_by(_ChapterRow.number)
            )
            matches: list[ChapterKeywordMatch] = []
            keyword_lower = keyword.lower()
            for row in result.scalars().all():
                kws = json.loads(row.keywords_json)
                if keyword_lower in kws:
                    matches.append(ChapterKeywordMatch(
                        chapter_number=row.number,
                        title=row.title,
                        score=kws[keyword_lower],
                    ))
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
        logger.debug(
            "DocumentService.delete_document: id=%s", document_id
        )
