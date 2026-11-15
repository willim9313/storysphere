from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from storysphere.store.db import create_engine, init_db, make_session_factory
from storysphere.store.evidence_writer import EvidenceDraft, WriteContext, write_evidence
from storysphere.store.tables import Evidence, Run

BOOK = "book-1"


@pytest.fixture
async def session(tmp_path) -> AsyncIterator[AsyncSession]:
    """真實 SQLite（tmp_path），每個測試一個乾淨的資料庫。"""
    engine = create_engine(tmp_path / "neo.db")
    await init_db(engine)
    async with make_session_factory(engine)() as db_session:
        yield db_session
    await engine.dispose()


class Store:
    """測試用的小幫手：用正式的寫入路徑建出各層證據。"""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def run(self, ref_id: str, scope_key: str = "", book_id: str = BOOK) -> Run:
        run = Run(book_id=book_id, ref_id=ref_id, scope_key=scope_key, status="running")
        self.session.add(run)
        await self.session.flush()
        return run

    async def extracted(
        self, claim_type: str = "event", run: Run | None = None, book_id: str = BOOK
    ) -> Evidence:
        ctx = WriteContext(
            book_id=book_id,
            source="extraction",
            produced_via="pipeline",
            run_id=run.id if run else None,
        )
        draft = EvidenceDraft(claim_type=claim_type, summary=f"{claim_type} 摘要", confidence=0.9)
        return await write_evidence(self.session, ctx, draft)

    async def derived(
        self,
        claim_type: str,
        upstream: list[Evidence],
        run: Run | None = None,
        source: str = "method",
    ) -> Evidence:
        ctx = WriteContext(
            book_id=BOOK,
            source=source,
            produced_via="pipeline",
            run_id=run.id if run else None,
        )
        draft = EvidenceDraft(
            claim_type=claim_type,
            summary=f"{claim_type} 摘要",
            confidence=0.8,
            derived_from=[e.id for e in upstream],
        )
        return await write_evidence(self.session, ctx, draft)

    async def note(self, cited: list[Evidence]) -> Evidence:
        ctx = WriteContext(
            book_id=BOOK, source="method", produced_via="ui", review_status="approved"
        )
        draft = EvidenceDraft(
            claim_type="note",
            summary="筆記標題",
            confidence=0.8,
            derived_from=[e.id for e in cited],
        )
        return await write_evidence(self.session, ctx, draft)

    async def refresh(self, *items: Evidence) -> None:
        for item in items:
            await self.session.refresh(item)


@pytest.fixture
def store(session: AsyncSession) -> Store:
    return Store(session)
