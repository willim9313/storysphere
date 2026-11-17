"""MY4 `info.fair_play_audit`：揭曉章與線索的切分、不適用的兩種情況、LLM 答案的驗證。"""

from __future__ import annotations

import pytest
from storysphere.methods.engine import MethodEngine
from storysphere.methods.implementations import MethodImplementations
from storysphere.methods.info.fair_play_audit import FairPlayAudit, load_rules, split_clues
from storysphere.methods.reader import EvidenceView
from storysphere.methods.universal import _llm
from storysphere.store.evidence_writer import SubjectRef

from tests.methods.char_support import _write, all_evidence, seed_character
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

MY4_ID = "info.fair_play_audit"


@pytest.fixture(autouse=True)
def no_retry_delay(monkeypatch):
    monkeypatch.setattr(_llm, "RETRY_DELAY_S", 0)


def make_engine(sf, llm: ScriptedLlm) -> MethodEngine:
    impls = MethodImplementations()
    impls.register(FairPlayAudit(REGISTRY.methods[MY4_ID]))
    return MethodEngine(sf, REGISTRY, impls, llm_factory=lambda _t: llm, model_info=lambda _t: ("fake", "fake-1"))


def view(eid: str, chapter: int | None, **content) -> EvidenceView:
    return EvidenceView(eid, "x", 1, eid, 0.9, chapter, None, None, content)


class TestSplitClues:
    def test_reveal_chapter_is_the_last_one_the_reader_sees(self):
        # 分批揭曉：第 3 章讀者看得到一部分、第 5 章完整；第 7 章只對角色揭曉，不算
        reveals = [view("r_part", 3, audience="both"), view("r_full", 5, audience="reader"),
                   view("r_char", 7, audience="characters")]  # fmt: skip
        clues = [view("k2", 2), view("k4", 4), view("k5", 5), view("k6", 6), view("k_none", None)]
        split = split_clues(reveals, clues)
        assert split.reveal_chapter == 5
        assert [c.id for c in split.before] == ["k2", "k4"]
        # 揭曉當章與之後、沒有章號的線索都算「揭曉當章及之後」
        assert [c.id for c in split.after] == ["k5", "k6", "k_none"]

    def test_falls_back_to_the_last_reveal_of_any_audience(self):
        reveals = [view("r1", 2, audience="characters"), view("r2", 4, audience="characters")]
        split = split_clues(reveals, [view("k", 3)])
        assert split.reveal_chapter == 4 and [c.id for c in split.before] == ["k"]

    def test_reveals_without_chapters_put_every_clue_before(self):
        split = split_clues([view("r", None, audience="both")], [view("k1", 2), view("k2", 9)])
        assert split.reveal_chapter is None and [c.id for c in split.before] == ["k1", "k2"]


class TestRules:
    def test_only_fairness_relevant_and_not_excluded_rules(self):
        rules = load_rules(REGISTRY.methods[MY4_ID].impl.config)
        keys = {(r["rule_set"], r["rule_no"]) for r in rules}
        assert ("knox", 8) in keys and ("knox", 5) not in keys  # 5 是 excluded
        assert {r["rule_set"] for r in rules} == {"knox", "van_dine"}


async def seed_case(sf, *, concealed_from: str = "both", with_reveal: bool = True) -> dict:
    """一個真相：第 2、3 章各一條線索（第 3 章是誤導、讀者看不到第 2 章那條以外的），第 4 章揭曉，第 5 章再一條。"""
    holmes = await seed_character(sf, "福爾摩斯")
    truth = await _write(sf, "hidden_truth",
                         {"statement": "通加用毒刺殺了巴塞洛謬", "truth_kind": "who", "concealed_from": concealed_from},
                         summary="巴塞洛謬的死因", discourse_chapter=1)  # fmt: skip
    ids = {"holmes": holmes, "truth": truth}

    async def clue(name: str, chapter: int, *, visible: bool = True, misdirection: bool = False) -> str:
        return await _write(sf, "clue_points_to",
                            {"clue_summary": name, "points_to_truth_id": truth, "reader_visible": visible,
                             "is_misdirection": misdirection},
                            summary=name, discourse_chapter=chapter)  # fmt: skip

    ids["k_foot"] = await clue("極小的赤腳腳印", 2)
    ids["k_jones"] = await clue("瓊斯懷疑撒迪厄斯", 3, visible=False, misdirection=True)
    ids["k_late"] = await clue("毒刺的來歷", 5)
    if with_reveal:
        ids["reveal"] = await _write(sf, "reveal",
                                     {"hidden_truth_id": truth, "revealer_id": holmes, "audience": "both",
                                      "reveal_method": "deduction"},
                                     summary="福爾摩斯推出兇手", discourse_chapter=4,
                                     subjects=[SubjectRef(subject_id=holmes, role="revealer")])  # fmt: skip
    return ids


