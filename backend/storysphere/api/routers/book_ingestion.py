"""Ingestion endpoints for a book — split out of ``books.py``.

Upload (#2) and language detection, the human-in-the-loop chapter review
(#8d–#8g), and the LangGraph runners that drive the ingestion graph.
Shares the ``/books`` prefix with ``books.py``; the endpoint paths are
unchanged.
"""

from __future__ import annotations

import asyncio
import logging
import re
import tempfile
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import (
    APIRouter,
    Form,
    HTTPException,
    UploadFile,
)

from storysphere.api import task_registry
from storysphere.api.deps import DocServiceDep
from storysphere.api.routers._book_shared import cleanup_ingestion_checkpoint
from storysphere.api.schemas.book_ingestion import (
    DetectLanguageResponse,
    ParseTocRequest,
    ParseTocResponse,
    ReviewChapterResponse,
    ReviewDataResponse,
    ReviewParagraphResponse,
    ReviewSubmitRequest,
    SuggestRolesResponse,
    UploadResponse,
)
from storysphere.api.schemas.books import (
    TocEntry,
)
from storysphere.api.store import task_store
from storysphere.core.language_detection import detect_language
from storysphere.pipelines.document_processing import DocumentProcessingPipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/books", tags=["books"])


MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB
_UPLOAD_CHUNK_BYTES = 1024 * 1024  # 1 MB, streamed to avoid buffering the whole file
# Single source of truth for the formats the upload and language-detection
# endpoints accept — kept in sync with DocumentProcessingPipeline._load_sync.
_ALLOWED_UPLOAD_SUFFIXES = {".pdf", ".docx", ".txt", ".epub"}


# ── Background tasks ────────────────────────────────────────────────────────


