# Ingest 容錯與補跑機制

**日期**：2026-05-08  
**狀態**：待實作  
**開發環境**：輕量化模式（Lightweight）。Heavy mode（KG/Qdrant）的行為不列入本次驗收範圍。

---

## 核心設計原則

DocumentProcessing 是唯一的硬性關卡，成功後書立刻寫入書庫。後續四個步驟（Summarization、FeatureExtraction、KG、SymbolDiscovery）全部跑完再統一報告，失敗的標記為「功能不可用」，可單獨補跑。

Cancel 在整個 ingest 期間均有效：
- 書進庫**前** cancel → 書不存在，等同上傳失敗
- 書進庫**後** cancel → 書留在庫裡，剩餘 enrichment 步驟中斷，`pipeline_status` 全標 `failed`，可逐步補跑

---

## 後端

### 1. `pipeline_status` 欄位

`Document` domain model 新增欄位：

```python
pipeline_status: PipelineStatus = Field(default_factory=PipelineStatus)
```

`PipelineStatus` 型別（`domain/documents.py`）：

```python
class StepStatus(str, Enum):
    pending = "pending"
    done = "done"
    failed = "failed"

class PipelineStatus(BaseModel):
    summarization: StepStatus = StepStatus.pending
    feature_extraction: StepStatus = StepStatus.pending
    knowledge_graph: StepStatus = StepStatus.pending
    symbol_discovery: StepStatus = StepStatus.pending
```

### 2. DB Migration

`DocumentService.init_db()` 新增 migration 語句（`services/document_service.py`）：

```python
"ALTER TABLE documents ADD COLUMN pipeline_status_json TEXT"
```

`_DocumentRow` 新增欄位：

```python
pipeline_status_json = Column(Text, nullable=True)
```

`save_document()` 與 `get_document()` 同步讀寫此欄位。

另新增 `update_pipeline_status(document_id, pipeline_status)` 方法，供各步驟完成後單獨更新，不需要重寫整個 document。

### 3. DocumentProcessing 成功 → 立刻寫入

`workflows/ingestion.py` 調整執行順序：

```
Step 1: DocumentProcessing
Step 1b: save_document()  ← 提前至此，pipeline_status 全部 pending
Step 2: Summarization     → 完成/失敗後更新 pipeline_status.summarization
Step 3: FeatureExtraction → 完成/失敗後更新 pipeline_status.feature_extraction
Step 4: KG Extraction     → 完成/失敗後更新 pipeline_status.knowledge_graph
Step 4b: SymbolDiscovery  → 完成/失敗後更新 pipeline_status.symbol_discovery
Step 5: KG save（不再依賴 errors 為空，改為依賴 pipeline_status.knowledge_graph == done）
```

DocumentProcessing 失敗維持現有行為：task status 變 `error`，不寫入書庫。

### 4. 各步驟完成/失敗時更新 pipeline_status

每個步驟的 `try/except` 結束後呼叫 `update_pipeline_status()`，不等全部完成。

### 5. 補跑 API

```
POST /books/:bookId/rerun/summarization
POST /books/:bookId/rerun/feature-extraction
POST /books/:bookId/rerun/knowledge-graph
POST /books/:bookId/rerun/symbol-discovery
```

- 每個 endpoint 從 DB 載入 `Document`（使用現有 `DocumentService.get_document()`，已支援完整重建含 chapters + paragraphs + embeddings）
- 建立獨立 background task，回傳 `{ taskId: string }`
- 步驟完成後更新 `pipeline_status` 對應欄位

### 6. Cancel 機制

**架構調整**：  
將 `_run_ingestion` 從 FastAPI `BackgroundTasks.add_task()` 改為 `asyncio.create_task()`，在 process 記憶體中維護一個 `task_id → asyncio.Task` registry。

```python
# api/task_registry.py（新增）
_registry: dict[str, asyncio.Task] = {}

def register(task_id: str, task: asyncio.Task) -> None: ...
def cancel(task_id: str) -> bool: ...   # 回傳 False 表示 task 不存在或已結束
def unregister(task_id: str) -> None: ...
```

Cancel endpoint（新增至 `api/routers/tasks.py`）：

```
POST /tasks/:taskId/cancel
```

行為：
1. 查 registry，找到則呼叫 `asyncio.Task.cancel()`
2. `CancelledError` 沿 `await` 鏈自然傳播，workflow 中斷
3. 書進庫後 cancel：剩餘 enrichment 步驟的 `pipeline_status` 更新為 `failed`，書留在庫裡
4. 書進庫前 cancel：task status 標 `error`，書不存在

Registry 為 in-process，僅在單 worker 模式（目前輕量化開發環境）下有效。

---

## 前端

### 7. ProcessingCard 狀態調整

- DocumentProcessing 失敗：顯示錯誤 + 「重新上傳」按鈕（現有行為不變）
- 書進庫後有步驟失敗：ProcessingCard 顯示「部分完成」狀態，列出哪些步驟失敗，卡片有「前往書庫查看」入口

### 8. 書庫卡片功能狀態標示

`GET /books` 回傳的 `Book` interface 新增 `pipelineStatus`：

```ts
interface Book {
  // ... 現有欄位 ...
  pipelineStatus: {
    summarization: 'pending' | 'done' | 'failed';
    featureExtraction: 'pending' | 'done' | 'failed';
    knowledgeGraph: 'pending' | 'done' | 'failed';
    symbolDiscovery: 'pending' | 'done' | 'failed';
  };
}
```

`GET /books/:bookId` 同樣包含此欄位。

書卡上若有步驟 `failed`，以小標記提示「不可用」，點擊可觸發補跑。

### 9. 書籍詳情頁補跑 UI

每個 `failed` 步驟顯示獨立「重新執行」按鈕，觸發後：
1. 呼叫對應 rerun endpoint 取得 `taskId`
2. Inline 進度狀態（polling `GET /tasks/:taskId/status`）
3. 完成後自動刷新對應功能區塊

---

## 涉及的檔案

| 檔案 | 變動 |
|------|------|
| `src/domain/documents.py` | 新增 `StepStatus`、`PipelineStatus`、`Document.pipeline_status` |
| `src/services/document_service.py` | DB migration、`save_document` / `get_document` 讀寫 `pipeline_status_json`、新增 `update_pipeline_status()` |
| `src/workflows/ingestion.py` | 提前 `save_document()`，各步驟後更新 status，KG save 條件調整 |
| `src/api/task_registry.py` | 新增（in-process asyncio.Task registry） |
| `src/api/routers/books.py` | 改用 `asyncio.create_task()`，新增 rerun endpoints |
| `src/api/routers/tasks.py` | 新增 `POST /tasks/:taskId/cancel` |
| `src/api/schemas/books.py` | `BookResponse` 新增 `pipelineStatus` |
| `frontend/src/api/generated.ts` | 執行 `npm run gen:types` 更新 |
| `frontend/src/components/ProcessingCard` | 部分完成狀態 |
| `frontend/src/components/BookCard` | 功能不可用標記 |
| `frontend/src/pages/BookDetail` | 補跑 UI |
| `docs/API_CONTRACT.md` | 更新 `Book` interface、新增 rerun + cancel endpoints |

---

## Definition of Done

- `ruff check src/` 無新增錯誤
- `cd frontend && npm run lint` 無新增錯誤
- `docs/API_CONTRACT.md` 同步更新（rerun endpoints、cancel endpoint、`Book.pipelineStatus`）
- Commit message 標註 `[api-contract updated]`
