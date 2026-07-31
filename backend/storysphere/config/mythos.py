"""Mythos configuration loader — B-029.

Loads Frye mythos (4) and Booker plot (7) definitions from JSON files.
Supports EN and ZH languages.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

_CONFIG_DIR = Path(__file__).parent / "mythos"

SUPPORTED_FRAMEWORKS = ("frye", "booker")
SUPPORTED_LANGUAGES = ("en", "zh")

_FILE_MAP = {
    "frye": "frye_mythos",
    "booker": "booker_plots",
}


@lru_cache(maxsize=8)
def load_mythos(framework: str, language: str = "en") -> list[dict]:
    """Load mythos/plot definitions for a given framework and language.

    Args:
        framework: 'frye' or 'booker'.
        language: 'en' or 'zh'.

    Returns:
        List of mythos dicts (each has at least 'id', 'name').

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

    filename = _FILE_MAP[framework]
    path = _CONFIG_DIR / f"{filename}_{language}.json"
    if not path.exists():
        raise FileNotFoundError(f"Mythos config not found: {path}")

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    logger.info("Loaded %d %s entries for %s/%s", len(data), framework, framework, language)
    return data


@lru_cache(maxsize=4)
def _id_lookup(framework: str) -> dict[str, str]:
    """Build a lowercased {id or localized name} → id map across all languages."""
    lookup: dict[str, str] = {}
    for language in SUPPORTED_LANGUAGES:
        for entry in load_mythos(framework, language):
            mythos_id = entry["id"]
            lookup[mythos_id.lower()] = mythos_id
            name = entry.get("name")
            if name:
                lookup[name.strip().lower()] = mythos_id
    return lookup


def resolve_mythos_id(framework: str, value: str | None) -> str | None:
    """Normalize a mythos/plot reference to its canonical id.

    The prompt asks the LLM for an id but hands it entries formatted as
    ``**悲劇** (tragedy)``, and models routinely answer with the bold display
    name instead. A localized name is therefore accepted and mapped back; a
    value matching nothing known returns None rather than propagating a value
    that no consumer can key on.
    """
    if not value:
        return None
    return _id_lookup(framework).get(value.strip().lower())


def get_mythos_summary(framework: str, language: str = "en") -> str:
    """Return a text summary of mythos/plots for inclusion in LLM prompts.

    Each entry is formatted as:
        - **Name** (id): core_pattern | tension_signature
    """
    entries = load_mythos(framework, language)
    lines = []
    for e in entries:
        name = e.get("name", e["id"])
        pattern = e.get("core_pattern", "")
        signature = e.get("tension_signature", "")
        lines.append(f"- **{name}** ({e['id']}): {pattern} | Tensions: {signature}")
    return "\n".join(lines)
