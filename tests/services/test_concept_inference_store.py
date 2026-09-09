"""Tests for ConceptInferenceStore (B-092).

Real SQLite on ``tmp_path``, no mocks — the store is nothing but its SQL, so
mocking the connection would test nothing. The re-run behaviour is what these
mostly pin down: a rejected proposition that came back as pending would be fed
to the next TEU prompt as an established fact, which is the whole reason the
side-store exists.
"""

from __future__ import annotations

import pytest
from storysphere.domain.inferred_concepts import InferenceStatus, InferredConcept
from storysphere.services.concept_inference_store import ConceptInferenceStore

DOC = "book-1"


@pytest.fixture
def store(tmp_path):
    return ConceptInferenceStore(db_path=str(tmp_path / "inferred_concepts.db"))


def _concept(name: str, document_id: str = DOC, **kwargs) -> InferredConcept:
    return InferredConcept(
        document_id=document_id,
        name=name,
        description="because the passages say so",
        evidence=["a quote"],
        inferred_by="tension_pre_analysis_v1",
        **{"confidence": 0.8, **kwargs},
    )


class TestUpsertAndRead:
    @pytest.mark.asyncio
    async def test_save_and_retrieve_by_id(self, store):
        concept = _concept("power corrupts")
        await store.upsert(concept)

        got = await store.get(concept.id)

        assert got is not None
        assert got.name == "power corrupts"
        assert got.evidence == ["a quote"]
        assert got.confidence == 0.8
        assert got.status is InferenceStatus.PENDING

    @pytest.mark.asyncio
    async def test_get_unknown_id_returns_none(self, store):
        assert await store.get("no-such-id") is None

    @pytest.mark.asyncio
    async def test_list_is_scoped_to_one_document(self, store):
        await store.upsert(_concept("grief isolates"))
        await store.upsert(_concept("loyalty demands complicity", document_id="book-2"))

        assert [c.name for c in await store.list_by_document(DOC)] == ["grief isolates"]

    @pytest.mark.asyncio
    async def test_list_filters_by_status(self, store):
        kept = _concept("kept")
        dropped = _concept("dropped")
        await store.upsert(kept)
        await store.upsert(dropped)
        await store.update_status(dropped.id, InferenceStatus.REJECTED)

        pending = await store.list_by_document(DOC, status=InferenceStatus.PENDING)
        rejected = await store.list_by_document(DOC, status=InferenceStatus.REJECTED)

        assert [c.name for c in pending] == ["kept"]
        assert [c.name for c in rejected] == ["dropped"]


class TestRerun:
    @pytest.mark.asyncio
    async def test_same_proposition_updates_rather_than_duplicates(self, store):
        first = _concept("power corrupts")
        await store.upsert(first)
        await store.upsert(_concept("power corrupts", confidence=0.4))

        rows = await store.list_by_document(DOC)

        assert len(rows) == 1
        assert rows[0].id == first.id, "the id rotated, so the UI's handle went stale"
        assert rows[0].confidence == 0.4, "the fresh LLM output was not written"

    @pytest.mark.asyncio
    async def test_rerun_does_not_resurrect_a_rejected_proposition(self, store):
        concept = _concept("power corrupts")
        await store.upsert(concept)
        await store.update_status(concept.id, InferenceStatus.REJECTED)

        await store.upsert(_concept("power corrupts"))

        assert (await store.get(concept.id)).status is InferenceStatus.REJECTED

    @pytest.mark.asyncio
    async def test_rerun_does_not_unconfirm_an_adopted_proposition(self, store):
        concept = _concept("power corrupts")
        await store.upsert(concept)
        await store.update_status(
            concept.id, InferenceStatus.CONFIRMED, confirmed_entity_id="ent-9"
        )

        await store.upsert(_concept("power corrupts"))

        got = await store.get(concept.id)
        assert got.status is InferenceStatus.CONFIRMED
        assert got.confirmed_entity_id == "ent-9"

    @pytest.mark.asyncio
    async def test_the_same_proposition_in_two_books_stays_separate(self, store):
        await store.upsert(_concept("power corrupts"))
        await store.upsert(_concept("power corrupts", document_id="book-2"))

        assert len(await store.list_by_document(DOC)) == 1
        assert len(await store.list_by_document("book-2")) == 1


class TestUpdateStatus:
    @pytest.mark.asyncio
    async def test_confirm_records_the_entity_it_became(self, store):
        concept = _concept("power corrupts")
        await store.upsert(concept)

        await store.update_status(
            concept.id, InferenceStatus.CONFIRMED, confirmed_entity_id="ent-1"
        )

        got = await store.get(concept.id)
        assert got.status is InferenceStatus.CONFIRMED
        assert got.confirmed_entity_id == "ent-1"

    @pytest.mark.asyncio
    async def test_unknown_id_is_a_no_op(self, store):
        await store.update_status("no-such-id", InferenceStatus.CONFIRMED)

        assert await store.list_by_document(DOC) == []
