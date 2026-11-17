"""Schemas of the book overview (docs/spec/04 §2.4、N-03b、N-03c)."""

from __future__ import annotations

from typing import Any

from storysphere.api.schemas.common import ApiModel, UtcDatetime


class Card(ApiModel):
    """結果卡（04 §2.4）。"""

    ref_id: str
    code: str | None
    question: str  # 視角檔的卡片標題，可能和方法自己的 question 不同
    perspective: str  # universal／題材 id
    view_type: str | None
    # not_run／running／done／not_applicable／failed／basis_changed
    state: str
    implemented: bool  # false＝原型尚未支援這個方法；state 會是 not_run，UI 標「尚未支援」
    run_id: str | None
    job_id: str | None
    max_level: int | None
    finished_at: UtcDatetime | None
    precheck: dict[str, Any] | None


class AskableItem(ApiModel):
    ref_id: str
    code: str | None
    question: str
    ref_kind: str  # method／methodology
    layer: str | None
    mechanism: str | None
    grade: str
    priority: str | None
    implemented: bool
    # 不叫 LLM 的前提檢查：缺第 1 層類型等補不了的東西時有值，UI 先標「不適用」
    precheck: dict[str, Any] | None


class OtherSignal(ApiModel):
    mechanism: str  # 機制 id，不轉
    density: float
    chapters: list[int]  # 有這個機制訊號的章
    suggested_question: str
    supported: bool


class Askable(ApiModel):
    """N-03c。"""

    askable: list[AskableItem]
    other_signals: list[OtherSignal]
