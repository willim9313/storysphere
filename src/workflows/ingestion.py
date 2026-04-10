"""Ingestion workflow — orchestrates the full ETL from file to populated KG.

Pipeline order:
    1. DocumentProcessingPipeline  → Document (chapters + paragraphs)
    2. SummarizationPipeline       → chapter summaries + book summary
    3. FeatureExtractionPipeline   → paragraph embeddings → Qdrant + keywords
    4. KnowledgeGraphPipeline      → entities + relations + events → KGService
    5. SymbolDiscoveryPipeline     → imagery / symbols
    6. DocumentService.save_document() → persist document to SQLite
    7. KGService.save()            → persist KG to disk

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
from pipelines.summarization import SummarizationPipeline
from pipelines.summarization.pipeline import SummarizationResult
from pipelines.symbol_discovery import SymbolDiscoveryPipeline
from pipelines.symbol_discovery.pipeline import SymbolDiscoveryResult
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
    keywords_extracted: int = 0
    chapters_summarized: int = 0
    book_summary_generated: bool = False
    language: str = "en"
    entities: int = 0
    relations: int = 0
    events: int = 0
    imagery_extracted: int = 0
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
        summarization_pipeline: Optional[SummarizationPipeline] = None,
        document_service: Optional[DocumentService] = None,
        kg_service: Optional[KGService] = None,
        symbol_pipeline: Optional[SymbolDiscoveryPipeline] = None,
        *,
        skip_qdrant: bool = False,
        skip_kg: bool = False,
        skip_summarization: bool = False,
        skip_keywords: bool = False,
        skip_symbols: bool = False,
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
        self._kg_service = kg_service or self._build_kg_service()
        self._document_service = document_service or DocumentService()

        # Feature pipeline: skip qdrant client if skip_qdrant=True
        if feature_pipeline is not None:
            self._feature_pipeline = feature_pipeline
        else:
            qdrant_client = None if skip_qdrant else self._build_qdrant_client()
            kw_extractor, kw_aggregator = self._build_keyword_components(skip_keywords)
            self._feature_pipeline = FeatureExtractionPipeline(
                qdrant_client=qdrant_client,
                keyword_extractor=kw_extractor,
                keyword_aggregator=kw_aggregator,
            )

        # KG pipeline: pass kg_service so it writes directly
        if kg_pipeline is not None:
            self._kg_pipeline = kg_pipeline
        else:
            self._kg_pipeline = KnowledgeGraphPipeline(
                kg_service=None if skip_kg else self._kg_service
            )

        self._summarization_pipeline = summarization_pipeline or SummarizationPipeline()
        self._symbol_pipeline = symbol_pipeline or SymbolDiscoveryPipeline()
        self._skip_kg = skip_kg
        self._skip_summarization = skip_summarization
        self._skip_keywords = skip_keywords
        self._skip_symbols = skip_symbols

    async def run(
        self,
        input_data: Path,
        *,
        title: str | None = None,
        author: str | None = None,
        language: str | None = None,
        progress_cb: Optional[callable] = None,
    ) -> IngestionResult:
        """Ingest a novel file end-to-end.

        Args:
            input_data: Path to the PDF or DOCX file.
            title: Optional book title override.  When provided this is used
                   instead of the value extracted from file metadata.
            author: Optional author override.  When provided this is used
                    instead of the value extracted from file metadata.
            progress_cb: Optional callback ``(progress: int, stage: str) -> None``
                called between pipeline steps so callers (e.g. the API
                background task) can push progress updates.

        Returns:
            ``IngestionResult`` summarising the ingestion.
        """
        file_path = Path(input_data).resolve()
        errors: list[str] = []

        def _progress(pct: int, stage: str, *, sub_progress: int | None = None, sub_total: int | None = None) -> None:
            if progress_cb is not None:
                progress_cb(pct, stage, sub_progress=sub_progress, sub_total=sub_total)

        # ── Ensure DB tables exist ───────────────────────────────────────────
        await self._document_service.init_db()

        # ── Step 1: document processing ──────────────────────────────────────
        _progress(5, "Document processing")
        self._log_step("doc_processing", file=str(file_path))
        doc: Document = await self._doc_pipeline(file_path)

        # Caller-supplied values take precedence over file metadata
        if title:
            doc.title = title
        if author:
            doc.author = author

        # ── Language detection ────────────────────────────────────────────
        from core.language_detection import detect_language_from_document  # noqa: PLC0415
        _progress(10, "Language detection")
        doc.language = language or detect_language_from_document(doc)
        logger.info(
            "IngestionWorkflow: doc '%s' — %d chapters, %d paragraphs, lang=%s",
            doc.title,
            doc.total_chapters,
            doc.total_paragraphs,
            doc.language,
        )

        # ── Step 1b: summarization ───────────────────────────────────────────
        _progress(20, "Summary generation")
        summ_result = SummarizationResult(document_id=doc.id)
        if not self._skip_summarization:
            self._log_step("summarization")
            try:
                summ_result = await self._summarization_pipeline.run(
                    doc,
                    sub_cb=lambda cur, tot: _progress(20, "Summary generation", sub_progress=cur, sub_total=tot),
                )
            except Exception as exc:  # noqa: BLE001
                logger.error("Summarization failed: %s", exc)
                errors.append(f"summarization: {exc}")

        # ── Step 2: feature extraction (embeddings) ──────────────────────────
        _progress(40, "Feature extraction")
        self._log_step("feature_extraction")
        feat_result: FeatureExtractionResult
        try:
            feat_result = await self._feature_pipeline.run(
                doc,
                sub_cb=lambda cur, tot: _progress(40, "Feature extraction", sub_progress=cur, sub_total=tot),
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Feature extraction failed: %s", exc)
            errors.append(f"feature_extraction: {exc}")
            feat_result = FeatureExtractionResult(
                document_id=doc.id, paragraphs_embedded=0
            )

        # ── Step 3: knowledge graph extraction ──────────────────────────────
        _progress(60, "Knowledge graph extraction")
        kg_result: KGExtractionResult = KGExtractionResult()
        if not self._skip_kg:
            self._log_step("kg_extraction")
            try:
                kg_result = await self._kg_pipeline.run(
                    doc,
                    sub_cb=lambda cur, tot: _progress(60, "Knowledge graph extraction", sub_progress=cur, sub_total=tot),
                )
            except Exception as exc:  # noqa: BLE001
                logger.error("KG extraction failed: %s", exc)
                errors.append(f"kg_extraction: {exc}")

        # ── Step 3b: symbol discovery ─────────────────────────────────────────
        _progress(80, "Symbol discovery")
        symbol_result = SymbolDiscoveryResult(book_id=doc.id)
        if not self._skip_symbols:
            self._log_step("symbol_discovery")
            try:
                symbol_result = await self._symbol_pipeline.run(
                    doc,
                    sub_cb=lambda cur, tot: _progress(80, "Symbol discovery", sub_progress=cur, sub_total=tot),
                )
            except Exception as exc:  # noqa: BLE001
                logger.error("Symbol discovery failed (non-fatal): %s", exc)
                errors.append(f"symbol_discovery: {exc}")

        # ── Step 4: persist document to SQLite ───────────────────────────────
        _progress(90, "Persisting document")
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
            keywords_extracted=feat_result.keywords_extracted,
            chapters_summarized=summ_result.chapters_summarized,
            book_summary_generated=summ_result.book_summary_generated,
            language=doc.language,
            entities=len(kg_result.entities),
            relations=len(kg_result.relations),
            events=len(kg_result.events),
            imagery_extracted=symbol_result.imagery_count,
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
    def _build_kg_service() -> KGService:
        """Build a KGService based on ``settings.kg_mode``.

        Returns a ``Neo4jKGService`` when ``kg_mode='neo4j'``, falling back to
        the default ``KGService`` (NetworkX) if Neo4j is unavailable or
        misconfigured.
        """
        try:
            from config.settings import get_settings  # noqa: PLC0415

            settings = get_settings()
            if settings.kg_mode == "neo4j":
                from services.kg_service_neo4j import Neo4jKGService  # noqa: PLC0415

                logger.info("IngestionWorkflow: using Neo4j KG backend (%s)", settings.neo4j_url)
                return Neo4jKGService(
                    url=settings.neo4j_url,
                    user=settings.neo4j_user,
                    password=settings.neo4j_password,
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Failed to build Neo4j KG service (%s) — falling back to NetworkX", exc
            )
        return KGService()

    @staticmethod
    def _build_keyword_components(skip: bool = False):
        """Build keyword extractor and aggregator from settings.

        Returns:
            Tuple of (extractor, aggregator), both None if skip=True.
        """
        if skip:
            return None, None
        try:
            from config.settings import get_settings  # noqa: PLC0415
            from services.keyword_service import (  # noqa: PLC0415
                KeywordAggregator,
                build_keyword_extractor,
            )

            settings = get_settings()
            extractor = build_keyword_extractor(settings.keyword_extractor_type)
            if extractor is None:
                return None, None
            aggregator = KeywordAggregator(strategy=settings.keyword_aggregation_strategy)
            return extractor, aggregator
        except Exception as exc:  # noqa: BLE001
            logger.warning("Keyword extraction setup failed (%s) — keywords will be skipped", exc)
            return None, None

    @staticmethod
    def _build_qdrant_client():
        """Try to build a Qdrant client; return None if Qdrant is unavailable.

        Per-book collection creation is handled by
        ``FeatureExtractionPipeline._upsert_to_qdrant``.
        """
        try:
            from config.settings import get_settings  # noqa: PLC0415
            from qdrant_client import QdrantClient  # noqa: PLC0415

            settings = get_settings()
            client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)
            return client
        except Exception as exc:  # noqa: BLE001
            logger.warning("Qdrant unavailable (%s) — embeddings will not be stored", exc)
            return None
