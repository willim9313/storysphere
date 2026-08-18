"""Ingestion workflow — orchestrates the full ETL from file to populated KG.

Pipeline order:
    1. DocumentProcessingPipeline  → Document (chapters + paragraphs)
    2. SummarizationPipeline       → chapter summaries + book summary
    3. FeatureExtractionPipeline   → paragraph embeddings → Qdrant + keywords
    4. KnowledgeGraphPipeline      → entities + relations + events → KGService
    5. SymbolDiscoveryPipeline     → imagery / symbols
    6. DocumentService.save_document() → persist document to SQLite
    7. KGService.save()            → persist KG to disk

The workflow is split into two phases for LangGraph HITL chapter review:
  - run_phase1(): Parse → language detect → save document
  - run_phase2(doc_id): Summarization → KG → finalize

Both phases are driven by ``workflows/ingestion_graph.py``, which pauses
between them for chapter review. There is deliberately no single end-to-end
entry point: skipping the review pause is not a supported ingestion mode.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from storysphere.core.tracing import update_span as _lf_update_span
from storysphere.domain.documents import Chapter, Document, Paragraph, StepStatus
from storysphere.domain.timeline import TimelineConfig, TimelineDetectionResult
from storysphere.pipelines.document_processing import DocumentProcessingPipeline
from storysphere.pipelines.feature_extraction import FeatureExtractionPipeline
from storysphere.pipelines.feature_extraction.pipeline import FeatureExtractionResult
from storysphere.pipelines.knowledge_graph import KnowledgeGraphPipeline
from storysphere.pipelines.knowledge_graph.pipeline import KGExtractionResult
from storysphere.pipelines.summarization import SummarizationPipeline
from storysphere.pipelines.summarization.pipeline import SummarizationResult
from storysphere.pipelines.symbol_discovery import SymbolDiscoveryPipeline
from storysphere.pipelines.symbol_discovery.pipeline import SymbolDiscoveryResult
from storysphere.services.document_service import DocumentService
from storysphere.services.kg_service import KGService

logger = logging.getLogger(__name__)


class MurmurEmitter(Protocol):
    """Sink for the murmur tidbits the ingestion emits as it works.

    Deliberately takes plain fields rather than a model: the wire shape of a
    murmur event is an API concern, so the caller in the API layer builds it.
    """

    async def __call__(
        self,
        step_key: str,
        event_type: str,
        content: str,
        *,
        meta: dict | None = None,
        raw_content: str | None = None,
    ) -> None: ...

try:
    from langfuse import observe as _lf_observe
except ImportError:
    def _lf_observe(**_kw):  # type: ignore[misc]
        def _d(fn): return fn
        return _d


@dataclass(frozen=True)
class StepSpec:
    """How one analysis step maps onto the workflow's pipelines and status."""

    pipeline_attr: str
    #: Field on ``PipelineStatus`` this step reports into.
    status_field: str
    #: True when the pipeline writes its output onto the Document itself
    #: (chapter summaries, chapter keywords) rather than into the KG or the
    #: vector store — those need an explicit save or the LLM output is
    #: generated, charged for, and then dropped.
    mutates_document: bool


#: The analysis steps that run after chapter review, keyed by the step name the
#: rerun endpoint exposes. Single source of truth for both callers:
#: ``run_phase2`` runs all four in order, the rerun endpoint runs exactly one.
INGESTION_STEPS: dict[str, StepSpec] = {
    "summarization": StepSpec("_summarization_pipeline", "summarization", True),
    "feature-extraction": StepSpec("_feature_pipeline", "feature_extraction", True),
    "knowledge-graph": StepSpec("_kg_pipeline", "knowledge_graph", False),
    "symbol-discovery": StepSpec("_symbol_pipeline", "symbol_discovery", False),
}


@dataclass
class StepOutcome:
    """What running one step produced, and whether it failed."""

    step: str
    result: Any = None
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None


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