async def run_on(sf, llm, truth: str):
    return await make_engine(sf, llm).run_method(BOOK, MY4_ID, scope=[truth], triggered_by="user")


class TestRun:
    async def test_counts_by_algorithm_verdict_by_llm(self, sf):
        ids = await seed_case(sf)
        llm = ScriptedLlm(lambda _u, _n: fixture_text("method_strong", "MY4_sample"))
        result = await run_on(sf, llm, ids["truth"])
        assert result.outcome == "done" and llm.calls == 1
        (gap,) = await all_evidence(sf, "fairness_gap")
        content = await content_of(sf, gap.id, "fairness_gap")
        assert content["hidden_truth_id"] == ids["truth"] and content["reveal_chapter"] == 4
        assert content["clue_ids_before_reveal"] == [ids["k_foot"], ids["k_jones"]]
        assert (content["reader_visible_count"], content["misdirection_count"]) == (1, 1)
        assert content["verdict"] == "partially_fair"
        # knox 5 不在送出去的規則裡（excluded）→ 丟掉
        assert [(v["rule_set"], v["rule_no"]) for v in content["violations"]] == [("knox", 8)]
        assert gap.level == 2 and gap.discourse_chapter == 4 and gap.confidence == pytest.approx(0.7)
        assert gap.summary.startswith("大致公平")
        (run,) = await runs_of(sf, MY4_ID)
        assert run.prompt_version == "1" and run.summary_json["violations_dropped"] == 1
        assert run.summary_json["clues_after_reveal"] == 1

    async def test_upstream_is_truth_reveal_and_all_clues_shown(self, sf):
        ids = await seed_case(sf)
        llm = ScriptedLlm(lambda _u, _n: fixture_text("method_strong", "MY4_sample"))
        await run_on(sf, llm, ids["truth"])
        (gap,) = await all_evidence(sf, "fairness_gap")
        assert await upstream_of(sf, gap.id) == {ids["truth"], ids["reveal"], ids["k_foot"], ids["k_jones"], ids["k_late"]}
        declared = {r.claim_type for r in REGISTRY.methods[MY4_ID].requires}
        assert declared == {"hidden_truth", "reveal", "clue_points_to"}

    async def test_prompt_uses_short_codes_and_splits_clues(self, sf):
        ids = await seed_case(sf)
        llm = ScriptedLlm(lambda _u, _n: fixture_text("method_strong", "MY4_sample"))
        await run_on(sf, llm, ids["truth"])
        user = llm.users[0]
        before = user.split("CLUES BEFORE THE REVEAL:\n", 1)[1].split("\n\nCLUES AT OR AFTER", 1)[0]
        after = user.split("CLUES AT OR AFTER THE REVEAL:\n", 1)[1].split("\n\nCOUNTS", 1)[0]
        assert "極小的赤腳腳印" in before and "瓊斯懷疑撒迪厄斯" in before and "毒刺的來歷" in after
        assert '"id": "T1"' in user and '"id": "R1"' in user and '"id": "K3"' in after
        assert not any(i in user for i in ids.values())
        assert '"rule_no": 8' in user and '"rule_no": 5,' not in user.split("FAIR-PLAY RULES:", 1)[1].split("van_dine")[0]

    async def test_no_reveal_is_not_applicable_without_llm(self, sf):
        ids = await seed_case(sf, with_reveal=False)
        # 書裡還要有別的揭曉，宣告的前提（exists: reveal）才會成立，輪到這個真相自己的檢查。
        other = await _write(sf, "hidden_truth", {"statement": "另一件事", "truth_kind": "how", "concealed_from": "both"},
                             summary="另一件事", discourse_chapter=1)  # fmt: skip
        await _write(sf, "reveal", {"hidden_truth_id": other, "revealer_id": ids["holmes"], "audience": "both",
                                    "reveal_method": "confession"}, summary="招供", discourse_chapter=2)  # fmt: skip
        llm = ScriptedLlm(lambda _u, _n: fixture_text("method_strong", "MY4_sample"))
        result = await run_on(sf, llm, ids["truth"])
        assert result.outcome == "not_applicable" and llm.calls == 0
        (run,) = result.runs
        assert run.precheck["missing"] == ["reveal"]
        assert await all_evidence(sf, "fairness_gap") == []

    async def test_truth_hidden_only_from_characters_is_not_applicable(self, sf):
        ids = await seed_case(sf, concealed_from="characters")
        llm = ScriptedLlm(lambda _u, _n: fixture_text("method_strong", "MY4_sample"))
        result = await run_on(sf, llm, ids["truth"])
        assert result.outcome == "not_applicable" and llm.calls == 0
        assert "讀者本來就知道" in result.runs[0].precheck["when_useless_even_if_fixed"]


