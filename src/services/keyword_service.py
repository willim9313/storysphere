"""KeywordService — multi-strategy keyword extraction and aggregation.

Provides:
- ``BaseKeywordExtractor`` ABC
- ``YakeKeywordExtractor`` — YAKE wrapper (default, pure Python)
- ``LLMKeywordExtractor`` — LLM-based semantic extraction
- ``TfidfKeywordExtractor`` — simple TF-based fallback
- ``CompositeKeywordExtractor`` — weighted merge of multiple extractors
- ``KeywordAggregator`` — paragraph → chapter → book aggregation
- ``KeywordService`` — query interface for the tools layer
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import re
from abc import ABC, abstractmethod
from collections import Counter
from typing import Any

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from services.query_models import ChapterKeywordMatch

logger = logging.getLogger(__name__)

# -- Stop words (minimal English set for TF-IDF) ----------------------------

_STOP_WORDS = frozenset(
    "a an the and or but if in on at to for of is it its this that was were "
    "be been being have has had do does did will would shall should may might "
    "can could not no nor so yet also very too just about above after again "
    "all am any are as before below between both by down during each few from "
    "further get got he her here hers herself him himself his how i into me "
    "more most my myself off once only other our ours ourselves out over own "
    "same she some such than them then there these they their theirs themselves "
    "through under until up us we what when where which while who whom why with "
    "you your yours yourself yourselves".split()
)


# ── ABC ──────────────────────────────────────────────────────────────────────


class BaseKeywordExtractor(ABC):
    """Abstract base class for keyword extractors."""

    @abstractmethod
    async def extract(
        self, text: str, max_keywords: int = 10, language: str = "en"
    ) -> dict[str, float]:
        """Extract keywords from text.

        Args:
            text: Input text.
            max_keywords: Maximum number of keywords to return.
            language: ISO 639-1 code for the text language.

        Returns:
            Dict mapping keyword → score (higher = more relevant, range [0, 1]).
        """


# ── YAKE Extractor ───────────────────────────────────────────────────────────


class YakeKeywordExtractor(BaseKeywordExtractor):
    """YAKE keyword extractor (unsupervised, pure Python).

    YAKE scores are **lower = better**, so we invert and normalise to [0, 1].
    """

    def __init__(self, language: str = "en", n_grams: int = 2) -> None:
        try:
            import yake  # noqa: F401
        except ImportError as exc:
            raise ImportError("yake is required for keyword extraction: pip install yake") from exc
        self._language = language
        self._n_grams = n_grams

    async def extract(
        self, text: str, max_keywords: int = 10, language: str = "en"
    ) -> dict[str, float]:
        if not text.strip():
            return {}

        import yake  # noqa: PLC0415

        from core.language_detection import to_yake_language  # noqa: PLC0415

        yake_lang = to_yake_language(language)
        kw_extractor = yake.KeywordExtractor(
            lan=yake_lang,
            n=self._n_grams,
            top=max_keywords,
            features=None,
        )

        loop = asyncio.get_running_loop()
        raw_keywords = await loop.run_in_executor(
            None, kw_extractor.extract_keywords, text
        )

        if not raw_keywords:
            return {}

        # Invert scores: YAKE lower=better → higher=better
        max_score = max(score for _, score in raw_keywords)
        if max_score == 0:
            return {kw.lower(): 1.0 for kw, _ in raw_keywords}

        result: dict[str, float] = {}
        for kw, score in raw_keywords:
            inverted = 1.0 - (score / max_score)
            result[kw.lower()] = round(max(0.0, min(1.0, inverted)), 4)

        return result


# ── LLM Extractor ────────────────────────────────────────────────────────────

_LLM_KEYWORD_PROMPT = """\
You are a keyword extraction system. Extract the most important keywords
and key phrases from the following text.

Rules:
- Each keyword must be a SHORT noun phrase: 1–4 words (for English) or 2–8 characters (for Chinese/Japanese).
- No full sentences. No clauses. No punctuation at the end.
- Prefer named entities (people, places, objects) and core concepts over generic descriptions.

