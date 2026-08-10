"""Tests for services.symbol_analysis_service — LLM interpretation + cache."""

from __future__ import annotations

from enum import Enum
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import TypeAdapter
from storysphere.core.error_handling import LLMResponseBlocked
from storysphere.domain.symbol_analysis import (
    SEP,
    InterpretationBlock,
    SEPOccurrenceContext,
    SymbolInterpretation,
)
from storysphere.services.symbol_analysis_service import (
    SymbolAnalysisService,
    _block_cache_key,
)

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


class _FakeBlockReason(Enum):
    """Stands in for google.genai's BlockedReason, which arrives as an enum.

    Matters because ``str()`` on it yields "BlockedReason.PROHIBITED_CONTENT" —
    the class prefix would end up in the card the reader sees.
    """

    PROHIBITED_CONTENT = "PROHIBITED_CONTENT"


def _mock_llm_blocked(reason=_FakeBlockReason.PROHIBITED_CONTENT):
    """An LLM that refuses the prompt the way Gemini actually does.

    Empty content on a *successfully returned* message — langchain_google_genai
    does not raise on a block, which is why the refusal used to reach the JSON
    extractor and surface as ``no_json_found``.
    """
    llm = AsyncMock()
    llm.ainvoke = AsyncMock(
        return_value=SimpleNamespace(
            content="",
            response_metadata={"prompt_feedback": {"block_reason": reason}},
        )
    )
    return llm


@pytest.fixture
def mock_cache():
    cache = AsyncMock()
    cache.get = AsyncMock(return_value=None)
    cache.set = AsyncMock()

    # Mirror the real AnalysisCache: get_as() reads through get(), so tests can
    # keep stubbing get() with raw dicts. Async because it awaits get().
    async def _get_as(key, model):
        raw = await cache.get(key)
        return None if raw is None else TypeAdapter(model).validate_python(raw)

    cache.get_as = AsyncMock(side_effect=_get_as)
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


class TestListInterpretations:
    """One query for a whole book, replacing one 404-prone request per symbol."""

    @staticmethod
    def _interp(imagery_id: str, **kw) -> SymbolInterpretation:
        defaults = {
            "imagery_id": imagery_id,
            "book_id": "book-1",
            "term": imagery_id,
        }
        defaults.update(kw)
        return SymbolInterpretation(**defaults)

    async def test_keys_results_by_imagery_id(self, mock_cache):
        mock_cache.list_by_prefix = AsyncMock(
            return_value=[
                self._interp("img-1", review_status="approved").model_dump(mode="json"),
                self._interp("img-2").model_dump(mode="json"),
            ]
        )
        svc = SymbolAnalysisService(cache=mock_cache)
        result = await svc.list_interpretations("book-1")
        assert set(result) == {"img-1", "img-2"}
        assert result["img-1"].review_status == "approved"

    async def test_queries_only_this_book(self, mock_cache):
        mock_cache.list_by_prefix = AsyncMock(return_value=[])
        svc = SymbolAnalysisService(cache=mock_cache)
        await svc.list_interpretations("book-1")
        mock_cache.list_by_prefix.assert_awaited_once_with("symbol_analysis:book-1:")

    async def test_returns_empty_when_nothing_generated(self, mock_cache):
        mock_cache.list_by_prefix = AsyncMock(return_value=[])
        svc = SymbolAnalysisService(cache=mock_cache)
        assert await svc.list_interpretations("book-1") == {}

    async def test_skips_malformed_rows_without_losing_the_rest(self, mock_cache):
        mock_cache.list_by_prefix = AsyncMock(
            return_value=[
                {"imagery_id": "img-bad"},  # no book_id / term
                self._interp("img-good").model_dump(mode="json"),
            ]
        )
        svc = SymbolAnalysisService(cache=mock_cache)
        result = await svc.list_interpretations("book-1")
        assert set(result) == {"img-good"}


