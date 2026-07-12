# StorySphere — 開發 Backlog

**用途**: 記錄已識別但尚未排入 Phase 的開發項目
**更新日期**: 2026-07-08

> 已完成項目歸檔於 [BACKLOG_ARCHIVE.md](BACKLOG_ARCHIVE.md)

---

## B 系列（既有）

### 🟡 中優先（功能完善）

#### B-014 Local LLM 選型評估（進行中）
**背景**: qwen2.5-3b JSON schema 遵從度不穩定（null 代替 []、malformed JSON），已換至 Phi-3.5-mini-instruct Q4_K_M（社群量化），功能正常但速度偏慢。

**Local model 選型條件**:
- JSON schema 遵從度：能穩定回傳 `[]` 而非 `null`，不截斷 JSON
- 大小：Q4_K_M 量化後 ≤ 5GB
- 格式：GGUF，相容 llama.cpp server（OpenAI-compatible `/v1` API）
- 推理速度：single-turn < 30s 為可接受範圍

**待評估候選**:
- Phi-3.5-mini-instruct Q4_K_M（~2.2GB）← 目前使用，格式遵從佳但偏慢
- Qwen2.5-7B-Instruct Q4_K_M（~4.7GB）← 同 family 升級版
- Llama-3.2-3B-Instruct Q4_K_M（~2.0GB）← Meta 新一代 3B

**目標**: 找到速度與格式穩定性平衡最佳的選項。

---

### 🟢 低優先（可選升級）

#### B-041 章節審閱 UI 需要專用 Design Token
**背景**: 章節審閱功能（`/upload/review/:bookId`）的視覺語言（切分點指示線、章節 tag、標題高亮）暫時沿用 `--entity-con-*`（靛紫）token，但這組 token 在 manuscript / minimal-ink / pulp 三個主題下會被覆蓋為灰色，紫色語意在非預設主題下失效。

**待辦內容**:
- 在 `frontend/src/styles/tokens.css` 新增 `--review-*` token 系列（建議：`--review-bg`、`--review-border`、`--review-fg`、`--review-dot`）
- 四個主題（default / manuscript / minimal-ink / pulp）各補一組值
- 同步更新 `docs/DESIGN_TOKENS.md` 對照表
- 章節審閱元件（ChapterReviewPage、段落卡片的 title_span highlight）改用新 token

**觸發時機**: 章節審閱功能（上傳流程 Phase 3）完成實作後、UI 視覺 QA 時發現主題一致性問題時。

**前置依賴**: 章節審閱功能完成（無獨立前置）

---

#### B-045 敘事結構頁：英雄旅程主視圖 + 情節骨幹摘要 ✅ 已完成（2026-06-01）
新增 `/books/:bookId/narrative` 頁，英雄旅程四佈局可切換 + 情節骨幹摘要，封裝 `api/narrative.ts`，BookNav 加入入口。詳見 `docs/BACKLOG_ARCHIVE.md`。

---

#### B-046 建構概覽：節點「觸發建構」CTA 對接 pipeline endpoint
> 原 B-044，2026-06-30 重編：原號與已歸檔的「閱讀頁 EpistemicSidePanel 入口優化」撞號。
**背景**: 建構概覽頁（`/books/:bookId/unraveling`）2026-05-26 重設計（Direction A · Diagnostic Dashboard）把 detail panel 升級為含 progress card + 章節分佈 + blocker chips + CTA 的診斷儀表板。設計稿在「status≠complete 且無 blockers」情境下提供主色 active CTA 帶具體動作文字（例：「補齊剩餘章節摘要」「萃取關鍵字」），意圖讓用戶從 unraveling 直接觸發對應 pipeline。

**目前狀態**: CTA 已以 **disabled 灰按鈕** 形式呈現（文案「觸發建構功能規劃中」），誠實標示尚未實作。視覺占位完成，pipeline 觸發未接。

**待辦內容**:
- 為每個 chapter-aware 節點定義對應的觸發 endpoint（例：summaries → `POST /summarize/batch`、kg_entity → `POST /kg/extract`、cep/eep → 既有 `/analysis/*`）
- 前端：將 `BuildOverviewPage.tsx` 內 `NodeDetail` 的 disabled CTA 改為 active，按下 → 呼叫對應 endpoint + 顯示 task polling 狀態
- 文案：把設計稿 `data.js:NODE_CTA` 對照表搬到 i18n（`unraveling.cta.*`），每個 nodeId 對 partial / empty 兩種狀態各一句具體動作
- Token 消耗確認視窗：依 [UI_SPEC.md](UI_SPEC.md) §5.3「Token 消耗提示規則」加 confirm dialog
- 後端：若對應 pipeline 尚未有獨立 endpoint（如 `kg_temporal_relation`、`teu`、Layer 3+ 衍生分析），需新增；可分階段做（先做最常用的 summaries/keywords/kg_entity/cep/eep）

**前置依賴**: 對應 pipeline 的後端 endpoint 存在；無則需先新增。

---

#### B-042 章節審閱頁面：段落 Role 自動識別（preamble / section / epigraph）
**背景**: `ParagraphRole` enum 定義了五種 role（`body`、`separator`、`section`、`epigraph`、`preamble`），其中後三者在後端原始碼中標注為 `# v2`，代表**尚未實作自動偵測邏輯**。目前使用者可在 ChapterReviewPage 手動切換 role badge，前端 UI 支援完整；但後端 `DocumentProcessingPipeline` 產出的段落一律為 `body` 或 `separator`，前言、小節標題、題詞需靠使用者自行標記。

**目前行為**:
- `separator`：已自動偵測（regex 無文字字元 + 長度 ≤ 40）
- `preamble`：無自動偵測，前言段落以 `body` 進入 RAG / KG pipeline，可能產生噪音
- `section`：無自動偵測（小節標題類段落）
- `epigraph`：無自動偵測（引言、題詞類段落）

**目錄（TOC）的處理現況**:
- 目錄整頁的每一行被 chapter detector 識別為 heading，但因為 heading 之間沒有正文段落，形成空白 chapter 被過濾掉（`chapters = [c for c in chapters if c.segments]`）
- 這是間接排除，不是主動識別；若目錄行夾雜少量正文或格式不規則，仍可能漏入

