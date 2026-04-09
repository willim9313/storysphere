"""Raw-text loaders for PDF and DOCX files.

Returns a list of (page_or_paragraph_index, raw_text) tuples so the rest of
the pipeline stays format-agnostic.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class DocumentMeta:
    """Metadata extracted from a document file (best-effort)."""

    __slots__ = ("title", "author")

    def __init__(self, title: str | None = None, author: str | None = None) -> None:
        self.title = title
        self.author = author


def load_pdf(file_path: Path) -> tuple[list[tuple[int, str]], DocumentMeta]:
    """Extract raw text and metadata from a PDF.

    Args:
        file_path: Path to the PDF file.

    Returns:
        Tuple of (segments, meta) where segments is a list of
        (page_index, text) tuples (0-indexed) and meta contains
        any author/title found in the PDF metadata.

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If the file is not a PDF or cannot be parsed.
    """
    try:
        import pypdf  # noqa: PLC0415
    except ImportError as exc:
        raise ImportError("pypdf is required for PDF loading: pip install pypdf") from exc

    if not file_path.exists():
        raise FileNotFoundError(f"PDF not found: {file_path}")
    if file_path.suffix.lower() != ".pdf":
        raise ValueError(f"Expected .pdf extension, got: {file_path.suffix}")

    segments: list[tuple[int, str]] = []
    seg_idx = 0
    meta = DocumentMeta()
    with open(file_path, "rb") as fh:
        reader = pypdf.PdfReader(fh)
        pdf_meta = reader.metadata or {}
        meta.author = (pdf_meta.get("/Author") or "").strip() or None
        meta.title = (pdf_meta.get("/Title") or "").strip() or None
        for page_idx, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if not text.strip():
                logger.debug("PDF page %d is empty — skipped", page_idx)
                continue
            # Split each page into lines so chapter headings become standalone segments.
            # This allows the chapter detector to match "第一章" etc. (≤80 chars)
            # even when chapter titles appear in the middle of a page.
            for line in text.splitlines():
                line = line.replace("\x00", "").strip()
                if line:
                    segments.append((seg_idx, line))
                    seg_idx += 1

    logger.info("Loaded PDF '%s': %d non-empty lines", file_path.name, len(segments))
    return segments, meta


def load_docx(file_path: Path) -> tuple[list[tuple[int, str]], DocumentMeta]:
    """Extract raw text and metadata from a DOCX.

    Args:
        file_path: Path to the DOCX file.

    Returns:
        Tuple of (segments, meta) where segments is a list of
        (paragraph_index, text) tuples (0-indexed over all paragraphs)
        and meta contains any author/title from core properties.

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If the file is not a DOCX.
    """
    try:
        import docx  # noqa: PLC0415
    except ImportError as exc:
        raise ImportError(
            "python-docx is required for DOCX loading: pip install python-docx"
        ) from exc

    if not file_path.exists():
        raise FileNotFoundError(f"DOCX not found: {file_path}")
    if file_path.suffix.lower() != ".docx":
        raise ValueError(f"Expected .docx extension, got: {file_path.suffix}")

    doc = docx.Document(str(file_path))
    props = doc.core_properties
    meta = DocumentMeta(
        author=(props.author or "").strip() or None,
        title=(props.title or "").strip() or None,
    )
    paragraphs: list[tuple[int, str]] = []
    for idx, para in enumerate(doc.paragraphs):
        text = para.text.strip()
        if text:
            paragraphs.append((idx, text))

    logger.info("Loaded DOCX '%s': %d non-empty paragraphs", file_path.name, len(paragraphs))
    return paragraphs, meta
