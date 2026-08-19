"""Tests for EpistemicStateService.get_character_knowledge.

The service is only ever mentioned in cache-invalidation tests, so the rule
that decides what a character knows has never been executed by the suite. It
is the whole point of the feature: get the partition wrong and the reader is
told a character knows a secret they were never present for.

The LLM step (``_infer_misbeliefs``) is stubbed — it has its own retry
behaviour and is not what these tests are about.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from storysphere.domain.entities import Entity, EntityType
from storysphere.domain.events import Event, EventType
from storysphere.services.epistemic_state_service import EpistemicStateService

DOC = "book-1"
ALICE = "ent-alice"


def _event(
    event_id: str,
    *,
    participants: list[str] | None = None,
    visibility: str = "public",
) -> Event:
    return Event(
        id=event_id,
        document_id=DOC,
        title=event_id,
        event_type=EventType.OTHER,
        description="…",
        chapter=1,
        participants=participants or [],
        visibility=visibility,
    )


def _alice(document_id: str | None = DOC) -> Entity:
    return Entity(
        id=ALICE, name="Alice", entity_type=EntityType.CHARACTER, document_id=document_id
    )


@pytest.fixture
def cache():
    c = AsyncMock()
    c.get_as = AsyncMock(return_value=None)
    c.set = AsyncMock()
    return c


@pytest.fixture
def kg():
    svc = AsyncMock()
    svc.get_entity = AsyncMock(return_value=_alice())
    svc.get_snapshot = AsyncMock(return_value=([], None, None))
    return svc


@pytest.fixture
def service(kg, cache):
    svc = EpistemicStateService(kg_service=kg, llm=AsyncMock(), cache=cache)
    # The misbelief step is an LLM call with its own retry policy; these tests
    # are about the knowledge partition around it.
    svc._infer_misbeliefs = AsyncMock(return_value=[])
    return svc


async def _knowledge(service, chapter: int = 5):
    return await service.get_character_knowledge(ALICE, DOC, chapter)


# ── What counts as known ─────────────────────────────────────────────────────


class TestKnowledgePartition:
    async def test_an_event_the_character_took_part_in_is_known(self, service, kg):
        kg.get_snapshot.return_value = (
            [_event("ev-1", participants=[ALICE], visibility="secret")], None, None
        )

        state = await _knowledge(service)

        assert [e.id for e in state.known_events] == ["ev-1"]
        assert state.unknown_events == []

    async def test_a_public_event_is_known_even_without_taking_part(self, service, kg):
        kg.get_snapshot.return_value = (
            [_event("ev-1", participants=["someone-else"], visibility="public")], None, None
        )

        state = await _knowledge(service)

        assert [e.id for e in state.known_events] == ["ev-1"]

    @pytest.mark.parametrize("visibility", ["private", "secret"])
    async def test_a_hidden_event_without_the_character_is_unknown(
        self, service, kg, visibility
    ):
        """The case that matters: don't tell the reader Alice knows a secret."""
        kg.get_snapshot.return_value = (
            [_event("ev-1", participants=["someone-else"], visibility=visibility)],
            None, None,
        )

        state = await _knowledge(service)

        assert state.known_events == []
        assert [e.id for e in state.unknown_events] == ["ev-1"]

    async def test_every_event_lands_in_exactly_one_bucket(self, service, kg):
        kg.get_snapshot.return_value = (
            [
                _event("public-out", participants=["other"], visibility="public"),
                _event("secret-in", participants=[ALICE], visibility="secret"),
                _event("secret-out", participants=["other"], visibility="secret"),
                _event("private-in", participants=[ALICE], visibility="private"),
            ],
            None, None,
        )

        state = await _knowledge(service)

        known = {e.id for e in state.known_events}
        unknown = {e.id for e in state.unknown_events}
        assert known == {"public-out", "secret-in", "private-in"}
        assert unknown == {"secret-out"}
        assert known & unknown == set(), "an event was filed twice"

    async def test_no_events_yields_empty_buckets(self, service):
        state = await _knowledge(service)

        assert state.known_events == []
        assert state.unknown_events == []
        assert state.character_name == "Alice"


# ── Guards ───────────────────────────────────────────────────────────────────


class TestGuards:
    async def test_unknown_entity_raises(self, service, kg):
        kg.get_entity = AsyncMock(return_value=None)

        with pytest.raises(ValueError, match="not found"):
            await _knowledge(service)

    async def test_entity_from_another_book_raises(self, service, kg):
        """Cross-book lookups would answer with the wrong story's events."""
        kg.get_entity = AsyncMock(return_value=_alice(document_id="other-book"))

        with pytest.raises(ValueError, match="other-book"):
            await _knowledge(service)

    async def test_entity_without_a_document_is_allowed(self, service, kg):
        """Legacy rows carry no document_id; the guard must not reject them."""
        kg.get_entity = AsyncMock(return_value=_alice(document_id=None))

        state = await _knowledge(service)

        assert state.character_id == ALICE


# ── Caching ──────────────────────────────────────────────────────────────────


class TestCaching:
    async def test_a_hit_short_circuits_the_whole_computation(self, service, kg, cache):
        from storysphere.domain.epistemic_state import CharacterEpistemicState

        cache.get_as = AsyncMock(return_value=CharacterEpistemicState(
            character_id=ALICE, character_name="Alice", up_to_chapter=5,
        ))

        state = await _knowledge(service)

        assert state.character_name == "Alice"
        kg.get_snapshot.assert_not_awaited()
        service._infer_misbeliefs.assert_not_awaited()

    async def test_a_miss_stores_the_result(self, service, cache):
        await _knowledge(service)

        cache.set.assert_awaited_once()

    async def test_the_key_separates_book_character_and_chapter(self, service, cache):
        await _knowledge(service, chapter=7)

        key = cache.get_as.await_args.args[0]
        assert DOC in key
        assert ALICE in key
        assert "7" in key, "chapter missing from the key — a re-read would be wrong"
