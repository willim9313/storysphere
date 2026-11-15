"""Quote verification: is the quoted text really in the paragraph? (docs/spec/01 §3)

`squash_spacing` 沿用舊 repo 的 `core/utils/text_matching.py`：pypdf 依字形位置補空白，
資料庫裡的段落常把一個詞拆開（「礁石」存成「礁 石」），所以比對前兩邊都先拿掉行內空白。
換行保留——它標的是真正的結構邊界，拿掉會讓相鄰兩段拼出原文沒有的字串。
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# 換行以外的空白
_INLINE_SPACE = re.compile(r"[^\S\n]+")


def squash_spacing(text: str) -> str:
    """Strip inline spacing so a word split by a stray space still matches."""
    return _INLINE_SPACE.sub("", text or "")


@dataclass(frozen=True)
class QuoteSpan:
    """Character offsets of a quote in the ORIGINAL (unsquashed) paragraph text."""

    start: int
    end: int


def locate_quote(quote: str, paragraph: str) -> QuoteSpan | None:
    """Find `quote` in `paragraph`, ignoring inline spacing on both sides.

    回傳的是段落原文上的偏移（含被忽略的空白），給 UI 高亮用；找不到回 None。
    """
    needle = squash_spacing(quote)
    if not needle:
        return None
    # 逐字建立「去空白後的位置 → 原文位置」對照
    kept_positions: list[int] = []
    kept_chars: list[str] = []
    for position, char in enumerate(paragraph or ""):
        if char == "\n" or not char.isspace():
            kept_positions.append(position)
            kept_chars.append(char)
    index = "".join(kept_chars).find(needle)
    if index < 0:
        return None
    return QuoteSpan(start=kept_positions[index], end=kept_positions[index + len(needle) - 1] + 1)
