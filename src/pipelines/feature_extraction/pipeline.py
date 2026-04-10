"""Feature extraction pipeline: Document paragraphs → embeddings + keywords → Qdrant.

Memory strategy
---------------
Embeddings are processed **chapter by chapter** so peak memory scales with the
largest chapter, not the entire book.

With Qdrant enabled (production path):
    embed chapter → upsert → vectors go out of scope (GC-able)
    Paragraph.embedding is NOT set — Qdrant is the source of truth.

Without Qdrant (dev / test path):
    embed chapter → store on Paragraph.embedding
    DocumentService will persist the embeddings to SQLite.

Peak memory for a 1 000-page novel:
    ≈ model (90 MB) + one chapter's vectors (~0.5 MB) instead of the full
    book's worth (~330 MB) that a flat all-at-once approach would require.
"""

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
    keywords_extracted: int = 0
    qdrant_ids: list[str] = field(default_factory=list)


class FeatureExtractionPipeline(BasePipeline[Document, FeatureExtractionResult]):
    """Embed all paragraphs in a Document and (optionally) upsert them into Qdrant.

    Processing is **chapter-by-chapter** to keep memory usage bounded regardless
    of book length.  See module docstring for the memory strategy.
    """

    def __init__(
        self,
        embedding_generator: EmbeddingGenerator | None = None,
        qdrant_client=None,  # type: ignore[assignment]
        keyword_extractor=None,
        keyword_aggregator=None,
    ) -> None:
        self._embedder = embedding_generator or EmbeddingGenerator()
        self._qdrant = qdrant_client  # optional; pass None to skip Qdrant upsert
        self._keyword_extractor = keyword_extractor  # BaseKeywordExtractor | None
        self._keyword_aggregator = keyword_aggregator  # KeywordAggregator | None

    async def run(self, input_data: Document, *, sub_cb=None) -> FeatureExtractionResult:
        """Embed paragraphs chapter by chapter and (optionally) store in Qdrant.

        Args:
            input_data: A ``Document`` populated by ``DocumentProcessingPipeline``.

        Returns:
            ``FeatureExtractionResult`` with counts and Qdrant IDs.
        """
        doc = input_data
        total_embedded = 0
        total_keywords = 0
        all_qdrant_ids: list[str] = []
        all_chapter_keywords: list[dict[str, float]] = []
        chapters_with_content = [ch for ch in doc.chapters if ch.paragraphs]
        total_chapters = len(chapters_with_content)
        chapters_done = 0

        for chapter in doc.chapters:
            paragraphs = chapter.paragraphs
            if not paragraphs:
                continue

            texts = [p.text for p in paragraphs]
            self._log_step("embed_chapter", chapter=chapter.number, paragraphs=len(texts))

            # vectors: list[list[float]] — one 384-dim vector per paragraph
            vectors = await self._embedder.aembed_texts(texts)

            # ── Keyword extraction (per paragraph) ─────────────────────────
            paragraph_keywords: list[dict[str, float]] = []
            if self._keyword_extractor is not None:
                from config.settings import get_settings  # noqa: PLC0415

                settings = get_settings()
                max_kw = settings.keyword_max_per_paragraph

                for para in paragraphs:
                    try:
                        kws = await self._keyword_extractor.extract(
                            para.text, max_kw, language=doc.language
                        )
                        para.keywords = kws
                        paragraph_keywords.append(kws)
                        total_keywords += 1
                    except Exception as exc:  # noqa: BLE001
                        logger.warning(
                            "Keyword extraction failed for para %s: %s", para.id, exc
                        )
                        paragraph_keywords.append({})

                # Aggregate paragraph → chapter keywords
                if paragraph_keywords and self._keyword_aggregator is not None:
                    chapter.keywords = self._keyword_aggregator.aggregate(
                        paragraph_keywords,
                        top_k=settings.keyword_max_per_chapter,
                    )
                    all_chapter_keywords.append(chapter.keywords)

            if self._qdrant is not None:
                # Qdrant path: write immediately, do NOT keep embedding in memory.
                # vectors will be GC-able once this iteration ends.
                ids = await self._upsert_to_qdrant(doc, paragraphs, vectors)
                all_qdrant_ids.extend(ids)
            else:
                # No-Qdrant path (dev / test): store on Paragraph so
                # DocumentService can persist them to SQLite.
                for para, vec in zip(paragraphs, vectors):
                    para.embedding = vec

            total_embedded += len(paragraphs)
            chapters_done += 1
            if sub_cb:
                sub_cb(chapters_done, total_chapters)
            # vectors goes out of scope here → eligible for GC

        # ── Aggregate chapter → book keywords ──────────────────────────────
        if all_chapter_keywords and self._keyword_aggregator is not None:
            from config.settings import get_settings  # noqa: PLC0415

            settings = get_settings()
            doc.keywords = self._keyword_aggregator.aggregate(
                all_chapter_keywords,
                top_k=settings.keyword_max_per_book,
            )

        if total_embedded > 0:
            qdrant_note = (
                f", {len(all_qdrant_ids)} upserted to Qdrant" if all_qdrant_ids else ""
            )
            kw_note = f", {total_keywords} paragraphs with keywords" if total_keywords else ""
            logger.info(
                "FeatureExtractionPipeline done: %d paragraphs embedded%s%s",
                total_embedded,
                qdrant_note,
                kw_note,
            )
        else:
            logger.warning("Document '%s' has no paragraphs — skipping embedding", doc.id)

        return FeatureExtractionResult(
            document_id=doc.id,
            paragraphs_embedded=total_embedded,
            keywords_extracted=total_keywords,
            qdrant_ids=all_qdrant_ids,
        )

    # ── Qdrant helpers ───────────────────────────────────────────────────────

    async def _upsert_to_qdrant(
        self,
        doc: Document,
        paragraphs: list[Paragraph],
        vectors: list[list[float]],
    ) -> list[str]:
        """Upsert a single chapter's vectors into Qdrant and return point IDs."""
        from config.settings import get_settings  # noqa: PLC0415
        from qdrant_client.models import Distance, PointStruct, VectorParams  # noqa: PLC0415

        from services.vector_service import title_slug  # noqa: PLC0415

        settings = get_settings()
        collection = (
            f"{settings.qdrant_collection_prefix}_{title_slug(doc.title)}"
        )

        # Ensure per-book collection exists (cached after first check)
        if not getattr(self, "_qdrant_collection_created", False):
            existing = [c.name for c in self._qdrant.get_collections().collections]
            if collection not in existing:
                self._qdrant.create_collection(
                    collection_name=collection,
                    vectors_config=VectorParams(
                        size=settings.qdrant_vector_size,
                        distance=Distance.COSINE,
                    ),
                )
                logger.info("Created per-book Qdrant collection '%s'", collection)
            self._qdrant_collection_created = True

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
                    "keywords": list(para.keywords.keys()) if para.keywords else [],
                    "keyword_scores": para.keywords if para.keywords else {},
                },
            )
            for para, vec in zip(paragraphs, vectors)
        ]

        self._qdrant.upsert(collection_name=collection, points=points)
        logger.debug(
            "Upserted %d points (chapter %s) into '%s'",
            len(points),
            paragraphs[0].chapter_number if paragraphs else "?",
            collection,
        )
        return [p.id for p in points]
