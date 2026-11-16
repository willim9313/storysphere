"""S2 各步驟共用的小工具：輸入單位、內容驗證。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from storysphere.domain.evidence.base import EvidenceContent
from storysphere.ingest.s2.locate import find_quote
from storysphere.ingest.s2.report import (
    CONTENT_INVALID,
    FIELD_INVALID,
    QUOTE_NOT_FOUND,
    S2Report,
)
from storysphere.ingest.units import IngestUnit
from storysphere.store.evidence_writer import QuoteDraft

# S1 沒有給信心；入庫抽取一律用同一個值（原型決定）。
EXTRACTION_CONFIDENCE = 0.8
SUMMARY_MAX = 120


@dataclass(frozen=True)
class UnitView:
    """One unit with the raw S1 outputs stored for it (None if that stage has none)."""

    unit: IngestUnit
    s1a: Any
    s1b: Any


def short(text: str, limit: int = SUMMARY_MAX) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def clean_content(
    model: type[EvidenceContent], data: dict[str, Any], report: S2Report, label: str
) -> dict[str, Any] | None:
    """Validate ``data``; fix what can be fixed, drop the item otherwise.

    有預設值的選填欄位（枚舉不對、型別不對）直接拿掉改用預設並記警告；必填欄位有問題
    則整筆丟掉（內容驗證失敗）。
    """
    data = dict(data)
    for _ in range(len(model.model_fields) + 1):
        try:
            return model.model_validate(data).model_dump(mode="json")
        except ValidationError as exc:
            bad = {err["loc"][0] for err in exc.errors() if err["loc"]}
            removable = {
                name
                for name in bad
                if name in data
                and name in model.model_fields
                and not model.model_fields[name].is_required()
            }
            if not removable or bad - removable:
                report.drop(CONTENT_INVALID, f"{label}: {model.claim_type} invalid ({sorted(bad)})")
                return None
            for name in removable:
                del data[name]
                report.drop_field(FIELD_INVALID, f"{label}: {model.claim_type}.{name} reset")
    report.drop(CONTENT_INVALID, f"{label}: {model.claim_type} could not be repaired")
    return None


def locate_item_quote(
    view: UnitView, raw_quote: Any, texts: dict[str, str], report: S2Report, label: str
) -> QuoteDraft | None:
    """Find the quote of one S1 item in the unit; counts toward the verification rate."""
    report.quotes_total += 1
    found = find_quote(raw_quote, view.unit.paragraph_ids, texts)
    if found is None:
        report.drop(QUOTE_NOT_FOUND, f"{view.unit.id}: {label}")
        return None
    report.quotes_verified += 1
    report.quotes_loose += found.loose
    return found.draft
