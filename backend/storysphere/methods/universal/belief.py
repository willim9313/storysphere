"""CH5 `character.belief`：誰在什麼時候知道什麼（docs/spec/03 §4.1）。

hybrid，一個（角色, 章）一筆 run。
- 已知／未知（純演算法，累積到該章為止，只看章號 ≤ 該章的事件）：
  `visibility = public` → 大家都知道；`private`、`secret` → 只有參與該事件的角色知道，其餘算未知。
  （private 與 secret 在這一步同樣處理；兩者的差別只在於是否觸發錯誤認知的 LLM。）
- 錯誤認知（misbelief）：只有該章有 `visibility = secret` 的事件時才可能叫 LLM；
  進一步要求這個角色到該章為止至少有一個不知道的 secret 事件、而且至少知道一個事件
  （沒有可被誤導的依據或沒有被隱瞞的事就不問）。其餘情形零次 LLM、`misbeliefs` 為空。
  不讀 `reveal`（資訊控制機制的證據，通用方法不能讀）。
- 給模型的內容：角色（短代號 C1＋名字）、知道的事件（最近 `MAX_KNOWN_EVENTS` 個）、
  不知道的 secret 事件（最近 `MAX_UNKNOWN_SECRET_EVENTS` 個），事件一律用短代號；不給原文。
  prompt 的 meta 寫「secret／private」，這裡只給 secret：沒被隱瞞的 private 只是不知道，prompt 明說不列。
- 模型的答案：整體格式不對 → 重試，最終失敗整個 run 失敗（03 §3 的共通規則）；單筆不合格
  （`source_event_id` 不是送出去的 secret 事件、`belief`／`truth` 為空）丟掉，不重試。
  同一個 `source_event_id` 同一句 `belief` 只留一筆。
- 草稿：`known_event_ids`、`unknown_event_ids` 是完整清單（依章、text_rank 排序），`derived_from`＝角色本身
  ＋到該章為止的所有事件（演算法判定它們的已知／未知，全都用到了）。
"""

from __future__ import annotations

import json
from typing import Any

from storysphere.ingest.language_detection import get_language_display_name
from storysphere.llm.prompts import load_prompt
from storysphere.methods.base import MethodBase, RunContext, ScopeItem
from storysphere.methods.reader import EvidenceView
from storysphere.methods.universal._llm import ainvoke_json, book_language, clamp_unit, items_of
from storysphere.registry.models import MethodDecl
from storysphere.store.evidence_writer import EvidenceDraft

PROMPT_NAME = "methods/CH5"
MAX_KNOWN_EVENTS = 40
MAX_UNKNOWN_SECRET_EVENTS = 20
DESC_CHARS = 300
CONFIDENCE = 0.8
DEFAULT_MISBELIEF_CONFIDENCE = 0.5

_TEXT = {
    "zh": "{name} 到第 {chapter} 章為止知道 {known} 個事件、不知道 {unknown} 個",
    "en": "{name} up to chapter {chapter}: knows {known} events, not {unknown}",
}


def classify_events(
    events: list[EvidenceView], character_id: str, up_to_chapter: int
) -> tuple[list[EvidenceView], list[EvidenceView]]:
    """(知道的, 不知道的)；事件只取章號 ≤ `up_to_chapter` 的，各自依 (章, text_rank, id) 排序。"""
    ordered = sorted(
        (e for e in events if int(e.content["chapter"]) <= up_to_chapter),
        key=lambda e: (int(e.content["chapter"]), int(e.content["text_rank"]), e.id),
    )
    known, unknown = [], []
    for event in ordered:
        public = event.content.get("visibility") == "public"
        if public or character_id in event.subject_ids("participant"):
            known.append(event)
        else:
            unknown.append(event)
    return known, unknown


def needs_misbelief_call(
    events: list[EvidenceView], known: list[EvidenceView], unknown: list[EvidenceView], chapter: int
) -> bool:
    chapter_has_secret = any(
        e.content.get("visibility") == "secret" and int(e.content["chapter"]) == chapter
        for e in events
    )
    unknown_secret = any(e.content.get("visibility") == "secret" for e in unknown)
    return chapter_has_secret and unknown_secret and bool(known)


