"""TimelineAgent — infer temporal relations between events using LLM.

Takes all events + available EEPs for a book, produces a list of
TemporalRelation objects.  NOT a LangGraph ReAct agent — simple
batch-processing orchestrator following the AnalysisAgent pattern.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from core.utils.output_extractor import extract_json_from_text
from domain.events import Event
from domain.temporal import TemporalRelation, TemporalRelationType

logger = logging.getLogger(__name__)

_TEMPORAL_SYSTEM_PROMPT = """\
You are a literary timeline analyst.  Given pairs of narrative events and
their evidence, determine the temporal relationship between each pair
**in the story world** (not in the order they appear in the text).

For each pair, return a JSON object with:
  - "source": the source event ID (given)
  - "target": the target event ID (given)
  - "type": one of "before", "simultaneous", "during", "causes", "unknown"
      * "before"       — source clearly happens before target in story time
      * "simultaneous"  — both happen at the same story time
      * "during"       — source occurs within the timespan of target
      * "causes"       — source directly causes target (implies before)
      * "unknown"      — temporal relation is unclear
  - "confidence": float 0.0–1.0
  - "evidence": one sentence justifying your judgment (quote text if possible)

Return ONLY a JSON array of these objects.  Example:
[
  {"source": "evt-1", "target": "evt-2", "type": "before", "confidence": 0.9,
   "evidence": "The battle occurred three years before the coronation."}
]