**待辦內容**:
- 後端 `document_processing` pipeline 新增 preamble / epigraph 啟發式偵測規則（例如：章節開頭短段、引號包圍段落）
- 或改為 LLM-assisted role 分類，在 chapter_review_node 進入 HITL 前預標注
- 前端 ChapterReviewPage 可針對非 body role 加上更明確的視覺提示（目前僅 dim 效果）
- 考慮是否需要在章節審閱頁面提供「全章套用同一 role」的批次操作

**觸發時機**: 上傳流程穩定後、RAG / KG 品質優化階段

**前置依賴**: 無（可獨立進行）

---

#### B-048 Neo4j Link Prediction 支援缺口
> 原 B-035，2026-06-30 重編：原號與已歸檔的「坎伯英雄旅程 LLM 結構對應」撞號。
**背景**: F-01 隱性關係推論（Link Prediction）的算法層直接使用 `nx.adamic_adar_index()`，耦合 NetworkX。Neo4j backend 無法執行此功能。Neo4j GDS library 有對應的 `gds.alpha.linkprediction.adamicAdar()` Cypher 呼叫，但介面完全不同。

**原則**: 這是「輕量 NetworkX vs 完整 Neo4j 資料庫」功能分拆的第一個具體案例。後續所有新功能若有類似的 backend 差異，均需在此記錄，確保 Neo4j 用戶的功能完整性有明確的追蹤路徑。

**待辦內容**:
- `KGService` 新增抽象方法 `get_neighbor_ids(entity_id: str) -> list[str]`，讓算法層與 backend 解耦
- NetworkX 版本：直接用現有圖結構實作
- Neo4j 版本：用 `CALL gds.alpha.linkprediction.adamicAdar(...)` Cypher query 實作
- `LinkPredictionService.run_inference()` 改用抽象方法，不直接 import networkx

**前置依賴**: B-011（Neo4j docker-compose 環境）

---

#### B-011 生產環境配置
**內容**:
- Dockerfile + docker-compose（API + Qdrant + 可選 Neo4j）
- PostgreSQL 遷移（`database_url` 已支援，需測試）
- `uvicorn --workers N` 配合 B-003 TaskStore 持久化

---

#### B-049 累積 Lint 債清理（ruff + eslint）
**背景**: refactor/lightweight 分支長期未跑 lint 清理，合併前盤點發現 `ruff check src/` 有 194 個錯誤（154 個 `--fix` 可自動修，含 I001 import 排序、F401 unused import、F841、B905、E741 等）、前端 `eslint src` 有 39 個錯誤（react-refresh/only-export-components、set-state-in-effect 等）。皆為既有風格債，不影響正確性，故與扶正 main 的合併解耦、獨立處理。

**進度（2026-07-01，全部完成）**:
- ✅ 後端 ruff：194 → **0**（`chore/lint-cleanup`）
- ✅ 前端 eslint 安全子集：39 → **20**（`chore/lint-cleanup`）
- ✅ 前端 react-hooks 高風險 20 個 → **0**（`chore/lint-react-hooks`）
  - `refs ×1`：`onDoneRef.current` 移進 `useLayoutEffect`
  - `exhaustive-deps ×4`：`?? []` 表達式改用 `useMemo` 包覆
  - `set-state-in-effect ×11`：task-polling / DOM-measurement effects 加 eslint-disable block comment
  - `preserve-manual-memoization ×2`：移除 `cardRef` 的 `useCallback`；`sortedEvents` 改用中間變數
  - `immutability ×2`：重構 `useWebSocketChat` deps 後自然消失
- ✅ 驗證：`npm run lint` → 0 problems

**前置依賴**: 無（可獨立進行）

---

