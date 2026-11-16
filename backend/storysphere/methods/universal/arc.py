"""CH2 `character.arc`：主要角色怎麼變（docs/spec/03 §4.1）。

LLM：依章節順序給該角色的事件與關係狀態（標題、描述、關係描述；不給原文段落、不給引文），
請模型切成 3–6 段弧線。一個角色一次呼叫。

- 「出現的章」＝該角色參與的事件所在的章，加上涉及他（當 source 或 target）的關係狀態所在的章；
  不重複計算。少於 `MIN_CHAPTERS` 章不產出（`check`，零次 LLM）。
- 控制 prompt 長度：每章最多 `EVENTS_PER_CHAPTER` 個事件、`RELATIONS_PER_CHAPTER` 筆關係狀態，
  全部加總最多 `MAX_EVENTS`／`MAX_RELATIONS`。取捨的優先順序是「有 significance」＞「情緒強度高」
  ＞「敘述順序較前」；留下的再依敘述順序排回去。描述超過 `*_CHARS` 字就截斷。
- 給模型的 id 一律是短代號（C1、E1、R1…），不給 UUID；回來的代號對照回證據 id。
- 草稿的 `derived_from`＝角色本身＋這一段實際用到的事件與關係狀態（只用送出去的那些）。
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from storysphere.ingest.language_detection import get_language_display_name
from storysphere.llm.prompts import load_prompt
from storysphere.methods.base import MethodBase, Precheck, RunContext, ScopeItem
from storysphere.methods.reader import EvidenceView
from storysphere.methods.universal._llm import (
    LlmOutputError,
    ainvoke_json,
    book_language,
    clamp_unit,
    items_of,
)
from storysphere.registry.models import MethodDecl
from storysphere.store.evidence_writer import EvidenceDraft

PROMPT_NAME = "methods/CH2"
MIN_CHAPTERS = 3
MIN_SEGMENTS, MAX_SEGMENTS = 3, 6  # prompt 要求 3–6 段；少於 3 段（扁平角色）仍接受
EVENTS_PER_CHAPTER = 8
RELATIONS_PER_CHAPTER = 4
MAX_EVENTS = 120
MAX_RELATIONS = 40
EVENT_DESC_CHARS = 300
RELATION_DESC_CHARS = 200
DEFAULT_CONFIDENCE = 0.5


def _clip(text: Any, limit: int) -> str:
    value = str(text or "").strip()
    return value if len(value) <= limit else value[:limit] + "…"


def appearance_chapters(events: Sequence[EvidenceView], relations: Sequence[EvidenceView]) -> set[int]:
    """該角色「出現」的章：參與事件的章＋涉及他的關係狀態的章。"""
    chapters = {int(e.content["chapter"]) for e in events}
    chapters.update(r.chapter for r in relations if r.chapter is not None)
    return chapters


def _event_priority(view: EvidenceView) -> tuple[int, float, int, str]:
    c = view.content
    return (
        0 if str(c.get("significance") or "").strip() else 1,
        -float(c.get("emotional_intensity") or 0.0),
        int(c.get("text_rank") or 0),
        view.id,
    )


def select_events(events: Sequence[EvidenceView]) -> list[EvidenceView]:
    """每章與全書各有上限；回傳依 (章, text_rank) 排序。"""
    kept: list[EvidenceView] = []
    by_chapter: dict[int, list[EvidenceView]] = {}
    for e in events:
        by_chapter.setdefault(int(e.content["chapter"]), []).append(e)
    for group in by_chapter.values():
        kept.extend(sorted(group, key=_event_priority)[:EVENTS_PER_CHAPTER])
    kept = sorted(kept, key=_event_priority)[:MAX_EVENTS]
    return sorted(kept, key=lambda e: (int(e.content["chapter"]), int(e.content["text_rank"]), e.id))


def select_relations(relations: Sequence[EvidenceView]) -> list[EvidenceView]:
    """每章與全書各有上限（權重大的優先）；回傳依 (章, 原順序) 排序。"""
    order = {r.id: i for i, r in enumerate(relations)}
    by_chapter: dict[int, list[EvidenceView]] = {}
    for r in relations:
        if r.chapter is not None:
            by_chapter.setdefault(r.chapter, []).append(r)

    def priority(r: EvidenceView) -> tuple[float, int]:
        return (-float(r.content.get("weight") or 0.0), order[r.id])

    kept: list[EvidenceView] = []
    for group in by_chapter.values():
        kept.extend(sorted(group, key=priority)[:RELATIONS_PER_CHAPTER])
    kept = sorted(kept, key=priority)[:MAX_RELATIONS]
    return sorted(kept, key=lambda r: (r.chapter or 0, order[r.id]))


@dataclass(frozen=True)
class Segment:
    chapter_start: int
    chapter_end: int
    phase: str
    description: str
    summary: str
    confidence: float
    codes: tuple[str, ...]  # 模型列的依據代號（已過濾成送出去的那些）


def parse_segments(value: Any, chapters: set[int], known_codes: set[str]) -> tuple[list[Segment], str | None]:
    """Valid segments in chapter order (and the abstain reason when there are none).

    不合規格（欄位型別錯、起訖顛倒、段數超過 `MAX_SEGMENTS`、段與段重疊）丟 `LlmOutputError` → 重試。
    依據代號不在送出去的清單裡的丟掉；整段都沒有有效依據時，改用該章節範圍內送出去的證據（在 `run`）。
    """
    items = items_of(value)
    if not items:
        reason = value.get("abstain_reason") if isinstance(value, dict) else None
        return [], str(reason).strip() if reason else None
    if len(items) > MAX_SEGMENTS:
        raise LlmOutputError(f"{len(items)} segments, at most {MAX_SEGMENTS} allowed")
    segments: list[Segment] = []
    for item in items:
        if not isinstance(item, dict):
            raise LlmOutputError("segment is not an object")
        start, end = item.get("chapter_start"), item.get("chapter_end")
        if isinstance(start, bool) or isinstance(end, bool) or not isinstance(start, int) or not isinstance(end, int):
            raise LlmOutputError("chapter_start / chapter_end must be integers")
        if start > end:
            raise LlmOutputError(f"segment ends before it starts ({start}-{end})")
        if start < min(chapters) or end > max(chapters):
            raise LlmOutputError(f"segment {start}-{end} lies outside the chapters given")
        phase = str(item.get("phase") or "").strip()
        description = str(item.get("description") or "").strip()
        if not phase or not description:
            raise LlmOutputError("segment without phase or description")
        raw = item.get("derived_from")
        codes = tuple(dict.fromkeys(c for c in (raw if isinstance(raw, list) else []) if c in known_codes))
        conf = clamp_unit(item.get("confidence"))
        segments.append(
            Segment(
                start, end, phase, description, str(item.get("summary") or "").strip(),
                DEFAULT_CONFIDENCE if conf is None else conf, codes,
            )
        )
    segments.sort(key=lambda s: (s.chapter_start, s.chapter_end))
    for before, after in zip(segments, segments[1:], strict=False):
        if after.chapter_start <= before.chapter_end:
            raise LlmOutputError("segments overlap")
    return segments, None


class CharacterArc(MethodBase):
    def __init__(self, decl: MethodDecl) -> None:
        super().__init__(decl)
        self.prompt_version = load_prompt(PROMPT_NAME).version

    async def _evidence_of(
        self, ctx: RunContext, character_id: str
    ) -> tuple[list[EvidenceView], list[EvidenceView]]:
        events = await ctx.evidence.list("event", subject_id=character_id)
        relations = await ctx.evidence.list("relation_state", subject_id=character_id)
        return events, relations

    async def check(self, ctx: RunContext, item: ScopeItem) -> Precheck:
        events, relations = await self._evidence_of(ctx, item.subject_id)
        count = len(appearance_chapters(events, relations))
        if count >= MIN_CHAPTERS:
            return Precheck.passed()
        return Precheck.unmet(
            [f"角色出現的章數至少 {MIN_CHAPTERS} 章（目前 {count} 章）"],
            "出現的章數由角色參與的事件與涉及他的關係狀態決定；入庫抽到更多他的事件或關係才會成立",
            "角色只在不到 3 章出現時沒有可描述的弧線，補資料也不會改變",
        )

    async def run(self, ctx: RunContext, item: ScopeItem) -> list[EvidenceDraft]:
        character = await ctx.evidence.get(item.subject_id)
        if character is None:
            raise LookupError(f"character {item.subject_id} is not a current character")
        events, relations = await self._evidence_of(ctx, item.subject_id)
        chapters = appearance_chapters(events, relations)
        picked_events = select_events(events)
        picked_relations = select_relations(relations)

        # 關係狀態的另一端：用 character 證據的名字（這個方法有宣告讀 character）
        names: dict[str, str] = {}
        for r in picked_relations:
            other_id = _other_end(r, item.subject_id)
            if other_id not in names:
                other = await ctx.evidence.get(other_id)
                names[other_id] = (
                    str(other.content.get("canonical_name")) if other is not None else other_id[:8]
                )

        e_codes = {e.id: f"E{i}" for i, e in enumerate(picked_events, start=1)}
        r_codes = {r.id: f"R{i}" for i, r in enumerate(picked_relations, start=1)}
        by_code: dict[str, EvidenceView] = {
            **{e_codes[e.id]: e for e in picked_events},
            **{r_codes[r.id]: r for r in picked_relations},
        }

        lang_code = book_language([str(e.content.get("description") or "") for e in picked_events[:5]])
        c = character.content
        character_json = json.dumps(
            {
                "id": "C1",
                "name": c.get("canonical_name"),
                "aliases": c.get("aliases") or [],
                "description": _clip(c.get("description"), EVENT_DESC_CHARS),
                "first_chapter": c.get("first_chapter"),
                "last_chapter": c.get("last_chapter"),
            },
            ensure_ascii=False,
        )
        events_text = "\n".join(
            json.dumps(
                {"id": e_codes[e.id], "chapter": e.content["chapter"], "title": e.content.get("title"),
                 "description": _clip(e.content.get("description"), EVENT_DESC_CHARS)},
                ensure_ascii=False,
            )
            for e in picked_events
        ) or "(none)"
        relations_text = "\n".join(
            json.dumps(
                {
                    "id": r_codes[r.id],
                    "chapter": r.chapter,
                    "other": names[_other_end(r, item.subject_id)],
                    "direction": "outgoing" if r.content.get("source_id") == item.subject_id else "incoming",
                    "relation_type": r.content.get("relation_type"),
                    "polarity": r.content.get("polarity"),
                    "description": _clip(r.content.get("description") or r.summary, RELATION_DESC_CHARS),
                },
                ensure_ascii=False,
            )
            for r in picked_relations
        ) or "(none)"

        system, user = load_prompt(PROMPT_NAME).render(
            language_name=get_language_display_name(lang_code),
            character=character_json,
            events=events_text,
            relation_states=relations_text,
        )
        segments, abstain = await ainvoke_json(
            ctx.llm(), system, user,
            lambda value: parse_segments(value, chapters, set(by_code)),
            label=f"CH2 {c.get('canonical_name')}",
        )

        drafts: list[EvidenceDraft] = []
        for seg in segments:
            codes = list(seg.codes)
            if not codes:  # 模型沒給有效依據：改用這段章節範圍內送出去的證據
                codes = [
                    code for code, view in by_code.items()
                    if seg.chapter_start <= _chapter_of(view) <= seg.chapter_end
                ]
            if not codes:
                continue  # 這段範圍內沒有任何送出去的證據，不產出無依據的段落
            drafts.append(
                EvidenceDraft(
                    claim_type="arc_segment",
                    summary=seg.summary or f"{c.get('canonical_name')}：{seg.phase}",
                    confidence=seg.confidence,
                    content={
                        "character_id": item.subject_id,
                        "chapter_start": seg.chapter_start,
                        "chapter_end": seg.chapter_end,
                        "phase": seg.phase,
                        "description": seg.description,
                    },
                    derived_from=[item.subject_id, *(by_code[code].id for code in codes)],
                    discourse_chapter=seg.chapter_start,
                )
            )
        ctx.summary.update(
            {
                "appearance_chapters": len(chapters),
                "events_total": len(events),
                "events_sent": len(picked_events),
                "relations_total": len(relations),
                "relations_sent": len(picked_relations),
                "segment_count": len(drafts),
                "abstain_reason": abstain,
            }
        )
        return drafts


def _other_end(relation: EvidenceView, character_id: str) -> str:
    source, target = relation.content.get("source_id"), relation.content.get("target_id")
    return target if source == character_id else source


def _chapter_of(view: EvidenceView) -> int:
    if view.claim_type == "event":
        return int(view.content["chapter"])
    return view.chapter or 0
