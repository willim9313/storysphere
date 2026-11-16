"""CH5 `character.belief`：已知／未知的累積、只在有 secret 事件的章叫 LLM、不合法的答案。"""

from __future__ import annotations

import pytest
from storysphere.methods.reader import EvidenceView
from storysphere.methods.universal import _llm
from storysphere.methods.universal.belief import classify_events

from tests.methods.char_support import (
    CH5_ID,
    all_evidence,
    make_engine,
    seed_character,
    seed_event,
)
from tests.methods.ev_support import (
    REGISTRY,
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


def event_view(eid: str, chapter: int, rank: int, visibility: str, participants: list[str]) -> EvidenceView:
    return EvidenceView(
        eid, "event", 1, eid, 0.9, chapter, None, None,
        {"chapter": chapter, "text_rank": rank, "visibility": visibility},
        subjects=tuple((p, "participant") for p in participants),
    )


class TestClassifyEvents:
    EVENTS = [
        event_view("pub", 1, 1, "public", ["b"]),
        event_view("priv_a", 1, 2, "private", ["a", "b"]),
        event_view("priv_b", 2, 3, "private", ["b"]),
        event_view("sec_b", 2, 4, "secret", ["b"]),
        event_view("sec_a", 3, 5, "secret", ["a"]),
        event_view("late_pub", 4, 6, "public", ["b"]),
    ]

    def ids(self, views):
        return [v.id for v in views]

    def test_public_for_everyone_private_and_secret_only_for_participants(self):
        known, unknown = classify_events(self.EVENTS, "a", 3)
        assert self.ids(known) == ["pub", "priv_a", "sec_a"]
        assert self.ids(unknown) == ["priv_b", "sec_b"]

    def test_knowledge_accumulates_chapter_by_chapter_and_ignores_later_events(self):
        by_chapter = {n: classify_events(self.EVENTS, "a", n) for n in (1, 2, 3, 4)}
        assert self.ids(by_chapter[1][0]) == ["pub", "priv_a"] and by_chapter[1][1] == []
        assert self.ids(by_chapter[2][1]) == ["priv_b", "sec_b"]
        assert "sec_a" not in self.ids(by_chapter[2][0] + by_chapter[2][1])  # 第 3 章的事件還沒發生
        assert self.ids(by_chapter[4][0]) == ["pub", "priv_a", "sec_a", "late_pub"]
        # 知道的只會增加，不會因為章數增加而變少
        for n in (1, 2, 3):
            assert set(self.ids(by_chapter[n][0])) <= set(self.ids(by_chapter[n + 1][0]))

    def test_a_participant_does_not_learn_of_events_he_was_not_in(self):
        known, unknown = classify_events(self.EVENTS, "b", 4)
        assert self.ids(unknown) == ["sec_a"]  # 華生的 secret 事件福爾摩斯沒參與
        assert len(known) == 5

    def test_order_is_chapter_then_text_rank_whatever_the_input_order(self):
        known, _ = classify_events(list(reversed(self.EVENTS)), "b", 4)
        assert self.ids(known) == ["pub", "priv_a", "priv_b", "sec_b", "late_pub"]


async def seed_story(sf) -> dict:
    """華生（a）與福爾摩斯（b）。第 2 章有一個只有福爾摩斯參與的 secret 事件；第 3 章沒有 secret。"""
    a = await seed_character(sf, "華生", mention_count=50)
    b = await seed_character(sf, "福爾摩斯", mention_count=40)
    e1 = await seed_event(sf, "事件一", 1, 1, [b], visibility="public")
    e4 = await seed_event(sf, "事件四", 1, 2, [a], visibility="private")
    e2 = await seed_event(sf, "事件二", 1, 3, [b], visibility="private")
    e3 = await seed_event(sf, "事件三", 2, 4, [b], visibility="secret")
    e5 = await seed_event(sf, "事件五", 3, 5, [b], visibility="public")
    return {"a": a, "b": b, "e1": e1, "e2": e2, "e3": e3, "e4": e4, "e5": e5}


async def beliefs(sf) -> dict[tuple[str, int], dict]:
    result = {}
    for e in await all_evidence(sf, "belief_state"):
        content = await content_of(sf, e.id, "belief_state")
        result[(content["character_id"], content["up_to_chapter"])] = {"content": content, "evidence": e}
    return result


class TestRun:
    async def test_algorithm_only_chapters_use_no_llm_and_secret_chapter_asks_once(self, sf):
        ids = await seed_story(sf)
        llm = ScriptedLlm(lambda _u, _n: fixture_text("method_light", "CH5_sample"))
        result = await make_engine(sf, llm, CH5_ID).run_method(
            BOOK, CH5_ID, scope=[ids["a"]], triggered_by="user")
        assert result.outcome == "done" and len(result.runs) == 3
        assert llm.calls == 1  # 只有第 2 章有 secret 事件、華生又不知道它
        by = await beliefs(sf)
        c1, c2, c3 = (by[(ids["a"], n)]["content"] for n in (1, 2, 3))
        assert (c1["known_event_ids"], c1["unknown_event_ids"], c1["misbeliefs"]) == (
            [ids["e1"], ids["e4"]], [ids["e2"]], [])
        assert c2["known_event_ids"] == [ids["e1"], ids["e4"]]
        assert c2["unknown_event_ids"] == [ids["e2"], ids["e3"]]
        (misbelief,) = c2["misbeliefs"]
        assert (misbelief["belief"], misbelief["truth"], misbelief["source_event_id"],
                misbelief["confidence"]) == ("以為訪客是來送信的", "訪客其實是來探查的", ids["e3"], 0.7)
        # 第 3 章沒有 secret 事件：即使華生仍不知道第 2 章的事，也不問
        assert c3["known_event_ids"] == [ids["e1"], ids["e4"], ids["e5"]] and c3["misbeliefs"] == []

    async def test_a_participant_of_the_secret_event_is_not_asked(self, sf):
        ids = await seed_story(sf)
        llm = ScriptedLlm(lambda _u, _n: fixture_text("method_light", "CH5_sample"))
        await make_engine(sf, llm, CH5_ID).run_method(BOOK, CH5_ID, scope=[ids["b"]], triggered_by="user")
        assert llm.calls == 0
        c2 = (await beliefs(sf))[(ids["b"], 2)]["content"]
        # 福爾摩斯參與了 secret 事件，所以知道；只有華生的 private 事件他不知道
        assert ids["e3"] in c2["known_event_ids"] and c2["unknown_event_ids"] == [ids["e4"]]
        assert c2["misbeliefs"] == []

    async def test_character_with_no_known_event_is_not_asked(self, sf):
        a = await seed_character(sf, "路人", mention_count=1)
        b = await seed_character(sf, "福爾摩斯")
        await seed_event(sf, "祕密", 1, 1, [b], visibility="secret")
        llm = ScriptedLlm(lambda _u, _n: fixture_text("method_light", "CH5_sample"))
        await make_engine(sf, llm, CH5_ID).run_method(BOOK, CH5_ID, scope=[a], triggered_by="user")
        assert llm.calls == 0
        (state,) = (await beliefs(sf)).values()
        assert state["content"]["known_event_ids"] == [] and len(state["content"]["unknown_event_ids"]) == 1

    async def test_prompt_has_known_events_and_only_the_concealed_ones_without_uuids(self, sf):
        ids = await seed_story(sf)
        llm = ScriptedLlm(lambda _u, _n: fixture_text("method_light", "CH5_sample"))
        await make_engine(sf, llm, CH5_ID).run_method(BOOK, CH5_ID, scope=[ids["a"]], triggered_by="user")
        user = llm.users[0]
        known = user.split("EVENTS THEY KNOW:\n", 1)[1].split("\n\nCONCEALED", 1)[0]
        concealed = user.split("CONCEALED EVENTS THEY DO NOT KNOW:\n", 1)[1]
        assert "UP TO CHAPTER: 2" in user and '"name": "華生"' in user
        assert "事件一" in known and "事件四" in known and "事件二" not in user  # 不知道的 private 不給
        assert "事件五" not in user  # 第 3 章還沒發生
        assert concealed.count("\n") == 0 and "事件三" in concealed and '"id": "E3"' in concealed
        assert not any(i in user for i in ids.values())
        assert "福爾摩斯" not in user  # 引文也不給

    async def test_run_record_levels_and_upstream(self, sf):
        ids = await seed_story(sf)
        llm = ScriptedLlm(lambda _u, _n: fixture_text("method_light", "CH5_sample"))
        await make_engine(sf, llm, CH5_ID).run_method(BOOK, CH5_ID, scope=[ids["a"]], triggered_by="user")
        by = await beliefs(sf)
        state = by[(ids["a"], 2)]["evidence"]
        assert state.level == 2 and state.source == "method" and state.discourse_chapter == 2
        assert await upstream_of(sf, state.id) == {ids["a"], ids["e1"], ids["e2"], ids["e3"], ids["e4"]}
        runs = {r.scope_key: r for r in await runs_of(sf, CH5_ID)}
        run = runs[f"subject:{ids['a']}|chapter:2"]
        assert run.status == "done" and run.prompt_version == "1"
        assert {ids["e3"], ids["a"]} <= set(run.input_evidence_ids)
        assert run.summary_json["llm_called"] is True and run.summary_json["misbelief_count"] == 1
        assert runs[f"subject:{ids['a']}|chapter:1"].summary_json["llm_called"] is False

    def test_declaration_cannot_read_reveal(self):
        decl = REGISTRY.methods[CH5_ID]
        assert {r.claim_type for r in decl.requires} == {"event", "character"}


class TestBadAnswers:
    def answer(self, *items):
        return reply({"items": list(items), "abstain_reason": None})

    def item(self, **overrides):
        base = {"belief": "他以為甲", "truth": "其實乙", "source_event_id": "E3", "summary": "摘要",
                "derived_from": ["E3"], "confidence": 0.6}
        base.update(overrides)
        return base

    async def run_a(self, sf, responder):
        ids = await seed_story(sf)
        llm = ScriptedLlm(responder)
        result = await make_engine(sf, llm, CH5_ID).run_method(
            BOOK, CH5_ID, scope=[ids["a"]], triggered_by="user")
        return ids, llm, result

    async def test_invalid_items_are_dropped_and_valid_ones_kept(self, sf):
        bad = [self.item(source_event_id="E1"), self.item(source_event_id="E99"),
               self.item(belief=""), self.item(truth="  "), "不是物件",
               self.item(confidence="很高")]
        ids, llm, result = await self.run_a(sf, lambda _u, _n: self.answer(*bad))
        assert result.outcome == "done" and llm.calls == 1
        c2 = (await beliefs(sf))[(ids["a"], 2)]["content"]
        # E1 是已知事件、E99 不存在、其餘缺欄位；只剩最後一筆（信心不是數字 → 0.5）
        assert [(m["source_event_id"], m["confidence"]) for m in c2["misbeliefs"]] == [(ids["e3"], 0.5)]
        runs = {r.scope_key: r for r in await runs_of(sf, CH5_ID)}
        assert runs[f"subject:{ids['a']}|chapter:2"].summary_json["misbelief_dropped"] == 5

    async def test_duplicate_belief_about_the_same_event_is_kept_once(self, sf):
        ids, _, _ = await self.run_a(sf, lambda _u, _n: self.answer(self.item(), self.item(truth="別的")))
        assert len((await beliefs(sf))[(ids["a"], 2)]["content"]["misbeliefs"]) == 1

    async def test_abstention_is_a_valid_answer(self, sf):
        ids, llm, result = await self.run_a(sf, lambda _u, _n: reply({"items": [], "abstain_reason": "沒有"}))
        assert result.outcome == "done" and llm.calls == 1
        assert (await beliefs(sf))[(ids["a"], 2)]["content"]["misbeliefs"] == []

    @pytest.mark.parametrize("bad", ["這不是 JSON", reply({"nothing": 1})])
    async def test_unusable_answer_fails_that_run_after_three_attempts_and_writes_nothing_for_it(self, sf, bad):
        ids, llm, result = await self.run_a(sf, lambda _u, _n: bad)
        assert result.outcome == "failed" and llm.calls == 3
        by = await beliefs(sf)
        assert (ids["a"], 2) not in by and {(ids["a"], 1), (ids["a"], 3)} <= set(by)
        statuses = {r.scope_key: r.status for r in await runs_of(sf, CH5_ID)}
        assert statuses[f"subject:{ids['a']}|chapter:2"] == "failed"

    async def test_rate_limit_stops_the_remaining_runs(self, sf):
        ids, llm, result = await self.run_a(sf, lambda _u, _n: Exception("429 quota exceeded"))
        assert llm.calls == 1 and result.rate_limited
        assert (ids["a"], 3) not in await beliefs(sf)


class TestScale:
    async def test_five_characters_by_twelve_chapters_is_sixty_runs(self, sf):
        people = [await seed_character(sf, f"角色{i}", mention_count=100 - i) for i in range(5)]
        rank = 0
        secret_in = {4: people[0], 9: people[1]}
        for chapter in range(1, 13):
            rank += 1
            await seed_event(sf, f"公開事件{chapter}", chapter, rank, [people[chapter % 5]])
            if chapter in secret_in:
                rank += 1
                await seed_event(sf, f"祕密事件{chapter}", chapter, rank, [secret_in[chapter]],
                                 visibility="secret")
        llm = ScriptedLlm(lambda _u, _n: reply({"items": [], "abstain_reason": None}))
        result = await make_engine(sf, llm, CH5_ID).run_method(BOOK, CH5_ID, triggered_by="user")
        assert result.outcome == "done" and len(result.runs) == 60
        assert {r.scope_key for r in result.runs} == {
            f"subject:{p}|chapter:{n}" for p in people for n in range(1, 13)}
        # 第 4 章：除了參與者以外的 4 人各問一次；第 9 章：5 人都有至少一個不知道的 secret
        assert llm.calls == 4 + 5
        assert len(await all_evidence(sf, "belief_state")) == 60
