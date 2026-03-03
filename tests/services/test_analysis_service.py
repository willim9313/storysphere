"""Unit tests for AnalysisService."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from services.analysis_service import AnalysisService


@pytest.fixture
def mock_llm():
    llm = AsyncMock()
    llm.ainvoke = AsyncMock(
        return_value=MagicMock(content="A deep literary insight.")
    )
    return llm


@pytest.fixture
def service(mock_llm):
    return AnalysisService(llm=mock_llm)


class TestGenerateInsight:
    @pytest.mark.asyncio
    async def test_returns_insight_string(self, service):
        result = await service.generate_insight("Theme of betrayal", "Some context.")
        assert result == "A deep literary insight."

    @pytest.mark.asyncio
    async def test_passes_topic_and_context_to_llm(self, service, mock_llm):
        await service.generate_insight("Symbolism", "The rose represents...")

        call_args = mock_llm.ainvoke.call_args[0][0]
        human_msg = call_args[1].content
        assert "Topic: Symbolism" in human_msg
        assert "The rose represents..." in human_msg

    @pytest.mark.asyncio
    async def test_handles_empty_context(self, service, mock_llm):
        await service.generate_insight("Theme")

        human_msg = mock_llm.ainvoke.call_args[0][0][1].content
        assert "No additional context provided" in human_msg

    @pytest.mark.asyncio
    async def test_lazy_llm_resolution(self):
        """Service without injected LLM resolves lazily."""
        svc = AnalysisService(llm=None)
        # We don't actually call it (would need real LLM), just verify construction
        assert svc._llm is None
