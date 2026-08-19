"""Request/response schemas for upload, parsing and chapter review endpoints.

Split out of ``schemas/books.py``: ``routers/books.py`` was divided by theme in
35647a3 but its schemas were not, leaving seven routers sharing one 779-line
module. Class names are unchanged, so the OpenAPI component names — and
``generated.ts`` — are unaffected.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from storysphere.api.schemas.books import TocEntry

_CAMEL = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class ReviewParagraphResponse(BaseModel):
    model_config = _CAMEL

    paragraph_index: int
    text: str
    role: str = "body"
    title_span: list[int] | None = None  # [start, end] char offsets, or null
    sentences: list[str]


class ReviewChapterResponse(BaseModel):
    model_config = _CAMEL

    chapter_idx: int
    title: str | None = None
    role: str = "body"
    paragraphs: list[ReviewParagraphResponse]


class ReviewDataResponse(BaseModel):
    model_config = _CAMEL

    chapters: list[ReviewChapterResponse]


class ReviewChapterInput(BaseModel):
    model_config = _CAMEL

    title: str = ""
    role: str = "body"
    start_paragraph_index: int


class ReviewSubmitRequest(BaseModel):
    model_config = _CAMEL

    # None (field omitted) = accept the detected structure as-is: the pipeline
    # resumes without rebuilding chapters, and role_overrides/paragraph_splits
    # are ignored. Spares the "接受系統判斷" path the round-trip of the full
    # book text.
    chapters: list[ReviewChapterInput] | None = None
    role_overrides: dict[str, str] = {}  # str(globalIdx) → role value
    # str(pre-split globalIdx) → ascending char offsets to split that paragraph
    # at. Splits are applied first; chapters/role_overrides use post-split
    # indices. Optional so old payloads keep working unchanged.
    paragraph_splits: dict[str, list[int]] = {}


class SuggestRolesResponse(BaseModel):
    """LLM-proposed front/back matter boundaries for the review UI to split on.

    ``frontMatterEnd`` is exclusive, ``backMatterStart`` inclusive, both in
    book-global paragraph index space (matching review-data). ``null`` on a side
    means no matter found there.
    """

    model_config = _CAMEL

    front_matter_end: int | None = None
    back_matter_start: int | None = None
    front_role: str | None = None
    back_role: str | None = None


class ParseTocRequest(BaseModel):
    """Body for POST /books/:bookId/parse-toc (目錄對照提示).

    ``tocText`` is the reviewer's *currently edited* table-of-contents text
    (concatenated paragraphs of the chapters they have marked ``toc`` in the
    review UI). When provided, the backend parses it instead of the stale
    detected TOC in the persisted document, so re-parsing reflects live edits.
    When omitted/empty, the backend falls back to the persisted document.
    """

    model_config = _CAMEL

    toc_text: str | None = None


class ParseTocResponse(BaseModel):
    """LLM-parsed table-of-contents entries for the review cross-check drawer.

    Ordered as declared in the book. Empty ``entries`` = no TOC chapter, or the
    detected block could not be parsed (the UI shows a friendly fallback).
    """

    model_config = _CAMEL

    entries: list[TocEntry] = []


class UploadResponse(BaseModel):
    model_config = _CAMEL

    task_id: str
    duplicate_title: bool = False


class DetectLanguageResponse(BaseModel):
    model_config = _CAMEL

    language: str
