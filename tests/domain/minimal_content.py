"""Minimal valid content payload for each of the 33 claim types.

測試共用資料：每種類型一筆只含必填欄位的最小內容。
"""

from __future__ import annotations

from typing import Any

MINIMAL_CONTENT: dict[str, dict[str, Any]] = {
    # §6.1
    "character": {"canonical_name": "Alice", "kind": "person"},
    "event": {
        "title": "The body is found",
        "event_type": "revelation",
        "description": "The butler finds the body in the study.",
        "chapter": 1,
        "text_rank": 1,
    },
    "relation_state": {
        "source_id": "ev-c1",
        "target_id": "ev-c2",
        "relation_type": "family",
        "polarity": "neutral",
    },
    "utterance": {"speaker_id": "ev-c1", "kind": "dialogue", "text": "I was in the garden."},
    "imagery_motif": {"term": "mirror", "imagery_type": "object"},
    "focalization": {
        "chapter": 1,
        "focalization_type": "internal",
        "grammatical_person": "third",
    },
    "book_setting": {"aspect": "era", "value": "1930s"},
    # §6.2
    "hidden_truth": {
        "statement": "The butler did it.",
        "truth_kind": "who",
        "concealed_from": "both",
    },
    "reveal": {
        "hidden_truth_id": "ev-h1",
        "revealer_id": "ev-c1",
        "audience": "both",
        "reveal_method": "deduction",
    },
    "clue_points_to": {"clue_summary": "Mud on the butler's shoes."},
    "trick": {
        "description": "The clock was set back an hour.",
        "hidden_truth_id": "ev-h1",
        "trick_category": "time",
    },
    # §6.3
    "causal_link": {
        "cause_event_id": "ev-e1",
        "effect_event_id": "ev-e2",
        "link_type": "motivational",
        "strength": 0.8,
    },
    "archetype": {"character_id": "ev-c1", "framework": "jung", "primary": "hero"},
    "arc_segment": {
        "character_id": "ev-c1",
        "chapter_start": 1,
        "chapter_end": 3,
        "phase": "Setup",
        "description": "Alice arrives at the manor.",
    },
    "voice_profile": {
        "character_id": "ev-c1",
        "avg_sentence_length": 12.5,
        "question_ratio": 0.2,
        "exclamation_ratio": 0.1,
        "lexical_diversity": 0.6,
        "utterances_analyzed": 20,
        "speech_style": "Terse and formal.",
        "tone": "cold",
    },
    "relation_network": {},
    "belief_state": {"character_id": "ev-c1", "up_to_chapter": 3},
    "anachrony": {
        "event_id": "ev-e1",
        "text_rank": 5,
        "story_rank": 1.0,
        "displacement": -4.0,
        "displacement_type": "analepsis",
    },
    "focalization_pattern": {"chapter_start": 1, "chapter_end": 4, "dominant_type": "internal"},
    "opposition": {
        "event_id": "ev-e1",
        "pole_a": {"concept": "duty"},
        "pole_b": {"concept": "desire"},
        "description": "Alice must choose between duty and desire.",
    },
    "symbol_reading": {"motif_id": "ev-m1", "reading": "The mirror stands for self-deception."},
    "event_role": {"event_id": "ev-e1", "weight": "kernel"},
    "event_impact": {"event_id": "ev-e1"},
    "tension_line": {
        "pole_a_label": "duty",
        "pole_b_label": "desire",
        "chapter_start": 1,
        "chapter_end": 9,
    },
    "journey_stage": {
        "protagonist_id": "ev-c1",
        "stage_id": "ordinary_world",
        "stage_name": "Ordinary World",
        "fit": "strong",
    },
    "theme_reading": {"proposition": "Duty without love is hollow."},
    # §6.4
    "trick_class": {"trick_id": "ev-t1", "rampo_category": "time"},
    "fairness_gap": {"hidden_truth_id": "ev-h1", "verdict": "fair"},
    "suspect_matrix": {},
    "two_story_map": {},
    "puzzle_type": {"puzzle_type": "closed_circle"},
    # §5
    "note": {"title": "Who knew what", "conclusion": "Only the butler knew."},
    "interpretation": {"text": "The mirror scene foreshadows the ending."},
}
