from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class ChatIncomingMessage(BaseModel):
    message: str


class ChatOutgoingMessage(BaseModel):
    type: Literal["chunk", "done", "error"]
    content: str | None = None
    detail: str | None = None
