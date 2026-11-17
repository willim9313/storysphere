"""筆記與詮釋的引用規則（01 §5、04 N-06c、N-06e、§5.5 規則 2）。

REST（N-06c、N-06e）與 MCP 寫入工具共用：第 1 層、`rejected`、不在本書的證據都不能引用。
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.store.tables import Evidence


async def citation_problems(
    session: AsyncSession, book_id: str, ids: list[str]
) -> list[dict[str, Any]]:
    """`[{code, message, evidenceId?}]`；空清單＝可以存。"""
    if not ids:
        return [{"code": "no_citation", "message": "A note must cite at least one evidence."}]
    rows = {
        row.id: row
        for row in await session.scalars(
            select(Evidence).where(Evidence.id.in_(ids), Evidence.book_id == book_id)
        )
    }
    problems: list[dict[str, Any]] = []
    for evidence_id in ids:
        row = rows.get(evidence_id)
        if row is None:
            problems.append({"code": "not_found", "evidenceId": evidence_id,
                             "message": "Evidence not found in this book."})  # fmt: skip
        elif row.level == 1:
            problems.append({"code": "note_cites_level1", "evidenceId": evidence_id,
                             "message": "Level-1 evidence cannot be cited."})  # fmt: skip
        elif row.status == "rejected":
            problems.append({"code": "note_cites_rejected", "evidenceId": evidence_id,
                             "message": "Rejected evidence cannot be cited."})  # fmt: skip
    return problems
