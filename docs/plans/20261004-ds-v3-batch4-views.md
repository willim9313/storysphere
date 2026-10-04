# DS v3 第 4 批：專門視圖（時間軸・建構概覽・知識圖譜・張力分析）—— 實作計畫

> 規劃日期：2026-10-04 · 傘票 B-126 · 整合分支 `feat/ds-v3`（基於 `aed7df5`）
>
> **這是規劃當下的快照，實作後即凍結。** 與現況衝突時以程式碼、`API_CONTRACT.md`、`UI_SPEC.md` 為準。

## 來源

Handoff `redesign_v3_handoff_batch_4.zip`（只留本機，不進 repo）。權威順序同前幾批：
**決議紀錄 `.dc.html` > 提案 `.dc.html` > README**；`specs/family3/spec-function.md` 的 `/timeline`、`/unraveling`、
`/graph`、`/tension` 四節，第 6 節「不可丟失」為硬約束；`PROJECT_RULES.md` 不變。
`ss-kit.css`、`colors_and_type.css`、`styles.css`、`support.js` 與第 3 批**位元組相同**，本批不動 tokens。

README 本批的新觀念：**花 token（字符）／寫資料（確認框）／不可逆（危險色）三軸互不蘊含。**

## API 完備性檢查

| 頁 | 現況 | 結論 |
|---|---|---|
| 時間軸 | rank 已在 `GET /timeline`，偏離量由前端算；coverage 已回 `events_with_hint`／`total_events`；stale 已有 `temporalIsStale`／`temporalStaleReason`；`POST /tasks/:id/cancel` 已有 | 開關、分數、取消都是前端。**`timeline/compute`、`/narrative/temporal` 沒有 503 檢查**；故事時序 LLM 失敗被 pipeline 吞掉、任務回 done，且呼叫 LLM 前就先刪了舊時序關係 |
| 時間軸 | 「等待故事時序完成後接續」（G1） | 後端沒有串接，兩個任務互不依賴 → 不畫這一態 |
| 建構概覽 | 後端 `EDGES` 正好 43 條，與稿逐條相同 | 邊表不改，只改畫法（回頭邊、扇出錨點） |
| 建構概覽 | KG 重跑實際另清時序關係、故事時序排名、已採用推斷概念 | 稿的刪除表少 3 顆，見 Q2 |
| 建構概覽 | 任務錯誤只有自由字串，沒有 status／reason | `triggerFailedDetail` 依稿規則「不給就整行不出現」 |
| 建構概覽 | `inferred-concepts/run` 沒有 503 檢查；`kg_concept_inferred` 沒有 partial、沒有 pending 計數 | 補 503；待審數由前端打清單自算，節點狀態照 manifest |
| 建構概覽 | 稿上的原始計數／附加資訊鍵（`chapters_covered`、`last_run`、`model`、`links`…）API 沒有 | 只顯示 API 現有的鍵，不擴充後端 |
| 知識圖譜 | 推論、群集、比較、深度分析、分類可見性端點齊備；深度分析與分類可見性已有 503 | 不改 API。偵測算法後端不收參數 → 只顯示現值 |
| 張力 | 四階段、審核、指派、重跑、主題端點齊備；沒有批次審核端點（前端逐筆 PATCH） | 不改 API。**Step 1／Step 2／合成三個觸發端點沒有 503 檢查** |
| 張力 | 沒有「從線移除 TEU」的 API | 409 文案見 Q3 |
| 四頁共通 | 時間軸、張力、建構概覽、圖譜都沒套 `failureKind`／`PageFailure`；`BookLayout` 取書失敗整個換成紅字、書名列消失 | 見 Q5 |

## 已裁決（2026-10-04）

- **Q1 後端範圍**：4-0 做兩項。(a) `POST /books/:id/timeline/compute`、`POST /narrative/temporal`、張力 Step 1／Step 2／合成、
  `POST /books/:id/inferred-concepts/run` 加 `require_llm_provider()`，更新 `API_CONTRACT.md`；
  (b) 故事時序改「成功才覆蓋」：LLM 失敗時任務回 error，不先刪既有時序關係（比照 ENG-001）。
