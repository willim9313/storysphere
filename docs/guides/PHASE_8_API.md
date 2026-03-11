# Phase 8 實施指南：FastAPI 層

**版本**: v1.0
**日期**: 2026-03-11
**前置條件**: Phase 1–7 全部完成

---

## 目標

將 StorySphere 的後端能力透過 FastAPI 暴露為 HTTP / WebSocket API，供前端或外部客戶端呼叫。

**四類 API**：

| 類型 | 路徑 | 延遲目標 |
|------|------|---------|
| 同步查詢 | `GET /api/v1/*` | <100ms |
| 文件上傳 & Ingest | `POST /api/v1/ingest` | 回傳 task_id，背景執行 |
| 深度分析 | `POST /api/v1/analysis/*` | 回傳 task_id，輪詢或 WebSocket |
| Chat 串流 | `WS /ws/chat` | 流式 token 推送 |

---

## 目錄結構

```
src/
└── api/
    ├── __init__.py
    ├── main.py              # FastAPI app 建立、lifespan、middleware
    ├── deps.py              # 依賴注入（Services / Agents 單例）
    ├── routers/
    │   ├── __init__.py
    │   ├── entities.py      # GET /api/v1/entities/*
    │   ├── relations.py     # GET /api/v1/relations/*
    │   ├── search.py        # GET /api/v1/search
    │   ├── ingest.py        # POST /api/v1/ingest
    │   ├── analysis.py      # POST /api/v1/analysis/* + GET 輪詢
    │   └── chat_ws.py       # WS /ws/chat
    └── schemas/
        ├── __init__.py
        ├── common.py        # TaskStatus, ErrorResponse, Pagination
        ├── entity.py
        ├── analysis.py
        └── chat.py
```

---

## 依賴注入設計（`deps.py`）

所有 Services / Agents 在 app 啟動時建立一次（單例），透過 `Annotated` 注入：

```python
# src/api/deps.py
from functools import lru_cache
from typing import Annotated
from fastapi import Depends

from services.kg_service import KGService
from services.document_service import DocumentService
from services.vector_service import VectorService
from services.summary_service import SummaryService
from services.extraction_service import ExtractionService
from services.analysis_service import AnalysisService
from services.analysis_cache import AnalysisCache
from agents.chat_agent import ChatAgent
from agents.analysis_agent import AnalysisAgent
from config.settings import get_settings

@lru_cache(maxsize=1)
def get_kg_service() -> KGService: ...

@lru_cache(maxsize=1)
def get_chat_agent() -> ChatAgent: ...

@lru_cache(maxsize=1)
def get_analysis_agent() -> AnalysisAgent: ...

# 型別別名（供 router 使用）
KGServiceDep = Annotated[KGService, Depends(get_kg_service)]
ChatAgentDep = Annotated[ChatAgent, Depends(get_chat_agent)]
AnalysisAgentDep = Annotated[AnalysisAgent, Depends(get_analysis_agent)]
```

---

## `main.py` 結構

```python
# src/api/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import entities, relations, search, ingest, analysis, chat_ws

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 啟動：預先建立單例（暖機）
    from api.deps import get_kg_service, get_chat_agent, get_analysis_agent
    get_kg_service()
    get_chat_agent()
    get_analysis_agent()
    yield
    # 關閉：釋放資源（如需要）

app = FastAPI(
    title="StorySphere API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(CORSMiddleware, allow_origins=["*"], ...)

app.include_router(entities.router, prefix="/api/v1")
app.include_router(relations.router, prefix="/api/v1")
app.include_router(search.router, prefix="/api/v1")
app.include_router(ingest.router, prefix="/api/v1")
app.include_router(analysis.router, prefix="/api/v1")
app.include_router(chat_ws.router)
```

---

## Router 詳細設計

### 1. 同步查詢（`entities.py`）

```python
# GET /api/v1/entities/{entity_id}
@router.get("/entities/{entity_id}", response_model=EntityResponse)
async def get_entity(entity_id: str, kg: KGServiceDep) -> EntityResponse:
    entity = await kg.get_entity(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    return EntityResponse.from_domain(entity)

# GET /api/v1/entities/{entity_id}/relations
@router.get("/entities/{entity_id}/relations", response_model=list[RelationResponse])
async def get_entity_relations(entity_id: str, kg: KGServiceDep): ...

# GET /api/v1/entities/{entity_id}/timeline
@router.get("/entities/{entity_id}/timeline", response_model=list[TimelineEntry])
async def get_entity_timeline(entity_id: str, kg: KGServiceDep): ...
```

### 2. 語義搜尋（`search.py`）

```python
# GET /api/v1/search?q=...&limit=10&document_id=...
@router.get("/search", response_model=list[SearchResult])
async def semantic_search(
    q: str,
    limit: int = 10,
    document_id: str | None = None,
    vector: VectorServiceDep,
): ...
```

### 3. 文件上傳 & Ingest（`ingest.py`）

```python
# POST /api/v1/ingest
@router.post("/ingest", response_model=TaskStatus, status_code=202)
async def ingest_document(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    language: str = Form(default="en"),
) -> TaskStatus:
    task_id = str(uuid4())
    background_tasks.add_task(_run_ingestion, task_id, file, title, language)
    return TaskStatus(task_id=task_id, status="pending")

# GET /api/v1/ingest/{task_id}
@router.get("/ingest/{task_id}", response_model=TaskStatus)
async def get_ingest_status(task_id: str) -> TaskStatus: ...
```

**任務狀態存儲**：用 `dict` in-memory（開發）或 SQLite `tasks` 表（生產）。

