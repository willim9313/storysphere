"""TimelineAgent — infer temporal relations between events via LLM.

Takes all events + available EEPs for a book, produces a list of
TemporalRelation objects.  NOT a LangGraph ReAct agent — simple
batch-processing orchestrator following the AnalysisAgent pattern.
"""

from __future__ import annotations

import logging
from itertools import groupby
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from core.utils.output_extractor import extract_json_from_text
from domain.events import Event, NarrativeMode
from domain.temporal import TemporalRelation, TemporalRelationType

logger = logging.getLogger(__name__)

_TEMPORAL_SYSTEM_PROMPT = """\
You are a literary timeline analyst.  Given pairs of narrative events
and their evidence, determine the temporal relationship between each
pair **in the story world** (not the order they appear in the text).

For each pair, return a JSON object with:
  - "source": the source event ID (given)
  - "target": the target event ID (given)
  - "type": one of "before", "simultaneous", "during",
            "causes", "unknown"
      * "before"       — source happens before target
      * "simultaneous" — both happen at the same story time
      * "during"       — source occurs within target's timespan
      * "causes"       — source directly causes target
      * "unknown"      — temporal relation is unclear
  - "confidence": float 0.0–1.0
  - "evidence": one sentence justifying your judgment

Return ONLY a JSON array of these objects.  Example:
[
  {"source": "evt-1", "target": "evt-2", "type": "before",
   "confidence": 0.9,
   "evidence": "The battle occurred before the coronation."}
]

Important: Consider flashbacks and flash-forwards.  A flashback
event may appear in a later chapter but happen earlier in story
time.  Focus on WHEN the event happened in the story world, not
where it appears in the text.
"""

_MAX_CANDIDATE_PAIRS = 200


