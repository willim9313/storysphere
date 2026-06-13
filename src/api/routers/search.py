"""Semantic search endpoint."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from api.deps import VectorServiceDep

router = APIRouter(prefix="/search", tags=["search"])


class SearchRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: str | None = None
    query: str
    top_k: int = Field(default=10, ge=1, le=50)


class SearchResultMetadata(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    document_id: str
    chapter_number: int
    position: int


class SearchResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: str
    text: str
    score: float
    metadata: SearchResultMetadata


@router.post("/", response_model=list[SearchResult])
async def semantic_search(
    vector: VectorServiceDep,
    body: SearchRequest,
) -> list[SearchResult]:
    results = await vector.search(
        query_text=body.query,
        top_k=body.top_k,
        document_id=body.book_id,
    )
    return [
        SearchResult(
            id=r.id,
            text=r.text,
            score=r.score,
            metadata=SearchResultMetadata(
                document_id=r.document_id,
                chapter_number=r.chapter_number,
                position=r.position,
            ),
        )
        for r in results
    ]
