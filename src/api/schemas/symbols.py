"""API response schemas for symbolic imagery endpoints.

Uses snake_case (no alias_generator) following src/api/schemas/entity.py convention.
"""

from __future__ import annotations

from pydantic import BaseModel

from domain.imagery import ImageryEntity, ImageryType, SymbolOccurrence


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
    def from_domain(cls, e: ImageryEntity) -> "ImageryEntityResponse":
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

    @classmethod
    def from_domain(cls, occ: SymbolOccurrence) -> "SymbolTimelineEntry":
        return cls(
            chapter_number=occ.chapter_number,
            position=occ.position,
            context_window=occ.context_window,
            co_occurring_terms=occ.co_occurring_terms,
            occurrence_id=occ.id,
        )


class CoOccurrenceEntry(BaseModel):
    term: str
    imagery_id: str
    co_occurrence_count: int
    imagery_type: str
