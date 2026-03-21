from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


class ChatContext(BaseModel):
    page: str = "library"
    book_id: Optional[str] = None
    book_title: Optional[str] = None
    chapter_id: Optional[str] = None
    chapter_title: Optional[str] = None
    selected_entity: Optional[dict] = None  # {id, name, type}


class ChatIncomingMessage(BaseModel):
    message: str
    language: str = "en"
    context: Optional[ChatContext] = None


class ChatOutgoingMessage(BaseModel):
    type: Literal["chunk", "done", "error"]
    content: str | None = None
    detail: str | None = None
