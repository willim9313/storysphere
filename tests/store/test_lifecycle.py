from __future__ import annotations

import pytest
from sqlalchemy import select
from storysphere.store.lifecycle import (
    InvalidStateError,
    complete_run,
    mark_basis_changed,
    purge_superseded,
    reject_evidence,
)
from storysphere.store.tables import Evidence, EvidenceEdit

from tests.store.conftest import BOOK


async def _statuses(session, *items: Evidence) -> list[str]:
    rows = await session.execute(
        select(Evidence.id, Evidence.status).where(Evidence.id.in_([i.id for i in items]))
    )
    by_id = {row.id: row.status for row in rows}
    return [by_id.get(item.id, "deleted") for item in items]


class TestSupersede:
    async def test_new_run_of_same_analysis_supersedes_old_evidence(self, store):
        event = await store.extracted("event")
        old_run = await store.run("event.causal_network")
        old = await store.derived("causal_link", [event], run=old_run)
        await complete_run(store.session, old_run.id)

        new_run = await store.run("event.causal_network")
        new = await store.derived("causal_link", [event], run=new_run)
        result = await complete_run(store.session, new_run.id)

        assert await _statuses(store.session, old, new) == ["superseded", "current"]
        assert result.superseded_evidence_ids == [old.id]

    async def test_first_run_supersedes_nothing(self, store):
        event = await store.extracted("event")
        run = await store.run("event.causal_network")
        causal = await store.derived("causal_link", [event], run=run)

        result = await complete_run(store.session, run.id)

        assert result.superseded_evidence_ids == []
        assert await _statuses(store.session, causal) == ["current"]

    async def test_different_scope_or_method_or_book_not_superseded(self, store):
        event = await store.extracted("event")
        kept = []
        for ref_id, scope in (("character.arc", "c-holmes"), ("character.voice", "c-watson")):
            run = await store.run(ref_id, scope)
            kept.append(await store.derived("arc_segment", [event], run=run))
            await complete_run(store.session, run.id)
        other_book_run = await store.run("character.arc", "c-watson", book_id="book-2")
        await complete_run(store.session, other_book_run.id)

        new_run = await store.run("character.arc", "c-watson")
        await store.derived("arc_segment", [event], run=new_run)
        result = await complete_run(store.session, new_run.id)

        assert result.superseded_evidence_ids == []
        assert await _statuses(store.session, *kept) == ["current", "current"]

    async def test_unfinished_old_run_not_superseded(self, store):
        event = await store.extracted("event")
        failed_run = await store.run("event.causal_network")
        failed_run.status = "failed"
        partial = await store.derived("causal_link", [event], run=failed_run)

        new_run = await store.run("event.causal_network")
        await complete_run(store.session, new_run.id)

        assert await _statuses(store.session, partial) == ["current"]

    async def test_completing_twice_rejected(self, store):
        run = await store.run("event.causal_network")
        await complete_run(store.session, run.id)

        with pytest.raises(InvalidStateError):
            await complete_run(store.session, run.id)

    async def test_note_never_superseded_and_cited_evidence_survives_purge(self, store):
        event = await store.extracted("event")
        old_run = await store.run("event.causal_network")
        cited = await store.derived("causal_link", [event], run=old_run)
        uncited = await store.derived("causal_link", [event], run=old_run)
        await complete_run(store.session, old_run.id)
        note = await store.note([cited])

        new_run = await store.run("event.causal_network")
        await store.derived("causal_link", [event], run=new_run)
        await complete_run(store.session, new_run.id)
        deleted = await purge_superseded(store.session, BOOK)

        # 兩筆都被取代；清理時只有沒被筆記引用的那筆被刪
        assert deleted == 1
        assert await _statuses(store.session, cited, uncited, note) == [
            "superseded", "deleted", "current",
        ]  # fmt: skip
        await store.refresh(note)
        assert note.basis_changed is False  # 被取代不等於依據已變動

    async def test_purge_keeps_superseded_upstream_of_cited_evidence(self, store):
        ingest_old = await store.run("ingest.s2")
        old_event = await store.extracted("event", run=ingest_old)
        await complete_run(store.session, ingest_old.id)
        method_run = await store.run("event.causal_network")
        causal = await store.derived("causal_link", [old_event], run=method_run)
        await complete_run(store.session, method_run.id)
        note = await store.note([causal])

        ingest_new = await store.run("ingest.s2")
        await store.extracted("event", run=ingest_new)
        await complete_run(store.session, ingest_new.id)
        deleted = await purge_superseded(store.session, BOOK)

        # 舊的第 1 層雖被取代，但筆記的依據還要能追溯到它
        assert deleted == 0
        assert await _statuses(store.session, old_event, causal, note) == [
            "superseded", "current", "current",
        ]  # fmt: skip


