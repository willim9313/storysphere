# LLM 任務中心（Task Center）設計 spec — FINAL

**日期：** 2026-06-26
**狀態：** ✅ 設計已定案（前端視覺/互動已鎖定，可進入實作）
**範圍：** 後端新增任務列表能力 + 前端集中式任務狀態面板（右側滑出抽屜）

---

## 0. 給實作者的話（先讀這段）

- **本 spec 即為最終範圍。** 「§9 後續迭代」是**明確不做**的紀錄，列在這裡只為留痕——**不要實作 §9 任何項目**。
- 前端視覺/互動先前留白給 `frontend-design`，**現已定案為下方 §4 的內容**，請照 §4 的行為與視覺契約實作，不要自行發明面板樣式或新增動作。
- 任何「取消任務 / 重試 / 展開錯誤堆疊 / WebSocket」都**不在範圍內**（見 §1 非目標、§4.4）。面板對後端的唯一動作是**輪詢讀取**，不寫入、不觸發。
- 跨檔超過 3 個，依 CLAUDE.md 須拆子任務逐步確認（拆法見 §8）。

---

## 1. 目標與動機

目前 LLM 處理任務（ingestion、tension、symbol、narrative、character/event 分析等）分散在各功能頁，各自用 `useTaskPolling` 追蹤單一任務，**使用者無法在一個地方總覽所有正在跑 / 最近完成的 LLM 任務**。

本功能提供一個常駐的「任務中心」：使用者點開 Sidebar 的入口，即可看到**全系統**所有 LLM 任務的即時狀態，並能**點擊該列跳到對應頁面**查看 / 處理結果。

**非目標（明確排除，不要實作）：**
- ❌ 不在面板內提供「取消任務」（後端 cancel 端點已存在，本次不接）。
- ❌ 不在面板內提供「重試 / 重新生成」。**失敗的任務也只能透過點擊該列進到對應功能頁去處理**，面板本身不觸發任何重生成動作。
- ❌ 不顯示底層錯誤堆疊（只給概略 fail 狀態，細節留給未來獨立的 logger 頁）。
- ❌ 不引入 WebSocket 即時推送（本次用輪詢）。

---

## 2. 範圍決策（已與使用者確認）

| 決策點 | 選擇 |
|--------|------|
| 任務範圍 | **全系統所有任務**（需後端列表端點，跨分頁、重整後仍在） |
| 面板放置 | **右側滑出抽屜**（與 `EntityDetailPanel` 同構，320px，常駐感最強、複用既有 panel 容器） |
| 互動 | 點擊該列跳轉對應頁、清除已完成記錄（純前端）、概略 fail 狀態 |
| 取消任務 | **不做** |
| 重試任務 | **不在面板做**——只能點列進對應頁處理 |
| 錯誤細節 | 只給概略「失敗」狀態，**不展開底層錯誤** |
| 即時機制 | **輪詢**（面板開著時 2 秒一次），非 WebSocket |
| 後端 metadata | 漸進式：`create()` 新增選填參數，**現有 ~20 個 call site 不強制修改** |

---

## 3. 後端設計

### 3.1 `TaskStatus` schema 變更

`backend/storysphere/api/schemas/common.py` 的 `TaskStatus` 新增 3 個**選填**欄位：

| 欄位 | 型別 | 用途 |
|------|------|------|
| `kind` | `str \| None = None` | 任務種類（如 `"tension"`、`"symbol"`、`"ingestion"`）。前端據此決定跳轉路由與圖示/識別色 |
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

`backend/storysphere/api/routers/tasks.py`：

```python
@router.get("", response_model=list[TaskStatus])
async def list_tasks() -> list[TaskStatus]:
    ...
```

- 回傳 `list[TaskStatus]`（不含 murmur_events）。
- 需同步更新 `docs/API_CONTRACT.md`，commit message 標 `[api-contract updated]`。

---

## 4. 前端設計（✅ 已定案，照此實作）

整體放置 = **Variant A：右側滑出抽屜**。Sidebar 入口切換開/關；開啟時抽屜貼齊右側，與 `EntityDetailPanel` 同一套容器規格（`border-left: 1px solid var(--border)`，固定寬 **320px**，垂直捲動）。

### 4.1 入口（Sidebar）

