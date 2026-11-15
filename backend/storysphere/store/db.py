"""Async engine setup and schema initialisation for the evidence store.

單一 SQLite 檔（01 §1）。`init_db` 可重複呼叫：建表之後補上 FTS5 虛擬表與同步用的 trigger。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# 匯入即註冊 33 張內容表到 Base.metadata，create_all 才會建到它們。
import storysphere.store.content_tables  # noqa: F401
from storysphere.store.tables import Base

# 用 trigram tokenizer，中日韓文字才能做子字串搜尋。
# 限制：查詢字串少於 3 個字元時不會有任何結果。
_CREATE_FTS = """
CREATE VIRTUAL TABLE IF NOT EXISTS evidence_fts USING fts5(
    evidence_id UNINDEXED,
    book_id UNINDEXED,
    summary,
    quotes,
    tokenize='trigram'
)
"""

# 以下 trigger 讓 evidence_fts 跟著 evidence、evidence_quote 的寫入同步（04 §6.3）。
_TRIGGER_EVIDENCE_INSERT = """
CREATE TRIGGER IF NOT EXISTS evidence_fts_ai AFTER INSERT ON evidence
BEGIN
    INSERT INTO evidence_fts (evidence_id, book_id, summary, quotes)
    VALUES (NEW.id, NEW.book_id, NEW.summary, '');
END
"""

_TRIGGER_EVIDENCE_UPDATE = """
CREATE TRIGGER IF NOT EXISTS evidence_fts_au AFTER UPDATE OF summary ON evidence
BEGIN
    UPDATE evidence_fts SET summary = NEW.summary WHERE evidence_id = NEW.id;
END
"""

_TRIGGER_EVIDENCE_DELETE = """
CREATE TRIGGER IF NOT EXISTS evidence_fts_ad AFTER DELETE ON evidence
BEGIN
    DELETE FROM evidence_fts WHERE evidence_id = OLD.id;
END
"""

# `quotes` 欄＝該證據所有引文依 seq 排序、以換行相接；沒有引文時是空字串。
_RECOMPUTE_QUOTES = """
    UPDATE evidence_fts
    SET quotes = COALESCE(
        (
            SELECT group_concat(text, char(10))
            FROM (
                SELECT text FROM evidence_quote
                WHERE evidence_id = {ref}.evidence_id
                ORDER BY seq
            )
        ),
        ''
    )
    WHERE evidence_id = {ref}.evidence_id;
"""

_TRIGGER_QUOTE_INSERT = f"""
CREATE TRIGGER IF NOT EXISTS evidence_quote_fts_ai AFTER INSERT ON evidence_quote
BEGIN
{_RECOMPUTE_QUOTES.format(ref="NEW")}
END
"""

_TRIGGER_QUOTE_DELETE = f"""
CREATE TRIGGER IF NOT EXISTS evidence_quote_fts_ad AFTER DELETE ON evidence_quote
BEGIN
{_RECOMPUTE_QUOTES.format(ref="OLD")}
END
"""

# 更新時兩邊都重算：引文若被改掛到另一筆證據，舊的那筆也要更新。
_TRIGGER_QUOTE_UPDATE = f"""
CREATE TRIGGER IF NOT EXISTS evidence_quote_fts_au AFTER UPDATE ON evidence_quote
BEGIN
{_RECOMPUTE_QUOTES.format(ref="OLD")}
{_RECOMPUTE_QUOTES.format(ref="NEW")}
END
"""

_FTS_DDL = (
    _CREATE_FTS,
    _TRIGGER_EVIDENCE_INSERT,
    _TRIGGER_EVIDENCE_UPDATE,
    _TRIGGER_EVIDENCE_DELETE,
    _TRIGGER_QUOTE_INSERT,
    _TRIGGER_QUOTE_DELETE,
    _TRIGGER_QUOTE_UPDATE,
)


def create_engine(db_path: str | Path) -> AsyncEngine:
    """Build the async SQLite engine for the database file at ``db_path``."""
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_async_engine(f"sqlite+aiosqlite:///{path}", echo=False)

    # SQLite 的外鍵檢查預設關閉，而且是每條連線各自設定；不開的話 ON DELETE CASCADE 不會生效。
    @event.listens_for(engine.sync_engine, "connect")
    def _enable_foreign_keys(dbapi_connection: Any, _connection_record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


def make_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Session factory bound to ``engine``."""
    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def init_db(engine: AsyncEngine) -> None:
    """Create all tables, the FTS5 index and its triggers (idempotent)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for ddl in _FTS_DDL:
            await conn.execute(text(ddl))
