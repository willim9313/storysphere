"""MY4 `info.fair_play_audit`：真相揭曉之前，讀者拿得到足夠的線索嗎？（docs/spec/03 §4.2）

hybrid，一個 hidden_truth 一筆 run。
- 前提（`check`）：真相沒有任何 current 的 `reveal` → 不適用（03「不產出的條件」）；
  `concealed_from=characters`（只瞞角色、讀者本來就知道）→ 不適用（原型決定 2026-11-17，03 §4.2）。
  兩者都零次 LLM。
- 演算法：
  - 揭曉：`reveal.hidden_truth_id` 指向這個真相的。
  - `reveal_chapter`：`audience` 是 reader／both 的揭曉中**最後**的章（完整解答的那一章）；沒有就取全部揭曉中
    最後的章。S4 的真相常把好幾件事併成一筆、揭曉分散在好幾章，取最早的會只拿頭幾章的線索去判
    （T18 實跑 E1 因此被判 unfair；使用者 2026-11-17 決定改取最後一次，03 §4.2）。
    章號用證據的 `discourse_chapter`；全都沒有章號時是 None（此時所有線索都算「揭曉前」）。
  - 線索：`points_to_truth_id` 指向這個真相的。章號 < `reveal_chapter` 的是揭曉前，其餘是揭曉當章及之後。
  - `reader_visible_count`、`misdirection_count` 只算揭曉前的線索。
- LLM（`method_strong`，一次）：只給 `verdict`、`violations`、`gap_description`、`summary`、`confidence`；
  數字由程式填。真相、揭曉、線索一律用短代號（T1、R1…、K1…），不給 uuid。
  - `verdict` 不在三個值裡、`items` 超過一筆 → 格式錯，重試（03 §3 共通規則）。
  - 不在送出去的規則清單裡的 violation 丟掉，不重試；同一條只留一次。
  - 模型棄答（`items` 空）→ 不產出，`summary.abstain_reason` 記原因。
- `derived_from`：真相、它的揭曉、送出去的所有線索（演算法都用到了）。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import yaml

from storysphere.ingest.language_detection import get_language_display_name
from storysphere.llm.prompts import load_prompt
from storysphere.llm.settings import REPO_ROOT
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

PROMPT_NAME = "methods/MY4"
VERDICTS = ("fair", "partially_fair", "unfair")
READER_AUDIENCES = ("reader", "both")
DEFAULT_CONFIDENCE = 0.6
SUMMARY_CHARS = 300

_NO_REVEAL = {
    "missing": ("reveal",),
    "how_to_fix": "這個真相在書裡沒有被揭曉；若其實有揭曉，重跑入庫的 S4 讓它補上。",
    "useless": "真相從未揭曉時，「揭曉之前讀者拿得到多少線索」這個問題不成立。",
}
_READER_KNOWS = {
    "missing": ("hidden_truth.concealed_from=reader|both",),
    "how_to_fix": "",
    "useless": "讀者本來就知道這件事（只瞞住書中角色），公平性稽核不適用。",
}


def load_rules(config_paths: list[str]) -> list[dict[str, Any]]:
    """`fairness_relevant: true`、沒有 `excluded` 的規則：`{rule_set, rule_no, summary}`。"""
    rules: list[dict[str, Any]] = []
    for rel in config_paths:
        data = yaml.safe_load((REPO_ROOT / rel).read_text(encoding="utf-8"))
        for rule in data["rules"]:
            if rule.get("fairness_relevant") and not rule.get("excluded"):
                rules.append(
                    {"rule_set": data["rule_set"], "rule_no": int(rule["rule_no"]), "summary": rule["summary"]}
                )
    return rules


@dataclass(frozen=True)
class Split:
    reveal_chapter: int | None
    before: list[EvidenceView]
    after: list[EvidenceView]


def split_clues(reveals: list[EvidenceView], clues: list[EvidenceView]) -> Split:
    """揭曉章（讀者看得到的最後一章，沒有就全部揭曉中最後的）與揭曉前／後的線索（依章、id 排序）。"""
    def last(views: list[EvidenceView]) -> int | None:
        chapters = [v.chapter for v in views if v.chapter is not None]
        return max(chapters) if chapters else None

    to_reader = [r for r in reveals if r.content.get("audience") in READER_AUDIENCES]
    chapter = last(to_reader) if last(to_reader) is not None else last(reveals)
    ordered = sorted(clues, key=lambda c: (c.chapter if c.chapter is not None else 10**6, c.id))
    if chapter is None:
        return Split(None, ordered, [])
    before = [c for c in ordered if c.chapter is not None and c.chapter < chapter]
    after = [c for c in ordered if c not in before]
    return Split(chapter, before, after)


def parse_audit(value: Any, rule_keys: set[tuple[str, int]]) -> tuple[dict[str, Any] | None, int, str | None]:
    """(答案或 None＝棄答, 丟掉幾條 violation, 棄答原因)；格式錯丟 `LlmOutputError`（→ 重試）。"""
    items = items_of(value)
    if not items:
        reason = value.get("abstain_reason") if isinstance(value, dict) else None
        return None, 0, str(reason).strip() if reason else None
    if len(items) > 1:
        raise LlmOutputError(f"{len(items)} items for one hidden truth, expected 1")
    item = items[0]
    if not isinstance(item, dict) or item.get("verdict") not in VERDICTS:
        raise LlmOutputError("item has no valid 'verdict'")
    violations: list[dict[str, Any]] = []
    dropped = 0
    seen: set[tuple[str, int]] = set()
    raw = item.get("violations") or []
    if not isinstance(raw, list):
        raise LlmOutputError("'violations' is not a list")
    for v in raw:
        rule_no = v.get("rule_no") if isinstance(v, dict) else None
        key = (v.get("rule_set"), rule_no) if isinstance(v, dict) else None
        explanation = str(v.get("explanation") or "").strip() if isinstance(v, dict) else ""
        if key is None or isinstance(rule_no, bool) or key not in rule_keys or not explanation or key in seen:
            dropped += 1
            continue
        seen.add(key)
        violations.append({"rule_set": key[0], "rule_no": key[1], "explanation": explanation})
    conf = clamp_unit(item.get("confidence"))
    return (
        {
            "verdict": item["verdict"],
            "violations": violations,
            "gap_description": str(item.get("gap_description") or "").strip(),
            "summary": str(item.get("summary") or "").strip(),
            "confidence": DEFAULT_CONFIDENCE if conf is None else conf,
        },
        dropped,
        None,
    )


def _clue_brief(code: str, clue: EvidenceView) -> str:
    c = clue.content
    return json.dumps(
        {"id": code, "chapter": clue.chapter, "clue_summary": c.get("clue_summary"),
         "reader_visible": c.get("reader_visible"), "is_misdirection": c.get("is_misdirection")},
        ensure_ascii=False,
    )


def _reveal_brief(code: str, reveal: EvidenceView) -> str:
    c = reveal.content
    summary = reveal.summary if len(reveal.summary) <= SUMMARY_CHARS else reveal.summary[:SUMMARY_CHARS] + "…"
    return json.dumps(
        {"id": code, "chapter": reveal.chapter, "audience": c.get("audience"),
         "reveal_method": c.get("reveal_method"), "summary": summary},
        ensure_ascii=False,
    )


class FairPlayAudit(MethodBase):
    def __init__(self, decl: MethodDecl) -> None:
        super().__init__(decl)
        self.prompt_version = load_prompt(PROMPT_NAME).version
        self.rules = load_rules(decl.impl.config)

    async def _reveals(self, ctx: RunContext, truth_id: str) -> list[EvidenceView]:
        return [r for r in await ctx.evidence.list("reveal") if r.content.get("hidden_truth_id") == truth_id]

    async def check(self, ctx: RunContext, item: ScopeItem) -> Precheck:
        truth = await ctx.evidence.get(item.subject_id)
        if truth is not None and truth.content.get("concealed_from") == "characters":
            reason = _READER_KNOWS
        elif not await self._reveals(ctx, item.subject_id):
            reason = _NO_REVEAL
        else:
            return Precheck.passed()
        return Precheck.unmet(reason["missing"], reason["how_to_fix"], reason["useless"])

    async def run(self, ctx: RunContext, item: ScopeItem) -> list[EvidenceDraft]:
        truth = await ctx.evidence.get(item.subject_id)
        if truth is None:
            raise LookupError(f"hidden_truth {item.subject_id} is not current")
        reveals = sorted(await self._reveals(ctx, truth.id), key=lambda r: (r.chapter or 0, r.id))
        clues = [c for c in await ctx.evidence.list("clue_points_to") if c.content.get("points_to_truth_id") == truth.id]
        split = split_clues(reveals, clues)
        visible = sum(1 for c in split.before if c.content.get("reader_visible"))
        misdirection = sum(1 for c in split.before if c.content.get("is_misdirection"))

        clue_codes = {c.id: f"K{i}" for i, c in enumerate([*split.before, *split.after], start=1)}
        statement = str(truth.content.get("statement") or truth.summary)
        # 一個真相的文字常常太短、偵測不出語言：把線索與揭曉的摘要都算進去。
        lang_code = book_language(
            [statement, *(str(c.content.get("clue_summary") or "") for c in clues), *(r.summary for r in reveals)]
        )
        system, user = load_prompt(PROMPT_NAME).render(
            language_name=get_language_display_name(lang_code),
            hidden_truth=json.dumps(
                {"id": "T1", "statement": statement, "truth_kind": truth.content.get("truth_kind")},
                ensure_ascii=False,
            ),
            reveals="\n".join(_reveal_brief(f"R{i}", r) for i, r in enumerate(reveals, start=1)),
            clues_before="\n".join(_clue_brief(clue_codes[c.id], c) for c in split.before) or "(none)",
            clues_after="\n".join(_clue_brief(clue_codes[c.id], c) for c in split.after) or "(none)",
            counts=json.dumps(
                {"reveal_chapter": split.reveal_chapter, "clues_before_reveal": len(split.before),
                 "reader_visible_before_reveal": visible, "misdirection_before_reveal": misdirection},
                ensure_ascii=False,
            ),
            rules="\n".join(json.dumps(r, ensure_ascii=False) for r in self.rules),
        )
        rule_keys = {(r["rule_set"], r["rule_no"]) for r in self.rules}
        answer, dropped, abstain = await ainvoke_json(
            ctx.llm(), system, user, lambda value: parse_audit(value, rule_keys), label=f"MY4 {truth.id[:8]}"
        )
        ctx.summary.update(
            {
                "reveal_chapter": split.reveal_chapter,
                "clues_before_reveal": len(split.before),
                "clues_after_reveal": len(split.after),
                "violations_dropped": dropped,
                "verdict": answer["verdict"] if answer else None,
                "abstain_reason": abstain,
            }
        )
        if answer is None:
            return []
        return [
            EvidenceDraft(
                claim_type="fairness_gap",
                summary=answer["summary"] or answer["gap_description"] or answer["verdict"],
                confidence=answer["confidence"],
                content={
                    "hidden_truth_id": truth.id,
                    "verdict": answer["verdict"],
                    "reveal_chapter": split.reveal_chapter,
                    "clue_ids_before_reveal": [c.id for c in split.before],
                    "reader_visible_count": visible,
                    "misdirection_count": misdirection,
                    "violations": answer["violations"],
                    "gap_description": answer["gap_description"],
                },
                derived_from=[truth.id, *(r.id for r in reveals), *(c.id for c in [*split.before, *split.after])],
                discourse_chapter=split.reveal_chapter,
            )
        ]
