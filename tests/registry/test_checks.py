from __future__ import annotations

import pytest
from storysphere.registry.checks import (
    build_dag,
    check_registry,
    claim_type_levels,
    execution_order,
)
from storysphere.registry.loader import RegistryLoadError, load_registry

from tests.registry.conftest import REAL_REGISTRY


def _rules(registry_dir) -> set[str]:
    return {problem.rule for problem in check_registry(load_registry(registry_dir.root))}


def _messages(registry_dir) -> str:
    return "\n".join(str(p) for p in check_registry(load_registry(registry_dir.root)))


class TestRealRegistry:
    def test_passes_all_six_rules(self):
        assert check_registry(load_registry(REAL_REGISTRY)) == []

    def test_declares_the_slice_of_the_spec(self):
        registry = load_registry(REAL_REGISTRY)

        # docs/spec/03：18 個方法＋2 個內建方法論；05 §4：13 種 view
        assert (len(registry.methods), len(registry.methodologies), len(registry.views)) == (
            18, 2, 13,
        )  # fmt: skip
        assert set(registry.methodologies) == {"builtin.theme_synthesis", "builtin.puzzle_type"}
        p0 = [m.code for m in registry.methods.values() if m.priority == "P0"]
        p0 += [m.code for m in registry.methodologies.values() if m.priority == "P0"]
        assert sorted(p0) == sorted(
            ["EV2", "EV1", "CH2", "CH4", "CH5", "NS2", "TM1", "TM2", "SY1", "TM3",
             "MY1", "MY4", "MY5"]
        )  # fmt: skip

    def test_default_cards_are_five_for_a_mystery(self):
        registry = load_registry(REAL_REGISTRY)

        universal = [card.ref for card in registry.perspectives["universal"].cards]
        mystery = [card.ref for card in registry.perspectives["mystery"].cards]

        assert universal == [
            "event.kernel_satellite",  # 「EV2 → EV1」的卡取最後一步（04 §2.4）
            "character.arc",
            "character.network",
        ]
        # 原型只做 6 個方法（03 §5 的原型決定）；不做的方法不列在預設卡。
        assert mystery == ["info.fair_play_audit", "character.belief"]

    def test_only_info_control_mechanism_is_supported(self):
        mechanisms = load_registry(REAL_REGISTRY).mechanisms

        assert len(mechanisms) == 7
        assert [key for key, m in mechanisms.items() if m.supported] == ["info_control"]

    def test_ch5_does_not_read_reveal(self):
        belief = load_registry(REAL_REGISTRY).methods["character.belief"]

        assert {req.claim_type for req in belief.requires} == {"event", "character"}

    def test_levels_match_spec_01(self):
        levels = claim_type_levels(load_registry(REAL_REGISTRY))

        expected = {
            "event": 1, "character": 1, "hidden_truth": 1, "clue_points_to": 1,
            "causal_link": 2, "arc_segment": 2, "relation_network": 2, "belief_state": 2,
            "anachrony": 2, "opposition": 2, "symbol_reading": 2, "archetype": 2,
            "fairness_gap": 2, "suspect_matrix": 2, "trick_class": 2,
            "event_role": 3, "event_impact": 3, "tension_line": 3, "two_story_map": 3,
            "journey_stage": 4, "theme_reading": 4, "puzzle_type": 4,
        }  # fmt: skip
        assert {name: levels[name] for name in expected} == expected

    def test_execution_order_puts_upstream_first(self):
        order = execution_order(load_registry(REAL_REGISTRY))

        def before(first: str, second: str) -> bool:
            return order.index(first) < order.index(second)

        assert before("event.causal_network", "event.kernel_satellite")
        assert before("theme.opposition", "theme.tension_line")
        assert before("structure.narrative_time", "info.two_story")
        assert before("theme.tension_line", "builtin.theme_synthesis")
        assert before("symbol.reading", "builtin.theme_synthesis")
        assert before("info.fair_play_audit", "builtin.puzzle_type")

    def test_dag_output_has_claim_types_methods_and_edges(self):
        dag = build_dag(load_registry(REAL_REGISTRY))

        nodes = {node["id"]: node for node in dag["nodes"]}
        assert nodes["fairness_gap"] == {
            "id": "fairness_gap", "kind": "claim_type", "layer": "genre",
            "mechanism": "資訊控制", "level": 2,
        }  # fmt: skip
        assert nodes["info.fair_play_audit"]["kind"] == "method"
        assert nodes["builtin.puzzle_type"] == {
            "id": "builtin.puzzle_type", "kind": "methodology", "layer": "genre",
            "mechanism": None,
        }  # fmt: skip
        assert nodes["builtin.theme_synthesis"]["layer"] == "universal"
        edges = {(e["from"], e["to"], e["kind"]) for e in dag["edges"]}
        assert ("clue_points_to", "info.fair_play_audit", "requires") in edges
        assert ("info.fair_play_audit", "fairness_gap", "produces") in edges
        assert ("info.fair_play_audit", "builtin.puzzle_type", "step") in edges
        assert ("builtin.puzzle_type", "puzzle_type", "produces") in edges


