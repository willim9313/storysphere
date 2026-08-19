"""Response schemas for the Unraveling manifest.

Moved out of ``routers/unraveling.py``: every other router takes its models
from ``api/schemas/``, and these were the last ones defined inline.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

NodeStatus = Literal["complete", "partial", "empty"]


class NodeData(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True, alias_generator=to_camel
    )

    node_id: str
    layer: int
    label: str
    status: NodeStatus
    counts: dict[str, int]
    meta: dict[str, Any] = {}
    parent_id: str | None = None


class EdgeData(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True, alias_generator=to_camel
    )

    source: str
    target: str


class UnravelingManifest(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True, alias_generator=to_camel
    )

    book_id: str
    nodes: list[NodeData]
    edges: list[EdgeData]


class ChapterDistribution(BaseModel):
    """Per-chapter counts for chapter-aware nodes.

    Only nodes whose underlying data is naturally indexed by chapter
    appear in ``distributions``. Other nodes (book-level synthesis,
    cache-keyed analyses, KG entities without chapter linkage) are omitted.
    """

    model_config = ConfigDict(
        populate_by_name=True, alias_generator=to_camel
    )

    book_id: str
    total_chapters: int
    distributions: dict[str, list[int]]
