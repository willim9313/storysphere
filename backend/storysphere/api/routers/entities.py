"""Entity lookup by id — the one entity endpoint with a caller.

The other five (`GET /entities`, `/relations`, `/timeline`, `/subgraph`,
`/relation-stats`) were removed in 2026-09-07: they were HTTP shells over
KGService methods that the chat agent reaches directly through
`tools/graph_tools/`, and no client ever called them. See the "未納入契約的端點"
section of docs/API_CONTRACT.md, which had listed them as pending removal.

This one stays because the symbols page uses it (`fetchEntityById`, #24a).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from storysphere.api.deps import KGServiceDep
from storysphere.api.schemas.entity import EntityResponse

router = APIRouter(prefix="/entities", tags=["entities"])


@router.get("/{entity_id}", response_model=EntityResponse)
async def get_entity(entity_id: str, kg: KGServiceDep) -> EntityResponse:
    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Entity '{entity_id}' not found")
    return EntityResponse.from_domain(entity)