class TestBadAnswers:
    def item(self, **overrides):
        base = {"hidden_truth_id": "T1", "verdict": "fair", "violations": [], "gap_description": "沒有缺口。",
                "summary": "公平。", "derived_from": ["T1"], "confidence": 0.8}
        return base | overrides

    async def test_bad_verdict_is_retried(self, sf):
        ids = await seed_case(sf)
        answers = [reply({"items": [self.item(verdict="mostly")]}), reply({"items": [self.item()]})]
        llm = ScriptedLlm(lambda _u, n: answers[n - 1])
        result = await run_on(sf, llm, ids["truth"])
        assert result.outcome == "done" and llm.calls == 2
        (gap,) = await all_evidence(sf, "fairness_gap")
        assert (await content_of(sf, gap.id, "fairness_gap"))["verdict"] == "fair"

    async def test_two_items_for_one_truth_is_retried(self, sf):
        ids = await seed_case(sf)
        answers = [reply({"items": [self.item(), self.item()]}), reply({"items": [self.item()]})]
        llm = ScriptedLlm(lambda _u, n: answers[n - 1])
        assert (await run_on(sf, llm, ids["truth"])).outcome == "done" and llm.calls == 2

    async def test_unusable_violations_are_dropped(self, sf):
        ids = await seed_case(sf)
        bad = [{"rule_set": "knox", "rule_no": 99, "explanation": "不存在"},
               {"rule_set": "knox", "rule_no": 8, "explanation": ""},
               {"rule_set": "knox", "rule_no": True, "explanation": "布林"},
               "不是物件",
               {"rule_set": "knox", "rule_no": 8, "explanation": "第一次"},
               {"rule_set": "knox", "rule_no": 8, "explanation": "重複"}]  # fmt: skip
        llm = ScriptedLlm(lambda _u, _n: reply({"items": [self.item(verdict="unfair", violations=bad, confidence="高")]}))
        await run_on(sf, llm, ids["truth"])
        (gap,) = await all_evidence(sf, "fairness_gap")
        content = await content_of(sf, gap.id, "fairness_gap")
        assert content["violations"] == [{"rule_set": "knox", "rule_no": 8, "explanation": "第一次"}]
        assert gap.confidence == pytest.approx(0.6)  # 信心不是數字 → 預設

    async def test_abstention_writes_nothing(self, sf):
        ids = await seed_case(sf)
        llm = ScriptedLlm(lambda _u, _n: reply({"items": [], "abstain_reason": "證據太少"}))
        result = await run_on(sf, llm, ids["truth"])
        assert result.outcome == "done" and await all_evidence(sf, "fairness_gap") == []
        (run,) = await runs_of(sf, MY4_ID)
        assert run.summary_json["abstain_reason"] == "證據太少"