def _apply_paragraph_splits(doc: Document, splits: dict[str, list[int]]) -> None:
    """Split paragraphs of *doc* in place at reviewer-chosen char offsets.

    *splits* maps str(global_paragraph_index) — in the same flat order as
    _rebuild_chapters, *before* any split — to ascending char offsets within
    that paragraph's text. Must run before _apply_role_overrides and
    _rebuild_chapters, whose indices refer to the post-split flat order.

    Invalid entries (bad index, out-of-range/unsorted offsets, or offsets that
    would produce a whitespace-only piece) are ignored rather than failing the
    resume: the reviewer's other edits still apply.
    """
    if not splits:
        return

    def _valid_offsets(text: str, offsets: list[int]) -> list[int] | None:
        if offsets != sorted(set(offsets)):
            return None
        if any(not isinstance(o, int) or o <= 0 or o >= len(text) for o in offsets):
            return None
        bounds = [0, *offsets, len(text)]
        pieces = [text[a:b] for a, b in zip(bounds, bounds[1:], strict=False)]
        if any(not p.strip() for p in pieces):
            return None
        return offsets

    global_idx = 0
    for chapter in doc.chapters:
        new_paras: list[Paragraph] = []
        for para in chapter.paragraphs:
            offsets = splits.get(str(global_idx))
            global_idx += 1
            if offsets is not None:
                offsets = _valid_offsets(para.text, offsets)
            if offsets is None:
                new_paras.append(para)
                continue
            bounds = [0, *offsets, len(para.text)]
            for start, end in zip(bounds, bounds[1:], strict=False):
                span = para.title_span
                if span is not None and (span[0] < start or span[1] > end):
                    span = None  # title no longer fully inside this piece
                elif span is not None:
                    span = (span[0] - start, span[1] - start)
                new_paras.append(
                    Paragraph(
                        text=para.text[start:end],
                        chapter_number=para.chapter_number,
                        position=0,  # repaired below
                        role=para.role,
                        title_span=span,
                    )
                )
        for pos, para in enumerate(new_paras):
            para.position = pos
        chapter.paragraphs = new_paras


def _apply_role_overrides(doc: Document, role_overrides: dict[str, str]) -> None:
    """Mutate paragraph roles in *doc* according to user overrides.

    *role_overrides* maps str(global_paragraph_index) → ParagraphRole value.
    The global index follows the same flat order as _rebuild_chapters.
    """
    from storysphere.domain.documents import ParagraphRole  # noqa: PLC0415

    if not role_overrides:
        return
    all_paras = [p for ch in doc.chapters for p in ch.paragraphs]
    for idx_str, role_str in role_overrides.items():
        try:
            idx = int(idx_str)
            role = ParagraphRole(role_str)
        except (ValueError, KeyError):
            continue
        if 0 <= idx < len(all_paras):
            all_paras[idx].role = role


def _rebuild_chapters(doc: Document, reviewed: list[dict]) -> list[Chapter]:
    """Reconstruct Chapter objects from a reviewed chapter list.

    *reviewed* is the list of ``{"title": str, "role": str,
    "start_paragraph_index": int}`` dicts submitted via POST /review.
    Paragraphs are re-assigned to new chapters based on the
    ``start_paragraph_index`` boundaries.
    """
    from storysphere.domain.documents import (  # noqa: PLC0415
        ChapterRole,
        assign_chapter_numbers,
    )

    all_paras = [p for ch in doc.chapters for p in ch.paragraphs]
    new_chapters: list[Chapter] = []

    roles: list[ChapterRole] = []
    for rc in reviewed:
        try:
            roles.append(ChapterRole(rc.get("role", "body")))
        except ValueError:
            roles.append(ChapterRole.body)
    # Front/back matter must not consume story chapter numbers.
    numbers = assign_chapter_numbers(roles)

    for i, rc in enumerate(reviewed):
        ch_num = numbers[i]
        role = roles[i]
        title = rc.get("title") or None
        start = rc["start_paragraph_index"]
        end = reviewed[i + 1]["start_paragraph_index"] if i + 1 < len(reviewed) else len(all_paras)

        ch_paras = [
            p.model_copy(update={"chapter_number": ch_num, "position": pos})
            for pos, p in enumerate(all_paras[start:end])
        ]
        new_chapters.append(Chapter(number=ch_num, title=title, role=role, paragraphs=ch_paras))

    return new_chapters


