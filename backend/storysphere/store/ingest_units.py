"""`ingest_units`／`ingest_unit_outputs`: per-unit checkpoint of ingestion (01 §8, 02 §7).

一列＝一本書某一步（`stage`）的一個單位。原始 LLM 輸出另存一張表，S2 之後的步驟可以
重放而不必重叫 LLM。函式只 flush，不 commit。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Integer, String, Text, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from storysphere.ingest.units import IngestUnit
from storysphere.store.tables import Base, _utcnow


class IngestUnitRow(Base):
    __tablename__ = "ingest_units"

    book_id: Mapped[str] = mapped_column(String, primary_key=True)
    # s1a／s1b／s4a
    stage: Mapped[str] = mapped_column(String, primary_key=True)
    unit_id: Mapped[str] = mapped_column(String, primary_key=True)
    chapter: Mapped[int] = mapped_column(Integer)
    paragraph_ids: Mapped[list[str]] = mapped_column(JSON)
    # pending／running／done／failed
    status: Mapped[str] = mapped_column(String, default="pending")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    model: Mapped[str | None] = mapped_column(String, nullable=True)
    prompt_version: Mapped[str | None] = mapped_column(String, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class IngestUnitOutputRow(Base):
    __tablename__ = "ingest_unit_outputs"

    book_id: Mapped[str] = mapped_column(String, primary_key=True)
    stage: Mapped[str] = mapped_column(String, primary_key=True)
    unit_id: Mapped[str] = mapped_column(String, primary_key=True)
    raw_json: Mapped[Any] = mapped_column(JSON)
    model: Mapped[str | None] = mapped_column(String, nullable=True)
    prompt_version: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


async def seed_units(session: AsyncSession, stage: str, units: list[IngestUnit]) -> None:
    """Insert a `pending` row for every unit that has none yet; existing rows are kept."""
    if not units:
        return
    book_id = units[0].book_id
    existing = set(
        await session.scalars(
            select(IngestUnitRow.unit_id).where(
                IngestUnitRow.book_id == book_id, IngestUnitRow.stage == stage
            )
        )
    )
    session.add_all(
        IngestUnitRow(
            book_id=book_id,
            stage=stage,
            unit_id=unit.id,
            chapter=unit.chapter,
            paragraph_ids=unit.paragraph_ids,
        )
        for unit in units
        if unit.id not in existing
    )
    await session.flush()


async def list_units(
    session: AsyncSession, book_id: str, stage: str | None = None
) -> list[IngestUnitRow]:
    stmt = select(IngestUnitRow).where(IngestUnitRow.book_id == book_id)
    if stage is not None:
        stmt = stmt.where(IngestUnitRow.stage == stage)
    return list(await session.scalars(stmt))


async def save_output(
    session: AsyncSession,
    row: IngestUnitRow,
    raw: Any,
    *,
    model: str | None,
    prompt_version: str | None,
) -> None:
    """Store (or replace) the raw output of one unit."""
    await session.merge(
        IngestUnitOutputRow(
            book_id=row.book_id,
            stage=row.stage,
            unit_id=row.unit_id,
            raw_json=raw,
            model=model,
            prompt_version=prompt_version,
            created_at=_utcnow(),
        )
    )
    await session.flush()


async def reset_running_units(session: AsyncSession) -> None:
    """`running` → `pending`: nothing is running right after a restart."""
    await session.execute(
        update(IngestUnitRow).where(IngestUnitRow.status == "running").values(status="pending")
    )