class TimelineAgent:
    """Batch agent that infers temporal relations from events."""

    def __init__(
        self, llm: Any = None, batch_size: int = 25,
    ) -> None:
        self._llm = llm
        self._batch_size = batch_size

    async def infer_temporal_relations(
        self,
        events: list[Event],
        eep_map: dict[str, Any],
        document_id: str,
        language: str = "en",
    ) -> list[TemporalRelation]:
        """Infer temporal relations between events.

        Strategy:
        1. EEP-driven pairs (highest quality)
        2. Narrative-mode heuristics (flashback/flashforward)
        3. Sliding window over adjacent chapters (baseline)
        """
        events_by_id = {e.id: e for e in events}
        pairs = self._collect_candidate_pairs(events, eep_map)

        if not pairs:
            logger.info(
                "TimelineAgent: no candidate pairs for %s",
                document_id,
            )
            return []

        logger.info(
            "TimelineAgent: %d candidate pairs for %s",
            len(pairs), document_id,
        )

        all_relations: list[TemporalRelation] = []
        for i in range(
            0, len(pairs), self._batch_size,
        ):
            batch = pairs[i:i + self._batch_size]
            batch_rels = await self._process_batch(
                batch, events_by_id, eep_map,
                document_id, language,
            )
            all_relations.extend(batch_rels)

        logger.info(
            "TimelineAgent: inferred %d relations for %s",
            len(all_relations), document_id,
        )
        return all_relations

    # ----------------------------------------------------------
    # Candidate pair collection
    # ----------------------------------------------------------

    def _collect_candidate_pairs(
        self,
        events: list[Event],
        eep_map: dict[str, Any],
    ) -> list[tuple[str, str]]:
        """Collect (source, target) pairs for LLM evaluation."""
        seen: set[tuple[str, str]] = set()
        pairs: list[tuple[str, str]] = []
        event_ids = {e.id for e in events}

        # 1. EEP-driven candidates
        self._add_eep_pairs(
            eep_map, event_ids, seen, pairs,
        )

        # 2. Narrative-mode heuristics
        if not pairs:
            nm_pairs = self._narrative_mode_pairs(events)
            for p in nm_pairs:
                if p not in seen:
                    seen.add(p)
                    pairs.append(p)

        # 3. Sliding window (fills gaps for events with no EEP)
        sw_pairs = self._sliding_window_pairs(events, seen)
        pairs.extend(sw_pairs)

        if len(pairs) > _MAX_CANDIDATE_PAIRS:
            logger.warning(
                "Capping %d candidate pairs to %d",
                len(pairs), _MAX_CANDIDATE_PAIRS,
            )
            pairs = pairs[:_MAX_CANDIDATE_PAIRS]

        return pairs

    @staticmethod
    def _add_eep_pairs(
        eep_map: dict[str, Any],
        event_ids: set[str],
        seen: set[tuple[str, str]],
        pairs: list[tuple[str, str]],
    ) -> None:
        """Add candidate pairs from EEP prior/subsequent ids."""
        for event_id, eep in eep_map.items():
            prior = getattr(eep, "prior_event_ids", []) or []
            subseq = (
                getattr(eep, "subsequent_event_ids", []) or []
            )
            for pid in prior:
                if pid in event_ids:
                    pair = (pid, event_id)
                    if pair not in seen:
                        seen.add(pair)
                        pairs.append(pair)
            for sid in subseq:
                if sid in event_ids:
                    pair = (event_id, sid)
                    if pair not in seen:
                        seen.add(pair)
                        pairs.append(pair)

    @staticmethod
    def _narrative_mode_pairs(
        events: list[Event],
    ) -> list[tuple[str, str]]:
        """Pair flashback/flashforward events with nearest
        present-timeline events."""
        present = [
            e for e in events
            if e.narrative_mode == NarrativeMode.PRESENT
        ]
        temporal = [
            e for e in events
            if e.narrative_mode in (
                NarrativeMode.FLASHBACK,
                NarrativeMode.FLASHFORWARD,
            )
        ]

        if not present or not temporal:
            return []

        pairs: list[tuple[str, str]] = []
        for te in temporal:
            nearest = min(
                present,
                key=lambda pe, _te=te: abs(
                    pe.chapter - _te.chapter
                ),
            )
            if te.narrative_mode == NarrativeMode.FLASHBACK:
                pairs.append((te.id, nearest.id))
            else:
                pairs.append((nearest.id, te.id))
        return pairs

    @staticmethod
    def _sliding_window_pairs(
        events: list[Event],
        seen: set[tuple[str, str]],
    ) -> list[tuple[str, str]]:
        """Build pairs from consecutive events in adjacent
        chapters.

        For each pair of adjacent chapters, pair the last event
        of chapter N with the first event of chapter N+1.  Also
        pair consecutive events within the same chapter.
        """
        if len(events) < 2:
            return []

        sorted_evts = sorted(events, key=lambda e: e.chapter)
        pairs: list[tuple[str, str]] = []

        # Group by chapter
        by_chapter: list[tuple[int, list[Event]]] = []
        for ch, grp in groupby(sorted_evts, key=lambda e: e.chapter):
            by_chapter.append((ch, list(grp)))

        # Intra-chapter: consecutive pairs
        for _ch, ch_events in by_chapter:
            for i in range(len(ch_events) - 1):
                pair = (ch_events[i].id, ch_events[i + 1].id)
                if pair not in seen:
                    seen.add(pair)
                    pairs.append(pair)

        # Inter-chapter: last of ch N → first of ch N+1
        for i in range(len(by_chapter) - 1):
            last_evt = by_chapter[i][1][-1]
            first_evt = by_chapter[i + 1][1][0]
            pair = (last_evt.id, first_evt.id)
            if pair not in seen:
                seen.add(pair)
                pairs.append(pair)

        return pairs

    # ----------------------------------------------------------
    # Batch LLM processing
    # ----------------------------------------------------------

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
        """Send a batch of pairs to LLM and parse results."""
        human_content = self._build_batch_prompt(
            pairs, events_by_id, eep_map, language,
        )
        messages = [
            SystemMessage(content=_TEMPORAL_SYSTEM_PROMPT),
            HumanMessage(content=human_content),
        ]

        response = await self._llm.ainvoke(messages)
        raw = (
            response.content
            if hasattr(response, "content")
            else str(response)
        )

        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, list):
            raise ValueError(
                f"Temporal relation parse failed: {err}"
            )

        return self._parse_relations(
            parsed, document_id, eep_map,
        )

    @staticmethod
    def _parse_relations(
        parsed: list[Any],
        document_id: str,
        eep_map: dict[str, Any],
    ) -> list[TemporalRelation]:
        """Parse raw JSON items into TemporalRelation list."""
        relations: list[TemporalRelation] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            try:
                rtype = TemporalRelationType(
                    item.get("type", "unknown"),
                )
            except ValueError:
                rtype = TemporalRelationType.UNKNOWN
            relations.append(
                TemporalRelation(
                    document_id=document_id,
                    source_event_id=item.get("source", ""),
                    target_event_id=item.get("target", ""),
                    relation_type=rtype,
                    confidence=float(
                        item.get("confidence", 0.5),
                    ),
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
        """Build the human message for a batch of pairs."""
        sections: list[str] = []
        if language != "en":
            sections.append(
                f"Please respond in {language}.\n",
            )

        for i, (src_id, tgt_id) in enumerate(pairs, 1):
            src = events_by_id.get(src_id)
            tgt = events_by_id.get(tgt_id)
            if src is None or tgt is None:
                continue

            lines = [f"--- Pair {i} ---"]
            _add_event_lines(lines, "Source", src_id, src)
            _add_event_lines(lines, "Target", tgt_id, tgt)
            _add_eep_context(
                lines, src_id, tgt_id, eep_map,
            )
            sections.append("\n".join(lines))

        return "\n\n".join(sections)


# -- Module-level helpers (reduce method complexity) --


def _add_event_lines(
    lines: list[str],
    label: str,
    eid: str,
    event: Event,
) -> None:
    """Append formatted event info to lines."""
    lines.append(f"{label} event ({eid}):")
    lines.append(f"  Title: {event.title}")
    lines.append(f"  Chapter: {event.chapter}")
    lines.append(f"  Description: {event.description}")
    mode = event.narrative_mode.value
    if mode != "unknown":
        lines.append(f"  Narrative mode: {mode}")
    if event.story_time_hint:
        lines.append(
            f"  Time hint: {event.story_time_hint}",
        )


def _add_eep_context(
    lines: list[str],
    src_id: str,
    tgt_id: str,
    eep_map: dict[str, Any],
) -> None:
    """Append EEP evidence context to lines."""
    src_eep = eep_map.get(src_id)
    tgt_eep = eep_map.get(tgt_id)
    if src_eep and hasattr(src_eep, "state_after"):
        lines.append(
            f"  Source state_after: {src_eep.state_after}",
        )
    if tgt_eep and hasattr(tgt_eep, "state_before"):
        lines.append(
            f"  Target state_before: {tgt_eep.state_before}",
        )
    if tgt_eep and hasattr(tgt_eep, "causal_factors"):
        factors = getattr(tgt_eep, "causal_factors", [])
        if factors:
            joined = ", ".join(factors[:3])
            lines.append(
                f"  Target causal factors: {joined}",
            )
