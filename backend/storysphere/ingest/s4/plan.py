"""S4 的輸入：挑單位（有 `info_control` 訊號者）、判斷要不要推理擴充、取角色清單。

誰會被讀（02 §6）：`s1b` 標了 `info_control`（weak 或 strong）的單位。沒有 `genre_profile`
（S3 被跳過）或沒有合格單位 → S4 整個跳過（`load_plan` 回 None），不建模型也不叫 LLM。
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from storysphere.ingest.units import IngestUnit, build_units
from storysphere.store.books import get_book
from storysphere.store.content_tables import CONTENT_TABLES
from storysphere.store.ingest_units import IngestUnitOutputRow
from storysphere.store.tables import Evidence

MECHANISM = "info_control"
MYSTERY = "mystery"


@dataclass(frozen=True)
class CharacterInfo:
    id: str
    name: str
    aliases: tuple[str, ...] = ()


class CharacterIndex:
    """角色 id 與名字的查找；LLM 回的 id 或名字都要能對上（對不上就是 None）。"""

    def __init__(self, characters: Iterable[CharacterInfo]) -> None:
        self.characters = list(characters)
        self.ids = {c.id for c in self.characters}
        names: dict[str, set[str]] = {}
        aliases: dict[str, set[str]] = {}
        for c in self.characters:
            names.setdefault(c.name.strip(), set()).add(c.id)
            for alias in c.aliases:
                aliases.setdefault(alias.strip(), set()).add(c.id)
        self._by_name: dict[str, str] = {}
        for key in names.keys() | aliases.keys():
            owners = names.get(key) or aliases[key]
            if key and len(owners) == 1:
                self._by_name[key] = next(iter(owners))

    def resolve(self, value: Any) -> str | None:
        if not isinstance(value, str):
            return None
        text = value.strip()
        if text in self.ids:
            return text
        return self._by_name.get(text)

    def prompt_lines(self, *, with_aliases: bool) -> str:
        """JSON Lines；沒有角色時回 `(none)`。"""
        lines = []
        for c in self.characters:
            row: dict[str, Any] = {"id": c.id, "name": c.name}
            if with_aliases:
                row["aliases"] = list(c.aliases)
            lines.append(json.dumps(row, ensure_ascii=False))
        return "\n".join(lines) or "(none)"


@dataclass(frozen=True)
class S4Plan:
    book_id: str
    language: str
    units: list[IngestUnit]
    # unit id → 該單位 info_control 訊號的 JSON Lines
    signals: dict[str, str]
    mystery: bool
    characters: CharacterIndex


def main_genre(profile: dict[str, Any] | None, override: str | None) -> str | None:
    """主題材：`books.genre_override` 優先，否則 `genre_profile.primary`。"""
    if override:
        return override
    primary = (profile or {}).get("primary")
    return primary if isinstance(primary, str) else None


def wants_mystery_extension(profile: dict[str, Any] | None, override: str | None) -> bool:
    """主題材或混入元素含 mystery。"""
    if main_genre(profile, override) == MYSTERY:
        return True
    mixed = (profile or {}).get("mixed")
    if not isinstance(mixed, list):
        return False
    return any(isinstance(m, dict) and m.get("genre") == MYSTERY for m in mixed)


def info_control_signals(raw: Any) -> list[dict[str, Any]]:
    """`s1b` 輸出裡 `info_control` 的訊號；壞掉的項目略過。"""
    signals = raw.get("signals") if isinstance(raw, dict) else None
    if not isinstance(signals, list):
        return []
    return [s for s in signals if isinstance(s, dict) and s.get("mechanism") == MECHANISM]


def signals_text(signals: Sequence[dict[str, Any]]) -> str:
    rows = [
        {
            "strength": s.get("strength"),
            "subtags": s.get("subtags") if isinstance(s.get("subtags"), list) else [],
            "quote": s.get("quote"),
        }
        for s in signals
    ]
    return "\n".join(json.dumps(r, ensure_ascii=False) for r in rows) or "(none)"


def select_units(
    units: Sequence[IngestUnit], s1b_outputs: dict[str, Any]
) -> tuple[list[IngestUnit], dict[str, str]]:
    """有 `info_control` 訊號的單位（依書中順序）與各自的訊號文字。"""
    selected: list[IngestUnit] = []
    texts: dict[str, str] = {}
    for unit in units:
        signals = info_control_signals(s1b_outputs.get(unit.id))
        if signals:
            selected.append(unit)
            texts[unit.id] = signals_text(signals)
    return selected, texts


async def load_characters(session: AsyncSession, book_id: str) -> CharacterIndex:
    """該書 `status=current` 的 `character` 證據。"""
    table = CONTENT_TABLES["character"]
    rows = await session.execute(
        select(Evidence.id, table.c.canonical_name, table.c.aliases)
        .join(table, table.c.evidence_id == Evidence.id)
        .where(
            Evidence.book_id == book_id,
            Evidence.claim_type == "character",
            Evidence.status == "current",
        )
        .order_by(table.c.first_chapter, table.c.canonical_name, Evidence.id)
    )
    return CharacterIndex(
        CharacterInfo(
            id=row.id,
            name=row.canonical_name,
            aliases=tuple(a for a in (row.aliases or []) if isinstance(a, str)),
        )
        for row in rows
    )


async def load_plan(
    session_factory: async_sessionmaker[AsyncSession], book_id: str
) -> S4Plan | None:
    """S4 的輸入；沒有 `genre_profile` 或沒有合格單位時回 None。"""
    async with session_factory() as session:
        doc = await get_book(session, book_id)
        if doc is None:
            raise LookupError(f"Book {book_id} not found")
        if not doc.genre_profile:
            return None
        outputs = {
            row.unit_id: row.raw_json
            for row in await session.scalars(
                select(IngestUnitOutputRow).where(
                    IngestUnitOutputRow.book_id == book_id, IngestUnitOutputRow.stage == "s1b"
                )
            )
        }
        units, signals = select_units(build_units(doc), outputs)
        if not units:
            return None
        characters = await load_characters(session, book_id)
    return S4Plan(
        book_id=book_id,
        language=doc.language,
        units=units,
        signals=signals,
        mystery=wants_mystery_extension(doc.genre_profile, doc.genre_override),
        characters=characters,
    )


async def has_s4_input(session_factory: async_sessionmaker[AsyncSession], book_id: str) -> bool:
    return await load_plan(session_factory, book_id) is not None
