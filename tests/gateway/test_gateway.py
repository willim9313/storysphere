"""Gateway＋deepagents 後端（T25）：假的 chat model，MCP 走 in-process client，不叫 LLM。"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import pytest
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from mcp import Client
from sqlalchemy import select
from storysphere.api.errors import ApiError
from storysphere.api.events import EventBus
from storysphere.gateway.base import BackendError, SessionConfig
from storysphere.gateway.deepagents_backend import HIDDEN_TOOLS, DeepAgentsBackend
from storysphere.gateway.service import Gateway, close_stale_sessions
from storysphere.mcp.runtime import ToolEnv, session_stream
from storysphere.mcp.server import build_mcp_server
from storysphere.methods.jobs import MethodJobs
from storysphere.store.agent import AgentSessionRow, TraceCallRow, session_by_token
from storysphere.store.books import BookRow
from storysphere.store.db import create_engine, init_db, make_session_factory

from tests.api.support import add_book
from tests.methods.support import no_method_engine
from tests.store.conftest import BOOK


class ScriptedModel(BaseChatModel):
    """依序回 ``replies``；記下每次看到的工具名。"""

    replies: list[AIMessage]
    seen_tools: list[list[str]] = []
    calls: int = 0

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def bind_tools(self, tools: Any, **_: Any) -> Any:
        self.seen_tools.append([getattr(t, "name", None) or t.get("name") for t in tools])
        return self

    def _generate(self, messages: list[BaseMessage], stop: Any = None, run_manager: Any = None, **_: Any) -> ChatResult:
        reply = self.replies[min(self.calls, len(self.replies) - 1)]
        self.calls += 1
        return ChatResult(generations=[ChatGeneration(message=reply)])


def tool_then_answer() -> ScriptedModel:
    return ScriptedModel(
        replies=[
            AIMessage(
                content="",
                tool_calls=[{"name": "list_genre_elements", "args": {}, "id": "c1"}],
            ),
            AIMessage(content="This book is a mystery."),
        ]
    )


class SlowBackend:
    """`send` 一直等，用來測取消。"""

    def __init__(self) -> None:
        self.closed: list[str] = []

    async def start(self, cfg: SessionConfig) -> None:
        return None

    async def send(self, session_id: str, text: str, on_text: Any) -> str:
        on_text("thinking")
        await asyncio.sleep(3600)
        return ""

    async def close(self, session_id: str) -> None:
        self.closed.append(session_id)


class BrokenBackend(SlowBackend):
    async def start(self, cfg: SessionConfig) -> None:
        raise BackendError("backend_start_failed", "npx not found")


@pytest.fixture
async def sf(tmp_path: Path):
    engine = create_engine(tmp_path / "neo.db")
    await init_db(engine)
    factory = make_session_factory(engine)
    async with factory() as db, db.begin():
        await add_book(db)
    yield factory
    await engine.dispose()


def make_gateway(sf, tmp_path: Path, backends: dict[str, Any]) -> Gateway:
    engine = no_method_engine(sf)
    env = ToolEnv(sf, engine, MethodJobs(engine), EventBus())

    # in-process MCP 沒有 HTTP header：resolver 直接回唯一開著的 session。
    async def resolve(_ctx, env_):
        (sctx,) = env_.sessions._by_id.values()
        return sctx

    env.resolve = resolve
    return Gateway(sf, env, backends, workspace_root=tmp_path / "ws", mcp_url="http://test/mcp")


def in_process(gateway: Gateway):
    return lambda _url, _token: Client(build_mcp_server(gateway.env))


async def book(sf) -> BookRow:
    async with sf() as db:
        row = await db.get(BookRow, BOOK)
    assert row is not None
    return row


def events(gateway: Gateway, session_id: str) -> list[tuple[str, dict]]:
    return [(e.type, e.data) for e in gateway.env.bus.replay(session_stream(session_id), 0)]


async def wait_turn(gateway: Gateway, session_id: str) -> None:
    task = gateway._turns.get(session_id)
    if task is not None:
        await task


class TestDeepAgents:
    async def test_turn_calls_mcp_tool_and_answers(self, sf, tmp_path):
        model = tool_then_answer()
        gateway = make_gateway(sf, tmp_path, {})
        gateway.backends["deepagents"] = DeepAgentsBackend(
            model_factory=lambda _name: model, client_factory=in_process(gateway)
        )
        row = await gateway.open(book=await book(sf), backend="deepagents", genre="mystery", model=None)
        assert row.status == "ready"
        assert row.skills == ["event-analysis", "character-analysis", "mystery-fair-play"]
        assert (tmp_path / "ws" / row.id / "skills" / "mystery-fair-play" / "SKILL.md").exists()

        turn_id = await gateway.send(row.id, "What genre is this?")
        await wait_turn(gateway, row.id)

        async with sf() as db:
            traces = list(
                await db.scalars(select(TraceCallRow).where(TraceCallRow.session_id == row.id))
            )
            stored = await db.get(AgentSessionRow, row.id)
        assert [t.tool for t in traces] == ["list_genre_elements"]
        assert traces[0].turn_id == turn_id
        types = [t for t, _ in events(gateway, row.id)]
        assert types[:2] == ["tool_call", "tool_result"]
        assert types[-1] == "done"
        assert events(gateway, row.id)[-1][1]["data"] == {"stopReason": "end_turn"}
        assert stored.status == "ready"
        assert [m["role"] for m in stored.messages_json] == ["user", "assistant"]
        assert stored.messages_json[1]["text"] == "This book is a mystery."
        # L0：看得到 StorySphere 工具，看不到 shell／寫檔／子 agent。
        visible = set(model.seen_tools[-1])
        assert "list_genre_elements" in visible
        assert not visible & HIDDEN_TOOLS
        await gateway.close(row.id)

    async def test_unconfigured_model_is_503(self, sf, tmp_path):
        from storysphere.llm.router import LlmUnconfigured

        def no_model(_name):
            raise LlmUnconfigured("brain")

        gateway = make_gateway(sf, tmp_path, {})
        gateway.backends["deepagents"] = DeepAgentsBackend(model_factory=no_model)
        with pytest.raises(ApiError) as exc:
            await gateway.open(book=await book(sf), backend="deepagents", genre=None, model=None)
        assert exc.value.status == 503


class TestLifecycle:
    async def test_start_failure_marks_error_and_emits(self, sf, tmp_path):
        gateway = make_gateway(sf, tmp_path, {"claude-code": BrokenBackend()})
        row = await gateway.open(book=await book(sf), backend="claude-code", genre=None, model=None)
        assert row.status == "error"
        assert row.skills == ["event-analysis", "character-analysis"]
        (event,) = events(gateway, row.id)
        assert event[0] == "error"
        assert event[1]["data"]["code"] == "backend_start_failed"

    async def test_busy_session_rejects_message_and_cancel_stops_turn(self, sf, tmp_path):
        gateway = make_gateway(sf, tmp_path, {"slow": SlowBackend()})
        row = await gateway.open(book=await book(sf), backend="slow", genre=None, model=None)
        await gateway.send(row.id, "hi")
        await asyncio.sleep(0)
        with pytest.raises(ApiError) as exc:
            await gateway.send(row.id, "again")
        assert exc.value.code == "invalid_state"

        await gateway.cancel(row.id)
        assert events(gateway, row.id)[-1][1]["data"] == {"stopReason": "cancelled"}
        assert ("text_delta", ) == (events(gateway, row.id)[0][0],)
        assert (await gateway.get(row.id)).status == "ready"
        with pytest.raises(ApiError):
            await gateway.cancel(row.id)

    async def test_close_discards_open_drafts_and_revokes_token(self, sf, tmp_path):
        slow = SlowBackend()
        gateway = make_gateway(sf, tmp_path, {"slow": slow})
        row = await gateway.open(book=await book(sf), backend="slow", genre=None, model=None)
        async with sf() as db:
            stored = await db.get(AgentSessionRow, row.id)
            stored.drafts_json = [
                {
                    "draft_id": "d1", "session_id": row.id, "title": "t", "conclusion": "c",
                    "cited_evidence_ids": [], "question": "q", "state": "open",
                    "check": {"ok": False, "problems": []}, "note_id": None,
                    "created_at": "x", "updated_at": "x",
                }
            ]
            token_hash = stored.token_hash
            await db.commit()
        await gateway.close(row.id)
        closed = await gateway.get(row.id)
        assert closed.status == "closed"
        assert closed.drafts_json[0]["state"] == "discarded"
        assert slow.closed == [row.id]
        assert events(gateway, row.id)[-1][1]["data"]["op"] == "discarded"
        async with sf() as db:
            stale = await db.scalar(
                select(AgentSessionRow).where(AgentSessionRow.token_hash == token_hash)
            )
            assert stale is not None and stale.status == "closed"
            assert await session_by_token(db, "anything") is None

    async def test_discard_draft(self, sf, tmp_path):
        gateway = make_gateway(sf, tmp_path, {"slow": SlowBackend()})
        row = await gateway.open(book=await book(sf), backend="slow", genre=None, model=None)
        with pytest.raises(ApiError) as exc:
            await gateway.discard_draft(row.id, "nope")
        assert exc.value.status == 404

    async def test_unknown_approval_is_404(self, sf, tmp_path):
        gateway = make_gateway(sf, tmp_path, {"slow": SlowBackend()})
        row = await gateway.open(book=await book(sf), backend="slow", genre=None, model=None)
        with pytest.raises(ApiError) as exc:
            await gateway.resolve_approval(row.id, "nope", True)
        assert exc.value.status == 404

    async def test_close_stale_sessions_on_startup(self, sf, tmp_path):
        gateway = make_gateway(sf, tmp_path, {"slow": SlowBackend()})
        row = await gateway.open(book=await book(sf), backend="slow", genre=None, model=None)
        await close_stale_sessions(sf)
        assert (await gateway.get(row.id)).status == "closed"