def parse_misbeliefs(value: Any, secret_codes: set[str]) -> tuple[list[dict[str, Any]], int]:
    """(合格的錯誤認知, 丟掉幾筆)；整體格式不對丟 `LlmOutputError`（→ 重試）。"""
    kept: list[dict[str, Any]] = []
    dropped = 0
    seen: set[tuple[str, str]] = set()
    for item in items_of(value):
        if not isinstance(item, dict):
            dropped += 1
            continue
        belief = str(item.get("belief") or "").strip()
        truth = str(item.get("truth") or "").strip()
        source = item.get("source_event_id")
        if not belief or not truth or source not in secret_codes or (source, belief) in seen:
            dropped += 1
            continue
        seen.add((source, belief))
        conf = clamp_unit(item.get("confidence"))
        kept.append(
            {"belief": belief, "truth": truth, "source": source,
             "confidence": DEFAULT_MISBELIEF_CONFIDENCE if conf is None else conf}
        )
    return kept, dropped


def _brief(code: str, event: EvidenceView) -> str:
    c = event.content
    desc = str(c.get("description") or "").strip()
    return json.dumps(
        {"id": code, "chapter": c.get("chapter"), "title": c.get("title"),
         "description": desc if len(desc) <= DESC_CHARS else desc[:DESC_CHARS] + "…"},
        ensure_ascii=False,
    )


class CharacterBelief(MethodBase):
    def __init__(self, decl: MethodDecl) -> None:
        super().__init__(decl)
        self.prompt_version = load_prompt(PROMPT_NAME).version

    async def run(self, ctx: RunContext, item: ScopeItem) -> list[EvidenceDraft]:
        character = await ctx.evidence.get(item.subject_id)
        if character is None:
            raise LookupError(f"character {item.subject_id} is not a current character")
        name = str(character.content.get("canonical_name"))
        events = await ctx.evidence.list("event")
        known, unknown = classify_events(events, item.subject_id, item.chapter)

        misbeliefs: list[dict[str, Any]] = []
        called = needs_misbelief_call(events, known, unknown, item.chapter)
        dropped = 0
        if called:
            shown_known = known[-MAX_KNOWN_EVENTS:]
            shown_secret = [e for e in unknown if e.content.get("visibility") == "secret"][
                -MAX_UNKNOWN_SECRET_EVENTS:
            ]
            codes = {e.id: f"E{i}" for i, e in enumerate([*shown_known, *shown_secret], start=1)}
            by_code = {code: e for e, code in ((e, codes[e.id]) for e in [*shown_known, *shown_secret])}
            lang_code = book_language([str(e.content.get("description") or "") for e in shown_known[:5]])
            system, user = load_prompt(PROMPT_NAME).render(
                language_name=get_language_display_name(lang_code),
                character=json.dumps({"id": "C1", "name": name}, ensure_ascii=False),
                up_to_chapter=str(item.chapter),
                known_events="\n".join(_brief(codes[e.id], e) for e in shown_known) or "(none)",
                unknown_secret_events="\n".join(_brief(codes[e.id], e) for e in shown_secret),
            )
            secret_codes = {codes[e.id] for e in shown_secret}
            answers, dropped = await ainvoke_json(
                ctx.llm(), system, user, lambda value: parse_misbeliefs(value, secret_codes),
                label=f"CH5 {name} ch{item.chapter}",
            )
            misbeliefs = [
                {"belief": a["belief"], "truth": a["truth"], "source_event_id": by_code[a["source"]].id,
                 "confidence": a["confidence"]}
                for a in answers
            ]
        else:
            lang_code = book_language([str(e.content.get("description") or "") for e in events[:5]])

        lang = _TEXT["zh" if lang_code.lower().startswith("zh") else "en"]
        ctx.summary.update(
            {
                "known_count": len(known),
                "unknown_count": len(unknown),
                "llm_called": called,
                "misbelief_count": len(misbeliefs),
                "misbelief_dropped": dropped,
            }
        )
        return [
            EvidenceDraft(
                claim_type="belief_state",
                summary=lang.format(name=name, chapter=item.chapter, known=len(known), unknown=len(unknown)),
                confidence=CONFIDENCE,
                content={
                    "character_id": item.subject_id,
                    "up_to_chapter": item.chapter,
                    "known_event_ids": [e.id for e in known],
                    "unknown_event_ids": [e.id for e in unknown],
                    "misbeliefs": misbeliefs,
                },
                derived_from=[item.subject_id, *(e.id for e in [*known, *unknown])],
                discourse_chapter=item.chapter,
            )
        ]
