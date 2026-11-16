"""StorySphere v4 prototype FastAPI application.

Run with:
    uv run uvicorn storysphere.api.main:app --port 8000 --reload
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

from storysphere.llm.settings import check_capabilities, load_settings

# 與既有 /api/v1 區隔（docs/spec/04 §1）。
API_PREFIX = "/api/v2"

router = APIRouter(prefix=API_PREFIX)


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # 能力檢查：設定檔壞掉或 task 的 requires 與模型 caps 不符時，啟動直接失敗（SettingsError）。
    check_capabilities(load_settings())
    yield


app = FastAPI(title="StorySphere v4 prototype", version="0.1.0", lifespan=lifespan)
app.include_router(router)
