# 分析三態 + 部分重跑（Partial Analysis / Three-State）設計 spec

**日期：** 2026-06-27
**狀態：** 設計確認中
**範圍：** 讓「gather 型」深度分析能區分 完整 / 部分 / 尚未分析 三態，並支援全重跑與「一鍵重試失敗部分」

---

## 1. 問題與動機

角色分析（`AnalysisService.analyze_character`）的 pipeline 是 `CEP(閘門) → asyncio.gather(archetype×N, arc, profile, return_exceptions=True)`。`return_exceptions=True` 代表平行子步驟任何一個失敗（例如 archetype 打到 Gemini 429 rate limit）都會被**靜默吞掉、塞空值**，pipeline 仍回傳一個「成功」的 result，被 `AnalysisAgent` **快取成 done**。

後果：
- 任務中心顯示綠色「已完成」，與真正完整成功**無法區分**。
- 角色頁原型區顯示「未生成」，與「該角色尚未分析」**語意混淆**。
- 結果已快取，重開是 cache HIT，**不會自動重試**，使用者也無從得知曾失敗。

`analyze_event` 是同構結構（`EEP(閘門) → gather(causality, impact)`），有相同問題。

**目標**：用一套可重用的約定，讓 gather 型分析能標記「哪些部分失敗」，前端據此分流三態，並提供全重跑 / 一鍵重試失敗部分。

---

## 2. 範圍決策（已與使用者確認）

| 決策點 | 選擇 |
|--------|------|
| 涵蓋分析類型 | **收斂為一套共用機制**，實作於 character + event 兩條 gather pipeline |
| symbol / narrative | **pipeline 零改動**：symbol 原子、narrative 各操作獨立，結構上不會 partial，只共用三態詞彙（none/complete/failed） |
| 快取 | **照存**（含 `failed_parts`），失敗部分不反覆重打，等使用者主動重試 |
| 重試顆粒度 | **一鍵重試所有失敗部分**；API 底層用 `retry_parts` 清單，未來可擴成單顆重試 |
| 狀態表示 | **衍生，不另存欄位**：complete=`failed_parts` 空、partial=非空、none=查無 cache |
| 任務狀態 | partial 任務的 `TaskStatus.status` 仍是 `done`；partial 是內容層衍生標記 |
| 未來性 | 機制需可重用，供日後新的小顆粒度 gather 型分析模組直接掛上 |

---

## 3. 共用機制（核心）

### 3.1 `gather_parts` helper

新增小工具（放 `backend/storysphere/core/`，例如 `gather_parts.py`）：

```python
async def gather_parts(parts: dict[str, Awaitable]) -> tuple[dict[str, Any], list[str]]:
    """對每個 part 跑 gather(return_exceptions=True)。
    回傳 (成功結果 by name, 失敗的 part 名稱清單)。"""
```

- 是「容忍子失敗 + 記下哪些失敗」的單一來源。
- `analyze_character` / `analyze_event` 改用它取代裸的 `asyncio.gather`。
- 未來任何 gather 型分析直接套用。

### 3.2 結果模型加 `failed_parts`

- `CharacterAnalysisResult` / `EventAnalysisResult` 各加 `failed_parts: list[str] = []`（用共用 mixin 或 base，未來模組沿用）。
- part 名稱由各分析自訂、就是 `gather_parts` 的 key：
  - character → `archetype:jung` / `archetype:schmidt` / `arc` / `profile`
  - event → `causality` / `impact`
- **狀態衍生**：`complete`＝`failed_parts` 空；`partial`＝非空；`none`＝查無 cache（不是欄位）。

### 3.3 閘門步驟不變

CEP / EEP 失敗仍是整個任務 `error`（不進 `failed_parts`，因為沒有閘門產物就沒有後續可言）。`failed_parts` 只涵蓋平行子步驟。

---

## 4. 快取 + 部分重跑

**快取照存**：cache 存完整 result，**含 `failed_parts`**。partial 結果一樣 cache HIT，使用者主動重試前不重打。

**`analyze_X` 加 `retry_parts: list[str] | None`**：

| 呼叫 | 行為 |
|------|------|
| `retry_parts=None`（預設） | cache-first，有就回 cache |
| `force_refresh=True` | **全重跑**：閘門 + 所有 part 重抽，覆蓋 cache |
| `retry_parts=[...]` | **部分重跑**：讀 cache result，**閘門與已成功 part 沿用 cache**，只重跑清單裡的 part，合併後重算 `failed_parts`、重寫 cache |

- 部分重跑**不重抽 CEP/EEP**（從 cache result 拿），只重打失敗的 LLM 子步驟。
- `AnalysisAgent.analyze_character/event` 加 `retry_parts` 透傳；`retry_parts` 有值時跳過「直接回 cache」、走部分重算。

**邊界**：
- `retry_parts` 但無 cache → 退回當一般完整分析。
- 部分重跑後該 part 又失敗 → 留在 `failed_parts`，狀態仍 partial（可再重試）。

---

## 5. API + 三態曝露

