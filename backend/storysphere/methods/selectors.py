"""Scope selectors and the default `plan` (docs/spec/03 §1、§3、§4).

宣告裡的 `scope_selector` 是字串（例如 `"top_characters(5)"`）；這裡把它解析成純查詢函式，
只讀證據庫、不叫 LLM。各選擇器的語意（規格沒寫清楚的部分在此定義）：

- `top_characters(n)`：`kind=person` 的角色依 `mention_count` 由多到少取前 n（03 §3；動物與群體不列入）。
- `main_motifs(n)`：`frequency ≥ 3` 的意象依 `frequency` 由多到少取前 n（03 §3）。
- `events_with_out_degree(n)`：出度 ≥ n 的事件。出度＝現行 `causal_link` 中以該事件為
  `cause_event_id` 的不重複 `effect_event_id` 數；依 `text_rank` 排序。
- `characters_with_utterances(n)`：現行 `utterance` 數 ≥ n 的角色（以 `speaker_id` 計，不限 `kind`）；
  依話語數由多到少。
- `events_with_tension_signal()`：`tension_signal ≠ none` 的事件，依 `text_rank` 排序。
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from storysphere.methods.base import RunContext, ScopeItem
from storysphere.methods.reader import EvidenceReader

MIN_MOTIF_FREQUENCY = 3


class ScopeError(ValueError):
    """The scope selector or the given subject ids cannot be resolved."""


Selector = Callable[[EvidenceReader, int | None], Awaitable[list[ScopeItem]]]


def _cap(items: list[ScopeItem], n: int | None) -> list[ScopeItem]:
    return items if n is None else items[:n]


async def top_characters(reader: EvidenceReader, n: int | None) -> list[ScopeItem]:
    people = [c for c in await reader.list("character") if c.content["kind"] == "person"]
    people.sort(key=lambda c: (-c.content["mention_count"], c.content["first_chapter"] or 10**9, c.id))
    return _cap([ScopeItem(c.id, label=c.content["canonical_name"]) for c in people], n)


async def main_motifs(reader: EvidenceReader, n: int | None) -> list[ScopeItem]:
    motifs = [
        m for m in await reader.list("imagery_motif")
        if m.content["frequency"] >= MIN_MOTIF_FREQUENCY
    ]
    motifs.sort(key=lambda m: (-m.content["frequency"], m.id))
    return _cap([ScopeItem(m.id, label=m.content["term"]) for m in motifs], n)


async def events_with_out_degree(reader: EvidenceReader, n: int | None) -> list[ScopeItem]:
    effects: dict[str, set[str]] = {}
    for link in await reader.list("causal_link"):
        effects.setdefault(link.content["cause_event_id"], set()).add(link.content["effect_event_id"])
    events = [
        e for e in await reader.list("event") if len(effects.get(e.id, ())) >= (n or 1)
    ]
    events.sort(key=lambda e: (e.content["text_rank"], e.id))
    return [ScopeItem(e.id, label=e.content["title"]) for e in events]


async def characters_with_utterances(reader: EvidenceReader, n: int | None) -> list[ScopeItem]:
    counts: dict[str, int] = {}
    for u in await reader.list("utterance"):
        counts[u.content["speaker_id"]] = counts.get(u.content["speaker_id"], 0) + 1
    characters = {c.id: c for c in await reader.list("character")}
    chosen = [cid for cid, count in counts.items() if cid in characters and count >= (n or 1)]
    chosen.sort(key=lambda cid: (-counts[cid], cid))
    return [ScopeItem(cid, label=characters[cid].content["canonical_name"]) for cid in chosen]


async def events_with_tension_signal(reader: EvidenceReader, n: int | None) -> list[ScopeItem]:
    events = [e for e in await reader.list("event") if e.content["tension_signal"] != "none"]
    events.sort(key=lambda e: (e.content["text_rank"], e.id))
    return [ScopeItem(e.id, label=e.content["title"]) for e in events]


@dataclass(frozen=True)
class _Spec:
    fn: Selector
    subject_kind: str  # character / event / motif
    takes_n: bool


SELECTORS: dict[str, _Spec] = {
    "top_characters": _Spec(top_characters, "character", True),
    "main_motifs": _Spec(main_motifs, "motif", True),
    "events_with_out_degree": _Spec(events_with_out_degree, "event", True),
    "characters_with_utterances": _Spec(characters_with_utterances, "character", True),
    "events_with_tension_signal": _Spec(events_with_tension_signal, "event", False),
}

_SELECTOR_RE = re.compile(r"^\s*([a-z_]+)\(\s*(\d*)\s*\)\s*$")


def parse_selector(text: str) -> tuple[_Spec, int | None]:
    match = _SELECTOR_RE.match(text)
    if match is None or match.group(1) not in SELECTORS:
        raise ScopeError(f"Unknown scope selector: {text!r}")
    spec = SELECTORS[match.group(1)]
    arg = match.group(2)
    if spec.takes_n != bool(arg):
        raise ScopeError(f"Scope selector {text!r} {'needs' if spec.takes_n else 'takes no'} a number")
    n = int(arg) if arg else None
    if n is not None and n < 1:
        raise ScopeError(f"Scope selector {text!r}: n must be at least 1")
    return spec, n


async def run_selector(reader: EvidenceReader, text: str) -> list[ScopeItem]:
    spec, n = parse_selector(text)
    return await spec.fn(reader, n)


# scope → 它的主體是哪一種證據（selector 與 subjectIds 都要對得上）
_SUBJECT_TYPE = {
    "per_character": "character",
    "per_character_chapter": "character",
    "per_event": "event",
    "per_hidden_truth": "hidden_truth",
    "per_trick": "trick",
    "per_motif": "imagery_motif",
}
_SELECTOR_KIND_TYPE = {"character": "character", "event": "event", "motif": "imagery_motif"}


async def _all_of(reader: EvidenceReader, claim_type: str) -> list[ScopeItem]:
    if claim_type == "character":
        return await top_characters(reader, None)
    views = await reader.list(claim_type)
    if claim_type == "event":
        views.sort(key=lambda e: (e.content["text_rank"], e.id))
    return [ScopeItem(v.id, label=v.summary) for v in views]


async def _event_chapters(reader: EvidenceReader) -> list[int]:
    return sorted({e.content["chapter"] for e in await reader.list("event")})


async def default_plan(ctx: RunContext) -> list[ScopeItem]:
    """Plan from the declaration: selector (or all subjects), or the given `subject_ids`."""
    decl, reader = ctx.decl, ctx.evidence
    if decl.scope == "book":
        if ctx.subject_ids is not None:
            raise ScopeError(f"'{decl.id}' is book-scope; it takes no subject ids")
        if decl.scope_selector is None:
            return [ScopeItem()]
        picked = await run_selector(reader, decl.scope_selector)
        return [ScopeItem(focus_ids=tuple(item.subject_id for item in picked if item.subject_id))]

    subject_type = _SUBJECT_TYPE[decl.scope]
    if ctx.subject_ids is not None:
        known = {item.subject_id: item for item in await _all_of(reader, subject_type)}
        unknown = [sid for sid in ctx.subject_ids if sid not in known]
        if unknown:
            raise ScopeError(f"Not a current {subject_type}: {', '.join(unknown)}")
        items = [known[sid] for sid in dict.fromkeys(ctx.subject_ids)]
    elif decl.scope_selector is not None:
        spec, _ = parse_selector(decl.scope_selector)
        if _SELECTOR_KIND_TYPE[spec.subject_kind] != subject_type:
            raise ScopeError(
                f"'{decl.id}': selector {decl.scope_selector!r} does not select {subject_type}"
            )
        items = await run_selector(reader, decl.scope_selector)
    else:
        items = await _all_of(reader, subject_type)

    if decl.scope == "per_character_chapter":
        chapters = await _event_chapters(reader)
        return [
            ScopeItem(item.subject_id, chapter, f"{item.label} ch{chapter}")
            for item in items
            for chapter in chapters
        ]
    return items
