"""S2 的純函式：角色合併、段落標記、引文定位、名字換 id、意象分群、書籍背景、text_rank。"""

from __future__ import annotations

import pytest
from storysphere.domain.evidence import EventContent, RelationStateContent
from storysphere.ingest.s2.characters import (
    MergedCharacter,
    RawCharacter,
    merge_characters,
    name_key,
)
from storysphere.ingest.s2.common import UnitView, clean_content
from storysphere.ingest.s2.drafts import NameResolver, assign_text_rank
from storysphere.ingest.s2.imagery import cluster_terms
from storysphere.ingest.s2.locate import find_quote
from storysphere.ingest.s2.motifs import setting_drafts
from storysphere.ingest.s2.parse import list_items
from storysphere.ingest.s2.report import S2Report
from storysphere.ingest.s2.tagging import build_surface_map, compile_pattern, tag_paragraph
from storysphere.ingest.units import IngestUnit, UnitParagraph
from storysphere.store.evidence_writer import EvidenceDraft

from tests.store.conftest import make_draft


def raw(name: str, aliases: list[str] | None = None, chapter: int = 1, kind: str = "person"):
    return RawCharacter(
        name=name,
        kind=kind,
        aliases=aliases or [],
        description=None,
        attributes={},
        chapter=chapter,
    )


def names(merged: list[MergedCharacter]) -> set[str]:
    return {c.canonical_name for c in merged}


def find(merged: list[MergedCharacter], name: str) -> MergedCharacter:
    return next(c for c in merged if c.canonical_name == name)


class TestNameKey:
    def test_ignores_case_punctuation_and_width(self):
        assert name_key("Sherlock  Holmes!") == name_key("sherlock holmes")
        assert name_key("夏洛克·福爾摩斯") == "夏洛克福爾摩斯"
        assert name_key("ＡＢＣ") == "abc"

    def test_punctuation_only_is_empty(self):
        assert name_key("…「」") == ""


class TestMergeCharacters:
    def test_same_name_across_units_merges_and_aggregates(self):
        merged = merge_characters(
            [raw("林默", ["偵探"], 1), raw("林默", ["林先生"], 3), raw("林默", [], 2)]
        )
        (hero,) = merged
        assert hero.canonical_name == "林默"
        assert hero.mention_count == 3
        assert (hero.first_chapter, hero.last_chapter) == (1, 3)
        assert hero.aliases == ["偵探", "林先生"]

    def test_alias_that_is_another_name_merges(self):
        merged = merge_characters([raw("福爾摩斯", [], 1), raw("夏洛克·福爾摩斯", ["福爾摩斯"], 2)])
        assert len(merged) == 1

    def test_most_mentioned_name_is_canonical(self):
        merged = merge_characters(
            [
                raw("福爾摩斯", [], 1),
                raw("福爾摩斯", [], 2),
                raw("夏洛克·福爾摩斯", ["福爾摩斯"], 3),
            ]
        )
        assert [c.canonical_name for c in merged] == ["福爾摩斯"]
        assert merged[0].aliases == ["夏洛克·福爾摩斯"]

    def test_name_plus_own_title_merges(self):
        merged = merge_characters([raw("華生", ["醫生"]), raw("華生醫生", ["我"])])
        assert len(merged) == 1

    def test_shared_surname_alias_does_not_merge_brothers(self):
        merged = merge_characters(
            [
                raw("撒迪厄斯·肖爾托", ["肖爾托先生"]),
                raw("巴塞洛謬·肖爾托", ["肖爾托先生"]),
                raw("肖爾托先生", []),
            ]
        )
        assert names(merged) == {"撒迪厄斯·肖爾托", "巴塞洛謬·肖爾托", "肖爾托先生"}

    def test_father_and_children_stay_apart(self):
        merged = merge_characters(
            [
                raw("肖爾托少校", ["少校", "肖爾托"]),
                raw("撒迪厄斯·肖爾托", ["肖爾托"]),
                raw("少校", []),
            ]
        )
        # 「少校」只有一組把它當別名 → 併入少校；但兩個兒子不會因為「肖爾托」併進來。
        assert find(merged, "肖爾托少校").mention_count == 2
        assert "撒迪厄斯·肖爾托" in names(merged)

    def test_pronoun_alias_is_not_a_link(self):
        merged = merge_characters([raw("華生", ["我"]), raw("薩希卜", ["我"]), raw("我", [])])
        assert len(merged) == 3

    def test_father_and_daughter_with_title_alias_stay_apart(self):
        merged = merge_characters(
            [
                raw("莫斯坦上尉", ["莫斯坦"]),
                raw("莫斯坦小姐", ["莫斯坦"]),
                raw("莫斯坦", []),
            ]
        )
        assert {"莫斯坦上尉", "莫斯坦小姐"} <= names(merged)

    def test_chinese_and_latin_names_are_not_judged_unrelated(self):
        merged = merge_characters(
            [
                raw("巴塞洛謬", ["巴塞洛謬兄"]),
                raw("Bartholomew", ["巴塞洛謬兄"]),
                raw("巴塞洛謬兄", []),
            ]
        )
        assert len(merged) == 1

    def test_canonical_never_a_single_character_name(self):
        merged = merge_characters(
            [raw("我", ["華生醫生"]), raw("我", []), raw("我", []), raw("華生醫生", [])]
        )
        assert [c.canonical_name for c in merged] == ["華生醫生"]
        assert "我" in merged[0].member_names

    def test_kind_by_majority_and_empty_names_skipped(self):
        merged = merge_characters(
            [
                raw("警察", kind="group"),
                raw("警察", kind="group"),
                raw("警察", kind="person"),
                raw("…"),
            ]
        )
        assert [(c.canonical_name, c.kind) for c in merged] == [("警察", "group")]

    def test_empty_input(self):
        assert merge_characters([]) == []


