"""把 S1 的 `quote` 對回該單位的哪一段（02 §4 步驟 4）。

先用寫入層的 `locate_quote`（忽略行內空白的子字串）逐段比對。LLM 常把引文裡的標點、
引號拿掉或改掉，所以對不上時再退一步：只比對文字與數字（忽略所有標點與空白），並把
`QuoteDraft.text` 換成段落裡真正對到的那一段原文，寫入層因此仍能嚴格驗證。
引文含省略號時，用最長的那一截去找。對不上的由呼叫端依 01 §3 處理（第 1 層至少要一段對上才入庫）。
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from storysphere.store.evidence_writer import QuoteDraft
from storysphere.store.quotes import locate_quote

# 退而求其次的比對至少要這麼多個文字／數字，太短的片段太容易誤中。
MIN_LOOSE_CHARS = 4
_ELLIPSIS = re.compile(r"…+|\.{3,}|⋯+")


@dataclass(frozen=True)
class FoundQuote:
    draft: QuoteDraft
    loose: bool


def _alnum_index(text: str) -> tuple[str, list[int]]:
    """Letters/digits only (lower-cased) with their positions in ``text``."""
    chars: list[str] = []
    positions: list[int] = []
    for position, char in enumerate(text):
        if unicodedata.category(char)[0] in "LN":
            lowered = char.lower()
            chars.append(lowered if len(lowered) == 1 else char)
            positions.append(position)
    return "".join(chars), positions


def _locate_loose(quote: str, paragraph: str) -> str | None:
    """The slice of ``paragraph`` that matches ``quote`` ignoring punctuation and spacing."""
    segments = [s for s in _ELLIPSIS.split(quote) if s.strip()]
    needles = sorted((_alnum_index(s)[0] for s in segments), key=len, reverse=True)
    if not needles or len(needles[0]) < MIN_LOOSE_CHARS:
        return None
    text, positions = _alnum_index(paragraph)
    index = text.find(needles[0])
    if index < 0:
        return None
    return paragraph[positions[index] : positions[index + len(needles[0]) - 1] + 1]


def find_quote(
    quote: object, paragraph_ids: Iterable[str], texts: Mapping[str, str]
) -> FoundQuote | None:
    """The first paragraph of the unit that contains ``quote``; None if none does."""
    if not isinstance(quote, str) or not quote.strip():
        return None
    ids = [p for p in paragraph_ids if p in texts]
    for paragraph_id in ids:
        if locate_quote(quote, texts[paragraph_id]) is not None:
            return FoundQuote(QuoteDraft(paragraph_id=paragraph_id, text=quote.strip()), False)
    for paragraph_id in ids:
        piece = _locate_loose(quote, texts[paragraph_id])
        if piece is not None and locate_quote(piece, texts[paragraph_id]) is not None:
            return FoundQuote(QuoteDraft(paragraph_id=paragraph_id, text=piece), True)
    return None
