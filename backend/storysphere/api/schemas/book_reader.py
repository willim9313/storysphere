"""Request/response schemas for the reader view endpoints.

Split out of ``schemas/books.py``: ``routers/books.py`` was divided by theme in
35647a3 but its schemas were not, leaving seven routers sharing one 779-line
module. Class names are unchanged, so the OpenAPI component names — and
``generated.ts`` — are unaffected.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from storysphere.api.schemas.books import Segment

_CAMEL = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class ChunkResponse(BaseModel):
    model_config = _CAMEL

    id: str
    chapter_id: str
    order: int
    content: str
    keywords: list[str] = []
    segments: list[Segment] = []


class EntityChunkItem(BaseModel):
    model_config = _CAMEL

    id: str
    chapter_id: str
    chapter_title: str | None = None
    chapter_number: int
    order: int
    content: str
    segments: list[Segment] = []


class EntityChunksResponse(BaseModel):
    model_config = _CAMEL

    entity_id: str
    entity_name: str
    total: int
    chunks: list[EntityChunkItem] = []
