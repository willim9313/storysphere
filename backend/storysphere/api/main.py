"""StorySphere v4 prototype FastAPI application.

Run with:
    uv run uvicorn storysphere.api.main:app --port 8000 --reload
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI
from starlette.routing import Route

from storysphere.api.errors import install_error_handlers
from storysphere.api.events import EventBus
from storysphere.api.routes import (
    books,
    events,
    evidence,
    ingest,
    jobs,
    overview,
    registry,
    runs,
    settings,
)
from storysphere.api.tasks import JobTasks
from storysphere.api.watcher import JobWatcher
from storysphere.ingest.service import CHECKPOINT_PATH, mark_interrupted_jobs, open_checkpointer
from storysphere.llm.settings import check_capabilities, load_settings
from storysphere.mcp.runtime import ToolEnv
from storysphere.mcp.server import MCP_PATH, McpMount, build_mcp_server, mcp_asgi_app
from storysphere.methods.engine import default_method_engine
from storysphere.methods.jobs import MethodJobs
from storysphere.store.db import create_engine, init_db, make_session_factory

# 與既有 /api/v1 區隔（docs/spec/04 §1）。
API_PREFIX = "/api/v2"

_VAR = Path(__file__).resolve().parents[3] / "var"
# 資料檔的位置；沒設就用 repo 的 var/（01 §1）。
DB_ENV = "STORYSPHERE_DB"
DEFAULT_DB_PATH = _VAR / "neo.db"
CHECKPOINT_ENV = "STORYSPHERE_CHECKPOINT_DB"
UPLOAD_DIR_ENV = "STORYSPHERE_UPLOAD_DIR"
DEFAULT_UPLOAD_DIR = _VAR / "uploads"
# 監看資料庫、產生 SSE 事件的間隔（秒）；0＝不監看（API 測試用）。
WATCH_INTERVAL_ENV = "STORYSPHERE_WATCH_INTERVAL"
DEFAULT_WATCH_INTERVAL = 0.5

router = APIRouter(prefix=API_PREFIX)


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def db_path() -> Path:
    return Path(os.environ.get(DB_ENV) or DEFAULT_DB_PATH)


def _env_path(name: str, default: Path) -> Path:
    return Path(os.environ.get(name) or default)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # 能力檢查：設定檔壞掉或 task 的 requires 與模型 caps 不符時，啟動直接失敗（SettingsError）。
    check_capabilities(load_settings())

    async with AsyncExitStack() as stack:
        engine = create_engine(db_path())
        stack.push_async_callback(engine.dispose)
        await init_db(engine)
        session_factory = make_session_factory(engine)
        # 上次沒跑完的 job 改成 interrupted；不自動續跑（02 §7）。
        await mark_interrupted_jobs(session_factory)
        method_engine = default_method_engine(session_factory)
        checkpointer = await stack.enter_async_context(
            open_checkpointer(_env_path(CHECKPOINT_ENV, CHECKPOINT_PATH))
        )
        bus = EventBus()
        tasks = JobTasks()
        method_jobs = MethodJobs(method_engine)

        app.state.session_factory = session_factory
        app.state.method_engine = method_engine
        app.state.registry = method_engine.registry
        app.state.checkpointer = checkpointer
        app.state.upload_dir = _env_path(UPLOAD_DIR_ENV, DEFAULT_UPLOAD_DIR)
        # 第一次用到時才建（建 S1 的 stage 需要可用的模型）；測試可以先放一個假的進來。
        app.state.ingest_service = None
        app.state.method_jobs = method_jobs
        app.state.job_tasks = tasks
        app.state.event_bus = bus

        # MCP server（04 §5）：每次 lifespan 建一個新的，session manager 只能 run 一次。
        mcp_env = ToolEnv(session_factory, method_engine, method_jobs, bus)
        mcp_server = build_mcp_server(mcp_env)
        app.state.mcp_app = mcp_asgi_app(mcp_server, mcp_env)  # 要先建 app 才有 session manager
        await stack.enter_async_context(mcp_server.session_manager.run())
        app.state.mcp_env = mcp_env

        interval = float(os.environ.get(WATCH_INTERVAL_ENV, DEFAULT_WATCH_INTERVAL))
        watcher = JobWatcher(session_factory, bus, method_engine.registry, interval=interval)
        app.state.watcher = watcher
        watch_task = asyncio.create_task(watcher.run_forever()) if interval > 0 else None
        try:
            yield
        finally:
            if watch_task is not None:
                watch_task.cancel()
                await asyncio.gather(watch_task, return_exceptions=True)
            await tasks.shutdown()


app = FastAPI(title="StorySphere v4 prototype", version="0.1.0", lifespan=lifespan)
install_error_handlers(app)
app.include_router(router)
for _group in (books, ingest, overview, evidence, runs, registry, settings, jobs, events):
    app.include_router(_group.router, prefix=API_PREFIX)
# 不在 /api/v2 下，UI 不呼叫（04 §1）。
# 用 Route 而不是 Mount：Mount 會把 `/mcp` 307 轉到 `/mcp/`，不是每個 MCP client 都會跟。
app.router.routes.append(Route(MCP_PATH, McpMount(lambda: getattr(app.state, "mcp_app", None))))
