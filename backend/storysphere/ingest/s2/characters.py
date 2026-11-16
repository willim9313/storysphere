"""角色合併（02 §4 步驟 1），搬自舊 repo `EntityLinker`，補上防誤併的規則。

舊做法：正規化名稱精確比對、別名交叉比對（某筆的別名等於另一筆的名字）、提及次數最多者為
標準名。舊做法的問題是只要某個字串被當成別名，就把同名的那組併進去；「我」、「少校」、
「肖爾托」這類被多個不同的人共用的字串會把人併在一起。這裡的改法：

- 只用「名字 ↔ 別名」的交叉比對連結，別名與別名共用不算連結。
- 連結用的字串（正規化後）至少 2 個字元；單字多半是代名詞或稱謂。
- 一個字串若同時是好幾組的別名，而那些組彼此「不相干」，這個字串有歧義，不拿來連結。
  「相干」＝名字互相包含、或其中一組的別名裡有另一組的名字、或兩個名字不同文字系統
  （中文名與拉丁字母名無從比較，不當成不同人）。
- 「某組的名字 ＝ 另一組的名字 ＋ 該組自己的別名」（例：華生醫生＝華生＋別名「醫生」）也連結。
- 標準名優先選至少 2 個字元的組，不讓「我」當標準名。
"""

from __future__ import annotations

import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

MIN_LINK_KEY_LEN = 2


def name_key(name: str) -> str:
    """Normalise a name for matching: NFKC, casefold, keep letters/digits/marks only."""
    folded = unicodedata.normalize("NFKC", name).casefold()
    return "".join(ch for ch in folded if unicodedata.category(ch)[0] in "LNM")


@dataclass
class RawCharacter:
    """One character as one unit's S1 output named it (already type-checked)."""

    name: str
    kind: str
    aliases: list[str]
    description: str | None
    attributes: dict[str, Any]
    chapter: int


@dataclass
class MergedCharacter:
    canonical_name: str
    kind: str
    aliases: list[str]
    description: str | None
    attributes: dict[str, Any]
    first_chapter: int
    last_chapter: int
    # 所有單位裡這個角色被抽出來的次數（每單位至多算一次由 S1 保證不了，就照出現次數算）
    mention_count: int
    # 併進來的每個原始名字（正規化前），解析名字用
    member_names: set[str] = field(default_factory=set)


class _Group:
    """Raw characters whose names normalise to the same key."""

    def __init__(self, key: str) -> None:
        self.key = key
        self.members: list[RawCharacter] = []
        self.alias_keys: set[str] = set()

    @property
    def count(self) -> int:
        return len(self.members)


def _is_cjk(text: str) -> bool:
    return any(
        "CJK" in unicodedata.name(ch, "")
        or "HIRAGANA" in unicodedata.name(ch, "")
        or "KATAKANA" in unicodedata.name(ch, "")
        or "HANGUL" in unicodedata.name(ch, "")
        for ch in text
    )


def _related(a: _Group, b: _Group) -> bool:
    """Could groups ``a`` and ``b`` be the same person, judging by their names alone?"""
    if a.key in b.key or b.key in a.key:
        return True
    if a.key in b.alias_keys or b.key in a.alias_keys:
        return True
    return _is_cjk(a.key) != _is_cjk(b.key)


def _find(parent: list[int], i: int) -> int:
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


def merge_characters(raws: list[RawCharacter]) -> list[MergedCharacter]:
    """Merge raw characters (in reading order) into canonical characters."""
    groups: dict[str, _Group] = {}
    for raw in raws:
        key = name_key(raw.name)
        if not key:
            continue
        group = groups.setdefault(key, _Group(key))
        group.members.append(raw)
        group.alias_keys.update(k for alias in raw.aliases if (k := name_key(alias)))
    ordered = list(groups.values())

    parent = list(range(len(ordered)))
    for i, group in enumerate(ordered):
        key = group.key
        if len(key) < MIN_LINK_KEY_LEN:
            continue
        owners = [j for j, other in enumerate(ordered) if j != i and key in other.alias_keys]
        if not owners:
            continue
        # 好幾組都把這個字串當別名，而且那幾組彼此不相干 → 字串有歧義，不連結。
        if any(
            not _related(ordered[a], ordered[b])
            for n, a in enumerate(owners)
            for b in owners[n + 1 :]
        ):
            continue
        for j in owners:
            parent[_find(parent, j)] = _find(parent, i)

    by_key = {g.key: i for i, g in enumerate(ordered)}
    for i, group in enumerate(ordered):
        if len(group.key) < MIN_LINK_KEY_LEN:
            continue
        for title in group.alias_keys:
            for extended in (group.key + title, title + group.key):
                if (j := by_key.get(extended)) is not None and j != i:
                    parent[_find(parent, j)] = _find(parent, i)

    components: dict[int, list[_Group]] = {}
    for i, group in enumerate(ordered):
        components.setdefault(_find(parent, i), []).append(group)
    return [_merge_component(groups_) for groups_ in components.values()]


def _merge_component(component: list[_Group]) -> MergedCharacter:
    members = [raw for group in component for raw in group.members]
    # 提及次數最多的組當標準名（至少 2 字元的優先）；同分取先出現的。
    eligible = [g for g in component if len(g.key) >= MIN_LINK_KEY_LEN] or component
    best = max(eligible, key=lambda g: g.count)
    canonical = Counter(raw.name.strip() for raw in best.members).most_common(1)[0][0]

    canonical_key = name_key(canonical)
    alias_pool: dict[str, str] = {}
    for raw in members:
        for surface in (raw.name.strip(), *raw.aliases):
            key = name_key(surface)
            if key and key != canonical_key:
                alias_pool.setdefault(key, surface.strip())

    kind = Counter(raw.kind for raw in members).most_common(1)[0][0]
    described = [raw.description for raw in best.members if raw.description] or [
        raw.description for raw in members if raw.description
    ]
    attributes: dict[str, Any] = {}
    for group in component:
        if group is not best:
            for raw in group.members:
                attributes.update(raw.attributes)
    for raw in best.members:
        attributes.update(raw.attributes)

    chapters = [raw.chapter for raw in members]
    return MergedCharacter(
        canonical_name=canonical,
        kind=kind,
        aliases=sorted(alias_pool.values()),
        description=max(described, key=len) if described else None,
        attributes=attributes,
        first_chapter=min(chapters),
        last_chapter=max(chapters),
        mention_count=len(members),
        member_names={raw.name.strip() for raw in members},
    )