### 5.1 觸發端點加「模式」

character 與 event 的觸發端點加 body 參數：

| 模式 | 語意 | 對應 |
|------|------|------|
| `full`（預設 / force） | 全重跑 | `force_refresh=True` |
| `retryFailed` | 一鍵重試失敗部分 | server **從 cache 讀 `failed_parts`** → 當 `retry_parts` |

前端按「重試失敗部分」只送 `mode=retryFailed`，不需知道哪幾個 part——server 從 cache 推算。

### 5.2 GET 結果加三態欄位

`GET .../entities/:id/analysis`（及 event 對應）回應加：
- `status: "complete" | "partial"`
- `failedParts: string[]`（如 `["archetype:jung"]`）
- `none`（尚未分析）維持現狀，查無 cache 的既有行為。

### 5.3 任務中心曝露 partial

- `set_completed` 存的 result 本就帶 `failed_parts`。
- 任務中心該列：result 有非空 `failed_parts` → 顯示**「部分完成」+ 琥珀點**（不是綠「已完成」）。
- `TaskStatus.status` 仍 `done`；partial 純內容層衍生。

### 5.4 文件

API 變更同步更新 `docs/API_CONTRACT.md`，commit 標 `[api-contract updated]`。

---

## 6. 前端三態 UX

- 區分兩種「空」：
  - **尚未分析**（無 cache / 該 part 合法空）→ 維持「未生成」
  - **生成失敗**（part 在 `failedParts`）→ 顯示「**生成失敗，可重試**」
- status=partial 時露出一鍵「**重試失敗部分**」動作（送 `mode=retryFailed`）。
- 任務中心：result 帶非空 `failed_parts` → 該列「部分完成」+ 琥珀點。
- **角色分析左側「已分析」清單的狀態點**：清單端點 `#6a` 的 `AnalysisItem` 帶 `status`；`status==='partial'` → 該角色狀態點上色為琥珀 `var(--color-warning)`，`complete` 維持綠。這修正了「分析跑一半卻仍顯示綠燈」的誤導（三態在清單層級也要可見，不只詳情頁與任務中心）。
- 型別從 `generated.ts` 取用（schema 改完跑 `npm run gen:types`）。
- 前端無測試 runner，靠 `tsc + eslint` 把關。

---

## 7. 測試

| 層 | 測什麼 |
|----|--------|
| `gather_parts` 純函數 | 全成功→空清單；部分失敗→正確 part 名稱 + 保留成功結果；全失敗 |
| service（character/event） | part 失敗 → result 帶 `failed_parts` 且其他部分在；`retry_parts` 路徑沿用 cache 閘門、只重跑失敗 part、合併重算 |
| service | 閘門（CEP/EEP）失敗 → 整體 raise（不進 failed_parts） |
| API 端點 | GET 回 `status`/`failedParts`；trigger `retryFailed` 從 cache 推 parts 並重跑；happy path |
| 前端 | 靠 tsc + eslint（無 runner） |

---

## 8. 異動檔案清單（實作時據此拆子任務）

> 跨檔超過 3 個，依 CLAUDE.md 拆子任務逐步確認。

**子任務 A — 共用機制**
- 新增 `backend/storysphere/core/gather_parts.py` + 測試
- 修改 `backend/storysphere/services/analysis_models.py`（`failed_parts` 欄位 / 共用 base）

**子任務 B — character pipeline**
- 修改 `backend/storysphere/services/analysis_service.py`（`analyze_character` 用 `gather_parts`、加 `retry_parts`）
- 修改 `backend/storysphere/agents/analysis_agent.py`（透傳 `retry_parts` + 部分重算路徑）
- service 測試

**子任務 C — event pipeline**
- 同 B，套到 `analyze_event`
- service 測試

**子任務 D — API + 契約**
- 修改 `backend/storysphere/api/routers/books.py`（character/event 觸發端點加模式、GET 回應加 `status`/`failedParts`；event 端點同步）
- 修改對應 `backend/storysphere/api/schemas/`（response 加欄位、request 加 mode）
- 更新 `docs/API_CONTRACT.md`（`[api-contract updated]`）
- 端點測試

**子任務 E — 前端**
- `npm run gen:types`
- 角色 / 事件分析頁：「生成失敗，可重試」分流 + 一鍵重試
- 任務中心 `TaskRow`：partial → 「部分完成」+ 琥珀點

**新依賴：** 無。

**回滾方式：** 各子任務獨立 commit；`failed_parts` 為選填欄位（預設空＝complete，向後相容舊 cache）；`retry_parts` 為選填參數，不傳即現狀；前端為既有頁面增量改動，回退即還原。

---

## 9. 後續迭代（本次不做，僅記錄）

- 單顆 part 重試（API 已預留 `retry_parts` 清單，前端加 per-section 重試鈕即可）。
- 把三態 / `gather_parts` 推廣到未來新的小顆粒度分析模組。
- 舊 cache 無 `failed_parts` 欄位者一律視為 complete（向後相容；若要回填需另開任務）。
