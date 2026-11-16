"""CH2 `character.arc`：前提、送給 LLM 的內容、長度上限、髒輸出、經引擎的 run 紀錄。"""

from __future__ import annotations

import pytest
from storysphere.methods.universal import _llm, arc

from tests.methods.char_support import (
    CH2_ID,
    all_evidence,
    make_engine,
    seed_character,
    seed_event,
    seed_relation,
)
from tests.methods.ev_support import (
    ScriptedLlm,
    content_of,
    fixture_text,
    reply,
    runs_of,
    upstream_of,
)
from tests.methods.support import BOOK


@pytest.fixture(autouse=True)
def no_retry_delay(monkeypatch):
    monkeypatch.setattr(_llm, "RETRY_DELAY_S", 0)


def segment(start: int, end: int, **overrides) -> dict:
    item = {"character_id": "C1", "chapter_start": start, "chapter_end": end, "phase": "階段",
            "description": "這一段的變化。", "summary": "摘要。", "derived_from": [], "confidence": 0.7}
    item.update(overrides)
    return item


def answer(*items) -> str:
    return reply({"items": list(items), "abstain_reason": None})


async def filler_relation(sf, character: str, chapter: int = 1) -> None:
    """引擎要求 relation_state 在書裡存在；補一筆發生在已計入的章的關係。"""
    other = await seed_character(sf, "路人", mention_count=1)
    await seed_relation(sf, character, other, chapter, "other")


async def seed_book(sf) -> dict:
    """華生在 1–4 章各有事件、第 2 章與瑪麗有關係；瑪麗只在第 2、4 章出現。刻意不依章節順序寫入。"""
    watson = await seed_character(sf, "華生", mention_count=50)
    mary = await seed_character(sf, "瑪麗", mention_count=20)
    e3 = await seed_event(sf, "事件三", 3, 3, [watson])
    e1 = await seed_event(sf, "事件一", 1, 1, [watson])
    e4 = await seed_event(sf, "事件四", 4, 4, [watson])
    e2 = await seed_event(sf, "事件二", 2, 2, [watson, mary])
    only_mary = await seed_event(sf, "事件五", 4, 5, [mary])
    rel = await seed_relation(sf, watson, mary, 2, "romance", names=("華生", "瑪麗"))
    return {"watson": watson, "mary": mary, "e": [e1, e2, e3, e4], "only_mary": only_mary, "rel": rel}


class TestPrecheck:
    async def test_fewer_than_three_chapters_is_not_applicable_without_llm_or_writes(self, sf):
        ids = await seed_book(sf)
        llm = ScriptedLlm(lambda _u, _n: answer())
        # 瑪麗：事件在第 2、4 章，關係也在第 2 章 → 2 章
        result = await make_engine(sf, llm, CH2_ID).run_method(
            BOOK, CH2_ID, scope=[ids["mary"]], triggered_by="user")
        assert result.outcome == "not_applicable" and llm.calls == 0
        assert await all_evidence(sf, "arc_segment") == []
        (run,) = await runs_of(sf, CH2_ID)
        assert run.status == "not_applicable" and run.scope_key == f"subject:{ids['mary']}"
        assert run.precheck_json["missing"] and "2" in run.precheck_json["missing"][0]
        assert run.precheck_json["when_useless_even_if_fixed"]

    async def test_a_relation_state_in_another_chapter_counts_as_appearing(self, sf):
        a = await seed_character(sf, "甲")
        b = await seed_character(sf, "乙")
        await seed_event(sf, "事件一", 1, 1, [a])
        await seed_event(sf, "事件二", 2, 2, [a])
        await filler_relation(sf, a)
        llm = ScriptedLlm(lambda _u, _n: answer())
        engine = make_engine(sf, llm, CH2_ID)
        first = await engine.run_method(BOOK, CH2_ID, scope=[a], triggered_by="user")
        assert first.outcome == "not_applicable" and llm.calls == 0
        await seed_relation(sf, a, b, 3, "ally")  # 第 3 章只有關係，沒有事件
        second = await engine.run_method(BOOK, CH2_ID, scope=[a], triggered_by="user")
        assert second.outcome == "done" and llm.calls == 1

    async def test_two_events_in_the_same_chapter_are_one_chapter(self, sf):
        a = await seed_character(sf, "甲")
        for rank, chapter in enumerate([1, 1, 2, 2], start=1):
            await seed_event(sf, f"事件{rank}", chapter, rank, [a])
        await filler_relation(sf, a)
        llm = ScriptedLlm(lambda _u, _n: answer())
        result = await make_engine(sf, llm, CH2_ID).run_method(BOOK, CH2_ID, scope=[a], triggered_by="user")
        assert result.outcome == "not_applicable" and llm.calls == 0
        (run,) = await runs_of(sf, CH2_ID)
        assert run.precheck_json["missing"] and "2" in run.precheck_json["missing"][0]


