"""LLM-based imagery extraction and semantic clustering service.

Follows LLMKeywordExtractor conventions from src/services/keyword_service.py:
- @retry with tenacity (3 attempts, exponential backoff)
- extract_json_from_text() for robust JSON parsing
- set_llm_service_context("imagery") before LLM calls
- Lazy LLM initialisation via _get_llm()
"""

from __future__ import annotations

import json
import logging
from collections import Counter
from typing import Any

import numpy as np
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from domain.imagery import ImageryEntity, ImageryType, SymbolCluster, SymbolOccurrence

logger = logging.getLogger(__name__)

_IMAGERY_EXTRACTION_SYSTEM_PROMPT = """\
Identify concrete imagery elements with symbolic potential from the given passage.

Include:
- Objects: mirror, door, key, book
- Natural elements: water, light, fire, wind, moon, rain
- Spatial elements: room, threshold, road, bridge
- Body parts (when emphasised): hand, eye, blood
- Colours (when serving as primary imagery rather than adjectives)

Exclude: character names, place names, abstract concepts (fear, hope, fate), verbs.

Return JSON only: {{"items": [{{"term": "...", "imagery_type": "object|nature|spatial|body|color|other", "context_sentence": "..."}}]}}
Extract at most {max_items} items; omit anything uncertain.
"""

_MAX_ITEMS_PER_PARAGRAPH = 5
_CONTEXT_WINDOW_CHARS = 200
_VALID_IMAGERY_TYPES = {t.value for t in ImageryType}


