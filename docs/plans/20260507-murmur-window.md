# 書籍上傳喃喃自語視窗（Murmur Window）

## 背景與目標

書籍上傳處理期間，使用者只能看到進度百分比與步驟名稱，無法感知後端正在做什麼。本功能在 ProcessingCard 右側加入「喃喃自語視窗」，即時顯示各 pipeline 偵測到的實體、主題、符號等事件，讓等待過程更有臨場感。

---

## 架構決策

評估過切換至現有 WebSocket 通道（`tasks_ws.py`），但為保持與既有 polling 機制一致、降低前後端耦合，維持 **HTTP polling + delta** 方案，並透過以下設計避免 polling 的已知陷阱。

---

## 開發前 Checkpoint

### 1. API Endpoint 變動
| Endpoint | 變動說明 |
|---|---|
| `GET /tasks/{task_id}/status` | 新增 query param `?after=N`；response 新增 `murmurEvents` delta 陣列 |
| `docs/API_CONTRACT.md` | 實作後必須同步更新，commit message 標 `[api-contract updated]` |

### 2. 涉及 UI 元件
| 元件 | 狀態 | 說明 |
|---|---|---|
| `MurmurWindow` | 新增 | 右側喃喃自語容器 |
| `CharacterSlot` | 新增 | 右下角角色佔位槽 |
| `ProcessingCard` | 修改（拆出） | 從 `UploadPage.tsx` 拆為獨立檔案，改左右分欄佈局 |
| `useTaskPolling` | 修改 | 新增 cursor ref + murmurEvents 回傳 |

### 3. 修改的檔案
**後端**
- `src/api/schemas/common.py` — 新增 `MurmurEvent` model、`TaskStatus.murmur_events`
- `src/api/store.py` — 兩個 backend 新增 `task_murmur_events` 儲存與 delta query；新增 async `append_murmur`；`set_completed` 前 drain
- `src/api/routers/tasks.py` — `?after=N` query param
- `src/workflows/ingestion.py` — 新增 `murmur_cb` 參數，串接各 pipeline
- `src/api/routers/books.py` — `_run_ingestion` 傳入 `murmur_cb`（至少 2 處）
- `src/pipelines/document_processing/pipeline.py` — emit pdfParsing 事件
- `src/pipelines/summarization/pipeline.py` — emit summarization 事件
- `src/pipelines/knowledge_graph/pipeline.py` — emit featureExtraction entity 事件
- `src/pipelines/symbol_discovery/pipeline.py` — emit symbolExploration 事件

**前端**
- `frontend/src/api/types.ts` — 手寫 `MurmurEvent` type（gen:types 後替換）
- `frontend/src/store/murmurStore.ts` — 新增 module-level store
- `frontend/src/hooks/useTaskPolling.ts` — cursor useRef + murmurEvents
- `frontend/src/components/upload/ProcessingCard.tsx` — 從 UploadPage 拆出，左右分欄
- `frontend/src/components/upload/MurmurWindow.tsx` — 新元件
- `frontend/src/components/upload/CharacterSlot.tsx` — 新元件
- `frontend/src/pages/UploadPage.tsx` — 使用拆出的 ProcessingCard

---

## 實作計劃

### Phase A — 後端資料結構

#### A1：`MurmurEvent` model 與 `TaskStatus` 擴充

```python
# src/api/schemas/common.py

class MurmurEvent(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    seq: int                              # server 端配發，client 排序 / 去重用
    step_key: str                         # pdfParsing | summarization | featureExtraction | knowledgeGraph | symbolExploration
    type: Literal["character", "location", "org", "event", "topic", "symbol", "raw"]
    content: str                          # 截斷上限 1 KB
    meta: dict[str, Any] | None = None   # e.g. {"chapter": 1, "role": "天體物理學家"}
    raw_content: str | None = None        # type == "raw" 時使用，截斷上限 4 KB

class TaskStatus(BaseModel):
    ...
    murmur_events: list[MurmurEvent] = []  # delta slice（index >= after 的事件）
```

`type` 使用 `Literal` 確保 `generated.ts` 產出 union type，防止前後端拼錯。

#### A2：store — 獨立 `task_murmur_events` table

**不使用 JSON column**，改用獨立 table，解決 O(N²) append、race condition、`set_completed` 沖掉欄位等問題：

```sql
CREATE TABLE IF NOT EXISTS task_murmur_events (
    task_id  TEXT    NOT NULL,
    seq      INTEGER NOT NULL,
    step_key TEXT    NOT NULL,
    type     TEXT    NOT NULL,
    content  TEXT    NOT NULL,
    meta     TEXT,           -- JSON or NULL
    raw_content TEXT,
    PRIMARY KEY (task_id, seq)
);
```