#### B-050 邊界輔助辨識：段內拆分（intra-paragraph split）
**背景**: 「邊界輔助辨識」(#22c) 逐段回推找前後附邊界並切成獨立非正文章節，但切點只能落在**段落邊界**。段落是 `chunk_segments` join-then-split 的 ~1200 字 chunk，故事結尾與後附開頭常落在**同一段**，導致該段整段被切進非正文（連幾句故事尾一起排除）或整段留在正文（後附頭沒排除）。

**待辦內容**:
- 對「跨界段落」（回推停止點那一段）做段內二次判斷，找出句子級切點，把該段拆成 [故事尾] + [後附頭] 兩段再套用邊界。
- 需求量小（每端至多一段），可只對邊界那一段送 LLM 做句子級切分。

**前置依賴**: 無（在既有 suggester 上增強）

---

#### B-051 WebSocket 連線身分認證
> 來源：2026-07-08 防禦性安全稽核（低風險項）。
**背景**: `/ws/chat` 目前以任意 `session_id` 字串共用 dict，單機無實害；多使用者或對外部署時，任一 `session_id` 可存取他人對話狀態。（`/ws/tasks/{id}` 已於 2026-07-11 移除：任務狀態統一走輪詢，串流內容才用 WS。）

**待辦內容**:
- 對外部署時，WebSocket 連線綁定認證身分（依當時採用的認證機制驗證後才允許建立連線與存取對應 session）。

**觸發時機**: **決定對外/多使用者部署後**（現況只綁 loopback，暫無實害）。

**前置依賴**: 部署方向確定 + 認證層決策。

---

#### B-052 log 中 `neo4j_url` / `qdrant_url` 遮罩
> 來源：2026-07-08 防禦性安全稽核（低風險項）。
**背景**: 啟動時會把 `neo4j_url`、`qdrant_url` 寫入 log。目前這兩個 URL 無內嵌帳密故無實害，但一旦改用含帳密的連線字串（如 `neo4j://user:pass@host`）即會外洩到 log。

**待辦內容**:
- 在 log 這些 URL 前套用遮罩，只保留 scheme/host。可複用 `api/routers/settings_info.py` 的 `_mask_db_url` 遮罩模式。

**觸發時機**: **首次要在連線 URL 內放帳密之前**。

**前置依賴**: 無。

---

#### B-053 Secret 管理（prod）
> 來源：2026-07-08 防禦性安全稽核（低風險項）。
**背景**: GEMINI / Langfuse key 現存於 `.env`（已 gitignore、本機夠用）。正式對外部署時應改用 secret manager，避免明文檔案外流。

**待辦內容**:
- 依部署階梯擇一：單機 / Docker → pydantic-settings `secrets_dir` 或 Docker secrets；GCP（用 Gemini 最順）→ GCP Secret Manager。
- 程式碼側可加 `secrets_dir` 支援；建立 secret 儲存與 IAM 為 ops 動作。

**觸發時機**: **部署方向（單機 / 雲）確定後**。

**前置依賴**: 部署方向確定。

---

#### B-054 Splash 圖庫更換 + wording 同步
**背景**: 設計 canvas（Claude Design 專案 `splash/imagery.js`）的 splash 圖庫有兩張線稿插畫（`reading-hero.png` + `library-of-books.png`，各帶 `tone` 欄位與 credit 字串）；repo 的 `SplashScreen.tsx` `IMAGERY_POOL` 目前只有 `library-of-books.png` 一張。新圖仍在準備中（William 備圖），備妥後一併更換。

**待辦內容**:
- 新圖備妥後放入 `frontend/src/assets/splash/`，加入 `SplashScreen.tsx` 的 `IMAGERY_POOL`（含 `themes` 適用範圍）
- 同步對應 wording：每張圖的 credit 字串（右下角落款）依設計 pool 的格式校正（例：設計為「Library of books · ink illustration」，repo 現為「Library of Books · ink illustration」，大小寫不一致）
- 視需要補 `tone`（light/dark）欄位供 overlay 對比參考（設計 pool 有、repo 尚無）
- 清理未使用的 `frontend/src/assets/splash/splash-main.png`（確認無引用後）

**觸發時機**: 新 splash 圖檔備妥後。

**前置依賴**: 無（圖檔由 William 提供）。

---

#### B-055 章節審閱 review-data 分章載入
**背景**: `GET /books/:bookId/review-data` 一次回傳整本書全文（含切句），大書時審閱頁初載很重。2026-07-11 上傳流程強化（`docs/plans/20260711-upload-flow-hardening.md`）已讓「接受系統判斷」改走後端捷徑不再拉全文，但人工審閱路徑仍載整本。

**待辦內容**:
- review-data 支援分章 / 分頁載入（或先回骨架後懶載段落文字）
- 前端 ChapterReviewPage 對應改為漸進載入

**觸發時機**: 上傳流程 UX 重構時一併設計。

**前置依賴**: 無。

---

#### B-056 Phase 1 文件解析 sub-progress
**背景**: ingestion phase 1（解析 + 語言偵測 + 入庫）只有 5/10/15 三個粗進度點，大 PDF 解析期間畫面長時間無進度變化。需要 `DocumentProcessingPipeline` 增加 progress callback hook 才能回報頁級進度。

**待辦內容**:
- `DocumentProcessingPipeline` 增加 `sub_cb` hook（比照 phase 2 各 pipeline）
- `run_phase1` 接上 `_progress` 的 `sub_progress/sub_total`

**觸發時機**: 有大檔案解析體感問題回報時。

**前置依賴**: 無。

---

#### B-058 處理卡系統吉祥物欄
**背景**: Claude Design 的上傳流程 canvas 為 running 卡設計了第三欄「系統吉祥物」（裝飾性動態角色 GIF/Lottie，非進度指示），但**資產尚未由設計提供**。2026-07-12 實作重設計時本欄暫略（running 卡維持 時間軸 + murmur 兩欄，murmur 內既有的小 `CharacterSlot` 佔位保留）。

**待辦內容**:
- 設計提供吉祥物動態資產後，於 `ProcessingCard` running 卡加入第三欄並嵌入資產
- 決定是否移除 `MurmurWindow` 內既有的小 `CharacterSlot` 佔位（避免重複）

**觸發時機**: 吉祥物資產備妥後。

**前置依賴**: 設計提供 GIF/Lottie 資產。

---

#### B-057 批次上傳（含跳過審閱選項）
**背景**: 現行章節審閱為每本書的強制人工卡點（單本體驗良好，維持設計）。若日後支援一次上傳多本書，逐本審閱會成為瓶頸，屆時需另行設計批次流程（例如整批排隊審閱、或批次模式允許自動接受系統判斷）。2026-07-11 已確認**不**在單本流程加跳過審閱選項。

**待辦內容**:
- 批次上傳 UI / API 設計（含審閱策略）

**觸發時機**: 出現批次上傳需求時。

**前置依賴**: 上傳流程 UX 重構方向確定。

---

## F 系列（新功能）

**前置閱讀**: `docs/CORE.md`

新功能依依賴關係分為五個波次。

```
Wave 0（前置）✅  →  Wave 1（底層）✅  →  Wave 2（輕量分析）← 目前可開始
                                      →  Wave 3（深度分析）
                                      →  Wave 4（體驗功能）
                                      →  Wave 5（整合大功能）
                     + 加分項（無硬依賴，可插入任意波次）
```

**Wave 0 前置項目** ✅ 全部完成（已歸檔於 BACKLOG_ARCHIVE.md）：
- B-023 + B-031 合併 migration（EventNode 欄位）
- B-012 前後端 API 整合驗證

---

### ✅ Wave 1 — 底層基礎建設（已完成，詳情見 BACKLOG_ARCHIVE.md）

| ID | 功能 | 完成日期 |
|----|------|----------|
| F-01 | 隱性關係推論（Link Prediction） | 2026-04-27 |
| F-02 | 進度感知 KG（章節快照） | 2026-04-24 |
| F-03 | 角色認識論狀態 | 2026-04-25 |
| F-04 | 角色語音側寫（Voice Profiling） | 2026-04-25 |

---

### 🟡 Wave 2 — 輕量分析功能

#### F-06 敘事節奏分析器
**分類**: 分析功能 — Wave 2
**設計文件**: `docs/notes/narrative_rhythm_design_notes.md`（待建立，可與 F-07 合併）

**背景**: 把全書投影成多維節奏曲線，讓讀者一眼看出作者的敘事節奏型態，也讓創作者可以檢查自己的節奏是否過於平均或集中。

**所需資料**:
- 章節列表（已有）
- Event 節點的 `chapter` 欄位（已有）
- `emotional_intensity`（B-023 ✅ 已完成）
- `narrative_weight`（B-033 ✅ 已完成）
- 新角色首次出現的章節（可從 KG 查詢）

**開發方法**:
- 純計算，無額外 LLM：per-chapter 統計以下指標：
  - 事件密度（該章事件數 / 全書平均）
  - 情感強度均值（`emotional_intensity` 平均）
  - kernel 事件比例
  - 新角色出現數
- 節奏型態識別：用滑動窗口（window_size = 3 章）找重複模式（可選，後期優化）
- 輸出：per-chapter 的多維指標陣列，供前端視覺化

**內容**:
- `backend/storysphere/services/rhythm_service.py`：計算節奏指標
- API 端點：`GET /books/:bookId/analysis/rhythm` — 返回章節節奏數據
- 前端：深度分析頁新增「敘事節奏」tab，渲染多維折線圖（Recharts）
- 可與情感溫度圖疊加顯示（同一 X 軸）

**前置依賴**: ~~B-023~~（✅ 已完成）、~~B-033~~（✅ 已完成）→ **前置依賴已全部滿足**

---

#### F-08 伏筆偵測器（「我沒注意到」）
**分類**: 分析功能 — Wave 2
**設計文件**: 不需獨立設計文件，邏輯簡單

**背景**: 找出「重要但低調」的事件節點——這些是作者埋下的伏筆，讀者往往在第一遍閱讀時忽略。選取邏輯完全基於 KG 結構性查詢，不需要額外 LLM。

**所需資料**:
- `narrative_weight = "kernel"`（B-033 ✅ 已完成）
- Event 的 chunk 出現次數（已有）
- EEP 的 `subsequent_event_ids`（已有）

**開發方法**:
- 純 KG 查詢，三個條件交集：
  1. `narrative_weight = "kernel"`（敘事上重要）
  2. 出現的 chunk 數少於全書事件的中位數（文本上低調）
  3. `subsequent_event_ids` 中有至少一個 `tension_signal = "explicit"` 的後續事件（因果上關鍵）
- 按「重要性 / 低調程度比值」排序輸出
- 不需要 LLM 額外調用

**內容**:
- `KGService.get_overlooked_events(book_id, top_n)` — 返回符合條件的事件列表
- API 端點：`GET /books/:bookId/analysis/overlooked-events`
- 前端：閱讀頁新增「伏筆提示」浮動按鈕（讀完後解鎖），點擊展開列表
- 每個伏筆項目：事件標題 + 出現章節 + 後來呼應的事件 + 原文引用段落

**前置依賴**: ~~B-023~~（✅ 已完成）、~~B-033~~（✅ 已完成）→ **前置依賴已全部滿足**

---

#### F-12 閱讀記憶外化系統
**分類**: 體驗功能 — Wave 2
**設計文件**: `docs/notes/reading_memory_design_notes.md`（待建立）

**背景**: 閱讀時的疑問、感想、預測是讀者最有價值的思考，但通常消散在閱讀過程中。F-12 讓這些標注與 KG 結構對齊，並在後續閱讀中主動提醒「你之前的疑問現在有答案了」。

**所需資料**:
- 用戶標注（新資料，需建立 `UserAnnotation` 資料結構）
- Chunk_id 與 Event 的對應關係（已有）
- Qdrant 向量搜索（已有）

**開發方法**:
- `UserAnnotation` 掛在 `chunk_id` 或 `event_id` 上，儲存用戶文字 + 標注類型（疑問 / 詮釋 / 預測）
- 主動提醒邏輯：用標注文字做向量搜索，當用戶進入新章節時，找語義相關的新事件，相關度超過閾值即推送提醒
- 本質上是「個人知識庫 + 觸發式推送」

**內容**:
- `backend/storysphere/domain/annotation.py`：`UserAnnotation` Pydantic model
- `backend/storysphere/services/annotation_service.py`：標注的 CRUD + 提醒觸發邏輯
- SQLite 存儲（沿用 `analysis_cache.py` 模式）
- API 端點：
  - `POST /books/:bookId/annotations` — 建立標注
  - `GET /books/:bookId/annotations` — 列出標注
  - `GET /books/:bookId/annotations/reminders?current_chapter={N}` — 取得當前章節相關的歷史標注提醒
- 前端：閱讀頁 chunk 旁新增標注按鈕 + 提醒浮動 toast

**前置依賴**: F-02（章節進度感知，用於觸發提醒）

---

#### F-16 角色派系偵測（Faction Detection）
**分類**: 分析功能 — Wave 2
**設計文件**: 不需獨立設計文件，邏輯可自文件內說明

**背景**: KG 已有豐富的角色關係邊（盟友、敵對、家族、友誼、成員隸屬），但目前沒有任何功能把這些關係聚合成「群體結構」。讀者無法快速看出故事中有哪幾個自然派系、派系間的對立態勢如何；創作者也無法確認自己設計的陣營是否在 KG 結構上有足夠的分化。F-16 用社群偵測演算法自動識別角色網路中的自然聚落，並計算派系間的合作 / 對立強度。

**所需資料**:
- KG Entity 節點（角色，已有）
- Relation 邊及 `weight` 欄位（ALLY、ENEMY、FAMILY、FRIENDSHIP、MEMBER_OF，已有）
- F-01 推論的 `potential_ally` / `potential_enemy`（已有，可選強化邊）
- F-02 章節快照（已有，可選：支援依章節切換派系視圖）

**開發方法**:
- 純圖演算，無額外 LLM
- 圖構建：從 KGService 取出全書角色間關係，建立 NetworkX 加權無向圖
  - 正向關係（ALLY、FAMILY、FRIENDSHIP、MEMBER_OF）→ 正權重邊（`weight = relation.weight`）
  - 敵對關係（ENEMY）→ 排除在社群偵測圖外（另行記錄作為派系間對立指標）
  - F-01 推論的 `potential_ally` → 低權重正邊（`weight × 0.5`，可選）
- 社群偵測：使用 `networkx.algorithms.community.greedy_modularity_communities()`（NetworkX 已引入，無需新套件）
  - 每個返回社群 = 一個派系候選
  - 凝聚力分數（cohesion score）= 社群內部邊總權重 / 社群節點數
- 孤立角色處理：與任何角色皆無關係邊的節點歸類為「獨立（unaffiliated）」，不強制分配派系
- 派系間關係計算：對每對派系，統計跨派系正向邊（合作度）與 ENEMY 邊（對立度），形成 N×N 矩陣
- 章節快照模式（可選，需 F-02）：依 `valid_from_chapter` / `valid_to_chapter` 篩選關係邊，支援派系演化時序查詢

**內容**:
- `backend/storysphere/domain/faction.py`：`Faction`、`FactionRelation`、`FactionAnalysis` Pydantic models
  ```
  Faction: id, label, member_ids, cohesion_score
  FactionRelation: source_faction_id, target_faction_id, cooperation, rivalry
  FactionAnalysis: factions, relations, unaffiliated_entity_ids, book_id, chapter (Optional)
  ```
- `backend/storysphere/services/faction_service.py`：圖構建、社群偵測、凝聚力與派系間關係計算
- `KGService` 新增 `get_character_relations(book_id, chapter)` 查詢方法（若現有方法不足）
- API 端點：
  - `GET /books/:bookId/analysis/factions` — 返回完整派系分析
  - `GET /books/:bookId/analysis/factions?chapter={N}` — 返回指定章節快照的派系狀態（需 F-02）
- 前端（兩處）：
  - 圖譜頁：cluster mode 的「社群」按鈕目前 `disabled`（V1 已上 placeholder + tooltip 指向 F-16）。F-16 完成後：解除 disabled、把 `frontend/src/services/kgClustering.ts` 的 `byCommunity()` 從 throw 換成 fetch `GET /books/:bookId/analysis/factions`、`SuperNode.label` 改取 `Faction.label`。視覺：handoff 規格的 multi-color dot ring + 派系歸屬顏色、敵對邊以紅色虛線標示。
  - 深度分析頁：新增「派系分析」tab，展示派系清單（成員列表 + 凝聚力分數）+ 派系間關係熱圖（Recharts `ResponsiveContainer` + 自訂格狀 cell）

**前置依賴**: KG 角色關係（已有）→ **前置依賴已全部滿足**；~~F-01~~（✅ 已完成，可選強化邊）；F-02（可選，用於章節快照模式）

**V1 銜接點**（2026-05-17）: KG 頁面 V1 重新設計已預留接點，見 `docs/plans/20260517-kg-page-redesign-v1-impl.md`。

---

### 🟠 Wave 3 — 深度分析功能

#### F-05 What-If 情境推演
**分類**: 分析功能 — Wave 3（核心體驗功能）
**設計文件**: `docs/notes/what_if_design_notes.md`（待建立）

**背景**: 讓讀者在 KG 的任意事件節點上標記「反轉此事件」，系統基於因果鏈和角色一致性約束，推演出一條替代敘事分支。多條分支可以並存，形成平行時間軸結構。

**所需資料**:
- F-02（章節快照）
- F-03（角色認識論狀態）— 作為角色反應的約束條件
- EEP 的 `prior_event_ids` / `subsequent_event_ids`（已有）
- CEP 的角色性格結構（已有）

**開發方法**:
四步驟流程：
1. **分歧點選擇**：用戶在事件節點標記「反轉此事件」，輸入反轉描述
2. **因果鏈傳播**：從分歧點往後做圖遍歷，找出所有 `prior_event_ids` 包含它的後續事件，標記為「受影響節點」
3. **角色一致性約束**：對每個受影響事件，用 CEP 性格結構做 LLM 判斷「這個角色在新情境下的反應是否合理」
4. **分支快照生成**：建立平行 KG 版本，受影響節點替換為新推演版本

分支管理：版本控制概念，每條分支有 `id`、`parent_event_id`（分歧點）、`divergence_description`。

**內容**:
- `backend/storysphere/domain/whatif.py`：`WhatIfBranch`、`WhatIfEvent` Pydantic models
- `backend/storysphere/services/whatif_service.py`：因果鏈傳播 + 一致性約束 + 分支生成
- API 端點：
  - `POST /books/:bookId/whatif` — 建立分歧點，觸發推演，返回 `task_id`
  - `GET /books/:bookId/whatif` — 列出所有分支
  - `GET /books/:bookId/whatif/:branchId` — 取得分支詳情（替代事件鏈）
  - `DELETE /books/:bookId/whatif/:branchId` — 刪除分支
- 前端：圖譜頁事件節點右鍵選單新增「建立 What-If 分支」
- 分支視覺化：主線 + 分支以不同顏色顯示，分歧點有特殊標記

**前置依賴**: F-02、F-03、~~B-023~~（✅ 已完成）

---

#### F-07 主題共鳴地圖
**分類**: 分析功能 — Wave 3
**設計文件**: `docs/notes/thematic_map_design_notes.md`（待建立）

**背景**: 把全書的 Concept 節點投影到語義空間，讓讀者一眼看出「這本書真正在談的幾組核心對立」，以及概念之間的共鳴結構。

**所需資料**:
- Concept 節點（已有）
- Concept 節點的向量嵌入（已有，Qdrant）
- 張力分析的 TensionLine（B-027 完成後有，可選）

**開發方法**:
- 從 Qdrant 取 Concept 節點的嵌入向量
- UMAP（或 t-SNE）降維到 2D，保留語義聚類結構
- 共現強度：計算 Concept 節點在相同 chunk 中的共現頻率，作為邊的權重
- 對立關係：優先從 TensionLine 的 `poles` 取得；若 TensionLine 未完成，用向量距離的遠端對作為候選
- 輸出：帶 2D 座標的節點列表 + 帶權重的邊列表

**內容**:
- `backend/storysphere/services/thematic_map_service.py`：降維計算 + 共現矩陣
- API 端點：`GET /books/:bookId/analysis/thematic-map` — 返回節點座標與邊
- 前端：深度分析頁新增「主題地圖」tab，以 Cytoscape.js（已引入）渲染語義散佈圖
- 節點大小 = 全書出現頻率，邊粗細 = 共現強度，顏色 = 概念類型

**前置依賴**: Concept 節點向量嵌入（已有）；B-027（TensionLine，可選強化）

---

#### F-10 敘事視角分析
**分類**: 分析功能 — Wave 3
**設計文件**: `docs/notes/narrative_focalization_design_notes.md`（待建立）

**背景**: 誰在講這個故事？哪些資訊是被刻意過濾的？F-10 分析每章節的敘事視角與資訊不對稱結構，讓讀者理解「故事是怎麼被講的」，讓創作者可以分析技法。

**所需資料**:
- 章節文本（已有）
- F-03（角色認識論狀態）— 用於計算資訊不對稱
- F-04（角色聲音指紋）— 用於對話歸屬識別（可選強化）
- Event 的 `participants` 欄位（已有）

**開發方法**:
- 每章節用 LLM 判斷主要敘事視角類型：`omniscient` / `limited_third` / `first_person` / `multiple`
- 資訊不對稱標記（需 F-03）：找「讀者知道但角色 X 不知道」的事件——即事件的 participants 不包含 X，但 X 是後來受影響的角色
- 輸出：per-chapter 的視角標記 + 資訊不對稱節點列表

**內容**:
- `backend/storysphere/services/focalization_service.py`：視角分類 + 資訊不對稱計算
- `backend/storysphere/domain/focalization.py`：`ChapterFocalization`、`InformationGap` models
- API 端點：`GET /books/:bookId/analysis/focalization` — 返回全書視角分析
- 前端：深度分析頁新增「敘事視角」tab，章節時間軸上標記視角類型 + 資訊不對稱熱點

**前置依賴**: F-03（資訊不對稱計算）

---

### 🔵 Wave 4 — 體驗型功能

#### F-09 未解決張力追蹤器
**分類**: 分析功能 — Wave 4
**設計文件**: 不需獨立設計文件，基於 TensionLine

**背景**: 追蹤全書結尾哪些對立張力仍處於開放狀態——這些可能是作者刻意留下的，也可能是未兌現的承諾。對讀者是閱後反思工具，對創作者是結構性檢查工具。

**所需資料**:
- TensionLine（B-027 完成後有）
- TEU 的 `local_resolution` 欄位（B-026 完成後有）

**開發方法**:
- 對每條 TensionLine，聚合其所有 TEU 的 `local_resolution` 狀態
- 書末層面：用 LLM 判斷 TensionLine 在最後幾章是否有對應的解決事件
- 輸出四種解決狀態：`resolved`（完全解決）/ `transformed`（部分轉化）/ `suspended`（懸而未決）/ `avoided`（被迴避）
- 解決度評分：0.0（完全未解決）~ 1.0（完全解決）

**內容**:
- `TensionService.analyze_resolution(book_id)` — 計算全書張力解決狀態
- API 端點：`GET /books/:bookId/analysis/tension-resolution`
- 前端：深度分析頁張力分析 tab 新增「解決狀態概覽」區塊

**前置依賴**: ~~B-026~~（✅ 已完成，詳見 BACKLOG_ARCHIVE.md）、~~B-027~~（✅ 已完成，詳見 BACKLOG_ARCHIVE.md）→ **前置依賴已全部滿足**

---

#### F-11 角色命運相似度
**分類**: 分析功能 — Wave 4
**設計文件**: `docs/notes/character_similarity_design_notes.md`（待建立）

**背景**: 計算不同角色的命運模式相似度——不是外貌或性格，而是他們經歷的事件弧線、在關係網中的位置、角色弧線類型的相似程度。跨書比較讓讀者看到更深的敘事原型。

**所需資料**:
- CEP（已有）
- 角色弧線（已有）
- 多本書的資料（跨書比較需要）

**開發方法**:
- 把 CEP 的結構化欄位（原型標籤、弧線類型、關係位置）編碼為特徵向量
- 單書內：用餘弦相似度計算角色間的命運模式距離
- 跨書比較：現有架構以 `book_id` 隔離，跨書查詢需新增 `cross_book` 查詢接口（`book_id=None` 則全庫查詢）

**內容**:
- `backend/storysphere/services/character_similarity_service.py`：特徵編碼 + 相似度計算
- API 端點：
  - `GET /books/:bookId/entities/:entityId/similar-characters?scope=book|all` — 返回相似角色列表（附相似度分數）
- 前端：角色分析頁新增「相似角色」區塊，可切換「本書內」/ 「跨書」範圍

**前置依賴**: CEP（已有）

---

#### F-13 Role Agent 系統
**分類**: 體驗功能 — Wave 4（核心沉浸功能）
**設計文件**: `docs/guides/PHASE_X_ROLE_AGENT.md`（待建立，因複雜度需完整 guide）

**背景**: 讓每個角色成為可以對話的 Agent，有認識論邊界（不知道他不該知道的事）、有聲音風格、有性格約束。支援四種使用模式：視角重述、單角色對話、多角色聊天室、世界觀建構中的角色測試。

**所需資料**:
- CEP（已有）
- F-03（角色認識論狀態）
- F-04（聲音指紋）
- F-02（章節快照，用於時間點鎖定）

**開發方法**:
Agent persona 組裝（system prompt 建構）：
```
CEP 的性格結構 + 原型標籤
+ 聲音指紋的量化指標與質性描述
+ 認識論狀態（已知事件、未知事件列表）
+ 時間點鎖定（第幾章之後的狀態）
```

認識論邊界強制：Agent 在對話中被問及「他不該知道的事」時，識別並以「不知情」方式回應，不洩露信息。

多角色聊天室：多個 Agent 實例並存，orchestrator 決定輪次（用戶指定角色 / 按對話自然流向），每個 Agent 的 persona 獨立。

**內容**:
- `backend/storysphere/agents/role_agent.py`：RoleAgent class，封裝 persona 建構 + 對話邏輯
- `backend/storysphere/services/role_agent_service.py`：Session 管理、多角色 orchestration
- `backend/storysphere/domain/role_session.py`：`RoleSession`、`RoleMessage`、`MultiRoleRoom` models
- SQLite 存儲：對話記錄（可掛回 KG 作為「平行事件」）
- API 端點：
  - `POST /books/:bookId/role-sessions` — 建立角色對話 session（指定角色 + 章節時間點）
  - `WS /ws/role-sessions/:sessionId` — WebSocket 對話串流
  - `POST /books/:bookId/role-rooms` — 建立多角色聊天室
  - `GET /books/:bookId/role-sessions/:sessionId/history` — 取得對話記錄
- 前端：獨立頁面 `/books/:bookId/roleplay`，支援切換三種模式（視角重述 / 對話 / 多角色室）

**前置依賴**: F-02、F-03、F-04

---

#### F-14 生圖整合（角色縮圖 + 場景圖）
**分類**: 體驗功能 — Wave 4
**設計文件**: `docs/notes/image_generation_design_notes.md`（待建立）

**背景**: 利用 CEP 的外貌描述和 Location 節點的場景描述，自動組裝圖像生成 prompt，為角色和場景生成視覺呈現。書級共享風格設定，保持視覺一致性。

**所需資料**:
- CEP 的外貌相關段落（已有）
- Location 節點描述（已有）
- EEP 的 `state_before/after`（已有，用於場景圖語境）

**開發方法**:
- Prompt 組裝：從 CEP 提取外貌相關句子 + 原型標籤 → 組成角色視覺 prompt
- 書級風格設定：用戶在書籍設定頁設定一次「美術風格 token」（如「水彩插畫，柔和色調」），所有角色和場景 prompt 自動附加
- 預設 API 接口：外部圖像生成服務（DALL-E 3 / Stable Diffusion API），抽象成可替換接口
- 生圖結果存入 `ImageAsset` 資料結構，與 entity_id 關聯

**內容**:
- `backend/storysphere/services/image_gen_service.py`：prompt 組裝 + API 調用 + 結果存儲
- `backend/storysphere/domain/image_asset.py`：`ImageAsset`、`BookVisualStyle` models
- 書籍設定：新增「視覺風格」設定欄位（書級）
- API 端點：
  - `POST /books/:bookId/entities/:entityId/generate-image` — 觸發角色縮圖生成
  - `POST /books/:bookId/locations/:locationId/generate-image` — 觸發場景圖生成
  - `GET /books/:bookId/visual-style` / `PUT` — 取得/更新書籍視覺風格
- 前端：角色詳情面板顯示縮圖，可觸發重新生成；圖譜頁角色節點可顯示縮圖

**前置依賴**: CEP（已有）；無其他硬依賴

---

### 🔴 Wave 5 — 整合型大功能

#### F-19 What-If 完整系統
**分類**: 整合 — Wave 5
**設計文件**: `docs/guides/PHASE_X_WHATIF_SYSTEM.md`（待建立）

**內容**: F-05 的延伸，加入多分支管理 UI、分支事件鏈的完整視覺化、分支之間的比對工具，以及將 Role Agent（F-13）帶入 What-If 分支進行角色對話驗證。

**前置依賴**: F-05、F-13

---

#### F-20 Role Agent 完整系統
**分類**: 整合 — Wave 5
**設計文件**: `docs/guides/PHASE_X_ROLE_AGENT.md`（同 F-13）

**內容**: F-13 的完整實作，加入視角重述模式（角色日記 / 回憶錄生成）、對話記錄掛回 KG 作為「平行事件」、多角色聊天室的完整 orchestration 邏輯。

**前置依賴**: F-13（F-02、F-03、F-04）

---

#### F-15 世界觀建構完整系統
**分類**: 整合 — Wave 5（新使用模式）
**設計文件**: `docs/guides/PHASE_X_WORLDBUILDING.md`（待建立）

**背景**: 把整個系統的使用方向翻轉——從「輸入文本 → 分析理解」變成「輸入設定碎片 → 系統幫你結構化、補全、檢查一致性」。用戶不需要完整小說文本，可以自定義角色卡、地點描述、事件設定，系統自動建構 KG、檢查邏輯、並提供 Role Agent 和 What-If 功能。

**所需資料**:
- 用戶輸入的設定素材（新輸入來源，非 PDF）

**開發方法**:
- 輸入模式：自由文本（設定片段）或結構化表單（角色卡 / 地點卡 / 事件卡）
- 走相同的 ingestion pipeline，來源從 PDF 換成用戶輸入文字
- 邏輯驗證器（核心）：KG 建好後，用圖查詢做：
  - 時間線一致性：事件的因果前提是否在時間上已成立
  - 能力邊界一致性：角色的能力或知識是否有未解釋的突變
  - 地理邏輯：涉及移動的事件時間是否合理（需有地點間距離設定）

**內容**:
- 前端：新增「創作工作坊」模式入口（與閱讀模式平行的使用路徑）
- `backend/storysphere/pipelines/worldbuilding_ingestion.py`：接受結構化設定素材，走改版的 ingestion pipeline
- `backend/storysphere/services/consistency_checker.py`：邏輯一致性圖查詢
- `backend/storysphere/domain/worldbuilding.py`：`CharacterCard`、`LocationCard`、`EventSetting` models
- API 端點：
  - `POST /worldbuilding` — 建立世界觀專案
  - `POST /worldbuilding/:projectId/entities` — 新增角色 / 地點設定
  - `POST /worldbuilding/:projectId/events` — 新增事件設定
  - `GET /worldbuilding/:projectId/consistency-check` — 執行邏輯驗證，返回矛盾列表

**前置依賴**: F-05（What-If）、F-13（Role Agent）、F-09（張力追蹤，可選）

---

---

## Infra 系列（基礎設施重構）

#### I-002 Migration CLI（部署模式遷移工具）
**性質**: Infrastructure Tooling
**目標**: 提供使用者在 lightweight / standard 兩個部署模式之間安全遷移資料的 CLI 工具

**背景**: I-001 建立了互斥的兩個部署模式，但使用者從 lightweight 升級到 standard 時需要將資料搬移：KG 從 NetworkX JSON → Neo4j；向量從 Qdrant local path → Qdrant service。此工具確保遷移有明確流程而非手動操作。

**指令骨架**:
```
python -m cli.migrate lightweight-to-standard
python -m cli.migrate standard-to-lightweight
```

**實作分階段**:
- **I-002 階段（本票）**: 建立 `src/cli/migrate.py` 骨架，接入現有 `services/kg_migration.py` 處理 KG 方向的 lightweight → standard（NetworkX → Neo4j）
- **I-003 後續**: Vector migration（Qdrant local path → Qdrant service）實作

**修改範圍**:
- 新增 `src/cli/` 目錄與 `migrate.py`
- 接入 `backend/storysphere/services/kg_migration.py`（已有 NetworkX → Neo4j 路徑）

**前置依賴**: I-001（`deploy_mode` 設定必須先就位）

---

## I 系列（多語系 / i18n）

**目標**: 前端支援繁體中文（zh-TW）與英文（en），後續語系按需新增。
**技術選型**: `react-i18next` + `i18next`（React 生態主流方案）
**字串規模**: 約 380–420 個不重複字串，分布在 33 個元件 / 頁面中

### 執行策略

```
I-01 (基礎設置) → I-02 (共用字串) → I-03..I-08 (頁面逐批遷移) → I-09 (框架索引)
```

FrameworksPage（I-09）獨立最後處理，因含 140+ 靜態內容字串（原型名稱、描述），需評估是否用 JSON content 檔而非一般 translation key。


**代表字串**: Jung 原型（天真者、孤兒、英雄…×12）、Schmidt 類型（×45）、英雄旅程階段（×12）、Frye 四季神話（×4）、Booker 七種情節（×7）、SEP 步驟（×7）

---

## 📋 狀態追蹤

### B 系列

| ID | 項目 | 優先 | 狀態 |
|----|------|------|------|
| B-011 | 生產環境配置 | 🟢 低 | 待開始 |
| B-014 | Local LLM 選型評估 | 🟡 中 | 進行中 |
| B-041 | 章節審閱 UI 專用 Design Token | 🟢 低 | 待開始（前置：章節審閱功能完成） |
| B-042 | 章節審閱頁面：段落 Role 自動識別 | 🟢 低 | 待開始 |
| B-043 | 閱讀頁：欄 2 章節搜尋 | 🟡 中 | ✅ 已完成 |
| B-044 | 閱讀頁：EpistemicSidePanel 入口可發現性優化 | 🟡 中 | ✅ 已完成 |
| B-045 | 敘事結構頁：英雄旅程主視圖 + 情節骨幹摘要 | 🟡 中 | ✅ 已完成 |
| B-046 | 建構概覽：節點觸發建構 CTA 對接 pipeline | 🟢 低 | 待開始（前置：對應 pipeline endpoint） |
| B-047 | 知識圖譜：非預設主題下節點類型識別困難 | 🟢 低 | ✅ 已解（design system v2 兩主題共用 entity 色環，問題不復存在） |
| B-048 | Neo4j Link Prediction 支援缺口 | 🟢 低 | 待開始（前置：B-011） |
| B-049 | 累積 Lint 債清理（ruff + eslint） | 🟢 低 | ✅ 已完成 |
| B-051 | WebSocket 連線身分認證 | 🟢 低 | 待開始（前置：部署方向 + 認證決策） |
| B-052 | log 中 neo4j/qdrant URL 遮罩 | 🟢 低 | 待開始（觸發：連線 URL 放帳密前） |
| B-053 | Secret 管理（prod） | 🟢 低 | 待開始（前置：部署方向確定） |
| B-054 | Splash 圖庫更換 + wording 同步 | 🟢 低 | 待開始（觸發：新圖檔備妥） |
| B-055 | 章節審閱 review-data 分章載入 | 🟢 低 | 待開始（觸發：上傳流程 UX 重構） |
| B-056 | Phase 1 文件解析 sub-progress | 🟢 低 | 待開始（觸發：大檔解析體感回報） |
| B-057 | 批次上傳（含跳過審閱選項） | 🟢 低 | 待開始（觸發：批次需求出現） |
| B-058 | 處理卡系統吉祥物欄 | 🟢 低 | 待開始（觸發：吉祥物資產備妥） |

### F 系列

| ID | 項目 | Wave | 前置依賴 | 狀態 |
|----|------|------|----------|------|
| F-01 | 隱性關係推論（Link Prediction） | 加分項 | — | ✅ 已完成 |
| F-02 | 進度感知 KG（章節快照） | Wave 1 | B-023 migration | ✅ 已完成 |
| F-03 | 角色認識論狀態 | Wave 1 | F-02 | ✅ 已完成 |
| F-04 | 角色語音側寫（Voice Profiling） | Wave 1 | — | ✅ 已完成 |
| F-05 | What-If 情境推演 | Wave 3 | F-02、F-03 | 待開始 |
| F-06 | 敘事節奏分析器 | Wave 2 | B-023、B-033 | 待開始 |
| F-07 | 主題共鳴地圖 | Wave 3 | Vector embeddings | 待開始 |
| F-08 | 伏筆偵測器 | Wave 2 | B-023、B-033 | 待開始 |
| F-09 | 未解決張力追蹤器 | Wave 4 | ~~B-026~~、~~B-027~~（均已完成）| 待開始 |
| F-10 | 敘事視角分析 | Wave 3 | F-03 | 待開始 |
| F-11 | 角色命運相似度 | Wave 4 | CEP | 待開始 |
| F-12 | 閱讀記憶外化系統 | Wave 2 | F-02 | 待開始 |
| F-13 | Role Agent 系統 | Wave 4 | F-02、F-03、F-04 | 待開始 |
| F-14 | 生圖整合 | Wave 4 | CEP | 待開始 |
| F-15 | 世界觀建構完整系統 | Wave 5 | F-05、F-13 | 待開始 |
| F-16 | 角色派系偵測（Faction Detection） | Wave 2 | KG 關係（已有） | 待開始 |
| F-17 | UI 主題風格切換系統（B&W Theme System） | Wave 2 | — | ✅ 已完成 |
| F-18 | 系統啟動 Splash Screen | Wave 2 | — | ✅ 已完成 |
| F-19 | What-If 完整系統 | Wave 5 | F-05、F-13 | 待開始 |
| F-20 | Role Agent 完整系統 | Wave 5 | F-13（F-02、F-03、F-04） | 待開始 |

---

### Infra 系列

| ID | 項目 | 優先 | 狀態 |
|----|------|------|------|
| I-001 | 輕量化部署模式（Lightweight Deployment Mode） | 🔴 高 | ✅ 已完成 |
| I-002 | Migration CLI（KG 方向骨架） | 🟡 中 | 待開始 |
| I-003 | 主要 LLM Provider 可配置化 | 🔴 高 | ✅ 已完成 |

### I 系列

| ID | 項目 | 字串數 | 工作量 | 狀態 |
|----|------|--------|--------|------|
| I-01 | 基礎設置（react-i18next + 語言切換） | — | ~2h | ✅ 完成 |
| I-02 | 共用字串（common.json） | ~20 | ~1h | ✅ 完成 |
| I-03 | 導覽 & 書庫（nav.json + library.json） | ~45 | ~1.5h | ✅ 完成 |
| I-04 | 上傳 & 處理（upload.json） | ~25 | ~1h | ✅ 完成 |
| I-05 | 深度分析（analysis.json） | ~60 | ~2h | ✅ 完成 |
| I-06 | 張力 & 時間軸（analysis.json） | ~55 | ~2h | ✅ 完成 |
| I-07 | 圖譜 & 閱讀器（graph.json + reader.json） | ~35 | ~1.5h | ✅ 完成 |
| I-08 | 其餘頁面（settings.json + chat.json） | ~75 | ~2h | ✅ 完成 |
| I-09 | 框架索引頁（frameworks.json，特殊處理） | ~142+ | ~3h | ✅ 完成 |

**總計**: 約 380–420 個字串，估計 ~14–16 小時工作量

---

> ✅ **ID 撞號已解（2026-06-30）**：原先 Active backlog 與 BACKLOG_ARCHIVE.md 有三組 ID 撞號，已重編 Active 側的開放項：建構概覽 CTA B-044→**B-046**、KG 節點識別 B-043→**B-047**、Neo4j Link Prediction B-035→**B-048**。已歸檔的閱讀頁 B-043/B-044 與坎伯英雄旅程 B-035 保留原號。同時補回先前漏列於狀態表的 B-042。

**維護者**: William
**最後更新**: 2026-07-11（新增 B-055～B-057：上傳流程強化的後續項目；B-051 範圍縮至 /ws/chat）
