"""Request/response schemas for tension analysis endpoints — B-027/B-028/B-029."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class GroupTensionLinesRequest(BaseModel):
    document_id: str
    language: str = "en"
    force: bool = False


class AnalyzeBookTensionsRequest(BaseModel):
    document_id: str
    language: str = "en"
    force: bool = False
    concurrency: int = Field(default=5, ge=1, le=20)


class TensionLineReviewRequest(BaseModel):
    document_id: str
    review_status: Literal["approved", "modified", "rejected"]
    canonical_pole_a: str | None = None
    canonical_pole_b: str | None = None
    note: str | None = None  # Why the labels were rewritten; "modified" only


class AssignTEURequest(BaseModel):
    document_id: str
    line_id: str


class SynthesizeThemeRequest(BaseModel):
    document_id: str
    language: str = "en"
    force: bool = False


class TensionThemeReviewRequest(BaseModel):
    document_id: str
    review_status: Literal["approved", "modified", "rejected"]
    proposition: str | None = None  # Allow human to rewrite the thematic proposition


# ── Response models ──────────────────────────────────────────────────────────


class Carrier(BaseModel):
    """An entity embodying one pole of a tension.

    ``id`` and ``entity_type`` are null when the LLM named a carrier that does
    not resolve to a KG entity — roughly a fifth of them in practice — so the UI
    must not assume a type is always available.
    """

    id: str | None = None
    name: str
    entity_type: str | None = None


class TEUSummary(BaseModel):
    """Per-line TEU rollup used by the tension page evidence section."""

    id: str
    chapter: int
    intensity: float = Field(ge=0.0, le=1.0)
    tension_description: str
    evidence: list[str] = Field(default_factory=list)
    pole_a_carriers: list[Carrier] = Field(default_factory=list)
    pole_b_carriers: list[Carrier] = Field(default_factory=list)
    pole_a_stance: str | None = Field(
        default=None,
        description="How pole A's carriers embody that side of the tension",
    )
    pole_b_stance: str | None = Field(
        default=None,
        description="How pole B's carriers embody that side of the tension",
    )
    flipped: bool = Field(
        default=False,
        description=(
            "This TEU assigns the line's two poles the opposite way round from "
            "the majority of its siblings. False also covers 'undecidable' — "
            "no shared carriers with the rest of the line, or the same carriers "
            "on both poles — so it understates rather than invents a conflict"
        ),
    )


class TEUDetail(BaseModel):
    """A TEU with its pole concepts and grouping status (TEU audit view).

    Unlike :class:`TEUSummary` — which is always read in the context of the line
    that owns it — this stands alone, so it carries the pole concept names and
    says whether any line claimed it.
    """

    id: str
    chapter: int
    intensity: float = Field(ge=0.0, le=1.0)
    tension_description: str
    evidence: list[str] = Field(default_factory=list)
    pole_a_concept: str
    pole_b_concept: str
    pole_a_carriers: list[Carrier] = Field(default_factory=list)
    pole_b_carriers: list[Carrier] = Field(default_factory=list)
    pole_a_stance: str | None = None
    pole_b_stance: str | None = None
    line_id: str | None = Field(
        default=None,
        description=(
            "TensionLine claiming this TEU; null means grouping left it out and "
            "the TEU appears nowhere else in the analysis"
        ),
    )


class TensionLineEditResponse(BaseModel):
    """What a reviewer changed, for the drawer's "human edit" note.

    ``original_*`` is grouping's wording, not the previous edit's — the line's
    own ``canonical_pole_*`` always hold the labels currently in force. There is
    no ``edited_by``: the app has no notion of user identity, and a hardcoded
    one would be fiction.
    """

    original_pole_a: str
    original_pole_b: str
    note: str | None = None
    edited_at: str


class TensionLineDetail(BaseModel):
    """A TensionLine with its constituent TEUs embedded for in-page review."""

    id: str
    document_id: str
    teu_ids: list[str] = Field(default_factory=list)
    canonical_pole_a: str
    canonical_pole_b: str
    intensity_summary: float = Field(ge=0.0, le=1.0)
    chapter_range: list[int] = Field(default_factory=list)
    thematic_note: str | None = None
    review_status: Literal["pending", "approved", "modified", "rejected"]
    assembled_by: str = Field(
        default="tension_grouper_v1",
        description="Version tag of the grouping step that produced this line",
    )
    assembled_at: str | None = Field(
        default=None,
        description="When grouping produced this line; null for lines cached before provenance existed",
    )
    edit: TensionLineEditResponse | None = Field(
        default=None,
        description="Present once a reviewer has rewritten the pole labels",
    )
    teus: list[TEUSummary] = Field(default_factory=list)


class TensionThemeResponse(BaseModel):
    id: str
    document_id: str
    tension_line_ids: list[str] = Field(default_factory=list)
    proposition: str
    frye_mythos: str | None = None
    booker_plot: str | None = None
    assembled_by: str
    assembled_at: str
    review_status: Literal["pending", "approved", "modified", "rejected"]
    is_stale: bool = Field(
        default=False,
        description=(
            "True when the TensionLines this theme was built from no longer "
            "match the set a fresh synthesis would use"
        ),
    )
    stale_reason: Literal["no_lines", "lines_regrouped", "review_changed"] | None = None
