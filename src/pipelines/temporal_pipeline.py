"""TemporalPipeline — orchestrate temporal relation extraction and ranking.

On-demand pipeline triggered after EEP analysis is complete for a book.
Collects events + EEPs, infers temporal relations via LLM, then computes
chronological ranks via DAG topological sort.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from pipelines.base import BasePipeline

logger = logging.getLogger(__name__)


@dataclass
class TemporalPipelineResult:
    """Output of the temporal pipeline."""

    document_id: str
    temporal_relations: int = 0
    events_ranked: int = 0
    cycles_resolved: int = 0
    errors: list[str] = field(default_factory=list)


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
    ) -> TemporalPipelineResult:
        """Run the full temporal pipeline for a book.

        Args:
            input_data: The document ID to process.
            language: Language hint for the timeline agent.

        Steps:
            1. Clear existing temporal relations for this document.
            2. Load all events for the document.
            3. Load available EEPs from analysis cache.
            4. Infer temporal relations via TimelineAgent.
            5. Store temporal relations in KGService.
            6. Build DAG and compute chronological ranks.
            7. Write ranks back to events.
            8. Persist to disk.
        """
        document_id = input_data
        result = TemporalPipelineResult(document_id=document_id)

        # 1. Clear old temporal relations
        removed = await self._kg_service.remove_temporal_relations(document_id)
        if removed:
            logger.info("Cleared %d old temporal relations for %s", removed, document_id)

        # 2. Load all events
        self._log_step("load_events", document_id=document_id)
        events = await self._kg_service.get_events(document_id=document_id)
        if not events:
            result.errors.append("No events found for document")
            return result

        logger.info("TemporalPipeline: %d events for %s", len(events), document_id)

        # 3. Load available EEPs from cache
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
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("TimelineAgent failed: %s", exc)
            result.errors.append(f"TimelineAgent failed: {exc}")
            return result

        result.temporal_relations = len(relations)

        # 5. Store temporal relations
        for tr in relations:
            await self._kg_service.add_temporal_relation(tr)

        # 6. Build DAG and compute ranks
        self._log_step("compute_ranks", relations=len(relations))
        events_dict = {e.id: e for e in events}
        ranks = self._timeline_service.build_and_rank(relations, events_dict)
        result.events_ranked = len(ranks)

        # 7. Write ranks back to events
        for event_id, rank in ranks.items():
            await self._kg_service.update_event_rank(event_id, rank)

        # 8. Persist
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

    async def _load_eep_map(
        self,
        document_id: str,
        events: list[Any],
    ) -> dict[str, Any]:
        """Load cached EventEvidenceProfiles for the given events."""
        from services.analysis_models import EventAnalysisResult  # noqa: PLC0415

        eep_map: dict[str, Any] = {}
        if self._analysis_cache is None:
            return eep_map

        for event in events:
            cache_key = f"event:{document_id}:{event.id}"
            cached = await self._analysis_cache.get(cache_key)
            if cached is not None:
                try:
                    analysis = EventAnalysisResult.model_validate(cached)
                    eep_map[event.id] = analysis.eep
                except Exception:  # noqa: BLE001
                    logger.debug("Failed to parse EEP for %s", event.id)
        return eep_map
