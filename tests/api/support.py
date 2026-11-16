"""API 測試的資料準備：在 `client` 啟動前，用正式的寫入路徑把資料放進這個測試的資料庫。"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import TypeVar

from sqlalchemy.ext.asyncio import AsyncSession
from storysphere.store.books import BookRow, ChapterRow, ParagraphRow
from storysphere.store.db import create_engine, init_db, make_session_factory

from tests.store.conftest import BOOK, PARAGRAPHS, Store

T = TypeVar("T")
P = "/api/v2"


def seed(db_file: Path, fill: Callable[[Store], Awaitable[T]]) -> T:
    """Run ``fill(store)`` in one committed transaction against ``db_file``."""

    async def _run() -> T:
        engine = create_engine(db_file)
        await init_db(engine)
        try:
            async with make_session_factory(engine)() as session, session.begin():
                return await fill(Store(session))
        finally:
            await engine.dispose()

    return asyncio.run(_run())


async def add_book(
    session: AsyncSession, book_id: str = BOOK, *, title: str = "四簽名", profile=None
) -> None:
    """一本書：第 0 章（other，無段落）＋第 1 章（body，`PARAGRAPHS` 的三段）。"""
    session.add(
        BookRow(
            id=book_id,
            title=title,
            file_path=f"/x/{book_id}.txt",
            file_type="txt",
            language="zh-tw",
            genre_profile=profile,
        )
    )
    await session.flush()
    session.add_all(
        [
            ChapterRow(id=f"{book_id}-c0", book_id=book_id, number=0, title=None, role="other"),
            ChapterRow(id=f"{book_id}-c1", book_id=book_id, number=1, title="演繹的科學"),
        ]
    )
    await session.flush()
    if book_id != BOOK:
        return
    session.add_all(
        ParagraphRow(
            id=paragraph_id,
            chapter_id=f"{book_id}-c1",
            book_id=book_id,
            chapter_number=1,
            position=position,
            text=text,
        )
        for position, (paragraph_id, text) in enumerate(PARAGRAPHS.items())
    )
    await session.flush()
