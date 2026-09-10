"""ConceptInferenceService — B-092 inferred thematic concept review flow.

Sits between ``ConceptInferencePipeline`` (which asks the LLM) and
``ConceptInferenceStore`` (which holds the answers until a human rules on
them).  Mirrors ``LinkPredictionService``'s run / confirm / reject shape, for
the same reason the two stores match: the review flow is the same flow.

The pipeline is deliberately run with ``save=False`` here.  Its own ``save=True``
path writes straight to the knowledge graph, and anything in the graph is handed
to the next TEU assembly as established fact — which is exactly what the review
gate exists to prevent.
"""

from __future__ import annotations

import logging

from storysphere.domain.entities import Entity, EntityType
from storysphere.domain.inferred_concepts import InferenceStatus, InferredConcept
from storysphere.pipelines.concept_inference import (
    ConceptInferenceInput,
    ConceptInferencePipeline,
)
from storysphere.services.concept_inference_store import ConceptInferenceStore
from storysphere.services.kg_service import KGService

logger = logging.getLogger(__name__)


class ConceptInferenceService:
    def __init__(
        self,
        kg_service: KGService,
        store: ConceptInferenceStore,
        pipeline: ConceptInferencePipeline,
    ) -> None:
        self._kg = kg_service
        self._store = store
        self._pipeline = pipeline

    # ── Public API ────────────────────────────────────────────────────────────

    async def run_inference(
        self,
        document_id: str,
        language: str = "en",
    ) -> list[InferredConcept]:
        """Infer concepts for a book and file them for review.

        Returns:
            Every PENDING candidate for the book afterwards — not just this
            run's, since a re-run that proposes nothing new should still show
            the reader what is already waiting.
        """
        entities = await self._pipeline.run(
            ConceptInferenceInput(
                document_id=document_id,
                language=language,
                save=False,
            )
        )

        for entity in entities:
            await self._store.upsert(self._to_candidate(document_id, entity))

        logger.info(
            "ConceptInference: %d proposition(s) filed for review, document=%s",
            len(entities),
            document_id,
        )
        return await self._store.list_by_document(
            document_id, status=InferenceStatus.PENDING
        )

    async def list_concepts(
        self,
        document_id: str,
        status: InferenceStatus | None = None,
    ) -> list[InferredConcept]:
        return await self._store.list_by_document(document_id, status)

    async def get_concept(self, concept_id: str) -> InferredConcept | None:
        return await self._store.get(concept_id)

    async def confirm(self, concept_id: str) -> Entity | None:
        """Adopt a proposition: write it to the KG as a Concept entity.

        Returns None when the id is unknown.  Confirming something already
        confirmed returns the existing entity rather than writing a second copy
        — the KG has no de-duplication of its own, and a double-click would
        otherwise leave two nodes saying the same thing.
        """
        candidate = await self._store.get(concept_id)
        if candidate is None:
            return None

        if candidate.status is InferenceStatus.CONFIRMED and candidate.confirmed_entity_id:
            return await self._kg.get_entity(candidate.confirmed_entity_id)

        entity = Entity(
            name=candidate.name,
            entity_type=EntityType.CONCEPT,
            description=candidate.description,
            document_id=candidate.document_id,
            extraction_method="inferred",
            inferred_by=candidate.inferred_by,
            confidence=candidate.confidence,
            attributes={"evidence": candidate.evidence},
        )
        await self._kg.add_entity(entity)
        await self._kg.save()
        await self._store.update_status(
            concept_id, InferenceStatus.CONFIRMED, confirmed_entity_id=entity.id
        )
        logger.info("Confirmed inferred concept %s → Entity %s", concept_id, entity.id)
        return entity

    async def reject(self, concept_id: str) -> None:
        await self._store.update_status(concept_id, InferenceStatus.REJECTED)

    # ── Private ───────────────────────────────────────────────────────────────

    @staticmethod
    def _to_candidate(document_id: str, entity: Entity) -> InferredConcept:
        """Convert the pipeline's KG-shaped output into a review candidate."""
        evidence = entity.attributes.get("evidence", [])
        if not isinstance(evidence, list):
            evidence = []
        return InferredConcept(
            document_id=document_id,
            name=entity.name,
            description=entity.description or "",
            evidence=[str(e) for e in evidence],
            confidence=entity.confidence if entity.confidence is not None else 0.5,
            inferred_by=entity.inferred_by or "",
        )
