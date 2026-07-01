# 角色分析批次生成 — 開發規劃

**日期**：2026-05-19
**範疇**：`/books/:bookId/characters`（`CharacterAnalysisPage` 補上事件頁已有的「一鍵生成」批次能力）
**對標頁面**：`EventAnalysisPage`（已具備批次生成 + 進度面板 + 完成 toast）
**設計系統**：沿用既有 Token 系統（`frontend/src/styles/tokens.css`、`docs/DESIGN_TOKENS.md`）

---

## 1. 動機

事件分析頁有「一鍵生成全部 EEP」功能（`<BatchEepPanel>` + `POST /books/:bookId/events/analyze-all`），可批次觸發未分析事件、自動跳過已分析、即時顯示進度與最終統計。

角色分析頁目前只能**逐一點擊「生成分析」**，當書中角色數量多（10+）時體驗顯著落後事件頁。本次任務補齊功能對等。

成功指標：使用者進入角色頁可一鍵觸發所有未分析角色的深度分析；觸發後左側 panel 顯示進度條與階段；完成後出現 toast 與統計（生成 / 跳過 / 失敗）。

---

## 2. 範疇（hard scope）

### 包含
- 後端：新增批次端點 `POST /books/:bookId/entities/analyze-all`，內部循序呼叫 `analyze_character`，cache hit 自動跳過
- 前端：`CharacterAnalysisPage` 左側 sidebar 頂部加入批次面板（重用 `<BatchEepPanel>`）、ConfirmDialog、完成 toast
- i18n：新增 `character.batch.*` keys（zh-TW / en）
- API contract：補 #7h 段落，commit 標 `[api-contract updated]`
- 後端測試：新端點的 happy / 404 / 空清單 / cache skip 路徑

### 不包含（保留現狀）
- Voice profiling、Epistemic state 不納入批次（保留各自獨立觸發按鈕）
- 並行化（bounded concurrency）— 維持循序，token 預算優先
- 角色分析的內部演算法、cache key 規則、`analyze_character` 簽章
- 事件頁的批次 UI 與 API（不動）
- React Query key 結構（沿用 `['books', bookId, 'analysis', 'characters']`）

---

## 3. 現況快照

### 3.1 後端

**單筆觸發** `backend/storysphere/api/routers/books.py:1510-1534`：
```
POST /books/:bookId/entities/:entityId/analyze
  → background_tasks.add_task(_run_entity_analysis, ...)
  → _run_entity_analysis 呼叫 agent.analyze_character(
        entity_name, document_id,
        archetype_frameworks=["jung", "schmidt"], ...)
  → task_store.set_completed(task_id, result=result.model_dump())
```

**Cache key**（`backend/storysphere/api/routers/books.py:1455`）：
```python
AnalysisCache.make_key("character", book_id, entity.name)  # 注意是 entity.name 不是 entity.id
```

**事件批次範本** `backend/storysphere/api/routers/books.py:1813-1919`：
- `_run_batch_event_analysis`：迭代 events、cache hit skip、否則呼叫 agent、逐筆 `task_store.set_progress`
- `POST /books/:bookId/events/analyze-all`：202 回 `taskId`
- 完成結果 `{progress, total, failed, skipped}`

### 3.2 前端

**事件批次 stack** `frontend/src/pages/EventAnalysisPage.tsx:137-175`：
- `triggerBatchEventAnalysis(bookId)`（`frontend/src/api/analysis.ts:89`）
- `useTaskPolling(batchTaskId)`
- 兩個 `useEffect`：依 `progress` 增量 invalidate + 依 `status` 收尾
- `<BatchEepPanel>` 共用元件已用 i18n `t('batch.*')`、無 event 字樣
- CSS class `.ea-batch-*` 定義於 `frontend/src/styles/event-analysis.css:43+`

**角色頁缺**：批次 API client、batch state、polling 雙 effect、面板掛載點、ConfirmDialog、toast、`character.batch.*` i18n keys

### 3.3 i18n keys 現況

`frontend/src/i18n/locales/zh-TW/analysis.json` 與 en 對應檔：
- 事件批次 keys 放在**頂層** `batch.*`（`batch.header`、`batch.triggerAll`、`batch.toastTitle` …）
- 角色相關 keys 全部在巢狀 `character.*` 下

→ 為避免再犯先前 `t('compare.fromSidebar')` vs `character.compare.fromSidebar` 的 bug，本次新增的角色批次 keys **必須**放 `character.batch.*`，**不混用頂層** `batch.*`。

---

## 4. 設計決策

### 4.1 端點命名與形狀

