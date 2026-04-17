from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class ChatContext(BaseModel):
    page: str = "library"
    book_id: str | None = None
    book_title: str | None = None
    chapter_id: str | None = None
    chapter_title: str | None = None
    chapter_number: int | None = None
    selected_entity: dict | None = None  # {id, name, type}
    analysis_tab: str | None = None  # "characters" | "events"


class ChatIncomingMessage(BaseModel):
    message: str
    language: str = "en"
    context: ChatContext | None = None


class ChatOutgoingMessage(BaseModel):
    type: Literal["chunk", "done", "error"]
    content: str | None = None
    detail: str | None = None
