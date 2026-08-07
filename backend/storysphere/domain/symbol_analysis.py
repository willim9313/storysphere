"""Symbol analysis domain models — B-022 / B-040.

Hierarchy:
  ImageryEntity + SymbolOccurrence  →  SEP (Symbol Evidence Profile, B-022)
                                   →  SymbolInterpretation (LLM, B-040)
                                   →  SymbolOverview (page projection)

SEP is the structural analog of CEP / EEP / TEU — pure data aggregation
with no LLM calls. Downstream (B-040) consumes SEP as the input for
LLM-based symbol interpretation.

SymbolOverview is a *book-wide* sibling of SEP: the same aggregation sources,
but every imagery entity at once and without the per-occurrence full text.
It exists because the symbols page needs behavioural signals for every symbol
before it can rank them, and assembling one SEP per symbol re-loads the whole
document and the whole event list each time.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

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
    co_occurring_entity_counts: dict[str, int] = Field(
        default_factory=dict,
        description=(
            "Per-entity count of imagery occurrences whose paragraph mentions "
            "the entity. Used by the UI to display 'N co-occurrences' hints."
        ),
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


class SymbolInterpretation(BaseModel):
    """LLM-derived interpretation of an imagery symbol — B-040.

    Consumes an SEP and produces a structured reading of the symbol's
    thematic role. Persisted in AnalysisCache under
    ``symbol_analysis:{book_id}:{imagery_id}`` with HITL review support
    (analogous to TensionLine / TensionTheme).
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    imagery_id: str
    book_id: str
    term: str = Field(description="Canonical imagery term")

    theme: str = Field(
        default="",
        description="One-to-two sentence thematic proposition for the symbol",
    )
    polarity: Literal["positive", "negative", "neutral", "mixed"] = "neutral"
    evidence_summary: str = Field(
        default="", description="2-3 sentence synthesis grounded in SEP evidence"
    )
    linked_characters: list[str] = Field(
        default_factory=list,
        description="Entity IDs (characters) the symbol is most tied to",
    )
    linked_events: list[str] = Field(
        default_factory=list,
        description="Event IDs where the symbol carries the most weight",
    )
    confidence: float = Field(
        default=0.0, ge=0.0, le=1.0, description="LLM self-reported confidence"
    )

    assembled_by: str = Field(default="symbol_analysis_service_v1")
    assembled_at: datetime = Field(default_factory=datetime.utcnow)
    review_status: Literal["pending", "approved", "modified", "rejected"] = "pending"


# ── Book-wide overview projection ─────────────────────────────────────────────


class CoOccurringEntityRef(BaseModel):
    """A KG entity resolved to name and type, with its co-occurrence counts.

    SEP only carries ``{entity_id: count}``. Resolving those IDs is what lets the
    UI separate character attachment from the scenery a symbol sits in, and it
    cannot be done client-side without a second pass over the whole graph.

    The three counts exist so attachment can be stated as a *lift* rather than a
    bare share. "71% of this symbol's occurrences sit with the protagonist" says
    nothing on its own — if the protagonist is in 70% of all paragraphs, 71% is
    exactly what chance predicts. The comparison the UI needs is::

        observed = body_count / <symbol's body occurrences>
        expected = paragraph_count / <SymbolOverview.body_paragraph_count>
        lift     = observed / expected

    ``body_count`` rather than ``count`` is the numerator because the denominator
    counts body paragraphs only; mixing the two universes reintroduces the
    front-matter distortion.
    """

    id: str
    name: str
    entity_type: str = Field(description="EntityType value")
    count: int = Field(
        description="Imagery occurrences whose paragraph mentions this entity"
    )
    body_count: int = Field(
        default=0,
        description="Same, restricted to body chapters — the numerator for lift",
    )
    paragraph_count: int = Field(
        default=0,
        description=(
            "Body paragraphs anywhere in the book that mention this entity — the "
            "base rate this symbol's attachment has to beat to mean anything"
        ),
    )


class CoOccurringImageryRef(BaseModel):
    """Another imagery entity sharing paragraphs with this one.

    Field names match ``api.schemas.symbols.CoOccurrenceEntry`` so the UI reads
    one shape whether it came from here or from the per-symbol endpoint.
    """

    term: str
    imagery_id: str
    co_occurrence_count: int
    imagery_type: str


class InterpretationStatus(BaseModel):
    """The part of a SymbolInterpretation a list row needs.

    Carrying this inline is what stops the page issuing one interpretation
    request per symbol, the overwhelming majority of which 404 — real books run
    at 1-of-29 interpretation coverage.
    """

    review_status: str
    polarity: str
    confidence: float


class SymbolOverviewItem(BaseModel):
    """One imagery entity with every zero-LLM signal the page ranks on."""

    id: str
    book_id: str
    term: str
    imagery_type: str = Field(description="ImageryType value")
    aliases: list[str] = Field(default_factory=list)
    frequency: int = 0
    chapter_distribution: dict[int, int] = Field(
        default_factory=dict, description="{chapter_num: count}"
    )
    first_chapter: int | None = Field(
        default=None, description="Lowest chapter number present, front matter included"
    )

    co_occurring_entities: list[CoOccurringEntityRef] = Field(
        default_factory=list,
        description=(
            "Resolved co-occurring entities, descending by count, with the "
            "same-named entity removed (see self_match_count)"
        ),
    )
    self_match_count: int | None = Field(
        default=None,
        description=(
            "Co-occurrences with the KG entity sharing this imagery's name, which "
            "is filtered out of co_occurring_entities. Almost always the top hit, "
            "and meaningless as a signal — a symbol always occurs with itself. "
            "Reported so the UI can say so rather than silently dropping it."
        ),
    )
    co_occurring_event_count: int = Field(
        default=0,
        description=(
            "Events located in *body* chapters where this imagery occurs. Front "
            "and back matter are excluded: colophon-chapter events are not "
            "narrative attachment."
        ),
    )
    co_occurring_imagery: list[CoOccurringImageryRef] = Field(default_factory=list)

    interpretation: InterpretationStatus | None = Field(
        default=None,
        description=(
            "None when no interpretation has been generated. Never set by the "
            "assembler — interpretations change independently of this structural "
            "aggregate, so the router overlays them onto the cached result."
        ),
    )


class SymbolOverview(BaseModel):
    """Everything the symbols page needs before a symbol is selected.

    Persisted in AnalysisCache under ``symbol_overview:{book_id}``. The cached
    copy carries ``interpretation=None`` on every item by design; see
    ``SymbolOverviewItem.interpretation``.
    """

    book_id: str
    body_chapter_count: int = Field(
        description="Story chapters only — the axis length the reader sees"
    )
    body_paragraph_count: int = Field(
        default=0,
        description=(
            "Paragraphs in body chapters — the denominator for the base rate in "
            "CoOccurringEntityRef.paragraph_count"
        ),
    )
    chapter_roles: dict[int, str] = Field(
        default_factory=dict,
        description=(
            "{chapter_num: ChapterRole value}. The authoritative front/body/back "
            "split; a chapter number alone cannot be classified reliably."
        ),
    )
    global_chapter_max: int = Field(
        default=1,
        description=(
            "Highest single-body-chapter count across all imagery. Shading "
            "normalised per row makes colour mean 'present at all' and inverts "
            "the heatmap, so every row shares this scale."
        ),
    )
    items: list[SymbolOverviewItem] = Field(default_factory=list)

    assembled_by: str = Field(default="symbol_service_v1")
    assembled_at: datetime = Field(default_factory=datetime.utcnow)
