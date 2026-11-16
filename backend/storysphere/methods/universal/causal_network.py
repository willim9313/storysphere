"""EV2 `event.causal_network`：事件之間的直接因果（docs/spec/03 §4.1）。

- 事件依 `text_rank` 排序，每 `WINDOW_SIZE` 個一窗、重疊 `WINDOW_OVERLAP`；每窗一次 LLM 呼叫。
- LLM 只看事件的描述與引文（上游事件證據的 `evidence_quote`），不看全文；事件用短代號 E1、E2…，
  不讓模型抄 UUID。代號依 `text_rank` 全書統一，跨窗同一事件代號相同。
- 因果方向：prompt 明說「因可以在文本中晚於果（倒敘）」，所以不依 `text_rank` 判方向，
  只丟「因與果是同一事件或 `text_rank` 相同」的連結。
- 跨窗重複的同一對（因→果）只留一條：信心高者，同分取強度高者，再同分取先出現的。
- 任何一窗在重試後仍失敗，整個 run 失敗（不產出缺一窗的半套結果）。
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from storysphere.llm.prompts import load_prompt
from storysphere.methods.base import MethodBase, Precheck, RunContext, ScopeItem
from storysphere.methods.reader import EvidenceView
from storysphere.methods.universal._llm import (
    LLM_CONCURRENCY,
    ainvoke_json,
    clamp_unit,
    gather_limited,
    items_of,
    language_display_name,
)
from storysphere.registry.models import MethodDecl
from storysphere.store.evidence_writer import EvidenceDraft

logger = logging.getLogger(__name__)

PROMPT_NAME = "methods/EV2"
MIN_EVENTS = 5
WINDOW_SIZE = 30
WINDOW_OVERLAP = 10
QUOTE_MAX_CHARS = 300  # 每個事件最多給 LLM 這麼長的引文
LANGUAGE_SAMPLE_EVENTS = 5
LINK_TYPES = ("physical", "motivational", "psychological", "enablement")
DEFAULT_CONFIDENCE = 0.5  # 模型沒給可用的 confidence 時


@dataclass(frozen=True)
class _Event:
    code: str
    view: EvidenceView

    @property
    def text_rank(self) -> int:
        return int(self.view.content.get("text_rank") or 0)


def window_bounds(total: int) -> list[tuple[int, int]]:
    """[start, end) of each window: 30 per window, each starting 20 after the previous."""
    step = WINDOW_SIZE - WINDOW_OVERLAP
    bounds: list[tuple[int, int]] = []
    start = 0
    while total > 0:
        end = min(start + WINDOW_SIZE, total)
        bounds.append((start, end))
        if end >= total:
            break
        start += step
    return bounds


def _event_line(event: _Event) -> str:
    content = event.view.content
    quote = event.view.quotes[0].text[:QUOTE_MAX_CHARS] if event.view.quotes else ""
    row = {
        "id": event.code,
        "chapter": content.get("chapter"),
        "text_rank": event.text_rank,
        "title": content.get("title"),
        "description": content.get("description"),
        "narrative_mode": content.get("narrative_mode"),
        "story_time_hint": content.get("story_time_hint"),
        "consequences": content.get("consequences") or [],
        "quote": quote,
    }
    return json.dumps(row, ensure_ascii=False)


@dataclass(frozen=True)
class _Link:
    cause: str  # 事件代號
    effect: str
    link_type: str
    strength: float
    rationale: str
    summary: str
    confidence: float


def parse_window(value: Any, codes: set[str], rank_of: dict[str, int]) -> list[_Link]:
    """Usable links of one window's answer. Bad items are dropped; a bad envelope raises."""
    links: list[_Link] = []
    for item in items_of(value):
        if not isinstance(item, dict):
            continue
        cause, effect = item.get("cause_event_id"), item.get("effect_event_id")
        if cause not in codes or effect not in codes:  # 未知代號（含非字串）
            continue
        if cause == effect or rank_of[cause] == rank_of[effect]:
            continue
        link_type = item.get("link_type")
        strength = clamp_unit(item.get("strength"))
        if link_type not in LINK_TYPES or strength is None:
            continue
        confidence = clamp_unit(item.get("confidence"))
        rationale = item.get("rationale")
        summary = item.get("summary")
        rationale = rationale.strip() if isinstance(rationale, str) else ""
        summary = summary.strip() if isinstance(summary, str) else ""
        links.append(
            _Link(
                cause,
                effect,
                link_type,
                strength,
                rationale,
                summary or rationale or f"{cause} -> {effect}",
                DEFAULT_CONFIDENCE if confidence is None else confidence,
            )
        )
    return links


