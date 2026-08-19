"""Request/response schemas for graph and inferred relations endpoints.

Split out of ``schemas/books.py``: ``routers/books.py`` was divided by theme in
35647a3 but its schemas were not, leaving seven routers sharing one 779-line
module. Class names are unchanged, so the OpenAPI component names — and
``generated.ts`` — are unaffected.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

_CAMEL = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class GraphNode(BaseModel):
    model_config = _CAMEL

    id: str
    name: str
    type: str
    description: str | None = None
    chunk_count: int = 0
    event_type: str | None = None
    chapter: int | None = None


class GraphEdge(BaseModel):
    model_config = _CAMEL

    id: str
    source: str
    target: str
    label: str | None = None
    weight: float | None = None
    # F-01 inferred relation fields
    inferred: bool = False
    confidence: float | None = None
    inferred_id: str | None = None


class GraphDataResponse(BaseModel):
    model_config = _CAMEL

    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []


class MisbeliefItemSchema(BaseModel):
    model_config = _CAMEL

    character_belief: str
    actual_truth: str
    source_event_id: str
    confidence: float


class EpistemicStateResponse(BaseModel):
    model_config = _CAMEL

    character_id: str
    character_name: str
    up_to_chapter: int
    known_events: list[dict[str, Any]]
    unknown_events: list[dict[str, Any]]
    misbeliefs: list[MisbeliefItemSchema]
    data_complete: bool


class ClassifyVisibilityResponse(BaseModel):
    """Result of retroactive visibility classification.

    Temporary feature — may be replaced by a dedicated re-ingest pipeline.
    """

    model_config = _CAMEL

    classified: int
    skipped: int
    total: int


class InferredRelationResponse(BaseModel):
    model_config = _CAMEL

    id: str
    document_id: str
    source_id: str
    target_id: str
    source_name: str
    target_name: str
    common_neighbor_count: int
    adamic_adar_score: float
    confidence: float
    suggested_relation_type: str
    reasoning: str
    status: str
    visible_from_chapter: int | None = None
    confirmed_relation_id: str | None = None
    created_at: float


class InferredRelationsResponse(BaseModel):
    model_config = _CAMEL

    items: list[InferredRelationResponse] = []
    total: int = 0


class RunInferenceRequest(BaseModel):
    model_config = _CAMEL

    force_refresh: bool = False


class ConfirmInferredRequest(BaseModel):
    model_config = _CAMEL

    # Optional override; when absent, the confirm endpoint promotes the
    # InferredRelationType to its canonical RelationType (see
    # domain.inferred_relations.promote_inferred_type).
    relation_type: str | None = None
