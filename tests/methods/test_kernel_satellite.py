"""EV1 `event.kernel_satellite`：機械分類、邊界才交 LLM、有環、髒輸出、經引擎的上游補跑。"""

from __future__ import annotations

import asyncio
import json
import random
from types import SimpleNamespace

import pytest
from storysphere.methods.base import RunContext
from storysphere.methods.reader import EvidenceReader
from storysphere.methods.universal import _llm
from storysphere.methods.universal.kernel_satellite import build_graph, classify

from tests.methods.ev_support import (
    EV1_ID,
    EV2_ID,
    REGISTRY,
    ScriptedLlm,
    content_of,
    evidence_of,
    fixture_text,
    make_engine,
    reply,
    runs_of,
    seed_events,
    seed_link,
    upstream_of,
)
from tests.methods.support import BOOK


@pytest.fixture(autouse=True)
def no_retry_delay(monkeypatch):
    monkeypatch.setattr(_llm, "RETRY_DELAY_S", 0)


def verdict_for(code: str, weight: str = "satellite", **overrides) -> dict:
    item = {"event_id": code, "weight": weight, "rationale": "理由。", "summary": f"{code} 的角色。",
            "derived_from": [code], "confidence": 0.7}
    item.update(overrides)
    return item


def answer(*items) -> str:
    return reply({"items": list(items), "abstain_reason": None})


def target_code(user_text: str) -> str:
    """EV1 prompt 的 TARGET EVENT 那一行 JSON 的 id。"""
    line = user_text.split("TARGET EVENT:\n", 1)[1].splitlines()[0]
    return json.loads(line)["id"]


async def seed_chain_graph(sf):
    """E1→E2→E3→E4 是最長鏈；E5→E4（E5 邊界）；E6 孤立。回傳 (事件 ids, 連結 ids)。"""
    ids = await seed_events(sf, 6)
    edges = [(0, 1), (1, 2), (2, 3), (4, 3)]
    links = [await seed_link(sf, ids[a], ids[b]) for a, b in edges]
    return ids, links


async def roles_by_event(sf) -> dict[str, dict]:
    result = {}
    for evidence in await evidence_of(sf, "event_role"):
        content = await content_of(sf, evidence.id, "event_role")
        result[content["event_id"]] = {"content": content, "evidence": evidence}
    return result


class TestGraph:
    RANK = {c: i for i, c in enumerate("ABCDEFG", start=1)}

    def graph(self, pairs, nodes="ABCDE"):
        return build_graph(list(nodes), pairs, self.RANK)

    def test_longest_chain_marks_every_node_on_any_longest_path(self):
        # A→B→D 與 A→C→D 一樣長：B、C 都在鏈上；E→D 較短
        g = self.graph([("A", "B"), ("A", "C"), ("B", "D"), ("C", "D"), ("E", "D")])
        assert g.chain == {"A", "B", "C", "D"} and g.chain_length == 3
        assert classify(g, "A").weight == "kernel"
        assert classify(g, "E").weight is None  # 出度 1、不在鏈上 → 邊界

    def test_chain_shorter_than_3_nodes_is_no_chain(self):
        g = self.graph([("A", "B")])
        assert g.chain == set()
        assert classify(g, "A").weight is None  # 出度 1，邊界
        assert classify(g, "B").weight == "satellite"
        assert classify(g, "C").weight == "satellite"

    def test_high_out_degree_is_a_kernel_even_off_the_chain(self):
        g = self.graph([("A", "B"), ("B", "C"), ("C", "D"), ("E", "A"), ("E", "B"), ("E", "C")])
        assert "E" in g.chain  # E→A→B→C→D 才是最長鏈
        g = self.graph([("A", "B"), ("B", "C"), ("C", "D"), ("E", "C"), ("E", "D"), ("E", "B")],
                       nodes="ABCDEF")
        assert classify(g, "E").weight == "kernel" or "E" in g.chain

    def test_many_causes_converging_on_an_end_event_is_a_boundary(self):
        g = build_graph(list("ABCDEF"), [("A", "F"), ("B", "F"), ("C", "D"), ("D", "E")],
                        {c: i for i, c in enumerate("ABCDEF", start=1)})
        assert classify(g, "F").weight is None
        assert classify(g, "A").weight is None

    def test_cycle_terminates_and_is_deterministic_under_any_input_order(self):
        pairs = [("A", "B"), ("B", "C"), ("C", "A"), ("C", "D"), ("D", "E")]
        reference = self.graph(pairs)
        assert reference.removed_back_edges == 1  # C→A
        assert reference.chain == {"A", "B", "C", "D", "E"} and reference.chain_length == 5
        for seed_value in range(10):
            shuffled = pairs[:]
            random.Random(seed_value).shuffle(shuffled)
            nodes = list("ABCDE")
            random.Random(seed_value).shuffle(nodes)
            g = build_graph(nodes, shuffled, self.RANK)
            assert (g.chain, g.chain_length, g.removed_back_edges) == (
                reference.chain, reference.chain_length, reference.removed_back_edges)

    def test_self_loops_duplicates_and_unknown_events_are_ignored(self):
        g = self.graph([("A", "A"), ("A", "B"), ("A", "B"), ("A", "Z"), ("Z", "B")])
        assert g.out["A"] == {"B"} and g.inc["B"] == {"A"} and g.removed_back_edges == 0


