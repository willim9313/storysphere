"""EpistemicStateService — computes what a character knows at a given chapter.

Answers: "Up to chapter N, what does character C know and not know?"

Core logic:
  - known   = events where C is a participant OR visibility == "public"
  - unknown = events where C is NOT a participant AND visibility != "public"
  - misbeliefs = LLM-inferred false beliefs caused by secret/deceptive events

Results are fully cached in AnalysisCache (SQLite) to avoid repeated LLM calls.
Cache key: epistemic:{document_id}:{character_id}:{up_to_chapter}
Cache invalidated on re-ingest via IngestionWorkflow.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from core.utils.output_extractor import extract_json_from_text
from domain.entities import Entity
from domain.epistemic_state import CharacterEpistemicState, MisbeliefItem
from domain.events import Event

logger = logging.getLogger(__name__)

_CLASSIFY_VISIBILITY_SYSTEM_PROMPT = """\
You are a literary analyst. For each event, classify its visibility:
- "public"  — naturally known to all relevant parties (public battle, official announcement,
              witnessed death, spread gossip, published news)
- "private" — only direct participants present know (closed meeting, private letter,
              personal conversation, small group secret)
- "secret"  — actively concealed from others (staged accident, deliberate lie,
              hidden alliance, covered-up crime, disguised identity)

Return ONLY a JSON array where each item is exactly:
  {"event_id": "<id>", "visibility": "public" | "private" | "secret"}
No explanation. Empty array [] if no events are provided.
"""

_MISBELIEFS_SYSTEM_PROMPT = """\
You are an omniscient literary analyst. Given what a character knows and what \
secretly happened without their knowledge, identify any false beliefs the character \
likely holds as a result of being deceived or misinformed.

Return ONLY a JSON array (empty if none) where each item has:
  - "character_belief" (str)  What the character falsely believes to be true.
  - "actual_truth"     (str)  What actually happened according to the story.
  - "source_event_id"  (str)  The ID of the secret event that caused the misbelief.
  - "confidence"       (float, 0.0–1.0)  How certain you are of this inference.

