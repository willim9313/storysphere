"""StorySphere FastAPI application.

Run with:
    uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.routers import analysis, books, chat_ws, documents, entities, ingest, relations, search, tasks

logger = logging.getLogger(__name__)


async def _check_local_llm(settings) -> None:  # type: ignore[type-arg]
    """Ping the local LLM endpoint at startup. Warn but do not fail if unreachable."""
    import httpx

    url = settings.local_llm_base_url.rstrip("/") + "/models"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.get(url)
        logger.info(
            "Local LLM ready — model=%s endpoint=%s",
            settings.local_llm_model,
            settings.local_llm_base_url,
        )
    except Exception as exc:
        logger.warning(
            "Local LLM unreachable at %s (%s). "
            "Local fallback will be unavailable until the server is started.",
            settings.local_llm_base_url,
            exc,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warm up singletons on startup so the first request is not slow."""
    from api.deps import (  # noqa: PLC0415
        get_kg_service,
        get_doc_service,
        get_vector_service,
        get_chat_agent,
        get_analysis_agent,
    )

    from core.tracing import configure_langsmith  # noqa: PLC0415
    from config.settings import get_settings  # noqa: PLC0415

    settings = get_settings()
    configure_langsmith(settings)

    logger.info("StorySphere API starting up — initialising services...")
    get_kg_service()
    get_doc_service()
    get_vector_service()
    get_chat_agent()
    get_analysis_agent()

    if settings.has_local_llm:
        await _check_local_llm(settings)

    logger.info("All services ready.")
    yield
    logger.info("StorySphere API shutting down.")


def create_app() -> FastAPI:
    from config.settings import get_settings  # noqa: PLC0415

    settings = get_settings()

    app = FastAPI(
        title="StorySphere API",
        description="Intelligent novel analysis system — HTTP & WebSocket API",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if settings.is_development else [],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Global error handler ──────────────────────────────────────────────────
    @app.exception_handler(Exception)
    async def _global_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    # ── Health check ──────────────────────────────────────────────────────────
    @app.get("/health", tags=["health"])
    async def health() -> dict:
        return {"status": "ok"}

    # ── Routers ───────────────────────────────────────────────────────────────
    prefix = "/api/v1"
    # Frontend-facing (aligned with API_CONTRACT.md)
    app.include_router(books.router, prefix=prefix)
    app.include_router(tasks.router, prefix=prefix)
    # Internal / tool-facing (kept for chat agent and direct queries)
    app.include_router(entities.router, prefix=prefix)
    app.include_router(relations.router, prefix=prefix)
    app.include_router(documents.router, prefix=prefix)
    app.include_router(search.router, prefix=prefix)
    app.include_router(ingest.router, prefix=prefix)
    app.include_router(analysis.router, prefix=prefix)
    app.include_router(chat_ws.router)  # WS paths don't use /api/v1 prefix

    return app


app = create_app()