class TestPrecheck:
    async def test_no_causal_link_is_not_applicable_without_llm_and_without_writes(self, sf):
        await seed_events(sf, 6)
        llm = ScriptedLlm(lambda _u, _n: answer())
        # 只實作 EV1：EV2 不存在，上游補不了；零次 LLM、沒有任何寫入
        result = await make_engine(sf, llm, EV1_ID).run_method(BOOK, EV1_ID, triggered_by="user")
        assert result.outcome == "not_applicable" and llm.calls == 0
        assert await evidence_of(sf, "event_role") == []
        (run,) = await runs_of(sf, EV1_ID)
        assert run.status == "not_applicable" and run.precheck_json["missing"] == ["causal_link"]

    async def test_own_check_explains_why(self, sf):
        await seed_events(sf, 6)
        from storysphere.methods.universal.kernel_satellite import KernelSatellite

        method = KernelSatellite(REGISTRY.methods[EV1_ID])
        async with sf() as session:
            ctx = RunContext(BOOK, method.decl, {}, EvidenceReader(session, BOOK, {"event", "causal_link"}))
            check = await method.check(ctx, None)
        assert not check.ok and check.missing == ("causal_link",)
        assert "EV2" in check.how_to_fix and check.when_useless_even_if_fixed


class TestMechanical:
    async def test_a_graph_without_boundary_events_uses_no_llm(self, sf):
        ids = await seed_events(sf, 5)
        links = [await seed_link(sf, ids[i], ids[i + 1]) for i in range(3)]  # E1→E2→E3→E4；E5 孤立
        llm = ScriptedLlm(lambda _u, _n: answer())
        result = await make_engine(sf, llm, EV1_ID).run_method(BOOK, EV1_ID, triggered_by="user")
        assert result.outcome == "done" and llm.calls == 0
        roles = await roles_by_event(sf)
        assert {i: roles[i]["content"]["weight"] for i in ids} == {
            ids[0]: "kernel", ids[1]: "kernel", ids[2]: "kernel", ids[3]: "kernel", ids[4]: "satellite"}
        # 每個事件一筆；derived_from＝事件＋與它相連的連結（孤立事件只有它自己）。
        # 層級由 derived_from 算出：有連結的是第 3 層，孤立事件只衍生自事件，所以是第 2 層
        assert {i: roles[i]["evidence"].level for i in ids} == {
            ids[0]: 3, ids[1]: 3, ids[2]: 3, ids[3]: 3, ids[4]: 2}
        assert await upstream_of(sf, roles[ids[0]]["evidence"].id) == {ids[0], links[0]}
        assert await upstream_of(sf, roles[ids[1]]["evidence"].id) == {ids[1], links[0], links[1]}
        assert await upstream_of(sf, roles[ids[4]]["evidence"].id) == {ids[4]}
        (run,) = await runs_of(sf, EV1_ID)
        assert run.summary_json["llm_count"] == 0 and run.summary_json["mechanical_count"] == 5
        assert run.prompt_version == "1"
        assert set(links) | set(ids) == set(run.input_evidence_ids)

    async def test_cyclic_causal_graph_finishes_with_the_same_result_each_time(self, sf):
        ids = await seed_events(sf, 5)
        for a, b in [(0, 1), (1, 2), (2, 0), (2, 3)]:
            await seed_link(sf, ids[a], ids[b])
        llm = ScriptedLlm(lambda _u, _n: answer())
        engine = make_engine(sf, llm, EV1_ID)
        first = await engine.run_method(BOOK, EV1_ID, triggered_by="user")
        assert first.outcome == "done"
        snapshot = {k: v["content"]["weight"] for k, v in (await roles_by_event(sf)).items()}
        await engine.run_method(BOOK, EV1_ID, triggered_by="user")
        again = {k: v["content"]["weight"] for k, v in (await roles_by_event(sf)).items()
                 if v["evidence"].status == "current"}
        assert snapshot == again
        assert snapshot[ids[0]] == snapshot[ids[3]] == "kernel" and snapshot[ids[4]] == "satellite"