async def _run_ingestion_graph(
    task_id: str,
    file_path: Path,
    title: str,
    author: str | None = None,
    language: str | None = None,
) -> None:
    from langgraph.errors import GraphInterrupt  # noqa: PLC0415

    from storysphere.api.deps import get_ingestion_graph  # noqa: PLC0415

    task_store.set_running(task_id)
    task_store.set_progress(task_id, 5, "文件解析", step_key="pdfParsing")

    config = {"configurable": {"thread_id": task_id}}
    initial_state = {
        "file_path": str(file_path),
        "title": title,
        "author": author,
        "language": language,
        "task_id": task_id,
        "doc_id": None,
        "errors": [],
        "chapters": 0,
        "paragraphs": 0,
        "paragraphs_embedded": 0,
        "keywords_extracted": 0,
        "chapters_summarized": 0,
        "book_summary_generated": False,
        "entities": 0,
        "relations": 0,
        "events": 0,
        "imagery_count": 0,
        "timeline_detection": None,
    }
    graph = get_ingestion_graph()
    try:
        await graph.ainvoke(initial_state, config=config)
    except GraphInterrupt:
        # Expected pause for chapter review — graph is checkpointed, not an error
        logger.info("Ingestion task %s paused for chapter review", task_id)
    except asyncio.CancelledError:
        logger.info("Ingestion task %s cancelled", task_id)
        task_store.set_failed(task_id, error="cancelled")
        await cleanup_ingestion_checkpoint(task_id)
        raise
    except Exception as exc:
        logger.exception("Ingestion task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
        await cleanup_ingestion_checkpoint(task_id)
    finally:
        task_registry.unregister(task_id)
        try:
            file_path.unlink(missing_ok=True)
        except Exception:
            pass


async def _resume_ingestion_graph(task_id: str, chapters_data: dict | None) -> None:
    from langgraph.types import Command  # noqa: PLC0415

    from storysphere.api.deps import get_ingestion_graph  # noqa: PLC0415

    config = {"configurable": {"thread_id": task_id}}
    graph = get_ingestion_graph()
    try:
        await graph.ainvoke(Command(resume=chapters_data), config=config)
    except asyncio.CancelledError:
        logger.info("Resume of ingestion task %s cancelled", task_id)
        task_store.set_failed(task_id, error="cancelled")
        raise
    except Exception as exc:
        logger.exception("Resume of ingestion task %s failed", task_id)
        task_store.set_failed(task_id, error=str(exc))
    finally:
        # Phase 2 always ends terminal (done / error / cancelled): release the
        # registry slot and drop the checkpoint thread so it never accumulates.
        task_registry.unregister(task_id)
        await cleanup_ingestion_checkpoint(task_id)


# ── #8d GET /books/:bookId/review-data ───────────────────────────────────────

_SENTENCE_END = re.compile(r"(?<=[.!?])\s+|(?<=[。！？])")


@router.get("/{book_id}/review-data", response_model=ReviewDataResponse)
async def get_review_data(
    book_id: str,
    doc: DocServiceDep,
) -> ReviewDataResponse:
    """Return chapter/paragraph data for review. Only available while awaiting_review."""
    from storysphere.api.store import get_task, get_task_id_by_book_id  # noqa: PLC0415

    task_id = await get_task_id_by_book_id(book_id)
    if task_id is None:
        raise HTTPException(
            status_code=409,
            detail="Book is not currently awaiting chapter review",
        )
    status = await get_task(task_id)
    if status is None or status.status != "awaiting_review":
        raise HTTPException(
            status_code=409,
            detail="Book is not currently awaiting chapter review",
        )

    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    global_idx = 0
    review_chapters: list[ReviewChapterResponse] = []
    for ch_idx, chapter in enumerate(document.chapters):
        paras: list[ReviewParagraphResponse] = []
        for para in chapter.paragraphs:
            sentences = [s for s in _SENTENCE_END.split(para.text) if s.strip()]
            if not sentences:
                sentences = [para.text]
            paras.append(
                ReviewParagraphResponse(
                    paragraph_index=global_idx,
                    text=para.text,
                    role=para.role.value,
                    title_span=list(para.title_span) if para.title_span else None,
                    sentences=sentences,
                )
            )
            global_idx += 1
        review_chapters.append(
            ReviewChapterResponse(
                chapter_idx=ch_idx,
                title=chapter.title,
                role=chapter.role.value,
                paragraphs=paras,
            )
        )

    return ReviewDataResponse(chapters=review_chapters)


# ── #8e POST /books/:bookId/review ───────────────────────────────────────────


@router.post("/{book_id}/review", status_code=204)
async def submit_review(
    book_id: str,
    body: ReviewSubmitRequest,
) -> None:
    """Submit reviewed chapter structure and resume the ingestion pipeline."""
    from storysphere.api.store import get_task, get_task_id_by_book_id  # noqa: PLC0415

    task_id = await get_task_id_by_book_id(book_id)
    if task_id is None:
        raise HTTPException(
            status_code=409,
            detail="Book is not currently awaiting chapter review",
        )
    status = await get_task(task_id)
    if status is None or status.status != "awaiting_review":
        raise HTTPException(
            status_code=409,
            detail="Review window has already been closed",
        )

    # chapters omitted = accept the detected structure as-is; chapter_review_node
    # skips the rebuild when the list is absent or empty.
    #
    # This must NOT be plain None. Command(resume=None) trips an UnboundLocalError
    # inside LangGraph itself (pregel/_loop.py assigns `resume_is_map` only inside
    # the `resume is not None` branch, then reads it outside). Present in every
    # published version from 0.5.4 through 1.2.11, so the caller has to avoid it.
    resume_value = {
        "chapters": (
            [ch.model_dump(by_alias=False) for ch in body.chapters]
            if body.chapters is not None
            else None
        ),
        "role_overrides": body.role_overrides,
        "paragraph_splits": body.paragraph_splits,
    }
    # Await the write so the frontend sees 'running' on its very next poll —
    # the sync fire-and-forget path would race with the immediately-following navigate.
    from storysphere.api.store import set_task_running  # noqa: PLC0415
    await set_task_running(task_id)
    # Register the resume task so POST /tasks/:id/cancel can actually stop
    # phase 2 — without this the whole post-review pipeline is uncancellable.
    resume_task = asyncio.create_task(_resume_ingestion_graph(task_id, resume_value))
    task_registry.register(task_id, resume_task)


# ── #8f POST /books/:bookId/suggest-roles ─────────────────────────────────────


@router.post("/{book_id}/suggest-roles", response_model=SuggestRolesResponse)
async def suggest_roles(
    book_id: str,
    doc: DocServiceDep,
) -> SuggestRolesResponse:
    """LLM-assisted "邊界輔助辨識": flag edge paragraphs that are front/back matter.

    Walks the book's paragraphs inward from each end and returns the ones that
    read as non-body matter, for the reviewer to accept. Only available while
    awaiting review; it does not mutate the document or resume the pipeline.
    """
    from storysphere.api.store import get_task, get_task_id_by_book_id  # noqa: PLC0415

    task_id = await get_task_id_by_book_id(book_id)
    if task_id is None:
        raise HTTPException(
            status_code=409,
            detail="Book is not currently awaiting chapter review",
        )
    status = await get_task(task_id)
    if status is None or status.status != "awaiting_review":
        raise HTTPException(
            status_code=409,
            detail="Book is not currently awaiting chapter review",
        )

    document = await doc.get_document(book_id)
    if document is None:
        raise HTTPException(status_code=404, detail=f"Book '{book_id}' not found")

    from storysphere.services.chapter_role_suggester import (  # noqa: PLC0415
        suggest_boundary_roles,
    )

    try:
        result = await suggest_boundary_roles(document.chapters, book_id=book_id)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"AI boundary detection is unavailable: {exc}",
        ) from exc

    return SuggestRolesResponse(
        front_matter_end=result.front_matter_end,
        back_matter_start=result.back_matter_start,
        front_role=result.front_role,
        back_role=result.back_role,
    )


