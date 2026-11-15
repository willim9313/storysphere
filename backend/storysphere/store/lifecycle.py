"""Evidence lifecycle: supersession, 「依據已變動」 propagation, rejection, cleanup.

docs/spec/01 §4、§7。這些函式只 flush、不 commit，交易邊界由呼叫端決定。
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.store.tables import Evidence, EvidenceEdit, EvidenceLink, Run

NOTE_CLAIM_TYPE = "note"
_CHUNK = 500  # SQLite 的綁定參數有上限，IN 清單分批


class InvalidStateError(ValueError):
    """The requested transition is not allowed (API code `invalid_state`)."""


@dataclass
class BasisChange:
    """Result of one reverse propagation."""

    evidence_ids: list[str] = field(default_factory=list)  # 含筆記
    note_ids: list[str] = field(default_factory=list)


def _chunks(ids: Iterable[str]) -> Iterable[list[str]]:
    items = list(ids)
    for start in range(0, len(items), _CHUNK):
        yield items[start : start + _CHUNK]


async def _downstream_of(session: AsyncSession, origin_ids: Iterable[str]) -> set[str]:
    """沿 evidence_link 反向 BFS：誰（直接或間接）引用了 origin。不含 origin 自己。"""
    seen = set(origin_ids)
    origin = set(seen)
    frontier = set(seen)
    while frontier:
        found: set[str] = set()
        for chunk in _chunks(frontier):
            rows = await session.execute(
                select(EvidenceLink.evidence_id).where(EvidenceLink.upstream_id.in_(chunk))
            )
            found.update(row.evidence_id for row in rows)
        frontier = found - seen
        seen |= frontier
    return seen - origin


async def mark_basis_changed(session: AsyncSession, origin_ids: Iterable[str]) -> BasisChange:
    """Flag every downstream evidence and note of `origin_ids` as 「依據已變動」."""
    downstream = await _downstream_of(session, origin_ids)
    if not downstream:
        return BasisChange()
    now = datetime.now(UTC)
    note_ids: list[str] = []
    for chunk in _chunks(downstream):
        await session.execute(
            update(Evidence)
            .where(Evidence.id.in_(chunk))
            .values(basis_changed=True, basis_changed_at=now)
        )
        rows = await session.execute(
            select(Evidence.id).where(
                Evidence.id.in_(chunk), Evidence.claim_type == NOTE_CLAIM_TYPE
            )
        )
        note_ids.extend(row.id for row in rows)
    await session.flush()
    return BasisChange(evidence_ids=sorted(downstream), note_ids=sorted(note_ids))


@dataclass
class RunCompletion:
    superseded_evidence_ids: list[str] = field(default_factory=list)
    basis_change: BasisChange = field(default_factory=BasisChange)


async def complete_run(session: AsyncSession, run_id: str) -> RunCompletion:
    """Mark a run done and supersede the evidence of earlier runs of the same analysis.

    「同一個分析」＝同 (book_id, ref_id, scope_key)。新 run 成功後舊 run 的 current 證據變
    superseded；被取代的若含第 1 層（重新抽取），下游全部標「依據已變動」。
    筆記不會被取代：它不屬於任何分析的 run（01 §4）。
    """
    run = await session.get(Run, run_id)
    if run is None:
        raise LookupError(f"Run {run_id} not found")
    if run.status == "done":
        raise InvalidStateError(f"Run {run_id} is already done")
    run.status = "done"
    run.finished_at = datetime.now(UTC)

    older_runs = await session.execute(
        select(Run.id).where(
            Run.book_id == run.book_id,
            Run.ref_id == run.ref_id,
            Run.scope_key == run.scope_key,
            Run.status == "done",
            Run.id != run.id,
        )
    )
    older_run_ids = [row.id for row in older_runs]
    superseded: list[str] = []
    level1: list[str] = []
    for chunk in _chunks(older_run_ids):
        rows = await session.execute(
            select(Evidence.id, Evidence.level).where(
                Evidence.run_id.in_(chunk),
                Evidence.status == "current",
                Evidence.claim_type != NOTE_CLAIM_TYPE,
            )
        )
        for row in rows:
            superseded.append(row.id)
            if row.level == 1:
                level1.append(row.id)
    for chunk in _chunks(superseded):
        await session.execute(
            update(Evidence).where(Evidence.id.in_(chunk)).values(status="superseded")
        )
    await session.flush()

    basis_change = await mark_basis_changed(session, level1) if level1 else BasisChange()
    return RunCompletion(superseded_evidence_ids=sorted(superseded), basis_change=basis_change)


async def reject_evidence(
    session: AsyncSession, evidence_id: str, reason: str | None = None
) -> BasisChange:
    """Reject one evidence and propagate 「依據已變動」 downstream.

    這一層不分層級；「一般使用者不能審核第 1 層」是 API 的規則（04 N-05e 的 403）。
    `rejected` 是終態。
    """
    evidence = await session.get(Evidence, evidence_id)
    if evidence is None:
        raise LookupError(f"Evidence {evidence_id} not found")
    if evidence.review_status == "rejected":
        raise InvalidStateError(f"Evidence {evidence_id} is already rejected")
    session.add(
        EvidenceEdit(
            evidence_id=evidence.id,
            action="reject",
            before_json={"review_status": evidence.review_status},
            reason=reason,
        )
    )
    evidence.review_status = "rejected"
    await session.flush()
    return await mark_basis_changed(session, [evidence.id])


async def purge_superseded(session: AsyncSession, book_id: str) -> int:
    """Delete superseded evidence that nothing still depends on. Returns the number deleted.

    保留的：任何未被取代的證據（筆記永遠不被取代）沿 derived_from 往上游走得到的 superseded
    證據——筆記引用的結果與它的依據都要能追溯回原文。
    """
    keep: set[str] = set()
    rows = await session.execute(
        select(Evidence.id).where(Evidence.book_id == book_id, Evidence.status != "superseded")
    )
    frontier = {row.id for row in rows}
    while frontier:
        keep |= frontier
        found: set[str] = set()
        for chunk in _chunks(frontier):
            links = await session.execute(
                select(EvidenceLink.upstream_id).where(EvidenceLink.evidence_id.in_(chunk))
            )
            found.update(row.upstream_id for row in links)
        frontier = found - keep

    rows = await session.execute(
        select(Evidence.id).where(Evidence.book_id == book_id, Evidence.status == "superseded")
    )
    doomed = [row.id for row in rows if row.id not in keep]
    for chunk in _chunks(doomed):
        await session.execute(delete(Evidence).where(Evidence.id.in_(chunk)))
    await session.flush()
    return len(doomed)