class TestRun:
    async def test_segments_are_written_with_levels_upstream_and_run_record(self, sf):
        ids = await seed_book(sf)
        llm = ScriptedLlm(lambda _u, _n: fixture_text("method_strong", "CH2_sample"))
        result = await make_engine(sf, llm, CH2_ID).run_method(
            BOOK, CH2_ID, scope=[ids["watson"]], triggered_by="user")
        assert result.outcome == "done" and llm.calls == 1
        rows = sorted(await all_evidence(sf, "arc_segment"), key=lambda e: e.discourse_chapter)
        assert [e.level for e in rows] == [2, 2] and all(e.source == "method" for e in rows)
        contents = [await content_of(sf, e.id, "arc_segment") for e in rows]
        assert [(c["chapter_start"], c["chapter_end"], c["character_id"]) for c in contents] == [
            (1, 2, ids["watson"]), (3, 4, ids["watson"])]
        e1, e2, e3, e4 = ids["e"]
        assert await upstream_of(sf, rows[0].id) == {ids["watson"], e1, e2, ids["rel"]}
        assert await upstream_of(sf, rows[1].id) == {ids["watson"], e3, e4}
        (run,) = await runs_of(sf, CH2_ID)
        assert run.scope_key == f"subject:{ids['watson']}" and run.prompt_version == "1"
        assert {*ids["e"], ids["rel"], ids["watson"]} <= set(run.input_evidence_ids)
        assert run.summary_json["segment_count"] == 2 and run.summary_json["events_sent"] == 4

    async def test_default_scope_runs_each_top_character_once(self, sf):
        await seed_book(sf)
        llm = ScriptedLlm(lambda _u, _n: fixture_text("method_strong", "CH2_sample"))
        result = await make_engine(sf, llm, CH2_ID).run_method(BOOK, CH2_ID, triggered_by="user")
        assert sorted(r.status for r in result.runs) == ["done", "not_applicable"]
        assert llm.calls == 1  # 瑪麗只出現 2 章，沒呼叫

    async def test_prompt_is_in_chapter_order_and_only_about_this_character(self, sf):
        ids = await seed_book(sf)
        llm = ScriptedLlm(lambda _u, _n: fixture_text("method_strong", "CH2_sample"))
        await make_engine(sf, llm, CH2_ID).run_method(
            BOOK, CH2_ID, scope=[ids["watson"]], triggered_by="user")
        user = llm.users[0]
        events = user.split("EVENTS:\n", 1)[1].split("\n\nRELATION STATES", 1)[0]
        titles = [t for t in ("事件一", "事件二", "事件三", "事件四") if t in events]
        assert titles == ["事件一", "事件二", "事件三", "事件四"]
        assert [events.index(t) for t in titles] == sorted(events.index(t) for t in titles)
        assert "事件五" not in user  # 只有瑪麗的事件
        relations = user.split("RELATION STATES:\n", 1)[1]
        assert '"other": "瑪麗"' in relations and '"relation_type": "romance"' in relations
        assert '"direction": "outgoing"' in relations
        assert not any(i in user for i in [*ids["e"], ids["rel"], ids["watson"], ids["mary"]])
        assert "福爾摩斯" not in user  # 引文不給

    async def test_character_seen_from_the_other_end_of_a_relation(self, sf):
        ids = await seed_book(sf)
        c = await seed_character(sf, "丙", mention_count=5)
        for rank, chapter in enumerate([1, 2, 3], start=10):
            await seed_event(sf, f"丙事件{chapter}", chapter, rank, [c])
        await seed_relation(sf, ids["watson"], c, 3, "ally", names=("華生", "丙"))
        llm = ScriptedLlm(lambda _u, _n: answer())
        await make_engine(sf, llm, CH2_ID).run_method(BOOK, CH2_ID, scope=[c], triggered_by="user")
        assert '"other": "華生"' in llm.users[0] and '"direction": "incoming"' in llm.users[0]


