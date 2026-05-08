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

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path

from api.schemas.common import MurmurEvent
from domain.documents import Chapter, Document, StepStatus
from domain.timeline import TimelineConfig, TimelineDetectionResult
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
    timeline_detection: TimelineDetectionResult | None = None

    @property
    def success(self) -> bool:
        return len(self.errors) == 0


def _rebuild_chapters(doc: Document, reviewed: list[dict]) -> list[Chapter]:
    """Reconstruct Chapter objects from a reviewed chapter list.

    *reviewed* is the list of ``{"title": str, "startParagraphIndex": int}``
    dicts submitted via POST /review.  Paragraphs are re-assigned to new
    chapters based on the ``startParagraphIndex`` boundaries.
    """
    all_paras = [p for ch in doc.chapters for p in ch.paragraphs]
    new_chapters: list[Chapter] = []

    for i, rc in enumerate(reviewed):
        ch_num = i + 1
        title = rc.get("title") or None
        start = rc["startParagraphIndex"]
        end = reviewed[i + 1]["startParagraphIndex"] if i + 1 < len(reviewed) else len(all_paras)

        ch_paras = [
            p.model_copy(update={"chapter_number": ch_num, "position": pos})
            for pos, p in enumerate(all_paras[start:end])
        ]
        new_chapters.append(Chapter(number=ch_num, title=title, paragraphs=ch_paras))

    return new_chapters


