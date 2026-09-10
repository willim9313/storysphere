"""Inferred thematic Concept candidates awaiting review (B-092).

``ConceptInferencePipeline`` asks an LLM for hidden thematic propositions.  Those
propositions land here rather than straight in the knowledge graph, because
anything in the graph gets fed to the next LLM round as established fact —
``TensionService.assemble_teu`` loads Concept nodes and puts them in the prompt.
A wrong proposition written directly to the graph would keep being handed
forward as a premise, so it waits for a human the same way the far more
conservative graph-algorithm suggestions do (F-01).
"""

from __future__ import annotations

import time
import uuid

from pydantic import BaseModel, Field

# Reused, not redefined: pending/confirmed/rejected means the same thing here as
# it does for inferred relations, and two copies would drift.
from storysphere.domain.inferred_relations import InferenceStatus

__all__ = ["InferenceStatus", "InferredConcept"]


class InferredConcept(BaseModel):
    """An LLM-proposed thematic proposition, not yet part of the graph."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    document_id: str

    #: The proposition as a short declarative sentence — also its identity
    #: within a book, so re-running inference updates rather than duplicates.
    name: str
    description: str = ""
    #: Quotations or paraphrases the LLM offered as support.
    evidence: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    #: Versioned producer tag, e.g. ``tension_pre_analysis_v1``.
    inferred_by: str = ""

    status: InferenceStatus = InferenceStatus.PENDING
    #: Set once confirmed and a Concept Entity has been written to the KG.
    confirmed_entity_id: str | None = None

    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default_factory=time.time)
