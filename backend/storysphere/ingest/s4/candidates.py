"""把 S4a 的原始輸出整理成 S4b 的候選（02 §6）。

`raw_json` 沒驗證過：不是 dict、欄位缺、型別不對的項目丟掉並記警告。每個候選的引文都在
所屬單位的段落裡定位（含 S2 的退路）；沒有可驗證引文的不進候選。候選 id 依「單位順序、
類型順序、項目順序」編號（`cand_1`…），同一批輸出重算會得到同樣的 id。
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

from storysphere.ingest.s2.common import UnitView, locate_item_quote
from storysphere.ingest.s2.parse import clean_str, list_items, str_list
from storysphere.ingest.s2.report import FIELD_INVALID, MALFORMED_ITEM, NAME_FIELD_UNRESOLVED
from storysphere.ingest.s4.plan import CharacterIndex
from storysphere.ingest.s4.report import ENUM_DEFAULTED, REVEALER_UNRESOLVED, S4Report
from storysphere.ingest.units import IngestUnit
from storysphere.store.evidence_writer import QuoteDraft

Kind = Literal["hidden_truth", "reveal", "clue", "trick"]

# 輸出 key → 候選類型；顯示順序也是編號順序。
_KEYS: tuple[tuple[Kind, str], ...] = (
    ("hidden_truth", "hidden_truth"),
    ("reveal", "reveal"),
    ("clue", "clue_points_to"),
    ("trick", "trick"),
)
_MYSTERY_ONLY = {"clue", "trick"}
_AUDIENCES = ("reader", "characters", "both")
_AUDIENCE_ALIASES = {"readers": "reader", "character": "characters"}


@dataclass(frozen=True)
class Candidate:
    id: str
    kind: Kind
    unit_id: str
    chapter: int
    # 候選的文字：真相／揭曉的 statement、線索的 clue_summary、詭計的 description
    summary: str
    quote: QuoteDraft
    # 該類型自己的欄位（枚舉欄位保留 LLM 給的原字串，寫入時才驗證）
    data: dict[str, Any] = field(default_factory=dict)


def normalize_audience(value: Any) -> str | None:
    """`reader`／`characters`／`both`（容許大小寫、單複數）；不合法回 None。"""
    text = clean_str(value)
    if text is None:
        return None
    text = text.lower()
    text = _AUDIENCE_ALIASES.get(text, text)
    return text if text in _AUDIENCES else None


def _ids(value: Any, characters: CharacterIndex, report: S4Report, label: str) -> list[str]:
    """名字或 id → 角色 id；對不上的只丟該值。"""
    ids: list[str] = []
    for item in str_list(value):
        resolved = characters.resolve(item)
        if resolved is None:
            report.drop_field(NAME_FIELD_UNRESOLVED, f"{label}: cannot resolve '{item}'")
        elif resolved not in ids:
            ids.append(resolved)
    return ids


def _reader_visible(value: Any, report: S4Report, label: str) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.strip().lower() in ("true", "false"):
        return value.strip().lower() == "true"
    report.drop_field(FIELD_INVALID, f"{label}: reader_visible '{value}' → true")
    return True


def _fields(
    kind: Kind, item: dict[str, Any], characters: CharacterIndex, report: S4Report, label: str
) -> tuple[str, dict[str, Any]] | None:
    """``(summary, data)``；必填欄位缺或對不上則回 None（整筆丟掉）。"""
    if kind == "hidden_truth":
        statement = clean_str(item.get("statement"))
        if statement is None:
            report.drop(MALFORMED_ITEM, f"{label}: no statement")
            return None
        audience = normalize_audience(item.get("concealed_from"))
        if audience is None and item.get("concealed_from") is not None:
            report.drop_field(ENUM_DEFAULTED, f"{label}: concealed_from '{item['concealed_from']}'")
        return statement, {
            "truth_kind": clean_str(item.get("truth_kind")),
            "concealer_ids": _ids(item.get("concealer_ids"), characters, report, label),
            "concealed_from": audience,
        }
    if kind == "reveal":
        statement = clean_str(item.get("statement"))
        if statement is None:
            report.drop(MALFORMED_ITEM, f"{label}: no statement")
            return None
        revealer = characters.resolve(item.get("revealer_id"))
        if revealer is None:
            report.drop(REVEALER_UNRESOLVED, f"{label}: revealer '{item.get('revealer_id')}'")
            return None
        audience = normalize_audience(item.get("audience"))
        if audience is None:
            report.drop_field(ENUM_DEFAULTED, f"{label}: audience '{item.get('audience')}'")
        return statement, {
            "revealer_id": revealer,
            "audience": audience,
            "reveal_method": clean_str(item.get("reveal_method")),
        }
    if kind == "clue":
        summary = clean_str(item.get("clue_summary"))
        if summary is None:
            report.drop(MALFORMED_ITEM, f"{label}: no clue_summary")
            return None
        return summary, {
            "points_to_ids": _ids(item.get("points_to_ids"), characters, report, label),
            "noticed_by_ids": _ids(item.get("noticed_by_ids"), characters, report, label),
            "reader_visible": _reader_visible(item.get("reader_visible", True), report, label),
        }
    description = clean_str(item.get("description"))
    if description is None:
        report.drop(MALFORMED_ITEM, f"{label}: no description")
        return None
    return description, {"trick_category": clean_str(item.get("trick_category"))}


def build_candidates(
    units: Sequence[IngestUnit],
    outputs: dict[str, Any],
    texts: dict[str, str],
    characters: CharacterIndex,
    report: S4Report,
    *,
    mystery: bool,
) -> list[Candidate]:
    """All usable candidates of the units that have an `s4a` output, in reading order."""
    candidates: list[Candidate] = []
    for unit in units:
        if unit.id not in outputs:
            continue
        view = UnitView(unit, outputs[unit.id], None)
        for kind, key in _KEYS:
            if kind in _MYSTERY_ONLY and not mystery:
                continue
            for item in list_items(outputs[unit.id], key, report, unit.id, required=False):
                label = f"{unit.id} {key}"
                fields = _fields(kind, item, characters, report, label)
                if fields is None:
                    continue
                summary, data = fields
                quote = locate_item_quote(
                    view, item.get("quote"), texts, report, f"{key} '{summary[:30]}'"
                )
                if quote is None:
                    continue
                candidates.append(
                    Candidate(
                        id=f"cand_{len(candidates) + 1}",
                        kind=kind,
                        unit_id=unit.id,
                        chapter=unit.chapter,
                        summary=summary,
                        quote=quote,
                        data=data,
                    )
                )
    for candidate in candidates:
        report.candidates[candidate.kind] = report.candidates.get(candidate.kind, 0) + 1
    return candidates


def candidate_line(candidate: Candidate) -> str:
    """One JSON line of the S4b `candidates` input."""
    row: dict[str, Any] = {
        "id": candidate.id,
        "type": candidate.kind,
        "chapter": candidate.chapter,
        "summary": candidate.summary,
    }
    row.update({k: v for k, v in candidate.data.items() if v not in (None, [])})
    row["quote"] = candidate.quote.text
    return json.dumps(row, ensure_ascii=False)


def split_batches(candidates: Sequence[Candidate], size: int) -> list[list[Candidate]]:
    """每批 ``size`` 筆，依書中順序。"""
    return [list(candidates[i : i + size]) for i in range(0, len(candidates), size)]
