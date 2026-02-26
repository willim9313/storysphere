"""Feature extraction pipeline: Document paragraphs → embeddings → Qdrant."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from domain.documents import Document, Paragraph
from pipelines.base import BasePipeline

from .embedding_generator import EmbeddingGenerator

logger = logging.getLogger(__name__)


@dataclass
class FeatureExtractionResult:
    """Output of the feature extraction pipeline."""

    document_id: str
    paragraphs_embedded: int = 0
    qdrant_ids: list[str] = field(default_factory=list)


class FeatureExtractionPipeline(BasePipeline[Document, FeatureExtractionResult]):
    """Embed all paragraphs in a Document and upsert them into Qdrant.

    Steps:
        1. Collect all paragraphs across chapters.
        2. Batch-embed using ``EmbeddingGenerator``.
        3. Mutate ``Paragraph.embedding`` in-place (so the Document is updated).
        4. Upsert into Qdrant (if a client is available).
    """

    def __init__(
        self,
        embedding_generator: EmbeddingGenerator | None = None,
        qdrant_client=None,  # type: ignore[assignment]
    ) -> None:
        self._embedder = embedding_generator or EmbeddingGenerator()
        self._qdrant = qdrant_client  # optional; pass None to skip Qdrant upsert

    async def run(self, input_data: Document) -> FeatureExtractionResult:
        """Embed paragraphs and (optionally) store in Qdrant.

        Args:
            input_data: A ``Document`` populated by ``DocumentProcessingPipeline``.

        Returns:
            ``FeatureExtractionResult`` with counts and Qdrant IDs.
        """
        doc = input_data
        all_paragraphs: list[Paragraph] = [
            para for chapter in doc.chapters for para in chapter.paragraphs
        ]

        if not all_paragraphs:
            logger.warning("Document '%s' has no paragraphs — skipping embedding", doc.id)
            return FeatureExtractionResult(document_id=doc.id)

        texts = [p.text for p in all_paragraphs]
        self._log_step("embed_start", paragraphs=len(texts))

        vectors = await self._embedder.aembed_texts(texts)

        # Mutate paragraph objects in-place
        for para, vector in zip(all_paragraphs, vectors):
            para.embedding = vector

        self._log_step("embed_done", vectors=len(vectors))

        qdrant_ids: list[str] = []
        if self._qdrant is not None:
            qdrant_ids = await self._upsert_to_qdrant(doc, all_paragraphs, vectors)

        return FeatureExtractionResult(
            document_id=doc.id,
            paragraphs_embedded=len(all_paragraphs),
            qdrant_ids=qdrant_ids,
        )

    # ── Qdrant helpers ───────────────────────────────────────────────────────

    async def _upsert_to_qdrant(
        self,
        doc: Document,
        paragraphs: list[Paragraph],
        vectors: list[list[float]],
    ) -> list[str]:
        """Upsert paragraph vectors into Qdrant and return point IDs."""
        from config.settings import get_settings  # noqa: PLC0415
        from qdrant_client.models import PointStruct  # noqa: PLC0415

        settings = get_settings()
        collection = settings.qdrant_collection

        points = [
            PointStruct(
                id=para.id,
                vector=vec,
                payload={
                    "document_id": doc.id,
                    "document_title": doc.title,
                    "chapter_number": para.chapter_number,
                    "position": para.position,
                    "text": para.text,
                },
            )
            for para, vec in zip(paragraphs, vectors)
        ]

        self._qdrant.upsert(collection_name=collection, points=points)
        logger.info("Upserted %d points into Qdrant collection '%s'", len(points), collection)
        return [p.id for p in points]
