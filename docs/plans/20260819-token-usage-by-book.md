# Token 用量頁：按書籍區分消耗

**日期**：2026-08-19
**狀態**：規劃（待確認後實作）
**前置相依**：PR #42（`fix/token-usage-book-attribution`）——沒有它，`book_id` 永遠是 NULL，這頁做出來只有一列「未歸屬」。

---

## 1. 要解決什麼

現在的 Token 用量頁只能回答「這段時間總共花了多少、花在哪些服務／模型」。回答不了使用者真正會問的兩個問題：

- **哪本書最貴？**（跨書比較）
- **這本書的錢花在哪個功能上？**（單書下鑽）

資料模型已經撐得住：`token_usage` 表同時有 `book_id` 與 `service` 兩欄，缺的只是聚合、端點參數與畫面。

---

## 2. 現況（實作前的確切座標）

| 層 | 檔案 | 現況 |
|---|---|---|
| 儲存 | `backend/storysphere/core/token_store.py` | `get_usage()` 只做 summary / by_service / by_model；`get_daily_usage()` 只按日。`_time_filter()` 是唯一的 WHERE 組裝點。索引只有 `ts` 和 `service` |
| 端點 | `backend/storysphere/api/routers/token_usage.py` | `GET /token-usage?range=`，回傳 `dict[str, Any]`（**沒有 Pydantic response model**，所以 OpenAPI 沒有這個 schema） |
| 前端型別 | `frontend/src/api/tokenUsage.ts` | `TokenUsageResponse` 是**手寫**的 interface（因為上一列的緣故，`generated.ts` 產不出來） |
| 前端 hook | `frontend/src/hooks/useTokenUsage.ts` | queryKey `['token-usage', range]` |
| 前端頁 | `frontend/src/pages/TokenUsagePage.tsx` | 191 行，單檔含 `SummaryCard` / `Section` / `BreakdownTable` / `DailyChart` 四個區域元件 |
| i18n | `frontend/src/i18n/locales/{en,zh-TW}/settings.json` | `token.*` 共 15 個 key |
| 文件 | `docs/API_CONTRACT.md` #17、`docs/UI_SPEC.md` 3.12 | 皆需同步 |

實測資料分布（2026-08-19，4,136 列）：`analysis` 2.90M / `keyword` 1.61M / `extraction` 1.50M / `summary` 1.07M / `imagery` 642K / `chat` 212K / `ingestion` 44K / `unknown` 481K tokens。**全部 4,136 列的 `book_id` 都是 NULL。**

---

## 3. 三個要拍板的決策

### D1 — 閱讀方式（**這題最重要**）

| 方案 | 長相 | 回答的問題 | 代價 |
|---|---|---|---|
| **(a) 只加一張 by-book 表格** | 與 by-service / by-model 並列的第三張表，一列一本書 | 只回答「哪本書最貴」 | 下鑽不了；一本書花在哪個功能仍然看不到 |
| **(b) by-book 表格 + 書籍篩選（推薦）** | 表格照 (a)；點任一列（或用頂部書籍選單）把**整頁**——統計卡片、by-service、by-model、每日趨勢——都限定到那本書 | 兩個問題都回答：表格答「哪本書最貴」，篩選後的 by-service 答「這本書花在哪」 | 端點要多吃一個 `bookId` 參數；頁面多一個狀態 |
| **(c) 書 × 功能 交叉矩陣** | 列＝書，欄＝7 個功能的表格 | 一眼看完全部 | 書一多就爆寬，手機不可讀；空格率高（多數書不會用到全部功能） |

**建議 (b)**。理由：交叉矩陣把兩個不同尺度的問題塞進同一張表，在這個資料形狀（書會累積、功能固定 7 個）下很快就不可讀；而「先看總覽、再選一本下鑽」本來就是既有時間範圍選擇器的同一種操作習慣，不引入新的互動語彙。

### D2 — 回傳型別要不要順便 Pydantic 化

端點目前回 `dict[str, Any]`，所以 OpenAPI 沒有 schema，前端型別是手寫的——這違反 CLAUDE.md 的「API response type 一律從 `generated.ts` 取用」，但那是既有狀態，不是這次造成的。

- **(a) 維持現狀（推薦）**：`byBook` 加進手寫的 `TokenUsageResponse`。改動最小，風險零。
- **(b) 補上 Pydantic response model**：新增 `api/schemas/token_usage.py`，端點加 `response_model`，之後 `npm run gen:types` 就涵蓋這個端點。但 `token_store` 目前**直接吐 camelCase key**，套 `alias_generator=to_camel` 的 model 要處理「以 alias 餵入」的驗證，是一個獨立的、會動到既有回傳路徑的小重構。

**建議 (a)**，並在計劃裡記下這筆債。理由：紅線禁止順手整理範圍外的程式碼；型別化整個端點該是它自己的任務。

### D3 — 兩種「沒有書」的列怎麼呈現