class TestLengthLimits:
    async def test_per_chapter_cap_prefers_events_with_significance_and_keeps_order(self, sf):
        a = await seed_character(sf, "甲")
        for rank in range(1, 11):  # 第 1 章 10 個事件，只有 9、10 有 significance
            extra = {"significance": "重要"} if rank >= 9 else {}
            await seed_event(sf, f"事件{rank:02d}", 1, rank, [a], **extra)
        await seed_event(sf, "事件11", 2, 11, [a])
        await seed_event(sf, "事件12", 3, 12, [a])
        await filler_relation(sf, a)
        llm = ScriptedLlm(lambda _u, _n: answer())
        await make_engine(sf, llm, CH2_ID).run_method(BOOK, CH2_ID, scope=[a], triggered_by="user")
        events = llm.users[0].split("EVENTS:\n", 1)[1].split("\n\nRELATION STATES", 1)[0].splitlines()
        assert len(events) == arc.EVENTS_PER_CHAPTER + 2
        titles = [line.split('"title": "')[1].split('"')[0] for line in events]
        assert titles == [
            "事件01", "事件02", "事件03", "事件04", "事件05", "事件06", "事件09", "事件10", "事件11", "事件12"]
        (run,) = await runs_of(sf, CH2_ID)
        assert run.summary_json["events_total"] == 12 and run.summary_json["events_sent"] == 10

    async def test_total_cap_and_description_truncation(self, sf, monkeypatch):
        monkeypatch.setattr(arc, "MAX_EVENTS", 5)
        monkeypatch.setattr(arc, "MAX_RELATIONS", 2)
        a = await seed_character(sf, "甲")
        b = await seed_character(sf, "乙")
        for rank in range(1, 9):
            await seed_event(sf, f"事件{rank}", 1 + rank % 4, rank, [a], description="長" * 500)
        for chapter in (1, 2, 3):
            await seed_relation(sf, a, b, chapter, "ally", weight=0.1 * chapter)
        llm = ScriptedLlm(lambda _u, _n: answer())
        await make_engine(sf, llm, CH2_ID).run_method(BOOK, CH2_ID, scope=[a], triggered_by="user")
        user = llm.users[0]
        events, relations = user.split("EVENTS:\n", 1)[1].split("\n\nRELATION STATES:\n")
        assert len(events.splitlines()) == 5 and len(relations.splitlines()) == 2
        assert "長" * (arc.EVENT_DESC_CHARS + 1) not in events and "長" * arc.EVENT_DESC_CHARS + "…" in events
        assert '"chapter": 3' in relations and '"chapter": 2' in relations  # 權重大的兩筆

    async def test_relation_cap_per_chapter(self, sf):
        a = await seed_character(sf, "甲")
        for rank, chapter in enumerate([1, 2, 3], start=1):
            await seed_event(sf, f"事件{rank}", chapter, rank, [a])
        for i in range(6):
            b = await seed_character(sf, f"對象{i}")
            await seed_relation(sf, a, b, 1, "ally", names=("甲", f"對象{i}"), weight=0.1 + i * 0.1)
        llm = ScriptedLlm(lambda _u, _n: answer())
        await make_engine(sf, llm, CH2_ID).run_method(BOOK, CH2_ID, scope=[a], triggered_by="user")
        relations = llm.users[0].split("RELATION STATES:\n", 1)[1].splitlines()
        assert len(relations) == arc.RELATIONS_PER_CHAPTER
        assert all(f"對象{i}" in "\n".join(relations) for i in (2, 3, 4, 5))