- **Q2 KG 刪除表**：照後端實際行為。knowledge-graph 觸發器的刪除表在稿的 7 顆之外補上
  `kg_temporal_relation`、`chronological_rank`、`kg_concept_inferred`。畫布與確認框都讀這張表。記回饋請設計端改稿。
  「已採用推斷概念在 KG 重跑後永久消失、無法再採用」進 backlog（B-127），本批不修。
- **Q3 409 文案**：`tension.teu.assign.conflict` 只留前兩句（刪「要改歸屬，先從原本那條線移除」），記回饋。
- **Q4 確認框成本提示**：本批照決議紀錄。`ConfirmDialog` 加兩個選用 prop：`costHint`（按鈕列左側）、`sections`（分段清單）。
  只有本批的確認框使用，前幾批不動；0-F 補記。
- **Q5 錯誤態**：圖譜本批也改 `PageFailure`＋`failureKind`。4-0 修 `BookLayout`：取書失敗時保留側欄與書名列（書名留白，同 3-RD-5），
  主體換 `PageFailure`。之後只剩敘事結構（第 16 稿）是例外。
- **Q6 時間軸既有字串**：照提議改寫（**例外於「既有字串一字不改」，使用者明示**），新文字標草稿：
  `timeline.onboarding.chrono.desc`、`timeline.guide.body` 改成兩視圖（底圖＋對照開關）的說法；
  `timeline.action.displacementBlocked` 改成「目前 {{n}} / {{total}}（{{pct}}%）」；`timeline.noRanked.desc` 拿掉第三句「它們仍可逐筆檢視。」。
- **Q7 改到區域裡的既有 bug**：在各頁子任務內修，PR 逐條列。本批不碰的後端 bug 進 backlog。

## 工程決定（記入 `DS_V3_DESIGN_FEEDBACK.md` 第 4 批）

**時間軸**
- 三視圖 tab 撤掉；`?view=` 不再讀（舊連結落到底圖）。`StoryOrderView`、`MatrixCanvas`、`noRanked.story/matrix`、`storyOrderPrompt.*`、
  `loadingBy.story/matrix`、`tabs.*`、`modeSub.*` 變孤兒——**不刪**，PR 列出，合入時再問（矩陣密度版延後時可能用到）。
- 對照開關：預設關（C 區）。關＝已排序事件畫在中線、不做縱向偏離；開＝現行偏離畫法，headline／meta／圖例只在開時出現。
  未排序帶改成每行固定渲染。disabled 依**全書**有無 rank（`stats.ranked === 0`），不隨篩選變灰；說明卡的 `{n}` 用全書事件數。
- EEP 兩顆按鈕移除：覆蓋率列改「前置：事件分析 d / t 筆（pct%）」＋「到事件分析頁 →」（不預選章節）；章節帶保留說明、拿掉按鈕。
  時間軸查詢改成掛載時重抓，接住在事件分析頁跑完的 EEP。
- 「識別倒敘與預敘」一律帶 `force: true`（使用者明示要跑；否則舊的「覆蓋率不足」快取會一直擋住）。「中止」接 `POST /tasks/:id/cancel`。
- 被跳過（覆蓋率不足）改成動作面板內可關閉的 partial 卡（G2），不再 toast。
- 過期說明帶移到譜面上方（I④）；`{step}` 用既有步驟名 i18n 對照，不新擬「知識圖譜抽取」。
- 角色軌跡上限維持 3、預設開（功能凍結）；篩選「重要性」不加「未評」選項；「需要故事時間提示」判斷照舊。皆記回饋。
- 「重要度未評」旁那張卡是稿的註解欄，不是產品 UI。

**建構概覽**
- `NODE_POS` 照稿列序重排；五欄 184、節點框 150、右欄兩態 340。回頭邊 `eep → kg_temporal_relation` 繞到下方；`paragraphs`、`kg_event` 扇出分散錨點。
- 選取：上游鏈（遞移）accent 實線、一階鄰居 `--fg-secondary`、刪除表節點 error 虛線＋刪除線計數；邊不著色。
  「全部」改用既有 `unraveling.toolbar.clearSelection`「清除選取」，`toolbar.showAll` 變孤兒。
- `narrative_structure` 一律顯示 `blockedByHazard`（優先於 blocker）；其餘 8 顆無觸發器節點維持「觸發建構功能規劃中」。
- 關鍵字觸發器照掛字符（與閱讀頁 PipelineRerunPanel 一致）；預設 yake 不用 LLM 這件事記回饋。
- 建構中只留 spinner（照稿），記回饋：批次任務其實有進度。
- 既有的「意象實體」「符號出現次數」等計數名不改字（「全站一律用象徵」與「既有字串一字不改」衝突），記回饋。
- 推斷概念待審數由前端打清單自算；節點狀態照 manifest，不在前端覆寫成 partial。