def chars(*specs: tuple[str, list[str]]) -> list[MergedCharacter]:
    return merge_characters([raw(name, aliases) for name, aliases in specs])


class TestTagging:
    def hits(self, text: str, characters: list[MergedCharacter]):
        surface_map = build_surface_map(characters)
        pattern = compile_pattern(surface_map)
        return [
            (characters[h.character_index].canonical_name, h.surface, h.start, h.end)
            for h in tag_paragraph(text, pattern, surface_map)
        ]

    def test_name_and_alias_offsets(self):
        characters = chars(("夏洛克·福爾摩斯", ["福爾摩斯"]))
        text = "福爾摩斯看了看夏洛克·福爾摩斯的信。"
        assert self.hits(text, characters) == [
            ("夏洛克·福爾摩斯", "福爾摩斯", 0, 4),
            ("夏洛克·福爾摩斯", "夏洛克·福爾摩斯", 7, 15),
        ]

    def test_longest_surface_wins(self):
        characters = chars(("福爾摩斯", []), ("福爾摩斯先生", []))
        assert self.hits("福爾摩斯先生到了", characters) == [("福爾摩斯先生", "福爾摩斯先生", 0, 6)]

    def test_single_character_surfaces_are_not_tagged(self):
        assert self.hits("我看見他了", chars(("華生", ["我", "他"]))) == []

    def test_surface_claimed_by_two_characters_is_skipped(self):
        characters = chars(("華生", ["朋友"]), ("福爾摩斯", ["朋友"]))
        assert self.hits("朋友來了", characters) == []

    def test_descriptive_alias_is_not_tagged(self):
        # 「朋友」不是名字的一部分，是描述語
        assert self.hits("朋友來了", chars(("華生", ["朋友"]))) == []

    def test_shared_surname_alias_is_not_tagged(self):
        characters = chars(
            ("撒迪厄斯·肖爾托", ["肖爾托"]),
            ("巴塞洛謬·肖爾托", []),
        )
        assert self.hits("肖爾托來了", characters) == []
        assert self.hits("撒迪厄斯·肖爾托來了", characters)[0][0] == "撒迪厄斯·肖爾托"

    def test_short_form_of_a_unique_name_is_tagged(self):
        characters = chars(("阿瑟爾尼·瓊斯", ["瓊斯"]))
        assert self.hits("瓊斯笑了", characters) == [("阿瑟爾尼·瓊斯", "瓊斯", 0, 2)]

    def test_ascii_names_respect_word_boundaries_and_case(self):
        characters = chars(("Alice", []))
        assert self.hits("alice met Alicette", characters) == [("Alice", "alice", 0, 5)]

    def test_name_beats_alias_of_another_character(self):
        characters = chars(("福爾摩斯", []), ("華生", ["福爾摩斯"]))
        assert [h[0] for h in self.hits("福爾摩斯", characters)] == ["福爾摩斯"]


