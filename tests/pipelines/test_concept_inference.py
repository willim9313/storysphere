"""Tests for pipelines.concept_inference.ConceptInferencePipeline.

The pipeline has never had a caller (B-092), so nothing had ever executed it —
these tests exist to hold the three defects that silence bought: reading a
Paragraph field that does not exist, dropping the back of long books, and
producing concepts the only consumer filters out.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest
from storysphere.domain.documents import Paragraph, ParagraphRole
from storysphere.domain.entities import EntityType
from storysphere.domain.events import Event, EventType
from storysphere.pipelines.concept_inference import (
    PASSAGE_CHAR_BUDGET,
    ConceptInferenceInput,
    ConceptInferencePipeline,
)

_LLM_REPLY = json.dumps(
    [
        {
            "name": "power corrupts even well-intentioned people",
            "description": "The passages show it.",
            "confidence": 0.8,
            "evidence": ["a quote"],
        }
    ]
)


def _make_event(chapter: int, intensity: float = 0.9) -> Event:
    return Event(
        document_id="book-1",
        title=f"Scene in ch{chapter}",
        event_type=EventType.PLOT,
        description="something charged happens",
        chapter=chapter,
        tension_signal="explicit",
        emotional_intensity=intensity,
    )


def _make_paragraph(
    text: str,
    chapter: int = 1,
    position: int = 0,
    role: ParagraphRole = ParagraphRole.body,
) -> Paragraph:
    return Paragraph(text=text, chapter_number=chapter, position=position, role=role)


def _make_pipeline(events, paragraphs_by_chapter, llm_reply: str = _LLM_REPLY):
    kg = AsyncMock()
    kg.get_events.return_value = events

    doc = AsyncMock()

    def _get_paragraphs(document_id, chapter_number=None):
        return paragraphs_by_chapter.get(chapter_number, [])

    doc.get_paragraphs.side_effect = _get_paragraphs

    llm = AsyncMock()
    llm.ainvoke.return_value = type("R", (), {"content": llm_reply})()

    pipeline = ConceptInferencePipeline(llm=llm, kg_service=kg, doc_service=doc)
    return pipeline, kg, doc


class TestGatherPassages:
    @pytest.mark.asyncio
    async def test_reads_paragraph_text_not_a_missing_field(self):
        """The old code read ``p.content``; Paragraph only has ``text``."""
        pipeline, _, _ = _make_pipeline(
            [_make_event(1)], {1: [_make_paragraph("the actual body text")]}
        )

        passages = await pipeline._gather_passages("book-1", [1])

        assert passages == ["the actual body text"]

    @pytest.mark.asyncio
    async def test_skips_non_body_paragraphs(self):
        pipeline, _, _ = _make_pipeline([_make_event(1)], {})
        paragraphs = {
            1: [
                _make_paragraph("* * *", position=0, role=ParagraphRole.separator),
                _make_paragraph("real prose", position=1),
            ]
        }
        pipeline._doc_service.get_paragraphs.side_effect = (
            lambda document_id, chapter_number=None: paragraphs.get(chapter_number, [])
        )

        passages = await pipeline._gather_passages("book-1", [1])

        assert passages == ["real prose"]

    @pytest.mark.asyncio
    async def test_keeps_everything_when_under_budget(self):
        pipeline, _, _ = _make_pipeline(
            [_make_event(1)],
            {1: [_make_paragraph("a" * 100), _make_paragraph("b" * 100, position=1)]},
        )

        passages = await pipeline._gather_passages("book-1", [1])

        assert passages == ["a" * 100, "b" * 100]

    @pytest.mark.asyncio
    async def test_late_chapters_survive_the_budget(self):
        """Front-truncation dropped 70% of a long book, always from the back."""
        chapters = list(range(1, 41))
        by_chapter = {
            ch: [_make_paragraph(f"ch{ch}-p{i} " + "x" * 1000, chapter=ch, position=i)
                 for i in range(3)]
            for ch in chapters
        }
        pipeline, _, _ = _make_pipeline([], by_chapter)

        passages = await pipeline._gather_passages("book-1", chapters)

        assert sum(len(p) for p in passages) <= PASSAGE_CHAR_BUDGET
        joined = "\n".join(passages)
        assert "ch1-" in joined
        assert any(f"ch{ch}-" in joined for ch in range(30, 41)), (
            "the last quarter of the book contributed nothing"
        )

    @pytest.mark.asyncio
    async def test_single_oversized_paragraph_is_truncated_not_dropped(self):
        pipeline, _, _ = _make_pipeline(
            [_make_event(1)], {1: [_make_paragraph("z" * (PASSAGE_CHAR_BUDGET * 2))]}
        )

        passages = await pipeline._gather_passages("book-1", [1])

        assert len(passages) == 1
        assert len(passages[0]) == PASSAGE_CHAR_BUDGET


class TestRun:
    @pytest.mark.asyncio
    async def test_returns_empty_when_no_event_clears_the_threshold(self):
        pipeline, _, doc = _make_pipeline([_make_event(1, intensity=0.1)], {})

        result = await pipeline.run(ConceptInferenceInput(document_id="book-1"))

        assert result == []
        doc.get_paragraphs.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_returns_empty_when_chapters_have_no_body_text(self):
        pipeline, kg, _ = _make_pipeline([_make_event(1)], {1: []})

        result = await pipeline.run(ConceptInferenceInput(document_id="book-1"))

        assert result == []
        kg.add_entity.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_inferred_concepts_carry_the_document_id(self):
        """TEU assembly loads concepts filtered by document_id — without it
        the ``if inferred:`` branch stays unreachable even after a good run."""
        pipeline, _, _ = _make_pipeline([_make_event(1)], {1: [_make_paragraph("prose")]})

        result = await pipeline.run(ConceptInferenceInput(document_id="book-1"))

        assert len(result) == 1
        assert result[0].document_id == "book-1"
        assert result[0].entity_type is EntityType.CONCEPT
        assert result[0].extraction_method == "inferred"

    @pytest.mark.asyncio
    async def test_save_false_skips_the_graph_write(self):
        pipeline, kg, _ = _make_pipeline([_make_event(1)], {1: [_make_paragraph("prose")]})

        result = await pipeline.run(
            ConceptInferenceInput(document_id="book-1", save=False)
        )

        assert len(result) == 1
        kg.add_entity.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_saved_concepts_are_the_returned_ones(self):
        pipeline, kg, _ = _make_pipeline([_make_event(1)], {1: [_make_paragraph("prose")]})

        result = await pipeline.run(ConceptInferenceInput(document_id="book-1"))

        kg.add_entity.assert_awaited_once()
        assert kg.add_entity.await_args.args[0] is result[0]
