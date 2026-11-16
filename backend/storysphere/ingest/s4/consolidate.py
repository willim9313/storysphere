"""S4b 書層級整併（02 §6）：不給全文，只給候選的摘要、章節、引文與角色清單。

- 候選用 `cand_n` 當 id，LLM 用 id 回指；回應當成沒驗證過的資料處理。
- 超過 `BATCH_SIZE` 筆時分批。consolidate prompt 沒講分批怎麼銜接，這裡的做法：前面批次
  已合併出的真相，以「已合併的 hidden_truth 候選」（id 為 `prior_<真相 id>`）放在後面每一批
  候選的最前面；LLM 把新的 reveal／線索／詭計歸到它們，或把相同的問題併進去，程式再把
  `prior_` id 換回原本的真相。限制：較早批次的線索看不到之後才出現的真相。
- 失敗處理同 S3：解析／驗證失敗最多 3 次；429 → `QuotaPaused`；blocked／未設定不重試。
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from storysphere.ingest.language_detection import get_language_display_name
from storysphere.ingest.s2.parse import clean_str, str_list
from storysphere.ingest.s4.candidates import Candidate, candidate_line, normalize_audience
from storysphere.ingest.s4.plan import CharacterIndex
from storysphere.ingest.s4.report import (
    CONSOLIDATION_DROPPED,
    ORPHAN_TRUTH,
    TRUTH_EMPTY,
    S4Report,
)
from storysphere.ingest.unit_runner import MAX_ATTEMPTS, QuotaPaused
from storysphere.llm.errors import classify_step_failure, describe_exception, llm_text
from storysphere.llm.json_output import extract_json_from_text
from storysphere.llm.prompts import Prompt

logger = logging.getLogger(__name__)

BATCH_SIZE = 150
PRIOR_PREFIX = "prior_"


@dataclass
class Truth:
    """一個合併後的真相；`members`／`reveals` 是候選 id。"""

    id: str
    statement: str
    truth_kind: str | None
    concealed_from: str | None
    concealer_ids: list[str]
    members: list[str]
    reveals: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ClueLink:
    truth_id: str | None
    is_misdirection: bool | None


@dataclass
class Consolidation:
    truths: dict[str, Truth] = field(default_factory=dict)
    clues: dict[str, ClueLink] = field(default_factory=dict)
    tricks: dict[str, str] = field(default_factory=dict)
    dropped: set[str] = field(default_factory=set)
    counter: int = 0

    def new_truth_id(self) -> str:
        self.counter += 1
        return f"T{self.counter}"


# ── 解析 ────────────────────────────────────────────────────────────────────


@dataclass
class BatchTruth:
    batch_id: str
    statement: str
    truth_kind: str | None
    concealed_from: str | None
    concealer_ids: list[str] | None
    merged: list[str]
    reveals: list[str]


@dataclass
class BatchResult:
    truths: list[BatchTruth] = field(default_factory=list)
    # (candidate_id, truth_id | None, is_misdirection | None)
    clues: list[tuple[str, str | None, bool | None]] = field(default_factory=list)
    tricks: list[tuple[str, str | None]] = field(default_factory=list)
    dropped: list[str] = field(default_factory=list)


def _list_of_dicts(
    data: dict[str, Any], key: str, report: S4Report, *, required: bool
) -> list[dict]:
    value = data.get(key)
    if value is None:
        if required:
            raise ValueError(f"consolidation: response is missing '{key}'")
        report.warn(f"consolidation: response has no '{key}'")
        return []
    if not isinstance(value, list):
        if required:
            raise ValueError(f"consolidation: '{key}' must be a list")
        report.warn(f"consolidation: '{key}' is not a list")
        return []
    return [item for item in value if isinstance(item, dict)]


def parse_consolidation(
    text: str, characters: CharacterIndex, report: S4Report, *, mystery: bool
) -> BatchResult:
    """LLM 回應 → `BatchResult`；整體不是 JSON 物件或沒有 `truths` 丟 `ValueError`。

    單筆髒資料（缺欄位、型別不對）只丟該筆並記警告。id 是否真的存在由 `merge_batch` 檢查。
    """
    data, error = extract_json_from_text(text)
    if data is None:
        raise ValueError(f"consolidation: no parsable JSON ({error}); starts: {text[:200]!r}")
    if not isinstance(data, dict):
        raise ValueError(f"consolidation: expected a JSON object, got {type(data).__name__}")

    result = BatchResult()
    seen_truth_ids: set[str] = set()
    for item in _list_of_dicts(data, "truths", report, required=True):
        truth_id = clean_str(item.get("truth_id"))
        statement = clean_str(item.get("statement"))
        if truth_id is None or statement is None or truth_id in seen_truth_ids:
            report.warn(
                f"consolidation: truth without usable truth_id/statement dropped: {item!r:.120}"
            )
            continue
        seen_truth_ids.add(truth_id)
        concealers = item.get("concealer_ids")
        result.truths.append(
            BatchTruth(
                batch_id=truth_id,
                statement=statement,
                truth_kind=clean_str(item.get("truth_kind")),
                concealed_from=normalize_audience(item.get("concealed_from")),
                concealer_ids=(
                    [c for s in str_list(concealers) if (c := characters.resolve(s))]
                    if concealers is not None
                    else None
                ),
                merged=str_list(item.get("merged_candidate_ids")),
                reveals=str_list(item.get("reveal_candidate_ids")),
            )
        )
    if mystery:
        for item in _list_of_dicts(data, "clues", report, required=False):
            cid = clean_str(item.get("candidate_id"))
            if cid is None:
                continue
            mis = item.get("is_misdirection")
            result.clues.append(
                (cid, clean_str(item.get("truth_id")), mis if isinstance(mis, bool) else None)
            )
        for item in _list_of_dicts(data, "tricks", report, required=False):
            cid = clean_str(item.get("candidate_id"))
            if cid is not None:
                result.tricks.append((cid, clean_str(item.get("truth_id"))))
    result.dropped = str_list(data.get("dropped"))
    return result


# ── 合併進整體狀態 ───────────────────────────────────────────────────────────


def _prior_candidate_line(truth: Truth, chapter: int) -> str:
    """前面批次已合併的真相，偽裝成一筆 hidden_truth 候選。"""
    row: dict[str, Any] = {
        "id": f"{PRIOR_PREFIX}{truth.id}",
        "type": "hidden_truth",
        "chapter": chapter,
        "summary": truth.statement,
        "already_merged_from": len(truth.members),
    }
    if truth.truth_kind:
        row["truth_kind"] = truth.truth_kind
    if truth.concealed_from:
        row["concealed_from"] = truth.concealed_from
    if truth.concealer_ids:
        row["concealer_ids"] = truth.concealer_ids
    return json.dumps(row, ensure_ascii=False)


def merge_batch(
    state: Consolidation,
    result: BatchResult,
    batch: Sequence[Candidate],
    by_id: dict[str, Candidate],
    report: S4Report,
) -> None:
    """Fold one batch's response into ``state``。不認得的 id、類型不對的 id 一律略過。"""
    in_batch = {c.id: c for c in batch}
    priors = {f"{PRIOR_PREFIX}{t.id}": t for t in state.truths.values()}  # 這一批開始前的真相
    placed: set[str] = set()
    to_final: dict[str, str] = {pseudo: truth.id for pseudo, truth in priors.items()}

    for bt in result.truths:
        members: list[str] = []
        reveals: list[str] = []
        absorbed: list[Truth] = []
        for cid in bt.merged:
            if cid in priors:
                if priors[cid].id in state.truths and priors[cid] not in absorbed:
                    absorbed.append(priors[cid])
            elif cid in in_batch and in_batch[cid].kind == "hidden_truth" and cid not in placed:
                members.append(cid)
        for cid in bt.reveals:
            if cid in in_batch and in_batch[cid].kind == "reveal" and cid not in placed:
                reveals.append(cid)
        if not members and not reveals and not absorbed:
            report.drop(TRUTH_EMPTY, f"truth '{bt.statement[:40]}' has no valid candidate")
            continue
        placed.update(members, reveals)

        first = by_id[members[0]] if members else None
        if absorbed:
            base = absorbed[0]
            for other in absorbed[1:]:
                base.members += other.members
                base.reveals += other.reveals
                for cand_id, link in list(state.clues.items()):
                    if link.truth_id == other.id:
                        state.clues[cand_id] = ClueLink(base.id, link.is_misdirection)
                for cand_id, truth_id in list(state.tricks.items()):
                    if truth_id == other.id:
                        state.tricks[cand_id] = base.id
                del state.truths[other.id]
                to_final[f"{PRIOR_PREFIX}{other.id}"] = base.id
            base.members += members
            base.reveals += reveals
            base.statement = bt.statement
            base.truth_kind = bt.truth_kind or base.truth_kind
            base.concealed_from = bt.concealed_from or base.concealed_from
            if bt.concealer_ids is not None:
                base.concealer_ids = bt.concealer_ids
            to_final[f"{PRIOR_PREFIX}{base.id}"] = base.id
            final = base
        else:
            final = Truth(
                id=state.new_truth_id(),
                statement=bt.statement,
                truth_kind=bt.truth_kind or (first.data.get("truth_kind") if first else None),
                concealed_from=bt.concealed_from
                or (first.data.get("concealed_from") if first else None),
                concealer_ids=(
                    bt.concealer_ids
                    if bt.concealer_ids is not None
                    else list(
                        dict.fromkeys(i for m in members for i in by_id[m].data["concealer_ids"])
                    )
                ),
                members=members,
                reveals=reveals,
            )
            state.truths[final.id] = final
        to_final[bt.batch_id] = final.id

    state.dropped.update(cid for cid in result.dropped if cid in in_batch)
    for cid in result.dropped:
        if cid in in_batch:
            report.drop(CONSOLIDATION_DROPPED, f"{cid}: {in_batch[cid].summary[:40]}")

    def final_truth(truth_id: str | None) -> str | None:
        if truth_id is None:
            return None
        resolved = to_final.get(truth_id)
        return resolved if resolved in state.truths else None

    for cid, truth_id, misdirection in result.clues:
        if cid not in in_batch or in_batch[cid].kind != "clue" or cid in state.dropped:
            continue
        truth = final_truth(truth_id)
        if truth_id is not None and truth is None:
            report.warn(f"consolidation: clue {cid} points to unknown truth '{truth_id}'")
        state.clues[cid] = ClueLink(truth, misdirection)
    for cid, truth_id in result.tricks:
        if cid not in in_batch or in_batch[cid].kind != "trick" or cid in state.dropped:
            continue
        truth = final_truth(truth_id)
        if truth is None:
            report.warn(f"consolidation: trick {cid} points to unknown truth '{truth_id}'")
        else:
            state.tricks[cid] = truth

    # S4b 漏掉的 hidden_truth 候選：自成一個真相，不整筆丟掉。
    for candidate in batch:
        if candidate.kind == "hidden_truth" and candidate.id not in placed | state.dropped:
            truth = Truth(
                id=state.new_truth_id(),
                statement=candidate.summary,
                truth_kind=candidate.data.get("truth_kind"),
                concealed_from=candidate.data.get("concealed_from"),
                concealer_ids=list(candidate.data["concealer_ids"]),
                members=[candidate.id],
            )
            state.truths[truth.id] = truth
            report.warn(f"[{ORPHAN_TRUTH}] {candidate.id} was not placed by consolidation")
            report.field_drops[ORPHAN_TRUTH] = report.field_drops.get(ORPHAN_TRUTH, 0) + 1


