"""Response schemas for character centrality metrics endpoint — camelCase."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

_CAMEL = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class CharacterMetricResponse(BaseModel):
    model_config = _CAMEL

    entity_id: str
    name: str
    pagerank: float
    degree: int


class CharacterMetricsResponse(BaseModel):
    model_config = _CAMEL

    book_id: str
    metrics: list[CharacterMetricResponse] = Field(default_factory=list)
