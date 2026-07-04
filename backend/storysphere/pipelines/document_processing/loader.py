"""Raw-text loaders for PDF and DOCX files.

Returns a list of (page_or_paragraph_index, raw_text) tuples so the rest of
the pipeline stays format-agnostic.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)


class DocumentMeta:
    """Metadata extracted from a document file (best-effort)."""

    __slots__ = ("title", "author", "heading_indices")

    def __init__(
        self,
        title: str | None = None,
        author: str | None = None,
        heading_indices: set[int] | None = None,
    ) -> None:
        self.title = title
        self.author = author
        # Segment indices that the source format marked as a heading via its
        # own structure (e.g. DOCX "Heading N" paragraph styles) rather than
        # by text pattern — lets chapter_detector trust these over regex.
        self.heading_indices: set[int] = heading_indices if heading_indices is not None else set()


_MAX_HEADER_FOOTER_LEN = 80


def _detect_running_header_footer_lines(pages: list[list[str]]) -> set[str]:
    """Identify short lines repeated at the top/bottom of many pages.

    Running headers/footers (book title, chapter name, page number) tend to
    be the first or last line of a page and recur verbatim across most
    pages. Requiring both a high recurrence count and a short length avoids
    flagging legitimate short paragraphs that only coincidentally repeat.
    """
    num_pages = len(pages)
    if num_pages < 3:
        return set()

    boundary_counts: dict[str, int] = {}
    for lines in pages:
        if not lines:
            continue
        candidates = {lines[0], lines[-1]}
        for line in candidates:
            if len(line) <= _MAX_HEADER_FOOTER_LEN:
                boundary_counts[line] = boundary_counts.get(line, 0) + 1

    threshold = max(3, num_pages // 2)
    return {line for line, count in boundary_counts.items() if count >= threshold}


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

    meta = DocumentMeta()
    pages: list[list[str]] = []
    with open(file_path, "rb") as fh:
        reader = pypdf.PdfReader(fh)
        pdf_meta = reader.metadata or {}
        meta.author = (pdf_meta.get("/Author") or "").strip() or None
        meta.title = (pdf_meta.get("/Title") or "").strip() or None
        for page_idx, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if not text.strip():
                logger.debug("PDF page %d is empty — skipped", page_idx)
                pages.append([])
                continue
            # Split each page into lines so chapter headings become standalone segments.
            # This allows the chapter detector to match "第一章" etc. (≤80 chars)
            # even when chapter titles appear in the middle of a page.
            lines = []
            for line in text.splitlines():
                line = line.replace("\x00", "").strip()
                if line:
                    lines.append(line)
            pages.append(lines)

    noise_lines = _detect_running_header_footer_lines(pages)

    segments: list[tuple[int, str]] = []
    seg_idx = 0
    for lines in pages:
        for pos, line in enumerate(lines):
            is_boundary = pos == 0 or pos == len(lines) - 1
            if is_boundary and line in noise_lines:
                continue
            segments.append((seg_idx, line))
            seg_idx += 1

    logger.info("Loaded PDF '%s': %d non-empty lines", file_path.name, len(segments))
    return segments, meta


_HEADING_STYLE_ID_RE = re.compile(r"^Heading(\d+)$", re.IGNORECASE)


def _is_heading_style(style: object) -> bool:
    """True if a python-docx paragraph style is a built-in Heading style.

    Matches on ``style_id`` (the invariant OOXML identifier, e.g.
    ``"Heading1"``) rather than ``style.name`` (a display name that can be
    localized in non-English Word templates).
    """
    style_id = getattr(style, "style_id", None) or ""
    return bool(_HEADING_STYLE_ID_RE.match(style_id))


def load_docx(file_path: Path) -> tuple[list[tuple[int, str]], DocumentMeta]:
    """Extract raw text and metadata from a DOCX.

    Args:
        file_path: Path to the DOCX file.

    Returns:
        Tuple of (segments, meta) where segments is a list of
        (paragraph_index, text) tuples (0-indexed over all paragraphs)
        and meta contains any author/title from core properties, plus
        the indices of paragraphs using a "Heading N" style.

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
            if _is_heading_style(para.style):
                meta.heading_indices.add(idx)

    logger.info("Loaded DOCX '%s': %d non-empty paragraphs", file_path.name, len(paragraphs))
    return paragraphs, meta


def load_txt(
    file_path: Path, encoding: str | None = None
) -> tuple[list[tuple[int, str]], DocumentMeta]:
    """Extract raw text from a plain-text file.

    Each non-empty line becomes one segment (index, text).  If *encoding* is
    given it is used as-is; otherwise the actual encoding is detected via
    ``charset_normalizer`` (falls back to utf-8, then latin-1, if detection
    is inconclusive). This matters for Chinese text saved as Big5/GBK,
    which a naive utf-8/latin-1 fallback would silently turn into mojibake.
    """
    if not file_path.exists():
        raise FileNotFoundError(f"TXT not found: {file_path}")
    if file_path.suffix.lower() != ".txt":
        raise ValueError(f"Expected .txt extension, got: {file_path.suffix}")

    if encoding is not None:
        try:
            text = file_path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            text = file_path.read_text(encoding="latin-1")
    else:
        from charset_normalizer import from_path  # noqa: PLC0415

        match = from_path(file_path).best()
        if match is not None:
            text = str(match)
        else:
            try:
                text = file_path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                text = file_path.read_text(encoding="latin-1")

    segments: list[tuple[int, str]] = []
    for idx, line in enumerate(text.splitlines()):
        line = line.replace("\x00", "").strip()
        if line:
            segments.append((idx, line))

    logger.info(
        "Loaded TXT '%s': %d non-empty lines", file_path.name, len(segments)
    )
    return segments, DocumentMeta()