**知識圖譜**
- 工具列一列 32；放不下時退回換行，不裁切。導覽條浮動位置隨工具列高度調整。
- 主面板統一 320，抽出共用右欄容器放「目前顯示 · {name}」＋四點；右下三件套錨點改讀實際寬度（修 280 寫死）。
- 次級面板維持現況：在主面板右側、主面板往左推（與 spec §6 一致），一次一個。
- 實體對模式退出鈕移到右上，用既有字串 `v1.pair.exit`「退出」（稿的規則：既有字串優先）；不加 Esc。
- 「逐章成長播放（F3）」照原字串，F3 是功能代號不是鍵位，不綁鍵；分類可見性沿用既有字面。皆記回饋。
- 偵測算法只顯示現值，不做成可選。「展開全部 N 段」用既有「查看相關段落 →」。
- 強制重跑改 `ConfirmDialog`（danger、無字符），內文逐字含「重跡」。

**張力**
- 導覽條維持共用 `GuidanceRibbon`（同 3-EV-9，等第 19 稿）。
- 支撐張力線維持前 4 條（稿：以現況為準）。TEU 逐章展開內容沿用現有 TEU 卡（API 沒有 TEU 標題）。
- Step 1 失敗清單：有 Step 1 卡時放卡底，沒有時放頁面層。執行卡不印後端 stage 字串。

## 子任務拆分

每個子任務一個分支、一個 PR，base `feat/ds-v3`。4-0 合入後 4-1～4-4 平行（分兩波，每波兩個，避開 429）。

| # | 分支 | 內容 |
|---|---|---|
| 4-0 | `feat/ds-v3-31-batch4-shared` | 後端：6 個端點 503＋測試；故事時序成功才覆蓋＋測試；`API_CONTRACT.md`。前端：`ConfirmDialog` 的 `costHint`／`sections`；`BookLayout` 取書失敗保留外框＋`PageFailure`。本計畫、plans 索引、feedback 第 4 批骨架、backlog B-127／B-128 |
| 4-1 | `feat/ds-v3-32-timeline` | 時間軸：B 檢視、撤 tab＋對照開關三態、工具列左右兩段＋filterMode、動作面板（分數、partial、取消、force、503）、EEP 移出、固定未排序帶、過期帶、事件詳情、Q6 字串、錯誤四分 |
| 4-2 | `feat/ds-v3-33-unraveling` | 建構概覽：B 檢視、總覽一列、欄頭、DAG 重排與回頭邊、三態記號、選取三層、刪除表、節點細節六態、三種確認框、審查佇列、骨架、錯誤四分 |
| 4-3 | `feat/ds-v3-34-graph` | 知識圖譜：A 工作台、一列工具列、圖例帶、群集面板、右欄容器與顯名、Lens、實體對模式出口、深度分析字符與 503、強制重跑對話框、縮放、比較面板採用、錯誤四分 |
| 4-4 | `feat/ds-v3-35-tension` | 張力：B 檢視、階段條、空態、Step 1 卡、Hero、格點、審核工具列與線表、重跑鈕與對話框、TEU 逐章、抽屜、執行中／失敗、409、錯誤四分與 503 |

## 驗證

- 每個子任務：五道閘門＋vitest 全綠。
- 畫面：對應決議紀錄 frame 逐區並排截圖（Warm／Ink）；不可丟失表逐條核對落點。
- 失敗態：`playwright-cli route` 模擬 JSON 500、無 body 502、JSON 503（未設定 provider）；張力另測 409。
- 4-0 後端：未設定 provider 時 6 個端點回 503；故事時序 LLM 失敗時任務為 error 且既有時序關係保留。

## 不做

- 12 矩陣密度版（未畫）。
- 14 採用推論後的型別自動升級回饋（另開一題）。
- 16 敘事結構、19 研究者導覽（含 13 重開入口、15 導覽列關閉行為）。
- 任務綁 bookId、離頁回來接回進行中（B-128）。
- 已採用推斷概念在 KG 重跑後消失（B-127）。
