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
