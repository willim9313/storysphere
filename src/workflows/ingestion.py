"""Ingestion workflow — orchestrates the full ETL from file to populated KG.

Pipeline order:
    1. DocumentProcessingPipeline  → Document (chapters + paragraphs)
    2. FeatureExtractionPipeline   → paragraph embeddings → Qdrant
    3. KnowledgeGraphPipeline      → entities + relations + events → KGService
    4. DocumentService.save_document() → persist document to SQLite

The workflow accepts a file path (PDF or DOCX) and returns an
``IngestionResult`` summarising what was produced.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from domain.documents import Document
from pipelines.document_processing import DocumentProcessingPipeline
from pipelines.feature_extraction import FeatureExtractionPipeline
from pipelines.feature_extraction.pipeline import FeatureExtractionResult
from pipelines.knowledge_graph import KnowledgeGraphPipeline
from pipelines.knowledge_graph.pipeline import KGExtractionResult
from services.document_service import DocumentService
from services.kg_service import KGService
from workflows.base import BaseWorkflow

logger = logging.getLogger(__name__)


@dataclass
class IngestionResult:
    """Summary of a completed ingestion run."""

    document_id: str
    document_title: str
    chapters: int = 0
    paragraphs: int = 0
    paragraphs_embedded: int = 0
    entities: int = 0
    relations: int = 0
    events: int = 0
    errors: list[str] = field(default_factory=list)

    @property
    def success(self) -> bool:
        return len(self.errors) == 0


class IngestionWorkflow(BaseWorkflow[Path, IngestionResult]):
    """End-to-end novel ingestion workflow.

    Usage::

        workflow = IngestionWorkflow()
        result = await workflow.run(Path("novel.pdf"))
        print(result.entities)   # number of entities extracted
    """

    def __init__(
        self,
        document_pipeline: Optional[DocumentProcessingPipeline] = None,
        feature_pipeline: Optional[FeatureExtractionPipeline] = None,
        kg_pipeline: Optional[KnowledgeGraphPipeline] = None,
        document_service: Optional[DocumentService] = None,
        kg_service: Optional[KGService] = None,
        *,
        skip_qdrant: bool = False,
        skip_kg: bool = False,
    ) -> None:
        """
        Args:
            document_pipeline: Inject a custom ``DocumentProcessingPipeline``.
            feature_pipeline: Inject a custom ``FeatureExtractionPipeline``.
            kg_pipeline: Inject a custom ``KnowledgeGraphPipeline``.
            document_service: Inject a ``DocumentService`` (SQLite storage).
            kg_service: Inject a ``KGService`` (NetworkX KG).
            skip_qdrant: Set True to skip Qdrant upsert (e.g. no Qdrant running).
            skip_kg: Set True to skip KG extraction (text-only ingestion).
        """
        self._doc_pipeline = document_pipeline or DocumentProcessingPipeline()
        self._kg_service = kg_service or KGService()
        self._document_service = document_service or DocumentService()

        # Feature pipeline: skip qdrant client if skip_qdrant=True
        if feature_pipeline is not None:
            self._feature_pipeline = feature_pipeline
        else:
            qdrant_client = None if skip_qdrant else self._build_qdrant_client()
            self._feature_pipeline = FeatureExtractionPipeline(qdrant_client=qdrant_client)

        # KG pipeline: pass kg_service so it writes directly
        if kg_pipeline is not None:
            self._kg_pipeline = kg_pipeline
        else:
            self._kg_pipeline = KnowledgeGraphPipeline(
                kg_service=None if skip_kg else self._kg_service
            )

        self._skip_kg = skip_kg

    async def run(self, input_data: Path) -> IngestionResult:
        """Ingest a novel file end-to-end.

        Args:
            input_data: Path to the PDF or DOCX file.

        Returns:
            ``IngestionResult`` summarising the ingestion.
        """
        file_path = Path(input_data).resolve()
        errors: list[str] = []

        # ── Ensure DB tables exist ───────────────────────────────────────────
        await self._document_service.init_db()

        # ── Step 1: document processing ──────────────────────────────────────
        self._log_step("doc_processing", file=str(file_path))
        doc: Document = await self._doc_pipeline(file_path)
        logger.info(
            "IngestionWorkflow: doc '%s' — %d chapters, %d paragraphs",
            doc.title,
            doc.total_chapters,
            doc.total_paragraphs,
        )

        # ── Step 2: feature extraction (embeddings) ──────────────────────────
        self._log_step("feature_extraction")
        feat_result: FeatureExtractionResult
        try:
            feat_result = await self._feature_pipeline(doc)
        except Exception as exc:  # noqa: BLE001
            logger.error("Feature extraction failed: %s", exc)
            errors.append(f"feature_extraction: {exc}")
            feat_result = FeatureExtractionResult(
                document_id=doc.id, paragraphs_embedded=0
            )

        # ── Step 3: knowledge graph extraction ──────────────────────────────
        kg_result: KGExtractionResult = KGExtractionResult()
        if not self._skip_kg:
            self._log_step("kg_extraction")
            try:
                kg_result = await self._kg_pipeline(doc)
            except Exception as exc:  # noqa: BLE001
                logger.error("KG extraction failed: %s", exc)
                errors.append(f"kg_extraction: {exc}")

        # ── Step 4: persist document to SQLite ───────────────────────────────
        self._log_step("persist_document")
        try:
            await self._document_service.save_document(doc)
        except Exception as exc:  # noqa: BLE001
            logger.error("Document persistence failed: %s", exc)
            errors.append(f"document_persist: {exc}")

        # ── Step 5: persist KG to disk ───────────────────────────────────────
        if not self._skip_kg and not errors:
            try:
                await self._kg_service.save()
            except Exception as exc:  # noqa: BLE001
                logger.warning("KG save failed (non-fatal): %s", exc)

        result = IngestionResult(
            document_id=doc.id,
            document_title=doc.title,
            chapters=doc.total_chapters,
            paragraphs=doc.total_paragraphs,
            paragraphs_embedded=feat_result.paragraphs_embedded,
            entities=len(kg_result.entities),
            relations=len(kg_result.relations),
            events=len(kg_result.events),
            errors=errors,
        )
        logger.info(
            "IngestionWorkflow done: %s  entities=%d  relations=%d  events=%d  errors=%d",
            doc.title,
            result.entities,
            result.relations,
            result.events,
            len(errors),
        )
        return result

    # ── private helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _build_qdrant_client():
        """Try to build a Qdrant client; return None if Qdrant is unavailable."""
        try:
            from config.settings import get_settings  # noqa: PLC0415
            from qdrant_client import QdrantClient  # noqa: PLC0415
            from qdrant_client.models import Distance, VectorParams  # noqa: PLC0415

            settings = get_settings()
            client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)
            # Ensure collection exists
            existing = [c.name for c in client.get_collections().collections]
            if settings.qdrant_collection not in existing:
                client.create_collection(
                    collection_name=settings.qdrant_collection,
                    vectors_config=VectorParams(
                        size=settings.qdrant_vector_size,
                        distance=Distance.COSINE,
                    ),
                )
                logger.info(
                    "Created Qdrant collection '%s'", settings.qdrant_collection
                )
            return client
        except Exception as exc:  # noqa: BLE001
            logger.warning("Qdrant unavailable (%s) — embeddings will not be stored", exc)
            return None
