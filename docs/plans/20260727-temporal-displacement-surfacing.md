# 倒敘與預敘：把分析結果接到 UI

**日期**：2026-07-27
**狀態**：待確認
**相關**：B-037（Genette 時序分析）、#21g/#21h/#21i、時間軸頁

---

## 問題

`POST /narrative/temporal` 會呼叫 LLM 跑完整趟分析，但結果沒有任何 endpoint 讀取，
使用者花了 token 卻看不到任何變化。追出來的斷點：

| 產出 | 寫到哪 | 誰讀 |
|------|--------|------|
| `event.story_time.relative_order` | KGService **記憶體** | 無 |
| `TemporalAnalysis`（displacements / analepsis_ids / prolepsis_ids） | AnalysisCache SQLite，key `temporal_analysis:{doc_id}` | 只有 `analyze_temporal_order` 自己（re-run 時當快取） |
| task result payload | task_store | 前端拿到後丟棄，只做 `invalidateQueries` |

時間軸回傳的兩個相關欄位都不是這條路寫的：

- `chronologicalRank` ← `kg.set_chronological_rank()`，由「故事時序」計算負責
- `narrativeMode` ← `extraction_service` 抽事件時寫死，之後不再更新

前端譜上的倒敘／預敘標註來自 `deriveMode(deviation)`，是 `chronological_rank`
對比敘述順序的**純幾何推導**，跟有沒有跑過這個分析無關。

## 目標

1. 分析結果進到時間軸回傳，讓「LLM 判定的倒敘／預敘」與「幾何推導的偏離」在畫面上可區分
2. 工具列的「倒敘與預敘」能顯示上次結果，順帶取得首次／重跑的判斷依據
3. 覆蓋率不足時不再回報成功

## 非目標

- 不改 `narrativeMode` 的來源（那是抽取階段的 per-event 標記，語意不同，動它會影響篩選器既有行為）
- 不改 60% 覆蓋率門檻與 `analyze_temporal_order` 的演算邏輯
- 不做 `story_time.relative_order` 的持久化（記憶體寫入維持現狀，本計畫只讀 cache）

---

## Phase 1 — 後端：時間軸回傳帶上位移

**檔案**

- `backend/storysphere/api/schemas/books.py`（修改）
  - `TimelineEventEntry` 新增 `temporal_displacement: TemporalDisplacementEntry | None = None`
  - 新增 `TemporalDisplacementEntry`：`type`（analepsis/prolepsis/linear）、`displacement`、`text_rank`、`story_rank`
  - `TimelineResponse` 新增 `temporal_structure: str | None`、`temporal_analyzed: bool`
- `backend/storysphere/api/routers/books.py`（修改）
  - `get_book_timeline` 讀 `cache.get(f"temporal_analysis:{book_id}")`
  - `coverage_sufficient` 為 false 時視同沒跑過（`temporal_analyzed=False`，不帶 displacement）
  - 以 `event_id → TemporalDisplacement` 建 map，逐筆帶進 `TimelineEventEntry`

不需要新依賴：該 endpoint 已注入 `AnalysisCacheDep`。

**驗證**：`tests/api/test_timeline.py` 補三個案例 —— 沒有 cache、cache 覆蓋率不足、cache 完整。

## Phase 2 — 契約與型別

- `docs/API_CONTRACT.md`：更新 `GET /books/:id/timeline` 的 response，commit 標 `[api-contract updated]`
- `frontend/`：`npm run gen:types` 重新產生 `generated.ts`
- `frontend/src/api/types.ts`：`TimelineEvent` 補上對應欄位（沿用既有手寫 type 的位置，不新增檔案）

## Phase 3 — 前端：呈現

- `frontend/src/lib/timelineGeometry.ts`（修改）
  - `TimelineDatum` 帶上 `displacement`（來自 API）；**保留** `deviation` 與 `mode` 不動
  - 標註優先序：有 LLM 判定時用它，沒有才退回幾何推導
- `frontend/src/components/timeline/TimelineStave.tsx`（修改）：兩種來源的標註視覺分開（LLM 判定為實線標記，幾何推導維持現有虛線註記）
- `frontend/src/components/timeline/EventDetailPanel.tsx`（修改）：顯示 `text_rank → story_rank` 與判定類型
- `frontend/src/pages/TimelinePage.tsx`（修改）：
  - 「倒敘與預敘」狀態行改為「已識別 N 筆倒敘 · M 筆預敘」，首次／重跑用 `temporalAnalyzed` 判斷（與故事時序同一套規則）
  - task 完成時檢查 result 的 `coverage_sufficient`，false 時改出警告 toast
- i18n zh-TW / en：新增對應文案

## 拆分與確認點

三個 Phase 逐段做、逐段回報，不一次做完：

1. Phase 1 完成 → 跑 pytest、貼 endpoint 實際回傳
2. Phase 2 完成 → 貼 contract diff 與 gen:types 結果
3. Phase 3 完成 → 用 playwright 驗畫面（需要一本覆蓋率 ≥ 60% 的書，或用 route mock）

## 風險與回滾

- **風險**：目前兩本測試書覆蓋率都不足（15% / 40%），Phase 3 只能用 mock 驗；真實跑一次要花 LLM token，是否要跑由使用者決定
- **回滾**：三個 Phase 各自獨立 commit，`git revert` 單一 commit 即可；後端新增欄位為 optional，舊前端不受影響
