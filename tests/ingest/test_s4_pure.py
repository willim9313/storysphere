"""S4 的純函式：挑單位、推理擴充、候選組裝、分批、S4b 回應驗證、draft 組裝。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from storysphere.ingest.s4.candidates import (
    build_candidates,
    candidate_line,
    normalize_audience,
    split_batches,
)
from storysphere.ingest.s4.consolidate import (
    Consolidation,
    Truth,
    merge_batch,
    parse_consolidation,
)
from storysphere.ingest.s4.drafts import build_plan, dedupe_plan
from storysphere.ingest.s4.plan import (
    CharacterIndex,
    CharacterInfo,
    main_genre,
    select_units,
    signals_text,
    wants_mystery_extension,
)
from storysphere.ingest.s4.report import S4Report
from storysphere.ingest.s4.stage import required_keys, stage_prompt_version
from storysphere.ingest.units import IngestUnit, UnitParagraph
from storysphere.llm.json_output import extract_json_from_text
from storysphere.llm.prompts import load_prompt

FIXTURES = Path(__file__).parents[1] / "fixtures" / "llm"
LINMO, LAOZHOU = "char-linmo", "char-laozhou"
CHARS = CharacterIndex(
    [CharacterInfo(LINMO, "林默", ("偵探",)), CharacterInfo(LAOZHOU, "老周", ("管家",))]
)
TEXTS = {
    "p1": "管家老周說書房的門從裡面反鎖了，門縫下有一抹紅色的蠟。",
    "p2": "林默當眾宣布：主人是被老周用毒酒害死的。他從窗外爬進去。",
}
U1 = IngestUnit("b:1:0", "b", 1, "zh", (UnitParagraph("p1", TEXTS["p1"]),))
U2 = IngestUnit("b:2:0", "b", 2, "zh", (UnitParagraph("p2", TEXTS["p2"]),))


def signal(mechanism="info_control", strength="weak", quote="q"):
    return {"mechanism": mechanism, "strength": strength, "subtags": ["clue"], "quote": quote}


class TestSelectUnits:
    def test_only_units_with_info_control_weak_or_strong(self):
        units = [U1, U2, IngestUnit("b:3:0", "b", 3, "zh", (UnitParagraph("p3", "x"),))]
        outputs = {
            U1.id: {"signals": [signal(strength="weak")]},
            U2.id: {"signals": [signal("threat", "strong"), signal(strength="strong")]},
            "b:3:0": {"signals": [signal("threat")]},
        }
        selected, texts = select_units(units, outputs)
        assert [u.id for u in selected] == [U1.id, U2.id]
        # 只留 info_control 的訊號
        assert len(texts[U2.id].splitlines()) == 1
        assert json.loads(texts[U2.id])["strength"] == "strong"

    def test_dirty_outputs_are_ignored(self):
        outputs = {U1.id: "oops", U2.id: {"signals": [None, "x", {"mechanism": "info_control"}]}}
        selected, _ = select_units([U1, U2], outputs)
        assert [u.id for u in selected] == [U2.id]
        assert select_units([U1], {}) == ([], {})

    def test_signals_text_empty(self):
        assert signals_text([]) == "(none)"


class TestMysteryExtension:
    def test_override_wins_over_primary(self):
        profile = {"primary": "mystery", "mixed": []}
        assert main_genre(profile, "horror") == "horror"
        assert main_genre(profile, None) == "mystery"
        assert wants_mystery_extension(profile, None)
        assert not wants_mystery_extension(profile, "horror")
        assert wants_mystery_extension({"primary": "horror"}, "mystery")

    def test_mixed_with_mystery(self):
        profile = {
            "primary": "thriller",
            "mixed": [{"genre": "mystery", "score": 0.4, "chapters": []}],
        }
        assert wants_mystery_extension(profile, None)
        assert not wants_mystery_extension(
            {"primary": "thriller", "mixed": [{"genre": "horror"}]}, None
        )

    def test_dirty_profile(self):
        assert not wants_mystery_extension({"primary": 3, "mixed": "x"}, None)
        assert not wants_mystery_extension(None, None)

    def test_prompt_version_shows_both_prompts(self):
        deep = load_prompt("ingest/deep/info_control")
        mystery = load_prompt("ingest/deep/info_control.mystery")
        assert stage_prompt_version(deep, None) == deep.version
        assert stage_prompt_version(deep, mystery) == f"{deep.version}+m{mystery.version}"

    def test_required_keys(self):
        assert required_keys(False) == ("hidden_truth", "reveal")
        assert required_keys(True) == ("hidden_truth", "reveal", "clue_points_to", "trick")


class TestCharacterIndex:
    def test_resolves_id_name_and_unique_alias(self):
        assert CHARS.resolve(LINMO) == LINMO
        assert CHARS.resolve(" 老周 ") == LAOZHOU
        assert CHARS.resolve("管家") == LAOZHOU
        assert CHARS.resolve("不存在") is None
        assert CHARS.resolve(None) is None

    def test_ambiguous_alias_does_not_resolve(self):
        index = CharacterIndex(
            [CharacterInfo("a", "甲", ("先生",)), CharacterInfo("b", "乙", ("先生",))]
        )
        assert index.resolve("先生") is None
        assert index.resolve("甲") == "a"

    def test_prompt_lines(self):
        assert CharacterIndex([]).prompt_lines(with_aliases=True) == "(none)"
        lines = CHARS.prompt_lines(with_aliases=False).splitlines()
        assert json.loads(lines[0]) == {"id": LINMO, "name": "林默"}


def outputs_for_candidates() -> dict:
    return {
        U1.id: {
            "hidden_truth": [
                {
                    "statement": "門為何反鎖",
                    "truth_kind": "how",
                    "concealer_ids": ["老周", "沒這個人"],
                    "concealed_from": "Readers",
                    "quote": "門從裡面反鎖了",
                },
                {"statement": "引文對不上", "quote": "這段話不在原文裡"},
                {"quote": "門從裡面反鎖了"},
                "not a dict",
            ],
            "reveal": [],
            "clue_points_to": [
                {
                    "clue_summary": "紅蠟",
                    "points_to_ids": [LAOZHOU],
                    "reader_visible": "false",
                    "noticed_by_ids": [],
                    "quote": "門縫下有一抹紅色的蠟",
                }
            ],
            "trick": [],
        },
        U2.id: {
            "hidden_truth": [],
            "reveal": [
                {
                    "statement": "兇手是老周",
                    "revealer_id": "林默",
                    "audience": "everyone",
                    "reveal_method": "deduction",
                    "quote": "主人是被老周用毒酒害死的",
                },
                {"statement": "沒有揭曉者", "revealer_id": "路人", "quote": "他從窗外爬進去"},
            ],
            "clue_points_to": "oops",
            "trick": [
                {
                    "description": "從窗外進出",
                    "trick_category": "entry_exit",
                    "quote": "他從窗外爬進去",
                }
            ],
        },
    }


class TestBuildCandidates:
    def build(self, *, mystery=True):
        report = S4Report()
        cands = build_candidates(
            [U1, U2], outputs_for_candidates(), TEXTS, CHARS, report, mystery=mystery
        )
        return cands, report

    def test_ids_are_stable_and_in_reading_order(self):
        cands, _ = self.build()
        assert [(c.id, c.kind, c.unit_id) for c in cands] == [
            ("cand_1", "hidden_truth", U1.id),
            ("cand_2", "clue", U1.id),
            ("cand_3", "reveal", U2.id),
            ("cand_4", "trick", U2.id),
        ]
        again, _ = self.build()
        assert [c.id for c in again] == [c.id for c in cands]

    def test_fields_repaired_and_quotes_located(self):
        cands, report = self.build()
        truth, clue, reveal, trick = cands
        assert truth.data == {
            "truth_kind": "how",
            "concealer_ids": [LAOZHOU],
            "concealed_from": "reader",
        }
        assert truth.quote.paragraph_id == "p1" and truth.chapter == 1
        assert clue.data["reader_visible"] is False and clue.data["points_to_ids"] == [LAOZHOU]
        assert reveal.data == {"revealer_id": LINMO, "audience": None, "reveal_method": "deduction"}
        assert trick.data["trick_category"] == "entry_exit"
        assert report.dropped.get("quote_not_found") == 1
        assert report.dropped.get("revealer_unresolved") == 1
        assert report.dropped.get("malformed_item", 0) >= 2
        assert report.quotes_total == report.quotes_verified + 1
        assert report.candidates == {"hidden_truth": 1, "clue": 1, "reveal": 1, "trick": 1}

    def test_mystery_only_kinds_skipped_without_extension(self):
        cands, _ = self.build(mystery=False)
        assert {c.kind for c in cands} == {"hidden_truth", "reveal"}

    def test_unit_without_output_is_skipped(self):
        report = S4Report()
        assert build_candidates([U1], {}, TEXTS, CHARS, report, mystery=True) == []

    def test_candidate_line_has_summary_chapter_and_quote_but_no_empty_fields(self):
        cands, _ = self.build()
        row = json.loads(candidate_line(cands[0]))
        assert row["id"] == "cand_1" and row["type"] == "hidden_truth" and row["chapter"] == 1
        assert row["summary"] == "門為何反鎖" and "門從裡面反鎖了" in row["quote"]
        assert "noticed_by_ids" not in json.loads(candidate_line(cands[1]))

    def test_normalize_audience(self):
        assert normalize_audience(" Both ") == "both"
        assert normalize_audience("characters") == "characters"
        assert normalize_audience("nobody") is None and normalize_audience(3) is None


class TestSplitBatches:
    def test_batches_of_size_in_order(self):
        cands, _ = TestBuildCandidates().build()
        assert [[c.id for c in b] for b in split_batches(cands, 3)] == [
            ["cand_1", "cand_2", "cand_3"],
            ["cand_4"],
        ]
        assert split_batches([], 150) == []
        assert len(split_batches(cands, 150)) == 1


def parse(**data) -> str:
    return json.dumps(data, ensure_ascii=False)


class TestParseConsolidation:
    def test_fixture_sample(self):
        text = json.loads((FIXTURES / "consolidation" / "sample.json").read_text(encoding="utf-8"))
        result = parse_consolidation(text["response_text"], CHARS, S4Report(), mystery=True)
        assert [t.batch_id for t in result.truths] == ["t1"]
        assert result.truths[0].merged == ["cand_1"] and result.truths[0].reveals == ["cand_4"]
        assert result.clues == [("cand_2", "t1", False), ("cand_3", "t1", True)]
        assert result.tricks == [("cand_5", "t1")]

    def test_deep_fixture_has_the_prompt_keys(self):
        text = json.loads(
            (FIXTURES / "deep_extraction" / "sample.json").read_text(encoding="utf-8")
        )
        data, _ = extract_json_from_text(text["response_text"])
        assert set(required_keys(True)) <= set(data)

    def test_not_json_or_no_truths_fails(self):
        for text in ("抱歉", "[1]", parse(clues=[]), parse(truths="x")):
            with pytest.raises(ValueError):
                parse_consolidation(text, CHARS, S4Report(), mystery=True)

    def test_dirty_entries_are_dropped_not_fatal(self):
        text = parse(
            truths=[
                {
                    "truth_id": "t1",
                    "statement": "ok",
                    "concealer_ids": ["老周", "x"],
                    "concealed_from": "weird",
                    "merged_candidate_ids": "cand_1",
                },
                {"truth_id": "t1", "statement": "重複的 id"},
                {"truth_id": "t2"},
                "junk",
            ],
            clues=[
                {"candidate_id": "cand_2", "truth_id": "t1", "is_misdirection": "yes"},
                {"x": 1},
                3,
            ],
            tricks="oops",
            dropped="cand_9",
        )
        result = parse_consolidation(text, CHARS, S4Report(), mystery=True)
        (truth,) = result.truths
        assert truth.concealer_ids == [LAOZHOU] and truth.concealed_from is None
        assert truth.merged == ["cand_1"]
        assert result.clues == [("cand_2", "t1", None)]
        assert result.tricks == [] and result.dropped == ["cand_9"]

    def test_clues_ignored_without_mystery(self):
        result = parse_consolidation(
            parse(truths=[], clues=[{"candidate_id": "c"}]), CHARS, S4Report(), mystery=False
        )
        assert result.clues == []


def candidates():
    return TestBuildCandidates().build()[0]


def fold(response: dict, *, state=None, batch=None, report=None):
    cands = candidates()
    report = report or S4Report()
    state = state or Consolidation()
    result = parse_consolidation(
        json.dumps(response, ensure_ascii=False), CHARS, report, mystery=True
    )
    merge_batch(state, result, batch or cands, {c.id: c for c in cands}, report)
    return state, report


class TestMergeBatch:
    def test_links_and_unknown_ids(self):
        state, report = fold(
            {
                "truths": [
                    {
                        "truth_id": "t1",
                        "statement": "真相",
                        "merged_candidate_ids": ["cand_1", "cand_2", "nope"],
                        "reveal_candidate_ids": ["cand_3", "cand_1"],
                    }
                ],
                "clues": [{"candidate_id": "cand_2", "truth_id": "t1", "is_misdirection": True}],
                "tricks": [{"candidate_id": "cand_4", "truth_id": "t1"}],
            }
        )
        (truth,) = state.truths.values()
        assert truth.id == "T1" and truth.members == ["cand_1"] and truth.reveals == ["cand_3"]
        assert truth.truth_kind == "how" and truth.concealed_from == "reader"  # 取自候選
        assert truth.concealer_ids == [LAOZHOU]
        assert state.clues["cand_2"].truth_id == "T1" and state.clues["cand_2"].is_misdirection
        assert state.tricks == {"cand_4": "T1"}

    def test_unplaced_truth_candidate_becomes_its_own_truth(self):
        state, report = fold({"truths": []})
        assert [t.members for t in state.truths.values()] == [["cand_1"]]
        assert report.field_drops["orphan_truth"] == 1

    def test_dropped_candidates_are_not_orphans(self):
        state, report = fold({"truths": [], "dropped": ["cand_1"]})
        assert state.truths == {} and "cand_1" in state.dropped
        assert report.dropped["consolidation_dropped"] == 1

    def test_truth_without_valid_candidates_dropped(self):
        state, report = fold(
            {"truths": [{"truth_id": "t1", "statement": "x", "merged_candidate_ids": ["cand_2"]}]}
        )
        assert report.dropped["truth_empty"] == 1
        assert [t.members for t in state.truths.values()] == [["cand_1"]]  # 孤兒補救

    def test_clue_to_unknown_truth_is_unlinked(self):
        state, _ = fold(
            {
                "truths": [],
                "clues": [{"candidate_id": "cand_2", "truth_id": "zzz", "is_misdirection": False}],
            }
        )
        assert state.clues["cand_2"].truth_id is None

    def test_prior_truth_is_absorbed_in_later_batch(self):
        cands = candidates()
        state, report = fold(
            {"truths": [{"truth_id": "t1", "statement": "舊", "merged_candidate_ids": ["cand_1"]}]},
            batch=cands[:2],
        )
        assert list(state.truths) == ["T1"]
        fold(
            {
                "truths": [
                    {
                        "truth_id": "t1",
                        "statement": "新的整合說法",
                        "merged_candidate_ids": ["prior_T1"],
                        "reveal_candidate_ids": ["cand_3"],
                    }
                ],
                "tricks": [{"candidate_id": "cand_4", "truth_id": "t1"}],
            },
            state=state,
            batch=cands[2:],
            report=report,
        )
        (truth,) = state.truths.values()
        assert truth.id == "T1" and truth.statement == "新的整合說法"
        assert truth.members == ["cand_1"] and truth.reveals == ["cand_3"]
        assert state.tricks == {"cand_4": "T1"}


class TestBuildPlan:
    def plan(self, response=None, *, mystery=True):
        response = response or {
            "truths": [
                {
                    "truth_id": "t1",
                    "statement": "老周用毒酒殺人",
                    "merged_candidate_ids": ["cand_1"],
                    "reveal_candidate_ids": ["cand_3"],
                }
            ],
            "clues": [{"candidate_id": "cand_2", "truth_id": "t1", "is_misdirection": None}],
            "tricks": [{"candidate_id": "cand_4", "truth_id": "t1"}],
        }
        state, report = fold(response)
        return build_plan(state, candidates(), report, mystery=mystery), report

    def test_four_types_in_write_order_with_placeholder_links(self):
        planned, _ = self.plan()
        assert [p.claim_type for p in planned] == [
            "hidden_truth",
            "reveal",
            "clue_points_to",
            "trick",
        ]
        truth, reveal, clue, trick = (p.draft for p in planned)
        key = planned[0].key
        assert reveal.content["hidden_truth_id"] == key
        assert clue.content["points_to_truth_id"] == key
        assert trick.content["hidden_truth_id"] == key
        # 第 1 層之間不用 derived_from 連（去重前只暫放自己的 key）
        assert all(
            d.derived_from == [p.key]
            for p, d in zip(planned, (truth, reveal, clue, trick), strict=True)
        )

    def test_truth_fields_position_and_mystery_ext(self):
        planned, _ = self.plan()
        truth = planned[0].draft
        assert truth.content["truth_kind"] == "how" and truth.content["concealed_from"] == "reader"
        assert truth.discourse_chapter == 2  # 揭曉章
        assert truth.known_by.reader is False
        assert [(s.subject_id, s.role) for s in truth.subjects] == [(LAOZHOU, "concealer")]
        (ext,) = truth.genre_ext
        assert ext.genre == "mystery"
        assert ext.data == {"case_type": "other", "mystery_type": "howdunit", "victim_ids": []}

    def test_no_ext_without_mystery_or_derivable_type(self):
        planned, _ = self.plan(mystery=False)
        assert planned[0].draft.genre_ext == []

    def test_reader_visible_from_s4a_and_misdirection_from_s4b(self):
        planned, report = self.plan()
        clue = planned[2].draft
        assert clue.content["reader_visible"] is False  # S4a 的判斷（候選裡是 "false"）
        assert clue.content["is_misdirection"] is False  # S4b 回 null → false
        assert report.field_drops["misdirection_undetermined"] == 1

        planned, _ = self.plan(
            {
                "truths": [
                    {"truth_id": "t1", "statement": "x", "merged_candidate_ids": ["cand_1"]}
                ],
                "clues": [{"candidate_id": "cand_2", "truth_id": "t1", "is_misdirection": True}],
            }
        )
        assert planned[1].draft.content["is_misdirection"] is True

    def test_unlinked_trick_dropped_and_unlinked_clue_kept(self):
        planned, report = self.plan({"truths": []})
        types = [p.claim_type for p in planned]
        assert types == ["hidden_truth", "clue_points_to"]
        assert planned[1].draft.content["points_to_truth_id"] is None
        assert report.dropped["truth_unlinked"] == 1 and report.dropped["reveal_unlinked"] == 1

    def test_unknown_enum_values_are_coerced_or_defaulted(self):
        planned, _ = self.plan(
            {
                "truths": [
                    {
                        "truth_id": "t1",
                        "statement": "x",
                        "truth_kind": "mystery-of-life",
                        "merged_candidate_ids": ["cand_1"],
                        "reveal_candidate_ids": ["cand_3"],
                    }
                ]
            }
        )
        truth = planned[0].draft
        assert (
            truth.content["truth_kind"] == "other"
            and truth.content["raw_label"] == "mystery-of-life"
        )
        assert truth.genre_ext == []  # other 沒有對應的 mystery_type
        assert planned[1].draft.content["audience"] == "both"  # "everyone" → 預設


class TestDedupePlan:
    def test_duplicates_merge_and_keys_map_to_the_survivor(self):
        planned, _ = TestBuildPlan().plan(
            {
                "truths": [
                    {
                        "truth_id": "t1",
                        "statement": "老周用毒酒殺人",
                        "merged_candidate_ids": ["cand_1"],
                    },
                    {"truth_id": "t2", "statement": "老周用毒酒殺人", "merged_candidate_ids": []},
                ]
            }
        )
        # 補一筆同摘要、同章的真相，模擬 S4b 沒合併乾淨
        dup = planned[0]
        copy = type(dup)(
            "hidden_truth:T9", dup.draft.model_copy(update={"derived_from": ["hidden_truth:T9"]})
        )
        kept, canonical = dedupe_plan([dup, copy])
        assert len(kept) == 1 and kept[0].key == dup.key
        assert canonical == {"hidden_truth:T9": dup.key}
        assert kept[0].draft.derived_from == []

    def test_all_derived_from_cleared_for_the_writer(self):
        planned, _ = TestBuildPlan().plan()
        kept, canonical = dedupe_plan(planned)
        assert len(kept) == 4 and canonical == {}
        assert all(p.draft.derived_from == [] for p in kept)


def test_truth_dataclass_defaults():
    truth = Truth("T1", "s", None, None, [], ["c"])
    assert truth.reveals == []