class TestBoundaryViaLlm:
    async def test_only_the_boundary_event_is_sent_with_its_neighbours_and_never_the_text(self, sf):
        ids, links = await seed_chain_graph(sf)
        llm = ScriptedLlm(lambda _u, _n: fixture_text("method_light", "EV1_sample"))
        result = await make_engine(sf, llm, EV1_ID).run_method(BOOK, EV1_ID, triggered_by="user")
        assert result.outcome == "done"
        assert llm.calls == 1 and target_code(llm.users[0]) == "E5"
        user = llm.users[0]
        assert not any(i in user for i in ids + links)  # 只有代號，沒有 UUID
        assert "福爾摩斯" not in user  # 引文也不給
        # 因果鄰居：E5→E4 這條連出去的連結與事件 E4
        out_section = user.split("CAUSAL LINKS OUT:\n", 1)[1].split("\n\nGRAPH HINT", 1)[0]
        assert '"event_id": "E4"' in out_section
        assert "(none)" in user.split("CAUSAL LINKS IN:\n", 1)[1].split("\n\n", 1)[0]
        assert '"out_degree": 1' in user and '"on_longest_chain": false' in user
        roles = await roles_by_event(sf)
        assert roles[ids[4]]["content"]["weight"] == "satellite"
        assert roles[ids[4]]["evidence"].confidence == 0.7
        assert await upstream_of(sf, roles[ids[4]]["evidence"].id) == {ids[4], links[3]}
        assert [roles[i]["content"]["weight"] for i in ids[:4]] == ["kernel"] * 4
        assert roles[ids[5]]["content"]["weight"] == "satellite"
        (run,) = await runs_of(sf, EV1_ID)
        assert run.summary_json["llm_count"] == 1 and run.summary_json["mechanical_count"] == 5

    async def test_answer_about_another_event_is_retried(self, sf):
        ids, _ = await seed_chain_graph(sf)
        replies = [answer(verdict_for("E1")), answer(verdict_for("E1"), verdict_for("E5", "kernel"))]
        llm = ScriptedLlm(lambda _u, n: replies[n - 1])
        result = await make_engine(sf, llm, EV1_ID).run_method(BOOK, EV1_ID, triggered_by="user")
        assert result.outcome == "done" and llm.calls == 2
        roles = await roles_by_event(sf)
        assert roles[ids[4]]["content"]["weight"] == "kernel"
        assert roles[ids[0]]["content"]["weight"] == "kernel"  # E1 的機械判斷不被模型覆蓋
        assert len(roles) == 6

    async def test_invalid_weight_fails_the_run_after_three_attempts_and_writes_nothing(self, sf):
        await seed_chain_graph(sf)
        llm = ScriptedLlm(lambda _u, _n: answer(verdict_for("E5", "core")))
        result = await make_engine(sf, llm, EV1_ID).run_method(BOOK, EV1_ID, triggered_by="user")
        assert result.outcome == "failed" and llm.calls == 3
        assert await evidence_of(sf, "event_role") == []

    async def test_abstaining_model_falls_back_to_the_graph_hint_with_low_confidence(self, sf):
        ids, _ = await seed_chain_graph(sf)
        llm = ScriptedLlm(lambda _u, _n: reply({"items": [], "abstain_reason": "證據太少"}))
        await make_engine(sf, llm, EV1_ID).run_method(BOOK, EV1_ID, triggered_by="user")
        roles = await roles_by_event(sf)
        assert roles[ids[4]]["content"]["weight"] == "satellite"  # 出度＋入度 = 1 < 3
        assert roles[ids[4]]["evidence"].confidence == 0.4
        (run,) = await runs_of(sf, EV1_ID)
        assert run.summary_json["llm_abstained_count"] == 1

    async def test_rate_limit_goes_through(self, sf):
        await seed_chain_graph(sf)
        llm = ScriptedLlm(lambda _u, _n: Exception("429 quota exceeded"))
        result = await make_engine(sf, llm, EV1_ID).run_method(BOOK, EV1_ID, triggered_by="user")
        assert llm.calls == 1 and result.rate_limited
        assert await evidence_of(sf, "event_role") == []