| 項目 | 決策 | 理由 |
|---|---|---|
| 路徑 | `POST /books/:bookId/entities/analyze-all` | 與單筆 `POST /entities/:entityId/analyze` 對稱；entity 是後端命名（不是 character） |
| Request body | 無 | 沿用事件批次風格，不接受 framework 參數，固定跑 `["jung","schmidt"]` |
| Response | `202 { taskId }` | 與事件批次一致 |
| 進度結果 | 沿用 `BatchEepResult { progress, total, failed, skipped }` | 前端 `<BatchEepPanel>` 已用此 type，免造新 type；命名「Eep」字面上偏事件，但 panel 本身已 generic（顯示 `batch.header` i18n） |
| Skip 規則 | cache hit by entity.name | 與單筆 `_run_entity_analysis` 對齊；用 id 會永遠 miss |
| Entity 過濾 | 只迭代 `entity_type == "character"` | 避免 location / organization 也被 LLM 分析浪費 token |
| 空清單 | 400 `No characters found for this book` | 對齊事件批次 `No events found for this book` |
| 失敗策略 | 個別失敗 logger.warning + failed++，繼續跑下一個 | 對齊事件批次 |

### 4.2 進度推送

`task_store.set_progress(task_id, progress=int(done/total*100), stage=f"分析角色 {done}/{total}")`

進度 stage 字串先寫死中文（與事件批次 `分析事件 {done}/{total}` 對齊），未來 i18n 化是另一個 ticket。

### 4.3 前端 panel 重用 vs. 新建

**決策：重用 `<BatchEepPanel>`，不更名、不搬位**。

- 元件內部完全靠 i18n key `t('batch.*')`，**沒寫死「event」字樣**
- 但 i18n key prefix 是頂層 `batch.*`，角色頁要傳給它的字串得透過 i18n bridging：

兩個方案：

- **方案 A（推薦）**：角色頁也用頂層 `batch.*` keys，但這跟「決策 §3.3」矛盾
- **方案 B**：把 `<BatchEepPanel>` 改成接受 namespace prop（`namespacePrefix="batch"` 或 `"character.batch"`），預設頂層

**最終採方案 B**：`<BatchEepPanel>` 簽章新增 optional `i18nPrefix?: string`（預設 `'batch'`），內部所有 `t('batch.xxx')` 改成 `t(`${i18nPrefix}.xxx`)`。角色頁傳 `i18nPrefix="character.batch"`，事件頁不傳維持原樣。新增 keys 在 `character.batch.*` 下與事件批次完全鏡像。

### 4.4 CSS 共用

`<BatchEepPanel>` 內 class 全部 `ea-batch-*`，目前定義在 `event-analysis.css`。

**決策：保留 class 名不動，在 `character-analysis.css` 用 `@import` 或直接複製**——選**複製**，理由：
- 兩頁 css 互相獨立載入（透過 page-level 動態 import）
- `@import` 跨檔在 vite 處理上會被 inline，差別不大
- 將來若 panel 樣式分歧，事件 / 角色可獨立調整

→ 第一版直接 import：在 `CharacterAnalysisPage.tsx` 頂部加 `import '@/styles/event-analysis.css'` 不可取（會污染整頁），改成把 `.ea-batch-*` 區塊**抽到 `frontend/src/styles/analysis-batch.css`**，兩頁都 import。

### 4.5 Toast

事件頁的 `ea-toast` 樣式直接複製到 `character-analysis.css`、class 改 `ca-toast-*`，行為（5 秒自動消失）對齊。

### 4.6 ConfirmDialog 文案

新增 i18n keys：
- `character.batch.confirmTitle`：批次生成角色分析
- `character.batch.confirmMessage`：將對 {{count}} 個尚未分析的角色執行深度分析，已分析的角色會自動跳過。此操作將消耗大量 token。
- `character.batch.confirmBtn`：確認執行

---

## 5. 預計修改檔案清單

### 後端
- `backend/storysphere/api/routers/books.py` — 新增 `_run_batch_entity_analysis` 與 `trigger_batch_entity_analysis`
- `tests/api/test_character_analysis.py`（若不存在則新建）或 `tests/api/test_books.py` — 新端點測試

### 前端
- `frontend/src/api/analysis.ts` — 新增 `triggerBatchEntityAnalysis(bookId)`
- `frontend/src/api/mock/data.ts` — 對應 mock
- `frontend/src/api/generated.ts` — `cd frontend && npm run gen:types` 後產出
- `frontend/src/components/analysis/BatchEepPanel.tsx` — 加 `i18nPrefix` prop（向後相容）
- `frontend/src/pages/CharacterAnalysisPage.tsx` — 加 batch state、mutation、雙 effect、面板、ConfirmDialog、toast
- `frontend/src/i18n/locales/zh-TW/analysis.json` — 加 `character.batch.*`
- `frontend/src/i18n/locales/en/analysis.json` — 加 `character.batch.*`
- `frontend/src/styles/analysis-batch.css`（新檔）— 從 `event-analysis.css` 抽 `.ea-batch-*` 區塊
- `frontend/src/styles/event-analysis.css` — 移除已抽出的 `.ea-batch-*` 區塊（改 import 共用）
- `frontend/src/styles/character-analysis.css` — `@import` 共用 batch css + 加 `.ca-toast-*`

### 文件
- `docs/API_CONTRACT.md` — 新增 #7h 段落，commit 標 `[api-contract updated]`

**不會動的檔案**：
- `backend/storysphere/services/analysis_service.py`（`analyze_character` 簽章不變）
- `backend/storysphere/services/analysis_models.py`
- React Query key 結構
- 事件分析頁邏輯（panel signature 向後相容 → 不影響）

