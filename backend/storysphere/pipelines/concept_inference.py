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
import math
from dataclasses import dataclass
from typing import TYPE_CHECKING

from storysphere.core.language_detection import localize_prompt
from storysphere.core.llm_call import call_llm, llm_retry
from storysphere.core.utils.output_extractor import extract_json_from_text
from storysphere.domain.documents import extract_body_text
from storysphere.domain.entities import Entity, EntityType
from storysphere.pipelines.base import BasePipeline

if TYPE_CHECKING:
    from storysphere.services.document_service import DocumentService
    from storysphere.services.kg_service import KGService

logger = logging.getLogger(__name__)

# Versioned tag so downstream components know who produced these nodes.
INFERRED_BY_TAG = "tension_pre_analysis_v1"

#: How much passage text one inference call may carry.  Kept at the original
#: value — what changed is *which* text fills it, see ``_gather_passages``.
PASSAGE_CHAR_BUDGET = 12_000

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
        passage_texts = await self._gather_passages(document_id, chapter_numbers)

        if not passage_texts:
            logger.warning(
                "ConceptInferencePipeline: no passage texts found for document=%s",
                document_id,
            )
            return []

        # 3. Call LLM
        self._log_step("infer_concepts", passages=len(passage_texts))
        concepts = await self._infer_concepts(passage_texts, language, document_id)

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
            from storysphere.core.llm_client import get_llm_client  # noqa: PLC0415

            self._llm = get_llm_client().get_with_local_fallback(temperature=0.3)
        return self._llm

    async def _gather_passages(
        self,
        document_id: str,
        chapter_numbers: list[int],
    ) -> list[str]:
        """Return body passages from *chapter_numbers*, within the char budget.

        The budget used to be applied by front-truncating the joined text, which
        on a long book threw away the whole back half — 《大唐雙龍傳》 collected
        39,998 characters and sent the first 12,000, so every proposition was
        inferred from the opening third (B-092).  Sampling at a stride instead
        keeps the same budget but spreads it over the entire span of candidate
        chapters, and never cuts a paragraph mid-sentence.
        """
        bodies: list[str] = []
        for ch in chapter_numbers:
            paragraphs = await self._doc_service.get_paragraphs(
                document_id, chapter_number=ch
            )
            bodies.extend(
                body for body in (extract_body_text(p) for p in paragraphs) if body
            )

        total = sum(len(b) for b in bodies)
        if total <= PASSAGE_CHAR_BUDGET:
            return bodies

        # Pass 1 samples at a stride so every stretch of the book is
        # represented; pass 2 then spends whatever uneven paragraph lengths
        # left on the table.  Overlong paragraphs are skipped rather than
        # breaking the loop, so one wall of text cannot cost us later chapters.
        step = math.ceil(total / PASSAGE_CHAR_BUDGET)
        chosen = [False] * len(bodies)
        spent = 0
        for i in range(0, len(bodies), step):
            if spent + len(bodies[i]) <= PASSAGE_CHAR_BUDGET:
                chosen[i] = True
                spent += len(bodies[i])
        for i, body in enumerate(bodies):
            if chosen[i] or spent + len(body) > PASSAGE_CHAR_BUDGET:
                continue
            chosen[i] = True
            spent += len(body)

        kept = [b for b, keep in zip(bodies, chosen, strict=True) if keep]
        if not kept:
            # Every paragraph is longer than the whole budget on its own.
            kept = [bodies[0][:PASSAGE_CHAR_BUDGET]]
            spent = PASSAGE_CHAR_BUDGET

        self._log_step(
            "gather_passages",
            chapters=len(chapter_numbers),
            collected=len(bodies),
            sent=len(kept),
            chars=spent,
        )
        return kept

    @llm_retry(ValueError)
    async def _infer_concepts(
        self,
        passage_texts: list[str],
        language: str,
        document_id: str,
    ) -> list[Entity]:
        combined = "\n\n---\n\n".join(passage_texts)

        system_prompt = localize_prompt(_SYSTEM_PROMPT, language)
        llm = self._get_llm()
        raw = await call_llm(
            llm,
            system=system_prompt,
            human=f"Passages:\n\n{combined}",
            service="analysis",
            book_id=document_id,
        )

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
                    # Without this the only consumer never sees them: TEU
                    # assembly loads concepts with
                    # ``list_entities(..., document_id=document_id)``.
                    document_id=document_id,
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

