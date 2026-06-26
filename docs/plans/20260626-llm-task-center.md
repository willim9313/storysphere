# LLM 任務中心（Task Center）設計 spec

**日期：** 2026-06-26
**狀態：** 設計確認中
**範圍：** 後端新增任務列表能力 + 前端集中式任務狀態面板

---

## 1. 目標與動機

目前 LLM 處理任務（ingestion、tension、symbol、narrative、character/event 分析等）分散在各功能頁，各自用 `useTaskPolling` 追蹤單一任務，**使用者無法在一個地方總覽所有正在跑 / 最近完成的 LLM 任務**。

本功能提供一個常駐的「任務中心」：使用者點開 Sidebar 的入口，即可看到**全系統**所有 LLM 任務的即時狀態，並能跳到對應頁面查看結果。

**非目標（明確排除）：**
- 不在面板內提供「取消任務」（後端 cancel 端點已存在，但本次不接）
- 不顯示底層錯誤堆疊（只給概略 fail 狀態，細節留給未來獨立的 logger 頁）
- 不引入 WebSocket 即時推送（本次用輪詢；要即時化是後續迭代）

---

## 2. 範圍決策（已與使用者確認）

| 決策點 | 選擇 |
|--------|------|
| 任務範圍 | **全系統所有任務**（需後端列表端點，跨分頁、重整後仍在） |
| 互動 | 點擊跳轉對應頁、清除已完成記錄、概略 fail 狀態 |
| 取消任務 | **不做**（inline cancel 排除） |
| 錯誤細節 | 只給概略「失敗」狀態，**不展開底層錯誤** |
| 即時機制 | **輪詢**（面板開著時 2 秒一次），非 WebSocket |
| 後端 metadata | 漸進式：`create()` 新增選填參數，**現有 ~20 個 call site 不強制修改** |

---

## 3. 後端設計

### 3.1 `TaskStatus` schema 變更

`src/api/schemas/common.py` 的 `TaskStatus` 新增 3 個**選填**欄位：

| 欄位 | 型別 | 用途 |
|------|------|------|
| `kind` | `str \| None = None` | 任務種類（如 `"tension"`、`"symbol"`、`"ingestion"`）。前端據此決定跳轉路由 |
| `title` | `str \| None = None` | 顯示標題；未提供時前端 fallback 用 `stage` |
| `created_at` | `str \| None = None` | 排序「最近完成」用 |

- 刻意用**自由字串** `kind`（非嚴格 `Literal`）：讓 call site 可分批補；未補 `kind` 的任務在前端「能看不能跳」，不會壞。
- `created_at`：SQLite backend 資料表已有此欄，僅需納入 schema 與 `_async_get`/`list` 的 SELECT；Memory backend 需在 `create()` 時記錄時間戳。
- camelCase alias 由既有 `alias_generator=to_camel` 自動處理（`createdAt`）。

### 3.2 `task_store.create()` 簽章變更

```python
def create(self, task_id: str, *, kind: str | None = None, title: str | None = None) -> TaskStatus:
```

- Memory + SQLite 兩個 backend 各改一份。
- 參數**選填且 keyword-only**，現有 ~20 個 `task_store.create(task_id)` call site **不需修改**。
- SQLite 需新增 `kind`、`title` 欄位（`ALTER TABLE` 容錯遷移，沿用現有 `_ADD_*` 模式）。
- Memory backend `create()` 寫入 `created_at`（用 `datetime.now().isoformat()`）。

### 3.3 `task_store.list()` 新方法

兩個 backend 各實作：

```python
def list(self, *, recent_limit: int = 20) -> list[TaskStatus]:
```

- 回傳：**所有非終態任務**（`pending` / `running` / `awaiting_review`）+ **最近 `recent_limit` 筆終態任務**（`done` / `error`），依 `created_at` 新到舊排序。
- **不含 `murmur_events`**（面板不需逐句 murmur，減少 payload）。
- SQLite：用 `ORDER BY created_at DESC` + 條件查詢；Memory：在記憶體中排序切片。

### 3.4 新增端點 `GET /tasks`

`src/api/routers/tasks.py`：

```python
@router.get("", response_model=list[TaskStatus])
async def list_tasks() -> list[TaskStatus]:
    ...
```

- 回傳 `list[TaskStatus]`（不含 murmur_events）。
- 需同步更新 `docs/API_CONTRACT.md`，commit message 標 `[api-contract updated]`。

---

## 4. 前端設計

### 4.1 入口（Sidebar）

`frontend/src/components/layout/Sidebar.tsx` 新增常駐「任務」項目：
- 帶 badge 顯示**進行中任務數**（非終態任務計數）。
- 點擊切換面板開 / 關。