`frontend/src/components/layout/Sidebar.tsx` 在現有 icon 列中**新增常駐「任務」項目**（建議圖示 `Loader`，置於 `Search` 與 `BarChart3` 之間）：
- 帶 **badge 顯示進行中任務數**（非終態任務計數；為 0 時不顯示 badge）。
- 點擊**切換抽屜開 / 關**；抽屜開啟時該 icon 進入 active 樣式（`var(--bg-tertiary)` 底 + `var(--accent)` 色），與既有 active 規則一致。

### 4.2 面板元件 `TaskCenter`（新檔，右側抽屜）

容器：`width: 320px`、`border-left: 1px solid var(--border)`、`box-shadow: var(--shadow-md)`、`display:flex; flex-direction:column; height:100%`、`background: var(--bg-primary)`。

**結構由上而下：**

1. **Header**（`border-bottom: 1px solid var(--border)`）：`Loader` 圖示（`var(--accent)`）＋標題「任務中心」（serif）＋進行中數量 badge ＋右側 `X` 關閉。
2. **進行中區**：小節標題「進行中 · N」（`var(--fg-muted)`，sans，uppercase letterspacing），下接任務列。
3. **已完成區（可折疊，預設展開）**：可點的小節標題列「`▸ / ▾` 已完成 · N」＋右側「清除」文字按鈕。展開時列出最近終態任務（`done` / `error`）。
4. **空狀態**：無任何任務時顯示置中提示（`CheckCheck` 圖示 + 「目前沒有進行中的任務」+ 一句說明）。
5. **載入狀態**：首次載入顯示置中 `Loader`（`animate-spin`）+「載入任務中…」。

#### 每一列任務（`TaskRow`）— 舒適雙行

- **左側 kind 圖示方塊**：28×28、`var(--radius-md)`，底色 = 該 kind 的**識別色**（見 §4.6 對照表），內置 Lucide 線圖示。
- **第一行**：`title`（或 fallback `stage`，sans 13px）＋ **kind 標籤**（小 tag，帶該 kind 識別色）。
- **第二行（依狀態）**：
  - **進行中（`running` / `awaiting_review`）**：線性進度條（`progress%`，色用該 kind 色）＋百分比（mono）＋下方 `stage` 文字（`var(--fg-muted)`，單行截斷）。
  - **已完成（`done`）**：概略完成文字（`var(--fg-muted)`）。
  - **失敗（`error`）**：`AlertTriangle` ＋ 概略「**失敗**」（`var(--color-error)`）。**不顯示底層 error、不提供重試。**
- **右側狀態圓點**：`running` = 該 kind 色（緩慢呼吸動畫）／`awaiting_review` = `var(--color-warning)`／`done` = `var(--color-success)`／`error` = `var(--color-error)`。
- **Hover 導引箭頭**：列為**可跳轉**時，hover 該列在圓點旁淡入一個 `ChevronRight`（`›`），示意「點此列前往對應頁」；非 hover 時只留圓點，版面不位移。**不可跳轉的列（未知 kind）不顯示箭頭、游標維持 default。**

### 4.3 資料流：`useTasksPolling()` hook（新檔）

- react-query 輪詢 `GET /tasks`。
- **面板開著時**每 2 秒輪詢；**關閉時停止**（`refetchInterval` 依面板開關狀態切換）。
- 沿用現有 polling 模式（參考 `useTaskPolling.ts`），**不引入新依賴**。

### 4.4 互動行為契約

| 行為 | 規格 |
|------|------|
| **整列點擊 = 跳轉** | 一張 `kind → route` 對照表（純函數）。已知 `kind` → 跳對應頁；未知 `kind` → 該列不可點（無箭頭、default 游標）。需 id 的路由從 `result` 取（如 `result.bookId`）。 |
| **失敗任務** | **僅能整列點擊進對應頁處理**，面板內不提供重試 / 重新生成 / 取消等任何動作。 |
| **清除已完成** | localStorage 存「已隱藏 task_id」集合，面板過濾掉。**純前端隱藏，不動後端記錄。** |
| **badge 計數** | 顯示非終態任務數（為 0 時隱藏 badge）。 |

### 4.5 型別

- schema 改完後在 `frontend/` 跑 `npm run gen:types` 重新生成 `generated.ts`。
- type 一律從 `generated.ts` 的 `components["schemas"]["TaskStatus"]` 取用。

### 4.6 樣式 / kind 對照

