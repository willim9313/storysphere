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

from api.routers import analysis, chat_ws, documents, entities, ingest, relations, search

logger = logging.getLogger(__name__)


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

    configure_langsmith(get_settings())

    logger.info("StorySphere API starting up — initialising services...")
    get_kg_service()
    get_doc_service()
    get_vector_service()
    get_chat_agent()
    get_analysis_agent()
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
    app.include_router(entities.router, prefix=prefix)
    app.include_router(relations.router, prefix=prefix)
    app.include_router(documents.router, prefix=prefix)
    app.include_router(search.router, prefix=prefix)
    app.include_router(ingest.router, prefix=prefix)
    app.include_router(analysis.router, prefix=prefix)
    app.include_router(chat_ws.router)  # WS paths don't use /api/v1 prefix

    return app


app = create_app()
