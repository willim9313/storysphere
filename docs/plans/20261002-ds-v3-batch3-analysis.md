# DS v3 第 3 批：閱讀＋列表型分析（閱讀頁・角色分析・事件分析・符號意象）—— 實作計畫

> 規劃日期：2026-10-02 · 傘票 B-126 · 整合分支 `feat/ds-v3`（基於 `7fb4563`）
>
> **這是規劃當下的快照，實作後即凍結。** 與現況衝突時以程式碼、`API_CONTRACT.md`、`UI_SPEC.md` 為準。

## 來源

Handoff `redesign_v3_handoff_batch_3.zip`（只留本機，不進 repo）。權威順序同前三批：
**決議紀錄 `.dc.html` > 提案 `.dc.html` > README**；`specs/family2/spec-function.md`（08–10）與
`specs/family3/spec-function.md` 的 `/symbols` 一節，第 6 節「不可丟失」為硬約束；`PROJECT_RULES.md` 不變。
`ss-kit.css`、`colors_and_type.css`、`_ds_bundle.js` 與第 2 批**位元組相同**，本批不動 tokens。
附帶工程單 `tickets/ENG-001`（語音覆蓋改為成功才覆蓋）。

## API 完備性檢查

| 頁 | 現況 | 結論 |
|---|---|---|
| 閱讀頁 | `GET /books/:id`（統計、`keywords`、6 型 `entityStats`、`author`）、`/entities/:id/chunks`、`/rerun/:step`、epistemic 齊備 | 不改 API。統計格從 5 格收成 4 格（事件不列）是前端 |
| 角色分析 | `/analysis/characters`、`/character-metrics`、`/factions`、`/entities/:id/analyze`、`analyze-all` 齊備 | 不改 API。派系依人數排名配色、前 5＋其他在前端做。批次失敗項沒有章節欄位 → 只列「名稱 · 原因」 |
| 角色・語音 | `tone_distribution` **只有陳述／疑問／感嘆三段**（標點算出），不是稿上的語氣詞 | 稿的前提不成立，見 Q3 |
| 角色・語音覆蓋 | 前端先 `DELETE` 再等使用者重按分析；LLM 逾時會把空質性寫進快取 | ENG-001，見 Q2 |
| 事件分析 | `analyze-all {eventIds?}`、`/source` 帶 `score`、`topTerms` 齊備 | 不改 API。`topTerms` 是**章節層級**關鍵詞（同章事件相同），照實呈現並記回饋 |
| 符號意象 | `/symbols/overview`、timeline、interpretation、`analyze-all`、通用 `POST /tasks/:id/cancel` 齊備 | 不改 API。「取消」現只關前端遮罩，改接真正的 cancel |
| 四頁共通 | 「應用層 503：未設定 LLM provider」只有章節審閱會回；分析類觸發都是背景任務，缺 provider 只在 task 內失敗 | 見 Q1 |

## 已裁決（2026-10-02）

- **Q1 應用層 503**：後端補檢查。四頁用到的花 token 觸發端點，在**會實際呼叫 LLM 時**先檢查 primary provider
  （`Settings.has_*`），未設定回 `503` + detail JSON；共用一個 helper，更新 `API_CONTRACT.md`。
  前端抽出 `isLlmUnconfigured`（現在只在 `ChapterReviewPage.tsx`）與就地狀態元件，四頁共用
  `common.failure.llmUnconfigured`／`llmSettings` 既有字串。
  端點：角色 `POST /books/:id/entities/:eid/analyze`、`POST /books/:id/entities/analyze-all`、
  `GET /books/:id/entities/:eid/voice`（不含 `cached_only`、且會生成時）；事件 `POST /books/:id/events/:eid/analyze`、
  `POST /books/:id/events/analyze-all`；閱讀頁 `POST /books/:id/rerun/:step`（只限會用 LLM 的步驟）、
  `POST /books/:id/classify-visibility`；符號 `POST /symbols/:id/analyze`、`POST /symbols/analyze-all`。
- **Q2 ENG-001**：本批先做（3-0）。`GET …/voice` 加 `force`：跳過快取讀取、照常計算、**成功才寫入**；
  LLM 逾時回的空質性在 force 下視為失敗、不覆蓋。前端「覆蓋重新生成」改呼叫它，不再 `DELETE`。
  因此**暫時警語「重新生成會先刪除現有語音風格…」不上線**（ticket 明定修正上線即撤）。
- **Q3 語氣分布**：三段對應語氣家族色——陳述→平穩、疑問→探詢、感嘆→激動（README §2.5 的色值）。
  **拿掉「語氣分布註」**（它描述的前端詞表不存在），保留「≥8% 才寫標籤」。記回饋請設計端改稿。
