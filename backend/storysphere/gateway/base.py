"""Agent Gateway 的後端介面（架構文件「Agent Gateway」、05 §5、04 §4.10）。

Gateway（`gateway/service.py`）管 session 的生命週期、輪次、狀態與事件；後端只負責「讓某個大腦
跑一輪」。`tool_call`／`tool_result`／`view`／`note_draft`／`approval_request` 由 MCP server 發
（04 §5.1），後端只發 `text_delta`；`done`、`error` 由 Gateway 發。
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

# 收一段旁白文字（`text_delta`）。
TextSink = Callable[[str], None]


@dataclass(frozen=True)
class SessionConfig:
    """組裝好的 session（架構文件：mcp_servers＋skills＋allowed_tools＋workspace＋model）。"""

    session_id: str
    book_id: str
    genre: str | None
    mcp_url: str
    token: str  # 只在記憶體；不寫進 DB、log、trace
    workspace: Path  # `skills/<name>/SKILL.md` 放在這底下
    skills: list[str] = field(default_factory=list)
    allowed_tools: list[str] = field(default_factory=list)
    model: str | None = None  # deepagents：`models` 的 key
    book_title: str = ""


class BackendError(Exception):
    """後端啟動或執行失敗；`code` 對應 AgentEvent `error` 的 `code`（04 §5.1）。"""

    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


class AgentBackend(Protocol):
    async def start(self, cfg: SessionConfig) -> None:
        """準備好大腦；失敗丟 `BackendError`。"""
        ...

    async def send(self, session_id: str, text: str, on_text: TextSink) -> str:
        """跑一輪；串流的旁白交給 ``on_text``，回傳這一輪最後的回覆文字。被取消時丟 CancelledError。"""
        ...

    async def close(self, session_id: str) -> None: ...


SYSTEM_PROMPT = """You are the analysis brain of StorySphere, working on one book.

Book: {title} (id {book_id}). Genre: {genre}.

Rules:
- Use only the StorySphere MCP tools. Do not read local files, run commands or browse the web.
- Before running a method, check `list_methods`; when a method already has a current run, read it with `get_run` instead of re-running.
- A conclusion only counts when it is backed by evidence ids returned by the tools. Cite those ids.
- `create_note` only makes a draft; the user confirms it. Never claim a note was saved.
- Present results with `show_view` when a view fits.
- Answer in the language of the user's question; keep quotes in the book's language.
"""


def system_prompt(cfg: SessionConfig) -> str:
    return SYSTEM_PROMPT.format(
        title=cfg.book_title or "(untitled)", book_id=cfg.book_id, genre=cfg.genre or "unknown"
    )
