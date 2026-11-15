"""Tests for the evidence content models (docs/spec/01 §5–§7)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from storysphere.domain.evidence import (
    CONTENT_MODELS,
    GENRE_EXT_MODELS,
    ContentPart,
    EvidenceContent,
)

from tests.domain.minimal_content import MINIMAL_CONTENT

MINIMAL = MINIMAL_CONTENT

EXPECTED_CLAIM_TYPES = {
    # §6.1 通用層・第 1 層
    "character",
    "event",
    "relation_state",
    "utterance",
    "imagery_motif",
    "focalization",
    "book_setting",
    # §6.2 推理・第 1 層
    "hidden_truth",
    "reveal",
    "clue_points_to",
    "trick",
    # §6.3 通用層・方法產出
    "causal_link",
    "archetype",
    "arc_segment",
    "voice_profile",
    "relation_network",
    "belief_state",
    "anachrony",
    "focalization_pattern",
    "opposition",
    "symbol_reading",
    "event_role",
    "event_impact",
    "tension_line",
    "journey_stage",
    "theme_reading",
    # §6.4 推理・方法產出
    "trick_class",
    "fairness_gap",
    "suspect_matrix",
    "two_story_map",
    "puzzle_type",
    # §5
    "note",
    "interpretation",
}

# 外殼／系統欄位，不得出現在內容 model
SHELL_FIELDS = {
    "id",
    "book_id",
    "level",
    "summary",
    "source",
    "confidence",
    "review_status",
    "subjects",
    "derived_from",
    "quotes",
    "discourse_chapter",
    "discourse_paragraph_id",
    "story_rank",
    "known_by",
    "run_id",
}

# 規格明列為內容欄位、但與外殼欄位同名的例外（01 §6.3 `anachrony.story_rank`）
SHELL_NAME_EXCEPTIONS = {"anachrony": {"story_rank"}}

ALL_TYPES = sorted(EXPECTED_CLAIM_TYPES)


def _field_names(claim_type: str) -> set[str]:
    return set(CONTENT_MODELS[claim_type].model_fields) - {"raw_label"}


class TestContentModelRegistry:
    def test_content_models_has_exactly_33_claim_types(self):
        assert len(EXPECTED_CLAIM_TYPES) == 33
        assert set(CONTENT_MODELS) == EXPECTED_CLAIM_TYPES

    @pytest.mark.parametrize("claim_type", ALL_TYPES)
    def test_class_claim_type_equals_key(self, claim_type):
        model = CONTENT_MODELS[claim_type]
        assert issubclass(model, EvidenceContent)
        assert model.claim_type == claim_type

    @pytest.mark.parametrize("claim_type", ALL_TYPES)
    def test_class_lives_in_module_named_after_claim_type(self, claim_type):
        module = CONTENT_MODELS[claim_type].__module__
        assert module == f"storysphere.domain.evidence.{claim_type}"


class TestContentFieldsOnly:
    @pytest.mark.parametrize("claim_type", ALL_TYPES)
    def test_no_shell_field_declared(self, claim_type):
        allowed = SHELL_NAME_EXCEPTIONS.get(claim_type, set())
        fields = set(CONTENT_MODELS[claim_type].model_fields)
        assert fields & SHELL_FIELDS - allowed == set()
        assert not any(name.startswith("discourse_") for name in fields)

    def test_minimal_payloads_cover_all_claim_types(self):
        assert set(MINIMAL) == EXPECTED_CLAIM_TYPES

    @pytest.mark.parametrize("claim_type", ALL_TYPES)
    def test_minimal_payload_validates(self, claim_type):
        content = CONTENT_MODELS[claim_type].model_validate(MINIMAL[claim_type])
        assert content.raw_label is None

    @pytest.mark.parametrize("claim_type", ALL_TYPES)
    def test_unknown_extra_field_rejected(self, claim_type):
        payload = {**MINIMAL[claim_type], "not_a_spec_field": 1}
        with pytest.raises(ValidationError):
            CONTENT_MODELS[claim_type].model_validate(payload)

    def test_event_participants_rejected(self):
        payload = {**MINIMAL["event"], "participants": ["ev-c1"]}
        with pytest.raises(ValidationError):
            CONTENT_MODELS["event"].model_validate(payload)

    def test_nested_part_extra_field_rejected(self):
        payload = {
            **MINIMAL["opposition"],
            "pole_a": {"concept": "duty", "carrier_names": ["Alice"]},
        }
        with pytest.raises(ValidationError):
            CONTENT_MODELS["opposition"].model_validate(payload)


class TestEnumCoercion:
    def test_unknown_event_type_becomes_other_with_raw_label(self):
        payload = {**MINIMAL["event"], "event_type": "heist"}
        content = CONTENT_MODELS["event"].model_validate(payload)
        assert content.event_type == "other"
        assert content.raw_label == "heist"

    def test_unknown_value_for_enum_without_other_raises(self):
        payload = {**MINIMAL["relation_state"], "polarity": "weird"}
        with pytest.raises(ValidationError):
            CONTENT_MODELS["relation_state"].model_validate(payload)

    def test_dropped_relation_types_become_other(self):
        payload = {**MINIMAL["relation_state"], "relation_type": "located_in"}
        content = CONTENT_MODELS["relation_state"].model_validate(payload)
        assert content.relation_type == "other"
        assert content.raw_label == "located_in"

    def test_score_out_of_range_raises(self):
        payload = {**MINIMAL["causal_link"], "strength": 1.5}
        with pytest.raises(ValidationError):
            CONTENT_MODELS["causal_link"].model_validate(payload)


class TestSpecFieldNames:
    def test_event_fields_match_spec(self):
        assert _field_names("event") == {
            "title",
            "event_type",
            "description",
            "chapter",
            "text_rank",
            "narrative_mode",
            "story_time_hint",
            "significance",
            "consequences",
            "visibility",
            "tension_signal",
            "emotional_intensity",
            "emotional_valence",
        }

    def test_clue_points_to_fields_match_spec(self):
        assert _field_names("clue_points_to") == {
            "clue_summary",
            "points_to_ids",
            "points_to_truth_id",
            "reader_visible",
            "is_misdirection",
            "noticed_by_ids",
        }

    def test_fairness_gap_fields_match_spec(self):
        assert _field_names("fairness_gap") == {
            "hidden_truth_id",
            "reveal_chapter",
            "clue_ids_before_reveal",
            "reader_visible_count",
            "misdirection_count",
            "verdict",
            "violations",
            "gap_description",
        }
        content = CONTENT_MODELS["fairness_gap"].model_validate(
            {
                **MINIMAL["fairness_gap"],
                "violations": [{"rule_set": "knox", "rule_no": 8, "explanation": "Hidden clue."}],
            }
        )
        assert set(type(content.violations[0]).model_fields) == {
            "rule_set",
            "rule_no",
            "explanation",
        }

    def test_opposition_fields_match_spec(self):
        assert _field_names("opposition") == {
            "event_id",
            "pole_a",
            "pole_b",
            "intensity",
            "description",
        }
        content = CONTENT_MODELS["opposition"].model_validate(MINIMAL["opposition"])
        assert isinstance(content.pole_a, ContentPart)
        assert set(type(content.pole_a).model_fields) == {"concept", "carrier_ids", "stance"}

    def test_note_fields_match_spec(self):
        assert _field_names("note") == {
            "title",
            "conclusion",
            "methodology_run_id",
            "methodology_trace",
            "question",
        }

    def test_interpretation_has_only_text(self):
        assert _field_names("interpretation") == {"text"}


class TestGenreExt:
    def test_mystery_extensions_registered(self):
        assert set(GENRE_EXT_MODELS) == {("mystery", "character"), ("mystery", "hidden_truth")}

    def test_character_content_has_no_mystery_fields(self):
        assert _field_names("character").isdisjoint({"mystery_role", "motive", "opportunity"})

    def test_hidden_truth_content_has_no_mystery_fields(self):
        assert _field_names("hidden_truth").isdisjoint({"case_type", "victim_ids", "mystery_type"})

    def test_mystery_ext_field_names_match_spec(self):
        character_ext = GENRE_EXT_MODELS[("mystery", "character")]
        truth_ext = GENRE_EXT_MODELS[("mystery", "hidden_truth")]
        assert set(character_ext.model_fields) == {"mystery_role", "motive", "opportunity"}
        assert set(truth_ext.model_fields) == {"case_type", "victim_ids", "mystery_type"}
