"""N-01a、N-01c、N-01d、N-01e 書庫；N-03a 題材判定卡。"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.api.deps import BookDep, SessionDep
from storysphere.api.errors import ApiError
from storysphere.api.schemas.books import Book, BookDetail, ChapterItem, GenreCard, MixedGenre
from storysphere.api.schemas.common import camelize
from storysphere.store import purge
from storysphere.store.books import BookRow, ChapterRow, ParagraphRow
from storysphere.store.tables import Job

router = APIRouter(tags=["books"])

# 同一本書同時只會有一個（04 §3.3）。
INGEST_KINDS = ("ingest", "ingest_retry", "ingest_rerun", "genre_s4")
TERMINAL_STATUSES = ("done", "error", "cancelled")
_PROFILE_RAW_KEYS = frozenset({"mechanism_density"})


def effective_genre(book: BookRow) -> str | None:
    return book.genre_override or (book.genre_profile or {}).get("primary")


async def _book_fields(session: AsyncSession, books: list[BookRow]) -> list[dict[str, Any]]:
    ids = [book.id for book in books]
    chapter_counts = dict(
        (
            await session.execute(
                select(ChapterRow.book_id, func.count())
                .where(ChapterRow.book_id.in_(ids), ChapterRow.role == "body")
                .group_by(ChapterRow.book_id)
            )
        ).all()
    )
    latest_job: dict[str, Job] = {}
    jobs = await session.scalars(
        select(Job)
        .where(Job.book_id.in_(ids), Job.kind.in_(INGEST_KINDS))
        .order_by(Job.created_at)
    )
    for job in jobs:
        latest_job[job.book_id] = job  # 依時間排序，後面的蓋掉前面的
    out = []
    for book in books:
        job = latest_job.get(book.id)
        out.append(
            {
                "id": book.id,
                "title": book.title,
                "author": book.author,
                "language": book.language,
                "chapter_count": chapter_counts.get(book.id, 0),
                "effective_genre": effective_genre(book),
                "ingest_status": job.status if job else None,
                "ingest_job_id": job.id if job else None,
                "uploaded_at": book.uploaded_at,
            }
        )
    return out


@router.get("/books", response_model=list[Book])
async def list_books(session: SessionDep) -> list[Book]:
    """N-01a 書庫列表，含入庫中的書；新上傳的在前。"""
    books = list(await session.scalars(select(BookRow).order_by(BookRow.uploaded_at.desc())))
    return [Book(**fields) for fields in await _book_fields(session, books)]


@router.get("/books/{book_id}", response_model=BookDetail)
async def get_book(book: BookDep, session: SessionDep) -> BookDetail:
    """N-01c 單本書。"""
    (fields,) = await _book_fields(session, [book])
    return BookDetail(
        **fields,
        file_type=book.file_type,
        processed_at=book.processed_at,
        genre_profile=camelize(book.genre_profile, _PROFILE_RAW_KEYS),
        genre_override=book.genre_override,
    )


@router.get("/books/{book_id}/chapters", response_model=list[ChapterItem])
async def list_chapters(book: BookDep, session: SessionDep) -> list[ChapterItem]:
    """N-01e 章節清單，依章號。"""
    chapters = await session.scalars(
        select(ChapterRow).where(ChapterRow.book_id == book.id).order_by(ChapterRow.number)
    )
    stats: dict[str, tuple[int, str | None]] = {}
    paragraphs = await session.execute(
        select(ParagraphRow.chapter_id, ParagraphRow.id)
        .where(ParagraphRow.book_id == book.id)
        .order_by(ParagraphRow.chapter_id, ParagraphRow.position)
    )
    for chapter_id, paragraph_id in paragraphs:
        count, first = stats.get(chapter_id, (0, paragraph_id))
        stats[chapter_id] = (count + 1, first)
    return [
        ChapterItem(
            number=chapter.number,
            title=chapter.title,
            role=chapter.role,
            paragraph_count=stats.get(chapter.id, (0, None))[0],
            first_paragraph_id=stats.get(chapter.id, (0, None))[1],
        )
        for chapter in chapters
    ]


@router.get("/books/{book_id}/genre", response_model=GenreCard)
async def get_genre(book: BookDep) -> GenreCard:
    """N-03a 題材判定卡。"""
    profile = book.genre_profile or {}
    return GenreCard(
        primary=profile.get("primary"),
        mixed=[MixedGenre(**item) for item in profile.get("mixed") or []],
        mechanism_density=profile.get("mechanism_density") or {},
        rationale=profile.get("rationale"),
        detected_by=profile.get("detected_by"),
        detected_at=profile.get("detected_at"),
        override=book.genre_override,
        effective_genre=effective_genre(book),
    )


@router.delete("/books/{book_id}", status_code=204)
async def delete_book(book: BookDep, session: SessionDep, request: Request) -> Response:
    """N-01d 刪書：同一交易刪掉所有帶 `book_id` 的列；有非終態 job 時 409。

    上傳的原始檔（`var/uploads/`）不刪。
    """
    job_ids = list(await session.scalars(select(Job.id).where(Job.book_id == book.id)))
    active = await session.scalar(
        select(Job.id).where(Job.book_id == book.id, Job.status.not_in(TERMINAL_STATUSES))
    )
    if active is not None:
        raise ApiError(409, "job_conflict", f"Job {active} of this book is not finished.", jobId=active)
    await purge.delete_book(session, book.id)
    await session.commit()
    # 審閱 checkpoint 在另一個檔，不在上面的交易裡；thread 以 job id 為鍵。
    for job_id in job_ids:
        await request.app.state.checkpointer.adelete_thread(job_id)
    return Response(status_code=204)
