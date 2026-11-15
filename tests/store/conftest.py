from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from storysphere.store.db import create_engine, init_db, make_session_factory
from storysphere.store.evidence_writer import (
    EvidenceDraft,
    QuoteDraft,
    WriteContext,
    write_evidence,
)
from storysphere.store.tables import Evidence, Run

from tests.domain.minimal_content import MINIMAL_CONTENT

BOOK = "book-1"

PARAGRAPHS = {
    "p-1": "夏洛克·福爾摩斯從壁爐架的角落拿下一個瓶子。",
    "p-2": "摩斯坦小姐每年都會收到一顆珍珠。",
    # pypdf 會把一個詞拆開：「珍珠」存成「珍 珠」
    "p-3": "箱子裡裝滿了阿格拉的珍 珠與寶石。",
}


class FakeParagraphs:
    """ParagraphSource 的測試替身；正式的版本在 T07 接上 paragraphs 表。"""

    def __init__(self, texts: dict[str, str] | None = None) -> None:
        self.texts = PARAGRAPHS if texts is None else texts

    async def get_texts(self, paragraph_ids):
        return {pid: self.texts[pid] for pid in paragraph_ids if pid in self.texts}


def make_draft(claim_type: str, **overrides) -> EvidenceDraft:
    """一筆內容合法的草稿；第 1 層另外要自己帶 quotes。"""
    fields = {
        "claim_type": claim_type,
        "summary": f"{claim_type} 摘要",
        "confidence": 0.8,
        "content": MINIMAL_CONTENT[claim_type],
    }
    fields.update(overrides)
    return EvidenceDraft(**fields)


DEFAULT_QUOTE = QuoteDraft(paragraph_id="p-1", text="福爾摩斯")


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
        draft = make_draft(claim_type, confidence=0.9, quotes=[DEFAULT_QUOTE])
        return await write_evidence(self.session, ctx, draft, FakeParagraphs())

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
        draft = make_draft(claim_type, derived_from=[e.id for e in upstream])
        return await write_evidence(self.session, ctx, draft)

    async def note(self, cited: list[Evidence]) -> Evidence:
        ctx = WriteContext(
            book_id=BOOK, source="method", produced_via="ui", review_status="approved"
        )
        draft = make_draft("note", summary="筆記標題", derived_from=[e.id for e in cited])
        return await write_evidence(self.session, ctx, draft)

    async def refresh(self, *items: Evidence) -> None:
        for item in items:
            await self.session.refresh(item)


@pytest.fixture
def store(session: AsyncSession) -> Store:
    return Store(session)
