"""S4b 的結果 → 第 1 層證據草稿（02 §6、01 §6.2）。

`reveal`、`clue_points_to`、`trick` 連到 `hidden_truth` 靠內容欄位（`hidden_truth_id`、
`points_to_truth_id`）放那筆證據的 id，不用 `derived_from`（那會讓層級變 2）。真相還沒寫入
所以還沒有 id：草稿的內容先放「佔位 key」（`hidden_truth:T1`），寫入真相之後再換成 evidence id。
去重（`dedupe_drafts`）借 `derived_from` 暫存每筆草稿的 key——合併時它會聯集——去重完
立刻清掉，寫入層看到的 `derived_from` 一定是空的。
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from storysphere.domain.evidence import (
    CluePointsToContent,
    HiddenTruthContent,
    RevealContent,
    TrickContent,
)
from storysphere.ingest.s2.common import EXTRACTION_CONFIDENCE, clean_content, short
from storysphere.ingest.s4.candidates import Candidate
from storysphere.ingest.s4.consolidate import Consolidation, Truth
from storysphere.ingest.s4.report import (
    CLUE_UNLINKED,
    ENUM_DEFAULTED,
    MISDIRECTION_UNDETERMINED,
    TRUTH_UNLINKED,
    S4Report,
)
from storysphere.store.dedupe import dedupe_drafts
from storysphere.store.evidence_writer import (
    EvidenceDraft,
    GenreExtDraft,
    KnownBy,
    QuoteDraft,
    SubjectRef,
)

MAX_TRUTH_QUOTES = 5
# `truth_kind` → 推理的 `mystery_type`；where／when／other 沒有對應，不寫推理擴充。
_MYSTERY_TYPE = {"who": "whodunit", "how": "howdunit", "why": "whydunit"}
_DEFAULT_AUDIENCE = "both"


@dataclass(frozen=True)
class Planned:
    """一筆草稿與它的佔位 key（`<claim_type>:<id>`）。"""

    key: str
    draft: EvidenceDraft

    @property
    def claim_type(self) -> str:
        return self.draft.claim_type


def truth_key(truth_id: str) -> str:
    return f"hidden_truth:{truth_id}"


def _quotes(candidates: Sequence[Candidate]) -> list[QuoteDraft]:
    seen: set[tuple[str, str]] = set()
    quotes: list[QuoteDraft] = []
    for candidate in candidates:
        marker = (candidate.quote.paragraph_id, candidate.quote.text)
        if marker not in seen:
            seen.add(marker)
            quotes.append(candidate.quote)
    return quotes[:MAX_TRUTH_QUOTES]


def _truth_draft(
    truth: Truth, by_id: dict[str, Candidate], *, mystery: bool, report: S4Report
) -> Planned | None:
    members = [by_id[m] for m in truth.members]
    reveals = [by_id[r] for r in truth.reveals]
    audience = truth.concealed_from
    if audience is None:
        report.drop_field(ENUM_DEFAULTED, f"{truth.id}: concealed_from → {_DEFAULT_AUDIENCE}")
        audience = _DEFAULT_AUDIENCE
    content = clean_content(
        HiddenTruthContent,
        {
            "statement": truth.statement,
            "truth_kind": truth.truth_kind or "other",
            "concealed_from": audience,
            "concealer_ids": truth.concealer_ids,
        },
        report,
        truth.id,
    )
    if content is None:
        return None

    # 位置：真相多半不知道發生在哪一章，填揭曉章（01 §6.2）；沒有揭曉就用最早的候選。
    anchor = min(reveals, key=lambda c: c.chapter) if reveals else members[0]
    ext: list[GenreExtDraft] = []
    mystery_type = _MYSTERY_TYPE.get(content["truth_kind"])
    if mystery and mystery_type:
        # case_type／victim_ids 兩份 prompt 都沒有要求，沒有資料來源：寫 other／空清單。
        ext.append(
            GenreExtDraft(
                genre="mystery",
                data={"case_type": "other", "mystery_type": mystery_type, "victim_ids": []},
            )
        )
    draft = EvidenceDraft(
        claim_type="hidden_truth",
        summary=short(truth.statement),
        confidence=EXTRACTION_CONFIDENCE,
        content=content,
        quotes=_quotes([*members, *reveals]),
        subjects=[SubjectRef(subject_id=c, role="concealer") for c in truth.concealer_ids],
        genre_ext=ext,
        discourse_chapter=anchor.chapter,
        discourse_paragraph_id=anchor.quote.paragraph_id,
        # 揭曉前讀者不知道；只瞞角色的真相讀者是知道的。
        known_by=KnownBy(reader=audience == "characters"),
        derived_from=[truth_key(truth.id)],
    )
    return Planned(truth_key(truth.id), draft)


def _reveal_drafts(truth: Truth, by_id: dict[str, Candidate], report: S4Report) -> list[Planned]:
    planned: list[Planned] = []
    for cid in truth.reveals:
        c = by_id[cid]
        audience = c.data["audience"]
        if audience is None:
            audience = _DEFAULT_AUDIENCE
        content = clean_content(
            RevealContent,
            {
                "hidden_truth_id": truth_key(truth.id),
                "revealer_id": c.data["revealer_id"],
                "audience": audience,
                "reveal_method": c.data["reveal_method"] or "other",
            },
            report,
            cid,
        )
        if content is None:
            continue
        key = f"reveal:{cid}"
        planned.append(
            Planned(
                key,
                EvidenceDraft(
                    claim_type="reveal",
                    summary=short(c.summary),
                    confidence=EXTRACTION_CONFIDENCE,
                    content=content,
                    quotes=[c.quote],
                    subjects=[SubjectRef(subject_id=c.data["revealer_id"], role="revealer")],
                    discourse_chapter=c.chapter,
                    discourse_paragraph_id=c.quote.paragraph_id,
                    derived_from=[key],
                ),
            )
        )
    return planned


def _clue_drafts(
    candidates: Sequence[Candidate], state: Consolidation, report: S4Report
) -> list[Planned]:
    planned: list[Planned] = []
    for c in candidates:
        if c.kind != "clue" or c.id in state.dropped:
            continue
        link = state.clues.get(c.id)
        truth_id = link.truth_id if link else None
        if truth_id is None:
            report.drop_field(CLUE_UNLINKED, f"{c.id}: {c.summary[:40]}")
        misdirection = link.is_misdirection if link else None
        if misdirection is None:
            report.drop_field(MISDIRECTION_UNDETERMINED, f"{c.id}: → false")
        content = clean_content(
            CluePointsToContent,
            {
                "clue_summary": c.summary,
                "points_to_ids": c.data["points_to_ids"],
                "points_to_truth_id": truth_key(truth_id) if truth_id else None,
                "reader_visible": c.data["reader_visible"],
                "is_misdirection": bool(misdirection),
                "noticed_by_ids": c.data["noticed_by_ids"],
            },
            report,
            c.id,
        )
        if content is None:
            continue
        key = f"clue:{c.id}"
        planned.append(
            Planned(
                key,
                EvidenceDraft(
                    claim_type="clue_points_to",
                    summary=short(c.summary),
                    confidence=EXTRACTION_CONFIDENCE,
                    content=content,
                    quotes=[c.quote],
                    subjects=[
                        SubjectRef(subject_id=i, role="points_to") for i in c.data["points_to_ids"]
                    ],
                    discourse_chapter=c.chapter,
                    discourse_paragraph_id=c.quote.paragraph_id,
                    derived_from=[key],
                ),
            )
        )
    return planned


def _trick_drafts(
    candidates: Sequence[Candidate], state: Consolidation, report: S4Report
) -> list[Planned]:
    planned: list[Planned] = []
    for c in candidates:
        if c.kind != "trick" or c.id in state.dropped:
            continue
        truth_id = state.tricks.get(c.id)
        if truth_id is None:
            report.drop(TRUTH_UNLINKED, f"{c.id}: trick not linked to a truth")
            continue
        content = clean_content(
            TrickContent,
            {
                "description": c.summary,
                "hidden_truth_id": truth_key(truth_id),
                "trick_category": c.data["trick_category"] or "other",
            },
            report,
            c.id,
        )
        if content is None:
            continue
        key = f"trick:{c.id}"
        planned.append(
            Planned(
                key,
                EvidenceDraft(
                    claim_type="trick",
                    summary=short(c.summary),
                    confidence=EXTRACTION_CONFIDENCE,
                    content=content,
                    quotes=[c.quote],
                    discourse_chapter=c.chapter,
                    discourse_paragraph_id=c.quote.paragraph_id,
                    derived_from=[key],
                ),
            )
        )
    return planned


def build_plan(
    state: Consolidation,
    candidates: Sequence[Candidate],
    report: S4Report,
    *,
    mystery: bool,
) -> list[Planned]:
    """All drafts, truths first. 真相 → 揭曉 → 線索 → 詭計。"""
    by_id = {c.id: c for c in candidates}
    truths = [
        p
        for truth in state.truths.values()
        if (p := _truth_draft(truth, by_id, mystery=mystery, report=report)) is not None
    ]
    live = {p.key for p in truths}
    reveals: list[Planned] = []
    for truth in state.truths.values():
        if truth_key(truth.id) in live:
            reveals += _reveal_drafts(truth, by_id, report)
        else:
            for cid in truth.reveals:
                report.drop(TRUTH_UNLINKED, f"{cid}: its truth was rejected")
    # 沒被任何真相收下的 reveal：S4b 沒歸類，無法連到真相。
    placed = {cid for t in state.truths.values() for cid in t.reveals}
    for c in candidates:
        if c.kind == "reveal" and c.id not in placed and c.id not in state.dropped:
            report.drop("reveal_unlinked", f"{c.id}: {c.summary[:40]}")
    return [
        *truths,
        *reveals,
        *_clue_drafts(candidates, state, report),
        *_trick_drafts(candidates, state, report),
    ]


def dedupe_plan(planned: Sequence[Planned]) -> tuple[list[Planned], dict[str, str]]:
    """去重（01 §7）。回傳存活的草稿（`derived_from` 已清空）與「被併掉的 key → 存活的 key」。

    存活草稿的 key 是它自己（群組裡第一筆）；被併進來的每個 key 都映射到它。
    """
    kept = dedupe_drafts([p.draft for p in planned])
    canonical: dict[str, str] = {}
    result: list[Planned] = []
    for draft in kept:
        key, *merged = draft.derived_from
        for other in merged:
            canonical[other] = key
        result.append(Planned(key, draft.model_copy(update={"derived_from": []})))
    return result, canonical