---

## 6. 開發順序

1. **後端 endpoint + 測試**（先後端，前端才能對接真實 API）
   - 寫 `_run_batch_entity_analysis`、`trigger_batch_entity_analysis`
   - 加 4 個測試：happy / 404 book / 空清單 400 / cache skip 算入 progress
   - `ruff check src/` 通過
2. **API contract 更新**（commit 一起進）
3. **前端 type gen**（`npm run gen:types`）
4. **`<BatchEepPanel>` 加 `i18nPrefix` prop**（事件頁不傳 → 無行為變化，可獨立 commit）
5. **CSS 抽取共用**（事件頁應仍正常運作）
6. **i18n keys 加齊**（zh-TW + en 兩邊鏡像）
7. **角色頁接入批次**（state、mutation、effects、UI 掛載、ConfirmDialog、toast）
8. **手動驗證**：
   - 觸發批次 → 進度條動 → 完成 toast 出現 → 統計正確
   - 中途切換角色 / 切框架 → 批次任務不中斷
   - 全部已分析時按鈕變 `allDone` 並 disable
   - 觸發失敗 → 顯示錯誤
9. **`ruff check src/` + `cd frontend && npm run lint`**（不新增錯誤）

---

## 7. 必須注意的陷阱

1. **`analyze_character` 比 `analyze_event` 重 5+ 倍 LLM call**（CEP / Jung / Schmidt / arc / profile）。100 角色循序跑可能 10+ 分鐘。本次維持循序與事件批次對稱；若實測過慢，**獨立 ticket** 評估 bounded concurrency。

2. **Cache key 用 entity.name 不是 entity.id**。`_run_batch_entity_analysis` 的 skip 邏輯必須 `AnalysisCache.make_key("character", book_id, entity.name)`，不可用 id，否則 cache 永遠 miss → 重算所有已分析角色 → token 浪費。

3. **Entity 類型過濾必須在 endpoint 內做**。`kg.list_entities(document_id=..., entity_type='character')`（確認確切 kwarg 名）；否則 location / organization / object 也會丟進 `analyze_character`，浪費 token 且結果無意義。

4. **i18n key namespace 絕對不可混用**。新增的角色批次 keys 一律 `character.batch.*`；`<BatchEepPanel>` 透過 `i18nPrefix` prop 切換。本次寫測試前先用 React DevTools 確認 panel 內所有 i18n call 都吃到正確 prefix。

5. **進度增量 invalidation 的 query key 要對**。事件版用 `['books', bookId, 'analysis', 'events']`；角色版必須是 `['books', bookId, 'analysis', 'characters']`，否則左側清單不會即時跳到「已分析」分組。

6. **`set-state-in-effect` lint 已存在於 [CharacterAnalysisPage.tsx:111](frontend/src/pages/CharacterAnalysisPage.tsx#L111)**。新加的兩個 batch effect 結構與事件頁鏡像 → 會再多 2 個同類錯誤。本次任務範疇內**接受 lint 紅**，與事件頁保持結構一致；獨立 PR 重構兩頁。Definition of Done 的「無**新增**錯誤」需明確：以「同檔當前已有的同類錯誤不計」為基準。

7. **ConfirmDialog 的 count 來源**。事件頁傳 `evtData?.unanalyzed.length ?? 0`，角色頁對應 `charData?.unanalyzed.length ?? 0`；要在按鈕 disable 邏輯內排除 `unanalyzed.length === 0` 的情境（與 `allDone` 重疊但語意不同 — `allDone` 看 ratio，`unanalyzed === 0` 看 list 實際內容）。

8. **`task_store` 是全域單例**。後端測試寫入 task 必須用 `uuid4()` 產生唯一 task_id 避免跨測試污染（已在 `CLAUDE.md` 載明）。

9. **背景任務失敗 ≠ task 失敗**。事件批次的 try/except 在迴圈內，個別失敗繼續跑；只有「list_entities 抓不到」或外層例外才會讓整批 fail。對齊此語意，不要在 `analyze_character` 例外時 `set_failed` 整個 task。

---

## 8. Definition of Done

- 後端：`POST /books/:bookId/entities/analyze-all` 可觸發、回 202 + taskId；`GET /tasks/:taskId/status` 輪詢看得到 `分析角色 N/M` 階段；完成後 `result` 為 `{progress, total, failed, skipped}`
- 前端：角色頁左側 sidebar 頂部出現批次面板；點「一鍵生成全部 EEP」（按鈕文案改 `character.batch.triggerAll`）→ ConfirmDialog → 觸發 → 進度條動 → 完成出現統計 + toast
- 跑批次過程中切換角色 / 切框架不會中斷任務
- `ruff check src/` 無新增錯誤
- `cd frontend && npm run lint` 無新增錯誤（同檔已存在的 `set-state-in-effect` 不計）
- `docs/API_CONTRACT.md` 已加 #7h，commit message 標 `[api-contract updated]`
- 後端測試 4 個全綠：happy / 404 book / 空清單 400 / cache skip
- 兩個 i18n 檔（zh-TW、en）`character.batch.*` keys 對稱齊全