- **Q4 README 待裁決三項全部照稿**：
  1. 08 專注態卡框收成細線、`#order` 移到左邊界外（仍可點）。
  2. `reader:prefs` 的 fs／lh 依「檢視／專注」各存一組；Aa 彈窗加「此態預設」「回到此態預設」；
     舊偏好轉成檢視態的值。warmth、fade 不分態。
  3. 09 點派系圖例單獨亮出該派系（其餘 opacity 0.3，再點取消），只動前端。

## 工程決定（記入 `DS_V3_DESIGN_FEEDBACK.md` 第 3 批）

- 08 決策表寫工具列「標註密度 → 認知狀態 → 專注 → Aa」，G 區與 README 寫「檢視／專注」最左：照 G 區。
- 角色批次失敗清單只列「名稱 · 原因」（後端無章節）。
- 事件證據分頁的關鍵詞是章節層級，照實呈現。
- 符號「取消」接 `POST /tasks/:id/cancel`；批次面板照稿不加取消。
- 錯誤四分照前兩批：`failureKind`（有無 JSON body）＋`PageFailure`；符號頁載入失敗不再落成空狀態、事件清單失敗不再顯示空狀態文案。
- 類別色（派系）先在 09 頁 CSS 區域定義，不進 tokens（README §2.3）。
- PipelineRerunPanel、ClassifyVisibilityButton 的硬編中文移進 i18n（字串逐字不變）。

## 子任務拆分

每個子任務一個分支、一個 PR，base `feat/ds-v3`。3-0 合入後 3-1～3-4 平行（分兩波，避開 429）。

| # | 分支 | 內容 |
|---|---|---|
| 3-0 | `feat/ds-v3-25-batch3-shared` | 後端：LLM provider 檢查 helper＋上列端點＋測試；ENG-001（`force`、空質性不覆蓋、前端改呼叫）＋測試；`API_CONTRACT.md`。前端：`isLlmUnconfigured` 與就地狀態元件抽到共用處，ChapterReviewPage 改用它。本計畫、feedback 第 3 批骨架 |
| 3-1 | `feat/ds-v3-26-reader` | 閱讀頁：A 工作檯密度、col1 四格統計、章節卡分隔線與 chevron hover、工具列「檢視／專注」兩段＋順序、專注態細線與 `#order` 外掛、prefs 依態分存、Aa 彈窗、實體卡、PipelineRerunPanel 503、認知狀態「截止 第 N 章」、錯誤四分與「找不到書籍」進 i18n |
| 3-2 | `feat/ds-v3-27-characters` | 角色：B 檢視、左欄動作列、象限派系排名配色前 5＋其他＋圖例可點、排行、人格信心三件套、未生成／生成失敗、ego「N 段」角標、弧線圖例、語音三段家族色、認知對照 mono 事件 id、生成失敗留 task id、Tooltip、錯誤四分＋象限第四種（不再於載入中閃錯） |
| 3-3 | `feat/ds-v3-28-events` | 事件：B 檢視、批次面板子集區、清單動作列（含勾選框變體）、骨幹圖帶標與截斷規則對齊稿、排行、詳情各分頁、對比抽屜、Tooltip、錯誤四分＋詳情載入失敗 |
| 3-4 | `feat/ds-v3-29-symbols` | 符號：B 檢視、左欄動作列與 list-group-head、triage 首位放大、熱圖圖例三階與虛框、行為分群／意象叢（邊界宣告上首頁）／單次詞、詳情六格 3＋3、CTA 四階、五段 stage 加「進行中」、拿掉 ETA、取消接後端、`.ss-btn-llm` 取代 `<Sparkles>`、空態三步、篩到空「清除搜尋」、錯誤四分＋供應商阻擋 |

## 驗證

- 每個子任務：五道閘門＋vitest 全綠。
- 畫面：對應決議紀錄 frame 逐區並排截圖（Warm／Ink）；不可丟失表逐條核對落點。
- 失敗態：`playwright-cli route` 模擬 JSON 4xx／5xx、空 body 502、JSON 503（未設定 provider）。
- 3-0 後端：未設定 provider 時各端點回 503；ENG-001 驗收條件三條各一個測試。

## 不做

- 已生成詮釋的 InterpretationHero、四種審核狀態、「重新生成」、並看展開態（無截圖）。
- 09·10 批次面板收合提案（未定案）。
- 角色頁 `?character=` 網址狀態（不在本批統一）。
- 研究者導覽（第 19 稿）。
- 弧線色帶改用類別色（已裁決延後）。
