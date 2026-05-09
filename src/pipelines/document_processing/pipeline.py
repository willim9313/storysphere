"""Document processing pipeline: file → Document (chapters + paragraphs)."""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from domain.documents import Chapter, Document, FileType, Paragraph, ParagraphRole
from pipelines.base import BasePipeline

from .chapter_detector import detect_chapters
from .chunker import chunk_segments
from .loader import DocumentMeta, load_docx, load_pdf

logger = logging.getLogger(__name__)

# ── Separator detection ───────────────────────────────────────────────────────

_CONTENT_CHAR = re.compile(r'\w', re.UNICODE)
_MAX_SEP_LEN = 40


def _is_separator_segment(text: str) -> bool:
    """True if a raw segment looks like a visual divider (e.g. ***, ---, ◇◇◇)."""
    stripped = text.strip()
    return bool(stripped) and len(stripped) <= _MAX_SEP_LEN and not _CONTENT_CHAR.search(stripped)


def _split_at_separators(
    segs: list[tuple[int, str]],
) -> list[tuple[str | None, list[tuple[int, str]]]]:
    """Partition segments at separator lines.

    Returns a list of (separator_text | None, body_segments) pairs.
    The first item always has separator_text=None (no preceding separator).
    """
    groups: list[tuple[str | None, list[tuple[int, str]]]] = [(None, [])]
    for idx, text in segs:
        if _is_separator_segment(text):
            groups.append((text.strip(), []))
        else:
            groups[-1][1].append((idx, text))
    return groups


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
        segments, file_meta = await asyncio.get_event_loop().run_in_executor(
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
            segs = list(span.segments)
            # Direction-A title_span: prepend the detected heading text to the
            # first segment so it becomes part of paragraph text, then annotate
            # the first paragraph with the character offsets of the title.
            if span.title and segs:
                first_idx, first_text = segs[0]
                segs = [(first_idx, span.title + "\n" + first_text)] + segs[1:]

            # Split segments at visual separator lines, chunk body groups
            # separately so separators are not merged into body text.
            groups = _split_at_separators(segs)
            paragraphs: list[Paragraph] = []
            pos = 0
            for sep_text, body_segs in groups:
                if sep_text is not None:
                    paragraphs.append(
                        Paragraph(
                            text=sep_text,
                            chapter_number=span.chapter_number,
                            position=pos,
                            role=ParagraphRole.separator,
                        )
                    )
                    pos += 1
                if body_segs:
                    body_paras = chunk_segments(body_segs, chapter_number=span.chapter_number)
                    for para in body_paras:
                        paragraphs.append(para.model_copy(update={"position": pos}))
                        pos += 1

            if span.title and paragraphs:
                # Apply title_span to the first body paragraph (skip leading separators)
                for i, p in enumerate(paragraphs):
                    if p.role == ParagraphRole.body and p.text.startswith(span.title):
                        paragraphs[i] = p.model_copy(update={"title_span": (0, len(span.title))})
                        break

            body_count = sum(1 for p in paragraphs if p.role == ParagraphRole.body)
            if body_count == 0:
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
            title=file_meta.title or file_path.stem,
            author=file_meta.author,
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
    def _load_sync(file_path: Path) -> tuple[list[tuple[int, str]], DocumentMeta]:
        suffix = file_path.suffix.lower()
        if suffix == ".pdf":
            return load_pdf(file_path)
        if suffix == ".docx":
            return load_docx(file_path)
        raise ValueError(f"Unsupported file type: '{suffix}'. Supported: .pdf, .docx")