class IngestionWorkflow(BaseWorkflow[Path, IngestionResult]):
    """End-to-end novel ingestion workflow.

    Usage::

        workflow = IngestionWorkflow()
        result = await workflow.run(Path("novel.pdf"))
        print(result.entities)   # number of entities extracted
    """

    def __init__(
        self,
        document_pipeline: DocumentProcessingPipeline | None = None,
        feature_pipeline: FeatureExtractionPipeline | None = None,
        kg_pipeline: KnowledgeGraphPipeline | None = None,
        summarization_pipeline: SummarizationPipeline | None = None,
        document_service: DocumentService | None = None,
        kg_service: KGService | None = None,
        symbol_pipeline: SymbolDiscoveryPipeline | None = None,
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

        # Feature pipeline: use VectorService singleton (skip if skip_qdrant=True)
        if feature_pipeline is not None:
            self._feature_pipeline = feature_pipeline
        else:
            from services.vector_service import get_vector_service  # noqa: PLC0415

            vector_svc = None if skip_qdrant else get_vector_service()
            kw_extractor, kw_aggregator = self._build_keyword_components(skip_keywords)
            self._feature_pipeline = FeatureExtractionPipeline(
                vector_service=vector_svc,
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
        task_id: str | None = None,
        title: str | None = None,
        author: str | None = None,
        language: str | None = None,
        progress_cb: Callable | None = None,
        murmur_cb: Callable[[MurmurEvent], Awaitable[None]] | None = None,
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

        def _progress(
            pct: int,
            stage: str,
            *,
            sub_progress: int | None = None,
            sub_total: int | None = None,
            sub_stage: str | None = None,
        ) -> None:
            if progress_cb is not None:
                progress_cb(pct, stage, sub_progress=sub_progress, sub_total=sub_total, sub_stage=sub_stage)

        async def _murmur(
            step_key: str,
            event_type: str,
            content: str,
            *,
            meta: dict | None = None,
            raw_content: str | None = None,
        ) -> None:
            if murmur_cb is None:
                return
            try:
                truncated = content[:1024]
                raw_truncated = raw_content[:4096] if raw_content else None
                event = MurmurEvent(
                    seq=0,  # seq assigned by store
                    step_key=step_key,
                    type=event_type,
                    content=truncated,
                    meta=meta,
                    raw_content=raw_truncated,
                )
                await murmur_cb(event)
            except Exception as exc:  # noqa: BLE001
                logger.warning("murmur emit failed (%s): %s", step_key, exc)

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
        await _murmur(
            "pdfParsing", "topic",
            f"偵測到 {doc.total_paragraphs} 個段落，{doc.total_chapters} 章，{doc.language}",
            meta={"chapters": doc.total_chapters, "paragraphs": doc.total_paragraphs, "language": doc.language},
        )
        logger.info(
            "IngestionWorkflow: doc '%s' — %d chapters, %d paragraphs, lang=%s",
            doc.title,
            doc.total_chapters,
            doc.total_paragraphs,
            doc.language,
        )

        # ── Step 1b: persist document early (book enters library now) ────────
        _progress(15, "Persisting document")
        self._log_step("persist_document")
        try:
            await self._document_service.save_document(doc)
        except Exception as exc:  # noqa: BLE001
            logger.error("Document persistence failed: %s", exc)
            errors.append(f"document_persist: {exc}")
            # If we can't persist the base document, abort — no point enriching
            return IngestionResult(
                document_id=doc.id,
                document_title=doc.title,
                chapters=doc.total_chapters,
                paragraphs=doc.total_paragraphs,
                language=doc.language,
                errors=errors,
            )

        # ── Step 1c: pause for chapter review ────────────────────────────────
        if task_id:
            from api.review_registry import register  # noqa: PLC0415
            from api.review_registry import wait as registry_wait
            from api.store import task_store  # noqa: PLC0415

            _progress(18, "章節審閱")
            task_store.set_awaiting_review(task_id)
            register(doc.id)
            reviewed_chapters = await registry_wait(doc.id)
            if reviewed_chapters is not None:
                doc.chapters = _rebuild_chapters(doc, reviewed_chapters)
                await self._document_service.replace_chapters(doc)
                logger.info(
                    "Chapter review applied: %d chapters", len(doc.chapters)
                )
            task_store.set_running(task_id)
            _progress(20, "開始分析")

        # ── Step 2: summarization ────────────────────────────────────────────
        _progress(25, "Summary generation")
        summ_result = SummarizationResult(document_id=doc.id)
        if not self._skip_summarization:
            self._log_step("summarization")
            try:
                async def _summ_murmur_cb(chapter_number: int) -> None:
                    chapter = next((c for c in doc.chapters if c.number == chapter_number), None)
                    if chapter and chapter.summary:
                        sentences = [s.strip() for s in chapter.summary.split("。") if s.strip()]
                        preview = "。".join(sentences[:2]) + ("。" if sentences else "")
                        await _murmur(
                            "summarization", "topic",
                            preview or chapter.summary,
                            meta={"chapter": chapter_number},
                        )

                summ_result = await self._summarization_pipeline.run(
                    doc,
                    sub_cb=lambda cur, tot, label="章節摘要": _progress(
                        25, "Summary generation",
                        sub_progress=cur, sub_total=tot, sub_stage=label,
                    ),
                    murmur_cb=_summ_murmur_cb,
                )
                doc.pipeline_status.summarization = StepStatus.done
            except Exception as exc:  # noqa: BLE001
                logger.error("Summarization failed: %s", exc)
                errors.append(f"summarization: {exc}")
                doc.pipeline_status.summarization = StepStatus.failed
            await self._document_service.update_pipeline_status(doc.id, doc.pipeline_status)

        # ── Step 3: feature extraction (embeddings) ──────────────────────────
        _progress(45, "Feature extraction")
        self._log_step("feature_extraction")
        feat_result: FeatureExtractionResult
        try:
            feat_result = await self._feature_pipeline.run(
                doc,
                sub_cb=lambda cur, tot, label="章節特徵": _progress(
                    45, "Feature extraction",
                    sub_progress=cur, sub_total=tot, sub_stage=label,
                ),
            )
            doc.pipeline_status.feature_extraction = StepStatus.done
        except Exception as exc:  # noqa: BLE001
            logger.error("Feature extraction failed: %s", exc)
            errors.append(f"feature_extraction: {exc}")
            feat_result = FeatureExtractionResult(
                document_id=doc.id, paragraphs_embedded=0
            )
            doc.pipeline_status.feature_extraction = StepStatus.failed
        await self._document_service.update_pipeline_status(doc.id, doc.pipeline_status)

        # ── Step 4: knowledge graph extraction ──────────────────────────────
        _progress(65, "Knowledge graph extraction")
        kg_result: KGExtractionResult = KGExtractionResult()
        if not self._skip_kg:
            self._log_step("kg_extraction")
            try:
                kg_result = await self._kg_pipeline.run(
                    doc,
                    sub_cb=lambda cur, tot, label="": _progress(
                        65, "Knowledge graph extraction",
                        sub_progress=cur, sub_total=tot, sub_stage=label,
                    ),
                    murmur_cb=_murmur,
                )
                doc.pipeline_status.knowledge_graph = StepStatus.done
            except Exception as exc:  # noqa: BLE001
                logger.error("KG extraction failed: %s", exc)
                errors.append(f"kg_extraction: {exc}")
                doc.pipeline_status.knowledge_graph = StepStatus.failed
            await self._document_service.update_pipeline_status(doc.id, doc.pipeline_status)

        # ── Step 4b: symbol discovery ─────────────────────────────────────────
        _progress(82, "Symbol discovery")
        symbol_result = SymbolDiscoveryResult(book_id=doc.id)
        if not self._skip_symbols:
            self._log_step("symbol_discovery")
            try:
                symbol_result = await self._symbol_pipeline.run(
                    doc,
                    sub_cb=lambda cur, tot, label="章節符號": _progress(
                        82, "Symbol discovery",
                        sub_progress=cur, sub_total=tot, sub_stage=label,
                    ),
                    murmur_cb=_murmur,
                )
                doc.pipeline_status.symbol_discovery = StepStatus.done
            except Exception as exc:  # noqa: BLE001
                logger.error("Symbol discovery failed (non-fatal): %s", exc)
                errors.append(f"symbol_discovery: {exc}")
                doc.pipeline_status.symbol_discovery = StepStatus.failed
            await self._document_service.update_pipeline_status(doc.id, doc.pipeline_status)

        # ── Step 4c: timeline detection ──────────────────────────────────────
        timeline_detection: TimelineDetectionResult | None = None
        if not self._skip_kg and kg_result.events:
            distinct_chapters = {e.chapter for e in kg_result.events if e.chapter and e.chapter > 0}
            ranked_count = sum(1 for e in kg_result.events if e.chronological_rank is not None)
            chapter_count = len(distinct_chapters)
            timeline_detection = TimelineDetectionResult(
                book_id=doc.id,
                chapter_count=chapter_count,
                event_count=len(kg_result.events),
                ranked_event_count=ranked_count,
                chapter_mode_viable=chapter_count > 1,
                story_mode_viable=ranked_count > 0,
            )
            doc.timeline_config = TimelineConfig(
                total_chapters=chapter_count,
                total_events=len(kg_result.events),
                total_ranked_events=ranked_count,
                chapter_mode_configured=False,
                story_mode_configured=False,
            )
            logger.info(
                "Timeline detection: chapters=%d events=%d ranked=%d",
                chapter_count,
                len(kg_result.events),
                ranked_count,
            )
            # Persist updated timeline_config
            try:
                await self._document_service.save_document(doc)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Timeline config persist failed (non-fatal): %s", exc)

        # ── Step 5: persist KG to disk ───────────────────────────────────────
        if not self._skip_kg and doc.pipeline_status.knowledge_graph == StepStatus.done:
            try:
                await self._kg_service.save()
            except Exception as exc:  # noqa: BLE001
                logger.warning("KG save failed (non-fatal): %s", exc)

        # Invalidate per-document analysis caches so stale results are not served
        try:
            from config.settings import get_settings  # noqa: PLC0415
            from services.analysis_cache import AnalysisCache  # noqa: PLC0415
            cache = AnalysisCache(db_path=get_settings().analysis_cache_db_path)
            await asyncio.gather(
                cache.invalidate(f"epistemic:{doc.id}:%"),
                cache.invalidate(f"voice_profile:{doc.id}:%"),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Analysis cache invalidation failed (non-fatal): %s", exc)

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
            timeline_detection=timeline_detection,
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

