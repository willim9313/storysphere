from __future__ import annotations

import pytest
from pydantic import ValidationError
from sqlalchemy import select, text
from storysphere.store.evidence_writer import (
    SYSTEM_FIELDS,
    EvidenceDraft,
    EvidenceWriteError,
    GenreExtDraft,
    KnownBy,
    QuoteDraft,
    SubjectRef,
    SystemFieldForbiddenError,
    UnknownUpstreamError,
    WriteContext,
    assert_no_system_fields,
    write_evidence,
)
from storysphere.store.tables import (
    EvidenceGenreExt,
    EvidenceLink,
    EvidenceQuote,
    EvidenceSubject,
)

from tests.store.conftest import BOOK

EXTRACTION = WriteContext(book_id=BOOK, source="extraction", produced_via="pipeline")
METHOD = WriteContext(book_id=BOOK, source="method", produced_via="pipeline")


def _draft(claim_type: str, **overrides) -> EvidenceDraft:
    fields = {"claim_type": claim_type, "summary": f"{claim_type} 摘要", "confidence": 0.7}
    fields.update(overrides)
    return EvidenceDraft(**fields)


class TestLevel:
    async def test_extraction_is_level_1(self, store):
        event = await store.extracted("event")

        assert event.level == 1
        assert event.source == "extraction"

    async def test_method_output_is_highest_upstream_plus_1(self, store):
        event = await store.extracted("event")
        causal = await store.derived("causal_link", [event])
        role = await store.derived("event_role", [event, causal])

        assert causal.level == 2
        assert role.level == 3  # 上游是第 1 層與第 2 層，取最高的 +1

    async def test_note_is_highest_cited_plus_1(self, store):
        event = await store.extracted("event")
        causal = await store.derived("causal_link", [event])
        role = await store.derived("event_role", [causal])
        note = await store.note([causal, role])

        assert note.level == 4

    async def test_run_upstream_does_not_raise_level(self, store):
        event = await store.extracted("event")
        run = await store.run("event.causal_network")
        ctx = WriteContext(book_id=BOOK, source="method", produced_via="pipeline", run_id=run.id)

        causal = await write_evidence(
            store.session, ctx, _draft("causal_link", derived_from=[event.id, run.id])
        )

        assert causal.level == 2
        links = await store.session.scalars(
            select(EvidenceLink.upstream_id).where(EvidenceLink.evidence_id == causal.id)
        )
        assert set(links) == {event.id, run.id}

    async def test_non_extraction_without_upstream_evidence_rejected(self, store):
        with pytest.raises(EvidenceWriteError):
            await write_evidence(store.session, METHOD, _draft("causal_link"))

    async def test_extraction_with_upstream_evidence_rejected(self, store):
        event = await store.extracted("event")

        with pytest.raises(EvidenceWriteError):
            await write_evidence(
                store.session, EXTRACTION, _draft("event", derived_from=[event.id])
            )

    async def test_unknown_upstream_rejected(self, store):
        with pytest.raises(UnknownUpstreamError) as excinfo:
            await write_evidence(
                store.session, METHOD, _draft("causal_link", derived_from=["nope"])
            )
        assert excinfo.value.ids == ["nope"]

    async def test_upstream_from_another_book_rejected(self, store):
        foreign = await store.extracted("event", book_id="book-2")

        with pytest.raises(UnknownUpstreamError):
            await write_evidence(
                store.session, METHOD, _draft("causal_link", derived_from=[foreign.id])
            )

    async def test_level_1_story_rank_rejected(self, store):
        with pytest.raises(EvidenceWriteError):
            await write_evidence(store.session, EXTRACTION, _draft("event", story_rank=3.0))


