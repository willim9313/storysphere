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
    from storysphere.domain.documents import Document

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
    "zh": "Chinese",
    "zh-cn": "Simplified Chinese",
    "zh-tw": "Traditional Chinese",
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
# CJK script disambiguation
#
# langdetect is a character-n-gram classifier with no notion of Unicode
# script, so a short/atypical Chinese sample (e.g. front-matter text) can get
# misclassified as Korean. Hangul syllables are present in essentially all
# real Korean text and Hiragana/Katakana in essentially all real Japanese
# text, so their total absence alongside a substantial run of Han ideographs
# is a strong, cheap signal that overrides langdetect for the zh case only.
# ---------------------------------------------------------------------------

_HAN_RANGE = (0x4E00, 0x9FFF)
_HANGUL_RANGE = (0xAC00, 0xD7A3)
_KANA_RANGES = ((0x3040, 0x309F), (0x30A0, 0x30FF))
_MIN_HAN_CHARS = 10

# Small set of very common characters that differ between Traditional and
# Simplified Chinese, used only to pick a variant when overriding a
# misdetection — not a full script converter.
_TRADITIONAL_MARKERS = set("國學說後幾萬記對聽見樂們個這時來會為麼與從開關還讓過")
_SIMPLIFIED_MARKERS = set("国学说后几万记对听见乐们个这时来会为么与从开关还让过")


def _cjk_script_signal(text: str) -> tuple[bool, bool, bool]:
    """Return (han_dominant, has_hangul, has_kana) for a text sample."""
    han = hangul = kana = 0
    for ch in text:
        code = ord(ch)
        if _HAN_RANGE[0] <= code <= _HAN_RANGE[1]:
            han += 1
        elif _HANGUL_RANGE[0] <= code <= _HANGUL_RANGE[1]:
            hangul += 1
        elif any(lo <= code <= hi for lo, hi in _KANA_RANGES):
            kana += 1
    return han >= _MIN_HAN_CHARS, hangul > 0, kana > 0


def _guess_chinese_variant(text: str) -> str:
    """Best-effort Simplified vs Traditional guess using common marker characters."""
    traditional = sum(1 for ch in text if ch in _TRADITIONAL_MARKERS)
    simplified = sum(1 for ch in text if ch in _SIMPLIFIED_MARKERS)
    return "zh-tw" if traditional > simplified else "zh-cn"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_language(text: str, sample_chars: int = 2000) -> str:
    """Detect the language of *text* using the first *sample_chars* characters.

    Returns an ISO 639-1 code (e.g. ``"en"``, ``"zh-cn"``, ``"ja"``).
    Falls back to ``"en"`` when detection fails or the sample is too short.
    A Unicode-script check overrides langdetect when the sample is clearly
    Han-dominant with no Hangul/Kana at all, since langdetect has no
    script-awareness and can otherwise misread Chinese as Korean.
    """
    sample = text[:sample_chars].strip()
    if len(sample) < 20:
        logger.warning("Text sample too short (%d chars) for language detection — defaulting to 'en'", len(sample))
        return "en"

    han_dominant, has_hangul, has_kana = _cjk_script_signal(sample)

    try:
        lang = detect(sample)
    except Exception:
        logger.warning("Language detection failed — defaulting to 'en'", exc_info=True)
        lang = "en"

    if han_dominant and not has_hangul and not has_kana and not lang.startswith("zh"):
        corrected = _guess_chinese_variant(sample)
        logger.info(
            "Overriding langdetect result %r -> %r (Han-dominant sample, no Hangul/Kana)",
            lang,
            corrected,
        )
        return corrected

    logger.info("Detected language: %s (from %d-char sample)", lang, len(sample))
    return lang


def _collect_body_sample(doc: Document, min_chars: int = 2000) -> str:
    """Concatenate body-paragraph text from the first chapter(s) until at
    least *min_chars* characters are collected. Non-body paragraphs
    (separators, epigraphs, etc.) are skipped so they don't dilute the sample.
    """
    from storysphere.domain.documents import extract_body_text

    parts: list[str] = []
    total = 0
    for chapter in doc.chapters:
        for para in chapter.paragraphs:
            text = extract_body_text(para)
            if not text:
                continue
            parts.append(text)
            total += len(text)
            if total >= min_chars:
                break
        if total >= min_chars:
            break

    return " ".join(parts)


def detect_language_from_document(doc: Document) -> str:
    """Detect the dominant language of a :class:`Document`.

    Samples body text via :func:`_collect_body_sample`, then delegates to
    :func:`detect_language`.
    """
    sample = _collect_body_sample(doc)
    if not sample:
        logger.warning("Document has no body paragraph text — defaulting to 'en'")
        return "en"

    return detect_language(sample)


def refine_chinese_variant(doc: Document) -> str:
    """Resolve a bare ``"zh"`` language tag into ``"zh-tw"`` or ``"zh-cn"``.

    Upload forms may submit the generic ``"zh"`` code, but LLM prompts need a
    concrete variant ("Traditional Chinese" vs "Simplified Chinese") or the
    model picks one arbitrarily. Samples the document's body text and counts
    variant-specific marker characters to decide.
    """
    variant = _guess_chinese_variant(_collect_body_sample(doc))
    logger.info("Refined bare 'zh' language tag to %r", variant)
    return variant


def to_yake_language(lang_code: str) -> str:
    """Map an ISO 639-1 language code to a YAKE-compatible language code."""
    return _LANGDETECT_TO_YAKE.get(lang_code, lang_code.split("-")[0])


def get_language_display_name(lang_code: str) -> str:
    """Return a human-readable language name for use in LLM prompts.

    Example: ``"zh-cn"`` → ``"Chinese"``, ``"en"`` → ``"English"``.
    """
    return _LANGUAGE_DISPLAY_NAMES.get(lang_code, lang_code.split("-")[0].capitalize())
