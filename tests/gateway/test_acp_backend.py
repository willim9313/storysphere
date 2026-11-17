"""ACP 後端（T26）：假的 adapter 連線，不啟動 Claude Code。"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from sqlalchemy import select
from storysphere.api.events import EventBus
from storysphere.gateway.acp_backend import AcpBackend
from storysphere.gateway.base import BackendError, SessionConfig
from storysphere.gateway.service import L0_TOOLS
from storysphere.mcp.runtime import ToolEnv
from storysphere.methods.jobs import MethodJobs
from storysphere.store.agent import TraceCallRow, create_session
from storysphere.store.db import create_engine, init_db, make_session_factory

from tests.api.support import add_book
from tests.methods.support import no_method_engine
from tests.store.conftest import BOOK

OPTIONS = [
    SimpleNamespace(kind="allow_once", option_id="a1"),
    SimpleNamespace(kind="allow_always", option_id="a2"),
    SimpleNamespace(kind="reject_once", option_id="r1"),
]


def tool_call(name: str, raw_input: dict | None = None) -> Any:
    return SimpleNamespace(
        field_meta={"claudeCode": {"toolName": name}}, title="whatever", raw_input=raw_input
    )


class FakeConn:
    def __init__(self, client: Any, script: list[Any]) -> None:
        self.client = client
        self.script = script
        self.calls: list[tuple[str, Any]] = []
        self.decisions: list[str] = []

    async def initialize(self, **kwargs: Any) -> None:
        self.calls.append(("initialize", kwargs))

    async def new_session(self, **kwargs: Any) -> Any:
        self.calls.append(("new_session", kwargs))
        return SimpleNamespace(session_id="acp-1")

    async def set_session_mode(self, **kwargs: Any) -> None:
        self.calls.append(("set_session_mode", kwargs))

    async def prompt(self, **kwargs: Any) -> Any:
        self.calls.append(("prompt", kwargs))
        for step in self.script:
            if step[0] == "text":
                await self.client.session_update("acp-1", SimpleNamespace(
                    session_update="agent_message_chunk", content=SimpleNamespace(text=step[1])))  # fmt: skip
            elif step[0] == "mode":
                await self.client.session_update("acp-1", SimpleNamespace(
                    session_update="current_mode_update", current_mode_id=step[1]))  # fmt: skip
            elif step[0] == "tool":
                res = await self.client.request_permission("acp-1", tool_call(step[1], {"x": 1}),
                                                           OPTIONS)  # fmt: skip
                self.decisions.append(res.outcome.option_id)
            elif step[0] == "hang":
                await asyncio.sleep(3600)
        return SimpleNamespace(stop_reason="end_turn")

    async def cancel(self, **kwargs: Any) -> None:
        self.calls.append(("cancel", kwargs))


class FakeSpawn:
    def __init__(self, script: list[Any]) -> None:
        self.script = script
        self.conn: FakeConn | None = None
        self.args: tuple = ()
        self.kwargs: dict = {}

    def __call__(self, client: Any, *args: str, **kwargs: Any):
        self.args, self.kwargs = args, kwargs

        @asynccontextmanager
        async def ctx():
            self.conn = FakeConn(client, self.script)
            yield self.conn, None

        return ctx()


@pytest.fixture
async def env(tmp_path: Path):
    engine = create_engine(tmp_path / "neo.db")
    await init_db(engine)
    sf = make_session_factory(engine)
    async with sf() as db, db.begin():
        await add_book(db)
    methods = no_method_engine(sf)
    yield ToolEnv(sf, methods, MethodJobs(methods), EventBus())
    await engine.dispose()


async def make_cfg(env: ToolEnv, tmp_path: Path) -> SessionConfig:
    async with env.session_factory() as db:
        row, token = await create_session(db, book_id=BOOK, backend="claude-code")
        await db.commit()
    env.sessions.ensure(row)
    skills = tmp_path / "ws" / row.id / "skills" / "character-analysis"
    skills.mkdir(parents=True)
    (skills / "SKILL.md").write_text("---\nname: character-analysis\n---\n", encoding="utf-8")
    return SessionConfig(
        session_id=row.id, book_id=BOOK, genre=None, mcp_url="http://127.0.0.1:1/mcp",
        token=token, workspace=tmp_path / "ws" / row.id, skills=["character-analysis"],
        allowed_tools=list(L0_TOOLS),
    )  # fmt: skip


def backend(env, tmp_path, spawn) -> AcpBackend:
    return AcpBackend(env, lambda: "python -y adapter", spawn=spawn,
                      workspace_root=tmp_path / "acp")  # fmt: skip


class TestStart:
    async def test_session_is_isolated_and_carries_skills_as_plugin(
        self, env, tmp_path, monkeypatch
    ):
        monkeypatch.setenv("GEMINI_API_KEY", "secret")
        spawn = FakeSpawn([])
        brain = backend(env, tmp_path, spawn)
        cfg = await make_cfg(env, tmp_path)
        await brain.start(cfg)

        assert spawn.args == ("python", "-y", "adapter")
        assert "GEMINI_API_KEY" not in spawn.kwargs["env"]
        assert spawn.kwargs["env"]["CLAUDE_CODE_DISABLE_AUTO_MEMORY"] == "1"
        calls = dict(spawn.conn.calls)
        options = calls["new_session"]["claudeCode"]["options"]
        assert options["tools"] == ["Skill"]
        assert options["settingSources"] == []
        assert options["extraArgs"] == {"strict-mcp-config": None}
        plugin = Path(options["plugins"][0]["path"])
        assert (plugin / "skills" / "character-analysis" / "SKILL.md").exists()
        assert json.loads((plugin / ".claude-plugin" / "plugin.json").read_text())["name"]
        (mcp,) = calls["new_session"]["mcp_servers"]
        assert mcp.name == "storysphere"
        assert mcp.headers[0].value == f"Bearer {cfg.token}"
        assert calls["set_session_mode"] == {"session_id": "acp-1", "mode_id": "default"}

        await brain.close(cfg.session_id)
        assert not (tmp_path / "acp" / cfg.session_id).exists()

    async def test_missing_launch_command_fails_start(self, env, tmp_path):
        brain = AcpBackend(env, lambda: "definitely-not-a-command-xyz", spawn=FakeSpawn([]))
        with pytest.raises(BackendError) as exc:
            await brain.start(await make_cfg(env, tmp_path))
        assert exc.value.code == "backend_start_failed"


class TestTurn:
    async def test_permissions_text_and_mode_guard(self, env, tmp_path):
        spawn = FakeSpawn([
            ("text", "Let me look. "),
            ("tool", "mcp__storysphere__get_run"),
            ("tool", "Skill"),
            ("tool", "Bash"),
            ("tool", "mcp__other__thing"),
            ("mode", "bypassPermissions"),
            ("text", "Done."),
        ])  # fmt: skip
        brain = backend(env, tmp_path, spawn)
        cfg = await make_cfg(env, tmp_path)
        await brain.start(cfg)
        pieces: list[str] = []
        reply = await brain.send(cfg.session_id, "hi", pieces.append)

        assert reply == "Let me look. Done."
        assert pieces == ["Let me look. ", "Done."]
        # 白名單內 allow_once（不用 allow_always），其餘 reject_once。
        assert spawn.conn.decisions == ["a1", "a1", "r1", "r1"]
        modes = [kw["mode_id"] for name, kw in spawn.conn.calls if name == "set_session_mode"]
        assert modes == ["default", "default"]
        async with env.session_factory() as db:
            denied = list(await db.scalars(select(TraceCallRow).order_by(TraceCallRow.seq)))
        assert [(t.tool, t.status, t.seq) for t in denied] == [
            ("Bash", "denied", 1),
            ("mcp__other__thing", "denied", 2),
        ]
        await brain.close(cfg.session_id)

    async def test_cancel_forwards_to_adapter(self, env, tmp_path):
        spawn = FakeSpawn([("hang",)])
        brain = backend(env, tmp_path, spawn)
        cfg = await make_cfg(env, tmp_path)
        await brain.start(cfg)
        task = asyncio.create_task(brain.send(cfg.session_id, "hi", lambda _t: None))
        await asyncio.sleep(0.01)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert ("cancel", {"session_id": "acp-1"}) in spawn.conn.calls
        await brain.close(cfg.session_id)