class TestSystemFields:
    def test_system_fields_cover_spec_list_in_both_casings(self):
        # docs/spec/04 §1.5 的清單
        for name in (
            "id", "bookId", "claimType", "level", "source", "runId", "producedVia",
            "agentBackend", "reviewStatus", "status", "basisChanged", "basisChangedAt",
            "derivedFrom", "methodologyTrace", "methodologyRunId", "createdAt", "updatedAt",
        ):  # fmt: skip
            assert name in SYSTEM_FIELDS
        assert {"run_id", "produced_via", "derived_from"} <= SYSTEM_FIELDS

    @pytest.mark.parametrize("field", ["level", "source", "runId", "run_id", "derivedFrom"])
    def test_payload_with_system_field_rejected(self, field):
        with pytest.raises(SystemFieldForbiddenError) as excinfo:
            assert_no_system_fields({"text": "我的詮釋", "citedEvidenceIds": ["e1"], field: 1})
        assert excinfo.value.fields == [field]

    def test_payload_without_system_fields_passes(self):
        assert_no_system_fields({"text": "我的詮釋", "citedEvidenceIds": ["e1"]})

    @pytest.mark.parametrize(
        "field", ["level", "source", "run_id", "produced_via", "agent_backend", "review_status"]
    )
    def test_draft_cannot_carry_system_field(self, field):
        with pytest.raises(ValidationError):
            EvidenceDraft(claim_type="event", summary="事件", confidence=0.5, **{field: 1})

    async def test_system_fields_come_from_context(self, store):
        event = await store.extracted("event")
        run = await store.run("character.belief")
        ctx = WriteContext(
            book_id=BOOK,
            source="method",
            produced_via="agent",
            run_id=run.id,
            agent_backend="claude-code",
        )

        belief = await write_evidence(
            store.session, ctx, _draft("belief_state", derived_from=[event.id])
        )

        assert (belief.book_id, belief.source, belief.produced_via) == (BOOK, "method", "agent")
        assert (belief.run_id, belief.agent_backend) == (run.id, "claude-code")
        assert (belief.status, belief.review_status, belief.basis_changed) == (
            "current", "pending", False,
        )  # fmt: skip


class TestRelations:
    async def test_subjects_quotes_genre_ext_written(self, store):
        draft = _draft(
            "character",
            discourse_chapter=1,
            discourse_paragraph_id="p-1",
            known_by=KnownBy(reader=True, characters=["c-watson"]),
            subjects=[
                SubjectRef(subject_id="c-holmes", role="participant"),
                SubjectRef(subject_id="c-holmes", role="participant"),  # 重複的併成一筆
            ],
            quotes=[
                QuoteDraft(paragraph_id="p-1", text="夏洛克·福爾摩斯", start=0, end=8, verified=True),
                QuoteDraft(paragraph_id="p-2", text="我的朋友"),
            ],
            genre_ext=[GenreExtDraft(genre="mystery", data={"mystery_role": "detective"})],
        )

        character = await write_evidence(store.session, EXTRACTION, draft)

        subjects = (
            await store.session.scalars(
                select(EvidenceSubject).where(EvidenceSubject.evidence_id == character.id)
            )
        ).all()
        quotes = (
            await store.session.scalars(
                select(EvidenceQuote)
                .where(EvidenceQuote.evidence_id == character.id)
                .order_by(EvidenceQuote.seq)
            )
        ).all()
        ext = (
            await store.session.scalars(
                select(EvidenceGenreExt).where(EvidenceGenreExt.evidence_id == character.id)
            )
        ).one()
        assert [(s.subject_id, s.role) for s in subjects] == [("c-holmes", "participant")]
        assert [(q.seq, q.text, q.verified) for q in quotes] == [
            (1, "夏洛克·福爾摩斯", True),
            (2, "我的朋友", False),
        ]
        assert (ext.genre, ext.system_tag, ext.data_json) == (
            "mystery", "", {"mystery_role": "detective"},
        )  # fmt: skip
        assert character.known_by == {"reader": True, "characters": ["c-watson"]}

    async def test_written_evidence_is_searchable(self, store):
        draft = _draft(
            "event",
            summary="摩斯坦小姐帶來一封神祕的信",
            quotes=[QuoteDraft(paragraph_id="p-9", text="每年收到一顆珍珠", verified=True)],
        )
        event = await write_evidence(store.session, EXTRACTION, draft)

        for query in ("神祕的信", "一顆珍珠"):
            hits = await store.session.execute(
                text("SELECT evidence_id FROM evidence_fts WHERE evidence_fts MATCH :q"),
                {"q": query},
            )
            assert [row.evidence_id for row in hits] == [event.id]

    def test_confidence_out_of_range_rejected(self):
        with pytest.raises(ValidationError):
            EvidenceDraft(claim_type="event", summary="事件", confidence=1.5)
