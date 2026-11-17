"""`methodologies`：使用者存下的方法論（01 §2；內建的在 registry YAML，不進表）。

原型只有 N-07e 的 `fromSession`：步驟取該輪 agent 的 `run_method` 順序（04 N-07e，使用者
2026-11-17 決定照規格，不從引用的證據回推）。原型沒有方法論執行器，存下來的都不能跑。
函式只 flush，不 commit。
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Integer, String, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from storysphere.store.agent import TraceCallRow
from storysphere.store.tables import Base, _utcnow


class MethodologyRow(Base):
    __tablename__ = "methodologies"

    # `user.<8 位 hex>`（04 N-07e 的 `user.<slug>`；問句多半是中文，原型不做轉寫）。
    id: Mapped[str] = mapped_column(String, primary_key=True)
    question: Mapped[str] = mapped_column(String)
    version: Mapped[int] = mapped_column(Integer, default=1)
    # [{method, input?}]
    steps_json: Mapped[list[Any]] = mapped_column(JSON, default=list)
    # 從哪裡另存的：{session_id, turn_id}
    source_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


async def turn_steps(session: AsyncSession, session_id: str, turn_id: str) -> list[dict[str, Any]]:
    """該輪成功的 `run_method` 呼叫（不含 `dry_run`），依 trace 順序；同方法同輸入只留第一次。"""
    calls = await session.scalars(
        select(TraceCallRow)
        .where(
            TraceCallRow.session_id == session_id,
            TraceCallRow.turn_id == turn_id,
            TraceCallRow.tool == "run_method",
            TraceCallRow.status == "ok",
        )
        .order_by(TraceCallRow.seq)
    )
    steps: list[dict[str, Any]] = []
    for call in calls:
        args = call.args_json or {}
        if args.get("dry_run"):
            continue
        step: dict[str, Any] = {"method": args["method_id"]}
        if args.get("inputs"):
            step["input"] = args["inputs"]
        if step not in steps:
            steps.append(step)
    return steps


async def save_methodology(
    session: AsyncSession, *, question: str, steps: list[dict[str, Any]], source: dict[str, Any]
) -> MethodologyRow:
    row = MethodologyRow(
        id=f"user.{uuid.uuid4().hex[:8]}", question=question, steps_json=steps, source_json=source
    )
    session.add(row)
    await session.flush()
    return row