class TestProviderRefusal:
    """A refusal must be recorded, not retried, and not mistaken for bad JSON."""

    async def test_blocked_prompt_raises_instead_of_parse_error(
        self, mock_cache, mock_symbol_service
    ):
        svc = SymbolAnalysisService(cache=mock_cache, llm=_mock_llm_blocked())

        with pytest.raises(LLMResponseBlocked) as exc_info:
            await svc.analyze_symbol(
                imagery_id="img-1",
                book_id="book-1",
                symbol_service=mock_symbol_service,
                doc_service=AsyncMock(),
                kg_service=AsyncMock(),
            )

        assert exc_info.value.reason == "provider_blocked"
        # Unwrapped from the enum — the class prefix must not reach the reader.
        assert exc_info.value.detail == "PROHIBITED_CONTENT"
        assert "no_json_found" not in str(exc_info.value)

    async def test_blocked_prompt_is_not_retried(
        self, mock_cache, mock_symbol_service
    ):
        # A block is deterministic, so tenacity's ValueError/KeyError policy must
        # not apply — three identical blocked calls is three wasted requests.
        llm = _mock_llm_blocked()
        svc = SymbolAnalysisService(cache=mock_cache, llm=llm)

        with pytest.raises(LLMResponseBlocked):
            await svc.analyze_symbol(
                imagery_id="img-1",
                book_id="book-1",
                symbol_service=mock_symbol_service,
                doc_service=AsyncMock(),
                kg_service=AsyncMock(),
            )

        assert llm.ainvoke.call_count == 1

    async def test_blocked_prompt_is_recorded(
        self, mock_cache, mock_symbol_service
    ):
        svc = SymbolAnalysisService(cache=mock_cache, llm=_mock_llm_blocked())

        with pytest.raises(LLMResponseBlocked):
            await svc.analyze_symbol(
                imagery_id="img-1",
                book_id="book-1",
                symbol_service=mock_symbol_service,
                doc_service=AsyncMock(),
                kg_service=AsyncMock(),
            )

        key, payload = mock_cache.set.call_args[0]
        assert key == "symbol_analysis_block:book-1:img-1"
        assert payload["reason"] == "provider_blocked"
        assert payload["detail"] == "PROHIBITED_CONTENT"
        # Carried so the UI can name the symbol without a second lookup.
        assert payload["term"] == "mirror"

    async def test_empty_response_without_a_reason_is_recorded_separately(
        self, mock_cache, mock_symbol_service
    ):
        # Non-Gemini providers have no prompt_feedback; the empty-content check
        # is what catches the same shape from them.
        llm = AsyncMock()
        llm.ainvoke = AsyncMock(return_value=SimpleNamespace(content="   "))
        svc = SymbolAnalysisService(cache=mock_cache, llm=llm)

        with pytest.raises(LLMResponseBlocked) as exc_info:
            await svc.analyze_symbol(
                imagery_id="img-1",
                book_id="book-1",
                symbol_service=mock_symbol_service,
                doc_service=AsyncMock(),
                kg_service=AsyncMock(),
            )

        assert exc_info.value.reason == "provider_empty"

    async def test_a_later_success_clears_the_record(self, mock_cache):
        # Otherwise a symbol that succeeds once a fallback exists keeps its
        # badge and stays out of every batch run's default scope forever.
        svc = SymbolAnalysisService(cache=mock_cache)
        await svc.save_interpretation(
            SymbolInterpretation(
                imagery_id="img-1", book_id="book-1", term="mirror",
            )
        )
        mock_cache.invalidate.assert_awaited_once_with(
            "symbol_analysis_block:book-1:img-1"
        )

    async def test_transient_failures_are_not_recorded(
        self, mock_cache, mock_symbol_service
    ):
        # A rate limit is not deterministic. Recording it would make the next
        # batch run skip a symbol that would have succeeded.
        llm = AsyncMock()
        llm.ainvoke = AsyncMock(side_effect=RuntimeError("429 quota exceeded"))
        svc = SymbolAnalysisService(cache=mock_cache, llm=llm)

        with pytest.raises(RuntimeError):
            await svc.analyze_symbol(
                imagery_id="img-1",
                book_id="book-1",
                symbol_service=mock_symbol_service,
                doc_service=AsyncMock(),
                kg_service=AsyncMock(),
            )

        mock_cache.set.assert_not_called()


class TestListBlocks:
    @staticmethod
    def _block(imagery_id: str, **kw) -> InterpretationBlock:
        defaults = {
            "imagery_id": imagery_id,
            "book_id": "book-1",
            "term": imagery_id,
            "reason": "provider_blocked",
        }
        defaults.update(kw)
        return InterpretationBlock(**defaults)

    def test_block_key_sits_outside_the_interpretation_prefix(self):
        # Load-bearing: list_interpretations() bulk-loads on
        # "symbol_analysis:{book}:" and list_by_prefix matches prefix + "%", so
        # a colon here would pull every refusal into the interpretation scan.
        assert not _block_cache_key("book-1", "img-1").startswith(
            "symbol_analysis:book-1:"
        )

    async def test_queries_only_this_book(self, mock_cache):
        mock_cache.list_by_prefix = AsyncMock(return_value=[])
        svc = SymbolAnalysisService(cache=mock_cache)
        await svc.list_blocks("book-1")
        mock_cache.list_by_prefix.assert_awaited_once_with(
            "symbol_analysis_block:book-1:"
        )

    async def test_keys_results_by_imagery_id(self, mock_cache):
        mock_cache.list_by_prefix = AsyncMock(
            return_value=[
                self._block("img-1", detail="PROHIBITED_CONTENT").model_dump(
                    mode="json"
                ),
                self._block("img-2", reason="provider_empty").model_dump(
                    mode="json"
                ),
            ]
        )
        svc = SymbolAnalysisService(cache=mock_cache)
        result = await svc.list_blocks("book-1")
        assert set(result) == {"img-1", "img-2"}
        assert result["img-1"].detail == "PROHIBITED_CONTENT"
        assert result["img-2"].reason == "provider_empty"

    async def test_skips_malformed_rows_without_losing_the_rest(self, mock_cache):
        mock_cache.list_by_prefix = AsyncMock(
            return_value=[
                {"imagery_id": "img-bad"},  # no reason / book_id
                self._block("img-good").model_dump(mode="json"),
            ]
        )
        svc = SymbolAnalysisService(cache=mock_cache)
        assert set(await svc.list_blocks("book-1")) == {"img-good"}
