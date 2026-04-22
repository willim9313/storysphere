"""Symbol analysis domain models — B-022 / B-040.

Hierarchy:
  ImageryEntity + SymbolOccurrence  →  SEP (Symbol Evidence Profile, B-022)
                                   →  SymbolInterpretation (LLM, B-040)

SEP is the structural analog of CEP / EEP / TEU — pure data aggregation
with no LLM calls. Downstream (B-040) consumes SEP as the input for
LLM-based symbol interpretation.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SEPOccurrenceContext(BaseModel):
    """A single imagery occurrence with its paragraph text and chapter location."""

    occurrence_id: str
    paragraph_id: str
    chapter_number: int
    position: int
    paragraph_text: str = Field(default="", description="Full paragraph text")
    context_window: str = Field(
        default="", description="~200-char window around the term"
    )


class SEP(BaseModel):
    """Symbol Evidence Profile — structured evidence for an imagery entity.

    Assembled from SymbolService, DocumentService, and KGService with no LLM.
    Persisted in AnalysisCache under key ``sep:{book_id}:{imagery_id}``.
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    imagery_id: str
    book_id: str
    term: str = Field(description="Canonical imagery term")
    imagery_type: str = Field(description="ImageryType value")
    frequency: int = 0

    occurrence_contexts: list[SEPOccurrenceContext] = Field(default_factory=list)
    co_occurring_entity_ids: list[str] = Field(
        default_factory=list,
        description="Entity IDs mentioned in paragraphs where this imagery occurs",
    )
    co_occurring_event_ids: list[str] = Field(
        default_factory=list,
        description="Event IDs occurring in chapters where this imagery appears",
    )
    chapter_distribution: dict[int, int] = Field(
        default_factory=dict, description="{chapter_num: count}"
    )
    peak_chapters: list[int] = Field(
        default_factory=list,
        description="Top chapters by occurrence frequency (descending)",
    )

    assembled_by: str = Field(default="symbol_service_v1")
    assembled_at: datetime = Field(default_factory=datetime.utcnow)
