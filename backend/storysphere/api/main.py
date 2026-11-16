"""StorySphere v4 prototype FastAPI application.

Run with:
    uv run uvicorn storysphere.api.main:app --port 8000 --reload
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI

from storysphere.api.errors import install_error_handlers
from storysphere.api.routes import books, evidence, jobs, registry, runs
from storysphere.ingest.service import mark_interrupted_jobs
from storysphere.llm.settings import check_capabilities, load_settings
from storysphere.methods.engine import default_method_engine
from storysphere.store.db import create_engine, init_db, make_session_factory

# 與既有 /api/v1 區隔（docs/spec/04 §1）。
API_PREFIX = "/api/v2"

# 資料庫檔的位置；沒設就用 repo 的 var/neo.db（01 §1）。
DB_ENV = "STORYSPHERE_DB"
DEFAULT_DB_PATH = Path(__file__).resolve().parents[3] / "var" / "neo.db"

router = APIRouter(prefix=API_PREFIX)


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def db_path() -> Path:
    return Path(os.environ.get(DB_ENV) or DEFAULT_DB_PATH)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # 能力檢查：設定檔壞掉或 task 的 requires 與模型 caps 不符時，啟動直接失敗（SettingsError）。
    check_capabilities(load_settings())

    engine = create_engine(db_path())
    await init_db(engine)
    session_factory = make_session_factory(engine)
    # 上次沒跑完的 job 改成 interrupted；不自動續跑（02 §7）。
    await mark_interrupted_jobs(session_factory)
    method_engine = default_method_engine(session_factory)

    app.state.session_factory = session_factory
    app.state.method_engine = method_engine
    app.state.registry = method_engine.registry
    try:
        yield
    finally:
        await engine.dispose()


app = FastAPI(title="StorySphere v4 prototype", version="0.1.0", lifespan=lifespan)
install_error_handlers(app)
app.include_router(router)
for _group in (books, evidence, runs, registry, jobs):
    app.include_router(_group.router, prefix=API_PREFIX)