這不是偏好題，是正確性題，兩者都必須處理：

- **未歸屬（`book_id IS NULL`）**：PR #42 之前的 4,136 列永遠是 NULL，無法回填。**必須顯示成獨立一列**，標示為「未歸屬（2026-08-19 前的記錄）」。不可以隱藏，也不可以攤平成 0——那會讓使用者以為那些錢沒花。
- **已刪除的書**：刪書時 `token_usage` 刻意不清（花費記錄，刪書不代表沒花那筆錢），所以 by-book 會出現查不到書名的 `book_id`。顯示成「已刪除的書 · <id 前 8 碼>」，不可以整列消失，也不可以讓查不到名字變成錯誤。

---

## 4. 實作切分（按 D1 選 (b) 展開）

CLAUDE.md 規定一次異動超過 3 個檔案要拆成子任務，因此分三階段，**每階段各自可獨立驗證**。

### 階段 1：後端聚合與篩選（3 檔）

- `backend/storysphere/core/token_store.py`
  - `_time_filter()` → 擴充成同時吃 `book_id`（新增選填參數，既有兩個呼叫端行為不變）
  - `get_usage()` 新增 `by_book` 聚合（`GROUP BY book_id`，NULL 自成一組）與 `book_id` 篩選參數
  - `get_daily_usage()` 新增 `book_id` 篩選參數
  - 新增索引 `idx_token_usage_book ON token_usage(book_id)`（`_ensure_table` 內，與既有兩個索引同樣是 `IF NOT EXISTS`）
- `backend/storysphere/api/routers/token_usage.py`
  - 新增 `bookId` query 參數，往下透傳
  - 用 `deps.get_doc_service().list_documents()` 補書名，查不到的留 `null` 交給前端表達（跨庫關聯只能在 API 層做——`token_store` 不得反向相依 `document_service`）
- `tests/api/test_token_usage.py`（新增或擴充）：by_book 分組、NULL 自成一組、`bookId` 篩選同時作用於 summary / by_service / daily、已刪除的書仍出現在結果中

### 階段 2：前端資料層與畫面（4 檔 + i18n）

- `frontend/src/api/tokenUsage.ts`：`byBook` 型別、`bookId` 參數
- `frontend/src/hooks/useTokenUsage.ts`：`bookId` 進 queryKey
- `frontend/src/pages/TokenUsagePage.tsx`：by-book 區塊 + 書籍篩選；沿用既有 `BreakdownTable`（它已經吃 `Record<string, TokenBucket>` + `labelFn`，書名就是 `labelFn` 的工作）
- `frontend/src/i18n/locales/{en,zh-TW}/settings.json`：`token.byBook` / `token.allBooks` / `token.unattributed` / `token.deletedBook`

顏色一律走 `var(--*)`，不新增 token（若需要新 token 則必須同步 `docs/DESIGN_TOKENS.md`）。

### 階段 3：文件同步（2 檔）

- `docs/API_CONTRACT.md` #17：新增 `bookId` query 參數與 `byBook` 回傳欄位，commit message 標 `[api-contract updated]`
- `docs/UI_SPEC.md` 3.12：版面結構加上 by-book 表格與書籍篩選，並寫明未歸屬／已刪除書的呈現規則

---

## 5. 驗收條件

1. `GET /token-usage?range=all` 回傳的 `byBook` 各列 `totalTokens` 相加 **等於** `summary.totalTokens`（含未歸屬那列）
2. `GET /token-usage?range=all&bookId=<X>` 的 `summary` 等於未篩選時 `byBook` 裡 X 那一列
3. 未歸屬的列存在且可辨識，不被靜默丟掉
4. 已刪除書的 `book_id` 仍出現在 `byBook`，畫面顯示為「已刪除的書 · <id 前 8 碼>」而不是空白或錯誤
5. 選定一本書時，by-service / by-model / 每日趨勢**全部**跟著限定，不是只有卡片變
6. `pytest` / `ruff check backend/` / `npm run lint` / `npm run build` 皆無新增錯誤（判準是「無新增」，比對方式見 CLAUDE.md）

---

## 6. 明確不做

- **不回填舊資料**：4,136 列 NULL 沒有任何欄位能推回是哪本書（`ts` 也不行，多本書的匯入時間會重疊）
- **不做成本（金額）估算**：表裡沒有單價，那是另一個題目
- **不動 `token_usage` 的寫入路徑**：那是 PR #42 的範圍
- **不把端點 Pydantic 化**（除非 D2 選 (b)）
- **不碰刪書流程**：`token_usage` 不參與刪書是刻意的決定，不在這次翻案

---

## 7. 回滾

三個階段各自是獨立 commit，任何一段 revert 都不影響其他：

- 階段 1 revert → 端點回到不吃 `bookId`、不回 `byBook`；新增的索引留著也無害
- 階段 2 revert → 頁面回到三區塊版面
- 索引是 `IF NOT EXISTS` 的加法，不改變任何既有查詢的語意