def merge_links(links: list[_Link]) -> list[_Link]:
    """同一對（因→果）只留一條：信心高、再強度高、再先出現者。保留首次出現的順序。"""
    best: dict[tuple[str, str], _Link] = {}
    for link in links:
        key = (link.cause, link.effect)
        old = best.get(key)
        if old is None or (link.confidence, link.strength) > (old.confidence, old.strength):
            best[key] = link
    return list(best.values())


class CausalNetwork(MethodBase):
    def __init__(self, decl: MethodDecl) -> None:
        super().__init__(decl)
        self.prompt_version = load_prompt(PROMPT_NAME).version

    async def check(self, ctx: RunContext, item: ScopeItem) -> Precheck:
        count = await ctx.evidence.count("event")
        if count >= MIN_EVENTS:
            return Precheck.passed()
        return Precheck.unmet(
            [f"event（至少 {MIN_EVENTS} 個，現有 {count} 個）"],
            "重新執行入庫，讓更多事件被抽取出來",
            f"全書的事件少於 {MIN_EVENTS} 個時，事件之間沒有足夠的因果可分析，補了也沒用",
        )

    async def run(self, ctx: RunContext, item: ScopeItem) -> list[EvidenceDraft]:
        views = await ctx.evidence.list("event")
        views.sort(key=lambda v: (int(v.content.get("text_rank") or 0), v.id))
        events = [_Event(f"E{i}", v) for i, v in enumerate(views, start=1)]
        by_code = {e.code: e for e in events}
        rank_of = {e.code: e.text_rank for e in events}

        prompt = load_prompt(PROMPT_NAME)
        language = language_display_name(
            [str(e.view.content.get("description") or "") for e in events[:LANGUAGE_SAMPLE_EVENTS]]
        )
        llm = ctx.llm()
        bounds = window_bounds(len(events))

        def window_call(index: int, start: int, end: int) -> Callable[[], Awaitable[list[_Link]]]:
            window = events[start:end]
            system, user = prompt.render(
                language_name=language, events="\n".join(_event_line(e) for e in window)
            )
            window_codes = {e.code for e in window}

            def parse(value: Any) -> list[_Link]:
                # 只收這一窗給過的代號；窗外的代號等於模型自己編的
                return parse_window(value, window_codes, rank_of)

            return lambda: ainvoke_json(llm, system, user, parse, label=f"EV2 window {index}")

        calls = [window_call(i, start, end) for i, (start, end) in enumerate(bounds, start=1)]
        # 結果依窗的順序排列（不是完成的先後），去重「同分取先出現」才與依序執行一致
        per_window = await gather_limited(calls, LLM_CONCURRENCY)
        collected: list[_Link] = [link for links in per_window for link in links]

        merged = merge_links(collected)
        merged.sort(key=lambda link: (rank_of[link.cause], rank_of[link.effect]))
        ctx.summary.update(
            {
                "event_count": len(events),
                "window_count": len(bounds),
                "link_count": len(merged),
                "duplicate_links_merged": len(collected) - len(merged),
            }
        )
        drafts: list[EvidenceDraft] = []
        for link in merged:
            cause, effect = by_code[link.cause].view.id, by_code[link.effect].view.id
            drafts.append(
                EvidenceDraft(
                    claim_type="causal_link",
                    summary=link.summary,
                    confidence=link.confidence,
                    content={
                        "cause_event_id": cause,
                        "effect_event_id": effect,
                        "link_type": link.link_type,
                        "strength": link.strength,
                        "rationale": link.rationale,
                    },
                    derived_from=[cause, effect],
                )
            )
        return drafts
