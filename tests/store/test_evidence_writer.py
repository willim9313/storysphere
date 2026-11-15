from __future__ import annotations

import pytest
from pydantic import ValidationError
from sqlalchemy import select, text
from storysphere.store.content_tables import get_content
from storysphere.store.evidence_writer import (
    SYSTEM_FIELDS,
    ContentValidationError,
    EvidenceDraft,
    EvidenceWriteError,
    GenreExtDraft,
    KnownBy,
    QuoteDraft,
    SubjectRef,
    SystemFieldForbiddenError,
    UnknownClaimTypeError,
    UnknownUpstreamError,
    WriteContext,
    assert_no_system_fields,
    write_evidence,
)
from storysphere.store.tables import (
    EvidenceGenreExt,
    EvidenceLink,
    EvidenceSubject,
)

from tests.store.conftest import BOOK, DEFAULT_QUOTE, FakeParagraphs, make_draft

EXTRACTION = WriteContext(book_id=BOOK, source="extraction", produced_via="pipeline")
METHOD = WriteContext(book_id=BOOK, source="method", produced_via="pipeline")


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
        draft = make_draft("causal_link", derived_from=[event.id, run.id])

        causal = await write_evidence(store.session, ctx, draft)

        assert causal.level == 2
        links = await store.session.scalars(
            select(EvidenceLink.upstream_id).where(EvidenceLink.evidence_id == causal.id)
        )
        assert set(links) == {event.id, run.id}

    async def test_non_extraction_without_upstream_evidence_rejected(self, store):
        with pytest.raises(EvidenceWriteError):
            await write_evidence(store.session, METHOD, make_draft("causal_link"))

    async def test_extraction_with_upstream_evidence_rejected(self, store):
        event = await store.extracted("event")
        draft = make_draft("event", derived_from=[event.id], quotes=[DEFAULT_QUOTE])

        with pytest.raises(EvidenceWriteError):
            await write_evidence(store.session, EXTRACTION, draft, FakeParagraphs())

    async def test_unknown_upstream_rejected(self, store):
        with pytest.raises(UnknownUpstreamError) as excinfo:
            await write_evidence(
                store.session, METHOD, make_draft("causal_link", derived_from=["nope"])
            )
        assert excinfo.value.ids == ["nope"]

    async def test_upstream_from_another_book_rejected(self, store):
        foreign = await store.extracted("event", book_id="book-2")

        with pytest.raises(UnknownUpstreamError):
            await write_evidence(
                store.session, METHOD, make_draft("causal_link", derived_from=[foreign.id])
            )

    async def test_level_1_story_rank_rejected(self, store):
        draft = make_draft("event", story_rank=3.0, quotes=[DEFAULT_QUOTE])

        with pytest.raises(EvidenceWriteError):
            await write_evidence(store.session, EXTRACTION, draft, FakeParagraphs())


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

    def test_quote_draft_cannot_claim_verified(self):
        with pytest.raises(ValidationError):
            QuoteDraft(paragraph_id="p-1", text="福爾摩斯", verified=True)

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
            store.session, ctx, make_draft("belief_state", derived_from=[event.id])
        )

        assert (belief.book_id, belief.source, belief.produced_via) == (BOOK, "method", "agent")
        assert (belief.run_id, belief.agent_backend) == (run.id, "claude-code")
        assert (belief.status, belief.review_status, belief.basis_changed) == (
            "current", "pending", False,
        )  # fmt: skip


