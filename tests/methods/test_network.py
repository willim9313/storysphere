"""CH4 `character.network`：純圖運算（分群、中心度、確定性）與經引擎的命名步驟。"""

from __future__ import annotations

import random

import pytest
from storysphere.methods.universal import _llm, network
from storysphere.methods.universal.network import analyze_network, pair_of

from tests.methods.char_support import (
    CH4_ID,
    all_evidence,
    make_engine,
    seed_character,
    seed_relation,
    seed_utterance,
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


def pairs(*triples) -> dict:
    return {pair_of(a, b): w for a, b, w in triples}


def members(result) -> list[tuple[str, ...]]:
    return [f.member_ids for f in result.factions]


# 兩個三人群（a1–a3、b1–b3），中間只有一條弱連結
TWO_GROUPS = pairs(("a1", "a2", 1), ("a2", "a3", 1), ("a1", "a3", 1),
                   ("b1", "b2", 1), ("b2", "b3", 1), ("b1", "b3", 1), ("a3", "b1", 0.2))


class TestAnalyzeNetwork:
    def test_two_obvious_groups(self):
        result = analyze_network(
            ["a1", "a2", "a3", "b1", "b2", "b3"], TWO_GROUPS, {("a3", "b3"): 1.0}, {})
        assert members(result) == [("a1", "a2", "a3"), ("b1", "b2", "b3")]
        assert [f.id for f in result.factions] == ["F1", "F2"]
        assert result.modularity is not None and result.modularity > 0.3
        (link,) = result.inter_faction
        assert (link.a, link.b) == ("F1", "F2")
        assert 0 < link.cooperation < 1 and 0 < link.rivalry < 1
        # a3、b1 各多一條邊，中心度最高
        assert result.centrality["a3"] == result.centrality["b1"] > result.centrality["a1"] > 0
        assert result.factions[0].top_member == "a3"

    def test_isolated_character_is_in_no_faction_and_has_zero_centrality(self):
        result = analyze_network(["a1", "a2", "a3", "b1", "b2", "z"],
                                 pairs(("a1", "a2", 1), ("a2", "a3", 1), ("a1", "a3", 1), ("b1", "b2", 1)),
                                 {}, {})
        assert all("z" not in f.member_ids for f in result.factions)
        assert result.centrality["z"] == 0.0
        assert set(result.centrality) == {"a1", "a2", "a3", "b1", "b2", "z"}

    def test_a_pair_is_a_faction_but_a_lone_node_is_not(self):
        result = analyze_network(["a", "b", "c"], pairs(("a", "b", 1)), {}, {})
        assert members(result) == [("a", "b")]

    def test_only_negative_relations_make_no_factions(self):
        result = analyze_network(["a", "b", "c"], {}, pairs(("a", "b", 1), ("b", "c", 1)), {})
        assert result.factions == [] and result.modularity is None and result.inter_faction == []
        assert result.centrality == {"a": 0.0, "b": 0.0, "c": 0.0}

    def test_enemy_relation_does_not_join_but_marks_rivalry_between_factions(self):
        result = analyze_network(
            ["a1", "a2", "b1", "b2"], pairs(("a1", "a2", 1), ("b1", "b2", 1)), pairs(("a2", "b1", 1)), {})
        assert members(result) == [("a1", "a2"), ("b1", "b2")]
        (link,) = result.inter_faction
        assert link.cooperation == 0 and link.rivalry == 0.25  # 1 / (2 * 2)

    def test_dialogue_alone_can_form_factions(self):
        result = analyze_network(
            ["a", "b", "c", "d"], {}, {}, {pair_of("a", "b"): 6, pair_of("c", "d"): 6})
        assert members(result) == [("a", "b"), ("c", "d")]
        assert result.edges[("a", "b")] == pytest.approx(0.6)

    def test_dialogue_adds_to_a_relation_edge(self):
        result = analyze_network(["a", "b"], pairs(("a", "b", 0.2)), {}, {("a", "b"): 3})
        assert result.edges[("a", "b")] == pytest.approx(0.5)

    def test_dialogue_between_enemies_is_not_an_edge(self):
        result = analyze_network(["a", "b", "c"], pairs(("a", "c", 1)),
                                 pairs(("a", "b", 1)), {("a", "b"): 20})
        assert ("a", "b") not in result.edges
        assert members(result) == [("a", "c")]

    def test_dialogue_between_enemies_who_are_also_allies_still_counts(self):
        result = analyze_network(["a", "b"], pairs(("a", "b", 0.5)), pairs(("a", "b", 1)), {("a", "b"): 2})
        assert result.edges[("a", "b")] == pytest.approx(0.7)

    def test_same_result_whatever_the_input_order(self):
        nodes = ["a1", "a2", "a3", "b1", "b2", "b3", "c1", "c2", "z"]
        positive = {**TWO_GROUPS, pair_of("c1", "c2"): 1.0}
        enemy = {pair_of("a1", "b2"): 1.0, pair_of("c2", "b3"): 0.5}
        dialogue = {pair_of("a1", "c1"): 2, pair_of("b2", "z"): 1}
        reference = analyze_network(nodes, positive, enemy, dialogue)
        for seed_value in range(15):
            rng = random.Random(seed_value)

            def shuffled(d, rng=rng):
                items = list(d.items())
                rng.shuffle(items)
                return dict(items)

            shuffled_nodes = nodes[:]
            rng.shuffle(shuffled_nodes)
            again = analyze_network(shuffled_nodes, shuffled(positive), shuffled(enemy), shuffled(dialogue))
            assert again == reference


async def seed_people(sf, count: int) -> list[str]:
    return [await seed_character(sf, f"角色{i}") for i in range(count)]


NAMES = ("甲", "乙", "丙", "丁", "戊")


async def seed_two_factions(sf) -> list[str]:
    """甲乙丙互為朋友（三人）、丁戊互為朋友（兩人），丙與丁之間只有 enemy 關係。"""
    ids = await seed_people(sf, 5)
    a, b, c, d, e = ids
    for x, y in [(0, 1), (1, 2), (0, 2)]:
        await seed_relation(sf, ids[x], ids[y], 1, "friendship", names=(NAMES[x], NAMES[y]),
                            description=f"{NAMES[x]}與{NAMES[y]}是朋友")
    await seed_relation(sf, d, e, 2, "ally", names=("丁", "戊"), description="丁與戊結盟")
    await seed_relation(sf, c, d, 3, "enemy", names=("丙", "丁"), description="丙與丁敵對")
    await seed_utterance(sf, a, [b], 1, name="甲", text="早安。")
    return ids


class TestPrecheck:
    async def test_fewer_than_three_characters_is_not_applicable_without_llm_or_writes(self, sf):
        a, b = await seed_people(sf, 2)
        await seed_relation(sf, a, b, 1, "ally")
        await seed_utterance(sf, a, [b], 1)
        llm = ScriptedLlm(lambda _u, _n: "")
        result = await make_engine(sf, llm, CH4_ID).run_method(BOOK, CH4_ID, triggered_by="user")
        assert result.outcome == "not_applicable" and llm.calls == 0
        assert await all_evidence(sf, "relation_network") == []
        (run,) = await runs_of(sf, CH4_ID)
        assert run.status == "not_applicable" and run.scope_key == ""
        assert "2" in run.precheck_json["missing"][0] and run.precheck_json["when_useless_even_if_fixed"]

    async def test_a_character_only_in_an_utterance_counts(self, sf):
        a, b, c = await seed_people(sf, 3)
        await seed_relation(sf, a, b, 1, "ally")
        await seed_utterance(sf, a, [c], 1)
        llm = ScriptedLlm(lambda _u, _n: reply({"items": [], "abstain_reason": "x"}))
        result = await make_engine(sf, llm, CH4_ID).run_method(BOOK, CH4_ID, triggered_by="user")
        assert result.outcome == "done"


class TestRun:
    async def test_one_network_with_factions_labels_and_run_record(self, sf):
        ids = await seed_two_factions(sf)
        llm = ScriptedLlm(lambda _u, _n: fixture_text("method_light", "CH4_sample"))
        result = await make_engine(sf, llm, CH4_ID).run_method(BOOK, CH4_ID, triggered_by="user")
        assert result.outcome == "done" and llm.calls == 1
        (row,) = await all_evidence(sf, "relation_network")
        assert row.level == 2 and row.source == "method" and row.discourse_chapter is None
        content = await content_of(sf, row.id, "relation_network")
        assert [(f["id"], f["label"], f["member_ids"]) for f in content["factions"]] == [
            ("F1", "貝克街一方", sorted(ids[:3])), ("F2", "肖爾托家", sorted(ids[3:]))]
        (link,) = content["inter_faction"]
        assert (link["a"], link["b"]) == ("F1", "F2") and link["rivalry"] > 0 and link["cooperation"] == 0
        assert set(content["centrality"]) == set(ids) and content["modularity"] > 0
        # derived_from＝讀到的所有 relation_state 與 utterance
        types = {e.id: e.claim_type for t in ("relation_state", "utterance") for e in await all_evidence(sf, t)}
        assert await upstream_of(sf, row.id) == set(types)
        (run,) = await runs_of(sf, CH4_ID)
        assert run.scope_key == "" and run.prompt_version == "1" and set(run.input_evidence_ids) == set(types)
        assert run.summary_json["faction_count"] == 2 and run.summary_json["naming"] == "done"

    async def test_naming_prompt_has_names_and_strongest_relations_but_no_ids(self, sf):
        ids = await seed_two_factions(sf)
        llm = ScriptedLlm(lambda _u, _n: fixture_text("method_light", "CH4_sample"))
        await make_engine(sf, llm, CH4_ID).run_method(BOOK, CH4_ID, triggered_by="user")
        user = llm.users[0]
        f1, f2 = user.split("FACTIONS:\n", 1)[1].splitlines()
        assert '"faction_id": "F1"' in f1 and all(n in f1 for n in ("甲", "乙", "丙"))
        assert "甲與乙是朋友" in f1 and "丙與丁敵對" not in user  # enemy 不算內部關係
        assert '"faction_id": "F2"' in f2 and "丁與戊結盟" in f2
        assert not any(i in user for i in ids)

    async def test_naming_failure_keeps_the_clustering_and_uses_default_names(self, sf):
        ids = await seed_two_factions(sf)
        engine = make_engine(sf, ScriptedLlm(lambda _u, _n: fixture_text("method_light", "CH4_sample")), CH4_ID)
        await engine.run_method(BOOK, CH4_ID, triggered_by="user")
        (good,) = await all_evidence(sf, "relation_network")
        good_content = await content_of(sf, good.id, "relation_network")

        bad = ScriptedLlm(lambda _u, _n: "這不是 JSON")
        result = await make_engine(sf, bad, CH4_ID).run_method(BOOK, CH4_ID, triggered_by="user")
        assert result.outcome == "done" and bad.calls == 3
        (row,) = await all_evidence(sf, "relation_network")
        content = await content_of(sf, row.id, "relation_network")
        assert [f["member_ids"] for f in content["factions"]] == [f["member_ids"] for f in good_content["factions"]]
        assert content["centrality"] == good_content["centrality"] and content["modularity"] == good_content["modularity"]
        # 預設名稱＝中心度最高的成員＋「一派」（名字來自證據 summary）
        assert [f["label"] for f in content["factions"]] == [
            f"{n}一派" for n in (
                {ids[i]: NAMES[i] for i in range(5)}[
                    min(f["member_ids"], key=lambda c: (-content["centrality"][c], c))]
                for f in content["factions"])]
        (run,) = (r for r in await runs_of(sf, CH4_ID) if r.status == "done" and r.summary_json["naming"] == "failed")
        assert run.summary_json["naming_error"]

    async def test_rate_limit_while_naming_does_not_fail_the_run(self, sf):
        await seed_two_factions(sf)
        llm = ScriptedLlm(lambda _u, _n: Exception("429 quota exceeded"))
        result = await make_engine(sf, llm, CH4_ID).run_method(BOOK, CH4_ID, triggered_by="user")
        assert result.outcome == "done" and llm.calls == 1 and not result.rate_limited
        (row,) = await all_evidence(sf, "relation_network")
        assert len((await content_of(sf, row.id, "relation_network"))["factions"]) == 2

    async def test_abstaining_model_gives_default_names(self, sf):
        await seed_two_factions(sf)
        llm = ScriptedLlm(lambda _u, _n: reply({"items": [], "abstain_reason": "太少"}))
        await make_engine(sf, llm, CH4_ID).run_method(BOOK, CH4_ID, triggered_by="user")
        (row,) = await all_evidence(sf, "relation_network")
        labels = [f["label"] for f in (await content_of(sf, row.id, "relation_network"))["factions"]]
        assert all(label.endswith("一派") for label in labels)
        (run,) = await runs_of(sf, CH4_ID)
        assert run.summary_json["naming"] == "abstained"

    async def test_unknown_faction_ids_and_unusable_labels_are_ignored(self, sf):
        await seed_two_factions(sf)
        items = [{"faction_id": "F9", "label": "不存在"}, {"faction_id": "F1", "label": "好" * 80},
                 {"faction_id": "F2", "label": "戊的一夥", "summary": "x"}]
        llm = ScriptedLlm(lambda _u, _n: reply({"items": items, "abstain_reason": None}))
        await make_engine(sf, llm, CH4_ID).run_method(BOOK, CH4_ID, triggered_by="user")
        (row,) = await all_evidence(sf, "relation_network")
        labels = [f["label"] for f in (await content_of(sf, row.id, "relation_network"))["factions"]]
        assert labels[0].endswith("一派") and labels[1] == "戊的一夥"

    async def test_without_positive_relations_there_are_no_factions_and_no_llm(self, sf):
        a, b, c = await seed_people(sf, 3)
        await seed_relation(sf, a, b, 1, "enemy")
        await seed_relation(sf, b, c, 1, "enemy")
        await seed_utterance(sf, a, [], 1)  # requires 兩種證據都要有；沒有受話者就不成邊
        llm = ScriptedLlm(lambda _u, _n: "")
        result = await make_engine(sf, llm, CH4_ID).run_method(BOOK, CH4_ID, triggered_by="user")
        assert result.outcome == "done" and llm.calls == 0
        (row,) = await all_evidence(sf, "relation_network")
        content = await content_of(sf, row.id, "relation_network")
        assert content["factions"] == [] and content["modularity"] is None
        assert set(content["centrality"]) == {a, b, c}
        (run,) = await runs_of(sf, CH4_ID)
        assert run.summary_json["naming"] == "skipped"

    async def test_rerun_gives_the_same_content_and_replaces_the_old_network(self, sf):
        await seed_two_factions(sf)
        engine = make_engine(sf, ScriptedLlm(lambda _u, _n: fixture_text("method_light", "CH4_sample")), CH4_ID)
        await engine.run_method(BOOK, CH4_ID, triggered_by="user")
        (first,) = await all_evidence(sf, "relation_network")
        first_content = await content_of(sf, first.id, "relation_network")
        await engine.run_method(BOOK, CH4_ID, triggered_by="user")
        (second,) = await all_evidence(sf, "relation_network")
        assert second.id != first.id
        assert await content_of(sf, second.id, "relation_network") == first_content


class TestNames:
    def test_names_come_from_the_summary_format_and_are_absent_when_unparseable(self):
        from storysphere.methods.reader import EvidenceView

        def view(summary, **content):
            return EvidenceView("x", "t", 1, summary, 0.9, 1, None, None, content)

        names = network.member_names(
            [view("甲 → 乙（ally）關係", source_id="c1", target_id="c2"),
             view("沒有固定格式", source_id="c3", target_id="c4")],
            [view("丙：你好", speaker_id="c5"), view("沒有冒號", speaker_id="c6")],
        )
        assert names == {"c1": "甲", "c2": "乙", "c5": "丙"}
