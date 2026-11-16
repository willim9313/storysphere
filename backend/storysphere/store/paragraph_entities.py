"""`paragraph_entities`: S2 段落標記的索引表（02 §4 步驟 2）。

一列＝某個角色在某段落的一次提及（字元偏移對齊 `ParagraphRow.text`）。這是索引，不是證據，
所以不走 `write_evidence`；重跑 S2 時該書的列先清掉再寫。函式只 flush，不 commit。
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import Index, Integer, String, delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from storysphere.store.tables import Base


class ParagraphEntityRow(Base):
    __tablename__ = "paragraph_entities"
    __table_args__ = (Index("ix_paragraph_entities_book_paragraph", "book_id", "paragraph_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    book_id: Mapped[str] = mapped_column(String)
    paragraph_id: Mapped[str] = mapped_column(String)
    # `character` 證據的 id；證據被取代後，下一次 S2 會整批換成新的 id。
    character_id: Mapped[str] = mapped_column(String, index=True)
    start: Mapped[int] = mapped_column(Integer)
    end: Mapped[int] = mapped_column(Integer)
    # 段落裡實際出現的字面（標準名或別名）。
    surface: Mapped[str] = mapped_column(String)


@dataclass(frozen=True)
class Mention:
    paragraph_id: str
    character_id: str
    start: int
    end: int
    surface: str


async def replace_mentions(session: AsyncSession, book_id: str, mentions: Iterable[Mention]) -> int:
    """Delete every row of ``book_id`` and insert ``mentions``; returns the number inserted."""
    await session.execute(delete(ParagraphEntityRow).where(ParagraphEntityRow.book_id == book_id))
    rows = [
        ParagraphEntityRow(
            book_id=book_id,
            paragraph_id=m.paragraph_id,
            character_id=m.character_id,
            start=m.start,
            end=m.end,
            surface=m.surface,
        )
        for m in mentions
    ]
    session.add_all(rows)
    await session.flush()
    return len(rows)


async def list_mentions(session: AsyncSession, book_id: str) -> list[ParagraphEntityRow]:
    return list(
        await session.scalars(
            select(ParagraphEntityRow)
            .where(ParagraphEntityRow.book_id == book_id)
            .order_by(ParagraphEntityRow.id)
        )
    )
