"""Character centrality metrics domain models.

Pure data containers used by CharacterMetricsService. snake_case per domain
convention (mirrors ``domain/faction.py``).
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class CharacterMetric(BaseModel):
    """PageRank + degree for a single character on the full entity graph."""

    entity_id: str
    name: str
    pagerank: float = Field(ge=0.0)
    degree: int = Field(ge=0)


class CharacterMetricsAnalysis(BaseModel):
    """Centrality metrics for every character in a book."""

    book_id: str
    metrics: list[CharacterMetric] = Field(default_factory=list)