class TestDirtyOutput:
    async def run(self, sf, responder):
        ids = await seed_book(sf)
        llm = ScriptedLlm(responder)
        result = await make_engine(sf, llm, CH2_ID).run_method(
            BOOK, CH2_ID, scope=[ids["watson"]], triggered_by="user")
        return ids, llm, result

    async def test_overlapping_segments_are_retried_then_accepted(self, sf):
        replies = [answer(segment(1, 3), segment(3, 4)), answer(segment(1, 2), segment(3, 4))]
        _, llm, result = await self.run(sf, lambda _u, n: replies[n - 1])
        assert result.outcome == "done" and llm.calls == 2
        assert len(await all_evidence(sf, "arc_segment")) == 2

    @pytest.mark.parametrize(
        "bad",
        [
            answer(segment(1, 2), segment(3, 4, phase="")),
            answer(segment(4, 3)),
            answer(segment(1, 9)),
            answer(segment("1", 2)),
            answer(*[segment(i, i) for i in (1, 2, 3, 4)] + [segment(5, 5)] * 3),
            "not json at all",
        ],
    )
    async def test_unusable_answer_fails_after_three_attempts_and_writes_nothing(self, sf, bad):
        _, llm, result = await self.run(sf, lambda _u, _n: bad)
        assert result.outcome == "failed" and llm.calls == 3
        assert await all_evidence(sf, "arc_segment") == []

    async def test_unknown_codes_are_dropped_and_missing_basis_falls_back_to_the_chapter_range(self, sf):
        ids, _, result = await self.run(
            sf, lambda _u, _n: answer(segment(1, 2, derived_from=["E99", "X1"]),
                                      segment(3, 4, derived_from=["E3", "E99"])))
        assert result.outcome == "done"
        rows = sorted(await all_evidence(sf, "arc_segment"), key=lambda e: e.discourse_chapter)
        e1, e2, e3, e4 = ids["e"]
        # 沒有有效依據 → 第 1–2 章內送出去的事件與關係；有一個有效代號就只用它
        assert await upstream_of(sf, rows[0].id) == {ids["watson"], e1, e2, ids["rel"]}
        assert await upstream_of(sf, rows[1].id) == {ids["watson"], e3}

    async def test_segment_without_any_evidence_in_its_range_is_skipped(self, sf):
        a = await seed_character(sf, "甲")
        for rank, chapter in enumerate([1, 2, 5], start=1):
            await seed_event(sf, f"事件{rank}", chapter, rank, [a])
        await filler_relation(sf, a)
        llm = ScriptedLlm(lambda _u, _n: answer(segment(1, 2), segment(3, 4)))
        result = await make_engine(sf, llm, CH2_ID).run_method(BOOK, CH2_ID, scope=[a], triggered_by="user")
        assert result.outcome == "done"
        assert len(await all_evidence(sf, "arc_segment")) == 1  # 第 3–4 章沒有證據

    async def test_abstaining_model_gives_no_segments(self, sf):
        _, _, result = await self.run(
            sf, lambda _u, _n: reply({"items": [], "abstain_reason": "證據太少"}))
        assert result.outcome == "done" and await all_evidence(sf, "arc_segment") == []
        (run,) = await runs_of(sf, CH2_ID)
        assert run.summary_json["abstain_reason"] == "證據太少"

    async def test_flat_character_with_one_segment_is_accepted(self, sf):
        _, _, result = await self.run(sf, lambda _u, _n: answer(segment(1, 4, description="幾乎沒有變化。")))
        assert result.outcome == "done" and len(await all_evidence(sf, "arc_segment")) == 1

    async def test_rate_limit_goes_through_without_retry(self, sf):
        _, llm, result = await self.run(sf, lambda _u, _n: Exception("429 quota exceeded"))
        assert llm.calls == 1 and result.rate_limited
        assert await all_evidence(sf, "arc_segment") == []

    async def test_rerun_replaces_the_previous_segments(self, sf):
        ids, _, _ = await self.run(sf, lambda _u, _n: fixture_text("method_strong", "CH2_sample"))
        llm = ScriptedLlm(lambda _u, _n: answer(segment(1, 4)))
        await make_engine(sf, llm, CH2_ID).run_method(
            BOOK, CH2_ID, scope=[ids["watson"]], triggered_by="user")
        assert len(await all_evidence(sf, "arc_segment")) == 1
