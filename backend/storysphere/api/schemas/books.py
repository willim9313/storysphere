"""Schemas of the book endpoints (docs/spec/04 §4.1、N-03a)."""

from __future__ import annotations

from typing import Any

from storysphere.api.schemas.common import ApiModel, UtcDatetime


class Book(ApiModel):
    """N-01a 的一列。"""

    id: str
    title: str
    author: str | None
    language: str
    chapter_count: int  # 只算正文章（role=body）
    effective_genre: str | None  # genre_override ?? genre_profile.primary
    ingest_status: str | None  # 最近一個入庫類 job 的 status；沒有 job 時是 null
    ingest_job_id: str | None
    uploaded_at: UtcDatetime


class BookDetail(Book):
    """N-01c。"""

    file_type: str
    processed_at: UtcDatetime | None
    # 02 §5 的 JSON，key 轉 camelCase；`mechanismDensity` 的 key 是機制名，不轉。
    genre_profile: dict[str, Any] | None
    genre_override: str | None


class ChapterItem(ApiModel):
    """N-01e 的一列。"""

    number: int
    title: str | None
    role: str
    paragraph_count: int
    first_paragraph_id: str | None


class MixedGenre(ApiModel):
    genre: str
    score: float
    chapters: list[int]


class GenreCard(ApiModel):
    """N-03a 題材判定卡；還沒跑到 S3 時 `primary` 以下都是空的。"""

    primary: str | None
    mixed: list[MixedGenre]
    mechanism_density: dict[str, float]  # key 是機制名，不轉
    rationale: str | None
    detected_by: str | None
    detected_at: str | None
    override: str | None
    effective_genre: str | None
