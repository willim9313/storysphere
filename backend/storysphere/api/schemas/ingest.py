"""Schemas of the ingest endpoints (docs/spec/04 §4.2、N-01b)."""

from __future__ import annotations

from typing import Any

from storysphere.api.schemas.common import ApiModel, UtcDatetime


class UploadAccepted(ApiModel):
    job_id: str
    duplicate_title: bool  # 書庫已有同名的書


class IngestStep(ApiModel):
    step: str  # p1／review／s1…s5
    state: str  # pending／running／done／failed／skipped／paused
    started_at: UtcDatetime | None
    finished_at: UtcDatetime | None
    run_id: str | None  # 該入庫步驟的 run（ref_id=ingest.s2 等）；沒有 run 的步驟是 null


class UnitCounts(ApiModel):
    total: int
    done: int
    failed: int
    pending: int  # 含執行中


class FailedUnit(ApiModel):
    stage: str
    unit_id: str
    chapter: int
    error: str | None


class IngestStatus(ApiModel):
    """N-02a。"""

    job_id: str | None
    job_status: str | None
    steps: list[IngestStep]
    units: dict[str, UnitCounts]  # key 是 stage（s1a／s1b／s4a），不轉
    failed_units: list[FailedUnit]
    genre_profile: dict[str, Any] | None


class UnitItem(ApiModel):
    unit_id: str
    stage: str
    chapter: int
    first_paragraph_position: int
    status: str
    attempts: int
    model: str | None
    prompt_version: str | None
    error: str | None


class UnitPage(ApiModel):
    items: list[UnitItem]
    next_cursor: str | None
    total: int


class UnitDetail(UnitItem):
    """N-02c。"""

    paragraph_ids: list[str]
    context_paragraph_id: str | None  # 只當脈絡、不抽取的那一段（前一單位的最後一段）
    raw_output: Any  # LLM 輸出原樣，不轉 camelCase


class ReviewParagraph(ApiModel):
    paragraph_index: int  # 全書攤平後的段落序號；送出審閱時用它指段落
    text: str
    role: str
    title_span: list[int] | None
    sentences: list[str]


class ReviewChapter(ApiModel):
    chapter_idx: int
    title: str | None
    role: str
    paragraphs: list[ReviewParagraph]


class ReviewData(ApiModel):
    """N-02d。"""

    chapters: list[ReviewChapter]


class ReviewChapterIn(ApiModel):
    title: str | None = None
    role: str
    start_paragraph_index: int


class ReviewIn(ApiModel):
    """N-02e。省略 `chapters`＝接受系統判斷，這時另外兩項也不套用。"""

    chapters: list[ReviewChapterIn] | None = None
    role_overrides: dict[str, str] = {}  # key 是 str(paragraphIndex)
    paragraph_splits: dict[str, list[int]] = {}  # key 是 str(paragraphIndex)，值是切點的字元位置