class TestFindQuote:
    TEXTS = {"p1": "「房門從裡面反鎖了。」老周說。", "p2": "窗外的霧氣像一層灰 色的紗。"}

    def test_exact_match_gives_paragraph(self):
        found = find_quote("房門從裡面反鎖了", ["p1", "p2"], self.TEXTS)
        assert found is not None
        assert (found.draft.paragraph_id, found.loose) == ("p1", False)

    def test_inline_spacing_is_ignored(self):
        found = find_quote("一層灰色的紗", ["p1", "p2"], self.TEXTS)
        assert found is not None and found.draft.paragraph_id == "p2" and not found.loose

    def test_punctuation_difference_matches_loosely_with_original_text(self):
        found = find_quote("房門從裡面反鎖了！」老周說", ["p1"], self.TEXTS)
        assert found is not None and found.loose
        assert found.draft.text == "房門從裡面反鎖了。」老周說"

    def test_ellipsis_uses_longest_piece(self):
        found = find_quote("「房門從裡面反鎖了……不是這個", ["p1"], self.TEXTS)
        assert found is not None and found.draft.text == "房門從裡面反鎖了"

    def test_only_unit_paragraphs_are_searched(self):
        assert find_quote("房門從裡面反鎖了", ["p2"], self.TEXTS) is None

    def test_short_or_missing_or_wrong_type_is_not_found(self):
        assert find_quote("門", ["p1"], self.TEXTS) is not None  # 精確比對沒有長度下限
        assert find_quote("門鎖！", ["p1"], self.TEXTS) is None  # 退一步的比對太短
        assert find_quote("", ["p1"], self.TEXTS) is None
        assert find_quote(None, ["p1"], self.TEXTS) is None
        assert find_quote(42, ["p1"], self.TEXTS) is None


class TestNameResolver:
    def resolver(self, *specs: tuple[str, list[str]]):
        characters = chars(*specs)
        return NameResolver((f"id-{c.canonical_name}", c) for c in characters)

    def test_resolves_name_alias_and_member_name(self):
        merged = merge_characters([raw("華生", ["醫生"]), raw("華生醫生", [])])
        resolver = NameResolver([("id-w", merged[0])])
        assert [resolver.resolve(n) for n in ("華生", "華生醫生", "醫生", " 華生 ")] == ["id-w"] * 4

    def test_unknown_blank_and_non_string_names_do_not_resolve(self):
        resolver = self.resolver(("華生", []))
        assert [resolver.resolve(n) for n in ("路人", "", None, 3)] == [None] * 4

    def test_alias_claimed_by_two_is_ambiguous_but_a_name_wins(self):
        def merged(name: str, aliases: list[str]) -> MergedCharacter:
            return MergedCharacter(name, "person", aliases, None, {}, 1, 1, 1, {name})

        resolver = NameResolver(
            [("id-w", merged("華生", ["朋友"])), ("id-h", merged("福爾摩斯", ["朋友", "華生"]))]
        )
        assert resolver.resolve("朋友") is None
        assert resolver.resolve("華生") == "id-w"


class TestClusterTerms:
    VECTORS = {"鏡子": [1, 0, 0], "明鏡": [0.9, 0.1, 0], "火": [0, 1, 0]}

    def cluster(self, terms: list[str], threshold: float = 0.75):
        unique = list(dict.fromkeys(terms))
        return cluster_terms(terms, [self.VECTORS[t] for t in unique], threshold)

    def test_similar_terms_merge_under_most_frequent(self):
        clusters = self.cluster(["明鏡", "鏡子", "鏡子", "火"])
        assert [(c.canonical, c.variants) for c in clusters] == [("鏡子", ["明鏡"]), ("火", [])]

    def test_threshold_decides(self):
        clusters = self.cluster(["鏡子", "明鏡"], threshold=0.999)
        assert [c.canonical for c in clusters] == ["鏡子", "明鏡"]

    def test_ties_keep_first_appearance(self):
        assert [c.canonical for c in self.cluster(["火", "鏡子"])] == ["火", "鏡子"]

    def test_empty_and_wrong_shape(self):
        assert cluster_terms([], []) == []
        with pytest.raises(ValueError):
            cluster_terms(["a", "b"], [[1.0, 0.0]])


def view(chapter: int, s1b: object, paragraphs=(("p1", "甲乙丙丁戊己庚辛"),)) -> UnitView:
    unit = IngestUnit(
        id=f"b:{chapter}:0",
        book_id="b",
        chapter=chapter,
        language="zh",
        paragraphs=tuple(UnitParagraph(i, t) for i, t in paragraphs),
    )
    return UnitView(unit, None, s1b)