- 全用主題 CSS variable（`var(--*)`），**禁止硬編色碼**。
- kind 識別色沿用既有 **entity 六色**，不發明新色。**B&W 三主題（manuscript / minimal-ink / pulp）下，kind 色自動退為灰階**：圖示方塊改為透明底 + `var(--border)` 外框、`var(--fg-secondary)` 圖示，由文字 kind 標籤承載身分（符合設計系統「entity 色在 B&W 退為灰階」原則）。主題切換只靠 `<html data-theme>`，元件零改動。

**kind → 圖示 / 識別色 / 路由建議對照**（路由實際路徑以 app router 為準）：

| kind | Lucide 圖示 | 識別色 token | 跳轉目標（建議） |
|------|-----------|-------------|----------------|
| `ingestion` | `file-text` | `--entity-org-*`（amber） | 書本頁 / 閱讀 `…/:bookId` |
| `character` | `users` | `--entity-char-*`（blue） | 角色頁 `…/:bookId/characters` |
| `tension` | `activity` | `--entity-con-*`（violet） | 張力頁 `…/:bookId/tension` |
| `symbol` | `sparkles` | `--entity-obj-*`（magenta） | 符號意象頁 `…/:bookId/symbol` |
| `narrative` | `git-branch` | `--entity-loc-*`（green） | 敘事模式視圖 `…/:bookId/…` |
| `event` | `calendar-clock` | `--entity-evt-*`（red） | 事件頁 `…/:bookId/events` |

> 若新增 token，同步更新 `docs/DESIGN_TOKENS.md`。

---

## 5. 錯誤處理

- 後端 `GET /tasks` 失敗 → 前端面板顯示載入失敗提示，不影響其他頁面。
- `error` 狀態任務 → 紅點 + 概略「失敗」文字，**不抓底層 error、不提供重試**；使用者點該列前往對應頁處理。
- 未知 `kind` → 該列降級為「不可點」（無箭頭、default 游標），不報錯。

---

## 6. 測試

| 層 | 測什麼 |
|----|--------|
| store 整合（memory + sqlite） | `list()` 回傳非終態 + 最近終態、排序正確、`recent_limit` 生效、不含 murmur_events |
| store | `create(kind=, title=)` 寫入後可由 `list()` / `get()` 取回；舊式 `create(task_id)` 仍可用 |
| API 端點 | `GET /tasks` happy path、空清單、關鍵欄位（kind/title/createdAt）出現在回傳 |
| 前端純函數 | `kind → route` 對照表：已知 kind 給對路由、未知 kind 回 null（→ 該列不可點） |

---

## 7. 設計參考

定案的視覺/互動探索畫布見 Claude Design 專案內 `Task Center.dc.html`（含 A 抽屜定案版、空/載入狀態、三個 B&W 主題變體與 hover 導引箭頭）。實作以本 §4 文字契約為準，畫布僅供對照外觀。

---

## 8. 異動檔案清單（實作時據此拆子任務）

**子任務 A — 後端 store + schema**
- 修改 `backend/storysphere/api/schemas/common.py`（TaskStatus 三欄位 + create 簽章影響）
- 修改 `backend/storysphere/api/store.py`（兩 backend 的 `create` 參數、`list()`、created_at、SQLite 欄位遷移）
- 新增 store 測試

**子任務 B — 後端端點 + 契約**
- 修改 `backend/storysphere/api/routers/tasks.py`（`GET /tasks`）
- 更新 `docs/API_CONTRACT.md`（`[api-contract updated]`）
- 新增端點測試

**子任務 C — 前端面板**
- 跑 `npm run gen:types`
- 新增 `frontend/src/api/tasks.ts`（`fetchTasks`）
- 新增 `useTasksPolling` hook
- 新增 `TaskCenter`（右側抽屜）+ `TaskRow` 元件（照 §4 視覺/互動契約；含 hover 箭頭、整列點擊跳轉、無重試動作）
- 新增 `kind → route` 對照表（純函數 + 測試）
- 修改 `frontend/src/components/layout/Sidebar.tsx`（入口 + badge）

**新依賴：** 無。

**回滾方式：** 各子任務獨立 commit；後端欄位為選填、call site 未動，回退 schema/store/router 即還原；前端為新增檔案 + Sidebar 一處改動，移除即還原。

---

## 9. 後續迭代（❌ 本次不做，僅記錄，不要實作）

- 分批為各 router 的 `create()` 補 `kind` / `title`，讓更多任務可跳轉、有漂亮標題。
- WebSocket 即時推送取代輪詢（後端 WS 基礎設施已存在）。
- 獨立 logger 頁顯示任務完整錯誤 / murmur 細節（失敗任務的深度處理改在那裡，而非面板）。
