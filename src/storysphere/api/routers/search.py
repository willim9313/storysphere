"""Semantic and full-text search endpoint."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from storysphere.api.deps import DocServiceDep, VectorServiceDep

router = APIRouter(prefix="/search", tags=["search"])


class SearchRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: str | None = None
    query: str
    top_k: int = Field(default=10, ge=1, le=50)
    mode: Literal["semantic", "fulltext"] = "fulltext"


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


@router.post("/")
async def search(
    vector: VectorServiceDep,
    doc: DocServiceDep,
    body: SearchRequest,
) -> list[SearchResult]:
    if body.mode == "fulltext":
        results = await doc.search_paragraphs_by_text(
            query=body.query,
            document_id=body.book_id,
            top_k=body.top_k,
        )
    else:
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
