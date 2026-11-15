"""StorySphere v4 prototype FastAPI application.

Run with:
    uv run uvicorn storysphere.api.main:app --port 8000 --reload
"""

from __future__ import annotations

from fastapi import APIRouter, FastAPI

# 與既有 /api/v1 區隔（docs/spec/04 §1）。
API_PREFIX = "/api/v2"

router = APIRouter(prefix=API_PREFIX)


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app = FastAPI(title="StorySphere v4 prototype", version="0.1.0")
app.include_router(router)
