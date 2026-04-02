"""Hero Journey configuration loader — B-035.

Loads Campbell's 12-stage Hero's Journey definitions from JSON files.
Supports EN and ZH languages.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

_CONFIG_DIR = Path(__file__).parent / "hero_journey"

SUPPORTED_LANGUAGES = ("en", "zh")

STAGE_IDS = (
    "ordinary_world",
    "call_to_adventure",
    "refusal_of_call",
    "meeting_the_mentor",
    "crossing_threshold",
    "tests_allies_enemies",
    "approach_innermost_cave",
    "ordeal",
    "reward",
    "road_back",
    "resurrection",
    "return_with_elixir",
)

PHASES = {
    "departure": ("ordinary_world", "call_to_adventure", "refusal_of_call", "meeting_the_mentor", "crossing_threshold"),
    "initiation": ("tests_allies_enemies", "approach_innermost_cave", "ordeal", "reward"),
    "return": ("road_back", "resurrection", "return_with_elixir"),
}


@lru_cache(maxsize=4)
def load_hero_journey(language: str = "en") -> list[dict]:
    """Load Campbell's Hero's Journey stage definitions.

    Args:
        language: 'en' or 'zh'.

    Returns:
        List of stage dicts (each has 'id', 'name', 'phase', 'description',
        'narrative_function', 'typical_position').

    Raises:
        ValueError: If language is unsupported.
        FileNotFoundError: If the config file is missing.
    """
    language = language.lower()
    if language not in SUPPORTED_LANGUAGES:
        raise ValueError(f"Unsupported language '{language}'. Choose from: {SUPPORTED_LANGUAGES}")

    path = _CONFIG_DIR / f"hero_journey_{language}.json"
    if not path.exists():
        raise FileNotFoundError(f"Hero journey config not found: {path}")

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    logger.debug("Loaded %d hero journey stages for language=%s", len(data), language)
    return data


def get_hero_journey_summary(language: str = "en") -> str:
    """Return a text summary of all 12 stages for inclusion in LLM prompts.

    Format:
        [Phase] Stage Name (id): narrative_function
    """
    stages = load_hero_journey(language)
    lines = []
    current_phase = None
    for s in stages:
        phase = s.get("phase", "")
        if phase != current_phase:
            current_phase = phase
            lines.append(f"\n### {phase.upper()}")
        lines.append(
            f'- **{s["name"]}** (`{s["id"]}`): {s["narrative_function"]}'
        )
    return "\n".join(lines)
