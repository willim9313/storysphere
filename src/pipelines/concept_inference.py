"""ConceptInferencePipeline — B-025 Pre-Analysis Step.

Identifies hidden thematic propositions (Inferred Concept nodes) from
emotionally charged passages. These concepts serve as raw material for
TEU (Tension Evidence Unit) assembly in B-026.

Usage (lazy, triggered when tension analysis is requested):

    pipeline = ConceptInferencePipeline(kg_service=kg, doc_service=doc)
    concepts = await pipeline.run(
        ConceptInferenceInput(document_id=book_id)
    )
    for concept in concepts:
        await kg_service.add_entity(concept)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from core.token_callback import set_llm_service_context
from core.utils.output_extractor import extract_json_from_text
from domain.entities import Entity, EntityType
from pipelines.base import BasePipeline

if TYPE_CHECKING:
    from services.document_service import DocumentService
    from services.kg_service import KGService

logger = logging.getLogger(__name__)

# Versioned tag so downstream components know who produced these nodes.
INFERRED_BY_TAG = "tension_pre_analysis_v1"

_SYSTEM_PROMPT = """\
You are a literary analysis assistant specialising in thematic interpretation.

You will be given a set of emotionally charged passages from a novel. Your task
is to identify the HIDDEN THEMATIC PROPOSITIONS implied by these passages — that
is, abstract concepts or claims about the human condition that the author seems
to be exploring, even if never stated explicitly.

Examples of valid propositions:
  - "power corrupts even well-intentioned people"
  - "grief isolates rather than unites survivors"
  - "loyalty demands complicity in wrongdoing"

Rules:
  - Each proposition must be a short, falsifiable claim (not a vague noun like "love").
  - Do NOT repeat surface concepts already named in the text (those are extracted by NER).
  - Limit yourself to 3-6 propositions per call.
  - Each proposition MUST be supported by at least one passage.

Return ONLY a JSON array. Each element must have:
  - "name"        (str)    The proposition as a short declarative sentence.
  - "description" (str)    1-2 sentences explaining how the passages support it.
  - "confidence"  (float)  0.0–1.0. How strongly the passages imply this concept.
  - "evidence"    (list[str])  1-3 short quotations or paraphrases from the passages.
"""


@dataclass
class ConceptInferenceInput:
    """Input for the concept inference pipeline."""

    document_id: str
    language: str = "en"
    save: bool = True


class ConceptInferencePipeline(BasePipeline[ConceptInferenceInput, list[Entity]]):
    """Infer hidden thematic Concept nodes from high-tension passages.

    Args:
        llm: Optional pre-built LLM client (injected for testing).
        kg_service: KGService instance (read events, optionally write concepts).
        doc_service: DocumentService instance (read paragraphs).
        intensity_threshold: Minimum emotional_intensity to include an event's
            passages. Defaults to 0.6.
    """

    def __init__(
        self,
        llm=None,
        kg_service: KGService | None = None,
        doc_service: DocumentService | None = None,
        intensity_threshold: float = 0.6,
    ) -> None:
        self._llm = llm
        self._kg_service = kg_service
        self._doc_service = doc_service
        self.intensity_threshold = intensity_threshold

    # ── Public API ────────────────────────────────────────────────────────────

    async def run(self, input_data: ConceptInferenceInput) -> list[Entity]:
        """Run the inference pipeline for one book.

        Args:
            input_data: ``ConceptInferenceInput`` with document_id, language,
                and save flag.

        Returns:
            List of inferred Entity objects (entity_type=CONCEPT,
            extraction_method="inferred").
        """
        document_id = input_data.document_id
        language = input_data.language
        save = input_data.save

        # 1. Collect high-tension events
        self._log_step("load_events", document_id=document_id)
        events = await self._kg_service.get_events(document_id=document_id)
        candidate_events = [
            e for e in events
            if e.tension_signal != "none"
            and e.emotional_intensity is not None
            and e.emotional_intensity >= self.intensity_threshold
        ]

        if not candidate_events:
            logger.info(
                "ConceptInferencePipeline: no qualifying events for document=%s "
                "(threshold=%.2f)",
                document_id,
                self.intensity_threshold,
            )
            return []

        # 2. Gather passage texts (one fetch per chapter, de-duplicated)
        chapter_numbers = sorted({e.chapter for e in candidate_events})
        passage_texts: list[str] = []
        for ch in chapter_numbers:
            paragraphs = await self._doc_service.get_paragraphs(document_id, chapter_number=ch)
            passage_texts.extend(p.content for p in paragraphs if p.content)

        if not passage_texts:
            logger.warning(
                "ConceptInferencePipeline: no passage texts found for document=%s",
                document_id,
            )
            return []

        # 3. Call LLM
        self._log_step("infer_concepts", passages=len(passage_texts))
        concepts = await self._infer_concepts(passage_texts, language)

        # 4. Optionally persist
        if save:
            for concept in concepts:
                await self._kg_service.add_entity(concept)
            logger.info(
                "ConceptInferencePipeline: saved %d inferred concepts for document=%s",
                len(concepts),
                document_id,
            )

        return concepts

    # ── Private ───────────────────────────────────────────────────────────────

    def _get_llm(self):
        if self._llm is None:
            from core.llm_client import get_llm_client  # noqa: PLC0415

            self._llm = get_llm_client().get_with_local_fallback(temperature=0.3)
        return self._llm

    @retry(
        retry=retry_if_exception_type(ValueError),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _infer_concepts(
        self,
        passage_texts: list[str],
        language: str,
    ) -> list[Entity]:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        # Truncate to avoid exceeding context window
        combined = "\n\n---\n\n".join(passage_texts)
        if len(combined) > 12_000:
            combined = combined[:12_000] + "\n\n[passages truncated]"

        system_prompt = self._localize_prompt(_SYSTEM_PROMPT, language)
        llm = self._get_llm()
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Passages:\n\n{combined}"),
        ]
        set_llm_service_context("analysis")
        response = await llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)

        parsed, err = extract_json_from_text(raw)
        if err or not isinstance(parsed, list):
            raise ValueError(f"ConceptInference: LLM response parse failed: {err!r}")

        entities: list[Entity] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            name = item.get("name", "").strip()
            if not name:
                continue
            try:
                confidence = max(0.0, min(1.0, float(item.get("confidence", 0.5))))
            except (TypeError, ValueError):
                confidence = 0.5

            description = item.get("description", "")
            evidence = item.get("evidence", [])

            entities.append(
                Entity(
                    name=name,
                    entity_type=EntityType.CONCEPT,
                    description=description,
                    extraction_method="inferred",
                    inferred_by=INFERRED_BY_TAG,
                    confidence=confidence,
                    attributes={"evidence": evidence},
                )
            )

        logger.debug(
            "ConceptInferencePipeline: LLM returned %d concepts", len(entities)
        )
        return entities

    @staticmethod
    def _localize_prompt(prompt: str, language: str) -> str:
        if language.lower().startswith("zh"):
            return prompt + "\n\nRespond with propositions in Traditional Chinese."
        if language.lower().startswith("ja"):
            return prompt + "\n\nRespond with propositions in Japanese."
        return prompt