Important: Consider flashbacks and flash-forwards.  A flashback event may
appear in a later chapter but happen earlier in story time.  Focus on
WHEN the event happened in the story world, not where it appears in the text.
"""


class TimelineAgent:
    """Batch-processing agent that infers temporal relations from events + EEPs."""

    def __init__(self, llm: Any = None, batch_size: int = 25) -> None:
        self._llm = llm
        self._batch_size = batch_size

    async def infer_temporal_relations(
        self,
        events: list[Event],
        eep_map: dict[str, Any],  # event_id → EventEvidenceProfile
        document_id: str,
        language: str = "en",
    ) -> list[TemporalRelation]:
        """Infer temporal relations between events.

        Uses EEP prior/subsequent_event_ids as candidate pairs when available,
        falling back to narrative_mode heuristics.
        """
        events_by_id = {e.id: e for e in events}
        candidate_pairs = self._collect_candidate_pairs(events, eep_map)

        if not candidate_pairs:
            logger.info("TimelineAgent: no candidate pairs for %s", document_id)
            return []

        logger.info(
            "TimelineAgent: %d candidate pairs for %s",
            len(candidate_pairs),
            document_id,
        )

        # Process in batches
        all_relations: list[TemporalRelation] = []
        for i in range(0, len(candidate_pairs), self._batch_size):
            batch = candidate_pairs[i : i + self._batch_size]
            batch_relations = await self._process_batch(
                batch, events_by_id, eep_map, document_id, language
            )
            all_relations.extend(batch_relations)

        logger.info(
            "TimelineAgent: inferred %d temporal relations for %s",
            len(all_relations),
            document_id,
        )
        return all_relations

    # ------------------------------------------------------------------
    # Candidate pair collection
    # ------------------------------------------------------------------

    def _collect_candidate_pairs(
        self,
        events: list[Event],
        eep_map: dict[str, Any],
    ) -> list[tuple[str, str]]:
        """Collect candidate (source, target) pairs from EEP or fallback."""
        seen: set[tuple[str, str]] = set()
        pairs: list[tuple[str, str]] = []
        event_ids = {e.id for e in events}

        # Primary: EEP-driven candidates
        for event_id, eep in eep_map.items():
            prior_ids = getattr(eep, "prior_event_ids", []) or []
            subsequent_ids = getattr(eep, "subsequent_event_ids", []) or []
            for pid in prior_ids:
                if pid in event_ids:
                    pair = (pid, event_id)  # prior → current
                    if pair not in seen:
                        seen.add(pair)
                        pairs.append(pair)
            for sid in subsequent_ids:
                if sid in event_ids:
                    pair = (event_id, sid)  # current → subsequent
                    if pair not in seen:
                        seen.add(pair)
                        pairs.append(pair)

        # Fallback: narrative_mode heuristics when no EEP
        if not pairs:
            pairs = self._fallback_narrative_mode_pairs(events)

        # Cap at 200 pairs to control cost
        if len(pairs) > 200:
            logger.warning(
                "TimelineAgent: capping %d candidate pairs to 200", len(pairs)
            )
            pairs = pairs[:200]

        return pairs

    @staticmethod
    def _fallback_narrative_mode_pairs(events: list[Event]) -> list[tuple[str, str]]:
        """Build basic pairs from flashback/flashforward events.

        For flashback events: pair with "present" events in adjacent chapters.
        For flashforward events: pair with "present" events in adjacent chapters.
        """
        from domain.events import NarrativeMode  # noqa: PLC0415

        present_events = [e for e in events if e.narrative_mode == NarrativeMode.PRESENT]
        temporal_events = [
            e
            for e in events
            if e.narrative_mode in (NarrativeMode.FLASHBACK, NarrativeMode.FLASHFORWARD)
        ]

        if not present_events or not temporal_events:
            return []

        pairs: list[tuple[str, str]] = []
        for te in temporal_events:
            # Find nearest present-timeline event by chapter
            nearest = min(present_events, key=lambda pe: abs(pe.chapter - te.chapter))
            if te.narrative_mode == NarrativeMode.FLASHBACK:
                # Flashback happened before the present event
                pairs.append((te.id, nearest.id))
            else:
                # Flashforward happens after the present event
                pairs.append((nearest.id, te.id))
        return pairs

    # ------------------------------------------------------------------
    # Batch LLM processing
    # ------------------------------------------------------------------

    @retry(
        retry=retry_if_exception_type((ValueError, KeyError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=1, max=5),
    )
    async def _process_batch(
        self,
        pairs: list[tuple[str, str]],
        events_by_id: dict[str, Event],
        eep_map: dict[str, Any],
        document_id: str,
        language: str,
    ) -> list[TemporalRelation]:
        """Send a batch of candidate pairs to the LLM and parse results."""
        human_content = self._build_batch_prompt(pairs, events_by_id, eep_map, language)

        messages = [
            SystemMessage(content=_TEMPORAL_SYSTEM_PROMPT),
            HumanMessage(content=human_content),
        ]

        response = await self._llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)

        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, list):
            raise ValueError(f"Temporal relation extraction failed: {err}")

        relations: list[TemporalRelation] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            try:
                rtype = TemporalRelationType(item.get("type", "unknown"))
            except ValueError:
                rtype = TemporalRelationType.UNKNOWN
            relations.append(
                TemporalRelation(
                    document_id=document_id,
                    source_event_id=item.get("source", ""),
                    target_event_id=item.get("target", ""),
                    relation_type=rtype,
                    confidence=float(item.get("confidence", 0.5)),
                    evidence=item.get("evidence", ""),
                    derived_from_eep=bool(eep_map),
                )
            )
        return relations

    @staticmethod
    def _build_batch_prompt(
        pairs: list[tuple[str, str]],
        events_by_id: dict[str, Event],
        eep_map: dict[str, Any],
        language: str,
    ) -> str:
        """Build the human message content for a batch of pairs."""
        sections: list[str] = []
        if language != "en":
            sections.append(f"Please respond in {language}.\n")

        for i, (src_id, tgt_id) in enumerate(pairs, 1):
            src = events_by_id.get(src_id)
            tgt = events_by_id.get(tgt_id)
            if src is None or tgt is None:
                continue

            section = f"--- Pair {i} ---\n"
            section += f"Source event ({src_id}):\n"
            section += f"  Title: {src.title}\n"
            section += f"  Chapter: {src.chapter}\n"
            section += f"  Description: {src.description}\n"
            if src.narrative_mode.value != "unknown":
                section += f"  Narrative mode: {src.narrative_mode.value}\n"
            if src.story_time_hint:
                section += f"  Time hint: {src.story_time_hint}\n"

            section += f"Target event ({tgt_id}):\n"
            section += f"  Title: {tgt.title}\n"
            section += f"  Chapter: {tgt.chapter}\n"
            section += f"  Description: {tgt.description}\n"
            if tgt.narrative_mode.value != "unknown":
                section += f"  Narrative mode: {tgt.narrative_mode.value}\n"
            if tgt.story_time_hint:
                section += f"  Time hint: {tgt.story_time_hint}\n"

            # Add EEP context if available
            src_eep = eep_map.get(src_id)
            tgt_eep = eep_map.get(tgt_id)
            if src_eep and hasattr(src_eep, "state_after"):
                section += f"  Source state_after: {src_eep.state_after}\n"
            if tgt_eep and hasattr(tgt_eep, "state_before"):
                section += f"  Target state_before: {tgt_eep.state_before}\n"
            if tgt_eep and hasattr(tgt_eep, "causal_factors"):
                factors = getattr(tgt_eep, "causal_factors", [])
                if factors:
                    section += f"  Target causal factors: {', '.join(factors[:3])}\n"

            sections.append(section)

        return "\n".join(sections)