Return ONLY a JSON object with a single key "keywords" whose value is a list
of objects, each with "keyword" (str) and "score" (float, 0.0-1.0).
Score indicates relevance (1.0 = most relevant).

Example (Chinese): {{"keywords": [{{"keyword": "灰石", "score": 0.95}}, {{"keyword": "茅草屋", "score": 0.8}}]}}
Example (English): {{"keywords": [{{"keyword": "dark forest", "score": 0.95}}, {{"keyword": "hero", "score": 0.8}}]}}

Extract at most {max_keywords} keywords.
"""


class LLMKeywordExtractor(BaseKeywordExtractor):
    """LLM-based keyword extraction with semantic understanding."""

    def __init__(self, llm: Any = None) -> None:
        self._llm = llm

    def _get_llm(self):
        if self._llm is None:
            from core.llm_client import get_llm_client  # noqa: PLC0415

            self._llm = get_llm_client().get_with_local_fallback(temperature=0.0)
        return self._llm

    async def extract(
        self, text: str, max_keywords: int = 10, language: str = "en"
    ) -> dict[str, float]:
        if not text.strip():
            return {}
        return await self._call_llm(text, max_keywords, language)

    @retry(
        retry=retry_if_exception_type(
            (json.JSONDecodeError, ValueError, KeyError, ConnectionError, TimeoutError)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        reraise=True,
    )
    async def _call_llm(
        self, text: str, max_keywords: int, language: str = "en"
    ) -> dict[str, float]:
        from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

        from core.language_detection import get_language_display_name  # noqa: PLC0415

        lang_name = get_language_display_name(language)
        prompt = (
            _LLM_KEYWORD_PROMPT.format(max_keywords=max_keywords)
            + f"\nExtract keywords in {lang_name}."
        )
        llm = self._get_llm()
        messages = [
            SystemMessage(content=prompt),
            HumanMessage(content=text[:8000]),
        ]
        from core.token_callback import set_llm_service_context  # noqa: PLC0415

        set_llm_service_context("keyword")
        response = await llm.ainvoke(messages)
        content = response.content if hasattr(response, "content") else str(response)
        return self._parse_response(content)

    @staticmethod
    def _parse_response(content: str) -> dict[str, float]:
        """Parse LLM JSON response using robust 4-step fallback extractor."""
        from core.utils.output_extractor import extract_json_from_text  # noqa: PLC0415

        data, error_tag = extract_json_from_text(content)
        if data is None:
            raise ValueError(f"Failed to parse keyword JSON: {error_tag}")

        if not isinstance(data, dict):
            raise ValueError(f"Expected JSON object, got {type(data).__name__}")

        keywords = data.get("keywords", [])
        result: dict[str, float] = {}
        for item in keywords:
            kw = item.get("keyword", "").lower()
            if not kw:
                continue
            score = max(0.0, min(1.0, float(item.get("score", 1.0))))
            result[kw] = round(score, 4)
        return result


# ── TF-IDF Extractor ─────────────────────────────────────────────────────────


class TfidfKeywordExtractor(BaseKeywordExtractor):
    """Simple term-frequency extractor with stop word removal.

    Lightweight fallback when YAKE or LLM are not available.
    Uses raw term frequency normalised to [0, 1].
    """

    async def extract(
        self, text: str, max_keywords: int = 10, language: str = "en"
    ) -> dict[str, float]:
        if not text.strip():
            return {}

        # Tokenize: lowercase, keep only alphabetic tokens ≥ 3 chars
        words = re.findall(r"[a-zA-Z]{3,}", text.lower())
        words = [w for w in words if w not in _STOP_WORDS]

        if not words:
            return {}

        counts = Counter(words)
        max_count = counts.most_common(1)[0][1]
        if max_count == 0:
            return {}

        top = counts.most_common(max_keywords)
        return {word: round(count / max_count, 4) for word, count in top}


# ── Composite Extractor ──────────────────────────────────────────────────────


class CompositeKeywordExtractor(BaseKeywordExtractor):
    """Weighted combination of multiple extractors.

    Runs all extractors concurrently via ``asyncio.gather`` and merges
    results with configurable weights.
    """

    def __init__(self, extractors: list[tuple[BaseKeywordExtractor, float]]) -> None:
        """
        Args:
            extractors: List of (extractor, weight) tuples.
        """
        if not extractors:
            raise ValueError("CompositeKeywordExtractor requires at least one extractor")
        self._extractors = extractors

    async def extract(
        self, text: str, max_keywords: int = 10, language: str = "en"
    ) -> dict[str, float]:
        if not text.strip():
            return {}

        # Run all extractors concurrently
        tasks = [ext.extract(text, max_keywords, language=language) for ext, _ in self._extractors]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Weighted merge
        merged: dict[str, float] = {}
        for (_, weight), result in zip(self._extractors, results):
            if isinstance(result, Exception):
                logger.warning("Composite extractor sub-task failed: %s", result)
                continue
            for kw, score in result.items():
                merged[kw] = merged.get(kw, 0.0) + score * weight

        if not merged:
            return {}

        # Normalise to [0, 1]
        max_val = max(merged.values())
        if max_val > 0:
            merged = {k: round(v / max_val, 4) for k, v in merged.items()}

        # Return top-k
        sorted_kws = sorted(merged.items(), key=lambda x: x[1], reverse=True)
        return dict(sorted_kws[:max_keywords])


# ── Keyword Aggregator ───────────────────────────────────────────────────────


class KeywordAggregator:
    """Aggregate keyword scores from multiple chunks into a combined ranking.

    Strategies:
    - ``sum``: Sum all scores.
    - ``avg``: Average scores across chunks.
    - ``max``: Take max score per keyword.
    - ``weighted_sum``: Sum with ``log(count + 1)`` frequency boost.
    """

    STRATEGIES = ("sum", "avg", "max", "weighted_sum")

    def __init__(self, strategy: str = "weighted_sum") -> None:
        if strategy not in self.STRATEGIES:
            raise ValueError(f"Unknown strategy '{strategy}'. Choose from: {self.STRATEGIES}")
        self._strategy = strategy

    def aggregate(
        self,
        keyword_dicts: list[dict[str, float]],
        top_k: int = 20,
    ) -> dict[str, float]:
        """Aggregate multiple keyword dicts into a single ranked dict.

        Args:
            keyword_dicts: List of {keyword: score} dicts (one per chunk).
            top_k: Maximum number of keywords to return.

        Returns:
            Aggregated {keyword: score} dict, normalised to [0, 1].
        """
        if not keyword_dicts:
            return {}

        # Collect all scores per keyword
        all_scores: dict[str, list[float]] = {}
        for kw_dict in keyword_dicts:
            for kw, score in kw_dict.items():
                all_scores.setdefault(kw, []).append(score)

        # Apply strategy
        aggregated: dict[str, float] = {}
        for kw, scores in all_scores.items():
            if self._strategy == "sum":
                aggregated[kw] = sum(scores)
            elif self._strategy == "avg":
                aggregated[kw] = sum(scores) / len(scores)
            elif self._strategy == "max":
                aggregated[kw] = max(scores)
            elif self._strategy == "weighted_sum":
                aggregated[kw] = sum(scores) * math.log(len(scores) + 1)

        if not aggregated:
            return {}

        # Normalise to [0, 1]
        max_val = max(aggregated.values())
        if max_val > 0:
            aggregated = {k: round(v / max_val, 4) for k, v in aggregated.items()}

        # Return top-k sorted by score
        sorted_kws = sorted(aggregated.items(), key=lambda x: x[1], reverse=True)
        return dict(sorted_kws[:top_k])


# ── KeywordService (query interface for tools layer) ─────────────────────────


class KeywordService:
    """Query interface for keyword data — delegates to DocumentService.

    Used by the tools layer (GetKeywordsTool) to retrieve stored keywords.
    """

    def __init__(self, doc_service: Any, kg_service: Any = None) -> None:
        self._doc_service = doc_service
        self._kg_service = kg_service

    async def get_chapter_keywords(
        self, document_id: str, chapter_number: int
    ) -> dict[str, float] | None:
        return await self._doc_service.get_chapter_keywords(document_id, chapter_number)

    async def get_book_keywords(self, document_id: str) -> dict[str, float] | None:
        return await self._doc_service.get_book_keywords(document_id)

    async def search_chapters_by_keyword(
        self, document_id: str, keyword: str
    ) -> list[ChapterKeywordMatch]:
        return await self._doc_service.search_chapters_by_keyword(document_id, keyword)

    async def get_entity_keywords(
        self,
        document_id: str,
        entity_name: str,
        top_k: int = 15,
    ) -> dict[str, float]:
        """Get keywords relevant to a specific entity.

        Strategy: find chapters where the entity appears (via KGService timeline),
        then aggregate per-chapter keywords. Falls back to book-level keywords
        if kg_service is unavailable or the entity has no timeline.
        """
        chapter_keywords: list[dict[str, float]] = []

        if self._kg_service is not None:
            try:
                entity = await self._kg_service.get_entity_by_name(entity_name)
                if entity is not None:
                    events = await self._kg_service.get_entity_timeline(entity.id)
                    chapters_seen: set[int] = set()
                    for evt in events:
                        ch = getattr(evt, "chapter_number", None)
                        if ch is not None and ch not in chapters_seen:
                            chapters_seen.add(ch)
                            kws = await self.get_chapter_keywords(document_id, ch)
                            if kws:
                                chapter_keywords.append(kws)
            except Exception:
                logger.warning(
                    "Failed to get entity timeline for %r, falling back to book keywords",
                    entity_name,
                    exc_info=True,
                )

        if chapter_keywords:
            aggregator = KeywordAggregator(strategy="weighted_sum")
            return aggregator.aggregate(chapter_keywords, top_k=top_k)

        # Fallback: book-level keywords
        book_kws = await self.get_book_keywords(document_id)
        if book_kws:
            sorted_kws = sorted(book_kws.items(), key=lambda x: x[1], reverse=True)
            return dict(sorted_kws[:top_k])
        return {}


# ── Factory ──────────────────────────────────────────────────────────────────


def build_keyword_extractor(
    extractor_type: str | None = None,
    llm: Any = None,
) -> BaseKeywordExtractor | None:
    """Factory to build a keyword extractor from settings.

    Args:
        extractor_type: Override for settings.keyword_extractor_type.
        llm: Optional LLM instance for LLM/composite extractors.

    Returns:
        A keyword extractor instance, or None if type is "none".
    """
    if extractor_type is None:
        from config.settings import get_settings  # noqa: PLC0415

        extractor_type = get_settings().keyword_extractor_type

    extractor_type = extractor_type.lower()
    if extractor_type == "none":
        return None
    elif extractor_type == "yake":
        from config.settings import get_settings  # noqa: PLC0415

        return YakeKeywordExtractor(language=get_settings().yake_language)
    elif extractor_type == "llm":
        return LLMKeywordExtractor(llm=llm)
    elif extractor_type == "tfidf":
        return TfidfKeywordExtractor()
    elif extractor_type == "composite":
        from config.settings import get_settings  # noqa: PLC0415

        settings = get_settings()
        extractors: list[tuple[BaseKeywordExtractor, float]] = []
        for part in settings.keyword_composite_weights.split(","):
            name, weight_str = part.strip().split(":")
            weight = float(weight_str)
            name = name.strip().lower()
            if name == "yake":
                extractors.append((YakeKeywordExtractor(), weight))
            elif name == "llm":
                extractors.append((LLMKeywordExtractor(llm=llm), weight))
            elif name == "tfidf":
                extractors.append((TfidfKeywordExtractor(), weight))
        return CompositeKeywordExtractor(extractors)
    else:
        logger.warning("Unknown keyword extractor type '%s', defaulting to YAKE", extractor_type)
        return YakeKeywordExtractor()
