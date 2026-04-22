"""Tests for services.symbol_analysis_service — LLM interpretation + cache."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from domain.symbol_analysis import SEP, SEPOccurrenceContext, SymbolInterpretation
from services.symbol_analysis_service import SymbolAnalysisService


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_sep(
    imagery_id: str = "img-1",
    book_id: str = "book-1",
    co_entities: list[str] | None = None,
    co_events: list[str] | None = None,
) -> SEP:
    return SEP(
        imagery_id=imagery_id,
        book_id=book_id,
        term="mirror",
        imagery_type="object",
        frequency=5,
        chapter_distribution={1: 3, 2: 2},
        peak_chapters=[1, 2],
        co_occurring_entity_ids=co_entities or ["ent-alice", "ent-bob"],
        co_occurring_event_ids=co_events or ["ev-1", "ev-2"],
        occurrence_contexts=[
            SEPOccurrenceContext(
                occurrence_id="occ-1",
                paragraph_id="p1",
                chapter_number=1,
                position=0,
                paragraph_text="She gazed into the mirror.",
                context_window="into the mirror.",
            ),
        ],
    )


def _mock_llm(response_json: str):
    llm = AsyncMock()
    llm.ainvoke = AsyncMock(
        return_value=SimpleNamespace(content=response_json)
    )
    return llm


@pytest.fixture
def mock_cache():
    cache = AsyncMock()
    cache.get = AsyncMock(return_value=None)
    cache.set = AsyncMock()
    return cache


@pytest.fixture
def mock_symbol_service():
    svc = AsyncMock()
    svc.assemble_sep = AsyncMock(return_value=_make_sep())
    return svc


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestAnalyzeSymbol:
    async def test_cache_hit_returns_without_llm_call(self, mock_cache, mock_symbol_service):
        existing = SymbolInterpretation(
            imagery_id="img-1",
            book_id="book-1",
            term="mirror",
            theme="Self-recognition",
            polarity="mixed",
        )
        mock_cache.get = AsyncMock(return_value=existing.model_dump(mode="json"))
        llm = _mock_llm('{"theme":"unused"}')
        svc = SymbolAnalysisService(cache=mock_cache, llm=llm)

        result = await svc.analyze_symbol(
            imagery_id="img-1",
            book_id="book-1",
            symbol_service=mock_symbol_service,
            doc_service=AsyncMock(),
            kg_service=AsyncMock(),
        )

        assert result.theme == "Self-recognition"
        llm.ainvoke.assert_not_called()
        mock_symbol_service.assemble_sep.assert_not_called()

    async def test_cache_miss_calls_llm_and_persists(
        self, mock_cache, mock_symbol_service
    ):
        llm = _mock_llm(
            '{"theme":"The mirror externalizes self-doubt.",'
            '"polarity":"negative",'
            '"evidence_summary":"She looks in the mirror repeatedly.",'
            '"linked_characters":["ent-alice"],'
            '"linked_events":["ev-1"],'
            '"confidence":0.78}'
        )
        svc = SymbolAnalysisService(cache=mock_cache, llm=llm)

        result = await svc.analyze_symbol(
            imagery_id="img-1",
            book_id="book-1",
            symbol_service=mock_symbol_service,
            doc_service=AsyncMock(),
            kg_service=AsyncMock(),
        )

        assert result.theme.startswith("The mirror")
        assert result.polarity == "negative"
        assert result.linked_characters == ["ent-alice"]
        assert result.linked_events == ["ev-1"]
        assert result.confidence == 0.78
        mock_cache.set.assert_called_once()
        key_arg = mock_cache.set.call_args[0][0]
        assert key_arg == "symbol_analysis:book-1:img-1"

    async def test_force_bypasses_cache(self, mock_cache, mock_symbol_service):
        existing = SymbolInterpretation(
            imagery_id="img-1", book_id="book-1", term="mirror", theme="old",
        )
        mock_cache.get = AsyncMock(return_value=existing.model_dump(mode="json"))
        llm = _mock_llm(
            '{"theme":"new theme","polarity":"positive",'
            '"evidence_summary":"x","linked_characters":[],'
            '"linked_events":[],"confidence":0.5}'
        )
        svc = SymbolAnalysisService(cache=mock_cache, llm=llm)

        result = await svc.analyze_symbol(
            imagery_id="img-1",
            book_id="book-1",
            symbol_service=mock_symbol_service,
            doc_service=AsyncMock(),
            kg_service=AsyncMock(),
            force=True,
        )
        assert result.theme == "new theme"
        llm.ainvoke.assert_called_once()

    async def test_llm_ids_filtered_against_sep(self, mock_cache, mock_symbol_service):
        # LLM hallucinates ent-zzz and ev-zzz which aren't in SEP
        llm = _mock_llm(
            '{"theme":"t","polarity":"neutral","evidence_summary":"s",'
            '"linked_characters":["ent-alice","ent-zzz"],'
            '"linked_events":["ev-zzz","ev-2"],'
            '"confidence":0.6}'
        )
        svc = SymbolAnalysisService(cache=mock_cache, llm=llm)

        result = await svc.analyze_symbol(
            imagery_id="img-1",
            book_id="book-1",
            symbol_service=mock_symbol_service,
            doc_service=AsyncMock(),
            kg_service=AsyncMock(),
        )

        assert result.linked_characters == ["ent-alice"]
        assert result.linked_events == ["ev-2"]

    async def test_invalid_polarity_coerced_to_neutral(
        self, mock_cache, mock_symbol_service
    ):
        llm = _mock_llm(
            '{"theme":"t","polarity":"bogus","evidence_summary":"s",'
            '"linked_characters":[],"linked_events":[],"confidence":0.4}'
        )
        svc = SymbolAnalysisService(cache=mock_cache, llm=llm)
        result = await svc.analyze_symbol(
            imagery_id="img-1",
            book_id="book-1",
            symbol_service=mock_symbol_service,
            doc_service=AsyncMock(),
            kg_service=AsyncMock(),
        )
        assert result.polarity == "neutral"

    async def test_confidence_clamped(self, mock_cache, mock_symbol_service):
        llm = _mock_llm(
            '{"theme":"t","polarity":"neutral","evidence_summary":"s",'
            '"linked_characters":[],"linked_events":[],"confidence":5.5}'
        )
        svc = SymbolAnalysisService(cache=mock_cache, llm=llm)
        result = await svc.analyze_symbol(
            imagery_id="img-1",
            book_id="book-1",
            symbol_service=mock_symbol_service,
            doc_service=AsyncMock(),
            kg_service=AsyncMock(),
        )
        assert result.confidence == 1.0


class TestReview:
    async def test_update_review_status(self, mock_cache):
        existing = SymbolInterpretation(
            imagery_id="img-1",
            book_id="book-1",
            term="mirror",
            theme="self-recognition",
            polarity="mixed",
        )
        mock_cache.get = AsyncMock(return_value=existing.model_dump(mode="json"))
        svc = SymbolAnalysisService(cache=mock_cache)

        updated = await svc.update_interpretation_review(
            imagery_id="img-1",
            book_id="book-1",
            review_status="approved",
        )
        assert updated is not None
        assert updated.review_status == "approved"
        assert updated.theme == "self-recognition"

    async def test_update_with_modifications(self, mock_cache):
        existing = SymbolInterpretation(
            imagery_id="img-1", book_id="book-1", term="mirror", theme="old",
            polarity="neutral",
        )
        mock_cache.get = AsyncMock(return_value=existing.model_dump(mode="json"))
        svc = SymbolAnalysisService(cache=mock_cache)

        updated = await svc.update_interpretation_review(
            imagery_id="img-1",
            book_id="book-1",
            review_status="modified",
            theme="new theme",
            polarity="negative",
        )
        assert updated is not None
        assert updated.review_status == "modified"
        assert updated.theme == "new theme"
        assert updated.polarity == "negative"

    async def test_update_missing_returns_none(self, mock_cache):
        mock_cache.get = AsyncMock(return_value=None)
        svc = SymbolAnalysisService(cache=mock_cache)
        result = await svc.update_interpretation_review(
            imagery_id="img-missing",
            book_id="book-1",
            review_status="approved",
        )
        assert result is None