class TestParallelBoundary:
    async def test_a_later_event_answering_first_gives_the_same_result_as_sequential(self, sf):
        ids = await seed_events(sf, 7)
        # E1→E2→E3→E4 最長鏈；E5→E4、E7→E4 是邊界；E6 孤立
        for a, b in [(0, 1), (1, 2), (2, 3), (4, 3), (6, 3)]:
            await seed_link(sf, ids[a], ids[b])
        last_done = asyncio.Event()

        class LaterEventFirst:
            """E5 要等 E7 答完才答；若不並行就會卡死。"""

            async def ainvoke(self, messages):
                code = target_code(messages[1].content)
                if code == "E5":
                    await last_done.wait()
                    return SimpleNamespace(content=answer(verdict_for("E5", "kernel", summary="五")))
                assert code == "E7"
                out = SimpleNamespace(content=answer(verdict_for("E7", "satellite", summary="七")))
                last_done.set()
                return out

        result = await make_engine(sf, LaterEventFirst(), EV1_ID).run_method(
            BOOK, EV1_ID, triggered_by="user")
        assert result.outcome == "done"
        rows = []
        for e in await evidence_of(sf, "event_role"):
            c = await content_of(sf, e.id, "event_role")
            rows.append((c["event_id"], c["weight"]))
        # 草稿順序是事件順序，與誰先答完無關；每個邊界事件拿到自己的答案
        assert rows == [(ids[0], "kernel"), (ids[1], "kernel"), (ids[2], "kernel"),
                        (ids[3], "kernel"), (ids[4], "kernel"), (ids[5], "satellite"),
                        (ids[6], "satellite")]
        (run,) = await runs_of(sf, EV1_ID)
        assert run.summary_json["llm_count"] == 2


class TestThroughEngine:
    async def test_events_only_book_backfills_ev2_then_runs_ev1(self, sf):
        ids = await seed_events(sf, 6)

        def responder(user, _n):
            if user.startswith("EVENTS"):
                return fixture_text("method_strong", "EV2_sample")
            return fixture_text("method_light", "EV1_sample")

        llm = ScriptedLlm(responder)
        engine = make_engine(sf, llm, EV2_ID, EV1_ID)
        result = await engine.run_method(BOOK, EV1_ID, triggered_by="user")

        assert result.outcome == "done"
        assert [u.method_id for u in result.upstream] == [EV2_ID]
        assert llm.calls == 2  # EV2 一窗＋EV1 一個邊界事件
        (run2,), (run1,) = await runs_of(sf, EV2_ID), await runs_of(sf, EV1_ID)
        assert run2.parent_run_id == run1.id and run1.parent_run_id is None
        assert run2.finished_at <= run1.finished_at
        links, roles = await evidence_of(sf, "causal_link"), await evidence_of(sf, "event_role")
        assert (len(links), len(roles)) == (4, 6)
        # 孤立的 E6 只衍生自事件，層級是 2；其餘 5 筆有連結，是 3
        assert {e.level for e in links} == {2} and sorted(e.level for e in roles) == [2, 3, 3, 3, 3, 3]
        assert {e.run_id for e in links} == {run2.id} and {e.run_id for e in roles} == {run1.id}
        # event_role 的上游只有 event 與 causal_link
        types = {e.id: e.claim_type for e in await evidence_of(sf, "event")} | {
            e.id: "causal_link" for e in links}
        for role in roles:
            assert await upstream_of(sf, role.id) <= set(types)
        assert set(run1.input_evidence_ids) >= set(ids)
