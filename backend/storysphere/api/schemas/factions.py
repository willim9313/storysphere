"""Response schemas for faction-detection endpoint (F-16) — camelCase."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

_CAMEL = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class FactionResponse(BaseModel):
    model_config = _CAMEL

    id: str
    label: str
    member_ids: list[str] = Field(default_factory=list)
    cohesion_score: float
    top_member_names: list[str] = Field(default_factory=list)


class FactionRelationResponse(BaseModel):
    model_config = _CAMEL

    source_faction_id: str
    target_faction_id: str
    cooperation: float
    rivalry: float


class FactionAnalysisResponse(BaseModel):
    model_config = _CAMEL

    book_id: str
    chapter: int | None = None
    factions: list[FactionResponse] = Field(default_factory=list)
    relations: list[FactionRelationResponse] = Field(default_factory=list)
    unaffiliated_entity_ids: list[str] = Field(default_factory=list)
    unaffiliated_names: list[str] = Field(default_factory=list)