class TestSettingDrafts:
    TEXTS = {"p1": "甲乙丙丁戊己庚辛"}

    def drafts(self, *hints_per_chapter: list[dict]):
        report = S2Report()
        views = [
            view(i, {"book_setting_hints": hints})
            for i, hints in enumerate(hints_per_chapter, start=1)
        ]
        return setting_drafts(views, self.TEXTS, report), report

    def test_same_aspect_merges_into_one_with_all_quotes(self):
        drafts, report = self.drafts(
            [{"aspect": "era", "value": "近代", "quote": "甲乙丙"}],
            [
                {"aspect": "era", "value": "近代", "quote": "丁戊己"},
                {"aspect": "era", "value": "維多利亞時代", "quote": "庚辛"},
                {"aspect": "place", "value": "倫敦", "quote": "乙丙丁"},
            ],
        )
        by_aspect = {d.content["aspect"]: d for d in drafts}
        era = by_aspect["era"]
        assert (era.content["value"], era.content["description"]) == ("近代", "維多利亞時代")
        assert [q.text for q in era.quotes] == ["甲乙丙", "丁戊己", "庚辛"]
        assert era.discourse_chapter == 1
        assert by_aspect["place"].content["value"] == "倫敦"
        assert (report.quotes_total, report.quotes_verified) == (4, 4)

    def test_unknown_aspect_becomes_other_with_raw_label(self):
        drafts, _ = self.drafts([{"aspect": "weather", "value": "多霧", "quote": "甲乙丙"}])
        assert (drafts[0].content["aspect"], drafts[0].content["raw_label"]) == ("other", "weather")

    def test_bad_hints_are_dropped_not_fatal(self):
        drafts, report = self.drafts(
            [
                "oops",
                {"aspect": "era"},
                {"aspect": "era", "value": "近代", "quote": "不存在的句子"},
                {"aspect": "era", "value": "近代"},
            ]
        )
        assert drafts == []
        assert report.dropped == {"malformed_item": 2, "quote_not_found": 2}


class TestListItems:
    def test_bad_containers_are_dropped_with_warnings(self):
        report = S2Report()
        assert list_items("text", "events", report, "u") == []
        assert list_items({"events": "x"}, "events", report, "u") == []
        assert list_items({}, "events", report, "u") == []
        assert list_items({"events": [1, {"a": 1}, None]}, "events", report, "u") == [{"a": 1}]
        assert report.dropped == {"malformed_item": 2}
        assert len(report.warnings) == 5

    def test_none_output_is_silent(self):
        report = S2Report()
        assert list_items(None, "events", report, "u") == []
        assert report.warnings == []


class TestCleanContent:
    EVENT = {
        "title": "t",
        "event_type": "plot",
        "description": "d",
        "chapter": 1,
        "text_rank": 1,
    }

    def test_valid_content_passes(self):
        report = S2Report()
        content = clean_content(EventContent, self.EVENT, report, "x")
        assert content is not None and content["title"] == "t"
        assert report.dropped == {}

    def test_bad_optional_field_is_reset_to_default(self):
        report = S2Report()
        content = clean_content(
            EventContent,
            {**self.EVENT, "visibility": "loud", "emotional_intensity": 7},
            report,
            "x",
        )
        assert content is not None
        assert (content["visibility"], content["emotional_intensity"]) == ("public", None)
        assert report.field_drops == {"field_invalid": 2}

    def test_unknown_event_type_becomes_other_with_raw_label(self):
        content = clean_content(
            EventContent, {**self.EVENT, "event_type": "feast"}, S2Report(), "x"
        )
        assert (content["event_type"], content["raw_label"]) == ("other", "feast")

    def test_bad_required_field_drops_the_item(self):
        report = S2Report()
        data = {"source_id": "a", "target_id": "b", "relation_type": "family", "polarity": "mixed"}
        assert clean_content(RelationStateContent, data, report, "x") is None
        assert report.dropped == {"content_invalid": 1}


class TestAssignTextRank:
    def test_events_numbered_in_order_others_untouched(self):
        drafts = [
            make_draft("event", summary="a"),
            make_draft("utterance", summary="u"),
            make_draft("event", summary="b"),
        ]
        ranked = assign_text_rank(drafts)
        assert [d.content.get("text_rank") for d in ranked] == [1, None, 2]
        assert isinstance(ranked[0], EvidenceDraft)
        assert drafts[0].content["text_rank"] == 1  # 原本的不被改