class TestContent:
    async def test_content_written_to_its_own_table(self, store):
        event = await store.extracted("event")

        content = await get_content(store.session, "event", event.id)

        assert content is not None
        assert content["title"] == make_draft("event").content["title"]
        assert await get_content(store.session, "character", event.id) is None

    async def test_unknown_enum_value_becomes_other_with_raw_label(self, store):
        content = {**make_draft("event").content, "event_type": "heist"}
        draft = make_draft("event", content=content, quotes=[DEFAULT_QUOTE])

        event = await write_evidence(store.session, EXTRACTION, draft, FakeParagraphs())

        stored = await get_content(store.session, "event", event.id)
        assert (stored["event_type"], stored["raw_label"]) == ("other", "heist")

    async def test_undeclared_claim_type_rejected(self, store):
        draft = EvidenceDraft(claim_type="made_up", summary="x", confidence=0.5)

        with pytest.raises(UnknownClaimTypeError):
            await write_evidence(store.session, EXTRACTION, draft)

    async def test_content_with_unknown_field_rejected(self, store):
        content = {**make_draft("event").content, "is_culprit": True}
        draft = make_draft("event", content=content, quotes=[DEFAULT_QUOTE])

        with pytest.raises(ContentValidationError):
            await write_evidence(store.session, EXTRACTION, draft, FakeParagraphs())

    async def test_content_missing_required_field_rejected(self, store):
        draft = make_draft("event", content={}, quotes=[DEFAULT_QUOTE])

        with pytest.raises(ContentValidationError):
            await write_evidence(store.session, EXTRACTION, draft, FakeParagraphs())

    async def test_genre_ext_validated_against_its_model(self, store):
        good = make_draft(
            "character",
            quotes=[DEFAULT_QUOTE],
            genre_ext=[GenreExtDraft(genre="mystery", data={"mystery_role": "detective"})],
        )
        bad = make_draft(
            "character",
            quotes=[DEFAULT_QUOTE],
            genre_ext=[GenreExtDraft(genre="mystery", data={"is_culprit": True})],
        )
        undeclared = make_draft(
            "event", quotes=[DEFAULT_QUOTE], genre_ext=[GenreExtDraft(genre="mystery", data={})]
        )

        character = await write_evidence(store.session, EXTRACTION, good, FakeParagraphs())
        with pytest.raises(ContentValidationError):
            await write_evidence(store.session, EXTRACTION, bad, FakeParagraphs())
        with pytest.raises(UnknownClaimTypeError):
            await write_evidence(store.session, EXTRACTION, undeclared, FakeParagraphs())

        ext = (
            await store.session.scalars(
                select(EvidenceGenreExt).where(EvidenceGenreExt.evidence_id == character.id)
            )
        ).one()
        assert (ext.genre, ext.system_tag) == ("mystery", "")
        assert ext.data_json["mystery_role"] == "detective"


class TestRelations:
    async def test_subjects_and_known_by_written(self, store):
        draft = make_draft(
            "event",
            discourse_chapter=1,
            discourse_paragraph_id="p-1",
            known_by=KnownBy(reader=True, characters=["c-watson"]),
            subjects=[
                SubjectRef(subject_id="c-holmes", role="participant"),
                SubjectRef(subject_id="c-holmes", role="participant"),  # 重複的併成一筆
            ],
            quotes=[DEFAULT_QUOTE],
        )

        event = await write_evidence(store.session, EXTRACTION, draft, FakeParagraphs())

        subjects = (
            await store.session.scalars(
                select(EvidenceSubject).where(EvidenceSubject.evidence_id == event.id)
            )
        ).all()
        assert [(s.subject_id, s.role) for s in subjects] == [("c-holmes", "participant")]
        assert event.known_by == {"reader": True, "characters": ["c-watson"]}
        assert (event.discourse_chapter, event.discourse_paragraph_id) == (1, "p-1")

    async def test_written_evidence_is_searchable(self, store):
        draft = make_draft(
            "event",
            summary="摩斯坦小姐帶來一封神祕的信",
            quotes=[QuoteDraft(paragraph_id="p-2", text="收到一顆珍珠")],
        )
        event = await write_evidence(store.session, EXTRACTION, draft, FakeParagraphs())

        for query in ("神祕的信", "一顆珍珠"):
            hits = await store.session.execute(
                text("SELECT evidence_id FROM evidence_fts WHERE evidence_fts MATCH :q"),
                {"q": query},
            )
            assert [row.evidence_id for row in hits] == [event.id]

    def test_confidence_out_of_range_rejected(self):
        with pytest.raises(ValidationError):
            EvidenceDraft(claim_type="event", summary="事件", confidence=1.5)

