"""EV2 `event.causal_network`：分窗、代號、去重、髒輸出、重試、前提。假 llm＋真實 SQLite。"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from storysphere.methods.universal import _llm
from storysphere.methods.universal.causal_network import (
    WINDOW_OVERLAP,
    WINDOW_SIZE,
    merge_links,
    window_bounds,
)
from storysphere.methods.universal.causal_network import _Link as Link

from tests.methods.ev_support import (
    EV2_ID,
    ScriptedLlm,
    content_of,
    evidence_of,
    fixture_text,
    make_engine,
    reply,
    runs_of,
    seed_events,
    upstream_of,
    window_codes,
)
from tests.methods.support import BOOK, seed
from tests.store.conftest import PARAGRAPHS


@pytest.fixture(autouse=True)
def no_retry_delay(monkeypatch):
    monkeypatch.setattr(_llm, "RETRY_DELAY_S", 0)


def link(cause: str, effect: str, **overrides) -> dict:
    item = {"cause_event_id": cause, "effect_event_id": effect, "link_type": "physical",
            "strength": 0.8, "rationale": "因為。", "summary": f"{cause} 導致 {effect}。",
            "derived_from": [cause, effect], "confidence": 0.7}
    item.update(overrides)
    return item


def answer(*items) -> str:
    return reply({"items": list(items), "abstain_reason": None})


class TestWindows:
    @pytest.mark.parametrize(
        ("total", "expected"),
        [(0, []), (5, [(0, 5)]), (30, [(0, 30)]), (31, [(0, 30), (20, 31)]),
         (50, [(0, 30), (20, 50)]), (51, [(0, 30), (20, 50), (40, 51)]),
         (70, [(0, 30), (20, 50), (40, 70)]), (71, [(0, 30), (20, 50), (40, 70), (60, 71)])],
    )
    def test_30_per_window_overlapping_10(self, total, expected):
        assert (WINDOW_SIZE, WINDOW_OVERLAP) == (30, 10)
        assert window_bounds(total) == expected

    @pytest.mark.parametrize(("count", "windows"), [(30, 1), (31, 2), (50, 2), (70, 3)])
    async def test_one_llm_call_per_window(self, sf, count, windows):
        await seed_events(sf, count)
        llm = ScriptedLlm(lambda _u, _n: answer())
        result = await make_engine(sf, llm, EV2_ID).run_method(BOOK, EV2_ID, triggered_by="user")
        assert result.outcome == "done"
        assert llm.calls == windows
        (run,) = await runs_of(sf, EV2_ID)
        assert run.summary_json["window_count"] == windows
        assert run.summary_json["event_count"] == count

    async def test_windows_overlap_on_the_shared_codes(self, sf):
        await seed_events(sf, 31)
        llm = ScriptedLlm(lambda _u, _n: answer())
        await make_engine(sf, llm, EV2_ID).run_method(BOOK, EV2_ID, triggered_by="user")
        first, second = sorted((window_codes(u) for u in llm.users), key=lambda c: int(c[0][1:]))
        assert first == [f"E{i}" for i in range(1, 31)]
        assert second == [f"E{i}" for i in range(21, 32)]


class TestPrecheck:
    async def test_fewer_than_5_events_is_not_applicable_without_llm(self, sf):
        await seed_events(sf, 4)
        llm = ScriptedLlm(lambda _u, _n: answer())
        result = await make_engine(sf, llm, EV2_ID).run_method(BOOK, EV2_ID, triggered_by="user")
        assert result.outcome == "not_applicable"
        assert llm.calls == 0
        assert await evidence_of(sf, "causal_link") == []
        (run,) = await runs_of(sf, EV2_ID)
        assert run.status == "not_applicable"
        assert "5" in run.precheck_json["missing"][0]
        assert run.precheck_json["how_to_fix"] and run.precheck_json["when_useless_even_if_fixed"]

    async def test_exactly_5_events_runs(self, sf):
        await seed_events(sf, 5)
        llm = ScriptedLlm(lambda _u, _n: answer())
        result = await make_engine(sf, llm, EV2_ID).run_method(BOOK, EV2_ID, triggered_by="user")
        assert result.outcome == "done" and llm.calls == 1


class TestOutput:
    async def test_links_are_valid_level_2_derived_from_events_only(self, sf):
        ids = await seed_events(sf, 6)
        llm = ScriptedLlm(lambda _u, _n: fixture_text("method_strong", "EV2_sample"))
        result = await make_engine(sf, llm, EV2_ID).run_method(BOOK, EV2_ID, triggered_by="user")
        assert result.outcome == "done"
        links = await evidence_of(sf, "causal_link")
        assert len(links) == 4
        assert {e.level for e in links} == {2} and {e.source for e in links} == {"method"}
        pairs = set()
        for evidence in links:
            content = await content_of(sf, evidence.id, "causal_link")
            pairs.add((content["cause_event_id"], content["effect_event_id"]))
            assert await upstream_of(sf, evidence.id) == {
                content["cause_event_id"], content["effect_event_id"]}
        assert pairs == {(ids[0], ids[1]), (ids[1], ids[2]), (ids[2], ids[3]), (ids[4], ids[3])}

    async def test_run_record_has_prompt_version_and_input_ids(self, sf):
        ids = await seed_events(sf, 6)
        llm = ScriptedLlm(lambda _u, _n: answer(link("E1", "E2")))
        await make_engine(sf, llm, EV2_ID).run_method(BOOK, EV2_ID, triggered_by="user")
        (run,) = await runs_of(sf, EV2_ID)
        assert run.prompt_version == "1"
        assert set(run.input_evidence_ids) == set(ids)
        assert run.summary_json["link_count"] == 1

    async def test_code_maps_to_the_evidence_id_and_flashback_direction_is_kept(self, sf):
        ids = await seed_events(sf, 6)
        # 因（E5）在文本中晚於果（E2）：prompt 允許倒敘，原樣保留
        llm = ScriptedLlm(lambda _u, _n: answer(link("E5", "E2", link_type="motivational")))
        await make_engine(sf, llm, EV2_ID).run_method(BOOK, EV2_ID, triggered_by="user")
        (evidence,) = await evidence_of(sf, "causal_link")
        content = await content_of(sf, evidence.id, "causal_link")
        assert (content["cause_event_id"], content["effect_event_id"]) == (ids[4], ids[1])
        assert content["link_type"] == "motivational"
        assert evidence.summary == "E5 導致 E2。"

    async def test_prompt_carries_summaries_and_quotes_not_the_full_text_or_uuids(self, sf):
        ids = await seed_events(sf, 6)
        llm = ScriptedLlm(lambda _u, _n: answer())
        await make_engine(sf, llm, EV2_ID).run_method(BOOK, EV2_ID, triggered_by="user")
        (user,) = llm.users
        assert "事件3的描述" in user and '"quote": "福爾摩斯"' in user
        assert PARAGRAPHS["p-1"] not in user
        assert not any(evidence_id in user for evidence_id in ids)
        assert not any(evidence_id in llm.systems[0] for evidence_id in ids)


class TestMergeAcrossWindows:
    async def test_same_pair_in_two_windows_becomes_one_link_with_the_higher_confidence(self, sf):
        ids = await seed_events(sf, 31)

        def responder(user, _n):
            first_window = window_codes(user)[0] == "E1"
            return answer(link("E22", "E25", confidence=0.6 if first_window else 0.9))

        llm = ScriptedLlm(responder)
        await make_engine(sf, llm, EV2_ID).run_method(BOOK, EV2_ID, triggered_by="user")
        (evidence,) = await evidence_of(sf, "causal_link")
        assert evidence.confidence == 0.9
        content = await content_of(sf, evidence.id, "causal_link")
        assert (content["cause_event_id"], content["effect_event_id"]) == (ids[21], ids[24])
        (run,) = await runs_of(sf, EV2_ID)
        assert run.summary_json["duplicate_links_merged"] == 1

    def test_merge_keeps_the_stronger_on_equal_confidence_and_directions_are_separate(self):
        def make(cause, effect, strength, confidence=0.5):
            return Link(cause, effect, "physical", strength, "", "s", confidence)

        merged = merge_links([make("E1", "E2", 0.3), make("E1", "E2", 0.9), make("E2", "E1", 0.1)])
        assert [(m.cause, m.effect, m.strength) for m in merged] == [
            ("E1", "E2", 0.9), ("E2", "E1", 0.1)]

    async def test_a_code_outside_the_window_is_dropped(self, sf):
        await seed_events(sf, 31)
        # 第 1 窗只有 E1–E30，E31 不在其中
        llm = ScriptedLlm(
            lambda user, _n: answer(link("E1", "E31")) if window_codes(user)[0] == "E1" else answer()
        )
        await make_engine(sf, llm, EV2_ID).run_method(BOOK, EV2_ID, triggered_by="user")
        assert await evidence_of(sf, "causal_link") == []


class TestParallelWindows:
    async def test_a_later_window_finishing_first_gives_the_same_result_as_sequential(self, sf):
        ids = await seed_events(sf, 31)
        second_done = asyncio.Event()

        def answer_of(user: str) -> str:
            # 兩窗都給同一對 E22→E25（信心、強度相同），只有 rationale 能分出是哪一窗
            if window_codes(user)[0] == "E1":
                return answer(link("E22", "E25", rationale="window 1"),
                              link("E3", "E4", rationale="window 1"))
            return answer(link("E22", "E25", rationale="window 2"),
                          link("E26", "E27", rationale="window 2"))

        class SecondWindowFirst:
            """第 1 窗要等第 2 窗答完才答；若不並行就會卡死。"""

            async def ainvoke(self, messages):
                user = messages[1].content
                if window_codes(user)[0] == "E1":
                    await second_done.wait()
                    return SimpleNamespace(content=answer_of(user))
                reply_ = SimpleNamespace(content=answer_of(user))
                second_done.set()
                return reply_

        result = await make_engine(sf, SecondWindowFirst(), EV2_ID).run_method(
            BOOK, EV2_ID, triggered_by="user")
        assert result.outcome == "done"
        rows = []
        for e in await evidence_of(sf, "causal_link"):
            c = await content_of(sf, e.id, "causal_link")
            rows.append((c["cause_event_id"], c["effect_event_id"], c["rationale"]))
        # 依序執行的結果：同一對的勝出者是先出現的第 1 窗；輸出依 text_rank 排序
        assert rows == [
            (ids[2], ids[3], "window 1"), (ids[21], ids[24], "window 1"),
            (ids[25], ids[26], "window 2")]
        (run,) = await runs_of(sf, EV2_ID)
        assert run.summary_json["duplicate_links_merged"] == 1


class TestDirtyOutput:
    async def test_unknown_self_ranked_equal_and_malformed_items_are_dropped(self, sf):
        await seed_events(sf, 5)
        # 與第 5 個事件同 text_rank 的第 6 個事件（E5、E6 同序）
        await seed(sf, "event", title="同序", description="與第五個事件同一個 text_rank。",
                   text_rank=5, chapter=1)
        items = [
            link("E99", "E2"), link("E2", "E2"), link("E5", "E6"), "not a dict", None,
            link("E1", "E2", link_type="magic"), link("E1", "E2", strength="high"),
            link("E1", "E2", strength=7), link("E3", "E4"),
        ]
        llm = ScriptedLlm(lambda _u, _n: answer(*items))
        result = await make_engine(sf, llm, EV2_ID).run_method(BOOK, EV2_ID, triggered_by="user")
        assert result.outcome == "done" and llm.calls == 1
        contents = [await content_of(sf, e.id, "causal_link") for e in await evidence_of(sf, "causal_link")]
        # 只剩 E1→E2（strength 7 被夾成 1.0）與 E3→E4
        assert sorted(c["strength"] for c in contents) == [0.8, 1.0]
        assert len(contents) == 2

    async def test_missing_confidence_falls_back_and_abstain_yields_nothing(self, sf):
        await seed_events(sf, 5)
        item = link("E1", "E2")
        del item["confidence"]
        llm = ScriptedLlm(lambda _u, _n: answer(item))
        await make_engine(sf, llm, EV2_ID).run_method(BOOK, EV2_ID, triggered_by="user")
        (evidence,) = await evidence_of(sf, "causal_link")
        assert evidence.confidence == 0.5

    async def test_abstaining_window_is_valid_and_writes_nothing(self, sf):
        await seed_events(sf, 5)
        llm = ScriptedLlm(lambda _u, _n: reply({"items": [], "abstain_reason": "證據太少"}))
        result = await make_engine(sf, llm, EV2_ID).run_method(BOOK, EV2_ID, triggered_by="user")
        assert result.outcome == "done" and llm.calls == 1
        assert await evidence_of(sf, "causal_link") == []


class TestRetryAndFailure:
    async def test_items_that_is_not_a_list_is_retried_then_succeeds(self, sf):
        await seed_events(sf, 5)
        replies = [reply({"items": "oops"}), "no json at all", answer(link("E1", "E2"))]
        llm = ScriptedLlm(lambda _u, n: replies[n - 1])
        result = await make_engine(sf, llm, EV2_ID).run_method(BOOK, EV2_ID, triggered_by="user")
        assert result.outcome == "done" and llm.calls == 3
        assert len(await evidence_of(sf, "causal_link")) == 1

    async def test_three_failures_fail_the_run_and_write_nothing(self, sf):
        await seed_events(sf, 5)
        llm = ScriptedLlm(lambda _u, _n: reply({"items": "oops"}))
        result = await make_engine(sf, llm, EV2_ID).run_method(BOOK, EV2_ID, triggered_by="user")
        assert result.outcome == "failed" and llm.calls == 3
        assert await evidence_of(sf, "causal_link") == []
        (run,) = await runs_of(sf, EV2_ID)
        assert run.status == "failed" and run.summary_json["error_kind"] == "other"

    async def test_a_failed_later_window_drops_the_earlier_windows_too(self, sf):
        await seed_events(sf, 31)
        llm = ScriptedLlm(
            lambda user, _n: answer(link("E1", "E2")) if window_codes(user)[0] == "E1" else "garbage"
        )
        result = await make_engine(sf, llm, EV2_ID).run_method(BOOK, EV2_ID, triggered_by="user")
        assert result.outcome == "failed" and llm.calls == 1 + 3
        assert await evidence_of(sf, "causal_link") == []

    async def test_rate_limit_is_not_retried_and_reaches_the_engine(self, sf):
        await seed_events(sf, 5)
        llm = ScriptedLlm(lambda _u, _n: Exception("429 Too Many Requests"))
        result = await make_engine(sf, llm, EV2_ID).run_method(BOOK, EV2_ID, triggered_by="user")
        assert llm.calls == 1
        assert result.outcome == "failed" and result.rate_limited
        (run,) = await runs_of(sf, EV2_ID)
        assert run.summary_json["error_kind"] == "rate_limited"
        assert await evidence_of(sf, "causal_link") == []
