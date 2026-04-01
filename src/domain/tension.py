"""Tension analysis domain models — B-026.

Hierarchy:
  TEU (scene-level)  →  TensionLine (cross-scene pattern)  →  TensionTheme (book-level)

TensionLine and TensionTheme are stubs here; their assembly logic lives in
B-027 and B-029 respectively.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class TensionPole(BaseModel):
    """One side of a binary tension — the 'what is at stake' for that side."""

    concept_name: str = Field(description="The abstract concept or value at stake")
    concept_id: Optional[str] = Field(
        default=None,
        description="Entity ID of the Concept node in KG (if linked)",
    )
    carrier_ids: list[str] = Field(
        default_factory=list,
        description="Entity IDs of characters/entities embodying this pole",
    )
    carrier_names: list[str] = Field(
        default_factory=list,
        description="Names of carriers (denormalized for display)",
    )
    stance: Optional[str] = Field(
        default=None,
        description="Short description of how carriers embody this pole",
    )


class TEU(BaseModel):
    """Tension Evidence Unit — smallest unit of tension analysis.

    Describes the opposing dynamic within a single scene (Event).
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_id: str = Field(description="Source Event ID from KGService")
    document_id: str = Field(description="Book document ID")
    chapter: int = Field(description="Chapter where the tension occurs")

    pole_a: TensionPole = Field(description="One side of the tension")
    pole_b: TensionPole = Field(description="The opposing side of the tension")

    tension_description: str = Field(
        description="1-2 sentence description of what is in conflict"
    )
    intensity: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="How intense this tension is (0=minor, 1=climactic)",
    )
    evidence: list[str] = Field(
        default_factory=list,
        description="Text quotations or paraphrases supporting this reading",
    )
    thematic_note: Optional[str] = Field(
        default=None,
        description="Optional: what broader theme this tension serves",
    )

    # Provenance
    assembled_by: str = Field(
        default="tension_service_v1",
        description="Version tag of the assembler",
    )
    assembled_at: datetime = Field(default_factory=datetime.utcnow)

    # HITL review (used by B-027 grouping step)
    review_status: Literal["pending", "approved", "rejected"] = "pending"


class TensionLine(BaseModel):
    """Cross-scene tension pattern — grouping of related TEUs.

    Stub model; full assembly logic implemented in B-027.
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    document_id: str
    teu_ids: list[str] = Field(default_factory=list)
    canonical_pole_a: str = Field(default="", description="Canonical label for pole A")
    canonical_pole_b: str = Field(default="", description="Canonical label for pole B")
    intensity_summary: float = Field(default=0.0, ge=0.0, le=1.0)
    chapter_range: list[int] = Field(default_factory=list)
    review_status: Literal["pending", "approved", "modified", "rejected"] = "pending"


class TensionTheme(BaseModel):
    """Book-level tension proposition — synthesised from TensionLines.

    Stub model; full synthesis logic implemented in B-029.
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    document_id: str
    tension_line_ids: list[str] = Field(default_factory=list)
    proposition: str = Field(default="", description="The book-level thematic claim")
    frye_mythos: Optional[str] = Field(default=None, description="Frye mythos label")
    booker_plot: Optional[str] = Field(default=None, description="Booker plot label")
    review_status: Literal["pending", "approved", "modified", "rejected"] = "pending"
