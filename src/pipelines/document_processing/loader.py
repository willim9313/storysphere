"""Raw-text loaders for PDF and DOCX files.

Returns a list of (page_or_paragraph_index, raw_text) tuples so the rest of
the pipeline stays format-agnostic.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def load_pdf(file_path: Path) -> list[tuple[int, str]]:
    """Extract raw text from a PDF, one entry per page.

    Args:
        file_path: Path to the PDF file.

    Returns:
        List of (page_index, text) tuples (0-indexed).

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

    pages: list[tuple[int, str]] = []
    with open(file_path, "rb") as fh:
        reader = pypdf.PdfReader(fh)
        for idx, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            text = text.strip()
            if text:
                pages.append((idx, text))
            else:
                logger.debug("PDF page %d is empty — skipped", idx)

    logger.info("Loaded PDF '%s': %d non-empty pages", file_path.name, len(pages))
    return pages


def load_docx(file_path: Path) -> list[tuple[int, str]]:
    """Extract raw text from a DOCX, one entry per non-empty paragraph.

    Args:
        file_path: Path to the DOCX file.

    Returns:
        List of (paragraph_index, text) tuples (0-indexed over all paragraphs).

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
    paragraphs: list[tuple[int, str]] = []
    for idx, para in enumerate(doc.paragraphs):
        text = para.text.strip()
        if text:
            paragraphs.append((idx, text))

    logger.info("Loaded DOCX '%s': %d non-empty paragraphs", file_path.name, len(paragraphs))
    return paragraphs
