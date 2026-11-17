"""Delete a whole book from the single SQLite file (docs/spec/04 N-01d、01 §1).

所有帶 `book_id` 的表在呼叫端的同一個交易裡刪；證據的關聯表與 `ev_*` 內容表靠外鍵
`ON DELETE CASCADE` 跟著刪，`evidence_fts` 靠 trigger。函式只 flush，不 commit。
"""

from __future__ import annotations

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.store.books import BookRow, ChapterRow, ParagraphRow
from storysphere.store.ingest_units import IngestUnitOutputRow, IngestUnitRow
from storysphere.store.paragraph_entities import ParagraphEntityRow
from storysphere.store.tables import Evidence, Job, Run

# 依外鍵順序：先刪引用別人的，books 最後。
_BOOK_TABLES = (
    Evidence,
    Run,
    Job,
    IngestUnitOutputRow,
    IngestUnitRow,
    ParagraphEntityRow,
    ParagraphRow,
    ChapterRow,
)


async def delete_book(session: AsyncSession, book_id: str) -> None:
    for model in _BOOK_TABLES:
        await session.execute(delete(model).where(model.book_id == book_id))
    await session.execute(delete(BookRow).where(BookRow.id == book_id))
    await session.flush()