### 4.2 面板元件 `TaskCenter`（新檔）

每筆任務一列，呈現以下資訊欄位：
- **狀態圓點**：進行中（動態色）/ done（綠）/ error（紅）
- **標題**：`title` 或 fallback `stage`
- **進度**：`progress%`；進行中額外顯示 `stage` 文字
- **error**：顯示概略「失敗」，**不展開底層錯誤**

**空狀態 / 載入狀態**：面板需處理「無任務」與「首次載入」。

> **視覺呈現（版面 / 配色 / 字體 / 質感）刻意留白，於實作前端階段交給 `frontend-design` skill 處理。** 本 spec 只鎖定「要呈現哪些資訊欄位」與下列行為契約。

### 4.3 資料流：`useTasksPolling()` hook（新檔）

- react-query 輪詢 `GET /tasks`。
- **面板開著時**每 2 秒輪詢；**關閉時停止**（`refetchInterval` 依面板開關狀態切換）。
- 沿用現有 polling 模式（參考 `useTaskPolling.ts`），**不引入新依賴**。

### 4.4 互動行為契約

| 行為 | 規格 |
|------|------|
| **跳轉** | 一張 `kind → route` 對照表（純函數）。已知 `kind` → 跳對應頁；未知 `kind` → 該列不可點。需 id 的路由從 `result` 取（如 `result.bookId`）。 |
| **清除已完成** | localStorage 存「已隱藏 task_id」集合，面板過濾掉。**純前端隱藏，不動後端記錄。** |
| **badge 計數** | 顯示非終態任務數。 |

### 4.5 型別

- schema 改完後在 `frontend/` 跑 `npm run gen:types` 重新生成 `generated.ts`。
- type 一律從 `generated.ts` 的 `components["schemas"]["TaskStatus"]` 取用。

### 4.6 樣式

- 全用主題 CSS variable（`var(--*)`），禁止硬編色碼。
- 若新增 token，同步更新 `docs/DESIGN_TOKENS.md`。

---

## 5. 錯誤處理

- 後端 `GET /tasks` 失敗 → 前端面板顯示載入失敗提示，不影響其他頁面。
- error 狀態任務 → 紅點 + 概略「失敗」文字，不抓底層 error。
- 未知 `kind` → 該列降級為「不可點」，不報錯。

---

## 6. 測試

| 層 | 測什麼 |
|----|--------|
| store 整合（memory + sqlite） | `list()` 回傳非終態 + 最近終態、排序正確、`recent_limit` 生效、不含 murmur_events |
| store | `create(kind=, title=)` 寫入後可由 `list()` / `get()` 取回；舊式 `create(task_id)` 仍可用 |
| API 端點 | `GET /tasks` happy path、空清單、關鍵欄位（kind/title/createdAt）出現在回傳 |
| 前端純函數 | `kind → route` 對照表：已知 kind 給對路由、未知 kind 回 null |

---

## 7. 異動檔案清單（實作時據此拆子任務）

> 本功能跨檔超過 3 個，依 CLAUDE.md 須拆子任務逐步確認。建議拆分：

**子任務 A — 後端 store + schema**
- 修改 `src/api/schemas/common.py`（TaskStatus 三欄位 + create 簽章影響）
- 修改 `src/api/store.py`（兩 backend 的 `create` 參數、`list()`、created_at、SQLite 欄位遷移）
- 新增 store 測試

**子任務 B — 後端端點 + 契約**
- 修改 `src/api/routers/tasks.py`（`GET /tasks`）
- 更新 `docs/API_CONTRACT.md`（`[api-contract updated]`）
- 新增端點測試

**子任務 C — 前端面板（含 frontend-design）**
- 跑 `npm run gen:types`
- 新增 `frontend/src/api/tasks.ts`（`fetchTasks`）
- 新增 `useTasksPolling` hook
- 新增 `TaskCenter` 元件（視覺交 `frontend-design`）
- 新增 `kind → route` 對照表（純函數 + 測試）
- 修改 `frontend/src/components/layout/Sidebar.tsx`（入口 + badge）

**新依賴：** 無。

**回滾方式：** 各子任務獨立 commit；後端欄位為選填、call site 未動，回退 schema/store/router 即還原；前端為新增檔案 + Sidebar 一處改動，移除即還原。

---

## 8. 後續迭代（本次不做，僅記錄）

- 分批為各 router 的 `create()` 補 `kind` / `title`，讓更多任務可跳轉、有漂亮標題
- WebSocket 即時推送取代輪詢（後端 WS 基礎設施已存在）
- 獨立 logger 頁顯示任務完整錯誤 / murmur 細節
