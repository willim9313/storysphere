"""Entity query endpoints — all synchronous, target <100ms."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from api.deps import KGServiceDep
from api.schemas.entity import (
    EntityListResponse,
    EntityResponse,
    RelationResponse,
    RelationStatsResponse,
    SubgraphResponse,
    TimelineEntry,
)

router = APIRouter(prefix="/entities", tags=["entities"])


@router.get("/{entity_id}", response_model=EntityResponse)
async def get_entity(entity_id: str, kg: KGServiceDep) -> EntityResponse:
    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")
    return EntityResponse.from_domain(entity)


@router.get("/", response_model=EntityListResponse)
async def list_entities(
    kg: KGServiceDep,
    entity_type: str | None = Query(default=None, description="Filter by entity type"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> EntityListResponse:
    from domain.entities import EntityType  # noqa: PLC0415

    et = EntityType(entity_type) if entity_type else None
    all_entities = await kg.list_entities(entity_type=et)
    total = len(all_entities)
    page = all_entities[offset : offset + limit]
    return EntityListResponse(
        items=[EntityResponse.from_domain(e) for e in page],
        total=total,
    )


@router.get("/{entity_id}/relations", response_model=list[RelationResponse])
async def get_entity_relations(
    entity_id: str,
    kg: KGServiceDep,
    relation_type: str | None = Query(default=None),
    direction: str = Query(default="both", description="'outgoing', 'incoming', or 'both'"),
) -> list[RelationResponse]:
    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")
    relations = await kg.get_relations(entity_id=entity_id, direction=direction)
    if relation_type:
        relations = [r for r in relations if r.relation_type.value == relation_type]
    return [RelationResponse.from_domain(r) for r in relations]


@router.get("/{entity_id}/timeline", response_model=list[TimelineEntry])
async def get_entity_timeline(
    entity_id: str,
    kg: KGServiceDep,
    order: str = Query(default="narrative", description="'narrative' or 'chronological'"),
) -> list[TimelineEntry]:
    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")
    events = await kg.get_entity_timeline(entity_id, sort_by=order)
    return [
        TimelineEntry(
            event_id=e.id,
            title=e.title,
            chapter=e.chapter,
            description=e.description,
            chronological_rank=e.chronological_rank,
            narrative_mode=e.narrative_mode.value,
        )
        for e in events
    ]


@router.get("/{entity_id}/subgraph", response_model=SubgraphResponse)
async def get_entity_subgraph(
    entity_id: str,
    kg: KGServiceDep,
    k_hops: int = Query(default=2, ge=1, le=4),
) -> SubgraphResponse:
    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")
    subgraph = await kg.get_subgraph(entity_id, k_hops=k_hops)
    return SubgraphResponse(
        nodes=[n.model_dump() for n in subgraph.nodes],
        edges=[e.model_dump() for e in subgraph.edges],
    )


@router.get("/{entity_id}/relation-stats", response_model=RelationStatsResponse)
async def get_entity_relation_stats(
    entity_id: str, kg: KGServiceDep
) -> RelationStatsResponse:
    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")
    stats = await kg.get_relation_stats(entity_id=entity_id)
    return RelationStatsResponse(stats=stats.model_dump())
