# Phase 8 實施指南：FastAPI 層

**版本**: v2.0
**日期**: 2026-03-17
**前置條件**: Phase 1–7 全部完成

---

## 目標

將 StorySphere 的後端能力透過 FastAPI 暴露為 HTTP / WebSocket API，供前端或外部客戶端呼叫。

**兩套 API**：

| 類型 | 路徑 | 說明 |
|------|------|------|
| **前端 API**（對齊 `API_CONTRACT.md`） | `/api/v1/books/*`, `/api/v1/tasks/*` | 前端直接呼叫 |
| **內部 API**（工具層 / Chat Agent） | `/api/v1/entities/*`, `/api/v1/relations/*`, `/api/v1/search/*`, `/api/v1/analysis/*`, `/api/v1/ingest/*` | Chat Agent 和 tools 使用 |
| Chat 串流 | `WS /ws/chat` | 流式 token 推送 |

---

## 目錄結構

```
src/
└── api/
    ├── __init__.py
    ├── main.py              # FastAPI app 建立、lifespan、middleware
    ├── deps.py              # 依賴注入（Services / Agents 單例）
    ├── store.py             # 任務狀態存儲（memory / sqlite）
    ├── routers/
    │   ├── __init__.py
    │   ├── books.py         # 前端 API：GET/POST/DELETE /api/v1/books/*
    │   ├── tasks.py         # 前端 API：GET /api/v1/tasks/:taskId/status
    │   ├── entities.py      # 內部 API：GET /api/v1/entities/*
    │   ├── relations.py     # 內部 API：GET /api/v1/relations/*
    │   ├── documents.py     # 內部 API：GET /api/v1/documents/*
    │   ├── search.py        # GET /api/v1/search
    │   ├── ingest.py        # 內部 API：POST /api/v1/ingest
    │   ├── analysis.py      # 內部 API：POST /api/v1/analysis/*
    │   └── chat_ws.py       # WS /ws/chat
    └── schemas/
        ├── __init__.py
        ├── common.py        # TaskStatus (camelCase), ErrorResponse
        ├── entity.py
        ├── analysis.py
        └── chat.py
```

---

## 前端 API 端點（`books.py` + `tasks.py`）

所有前端 API 回應為 **camelCase JSON**，對齊 `API_CONTRACT.md`。

### 書庫

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET /api/v1/books` | 書籍列表 | `Book[]` |
| `GET /api/v1/books/:bookId` | 書籍詳情 | `BookDetail` |
| `DELETE /api/v1/books/:bookId` | 刪除書籍 | 204 |
| `POST /api/v1/books/upload` | 上傳 PDF/DOCX | `{ taskId }` |

### 章節與內容

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET /api/v1/books/:bookId/chapters` | 章節列表 | `Chapter[]` |
| `GET /api/v1/books/:bookId/chapters/:chapterId/chunks` | 段落（含 segments） | `Chunk[]` |

### 知識圖譜

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET /api/v1/books/:bookId/graph` | 圖譜節點與邊 | `GraphData` |

### 深度分析

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST /api/v1/books/:bookId/analyze` | 觸發整本書分析 | `{ taskId }` |
| `GET /api/v1/books/:bookId/analysis/characters` | 角色分析列表 | `AnalysisListResponse` |
| `GET /api/v1/books/:bookId/analysis/events` | 事件分析列表 | `AnalysisListResponse` |
| `POST /api/v1/books/:bookId/analysis/:section/:itemId/regenerate` | 重新生成 | `{ taskId }` |
| `GET /api/v1/books/:bookId/entities/:entityId/analysis` | 實體分析結果 | `EntityAnalysis` |
| `POST /api/v1/books/:bookId/entities/:entityId/analyze` | 觸發實體分析 | `{ taskId }` |
| `DELETE /api/v1/books/:bookId/entities/:entityId/analysis` | 刪除分析 | 204 |

### 任務狀態

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET /api/v1/tasks/:taskId/status` | 輪詢任務進度 | `TaskStatus` |

---

## TaskStatus Schema（camelCase）

```python
class TaskStatus(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    task_id: str        # → taskId
    status: Literal["pending", "running", "done", "error"]
    progress: int = 0   # 0–100
    stage: str = ""     # 顯示文字，如「解析文件中」
    result: dict[str, Any] | None = None
    error: str | None = None
```

---

## 內部 API 端點（保留給 Chat Agent / Tools）

這些端點不使用 camelCase，保留原有格式：

- `GET /api/v1/entities/*` — 實體查詢
- `GET /api/v1/relations/*` — 關係查詢
- `GET /api/v1/documents/*` — 文件查詢
- `GET /api/v1/search/*` — 語義搜尋
- `POST /api/v1/ingest/*` — 文件上傳（舊 API，保留向後相容）
- `POST /api/v1/analysis/*` — 深度分析（舊 API）
- `WS /ws/chat` — Chat WebSocket

---

## 啟動方式

```bash
# 開發（hot reload）
PYTHONPATH=src uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

# 或用 uv
uv run uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 測試

```
tests/api/
├── conftest.py          # TestClient + mock services fixture
├── test_entities.py     # 同步查詢端點
├── test_relations.py    # 關係查詢
├── test_documents.py    # 文件查詢
├── test_search.py       # 語義搜尋
├── test_ingest.py       # 上傳 + 輪詢
├── test_analysis.py     # 分析任務
└── test_chat_ws.py      # WebSocket
```

**測試原則**：
- 所有 Services 用 Mock 替換（不依賴真實 DB / LLM）
- 測試路由邏輯、HTTP 狀態碼、response schema 正確性

---

**維護者**: William
**版本**: v2.0
**對應 CORE.md Phase**: Phase 8