# ── #8g POST /books/:bookId/parse-toc ─────────────────────────────────────────


@router.post("/{book_id}/parse-toc", response_model=ParseTocResponse)
async def parse_toc(
    book_id: str,
    doc: DocServiceDep,
    body: ParseTocRequest | None = None,
) -> ParseTocResponse:
    """LLM-assisted "目錄對照提示": parse the book's declared chapter list.

    Extracts the ordered entries the book itself declares, for the review UI to
    show side by side with the detected spine. Prefers ``body.tocText`` — the
    reviewer's *currently edited* TOC text — so re-parsing reflects live role/
    content edits; falls back to the persisted document's detected TOC when no
    text is sent. Display-only: it does not mutate the document, drive splitting,
    or resume the pipeline. Only available while awaiting review.
    """
    from storysphere.api.store import get_task, get_task_id_by_book_id  # noqa: PLC0415

    task_id = await get_task_id_by_book_id(book_id)
    if task_id is None:
        raise HTTPException(
            status_code=409,
            detail="Book is not currently awaiting chapter review",
        )
    status = await get_task(task_id)
    if status is None or status.status != "awaiting_review":
        raise HTTPException(
            status_code=409,
            detail="Book is not currently awaiting chapter review",
        )

    from storysphere.services.toc_parser import (  # noqa: PLC0415
        parse_toc_entries,
        parse_toc_text,
    )

    toc_text = (body.toc_text or "").strip() if body else ""
    try:
        if toc_text:
            entries = await parse_toc_text(toc_text, book_id=book_id)
        else:
            document = await doc.get_document(book_id)
            if document is None:
                raise HTTPException(
                    status_code=404, detail=f"Book '{book_id}' not found"
                )
            entries = await parse_toc_entries(document.chapters, book_id=book_id)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"AI table-of-contents parsing is unavailable: {exc}",
        ) from exc

    return ParseTocResponse(
        entries=[
            TocEntry(title=e.title, page=e.page, level=e.level, is_body=e.is_body)
            for e in entries
        ]
    )


# ── #2 POST /books/upload ────────────────────────────────────────────────────


