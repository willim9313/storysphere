"""Semantic search endpoint."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel

from api.deps import VectorServiceDep

router = APIRouter(prefix="/search", tags=["search"])


class SearchResult(BaseModel):
    id: str
    text: str
    score: float
    metadata: dict[str, Any]


@router.get("/", response_model=list[SearchResult])
async def semantic_search(
    vector: VectorServiceDep,
    q: str = Query(description="Search query"),
    limit: int = Query(default=10, ge=1, le=50),
    document_id: str | None = Query(default=None, description="Filter by document"),
) -> list[SearchResult]:
    results = await vector.search(
        query_text=q,
        top_k=limit,
        document_id=document_id,
    )
    return [
        SearchResult(
            id=r.get("id", ""),
            text=r.get("text", ""),
            score=r.get("score", 0.0),
            metadata=r.get("metadata", {}),
        )
        for r in results
    ]