Only include misbeliefs where there is clear narrative evidence of deception or \
misinformation. Do not speculate beyond what the text implies.
"""


class EpistemicStateService:
    """Compute and cache character epistemic states."""

    def __init__(self, kg_service: Any = None, llm: Any = None, cache: Any = None) -> None:
        self._kg_service = kg_service
        self._llm = llm
        self._cache = cache

    def _get_kg_service(self) -> Any:
        if self._kg_service is None:
            from services.kg_service import KGService  # noqa: PLC0415
            self._kg_service = KGService()
        return self._kg_service

    def _get_llm(self) -> Any:
        if self._llm is None:
            from core.llm_client import get_llm_client  # noqa: PLC0415
            self._llm = get_llm_client().get_with_local_fallback(temperature=0.2)
        return self._llm

    def _get_cache(self) -> Any:
        if self._cache is None:
            from config.settings import get_settings  # noqa: PLC0415
            from services.analysis_cache import AnalysisCache  # noqa: PLC0415
            self._cache = AnalysisCache(db_path=get_settings().analysis_cache_db_path)
        return self._cache

    async def get_character_knowledge(
        self,
        character_id: str,
        document_id: str,
        up_to_chapter: int,
    ) -> CharacterEpistemicState:
        """Return what character knows and doesn't know up to a given chapter."""
        cache = self._get_cache()
        key = f"epistemic:{document_id}:{character_id}:{up_to_chapter}"

        cached = await cache.get(key)
        if cached:
            return _deserialize_state(cached)

        kg = self._get_kg_service()
        events, _, _ = await kg.get_snapshot(document_id, "chapter", up_to_chapter)
        character = await kg.get_entity(character_id)

        if character is None:
            raise ValueError(f"Entity '{character_id}' not found")

        if getattr(character, "document_id", None) and character.document_id != document_id:
            raise ValueError(
                f"Entity '{character_id}' belongs to document '{character.document_id}', "
                f"not '{document_id}'"
            )

        known = [
            e for e in events
            if character_id in e.participants or e.visibility == "public"
        ]
        unknown = [
            e for e in events
            if character_id not in e.participants and e.visibility != "public"
        ]

        misbeliefs = await self._infer_misbeliefs(character, known, unknown)

        result = CharacterEpistemicState(
            character_id=character_id,
            character_name=character.name,
            up_to_chapter=up_to_chapter,
            known_events=known,
            unknown_events=unknown,
            misbeliefs=misbeliefs,
        )

        await cache.set(key, _serialize_state(result))
        return result

    @retry(
        retry=retry_if_exception_type((ValueError, KeyError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    async def _infer_misbeliefs(
        self,
        character: Entity,
        known_events: list[Event],
        unknown_events: list[Event],
    ) -> list[MisbeliefItem]:
        secret_events = [e for e in unknown_events if e.visibility == "secret"]
        if not secret_events:
            return []

        known_summary = "\n".join(
            f"- [{e.id}] {e.title}: {e.description}" for e in known_events[:40]
        )
        secret_summary = "\n".join(
            f"- [{e.id}] {e.title}: {e.description}" for e in secret_events[:20]
        )

        user_prompt = (
            f"Character: {character.name}\n\n"
            f"Events this character knows about:\n{known_summary or '(none)'}\n\n"
            f"Secret events this character does NOT know about:\n{secret_summary}"
        )

        llm = self._get_llm()
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415
        messages = [
            SystemMessage(content=_MISBELIEFS_SYSTEM_PROMPT),
            HumanMessage(content=user_prompt),
        ]
        response = await llm.ainvoke(messages)
        raw_text = response.content if hasattr(response, "content") else str(response)

        parsed, err = extract_json_from_text(raw_text)
        if err or not isinstance(parsed, list):
            logger.warning("Misbeliefs LLM returned non-list; skipping. err=%s", err)
            return []

        results: list[MisbeliefItem] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            try:
                results.append(MisbeliefItem(
                    character_belief=str(item.get("character_belief", "")),
                    actual_truth=str(item.get("actual_truth", "")),
                    source_event_id=str(item.get("source_event_id", "")),
                    confidence=float(item.get("confidence", 0.5)),
                ))
            except Exception as exc:
                logger.debug("Skipping malformed misbelief item: %s", exc)

        return results


    # ── Visibility classification (temporary — may be replaced by re-ingest) ───

    _CLASSIFY_BATCH_SIZE = 15

    async def classify_event_visibility(
        self,
        document_id: str,
        progress_callback: Callable[[int, str], None] | None = None,
    ) -> dict[str, int]:
        """Retroactively classify visibility for all events in a document.

        Reads the existing KG, sends events to the LLM in batches for
        visibility classification, writes updates back to the KG JSON, and
        invalidates the epistemic state cache.

        Returns {"classified": int, "skipped": int}.
        """
        kg = self._get_kg_service()
        events = await kg.get_events(document_id=document_id)

        if not events:
            return {"classified": 0, "skipped": 0}

        classified = 0
        skipped = 0
        total = len(events)

        for start in range(0, total, self._CLASSIFY_BATCH_SIZE):
            batch = events[start : start + self._CLASSIFY_BATCH_SIZE]
            try:
                results = await self._classify_batch(batch)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Visibility classification batch failed: %s", exc)
                skipped += len(batch)
                continue

            id_to_visibility = {
                r["event_id"]: r["visibility"]
                for r in results
                if isinstance(r, dict) and r.get("visibility") in ("public", "private", "secret")
            }

            for event in batch:
                v = id_to_visibility.get(event.id)
                if v:
                    await kg.add_event(event.model_copy(update={"visibility": v}))
                    classified += 1
                else:
                    skipped += 1

            if progress_callback:
                pct = 5 + int((start + len(batch)) / total * 85)
                progress_callback(pct, f"分類事件 {start + len(batch)}/{total}")

        await kg.save()
        cache = self._get_cache()
        await cache.invalidate(f"epistemic:{document_id}:%")

        logger.info(
            "classify_event_visibility done: doc=%s classified=%d skipped=%d",
            document_id, classified, skipped,
        )
        return {"classified": classified, "skipped": skipped}

    @retry(
        retry=retry_if_exception_type((ValueError, KeyError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    async def _classify_batch(self, events: list[Event]) -> list[dict]:
        items = "\n".join(
            f"- id={e.id!r}  title={e.title!r}  desc={e.description[:120]!r}"
            for e in events
        )
        llm = self._get_llm()
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415
        messages = [
            SystemMessage(content=_CLASSIFY_VISIBILITY_SYSTEM_PROMPT),
            HumanMessage(content=f"Classify these events:\n{items}"),
        ]
        response = await llm.ainvoke(messages)
        raw_text = response.content if hasattr(response, "content") else str(response)
        parsed, err = extract_json_from_text(raw_text)
        if err or not isinstance(parsed, list):
            raise ValueError(f"LLM returned non-list for visibility batch: {err}")
        return parsed


# -- Serialization helpers ----------------------------------------------------

def _serialize_state(state: CharacterEpistemicState) -> dict:
    return state.model_dump()


def _deserialize_state(data: dict) -> CharacterEpistemicState:
    return CharacterEpistemicState.model_validate(data)