@router.post("/upload", response_model=UploadResponse, status_code=202)
async def upload_book(
    file: UploadFile,
    doc: DocServiceDep,
    title: Annotated[str | None, Form()] = None,
    author: Annotated[str | None, Form()] = None,
    language: Annotated[str | None, Form()] = None,
) -> dict:
    """Upload a PDF/DOCX/TXT/EPUB and start background ingestion."""
    suffix = Path(file.filename or "upload").suffix.lower()
    if suffix not in _ALLOWED_UPLOAD_SUFFIXES:
        raise HTTPException(
            status_code=422,
            detail="Only .pdf, .docx, .txt and .epub files are supported",
        )

    # Use user-provided title if given, otherwise fall back to filename stem
    title = (title.strip() if title and title.strip() else None) or Path(file.filename or "Untitled").stem
    author = author.strip() if author and author.strip() else None
    language = language.strip() or None if language else None

    # Duplicate titles are only a warning — the user may be uploading a
    # different edition/translation, or intentionally re-uploading a fix.
    duplicate_title = await doc.title_exists(title)

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        total_bytes = 0
        while chunk := await file.read(_UPLOAD_CHUNK_BYTES):
            total_bytes += len(chunk)
            if total_bytes > MAX_UPLOAD_BYTES:
                tmp.close()
                Path(tmp.name).unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large (max {MAX_UPLOAD_BYTES // 1024 // 1024} MB)",
                )
            tmp.write(chunk)
        tmp.close()
    except HTTPException:
        raise
    except Exception as exc:
        tmp.close()
        Path(tmp.name).unlink(missing_ok=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to save upload: {exc}"
        ) from exc

    task_id = str(uuid4())
    task_store.create(task_id, kind="ingestion", title=(f"{title} 解析" if title else "書籍解析"))
    task = asyncio.create_task(_run_ingestion_graph(task_id, Path(tmp.name), title, author, language))
    task_registry.register(task_id, task)

    return UploadResponse(task_id=task_id, duplicate_title=duplicate_title).model_dump(by_alias=True)


# ── POST /books/detect-language ──────────────────────────────────────────────


@router.post("/detect-language", response_model=DetectLanguageResponse)
async def detect_language_from_upload(file: UploadFile) -> dict:
    """Quickly guess a file's language before the user confirms upload.

    Reuses the same PDF/DOCX/TXT/EPUB loaders as full ingestion, but skips
    chapter detection and does not create a background task — this is a
    lightweight, synchronous preview call so the upload form's language
    dropdown can be pre-selected instead of defaulting to blank.

    The whole file is streamed to a temp file (bounded by MAX_UPLOAD_BYTES)
    before parsing: DOCX/EPUB are ZIP containers and PDF keeps its xref table
    at the end, so a truncated sample would corrupt the container and make the
    loader silently fall back to English. Sampling happens on the loaded text.
    """
    suffix = Path(file.filename or "upload").suffix.lower()
    if suffix not in _ALLOWED_UPLOAD_SUFFIXES:
        raise HTTPException(
            status_code=422,
            detail="Only .pdf, .docx, .txt and .epub files are supported",
        )

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        total_bytes = 0
        while chunk := await file.read(_UPLOAD_CHUNK_BYTES):
            total_bytes += len(chunk)
            if total_bytes > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large (max {MAX_UPLOAD_BYTES // 1024 // 1024} MB)",
                )
            tmp.write(chunk)
        tmp.close()

        segments, _meta = await asyncio.get_event_loop().run_in_executor(
            None, DocumentProcessingPipeline._load_sync, Path(tmp.name)
        )
        sample = " ".join(text for _, text in segments)
        language = detect_language(sample)
    except HTTPException:
        raise
    except Exception:
        logger.warning("Language pre-detection failed for %r", file.filename, exc_info=True)
        language = "en"
    finally:
        tmp.close()
        Path(tmp.name).unlink(missing_ok=True)

    return DetectLanguageResponse(language=language).model_dump(by_alias=True)
