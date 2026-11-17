"""MCP 工具測試：真實 SQLite（tmp_path）＋ in-process MCP client；LLM 不會被呼叫。

`env` 的 resolver 固定回 `agent` 這個 session，in-process 呼叫沒有 HTTP header；
Bearer 驗證另在 `test_server.py` 走 HTTP 測。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pytest
from mcp import Client
from sqlalchemy import select
from storysphere.api.events import EventBus
from storysphere.mcp.runtime import SessionContext, ToolEnv, session_stream
from storysphere.mcp.server import build_mcp_server
from storysphere.methods.engine import default_registry
from storysphere.methods.jobs import MethodJobs
from storysphere.store.agent import TraceCallRow, create_session
from storysphere.store.db import create_engine, init_db, make_session_factory

# `/mcp` 的 HTTP 測試共用 API 的 app fixture。
from tests.api.conftest import client, db_file  # noqa: F401
from tests.api.support import add_book
from tests.methods.support import no_method_engine
from tests.store.conftest import BOOK


@dataclass
class Agent:
    env: ToolEnv
    session: SessionContext
    token: str

    def events(self) -> list[tuple[str, dict]]:
        stream = self.env.bus.replay(session_stream(self.session.session_id), 0)
        return [(event.type, event.data) for event in stream]

    async def traces(self) -> list[TraceCallRow]:
        async with self.env.session_factory() as db:
            return list(
                await db.scalars(
                    select(TraceCallRow)
                    .where(TraceCallRow.session_id == self.session.session_id)
                    .order_by(TraceCallRow.seq)
                )
            )


@pytest.fixture
async def sf(tmp_path: Path):
    engine = create_engine(tmp_path / "neo.db")
    await init_db(engine)
    yield make_session_factory(engine)
    await engine.dispose()


@pytest.fixture
async def agent(sf) -> Agent:
    """一本書（`add_book`）＋一個開著的 agent session；env 的 resolver 固定回它。"""
    async with sf() as db, db.begin():
        await add_book(db)
        row, token = await create_session(db, book_id=BOOK, backend="deepagents")
    engine = no_method_engine(sf)
    assert engine.registry.methods.keys() == default_registry().methods.keys()
    env = ToolEnv(sf, engine, MethodJobs(engine), EventBus())
    sctx = env.sessions.ensure(row)

    async def resolve(_ctx, _env):
        return sctx

    env.resolve = resolve
    return Agent(env, sctx, token)


async def call(agent: Agent, tool: str, args: dict | None = None):
    """One tool call through an in-process MCP client.

    不做成 async 產生器 fixture：client 的 task group 必須在同一個 task 裡開關。
    """
    async with Client(build_mcp_server(agent.env)) as mcp_client:
        return await mcp_client.call_tool(tool, args or {})


def payload(result) -> dict:
    """Result of a successful call (the JSON text the brain reads)."""
    assert not result.is_error, result.content
    data = json.loads(result.content[0].text)
    assert data == result.structured_content
    return data


def error_of(result) -> dict:
    """`{code, message, hint}` of a failed call."""
    assert result.is_error
    return json.loads(result.content[0].text)