cleanup 時與 `tasks` table 在同一個 transaction 級聯刪除：
```sql
DELETE FROM task_murmur_events WHERE task_id IN (SELECT task_id FROM tasks WHERE status IN ('done','error') AND created_at < ?);
DELETE FROM tasks WHERE ...;
```

兩個 backend 新增方法：

```python
# async — 在 background task (async context) 直接 await，不使用 _run/ensure_future
async def append_murmur(self, task_id: str, event: MurmurEvent) -> None: ...
async def get_murmur_events(self, task_id: str, after: int = 0) -> list[MurmurEvent]: ...
```

> `MemoryTaskStore` 維護 `dict[task_id, list[MurmurEvent]]`，使用現有 `threading.Lock`。
> `SQLiteTaskStore` 用 `INSERT INTO task_murmur_events`，seq 由 `SELECT COALESCE(MAX(seq)+1, 0)` 在同一個 transaction 配發。

#### A3：`set_completed` 前 drain 確保最後事件不遺失

`IngestionWorkflow.run()` 在最後一步（`_progress(100, ...)`）之前，確保所有 `murmur_cb` 呼叫已 await 完成，再呼叫 `task_store.set_completed`。讓前端最後一次 poll 必定能拿到完整事件。

#### A4：tasks router 新增 `?after=N`

```python
@router.get("/{task_id}/status", response_model=TaskStatus)
async def get_task_status(task_id: str, after: int = 0) -> TaskStatus:
    task = await get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, ...)
    events = await task_store.get_murmur_events(task_id, after=after)
    return task.model_copy(update={"murmur_events": events})
```

所有 murmur read 只走 async 路徑，不使用 sync `get()`。

---

### Phase B — 後端各 pipeline emit 事件

`IngestionWorkflow.run()` 新增參數：

```python
async def run(
    self,
    input_data: Path,
    *,
    title: str | None = None,
    author: str | None = None,
    language: str | None = None,
    progress_cb: Callable | None = None,
    murmur_cb: Callable[[MurmurEvent], Awaitable[None]] | None = None,
) -> IngestionResult:
```

`murmur_cb` 由 `books.py` 的 `_run_ingestion` 包裝成 `await task_store.append_murmur(task_id, event)`。

**各階段 emit 點：**

| Pipeline | 觸發時機 | type | content 範例 | meta 範例 |
|---|---|---|---|---|
| `document_processing` | parse 完成後 | `"topic"` | `"偵測到 312 頁，繁體中文"` | `{"pages": 312, "language": "zh-TW"}` |
| `summarization` | 每章摘要完成後 | `"topic"` | 主題關鍵詞（取前 3 個）| `{"chapter": N}` |
| `knowledge_graph` | 每個 entity 識別後 | `"character"/"location"/"org"/"event"` | `entity.name` | `{"chapter": N, "role": "..."}` |
| `symbol_discovery` | 重要符號建立後 | `"symbol"` | `symbol.name` | `{"chapter": N}` |

emit 邏輯包裹在 `try/except`，失敗時 `logger.warning` 計數，不影響主流程。
無法結構化時 `type="raw"`，原始字串塞進 `raw_content`，`content` 設為空字串。

**`IngestionWorkflow.run()` caller 清單（都要更新）：**
- `src/api/routers/books.py` 的 `_run_ingestion`（至少 2 處）
- 相關測試檔案（`tests/workflows/` 下）

---

### Phase C — 前端

#### C1：`MurmurEvent` type（`frontend/src/api/types.ts`）

```typescript
export type MurmurEventType =
  | 'character' | 'location' | 'org' | 'event'
  | 'topic' | 'symbol' | 'raw';

export interface MurmurEvent {
  seq: number;
  stepKey: string;
  type: MurmurEventType;
  content: string;
  meta?: Record<string, unknown>;
  rawContent?: string;
}
```

gen:types 後替換為 `components["schemas"]["MurmurEvent"]`。

#### C2：module-level murmur store（`frontend/src/store/murmurStore.ts`）

```typescript
// Module-level map，跨元件 unmount/remount 保留
const eventMap = new Map<string, MurmurEvent[]>();
const cursorMap = new Map<string, number>(); // taskId → next expected seq

export function getMurmurEvents(taskId: string): MurmurEvent[] {
  return eventMap.get(taskId) ?? [];
}

export function appendMurmurEvents(taskId: string, delta: MurmurEvent[]): void {
  if (!delta.length) return;
  const existing = eventMap.get(taskId) ?? [];
  // seq-based 去重，防 StrictMode double-fetch
  const seenSeqs = new Set(existing.map((e) => e.seq));
  const deduped = delta.filter((e) => !seenSeqs.has(e.seq));
  eventMap.set(taskId, [...existing, ...deduped]);
}

export function getMurmurCursor(taskId: string): number {
  return cursorMap.get(taskId) ?? 0;
}

export function advanceMurmurCursor(taskId: string, count: number): void {
  cursorMap.set(taskId, (cursorMap.get(taskId) ?? 0) + count);
}
```

