"""Relation query endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from api.deps import KGServiceDep
from api.schemas.entity import RelationStatsResponse

router = APIRouter(prefix="/relations", tags=["relations"])


class RelationPathsResponse(BaseModel):
    source_id: str
    target_id: str
    paths: list[list[dict[str, Any]]]


@router.get("/paths", response_model=RelationPathsResponse)
async def get_relation_paths(
    kg: KGServiceDep,
    source_id: str = Query(description="Source entity ID"),
    target_id: str = Query(description="Target entity ID"),
    max_length: int = Query(default=3, ge=1, le=6),
) -> RelationPathsResponse:
    """Find all simple paths between two entities in the knowledge graph."""
    source = await kg.get_entity(source_id)
    if source is None:
        raise HTTPException(status_code=404, detail=f"Entity '{source_id}' not found")
    target = await kg.get_entity(target_id)
    if target is None:
        raise HTTPException(status_code=404, detail=f"Entity '{target_id}' not found")

    paths = await kg.get_relation_paths(
        source_id=source_id,
        target_id=target_id,
        max_length=max_length,
    )
    return RelationPathsResponse(
        source_id=source_id,
        target_id=target_id,
        paths=[[n.model_dump() for n in p.nodes] for p in paths],
    )


@router.get("/stats", response_model=RelationStatsResponse)
async def get_relation_stats(
    kg: KGServiceDep,
    entity_id: str | None = Query(default=None, description="Scope to a specific entity (optional)"),
) -> RelationStatsResponse:
    """Return relation-type distribution and weight statistics."""
    if entity_id is not None:
        entity = await kg.get_entity(entity_id)
        if entity is None:
            raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")

    stats = await kg.get_relation_stats(entity_id=entity_id)
    return RelationStatsResponse(stats=stats.model_dump())
