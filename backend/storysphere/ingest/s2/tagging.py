"""段落標記（02 §4 步驟 2），搬自舊 repo `ParagraphEntityLinker`。

純文字比對：把角色的標準名與別名找出在每個段落的字元偏移。舊做法是所有別名一視同仁、
同一字串被多個角色宣稱時後來者覆蓋，這裡改成：

- 字面至少 2 個字元（單字多半是代名詞）。
- 字面被多個角色宣稱時：只有一個角色把它當「名字」就歸它，否則只有一個角色把它當別名
  才歸它，其餘情況（有歧義）不標。
- 只當別名的字面還要通過兩關，否則不標（「朋友」「先生」「肖爾托」這類 LLM 列出的別名，
  標了會把別人、普通名詞也標成這個角色）：
  1. 它得是這個角色某個名字的一部分（別名是名字的簡稱或稱謂，不是描述語）。
  2. 它不能是別的角色名字的開頭或結尾（共用姓氏或稱謂，例如「肖爾托」「少校」）。
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass

from storysphere.ingest.s2.characters import MergedCharacter

MIN_SURFACE_LEN = 2
_ASCII_WORD = re.compile(r"^[\w\s]+$", re.ASCII)


@dataclass(frozen=True)
class TagHit:
    """One mention found in a paragraph (offsets into the paragraph text)."""

    character_index: int
    start: int
    end: int
    surface: str


def build_surface_map(characters: list[MergedCharacter]) -> dict[str, int]:
    """lower-cased surface → index of the character it unambiguously belongs to."""
    named: dict[str, set[int]] = {}
    aliased: dict[str, set[int]] = {}
    for i, character in enumerate(characters):
        for name in {character.canonical_name, *character.member_names}:
            named.setdefault(name.strip().lower(), set()).add(i)
        for alias in character.aliases:
            aliased.setdefault(alias.strip().lower(), set()).add(i)

    names_of = [
        {n.strip().lower() for n in (c.canonical_name, *c.member_names)} for c in characters
    ]

    def alias_is_safe(surface: str, owner: int) -> bool:
        if not any(surface in name for name in names_of[owner]):
            return False
        return not any(
            name != surface and (name.startswith(surface) or name.endswith(surface))
            for other, names in enumerate(names_of)
            if other != owner
            for name in names
        )

    surface_map: dict[str, int] = {}
    for surface in named.keys() | aliased.keys():
        if len(surface) < MIN_SURFACE_LEN:
            continue
        if surface in named:
            if len(named[surface]) == 1:
                surface_map[surface] = next(iter(named[surface]))
        elif len(aliased[surface]) == 1:
            owner = next(iter(aliased[surface]))
            if alias_is_safe(surface, owner):
                surface_map[surface] = owner
    return surface_map


def compile_pattern(surfaces: Iterable[str]) -> re.Pattern[str] | None:
    """One regex for every surface, longest first (so the longer name wins)."""
    parts = []
    for surface in sorted(set(surfaces), key=len, reverse=True):
        escaped = re.escape(surface)
        parts.append(rf"(?<!\w){escaped}(?!\w)" if _ASCII_WORD.match(surface) else escaped)
    return re.compile("(" + "|".join(parts) + ")", re.IGNORECASE) if parts else None


def tag_paragraph(text: str, pattern: re.Pattern[str], surface_map: dict[str, int]) -> list[TagHit]:
    return [
        TagHit(surface_map[m.group(0).lower()], m.start(), m.end(), m.group(0))
        for m in pattern.finditer(text)
    ]
