"""Token usage is attributed to the book that caused it.

``token_usage.db`` has always had a ``book_id`` column and
``set_llm_service_context`` has always accepted the argument, but no caller
passed it, so every row landed with NULL. The book id now rides the contextvar
from the few entry points that know which book is being worked on; the services
underneath keep setting only their own name and inherit the attribution.

Each test therefore reads the context *at the moment the work runs*, not
afterwards — that is when ``TokenTrackingHandler`` reads it.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from storysphere.agents.analysis_agent import AnalysisAgent
from storysphere.core.token_callback import (
    get_llm_service_context,
    set_llm_book_context,
)
from storysphere.domain.documents import Chapter, Document, FileType, Paragraph
from storysphere.pipelines.feature_extraction.pipeline import FeatureExtractionResult
from storysphere.pipelines.knowledge_graph.pipeline import KGExtractionResult
from storysphere.pipelines.summarization.pipeline import SummarizationResult
from storysphere.pipelines.symbol_discovery.pipeline import SymbolDiscoveryResult
from storysphere.services.analysis_models import (
    CEPResult,
    CharacterAnalysisResult,
    CharacterProfile,
    CoverageMetrics,
)
from storysphere.workflows.ingestion import IngestionWorkflow


def _make_doc(doc_id: str) -> Document:
    return Document(
        id=doc_id,
        title="Attribution Test",
        file_path="/tmp/attr.pdf",
        file_type=FileType.PDF,
        chapters=[
            Chapter(
                number=1,
                paragraphs=[Paragraph(text="Text.", chapter_number=1, position=0)],
            )
        ],
    )


def _make_workflow(doc: Document, *, summ_run) -> IngestionWorkflow:
    doc_svc = AsyncMock()
    doc_svc.get_document.return_value = doc

    summ = AsyncMock()
    summ.run.side_effect = summ_run

    feat = AsyncMock()
    feat.run.return_value = FeatureExtractionResult(document_id=doc.id)

    kg = AsyncMock()
    kg.run.return_value = KGExtractionResult()

    symbols = AsyncMock()
    symbols.run.return_value = SymbolDiscoveryResult(book_id=doc.id)

    return IngestionWorkflow(
        summarization_pipeline=summ,
        feature_pipeline=feat,
        kg_pipeline=kg,
        symbol_pipeline=symbols,
        document_service=doc_svc,
        kg_service=AsyncMock(),
    )


class TestIngestionAttribution:
    """The whole import bills against the book, from one line per entry point."""

    @pytest.mark.asyncio
    async def test_run_step_attributes_the_pipeline_to_the_book(self):
        doc = _make_doc("doc-run-step-attr")
        seen: list[tuple[str, str | None]] = []

        def _run(_doc, **_kw):
            seen.append(get_llm_service_context())
            return SummarizationResult(document_id=doc.id)

        wf = _make_workflow(doc, summ_run=_run)
        await wf.run_step("summarization", doc)

        assert seen == [("ingestion", "doc-run-step-attr")]

    @pytest.mark.asyncio
    async def test_run_phase2_attributes_the_pipeline_to_the_book(self):
        """Phase 2 resumes after chapter review, so it sets the context again."""
        doc = _make_doc("doc-phase2-attr")
        seen: list[tuple[str, str | None]] = []

        def _run(_doc, **_kw):
            seen.append(get_llm_service_context())
            return SummarizationResult(document_id=doc.id)

        wf = _make_workflow(doc, summ_run=_run)
        with patch("storysphere.services.analysis_cache.AnalysisCache"), patch(
            "storysphere.config.settings.get_settings"
        ):
            await wf.run_phase2(doc.id)

        assert seen and seen[0][1] == "doc-phase2-attr"


class TestAnalysisAgentAttribution:
    """On-demand analysis is billed to the book it was requested for."""

    @pytest.mark.asyncio
    async def test_character_analysis_carries_the_document_id(self):
        seen: list[tuple[str, str | None]] = []

        def _analyze(**kwargs):
            seen.append(get_llm_service_context())
            return CharacterAnalysisResult(
                entity_id="ent-1",
                entity_name="Alice",
                document_id=kwargs["document_id"],
                profile=CharacterProfile(summary="Alice is brave."),
                cep=CEPResult(actions=["fought"]),
                archetypes=[],
                arc=[],
                coverage=CoverageMetrics(action_count=1),
            )

        service = AsyncMock()
        service.analyze_character.side_effect = _analyze
        agent = AnalysisAgent(analysis_service=service)

        await agent.analyze_character("Alice", "doc-character-attr", entity_id="ent-1")

        assert seen == [("analysis", "doc-character-attr")]

    @pytest.mark.asyncio
    async def test_symbol_interpretation_carries_the_book_id(self):
        """Symbols report as 'imagery' downstream, so the entry point matches."""
        seen: list[tuple[str, str | None]] = []

        def _analyze(**_kw):
            seen.append(get_llm_service_context())
            return object()

        symbol_analysis = AsyncMock()
        symbol_analysis.analyze_symbol.side_effect = _analyze
        agent = AnalysisAgent(
            analysis_service=AsyncMock(), symbol_analysis_service=symbol_analysis
        )

        await agent.analyze_symbol("img-1", "doc-symbol-attr")

        assert seen == [("imagery", "doc-symbol-attr")]

    @pytest.mark.asyncio
    async def test_narrative_analysis_carries_the_document_id(self):
        seen: list[tuple[str, str | None]] = []

        def _refine(**_kw):
            seen.append(get_llm_service_context())
            return SimpleNamespace(
                kernel_event_ids=[],
                satellite_event_ids=[],
                model_dump=dict,
            )

        narrative = AsyncMock()
        narrative.refine_with_llm.side_effect = _refine
        narrative.map_hero_journey.return_value = []
        agent = AnalysisAgent(analysis_service=AsyncMock(), narrative_service=narrative)

        await agent.analyze_narrative("doc-narrative-attr")

        assert seen == [("analysis", "doc-narrative-attr")]


class TestTensionAttribution:
    """Every tension LLM call already holds the document id it belongs to."""

    @pytest.mark.asyncio
    async def test_grouping_call_carries_the_document_id(self):
        from storysphere.services.tension_service import TensionService

        seen: list[tuple[str, str | None]] = []

        class _LLM:
            async def ainvoke(self, _messages):
                seen.append(get_llm_service_context())
                raise ValueError("stop here — the context is already set")

        service = TensionService(cache=AsyncMock())
        service._get_llm = lambda: _LLM()

        with pytest.raises(ValueError):
            await service._call_grouping_llm(
                teus=[], document_id="doc-tension-group", language="en"
            )

        # The call is wrapped in a retry, so what matters is that every attempt
        # was attributed — not how many there were.
        assert seen  # the LLM was actually reached
        assert set(seen) == {("analysis", "doc-tension-group")}


class TestNarrativeAttribution:
    """B-081 — narrative set its own service name but never the book.

    ``set_llm_service_context("analysis")`` leaves ``book_id`` alone when the
    argument is omitted, by design: an entry point sets it once and the services
    underneath inherit. Narrative had no such entry point above it — no router in
    ``api/routers/`` sets a book context — so the contextvar sat at its default
    and every narrative row landed under no book.

    Each test reads the context inside the *first* collaborator the public method
    awaits. That pins the attribution to the entry itself rather than to a
    particular ``ainvoke``, which is what makes it survive later refactors of the
    private call sites.
    """

    @staticmethod
    def _service(seen: list, *, first: str):
        from storysphere.services.narrative_service import NarrativeService

        kg, doc, cache = AsyncMock(), AsyncMock(), AsyncMock()

        def _record(*_a, **_kw):
            seen.append(get_llm_service_context())
            return []          # no events / no cached stages → early return

        if first == "kg":
            kg.get_events.side_effect = _record
        else:
            cache.get_as.side_effect = _record

        return NarrativeService(kg_service=kg, document_service=doc, cache=cache)

    @pytest.mark.asyncio
    async def test_refine_carries_the_document_id(self):
        seen: list[tuple[str, str | None]] = []
        service = self._service(seen, first="kg")

        await service.refine_with_llm("doc-refine-attr")

        assert seen[0] == ("analysis", "doc-refine-attr")

    @pytest.mark.asyncio
    async def test_hero_journey_carries_the_document_id(self):
        seen: list[tuple[str, str | None]] = []
        service = self._service(seen, first="cache")

        await service.map_hero_journey("doc-hero-attr")

        assert seen[0] == ("analysis", "doc-hero-attr")

    @pytest.mark.asyncio
    async def test_temporal_order_carries_the_document_id(self):
        seen: list[tuple[str, str | None]] = []
        service = self._service(seen, first="cache")

        await service.analyze_temporal_order("doc-temporal-attr")

        assert seen[0] == ("analysis", "doc-temporal-attr")

    @pytest.mark.asyncio
    async def test_attribution_is_set_before_any_work_happens(self):
        """A cache hit must not be able to bill the previous book."""
        seen: list[tuple[str, str | None]] = []
        service = self._service(seen, first="cache")
        set_llm_book_context("some-earlier-book")

        await service.map_hero_journey("doc-hero-second")

        assert seen[0] == ("analysis", "doc-hero-second")


class TestChatAttribution:
    """Chat is billed to the book the page context names — and only to it."""

    def _agent(self):
        from storysphere.agents.chat_agent import ChatAgent

        agent = ChatAgent.__new__(ChatAgent)  # no graph, no services needed
        agent._build_messages = lambda *_a, **_kw: []
        return agent

    def _state(self, book_id):
        return SimpleNamespace(book_id=book_id)

    @pytest.mark.asyncio
    async def test_book_scoped_chat_is_attributed(self):
        seen: list[tuple[str, str | None]] = []
        agent = self._agent()

        class _Graph:
            async def ainvoke(self, _payload):
                seen.append(get_llm_service_context())
                return {"messages": []}

        agent._graph = _Graph()
        await agent._agent_invoke("hi", state=self._state("doc-chat-attr"))

        assert seen == [("chat", "doc-chat-attr")]

    @pytest.mark.asyncio
    async def test_leaving_a_book_clears_the_attribution(self):
        """One WebSocket connection is one context: the old book must not stick.

        The page context is re-sent per message, so a session that moves from a
        book page to a global one would otherwise keep billing the book it left.
        """
        seen: list[tuple[str, str | None]] = []
        agent = self._agent()

        class _Graph:
            async def ainvoke(self, _payload):
                seen.append(get_llm_service_context())
                return {"messages": []}

        agent._graph = _Graph()
        await agent._agent_invoke("hi", state=self._state("doc-chat-attr"))
        await agent._agent_invoke("hi again", state=self._state(None))

        assert seen == [("chat", "doc-chat-attr"), ("chat", None)]

    @pytest.mark.asyncio
    async def test_stateless_invoke_is_unattributed(self):
        seen: list[tuple[str, str | None]] = []
        agent = self._agent()

        class _Graph:
            async def ainvoke(self, _payload):
                seen.append(get_llm_service_context())
                return {"messages": []}

        agent._graph = _Graph()
        set_llm_book_context("doc-left-over")
        await agent._agent_invoke("hi")

        assert seen == [("chat", None)]