class TestBasisChanged:
    async def test_rejecting_level_1_flags_downstream_and_notes(self, store):
        event = await store.extracted("event")
        untouched_event = await store.extracted("event")
        causal = await store.derived("causal_link", [event])
        role = await store.derived("event_role", [event, causal])
        unrelated = await store.derived("causal_link", [untouched_event])
        note = await store.note([causal, role])

        change = await reject_evidence(store.session, event.id, reason="抽錯了")

        await store.refresh(event, causal, role, unrelated, note, untouched_event)
        assert event.review_status == "rejected"
        assert [e.basis_changed for e in (causal, role, note)] == [True, True, True]
        assert all(e.basis_changed_at is not None for e in (causal, role, note))
        assert [e.basis_changed for e in (event, unrelated, untouched_event)] == [
            False, False, False,
        ]  # fmt: skip
        assert set(change.evidence_ids) == {causal.id, role.id, note.id}
        assert change.note_ids == [note.id]

    async def test_reject_records_reason_and_previous_status(self, store):
        event = await store.extracted("event")
        causal = await store.derived("causal_link", [event])

        await reject_evidence(store.session, causal.id, reason="因果方向反了")

        edit = (
            await store.session.scalars(
                select(EvidenceEdit).where(EvidenceEdit.evidence_id == causal.id)
            )
        ).one()
        assert (edit.action, edit.reason, edit.before_json) == (
            "reject", "因果方向反了", {"review_status": "pending"},
        )  # fmt: skip

    async def test_rejecting_twice_rejected(self, store):
        event = await store.extracted("event")
        await reject_evidence(store.session, event.id)

        with pytest.raises(InvalidStateError):
            await reject_evidence(store.session, event.id)

    async def test_reextracting_level_1_flags_downstream(self, store):
        ingest_old = await store.run("ingest.s2")
        old_event = await store.extracted("event", run=ingest_old)
        await complete_run(store.session, ingest_old.id)
        causal = await store.derived("causal_link", [old_event])
        note = await store.note([causal])

        ingest_new = await store.run("ingest.s2")
        new_event = await store.extracted("event", run=ingest_new)
        result = await complete_run(store.session, ingest_new.id)

        await store.refresh(old_event, new_event, causal, note)
        assert (old_event.status, new_event.status) == ("superseded", "current")
        assert (causal.basis_changed, note.basis_changed) == (True, True)
        assert (causal.status, note.status) == ("current", "current")  # 只標記，不取代
        assert result.basis_change.note_ids == [note.id]

    async def test_rerunning_a_method_does_not_flag_downstream(self, store):
        event = await store.extracted("event")
        old_run = await store.run("event.causal_network")
        old_causal = await store.derived("causal_link", [event], run=old_run)
        await complete_run(store.session, old_run.id)
        role = await store.derived("event_role", [old_causal])

        new_run = await store.run("event.causal_network")
        await store.derived("causal_link", [event], run=new_run)
        result = await complete_run(store.session, new_run.id)

        await store.refresh(role)
        assert role.basis_changed is False  # 01 §4：只有第 1 層重抽或審核拒絕才傳播
        assert result.basis_change.evidence_ids == []

    async def test_propagation_handles_diamond_and_no_downstream(self, store):
        event = await store.extracted("event")
        left = await store.derived("causal_link", [event])
        right = await store.derived("opposition", [event])
        top = await store.derived("theme_reading", [left, right])

        change = await mark_basis_changed(store.session, [event.id])
        nothing = await mark_basis_changed(store.session, [top.id])

        assert change.evidence_ids == sorted([left.id, right.id, top.id])
        assert nothing.evidence_ids == []