class IngestionWorkflow:
    """Composition root for ingestion: owns the pipelines and services.

    Driven by ``workflows/ingestion_graph.py``, which calls the two phases
    around a chapter-review pause::

        workflow = IngestionWorkflow(kg_service=kg_service)
        doc = await workflow.run_phase1(Path("novel.pdf"))
        # ... reviewer edits the detected chapter structure ...
        result = await workflow.run_phase2(doc.id)
        print(result.entities)   # number of entities extracted
    """

    def _log_step(self, step: str, **kwargs: Any) -> None:
        extras = "  ".join(f"{k}={v}" for k, v in kwargs.items())
        logger.debug("[%s] %s  %s", self.__class__.__name__, step, extras)

    async def run_step(
        self,
        step: str,
        doc: Document,
        *,
        sub_cb: Callable | None = None,
        murmur_cb: Callable | None = None,
    ) -> StepOutcome:
        """Run one analysis step against *doc* and record how it went.

        Runs the step's pipeline, moves ``doc.pipeline_status`` to done or
        failed, persists that status, and — for steps whose output lands on the
        Document — saves the Document so partial output survives a later
        failure.

        Pipeline failures are returned in the outcome rather than raised: the
        steps are independent, and callers differ on whether to continue
        (``run_phase2``) or abort (the rerun endpoint). Persist failures are
        logged and swallowed — they must not turn a step that actually produced
        output into a failed one.

        ``KGService.save()`` is deliberately NOT called here. The two callers
        disagree on whether a failed KG save fails the step, so that policy
        stays where the disagreement is visible.

        Args:
            step: A key of ``INGESTION_STEPS``.
            doc: The Document to run against; mutated in place by the pipeline.

        Raises:
            KeyError: *step* is not a known step name.
        """
        spec = INGESTION_STEPS[step]
        pipeline = getattr(self, spec.pipeline_attr)
        outcome = StepOutcome(step=step)

        self._log_step(spec.status_field)
        try:
            outcome.result = await pipeline.run(doc, sub_cb=sub_cb, murmur_cb=murmur_cb)
            doc.pipeline_status.mark_done(spec.status_field)
        except Exception as exc:  # noqa: BLE001
            logger.error("Step '%s' failed: %s", step, exc)
            outcome.error = str(exc)
            setattr(doc.pipeline_status, spec.status_field, StepStatus.failed)

        await self._document_service.update_pipeline_status(doc.id, doc.pipeline_status)

        if spec.mutates_document:
            try:
                await self._document_service.save_document(doc)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Step '%s' persist failed (non-fatal): %s", step, exc)

        return outcome

    async def rerun_step(self, step: str, doc_id: str) -> StepOutcome:
        """Re-run one step against an already-ingested book.

        Builds on :meth:`run_step`, which owns the per-step contract shared with
        ingestion. What a rerun adds is the reaction to the outcome, and it
        differs from ingestion's on two points:

        - **A failed KG save fails the step.** Ingestion logs it and moves on,
          because the run has other steps to finish; a rerun was triggered
          precisely to get this step's output on disk, so reporting success
          with nothing persisted would defeat the point.
        - **Analyses derived from the step are invalidated, but only on
          success.** A failed rerun leaves the old data in place, so the old
          analyses still describe the book.

        Returns:
            The outcome of the step. A missing document is reported as a failed
            outcome rather than raised — the caller reports it the same way it
            reports any other failure.

        Raises:
            KeyError: *step* is not a key of ``INGESTION_STEPS``.
        """
        from storysphere.config.settings import get_settings  # noqa: PLC0415
        from storysphere.services.analysis_cache import AnalysisCache  # noqa: PLC0415
        from storysphere.services.cache_invalidation import (  # noqa: PLC0415
            invalidate_for_steps,
            teu_keys_for,
        )

        doc = await self._document_service.get_document(doc_id)
        if doc is None:
            return StepOutcome(step=step, error=f"Book '{doc_id}' not found")

        # TEU keys name the event ids this step is about to regenerate, so they
        # have to be collected while the current events still exist.
        teu_keys: list[str] = []
        if step == "feature-extraction":
            teu_keys = teu_keys_for(
                [e.id for e in await self._kg_service.get_events(document_id=doc_id)]
            )

        outcome = await self.run_step(step, doc)

        if outcome.ok and step == "knowledge-graph":
            try:
                await self._kg_service.save()
            except Exception as exc:  # noqa: BLE001
                logger.error("Rerun knowledge-graph save failed: %s", exc)
                outcome.error = str(exc)
                doc.pipeline_status.knowledge_graph = StepStatus.failed
                await self._document_service.update_pipeline_status(
                    doc_id, doc.pipeline_status
                )

        if not outcome.ok:
            return outcome

        await invalidate_for_steps(
            AnalysisCache(db_path=get_settings().analysis_cache_db_path),
            doc_id,
            [step],
            teu_keys,
        )
        return outcome

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
        """Build the workflow, defaulting every collaborator from settings.

        All parameters are injection points. Production callers
        (``ingestion_graph`` and the rerun endpoint) pass only ``kg_service``
        and ``document_service``; everything else is constructed here.

        Args:
            document_pipeline: Inject a custom ``DocumentProcessingPipeline``.
            feature_pipeline: Inject a custom ``FeatureExtractionPipeline``.
            kg_pipeline: Inject a custom ``KnowledgeGraphPipeline``.
            summarization_pipeline: Inject a custom ``SummarizationPipeline``.
            symbol_pipeline: Inject a custom ``SymbolDiscoveryPipeline``.
            document_service: Inject a ``DocumentService`` (SQLite storage).
            kg_service: Inject a ``KGService`` (NetworkX or Neo4j).

        The ``skip_*`` flags below are **test-only**: no production caller sets
        any of them, and ingestion has no user-facing "skip a step" mode. They
        exist so tests can build a workflow without standing up Qdrant, an LLM,
        or a KG backend. Do not reach for them to express a runtime decision —
        that belongs in settings or in the caller's step selection.

        Args:
            skip_qdrant: Skip Qdrant upsert (no vector store running).
            skip_kg: Skip KG extraction entirely.
            skip_summarization: Skip chapter/book summarization.
            skip_keywords: Build no keyword extractor.
            skip_symbols: Skip symbol discovery.
        """
        self._doc_pipeline = document_pipeline or DocumentProcessingPipeline()
        self._kg_service = kg_service or self._build_kg_service()
        self._document_service = document_service or DocumentService()

        # Feature pipeline: use VectorService singleton (skip if skip_qdrant=True)
        if feature_pipeline is not None:
            self._feature_pipeline = feature_pipeline
        else:
            from storysphere.services.vector_service import get_vector_service  # noqa: PLC0415

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

    async def run_phase1(
        self,
        file_path: Path,
        *,
        title: str | None = None,
        author: str | None = None,
        language: str | None = None,
        progress_cb: Callable | None = None,
        murmur_cb: MurmurEmitter | None = None,
    ) -> Document:
        """Phase 1: Parse file → detect language → save document.

        Returns the persisted Document. Raises on document persistence failure.
        """
        file_path = Path(file_path).resolve()

        def _progress(
            pct: int,
            stage: str,
            *,
            step_key: str | None = None,
            sub_progress: int | None = None,
            sub_total: int | None = None,
            sub_stage: str | None = None,
        ) -> None:
            if progress_cb is not None:
                progress_cb(pct, stage, step_key=step_key, sub_progress=sub_progress, sub_total=sub_total, sub_stage=sub_stage)

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
                await murmur_cb(
                    step_key,
                    event_type,
                    content[:1024],
                    meta=meta,
                    raw_content=raw_content[:4096] if raw_content else None,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("murmur emit failed (%s): %s", step_key, exc)

        # ── Ensure DB tables exist ─────────────────────────────────────────
        await self._document_service.init_db()

        # ── Step 1: document processing ───────────────────────────────────
        _progress(5, "文件解析", step_key="pdfParsing")
        self._log_step("doc_processing", file=str(file_path))
        doc: Document = await self._doc_pipeline(file_path)

        if title:
            doc.title = title
        if author:
            doc.author = author

        # ── Language detection ────────────────────────────────────────────
        from storysphere.core.language_detection import (  # noqa: PLC0415
            detect_language_from_document,
            refine_chinese_variant,
        )
        _progress(10, "語言偵測", step_key="languageDetect")
        doc.language = language or detect_language_from_document(doc)
        if doc.language == "zh":
            # Upload form submits the generic "zh"; LLM prompts need the
            # concrete variant (zh-tw / zh-cn) to keep output script stable.
            doc.language = refine_chinese_variant(doc)
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

        # ── Step 1b: persist document early (book enters library now) ─────
        _progress(15, "儲存文件", step_key="languageDetect")
        self._log_step("persist_document")
        try:
            await self._document_service.save_document(doc)
        except Exception as exc:  # noqa: BLE001
            logger.error("Document persistence failed: %s", exc)
            raise

        return doc

    @_lf_observe(name="ingest.phase2", as_type="agent", capture_input=False, capture_output=False)
    async def run_phase2(
        self,
        doc_id: str,
        *,
        progress_cb: Callable | None = None,
        murmur_cb: MurmurEmitter | None = None,
    ) -> IngestionResult:
        """Phase 2: Summarization → feature extraction → KG → symbols → finalize.

        Loads the document from DB using *doc_id*. Expects Phase 1 (and optional
        chapter review) to have already completed.
        """
        doc = await self._document_service.get_document(doc_id)
        if doc is None:
            raise ValueError(f"Document '{doc_id}' not found — Phase 1 may not have completed")

        _lf_update_span(metadata={
            "doc_id": doc_id,
            "title": doc.title,
            "language": doc.language,
            "chapters": doc.total_chapters,
            "paragraphs": doc.total_paragraphs,
        })

        errors: list[str] = []

        def _progress(
            pct: int,
            stage: str,
            *,
            step_key: str | None = None,
            sub_progress: int | None = None,
            sub_total: int | None = None,
            sub_stage: str | None = None,
        ) -> None:
            if progress_cb is not None:
                progress_cb(pct, stage, step_key=step_key, sub_progress=sub_progress, sub_total=sub_total, sub_stage=sub_stage)

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
                await murmur_cb(
                    step_key,
                    event_type,
                    content[:1024],
                    meta=meta,
                    raw_content=raw_content[:4096] if raw_content else None,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("murmur emit failed (%s): %s", step_key, exc)

        _progress(20, "開始分析", step_key="summarization")

        # ── Step 2: summarization ─────────────────────────────────────────
        _progress(25, "章節摘要", step_key="summarization")
        def _step_sub_cb(pct: int, stage: str, step_key: str, default_label: str):
            """Build the per-step progress callback the pipelines expect."""
            return lambda cur, tot, label=default_label: _progress(
                pct, stage, step_key=step_key,
                sub_progress=cur, sub_total=tot, sub_stage=label,
            )

        summ_result = SummarizationResult(document_id=doc.id)
        if not self._skip_summarization:
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

            outcome = await self.run_step(
                "summarization", doc,
                sub_cb=_step_sub_cb(25, "章節摘要", "summarization", "章節摘要"),
                murmur_cb=_summ_murmur_cb,
            )
            if outcome.ok:
                summ_result = outcome.result
                if (
                    summ_result.chapters_total > 0
                    and summ_result.chapters_summarized < summ_result.chapters_total
                ):
                    skipped = summ_result.chapters_total - summ_result.chapters_summarized
                    errors.append(
                        f"summarization: {skipped}/{summ_result.chapters_total} chapters skipped"
                    )
            else:
                errors.append(f"summarization: {outcome.error}")

        # ── Step 3: feature extraction (embeddings) ───────────────────────
        _progress(45, "特徵擷取", step_key="featureExtraction")
        outcome = await self.run_step(
            "feature-extraction", doc,
            sub_cb=_step_sub_cb(45, "特徵擷取", "featureExtraction", "章節特徵"),
            murmur_cb=_murmur,
        )
        if outcome.ok:
            feat_result = outcome.result
        else:
            errors.append(f"feature_extraction: {outcome.error}")
            feat_result = FeatureExtractionResult(document_id=doc.id, paragraphs_embedded=0)

        # ── Step 4: knowledge graph extraction ───────────────────────────
        _progress(65, "知識圖譜擷取", step_key="knowledgeGraph")
        kg_result: KGExtractionResult = KGExtractionResult()
        if not self._skip_kg:
            outcome = await self.run_step(
                "knowledge-graph", doc,
                sub_cb=_step_sub_cb(65, "知識圖譜擷取", "knowledgeGraph", ""),
                murmur_cb=_murmur,
            )
            if outcome.ok:
                kg_result = outcome.result
                # Non-fatal here: extraction already succeeded, and the KG is
                # rebuildable — a persist error must not discard that work.
                try:
                    await self._kg_service.save()
                except Exception as exc:  # noqa: BLE001
                    logger.warning("KG save failed (non-fatal): %s", exc)
            else:
                errors.append(f"kg_extraction: {outcome.error}")

        # ── Step 4b: symbol discovery ─────────────────────────────────────
        _progress(82, "符號探索", step_key="symbolExploration")
        symbol_result = SymbolDiscoveryResult(book_id=doc.id)
        if not self._skip_symbols:
            outcome = await self.run_step(
                "symbol-discovery", doc,
                sub_cb=_step_sub_cb(82, "符號探索", "symbolExploration", "章節符號"),
                murmur_cb=_murmur,
            )
            if outcome.ok:
                symbol_result = outcome.result
            else:
                errors.append(f"symbol_discovery: {outcome.error}")

        # ── Step 4c: timeline detection ───────────────────────────────────
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
            try:
                await self._document_service.save_document(doc)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Timeline config persist failed (non-fatal): %s", exc)

        # ── Finalisation: cache invalidation + result assembly ────────────
        _progress(92, "資料儲存", step_key="dataStorage")

        # Invalidate per-document analysis caches so stale results are not
        # served. A full run redoes every step, so everything derived from the
        # book goes — see services/cache_invalidation.py for the mapping.
        # teu: keys are unreachable here: they carry an event id and no book
        # id, and the events they name have already been regenerated by this
        # point, so entries from the previous run are left orphaned.
        from storysphere.config.settings import get_settings  # noqa: PLC0415
        from storysphere.services.analysis_cache import AnalysisCache  # noqa: PLC0415
        from storysphere.services.cache_invalidation import (  # noqa: PLC0415
            ALL_STEPS,
            invalidate_for_steps,
        )
        await invalidate_for_steps(
            AnalysisCache(db_path=get_settings().analysis_cache_db_path),
            doc.id,
            ALL_STEPS,
        )

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
            from storysphere.config.settings import get_settings  # noqa: PLC0415

            settings = get_settings()
            if settings.kg_mode == "neo4j":
                from storysphere.services.kg_service_neo4j import Neo4jKGService  # noqa: PLC0415

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
            from storysphere.config.settings import get_settings  # noqa: PLC0415
            from storysphere.services.keyword_service import (  # noqa: PLC0415
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
