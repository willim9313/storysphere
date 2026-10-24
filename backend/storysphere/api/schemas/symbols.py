"""API response schemas for symbolic imagery endpoints.

Uses snake_case (no alias_generator) following backend/storysphere/api/schemas/entity.py convention.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from storysphere.domain.imagery import ImageryEntity, SymbolOccurrence


class ImageryEntityResponse(BaseModel):
    id: str
    book_id: str
    term: str
    imagery_type: str
    aliases: list[str]
    frequency: int
    chapter_distribution: dict[int, int]
    first_chapter: int | None

    @classmethod
    def from_domain(cls, e: ImageryEntity) -> ImageryEntityResponse:
        first = min(e.chapter_distribution.keys()) if e.chapter_distribution else None
        return cls(
            id=e.id,
            book_id=e.book_id,
            term=e.term,
            imagery_type=e.imagery_type.value,
            aliases=e.aliases,
            frequency=e.frequency,
            chapter_distribution=e.chapter_distribution,
            first_chapter=first,
        )


class ImageryListResponse(BaseModel):
    items: list[ImageryEntityResponse]
    total: int
    book_id: str


class SymbolTimelineEntry(BaseModel):
    chapter_number: int
    position: int
    context_window: str
    co_occurring_terms: list[str]
    occurrence_id: str
    paragraph_id: str

    @classmethod
    def from_domain(cls, occ: SymbolOccurrence) -> SymbolTimelineEntry:
        return cls(
            chapter_number=occ.chapter_number,
            position=occ.position,
            context_window=occ.context_window,
            co_occurring_terms=occ.co_occurring_terms,
            occurrence_id=occ.id,
            paragraph_id=occ.paragraph_id,
        )


class CoOccurrenceEntry(BaseModel):
    term: str
    imagery_id: str
    co_occurrence_count: int
    imagery_type: str


class RunningSymbolAnalysis(BaseModel):
    """One single-symbol interpretation (#15e) still running (#15l).

    camelCase, unlike the rest of this module: it sits next to #15k
    (``ActiveBatchResponse``) and mirrors #7l, and the page reads all three the
    same way.
    """

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    imagery_id: str
    task_id: str


class RunningSymbolAnalysesResponse(BaseModel):
    """Single-symbol interpretations (#15e) currently running for a book (#15l)."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    running: list[RunningSymbolAnalysis] = Field(default_factory=list)