async def _call_batch(
    llm: Any,
    messages: list[Any],
    characters: CharacterIndex,
    report: S4Report,
    *,
    mystery: bool,
    retry_delay: float,
) -> BatchResult:
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return parse_consolidation(
                llm_text(await llm.ainvoke(messages)), characters, report, mystery=mystery
            )
        except Exception as exc:
            kind = classify_step_failure(exc)
            if kind == "rate_limited":
                raise QuotaPaused(describe_exception(exc)) from exc
            if kind in ("blocked", "llm_unconfigured") or attempt == MAX_ATTEMPTS:
                raise
            logger.warning("consolidation attempt %d failed: %s", attempt, describe_exception(exc))
            if retry_delay:
                await asyncio.sleep(retry_delay)
    raise AssertionError("unreachable")


async def consolidate(
    llm: Any,
    prompt: Prompt,
    batches: Sequence[Sequence[Candidate]],
    characters: CharacterIndex,
    report: S4Report,
    *,
    language: str,
    mystery: bool,
    retry_delay: float = 1.0,
) -> Consolidation:
    """每批一次 LLM 呼叫，依序合併進同一個 `Consolidation`。"""
    state = Consolidation()
    by_id = {c.id: c for batch in batches for c in batch}
    character_text = characters.prompt_lines(with_aliases=False)
    for batch in batches:
        lines = [
            _prior_candidate_line(truth, min(by_id[m].chapter for m in truth.members))
            for truth in state.truths.values()
            if truth.members
        ]
        lines += [candidate_line(c) for c in batch]
        system, user = prompt.render(
            language_name=get_language_display_name(language),
            characters=character_text,
            candidates="\n".join(lines),
            is_mystery="true" if mystery else "false",
        )
        messages = [SystemMessage(system), HumanMessage(user)]
        result = await _call_batch(
            llm, messages, characters, report, mystery=mystery, retry_delay=retry_delay
        )
        report.batches += 1
        merge_batch(state, result, batch, by_id, report)
    return state
