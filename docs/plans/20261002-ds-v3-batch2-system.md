# DS v3 第 2 批：系統頁（設定・跨書搜尋・Token 用量・方法論）—— 實作計畫

> 規劃日期：2026-10-02 · 傘票 B-126 · 整合分支 `feat/ds-v3`（基於 `ddd94df`）
>
> **這是規劃當下的快照，實作後即凍結。** 與現況衝突時以程式碼、`API_CONTRACT.md`、`UI_SPEC.md` 為準。

## 來源

Handoff `redesign_v3_handoff_batch_2.zip`（只留本機，不進 repo）。權威順序同前兩批：
**決議紀錄 `.dc.html` > 提案 `.dc.html`**；`specs/spec-function.md` 四條路由的第 6 節「不可丟失」為硬約束；
`PROJECT_RULES.md` 不變。`ss-kit.css`、`colors_and_type.css`、`_ds_bundle.js` 與第 1 批**位元組相同**，本批不動 tokens。

## API 完備性檢查

| 頁 | 現況 | 結論 |
|---|---|---|
| 設定 | `/settings/info`、`/kg/status`（含 `unsupportedByMode`）、`/kg/switch`、`/kg/migrate`、`/kg/migrate/:id` 齊備 | 不改 API。稿上的功能 id（`graph_page`／`faction_analysis`／`inferred_relations`）與後端（`graph`／`factions`／`link_prediction`）不符，中文對照相同、i18n 已對，照後端 |
| 跨書搜尋 | `POST /search/` 兩模式＋三個定位欄位 | 不改 API。命中軌、高亮在前端算；失敗分類用 `ApiError.hasBody` |
| Token 用量 | `GET /token-usage` 含 `__unattributed__`、已刪除書（`title: null`） | 不改 API |
| 方法論 | 純前端靜態資料 | 不改 API。稿上標「缺、不代寫」的 caption／副標，產品 i18n 都已有，一律用既有字串 |

## 已裁決（2026-10-02）

- **Q1 搜尋部分失敗**：本批做，只動前端。設計稿的前提（「需後端另案、前端不知道失敗幾本」）不成立：
  `Promise.allSettled` 在 `SearchPage.tsx`，rejected 與 `bookIds` 同序對應。文案用 README §5 草稿標 TODO。
- **Q2 命中軌標籤**：保留刻痕，**拿掉「{n} 處命中」**——關鍵字分數＝各 token 出現次數總和
  （`document_service.py::search_paragraphs_by_text`），與標籤同數。**要同步回設計稿**。
- **Q3 Neo4j 連線欄位**：維持既有 `NEO4J_URL` 與「需重啟」。設定經 `lru_cache`，改 `.env` 必須重啟；
  稿上的 `NEO4J_URI`／「即時生效」是虛假承諾。
- **Q4 研究者導覽**：本批 nav 不畫，等第 19 稿定案與面板一起做（**已記為後續必做項**）。

## 工程決定（記入 `DS_V3_DESIGN_FEEDBACK.md` 第 2 批）

- 分析輸出語言兩顆鈕保留既有「跟隨介面語言／自訂語言」（稿畫成繁中／English）。
- Standard 預覽態的 Neo4j 欄位照稿常駐（現況只在選 Neo4j 時出現）；`qdrantHint` 既有字串保留（稿漏畫）。
- 方法論第 05 節標題用既有「分析品質與信心值」；概念圖內標籤一律用既有 `concept.*`（如 SEP「資料層 · 純文本證據」「退回」、
  Frye 中心「敘事／循環」與登錄詞「和解 · 更新」…、英雄旅程 `hjStageList`）。
- Schmidt 圖下交代句：草稿進 i18n，標 TODO。
- Token 用量的兩個查詢（全書未過濾／選定書）任一失敗都走單頁失敗。

## 子任務拆分

每個子任務一個分支、一個 PR，base `feat/ds-v3`。2-0 合入後 2-1～2-4 平行（分兩波，避開 429）。

| # | 分支 | 內容 |
|---|---|---|
| 2-0 | `feat/ds-v3-19-batch2-shared` | kit 補 StatRow（`.ss-stats-row`／`.ss-stat*`）；feedback 第 2 批段落（每頁一節，子任務各寫各的節，避免衝突）。07 的底線分頁稿上是頁內自繪，不進 kit |
| 2-1 | `feat/ds-v3-20-settings` | 設定：nav 三種徽章分化、主題卡、segmented、LLM 唯讀、環境 Lightweight／Standard 預覽（「預覽中」角標、旗標、能力落差兩種措辭）、遷移三態與兩種「尚未實作」、關於、規劃中面板、面板載入／失敗＋手動重試 |
| 2-2 | `feat/ds-v3-21-search` | 搜尋：搜尋列（segmented 移入、`--input-*`）、即將推出分頁、摘要與範圍 chips、書組標頭、三欄結果列（sticky 定位碼、72ch、分數欄標題）、命中軌（無標籤）、三種失敗、`GET /books` 失敗不再落成空書庫、部分失敗一行提示 |
| 2-3 | `feat/ds-v3-22-token-usage` | Token 用量：B 檢視密度、範圍 pill 與書籍下拉、StatRow 三卡、byBook 選中態與範圍說明、byService／byModel 並排、每日長條與刻度註記、空態、兩種失敗保留 pill |
| 2-4 | `feat/ds-v3-23-methodology` | 方法論：rail（232px、選中態、計數不換色）、總覽、六節版面、八張概念圖 Ink 非色相載體、Genette 下軸 C/B/A、Frye 循環箭頭、信心值分歧、跨書兩種佔位（Tooltip）、Schmidt 卡牆三組 sticky、移除 Sparkles |

## 驗證

- 每個子任務：五道閘門＋vitest 全綠。
- 畫面：對應決議紀錄 frame 逐區並排截圖（Warm／Ink）；不可丟失表逐條核對落點。
- 失敗態：`playwright-cli route` 模擬 JSON 4xx／5xx、空 body 502；搜尋另模擬單本書失敗（部分失敗）。

## 不做

- 研究者導覽面板與 nav 項（第 19 稿）。
- 搜尋的人物／原型分頁內容、Agent 搜尋。
- LLM 設定可編輯化、連線欄位實際提交。
