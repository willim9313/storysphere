"""Language detection utilities for automatic source-text language identification.

Detects the dominant language of a document so that all LLM-generated content
(summaries, entity descriptions, keywords, analysis) can respond in the same
language as the source text.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from langdetect import DetectorFactory, detect

if TYPE_CHECKING:
    from domain.documents import Document

logger = logging.getLogger(__name__)

# Ensure deterministic detection across runs.
DetectorFactory.seed = 0

# ---------------------------------------------------------------------------
# Language code mappings
# ---------------------------------------------------------------------------

_LANGDETECT_TO_YAKE: dict[str, str] = {
    "zh-cn": "zh",
    "zh-tw": "zh",
    "ja": "ja",
    "ko": "ko",
    # Most ISO 639-1 codes (en, fr, de, es, pt, it …) map 1:1.
}

_LANGUAGE_DISPLAY_NAMES: dict[str, str] = {
    "en": "English",
    "zh-cn": "Chinese",
    "zh-tw": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "pt": "Portuguese",
    "it": "Italian",
    "ru": "Russian",
    "ar": "Arabic",
    "nl": "Dutch",
    "th": "Thai",
    "vi": "Vietnamese",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_language(text: str, sample_chars: int = 2000) -> str:
    """Detect the language of *text* using the first *sample_chars* characters.

    Returns an ISO 639-1 code (e.g. ``"en"``, ``"zh-cn"``, ``"ja"``).
    Falls back to ``"en"`` when detection fails or the sample is too short.
    """
    sample = text[:sample_chars].strip()
    if len(sample) < 20:
        logger.warning("Text sample too short (%d chars) for language detection — defaulting to 'en'", len(sample))
        return "en"
    try:
        lang = detect(sample)
        logger.info("Detected language: %s (from %d-char sample)", lang, len(sample))
        return lang
    except Exception:
        logger.warning("Language detection failed — defaulting to 'en'", exc_info=True)
        return "en"


def detect_language_from_document(doc: Document) -> str:
    """Detect the dominant language of a :class:`Document`.

    Concatenates paragraph text from the first chapter(s) until at least
    2 000 characters are collected, then delegates to :func:`detect_language`.
    """
    parts: list[str] = []
    total = 0
    for chapter in doc.chapters:
        for para in chapter.paragraphs:
            parts.append(para.text)
            total += len(para.text)
            if total >= 2000:
                break
        if total >= 2000:
            break

    if not parts:
        logger.warning("Document has no paragraph text — defaulting to 'en'")
        return "en"

    return detect_language(" ".join(parts))


def to_yake_language(lang_code: str) -> str:
    """Map an ISO 639-1 language code to a YAKE-compatible language code."""
    return _LANGDETECT_TO_YAKE.get(lang_code, lang_code.split("-")[0])


def get_language_display_name(lang_code: str) -> str:
    """Return a human-readable language name for use in LLM prompts.

    Example: ``"zh-cn"`` → ``"Chinese"``, ``"en"`` → ``"English"``.
    """
    return _LANGUAGE_DISPLAY_NAMES.get(lang_code, lang_code.split("-")[0].capitalize())