使用 module-level map 而非 React state，解決頁面切換失憶與多元件 double-append 問題。

#### C3：`useTaskPolling` 改版

```typescript
export function useTaskPolling(
  taskId: string | null,
  fetcher?: (id: string, after: number) => Promise<TaskStatus>,
) {
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  const query = useQuery<TaskStatus>({
    queryKey: ['tasks', taskId],
    queryFn: async () => {
      const after = getMurmurCursor(taskId!);
      const result = await (fetcher ?? fetchTaskStatus)(taskId!, after);
      if (result.murmurEvents?.length) {
        appendMurmurEvents(taskId!, result.murmurEvents);
        advanceMurmurCursor(taskId!, result.murmurEvents.length);
        forceUpdate(); // 通知元件重新讀 store
      }
      return result;
    },
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'done' || status === 'error') return false;
      return 2000;
    },
  });

  return {
    ...query,
    murmurEvents: taskId ? getMurmurEvents(taskId) : [],
  };
}
```

- cursor 從 module store 讀取，無 StrictMode double-append 問題
- `fetcher` 簽名更新為 `(id, after) => Promise<TaskStatus>`，`TensionPage` 等自訂 fetcher 要一起更新
- 回傳 shape `{ ...query, murmurEvents }` 向後相容，不用動其他 caller

#### C4：`ProcessingCard`（拆出為 `frontend/src/components/upload/ProcessingCard.tsx`）

左右分欄佈局：

```
┌───────────────────────────────────────────────────────────┐
│ filename.pdf                            特徵提取中 · 43%  │
│                                                           │
│  ┌── ProcessingTimeline ──┐  ┌── MurmurWindow ─────────┐ │
│  │  ✓ PDF 解析            │  │  (可捲動，新訊息從底部   │ │
│  │  ✓ 語言偵測            │  │   slide-up 進入)         │ │
│  │  ✓ 摘要生成            │  │                          │ │
│  │  ⟳ 特徵提取 55/128    │  │         [CharacterSlot]  │ │
│  │  5 知識圖譜            │  └──────────────────────────┘ │
│  └────────────────────────┘                               │
└───────────────────────────────────────────────────────────┘
```

左側 `min-w-[160px]`，右側 `flex-1`。

#### C5：`MurmurWindow` component

- 接收 `events: MurmurEvent[]`，**無上限**
- 固定高度（`height: 260px`），`overflow-y: auto`
- **Auto scroll to bottom**：偵測 `scrollTop + clientHeight >= scrollHeight - 50px`，滿足才跟隨新訊息；使用者往上捲時不強制跳回
- 新訊息 slide-up + fade-in 動畫（`@keyframes`）；`@media (prefers-reduced-motion: reduce)` 降級為瞬間出現
- 訊息列格式：
  - 小圓點：顏色對應 entity token（`--entity-{type}-dot`）；`raw` 型用 `--fg-muted`
  - 步驟標籤：`var(--fg-muted)` 小字
  - meta + content：`var(--fg-primary)`
  - `type === "raw"`：`font-family: monospace`，容器加 `border-dashed`
- **大量事件效能**：超過 200 筆時考慮引入 `react-virtuoso`（暫時以 CSS `contain: strict` 降低 repaint 範圍）

#### C6：`CharacterSlot` component

- 純展示，接受 `src?: string`（img URL）或 `icon?: ReactNode`
- 預設顯示虛線框 + 人形 SVG placeholder（`--border` dashed）
- `bob` 動畫：`translateY` ±4px，2s ease-in-out infinite；`prefers-reduced-motion` 降級為靜止
- 素材由外部 props 控制，元件內不讀 theme

---

### Phase D — Definition of Done

- [ ] 執行 `ruff check src/` 無新增錯誤
- [ ] 執行 `cd frontend && npm run lint` 無新增錯誤
- [ ] 後端啟動後執行 `npm run gen:types`，確認 `MurmurEvent` schema 正確生成，替換 `types.ts` 手寫 type
- [ ] 更新 `docs/API_CONTRACT.md`，commit message 標 `[api-contract updated]`
- [ ] `IngestionWorkflow.run()` 所有 caller（含測試）已更新 `murmur_cb` 參數
- [ ] 實作範疇未超出上方 Checkpoint 所列的檔案與 endpoint
- [ ] 瀏覽器手動測試：長書處理時，喃喃自語視窗正常累積事件、auto scroll 行為符合預期、task done 後事件保留

---

## 已知限制與後續

- `MemoryTaskStore` 在多 worker 下 events 會分散（既有限制，murmur 放大可見性），生產環境請使用 SQLite backend
- CharacterSlot 本次傳入 `undefined`（顯示 placeholder），角色圖素材待後續功能接入
- 事件超過 200 筆的 virtual scrolling 可於效能測試後再引入
