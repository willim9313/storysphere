"""TemporalPipeline — orchestrate temporal relation extraction and ranking.

On-demand pipeline triggered after EEP analysis is complete for a book.
Collects events + EEPs, infers temporal relations via LLM, then computes
chronological ranks via DAG topological sort.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from storysphere.pipelines.base import BasePipeline

logger = logging.getLogger(__name__)


@dataclass
class TemporalPipelineResult:
    """Output of the temporal pipeline."""

    document_id: str
    temporal_relations: int = 0
    events_ranked: int = 0
    cycles_resolved: int = 0
    errors: list[str] = field(default_factory=list)
    # Set only when the run failed *before overwriting anything* — the previous
    # relations and ranks are untouched. ``errors`` also carries non-fatal
    # notes (e.g. a failed disk save) that do not make the run a failure.
    failure: str | None = None


class TemporalPipeline(BasePipeline[str, TemporalPipelineResult]):
    """Orchestrate temporal relation extraction and chronological ranking."""

    def __init__(
        self,
        kg_service: Any,
        analysis_cache: Any,
        timeline_agent: Any,
        timeline_service: Any,
    ) -> None:
        self._kg_service = kg_service
        self._analysis_cache = analysis_cache
        self._timeline_agent = timeline_agent
        self._timeline_service = timeline_service

    async def run(
        self,
        input_data: str,
        *,
        language: str = "en",
        progress_callback: Callable[[int, str], None] | None = None,
    ) -> TemporalPipelineResult:
        """Run the full temporal pipeline for a book.

        Args:
            input_data: The document ID to process.
            language: Language hint for the timeline agent.
            progress_callback: Called with ``(percent, stage)`` at each step.
                Relation inference (step 4) is the only long step, so it owns
                the bulk of the range (10–80%) and reports per LLM batch;
                everything else is a milestone.

        Existing relations and ranks are replaced only after inference
        succeeds: if the LLM fails (or there are no events) nothing is deleted
        and ``result.failure`` is set.

        Steps:
            1. Load all events for the document.
            2. Load available EEPs from analysis cache.
            3. Infer temporal relations via TimelineAgent.
            4. Clear existing temporal relations, store the new ones in KGService.
            6. Build DAG and compute chronological ranks.
            7. Write ranks back to events.
            8. Persist to disk.
        """
        document_id = input_data
        result = TemporalPipelineResult(document_id=document_id)

        def _report(pct: int, stage: str) -> None:
            if progress_callback:
                progress_callback(pct, stage)

        # 2. Load all events
        self._log_step("load_events", document_id=document_id)
        _report(8, "載入事件")
        events = await self._kg_service.get_events(document_id=document_id)
        if not events:
            result.errors.append("No events found for document")
            result.failure = "No events found for document"
            return result

        logger.info("TemporalPipeline: %d events for %s", len(events), document_id)

        # 3. Load available EEPs from cache
        _report(10, "載入事件分析結果")
        eep_map = await self._load_eep_map(document_id, events)
        logger.info(
            "TemporalPipeline: %d/%d EEPs available",
            len(eep_map),
            len(events),
        )

        # 4. Infer temporal relations
        self._log_step("infer_relations", events=len(events), eeps=len(eep_map))
        try:
            relations = await self._timeline_agent.infer_temporal_relations(
                events=events,
                eep_map=eep_map,
                document_id=document_id,
                language=language,
                progress_callback=lambda done, total: _report(
                    10 + int(done / total * 70) if total else 10,
                    f"推論事件時序 {done}/{total}",
                ),
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("TimelineAgent failed: %s", exc)
            result.errors.append(f"TimelineAgent failed: {exc}")
            result.failure = f"Temporal inference failed, existing timeline kept: {exc}"
            return result

        result.temporal_relations = len(relations)

        # 5. Inference succeeded — only now replace the old relations
        _report(82, "寫入時序關係")
        removed = await self._kg_service.remove_temporal_relations(document_id)
        if removed:
            logger.info("Cleared %d old temporal relations for %s", removed, document_id)
        for tr in relations:
            await self._kg_service.add_temporal_relation(tr)

        # 6. Build DAG and compute ranks
        self._log_step("compute_ranks", relations=len(relations))
        _report(86, "計算故事順序")
        events_dict = {e.id: e for e in events}
        ranks = self._timeline_service.build_and_rank(relations, events_dict)
        result.events_ranked = len(ranks)

        # 7. Write ranks back to events
        _report(90, "寫回事件排序")
        for event_id, rank in ranks.items():
            await self._kg_service.update_event_rank(event_id, rank)

        # 8. Assign chron_index and back-fill entity first_chron_index
        await self._assign_chron_indices(document_id, ranks, events_dict)

        # 9. Persist
        _report(96, "儲存圖譜")
        try:
            await self._kg_service.save()
        except Exception as exc:  # noqa: BLE001
            logger.warning("KG save failed (non-fatal): %s", exc)
            result.errors.append(f"KG save failed: {exc}")

        logger.info(
            "TemporalPipeline complete for %s: %d relations, %d events ranked",
            document_id,
            result.temporal_relations,
            result.events_ranked,
        )
        return result

    async def _assign_chron_indices(
        self,
        document_id: str,
        ranks: dict[str, float],
        events_dict: dict[str, Any],
    ) -> None:
        """Assign 1-based chron_index to ranked events and back-fill entity first_chron_index."""
        if not ranks:
            return

        sorted_ids = self._sort_by_rank(ranks, events_dict)
        await self._write_event_chron_indices(sorted_ids, events_dict)
        entity_first = self._build_entity_first_map(sorted_ids, events_dict)
        await self._write_entity_chron_indices(entity_first)

        logger.info(
            "chron_index assigned for %d events, %d entities back-filled",
            len(sorted_ids),
            len(entity_first),
        )

    @staticmethod
    def _sort_by_rank(ranks: dict[str, float], events_dict: dict[str, Any]) -> list[str]:
        def _key(eid: str) -> tuple[float, int]:
            evt = events_dict.get(eid)
            return (ranks[eid], evt.chapter if evt is not None else 0)
        return sorted(ranks, key=_key)

    async def _write_event_chron_indices(
        self, sorted_ids: list[str], events_dict: dict[str, Any]
    ) -> None:
        for idx, event_id in enumerate(sorted_ids, start=1):
            await self._kg_service.update_event_chron_index(event_id, idx)

    @staticmethod
    def _build_entity_first_map(
        sorted_ids: list[str], events_dict: dict[str, Any]
    ) -> dict[str, int]:
        entity_first: dict[str, int] = {}
        for idx, event_id in enumerate(sorted_ids, start=1):
            event = events_dict.get(event_id)
            if event is None:
                continue
            for entity_id in event.participants:
                entity_first.setdefault(entity_id, idx)
        return entity_first

    async def _write_entity_chron_indices(self, entity_first: dict[str, int]) -> None:
        for entity_id, first_idx in entity_first.items():
            await self._kg_service.update_entity_chron_index(entity_id, first_idx)

    async def _load_eep_map(
        self,
        document_id: str,
        events: list[Any],
    ) -> dict[str, Any]:
        """Load cached EventEvidenceProfiles for the given events."""
        from storysphere.services.analysis_models import EventAnalysisResult  # noqa: PLC0415

        eep_map: dict[str, Any] = {}
        if self._analysis_cache is None:
            return eep_map

        for event in events:
            cache_key = f"event:{document_id}:{event.id}"
            analysis = await self._analysis_cache.get_as(cache_key, EventAnalysisResult)
            if analysis is not None:
                eep_map[event.id] = analysis.eep
        return eep_map