### 4. 深度分析（`analysis.py`）

```python
# POST /api/v1/analysis/character
@router.post("/analysis/character", response_model=TaskStatus, status_code=202)
async def analyze_character(
    req: CharacterAnalysisRequest,
    background_tasks: BackgroundTasks,
    agent: AnalysisAgentDep,
) -> TaskStatus:
    # 先查緩存（AnalysisAgent 內建）
    # 命中 → 直接回傳 200 + 結果
    # 未命中 → 202 + task_id，背景執行
    ...

# GET /api/v1/analysis/character/{task_id}
@router.get("/analysis/character/{task_id}", response_model=CharacterAnalysisResponse)
async def get_character_analysis(task_id: str): ...

# POST /api/v1/analysis/event  （同上模式）
# GET  /api/v1/analysis/event/{task_id}
```

**Request schema**：

```python
class CharacterAnalysisRequest(BaseModel):
    entity_name: str
    document_id: str
    archetype_frameworks: list[str] = ["jung"]
    language: str = "en"
    force_refresh: bool = False
```

### 5. Chat WebSocket（`chat_ws.py`）

```python
# WS /ws/chat?session_id=...
@router.websocket("/ws/chat")
async def chat_websocket(
    websocket: WebSocket,
    session_id: str,
    agent: ChatAgentDep,
):
    await websocket.accept()
    state = _get_or_create_state(session_id)  # in-memory session store

    try:
        while True:
            data = await websocket.receive_json()
            query = data.get("message", "")

            # 流式串流
            async for chunk in agent.astream(query, state):
                await websocket.send_json({"type": "chunk", "content": chunk})

            await websocket.send_json({"type": "done"})
    except WebSocketDisconnect:
        _cleanup_state(session_id)
```

**WebSocket 訊息格式**：

```json
// Client → Server
{ "message": "Who is Elizabeth Bennet?" }

// Server → Client（多次）
{ "type": "chunk", "content": "Elizabeth " }
{ "type": "chunk", "content": "Bennet is..." }

// Server → Client（結束）
{ "type": "done" }

// Server → Client（錯誤）
{ "type": "error", "detail": "..." }
```

---

## 通用 Schema（`schemas/common.py`）

```python
from pydantic import BaseModel
from typing import Literal, Any

class TaskStatus(BaseModel):
    task_id: str
    status: Literal["pending", "running", "completed", "failed"]
    result: Any | None = None
    error: str | None = None

class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None
```

---

## 錯誤處理

```python
# main.py — 全局 exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )
```

| HTTP 狀態碼 | 情境 |
|------------|------|
| 200 | 同步查詢成功 / 分析緩存命中 |
| 202 | 背景任務已接受（ingest / analysis） |
| 404 | Entity / task 不存在 |
| 422 | 請求參數驗證失敗（FastAPI 自動） |
| 500 | 內部錯誤 |

---

## 新增 Settings

在 `src/config/settings.py` 補充（已有 `app_host`, `app_port`）：

```python
# ── API ────────────────────────────────────────────────────────────────────
api_cors_origins: list[str] = Field(default=["*"], description="CORS 允許來源")
api_max_upload_size_mb: int = Field(default=50, description="上傳檔案大小上限 (MB)")
task_store_backend: Literal["memory", "sqlite"] = Field(
    default="memory", description="任務狀態存儲後端"
)
```

---

## 啟動方式

```bash
# 開發（hot reload）
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

# 生產
uvicorn api.main:app --host 0.0.0.0 --port 8000 --workers 4
```

新增至 `pyproject.toml`：

```toml
[project.scripts]
storysphere-api = "api.main:app"

[project.dependencies]
# 新增
fastapi = ">=0.115.0"
uvicorn = { version = ">=0.30.0", extras = ["standard"] }
python-multipart = ">=0.0.9"   # 上傳檔案需要
```

---

## 測試策略

```
tests/
└── api/
    ├── conftest.py          # TestClient + mock services fixture
    ├── test_entities.py     # 同步查詢端點
    ├── test_ingest.py       # 上傳 + 輪詢
    ├── test_analysis.py     # 分析任務 + 緩存命中路徑
    └── test_chat_ws.py      # WebSocket（使用 starlette TestClient）
```

**測試原則**：
- 所有 Services 用 Mock 替換（不依賴真實 DB / LLM）
- 測試路由邏輯、HTTP 狀態碼、response schema 正確性
- WebSocket 測試用 `client.websocket_connect()`

---

## 實作順序

1. **`deps.py` + `main.py`** — app 骨架 + lifespan
2. **`schemas/`** — 所有 Pydantic response/request 模型
3. **同步查詢 routers**（entities, relations, search）— 最簡單，先跑通
4. **ingest router** — 上傳 + BackgroundTasks + 任務狀態
5. **analysis router** — 緩存命中 vs. 背景任務兩條路徑
6. **chat_ws router** — WebSocket + session state 管理
7. **整合測試** — 端到端 smoke test（可選真實 LLM）

---

## 完成標準

- [ ] 所有 router 單元測試通過（mock services）
- [ ] `GET /api/v1/entities/{id}` 回應時間 <100ms（本地 NetworkX）
- [ ] Chat WebSocket 能流式回傳 token
- [ ] Deep analysis 202 → 輪詢 → 200 流程完整
- [ ] FastAPI `/docs`（OpenAPI）正確顯示所有端點
- [ ] `uvicorn` 啟動無錯誤

---

**維護者**: William
**版本**: v1.0
**對應 CORE.md Phase**: Phase 8