class ImageryExtractor:
    """Extract symbolic imagery from chapter text and cluster semantic variants."""

    def __init__(self, llm: Any = None) -> None:
        self._llm = llm

    def _get_llm(self) -> Any:
        if self._llm is None:
            from core.llm_client import get_llm_client  # noqa: PLC0415

            self._llm = get_llm_client().get_with_local_fallback(temperature=0.0)
        return self._llm

    # ── public API ─────────────────────────────────────────────────────────────

    async def extract_chapter_imagery(
        self,
        chapter_text: str,
        chapter_number: int,
        language: str = "en",
    ) -> list[dict]:
        """Extract imagery from a chapter's full text.

        Returns a flat list of raw extraction dicts with keys:
            term, imagery_type, context_sentence, chapter_number
        """
        if not chapter_text.strip():
            return []
        try:
            items = await self._call_llm(chapter_text, chapter_number, language)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "ImageryExtractor LLM failed for chapter %d: %s", chapter_number, exc
            )
            return []
        # Stamp chapter_number on each item
        for item in items:
            item["chapter_number"] = chapter_number
        return items

    async def cluster_synonyms(
        self,
        terms: list[str],
        threshold: float = 0.75,
    ) -> list[SymbolCluster]:
        """Cluster semantically similar terms using cosine similarity.

        Algorithm:
        1. Embed all unique terms via SentenceTransformer (multilingual model, L2-normalised).
        2. Compute cosine similarity matrix (np.dot on normalised vectors).
        3. Greedy clustering by frequency: highest-frequency term becomes canonical;
           any unclustered term with similarity >= threshold is merged into it.

        Args:
            terms: Raw term list (may contain duplicates for frequency counting).
            threshold: Cosine similarity threshold for merging.

        Returns:
            List of SymbolCluster (one per canonical term).
        """
        if not terms:
            return []

        freq: Counter[str] = Counter(terms)
        unique_terms = list(freq.keys())

        # Embed all unique terms with the multilingual clustering model.
        # SentenceTransformer.encode() is synchronous — run in thread pool to
        # avoid blocking the event loop.
        import asyncio  # noqa: PLC0415
        import functools  # noqa: PLC0415

        from sentence_transformers import SentenceTransformer  # noqa: PLC0415

        from config.settings import get_settings  # noqa: PLC0415

        settings = get_settings()
        model = SentenceTransformer(settings.imagery_embedding_model_name)
        loop = asyncio.get_event_loop()
        mat = await loop.run_in_executor(
            None,
            functools.partial(
                model.encode,
                unique_terms,
                normalize_embeddings=True,
                show_progress_bar=False,
                convert_to_numpy=True,
            ),
        )

        if mat is None or len(mat) == 0:
            return [
                SymbolCluster(
                    canonical_term=t,
                    variants=[],
                    semantic_similarity_scores={},
                    book_id="",
                )
                for t in unique_terms
            ]

        mat = np.array(mat, dtype=np.float32)

        # Greedy clustering: process in descending frequency order
        sorted_terms = sorted(unique_terms, key=lambda t: freq[t], reverse=True)
        term_to_idx = {t: i for i, t in enumerate(unique_terms)}

        assigned: set[str] = set()
        clusters: list[SymbolCluster] = []

        for canonical in sorted_terms:
            if canonical in assigned:
                continue
            assigned.add(canonical)
            canon_vec = mat[term_to_idx[canonical]]
            variants: list[str] = []
            scores: dict[str, float] = {}

            for other in sorted_terms:
                if other in assigned:
                    continue
                other_vec = mat[term_to_idx[other]]
                sim = float(np.dot(canon_vec, other_vec))
                if sim >= threshold:
                    variants.append(other)
                    scores[other] = round(sim, 4)
                    assigned.add(other)

            clusters.append(
                SymbolCluster(
                    canonical_term=canonical,
                    variants=variants,
                    semantic_similarity_scores=scores,
                    book_id="",  # filled in by build_imagery_entities
                )
            )

        return clusters

    async def build_imagery_entities(
        self,
        raw_extractions: list[dict],
        book_id: str,
        clusters: list[SymbolCluster],
    ) -> tuple[list[ImageryEntity], list[SymbolOccurrence]]:
        """Convert raw LLM extractions + clusters into persisted domain objects.

        Each SymbolCluster becomes one ImageryEntity.
        Each raw extraction occurrence becomes one SymbolOccurrence.

        Args:
            raw_extractions: Output of extract_chapter_imagery() across all chapters.
                             Each dict has: term, imagery_type, context_sentence,
                             chapter_number, paragraph_id, position.
            book_id: The book identifier.
            clusters: Output of cluster_synonyms().

        Returns:
            (imagery_entities, symbol_occurrences)
        """
        # Build term → canonical mapping
        term_to_canonical: dict[str, str] = {}
        for cluster in clusters:
            term_to_canonical[cluster.canonical_term] = cluster.canonical_term
            for variant in cluster.variants:
                term_to_canonical[variant] = cluster.canonical_term

        # Build ImageryEntity per canonical term
        canonical_to_entity: dict[str, ImageryEntity] = {}
        for cluster in clusters:
            # Determine imagery_type from most common type in extractions for this cluster
            cluster_terms = {cluster.canonical_term} | set(cluster.variants)
            type_votes: Counter[str] = Counter()
            for ex in raw_extractions:
                if ex.get("term", "") in cluster_terms:
                    type_votes[ex.get("imagery_type", "other")] += 1
            imagery_type_str = type_votes.most_common(1)[0][0] if type_votes else "other"
            if imagery_type_str not in _VALID_IMAGERY_TYPES:
                imagery_type_str = "other"

            entity = ImageryEntity(
                book_id=book_id,
                term=cluster.canonical_term,
                imagery_type=ImageryType(imagery_type_str),
                aliases=list(cluster.variants),
                frequency=0,
                chapter_distribution={},
            )
            # Stamp book_id on cluster (mutate in-place)
            cluster.book_id = book_id
            canonical_to_entity[cluster.canonical_term] = entity

        # Build SymbolOccurrence list and update entity frequency/distribution
        occurrences: list[SymbolOccurrence] = []
        for ex in raw_extractions:
            term = ex.get("term", "")
            canonical = term_to_canonical.get(term)
            if canonical is None:
                continue
            entity = canonical_to_entity.get(canonical)
            if entity is None:
                continue

            chapter_num = ex.get("chapter_number", 0)
            entity.frequency += 1
            entity.chapter_distribution[chapter_num] = (
                entity.chapter_distribution.get(chapter_num, 0) + 1
            )

            occ = SymbolOccurrence(
                imagery_id=entity.id,
                book_id=book_id,
                paragraph_id=ex.get("paragraph_id", ""),
                chapter_number=chapter_num,
                position=ex.get("position", 0),
                context_window=ex.get("context_sentence", "")[:_CONTEXT_WINDOW_CHARS],
                co_occurring_terms=ex.get("co_occurring_terms", []),
            )
            occurrences.append(occ)

        entities = list(canonical_to_entity.values())
        return entities, occurrences

    # ── private ────────────────────────────────────────────────────────────────

    @staticmethod
    def _localize_prompt(prompt: str, language: str) -> str:
        """Append a language instruction to a system prompt."""
        from core.language_detection import get_language_display_name  # noqa: PLC0415

        lang_name = get_language_display_name(language)
        return prompt + f"\nRespond in {lang_name}."

    @retry(
        retry=retry_if_exception_type(
            (json.JSONDecodeError, ValueError, KeyError, ConnectionError, TimeoutError)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _call_llm(
        self,
        text: str,
        chapter_number: int,
        language: str = "en",
    ) -> list[dict]:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        from core.token_callback import set_llm_service_context  # noqa: PLC0415

        prompt = self._localize_prompt(
            _IMAGERY_EXTRACTION_SYSTEM_PROMPT.format(max_items=_MAX_ITEMS_PER_PARAGRAPH),
            language,
        )
        llm = self._get_llm()
        messages = [
            SystemMessage(content=prompt),
            HumanMessage(content=text[:12000]),
        ]
        set_llm_service_context("imagery")
        response = await llm.ainvoke(messages)
        content = response.content if hasattr(response, "content") else str(response)
        return self._parse_response(content)

    @staticmethod
    def _parse_response(content: str) -> list[dict]:
        """Parse LLM JSON response using robust 4-step fallback extractor."""
        from core.utils.output_extractor import extract_json_from_text  # noqa: PLC0415

        data, error_tag = extract_json_from_text(content)
        if data is None:
            raise ValueError(f"Failed to parse imagery JSON: {error_tag}")

        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            items = data.get("items", data.get("results", []))
        else:
            raise ValueError(f"Unexpected JSON structure: {type(data).__name__}")

        result: list[dict] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            term = str(item.get("term", "")).strip()
            if not term:
                continue
            imagery_type = str(item.get("imagery_type", "other")).lower()
            if imagery_type not in _VALID_IMAGERY_TYPES:
                imagery_type = "other"
            result.append(
                {
                    "term": term,
                    "imagery_type": imagery_type,
                    "context_sentence": str(item.get("context_sentence", "")),
                }
            )
        return result
