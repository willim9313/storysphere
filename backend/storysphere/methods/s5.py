"""S5 預設觸發（docs/spec/02 §8、03 §5）：依題材取視角的結果卡，逐張經引擎執行。

- 題材＝`books.genre_override`，沒有才用 `genre_profile.primary`。
- 一律先跑 `universal` 視角（「所有書」），再跑題材視角（沒有該題材的視角檔就只有通用的）。
  沒有 `genre_profile` 也沒有 override 時只跑通用視角（原型決定，規格沒講）。
- 卡片的 `ref` 是最後一步；上游（例如 EV1 的 EV2）由引擎自動補跑。
- 尚未實作的方法（含方法論，引擎還不支援）跳過並記在報告裡；任何一張卡失敗都不讓入庫失敗。
- 429：報告記到那裡為止，`quota_paused=True`，由入庫圖丟 `QuotaPaused`；續跑時本 job 已完成的卡不重跑。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from storysphere.methods.engine import MethodEngine
from storysphere.registry.models import Card
from storysphere.store.books import BookRow
from storysphere.store.tables import Evidence

UNIVERSAL = "universal"


@dataclass
class S5Card:
    ref: str
    question: str
    # done / not_applicable / failed / skipped
    status: str
    reason: str | None = None
    run_ids: list[str] = field(default_factory=list)


@dataclass
class S5Report:
    genre: str | None
    cards: list[S5Card] = field(default_factory=list)
    quota_paused: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "genre": self.genre,
            "cards": [
                {
                    "ref": c.ref,
                    "question": c.question,
                    "status": c.status,
                    "reason": c.reason,
                    "runIds": c.run_ids,
                }
                for c in self.cards
            ],
            "quotaPaused": self.quota_paused,
        }


def select_s5_cards(registry, genre: str | None) -> list[Card]:
    """Cards to run automatically, in order: universal first, then the genre's (deduplicated)."""
    cards: list[Card] = []
    for name in (UNIVERSAL, genre):
        perspective = registry.perspectives.get(name) if name else None
        if perspective is not None:
            cards.extend(perspective.cards)
    first: dict[str, Card] = {}
    for card in cards:
        first.setdefault(card.ref, card)
    return list(first.values())


async def has_s5_input(session_factory: async_sessionmaker[AsyncSession], book_id: str) -> bool:
    """The book has any current evidence; otherwise there is nothing to analyse."""
    async with session_factory() as session:
        found = await session.scalar(
            select(Evidence.id)
            .where(Evidence.book_id == book_id, Evidence.status == "current")
            .limit(1)
        )
    return found is not None


async def book_genre(session_factory: async_sessionmaker[AsyncSession], book_id: str) -> str | None:
    async with session_factory() as session:
        book = await session.get(BookRow, book_id)
    if book is None:
        raise LookupError(f"Book {book_id} not found")
    if book.genre_override:
        return book.genre_override
    return (book.genre_profile or {}).get("primary")


async def has_runnable_card(engine: MethodEngine, book_id: str) -> bool:
    """At least one card of this book has an implemented method (else S5 only records skips)."""
    genre = await book_genre(engine.session_factory, book_id)
    return any(engine.is_implemented(c.ref) for c in select_s5_cards(engine.registry, genre))


async def run_s5(engine: MethodEngine, book_id: str, *, job_id: str | None = None) -> S5Report:
    report = S5Report(genre=await book_genre(engine.session_factory, book_id))
    for card in select_s5_cards(engine.registry, report.genre):
        if card.ref in engine.registry.methodologies:
            report.cards.append(S5Card(card.ref, card.question, "skipped", "methodology"))
            continue
        if not engine.is_implemented(card.ref):
            report.cards.append(S5Card(card.ref, card.question, "skipped", "not_implemented"))
            continue
        if job_id and await engine.has_done_run(book_id, card.ref, job_id):
            report.cards.append(S5Card(card.ref, card.question, "skipped", "already_done"))
            continue
        result = await engine.run_method(book_id, card.ref, triggered_by="auto", job_id=job_id)
        report.cards.append(
            S5Card(
                card.ref,
                card.question,
                result.outcome,
                run_ids=[r.run_id for r in result.all_runs()],
            )
        )
        if result.rate_limited:
            report.quota_paused = True
            break
    return report