class TestBrokenRegistry:
    def test_two_methods_producing_the_same_type_fail(self, registry_dir):
        twin = registry_dir.read("methods/EV2.yaml")
        twin["id"] = "event.causal_network_twin"
        registry_dir.write("methods/EV2_twin.yaml", twin)

        assert "R1" in _rules(registry_dir)
        assert "causal_link" in _messages(registry_dir)

    def test_level_1_type_without_reader_fails(self, registry_dir):
        registry_dir.write("orphans_allowed.yaml", {"kind": "orphans_allowed", "orphans": []})

        assert _rules(registry_dir) == {"R2"}
        assert "book_setting" in _messages(registry_dir)

    def test_universal_method_reading_genre_evidence_fails(self, registry_dir):
        registry_dir.edit(
            "methods/CH5.yaml", lambda d: d["requires"].append({"claim_type": "reveal"})
        )

        assert _rules(registry_dir) == {"R3"}
        assert "character.belief" in _messages(registry_dir)

    def test_universal_method_reading_genre_extension_fails(self, registry_dir):
        def add_ext(data):
            data["requires"][0]["genre_ext"] = "mystery"

        registry_dir.edit("methods/CH2.yaml", add_ext)

        assert _rules(registry_dir) == {"R3"}

    def test_universal_method_reading_genre_method_output_fails(self, registry_dir):
        registry_dir.edit(
            "methods/EV1.yaml", lambda d: d["requires"].append({"claim_type": "fairness_gap"})
        )

        assert "R3" in _rules(registry_dir)

    def test_dependency_cycle_fails(self, registry_dir):
        # EV1 讀 EV2 的 causal_link；讓 EV2 反過來讀 EV1 的 event_role
        registry_dir.edit(
            "methods/EV2.yaml", lambda d: d["requires"].append({"claim_type": "event_role"})
        )

        assert "R4" in _rules(registry_dir)
        assert "event.causal_network" in _messages(registry_dir)

    def test_unknown_view_fails(self, registry_dir):
        registry_dir.edit("methods/MY4.yaml", lambda d: d.update(view="hologram"))

        assert _rules(registry_dir) == {"R5"}

    def test_produced_type_without_content_model_fails(self, registry_dir):
        registry_dir.edit("methods/MY5.yaml", lambda d: d.update(produces="made_up_type"))

        rules = _rules(registry_dir)
        assert "R5" in rules
        messages = _messages(registry_dir)
        assert "made_up_type" in messages
        assert "suspect_matrix" in messages  # 原本的類型變成沒人宣告

    def test_card_for_unknown_method_fails(self, registry_dir):
        def add_card(data):
            data["cards"].append({"ref": "info.nope", "question": "？"})

        registry_dir.edit("perspectives/mystery.yaml", add_card)

        assert _rules(registry_dir) == {"R5"}

    def test_methodology_with_unknown_step_fails(self, registry_dir):
        registry_dir.edit(
            "methodologies/MY2.yaml", lambda d: d["steps"].insert(0, {"method": "info.nope"})
        )

        assert "R5" in _rules(registry_dir)

    def test_reading_interpretation_without_opt_in_fails(self, registry_dir):
        registry_dir.edit(
            "methods/TM1.yaml",
            lambda d: d["requires"].append({"claim_type": "event", "source": "user"}),
        )

        assert _rules(registry_dir) == {"R6"}

    def test_reading_interpretation_with_opt_in_passes(self, registry_dir):
        def opt_in(data):
            data["requires"].append({"claim_type": "event", "source": "user"})
            data["allow_interpretation"] = True

        registry_dir.edit("methods/TM1.yaml", opt_in)

        assert _rules(registry_dir) == set()


class TestLoadErrors:
    def test_unknown_key_in_declaration_rejected(self, registry_dir):
        registry_dir.edit("methods/MY4.yaml", lambda d: d.update(extraction={"x": "y"}))

        with pytest.raises(RegistryLoadError) as excinfo:
            load_registry(registry_dir.root)
        assert "MY4.yaml" in str(excinfo.value)

    def test_duplicate_method_id_rejected(self, registry_dir):
        registry_dir.write("methods/MY4_copy.yaml", registry_dir.read("methods/MY4.yaml"))

        with pytest.raises(RegistryLoadError) as excinfo:
            load_registry(registry_dir.root)
        assert "duplicate id" in str(excinfo.value)

    def test_all_bad_files_reported_together(self, registry_dir):
        (registry_dir.root / "methods" / "MY4.yaml").write_text("kind: [", encoding="utf-8")
        registry_dir.edit("methods/MY5.yaml", lambda d: d.pop("produces"))

        with pytest.raises(RegistryLoadError) as excinfo:
            load_registry(registry_dir.root)
        assert len(excinfo.value.problems) == 2
