"""query_models — Pydantic models for service query results.

These models replace bare ``dict`` / ``list[dict]`` returns in the service layer,
providing typed, IDE-friendly results for the tools and API layers.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


# ── Document / Chapter ────────────────────────────────────────────────────────


class DocumentSummary(BaseModel):
    """Lightweight document entry returned by ``DocumentService.list_documents``."""

    id: str = Field(description="Document UUID")
    title: str = Field(description="Book title")
    file_type: str = Field(description="Source file type (pdf | docx)")
    chapter_count: int = Field(description="Number of chapters")
    pipeline_status_json: str | None = Field(default=None, description="JSON-encoded PipelineStatus")


class ChapterKeywordMatch(BaseModel):
    """Chapter entry returned by ``DocumentService.search_chapters_by_keyword``."""

    chapter_number: int = Field(description="Chapter number (1-based)")
    title: str | None = Field(default=None, description="Chapter title, if any")
    score: float = Field(description="Keyword relevance score (0–1)")


# ── Vector search ─────────────────────────────────────────────────────────────


class VectorSearchResult(BaseModel):
    """Single hit returned by ``VectorService.search``."""

    id: str = Field(description="Qdrant point ID")
    score: float = Field(description="Cosine similarity score")
    text: str = Field(description="Paragraph text")
    document_id: str = Field(description="Parent document UUID")
    chapter_number: int = Field(description="Chapter number (1-based)")
    position: int = Field(description="Paragraph position within chapter")


class KeywordSearchResult(BaseModel):
    """Single hit returned by ``VectorService.search_by_keyword``."""

    id: str = Field(description="Qdrant point ID")
    text: str = Field(description="Paragraph text")
    document_id: str = Field(description="Parent document UUID")
    chapter_number: int = Field(description="Chapter number (1-based)")
    position: int = Field(description="Paragraph position within chapter")
    keyword_scores: dict[str, float] = Field(
        default_factory=dict, description="Keyword → score mapping for matched keywords"
    )


# ── Knowledge-graph paths ─────────────────────────────────────────────────────


class PathNode(BaseModel):
    """A single node (entity) in a relation path."""

    entity_id: str = Field(description="Entity UUID")
    name: str = Field(description="Entity display name")
    relation_from_prev: dict | None = Field(
        default=None,
        description="Edge data connecting this node to the previous one (absent for the first node)",
    )


class RelationPath(BaseModel):
    """One simple path between two entities, as returned by ``KGService.get_relation_paths``."""

    nodes: list[PathNode] = Field(default_factory=list, description="Ordered list of nodes along the path")


# ── Knowledge-graph subgraph ──────────────────────────────────────────────────


class SubgraphNode(BaseModel):
    """A node in the ego-graph subgraph."""

    entity_id: str = Field(description="Entity UUID")
    name: str = Field(description="Entity display name")
    entity_type: str = Field(description="Entity type (character | location | …)")


class SubgraphEdge(BaseModel):
    """An edge in the ego-graph subgraph."""

    source: str = Field(description="Source entity UUID")
    target: str = Field(description="Target entity UUID")
    relation_type: str = Field(description="Relation type label")
    description: str | None = Field(default=None, description="Human-readable relation description")
    weight: float = Field(default=1.0, description="Relation weight (higher = stronger)")


class Subgraph(BaseModel):
    """Ego-graph returned by ``KGService.get_subgraph``."""

    center: str = Field(description="UUID of the centre entity")
    nodes: list[SubgraphNode] = Field(default_factory=list, description="All nodes within k hops")
    edges: list[SubgraphEdge] = Field(default_factory=list, description="All edges within the subgraph")


# ── Knowledge-graph statistics ────────────────────────────────────────────────


class RelationStats(BaseModel):
    """Relation statistics returned by ``KGService.get_relation_stats``."""

    total_relations: int = Field(description="Total number of unique relations")
    type_distribution: dict[str, int] = Field(
        default_factory=dict, description="Count per relation type label"
    )
    weight_avg: float = Field(description="Average relation weight")
    weight_min: float = Field(description="Minimum relation weight")
    weight_max: float = Field(description="Maximum relation weight")


# ── Narrative temporal coverage ───────────────────────────────────────────────


class TemporalCoverageStats(BaseModel):
    """Story-time coverage stats returned by ``NarrativeService.check_temporal_coverage``."""

    total_events: int = Field(description="Total events in the document")
    events_with_hint: int = Field(description="Events that have a story_time_hint")
    coverage: float = Field(description="Fraction of events with a hint (0.0–1.0)")
    coverage_sufficient: bool = Field(
        description="True when coverage meets the minimum threshold for temporal analysis"
    )
