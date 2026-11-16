"""範圍選擇器與預設 plan：純查詢，真實 SQLite，不叫 LLM。"""

from __future__ import annotations

import pytest
from storysphere.methods.base import RunContext, ScopeItem
from storysphere.methods.reader import EvidenceReader, UndeclaredReadError
from storysphere.methods.selectors import ScopeError, default_plan, parse_selector, run_selector

from tests.methods.support import BOOK, decl, seed

ALL_TYPES = ["character", "event", "causal_link", "utterance", "imagery_motif"]


@pytest.fixture
def reader_for(sf):
    async def make(session, types=ALL_TYPES):
        return EvidenceReader(session, BOOK, types)

    return make


async def names(sf, selector: str, types=ALL_TYPES) -> list[str]:
    async with sf() as session:
        items = await run_selector(EvidenceReader(session, BOOK, types), selector)
    return [item.label for item in items]


class TestTopCharacters:
    async def test_persons_by_mention_count_excluding_animals_and_groups(self, sf):
        for name, kind, count in [
            ("甲", "person", 5),
            ("乙", "person", 9),
            ("狗", "animal", 50),
            ("警方", "group", 40),
            ("丙", "person", 1),
        ]:
            await seed(sf, "character", canonical_name=name, kind=kind, mention_count=count)
        assert await names(sf, "top_characters(2)") == ["乙", "甲"]
        assert await names(sf, "top_characters(10)") == ["乙", "甲", "丙"]


class TestMainMotifs:
    async def test_frequency_at_least_three_by_frequency(self, sf):
        for term, freq in [("鏡", 3), ("雨", 7), ("門", 2)]:
            await seed(sf, "imagery_motif", term=term, frequency=freq)
        assert await names(sf, "main_motifs(10)") == ["雨", "鏡"]
        assert await names(sf, "main_motifs(1)") == ["雨"]


class TestEventsWithOutDegree:
    async def test_counts_distinct_effects_per_cause(self, sf):
        e1 = await seed(sf, "event", title="e1", text_rank=1)
        e2 = await seed(sf, "event", title="e2", text_rank=2)
        e3 = await seed(sf, "event", title="e3", text_rank=3)
        for cause, effect in [(e1, e2), (e1, e3), (e2, e3), (e3, e3)]:
            await seed(sf, "causal_link", cause_event_id=cause, effect_event_id=effect)
        # 重複的邊不重複計
        await seed(sf, "causal_link", cause_event_id=e1, effect_event_id=e2)
        assert await names(sf, "events_with_out_degree(2)") == ["e1"]
        assert await names(sf, "events_with_out_degree(1)") == ["e1", "e2", "e3"]


class TestCharactersWithUtterances:
    async def test_at_least_n_utterances_by_count(self, sf):
        a = await seed(sf, "character", canonical_name="甲")
        b = await seed(sf, "character", canonical_name="乙")
        await seed(sf, "character", canonical_name="丙")
        for speaker, times in [(a, 3), (b, 2)]:
            for _ in range(times):
                await seed(sf, "utterance", speaker_id=speaker)
        assert await names(sf, "characters_with_utterances(2)") == ["甲", "乙"]
        assert await names(sf, "characters_with_utterances(3)") == ["甲"]


class TestEventsWithTensionSignal:
    async def test_not_none_in_text_rank_order(self, sf):
        await seed(sf, "event", title="後", text_rank=5, tension_signal="explicit")
        await seed(sf, "event", title="無", text_rank=2, tension_signal="none")
        await seed(sf, "event", title="先", text_rank=1, tension_signal="potential")
        assert await names(sf, "events_with_tension_signal()") == ["先", "後"]


class TestParseSelector:
    @pytest.mark.parametrize(
        "text", ["nope(3)", "top_characters()", "top_characters(0)", "events_with_tension_signal(2)", "x"]
    )
    def test_bad_selector_is_rejected(self, text):
        with pytest.raises(ScopeError):
            parse_selector(text)


class TestReaderGuard:
    async def test_reading_an_undeclared_type_is_refused(self, sf):
        await seed(sf, "character")
        async with sf() as session:
            reader = EvidenceReader(session, BOOK, ["event"])
            with pytest.raises(UndeclaredReadError):
                await reader.list("character")

    async def test_records_ids_read_but_not_counted(self, sf):
        event_id = await seed(sf, "event")
        async with sf() as session:
            reader = EvidenceReader(session, BOOK, ["event"])
            assert await reader.count("event") == 1
            assert reader.read_ids == []
            await reader.list("event")
            assert reader.read_ids == [event_id]


class TestDefaultPlan:
    async def plan(self, sf, method_decl, subject_ids=None) -> list[ScopeItem]:
        async with sf() as session:
            reader = EvidenceReader(
                session, BOOK, {r.claim_type for r in method_decl.requires}
            )
            ctx = RunContext(
                BOOK, method_decl, {}, reader,
                subject_ids=tuple(subject_ids) if subject_ids is not None else None,
            )
            return await default_plan(ctx)

    async def test_book_scope_is_one_item_with_empty_key(self, sf):
        items = await self.plan(sf, decl("m", ["event"], "causal_link"))
        assert [i.key for i in items] == [""]

    async def test_book_scope_with_selector_puts_choice_in_focus_not_key(self, sf):
        hero = await seed(sf, "character", canonical_name="主角", mention_count=9)
        await seed(sf, "character", canonical_name="配角", mention_count=1)
        items = await self.plan(sf, decl("m", ["character"], "journey_stage", selector="top_characters(1)"))
        assert [(i.key, i.focus_ids) for i in items] == [("", (hero,))]

    async def test_per_character_uses_selector_and_key_has_subject(self, sf):
        a = await seed(sf, "character", canonical_name="甲", mention_count=2)
        await seed(sf, "character", canonical_name="乙", mention_count=1)
        items = await self.plan(
            sf, decl("m", ["character"], "archetype", scope="per_character", selector="top_characters(1)")
        )
        assert [i.key for i in items] == [f"subject:{a}"]

    async def test_per_character_chapter_crosses_characters_with_event_chapters(self, sf):
        a = await seed(sf, "character", canonical_name="甲")
        await seed(sf, "event", chapter=2, text_rank=1)
        await seed(sf, "event", chapter=5, text_rank=2)
        await seed(sf, "event", chapter=5, text_rank=3)
        items = await self.plan(
            sf,
            decl("m", ["event", "character"], "belief_state", scope="per_character_chapter",
                 selector="top_characters(5)"),
        )
        assert [i.key for i in items] == [f"subject:{a}|chapter:2", f"subject:{a}|chapter:5"]

    async def test_subject_ids_override_selector_and_must_exist(self, sf):
        a = await seed(sf, "character", canonical_name="甲", mention_count=1)
        await seed(sf, "character", canonical_name="乙", mention_count=9)
        m = decl("m", ["character"], "archetype", scope="per_character", selector="top_characters(1)")
        assert [i.subject_id for i in await self.plan(sf, m, [a])] == [a]
        with pytest.raises(ScopeError):
            await self.plan(sf, m, ["nope"])

    async def test_selector_that_selects_the_wrong_kind_is_an_error(self, sf):
        m = decl("m", ["event"], "event_impact", scope="per_event", selector="top_characters(1)")
        with pytest.raises(ScopeError):
            await self.plan(sf, m)
