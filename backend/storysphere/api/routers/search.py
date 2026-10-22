"""Semantic and full-text search endpoint."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
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


async def _book_exists(doc: DocServiceDep, book_id: str) -> bool:
    return any(d.id == book_id for d in await doc.list_documents())


@router.post("/")
async def search(
    vector: VectorServiceDep,
    doc: DocServiceDep,
    body: SearchRequest,
) -> list[SearchResult]:
    # Existence checks run only when a single-book query comes back empty or fails,
    # so the common path costs nothing extra.
    if body.mode == "fulltext":
        results = await doc.search_paragraphs_by_text(
            query=body.query,
            document_id=body.book_id,
            top_k=body.top_k,
        )
        if not results and body.book_id and not await _book_exists(doc, body.book_id):
            raise HTTPException(status_code=404, detail=f"Book '{body.book_id}' not found")
    else:
        try:
            results = await vector.search(
                query_text=body.query,
                top_k=body.top_k,
                document_id=body.book_id,
            )
        except Exception:
            if body.book_id is None:
                raise
            if not await _book_exists(doc, body.book_id):
                raise HTTPException(
                    status_code=404, detail=f"Book '{body.book_id}' not found"
                ) from None
            if not await vector.has_collection(body.book_id):
                raise HTTPException(
                    status_code=409,
                    detail=f"Book '{body.book_id}' has no semantic index yet",
                ) from None
            raise

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
