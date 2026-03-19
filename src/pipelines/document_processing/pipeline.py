"""Document processing pipeline: file → Document (chapters + paragraphs)."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

from domain.documents import Chapter, Document, FileType
from pipelines.base import BasePipeline

from .chapter_detector import detect_chapters
from .chunker import chunk_segments
from .loader import load_docx, load_pdf

logger = logging.getLogger(__name__)


class DocumentProcessingPipeline(BasePipeline[Path, Document]):
    """Three-step ETL: load raw text → detect chapters → chunk paragraphs.

    Steps:
        1. ``load``  — PDF or DOCX → list of (index, text) segments
        2. ``detect`` — heuristic chapter boundary detection
        3. ``chunk`` — split/merge segments into Paragraph objects
    """

    async def run(self, input_data: Path) -> Document:
        """Process a PDF or DOCX file and return a populated ``Document``.

        Args:
            input_data: Absolute or relative path to the novel file.

        Returns:
            A ``Document`` with chapters and paragraphs populated.
            Embeddings are NOT set here (that is the feature-extraction pipeline).

        Raises:
            FileNotFoundError: File does not exist.
            ValueError: Unsupported file extension.
        """
        file_path = Path(input_data).resolve()
        self._log_step("load", path=str(file_path))

        # Step 1: load
        segments = await asyncio.get_event_loop().run_in_executor(
            None, self._load_sync, file_path
        )
        file_type = FileType.PDF if file_path.suffix.lower() == ".pdf" else FileType.DOCX
        self._log_step("load_done", segments=len(segments), file_type=file_type)

        # Step 2: detect chapters
        spans = detect_chapters(segments)
        if not spans:
            logger.warning("No chapters detected in '%s'", file_path.name)

        # Step 3: chunk each chapter; skip chapters that produce no paragraphs
        # (e.g. residual TOC segments that are all below min_chars).
        chapters: list[Chapter] = []
        for span in spans:
            paragraphs = chunk_segments(span.segments, chapter_number=span.chapter_number)
            if not paragraphs:
                logger.debug("Skipping empty chapter %d (%r)", span.chapter_number, span.title)
                continue
            chapter = Chapter(
                number=span.chapter_number,
                title=span.title,
                paragraphs=paragraphs,
            )
            chapters.append(chapter)
            self._log_step(
                "chapter_chunked",
                chapter=span.chapter_number,
                paragraphs=len(paragraphs),
            )

        # Re-number chapters sequentially after any skips.
        for i, chapter in enumerate(chapters, start=1):
            chapter.number = i
            for para in chapter.paragraphs:
                para.chapter_number = i

        doc = Document(
            title=file_path.stem,
            file_path=str(file_path),
            file_type=file_type,
            chapters=chapters,
            processed_at=datetime.now(timezone.utc),
        )
        logger.info(
            "DocumentProcessingPipeline done: %d chapters, %d paragraphs",
            doc.total_chapters,
            doc.total_paragraphs,
        )
        return doc

    # ── sync helper (runs in thread pool) ───────────────────────────────────

    @staticmethod
    def _load_sync(file_path: Path) -> list[tuple[int, str]]:
        suffix = file_path.suffix.lower()
        if suffix == ".pdf":
            return load_pdf(file_path)
        if suffix == ".docx":
            return load_docx(file_path)
        raise ValueError(f"Unsupported file type: '{suffix}'. Supported: .pdf, .docx")
