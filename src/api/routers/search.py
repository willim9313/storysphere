"""Semantic search endpoint."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from api.deps import VectorServiceDep

router = APIRouter(prefix="/search", tags=["search"])


class SearchRequest(BaseModel):
    bookId: str | None = Field(default=None, alias="bookId")
    query: str
    topK: int = Field(default=10, ge=1, le=50, alias="topK")


class SearchResult(BaseModel):
    id: str
    text: str
    score: float
    metadata: dict[str, Any]


@router.post("/", response_model=list[SearchResult])
async def semantic_search(
    vector: VectorServiceDep,
    body: SearchRequest,
) -> list[SearchResult]:
    results = await vector.search(
        query_text=body.query,
        top_k=body.topK,
        document_id=body.bookId,
    )
    return [
        SearchResult(
            id=r.id,
            text=r.text,
            score=r.score,
            metadata={},
        )
        for r in results
    ]
