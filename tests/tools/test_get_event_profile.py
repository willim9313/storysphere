"""Tests for GetEventProfileTool (composite tool #5)."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest

from tools.composite_tools.get_event_profile import GetEventProfileTool


@pytest.fixture
def tool(mock_kg_service, mock_doc_service, mock_vector_service):
    return GetEventProfileTool(
        kg_service=mock_kg_service,
        doc_service=mock_doc_service,
        vector_service=mock_vector_service,
    )


@pytest.mark.asyncio
async def test_full_profile(tool):
    """All three services present — verify all fields populated."""
    result = json.loads(await tool._arun(event_id="evt-meeting"))

    assert result["event"]["id"] == "evt-meeting"
    assert result["event"]["title"] == "The Meeting"
    assert len(result["participants"]) >= 1
    assert isinstance(result["timeline_context"], list)
    assert isinstance(result["relevant_passages"], list)
    assert result["chapter_summary"] is not None


@pytest.mark.asyncio
async def test_event_not_found(tool):
    """Non-existent event ID returns not-found message."""
    result = await tool._arun(event_id="nonexistent")
    assert "not found" in result.lower()


@pytest.mark.asyncio
async def test_kg_only(mock_kg_service):
    """doc_service and vector_service are None — passages=[], summary=None."""
    tool = GetEventProfileTool(
        kg_service=mock_kg_service,
        doc_service=None,
        vector_service=None,
    )
    result = json.loads(await tool._arun(event_id="evt-battle"))

    assert result["event"]["title"] == "The Battle"
    assert result["relevant_passages"] == []
    assert result["chapter_summary"] is None


@pytest.mark.asyncio
async def test_participants_resolved(tool):
    """Participant entity names are correctly resolved."""
    result = json.loads(await tool._arun(event_id="evt-meeting"))

    names = {p["name"] for p in result["participants"]}
    assert "Alice" in names
    assert "Bob" in names


@pytest.mark.asyncio
async def test_unknown_participant_skipped(tool, mock_kg_service):
    """Event with an unknown participant ID doesn't crash — just skips it."""
    # Patch the meeting event to include an unknown participant
    original_get_event = mock_kg_service.get_event.side_effect

    async def _patched(eid):
        evt = await original_get_event(eid)
        if evt is not None and evt.id == "evt-meeting":
            # Add a non-existent participant
            evt = evt.model_copy(update={"participants": evt.participants + ["ent-unknown"]})
        return evt

    mock_kg_service.get_event = AsyncMock(side_effect=_patched)

    result = json.loads(await tool._arun(event_id="evt-meeting"))

    # Known participants are still present, unknown is silently skipped
    names = {p["name"] for p in result["participants"]}
    assert "Alice" in names
    assert "Bob" in names
    assert not any(p["id"] == "ent-unknown" for p in result["participants"])


@pytest.mark.asyncio
async def test_timeline_excludes_current_event(tool):
    """Timeline context should NOT include the queried event itself."""
    result = json.loads(await tool._arun(event_id="evt-meeting"))

    timeline_ids = {e["id"] for e in result["timeline_context"]}
    assert "evt-meeting" not in timeline_ids


@pytest.mark.asyncio
async def test_service_exception_graceful(tool, mock_vector_service):
    """If vector_service.search raises, tool still returns without crashing."""
    mock_vector_service.search = AsyncMock(side_effect=RuntimeError("connection lost"))

    result = json.loads(await tool._arun(event_id="evt-battle"))

    assert result["event"]["title"] == "The Battle"
    assert result["relevant_passages"] == []
