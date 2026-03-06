"""Archetype configuration loader.

Loads Jung (12) and Schmidt (45) archetype definitions from JSON files.
Supports EN and ZH languages.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

_CONFIG_DIR = Path(__file__).parent / "character_analysis"

SUPPORTED_FRAMEWORKS = ("jung", "schmidt")
SUPPORTED_LANGUAGES = ("en", "zh")


@lru_cache(maxsize=8)
def load_archetypes(framework: str, language: str = "en") -> list[dict]:
    """Load archetype definitions for a given framework and language.

    Args:
        framework: 'jung' or 'schmidt'.
        language: 'en' or 'zh'.

    Returns:
        List of archetype dicts (each has at least 'id', 'name').

    Raises:
        ValueError: If framework or language is unsupported.
        FileNotFoundError: If the config file is missing.
    """
    framework = framework.lower()
    language = language.lower()

    if framework not in SUPPORTED_FRAMEWORKS:
        raise ValueError(f"Unsupported framework '{framework}'. Choose from: {SUPPORTED_FRAMEWORKS}")
    if language not in SUPPORTED_LANGUAGES:
        raise ValueError(f"Unsupported language '{language}'. Choose from: {SUPPORTED_LANGUAGES}")

    path = _CONFIG_DIR / f"{framework}_archetypes_{language}.json"
    if not path.exists():
        raise FileNotFoundError(f"Archetype config not found: {path}")

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    logger.info("Loaded %d archetypes for %s/%s", len(data), framework, language)
    return data


def get_archetype_summary(framework: str, language: str = "en") -> str:
    """Return a text summary of archetypes for inclusion in LLM prompts.

    Each archetype is formatted as:
        - **Name** (id): core_desire | talent | weakness
    """
    archetypes = load_archetypes(framework, language)
    lines = []
    for a in archetypes:
        name = a.get("name", a["id"])
        desire = a.get("core_desire", "")
        talent = a.get("talent", "")
        weakness = a.get("weakness", "")
        lines.append(f"- **{name}** ({a['id']}): {desire} | {talent} | {weakness}")
    return "\n".join(lines)
