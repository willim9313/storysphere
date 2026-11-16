"""FastAPI dependencies: everything is read from ``app.state`` (set up in ``main.lifespan``)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from storysphere.api.errors import not_found
from storysphere.api.schemas.common import DEFAULT_LIMIT, MAX_LIMIT, decode_cursor
from storysphere.methods.engine import MethodEngine
from storysphere.registry.loader import Registry
from storysphere.store.books import BookRow


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.session_factory() as session:
        yield session


def get_registry(request: Request) -> Registry:
    return request.app.state.registry


def get_method_engine(request: Request) -> MethodEngine:
    return request.app.state.method_engine


SessionDep = Annotated[AsyncSession, Depends(get_session)]
RegistryDep = Annotated[Registry, Depends(get_registry)]
MethodEngineDep = Annotated[MethodEngine, Depends(get_method_engine)]


async def get_book_row(book_id: str, session: SessionDep) -> BookRow:
    """The book in the path, or 404."""
    book = await session.get(BookRow, book_id)
    if book is None:
        raise not_found("Book", book_id)
    return book


BookDep = Annotated[BookRow, Depends(get_book_row)]


class Paging:
    """`limit`／`cursor` query parameters (04 §1.3)."""

    def __init__(
        self,
        limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
        cursor: str | None = None,
    ) -> None:
        self.limit = limit
        self.offset = decode_cursor(cursor)


PagingDep = Annotated[Paging, Depends()]
