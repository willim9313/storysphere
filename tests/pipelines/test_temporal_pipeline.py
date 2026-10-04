"""Tests for pipelines.temporal_pipeline.TemporalPipeline progress reporting."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from storysphere.domain.events import Event, EventType
from storysphere.pipelines.temporal_pipeline import TemporalPipeline


def _make_event(event_id: str, chapter: int = 1) -> Event:
    return Event(
        id=event_id,
        document_id="book-1",
        title=f"Event {event_id}",
        event_type=EventType.PLOT,
        description="something happens",
        chapter=chapter,
        participants=["ent-1"],
    )


def _make_pipeline(events: list[Event], relations: list | None = None) -> TemporalPipeline:
    kg = AsyncMock()
    kg.remove_temporal_relations.return_value = 0
    kg.get_events.return_value = events

    cache = AsyncMock()
    cache.get.return_value = None

    agent = AsyncMock()
    agent.infer_temporal_relations.return_value = relations or []

    timeline_service = AsyncMock()
    timeline_service.build_and_rank = lambda rels, events_dict: {
        e.id: float(i) for i, e in enumerate(events_dict.values())
    }

    return TemporalPipeline(
        kg_service=kg,
        analysis_cache=cache,
        timeline_agent=agent,
        timeline_service=timeline_service,
    )


class TestTemporalPipelineProgress:
    @pytest.mark.asyncio
    async def test_reports_monotonic_progress_through_the_run(self):
        pipeline = _make_pipeline([_make_event("e1"), _make_event("e2", chapter=2)])
        seen: list[tuple[int, str]] = []

        await pipeline.run("book-1", progress_callback=lambda pct, stage: seen.append((pct, stage)))

        assert seen, "pipeline reported no progress at all"
        pcts = [p for p, _ in seen]
        assert pcts == sorted(pcts)
        assert pcts[0] <= 10
        assert pcts[-1] >= 90
        assert all(stage for _, stage in seen)

    @pytest.mark.asyncio
    async def test_forwards_a_per_batch_callback_to_the_agent(self):
        events = [_make_event("e1"), _make_event("e2", chapter=2)]
        pipeline = _make_pipeline(events)
        seen: list[int] = []

        await pipeline.run("book-1", progress_callback=lambda pct, _stage: seen.append(pct))

        agent = pipeline._timeline_agent
        batch_cb = agent.infer_temporal_relations.await_args.kwargs["progress_callback"]
        # The inference loop owns 10–80%: half the pairs done → halfway through.
        batch_cb(5, 10)
        assert seen[-1] == 45

    @pytest.mark.asyncio
    async def test_batch_callback_survives_zero_pairs(self):
        pipeline = _make_pipeline([_make_event("e1")])
        seen: list[int] = []

        await pipeline.run("book-1", progress_callback=lambda pct, _stage: seen.append(pct))

        batch_cb = pipeline._timeline_agent.infer_temporal_relations.await_args.kwargs[
            "progress_callback"
        ]
        batch_cb(0, 0)
        assert seen[-1] == 10

    @pytest.mark.asyncio
    async def test_runs_without_a_callback(self):
        pipeline = _make_pipeline([_make_event("e1")])

        result = await pipeline.run("book-1")

        assert result.document_id == "book-1"
        assert result.errors == []


class TestTemporalPipelineReplacesOnlyOnSuccess:
    @pytest.mark.asyncio
    async def test_llm_failure_keeps_existing_relations_and_ranks(self):
        pipeline = _make_pipeline([_make_event("e1"), _make_event("e2", chapter=2)])
        pipeline._timeline_agent.infer_temporal_relations.side_effect = RuntimeError("quota")
        kg = pipeline._kg_service

        result = await pipeline.run("book-1")

        assert result.failure is not None
        assert "quota" in result.failure
        kg.remove_temporal_relations.assert_not_called()
        kg.add_temporal_relation.assert_not_called()
        kg.update_event_rank.assert_not_called()
        kg.save.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_events_is_a_failure_and_deletes_nothing(self):
        pipeline = _make_pipeline([])

        result = await pipeline.run("book-1")

        assert result.failure == "No events found for document"
        pipeline._kg_service.remove_temporal_relations.assert_not_called()

    @pytest.mark.asyncio
    async def test_success_clears_old_relations_after_inference(self):
        pipeline = _make_pipeline([_make_event("e1"), _make_event("e2", chapter=2)])
        order: list[str] = []
        kg = pipeline._kg_service
        agent = pipeline._timeline_agent

        async def _infer(**_kw):
            order.append("infer")
            return []

        async def _remove(_doc):
            order.append("remove")
            return 3

        agent.infer_temporal_relations.side_effect = _infer
        kg.remove_temporal_relations.side_effect = _remove

        result = await pipeline.run("book-1")

        assert result.failure is None
        assert order == ["infer", "remove"]
        kg.update_event_rank.assert_awaited()

    @pytest.mark.asyncio
    async def test_non_fatal_save_error_is_not_a_failure(self):
        pipeline = _make_pipeline([_make_event("e1")])
        pipeline._kg_service.save.side_effect = OSError("disk")

        result = await pipeline.run("book-1")

        assert result.failure is None
        assert any("KG save failed" in e for e in result.errors)
