"""Tests for ConceptInferenceService (B-092).

The store is real SQLite on ``tmp_path`` — the review gate is a property of the
service *and* the store together, and mocking the store would let the service
claim a gate the data layer does not actually hold. Only the pipeline (an LLM
call) and the KG are mocked.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from storysphere.domain.entities import Entity, EntityType
from storysphere.domain.inferred_concepts import InferenceStatus
from storysphere.services.concept_inference_service import ConceptInferenceService
from storysphere.services.concept_inference_store import ConceptInferenceStore

DOC = "book-1"


def _proposition(name: str, confidence: float = 0.8) -> Entity:
    return Entity(
        name=name,
        entity_type=EntityType.CONCEPT,
        description="because the passages say so",
        document_id=DOC,
        extraction_method="inferred",
        inferred_by="tension_pre_analysis_v1",
        confidence=confidence,
        attributes={"evidence": ["a quote"]},
    )


@pytest.fixture
def store(tmp_path):
    return ConceptInferenceStore(db_path=str(tmp_path / "inferred_concepts.db"))


@pytest.fixture
def kg():
    mock = AsyncMock()
    mock.get_entity.return_value = None
    return mock


@pytest.fixture
def pipeline():
    mock = AsyncMock()
    mock.run.return_value = []
    return mock


@pytest.fixture
def service(kg, store, pipeline):
    return ConceptInferenceService(kg_service=kg, store=store, pipeline=pipeline)


class TestRunInference:
    @pytest.mark.asyncio
    async def test_propositions_do_not_reach_the_graph(self, service, kg, pipeline):
        """The whole point of the side-store: nothing is adopted without a human."""
        pipeline.run.return_value = [_proposition("power corrupts")]

        await service.run_inference(DOC)

        kg.add_entity.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_pipeline_is_run_with_save_disabled(self, service, pipeline):
        await service.run_inference(DOC, language="zh")

        input_data = pipeline.run.await_args.args[0]
        assert input_data.save is False
        assert input_data.document_id == DOC
        assert input_data.language == "zh"

    @pytest.mark.asyncio
    async def test_filed_candidates_keep_the_llm_output(self, service, pipeline):
        pipeline.run.return_value = [_proposition("grief isolates", confidence=0.42)]

        pending = await service.run_inference(DOC)

        assert len(pending) == 1
        assert pending[0].name == "grief isolates"
        assert pending[0].description == "because the passages say so"
        assert pending[0].evidence == ["a quote"]
        assert pending[0].confidence == 0.42
        assert pending[0].inferred_by == "tension_pre_analysis_v1"
        assert pending[0].status is InferenceStatus.PENDING

    @pytest.mark.asyncio
    async def test_returns_everything_still_pending_not_just_this_run(
        self, service, pipeline
    ):
        pipeline.run.return_value = [_proposition("power corrupts")]
        await service.run_inference(DOC)

        pipeline.run.return_value = []
        pending = await service.run_inference(DOC)

        assert [c.name for c in pending] == ["power corrupts"]

    @pytest.mark.asyncio
    async def test_a_rejected_proposition_does_not_come_back_as_pending(
        self, service, pipeline
    ):
        pipeline.run.return_value = [_proposition("power corrupts")]
        filed = await service.run_inference(DOC)
        await service.reject(filed[0].id)

        pending = await service.run_inference(DOC)

        assert pending == []


class TestConfirm:
    @pytest.mark.asyncio
    async def test_writes_the_concept_to_the_graph(self, service, kg, pipeline):
        pipeline.run.return_value = [_proposition("power corrupts")]
        filed = await service.run_inference(DOC)

        entity = await service.confirm(filed[0].id)

        kg.add_entity.assert_awaited_once()
        kg.save.assert_awaited_once()
        assert entity.name == "power corrupts"
        assert entity.entity_type is EntityType.CONCEPT
        assert entity.document_id == DOC
        assert entity.extraction_method == "inferred"
        assert entity.attributes["evidence"] == ["a quote"]

    @pytest.mark.asyncio
    async def test_records_the_entity_it_became(self, service, pipeline):
        pipeline.run.return_value = [_proposition("power corrupts")]
        filed = await service.run_inference(DOC)

        entity = await service.confirm(filed[0].id)

        stored = await service.get_concept(filed[0].id)
        assert stored.status is InferenceStatus.CONFIRMED
        assert stored.confirmed_entity_id == entity.id

    @pytest.mark.asyncio
    async def test_confirming_twice_does_not_write_a_second_node(
        self, service, kg, pipeline
    ):
        pipeline.run.return_value = [_proposition("power corrupts")]
        filed = await service.run_inference(DOC)
        first = await service.confirm(filed[0].id)
        kg.get_entity.return_value = first

        again = await service.confirm(filed[0].id)

        assert kg.add_entity.await_count == 1
        assert again is first

    @pytest.mark.asyncio
    async def test_unknown_id_returns_none_and_touches_nothing(self, service, kg):
        assert await service.confirm("no-such-id") is None
        kg.add_entity.assert_not_awaited()


class TestReject:
    @pytest.mark.asyncio
    async def test_rejected_candidates_leave_the_pending_list(self, service, pipeline):
        pipeline.run.return_value = [
            _proposition("kept"),
            _proposition("dropped"),
        ]
        filed = await service.run_inference(DOC)
        dropped = next(c for c in filed if c.name == "dropped")

        await service.reject(dropped.id)

        pending = await service.list_concepts(DOC, status=InferenceStatus.PENDING)
        assert [c.name for c in pending] == ["kept"]

    @pytest.mark.asyncio
    async def test_reject_writes_nothing_to_the_graph(self, service, kg, pipeline):
        pipeline.run.return_value = [_proposition("power corrupts")]
        filed = await service.run_inference(DOC)

        await service.reject(filed[0].id)

        kg.add_entity.assert_not_awaited()
