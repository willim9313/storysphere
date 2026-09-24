# StorySphere — 開發 Backlog

**用途**: 記錄已識別但尚未排入 Phase 的開發項目
**更新日期**: 2026-09-13

> 已完成項目歸檔於 [BACKLOG_ARCHIVE.md](BACKLOG_ARCHIVE.md)

---

## B 系列（既有）

### 🔴 高優先（功能中斷）

#### B-078 象徵的事件依附與貫穿度共線（`W.ev` 權重定義待決）

**背景**: 2026-08-07 API 整併時提出，見
`docs/plans/20260807-symbols-api-consolidation.md` 第 4 節。當時標為「需裁示」，
2026-08-10 收攏為本條目 —— **決定暫不實作**。

`assemble_sep()` 的事件關聯是**章節層級**的：

```python
chapters_with_imagery = set(entity.chapter_distribution.keys())
event_ids = [ev.id for ev in events if ev.chapter in chapters_with_imagery]
```

即「這個意象出現過的章，其中所有事件」，不是「與這個意象同段的事件」。`Event` 沒有
paragraph／chunk 參照，段落層級目前做不到。

**後果**: 事件依附與貫穿度高度共線 —— 出現在越多章 → 涵蓋越多事件。前端把它當成權重
0.18 的獨立訊號（`symbolSignals.ts` 的 `W.ev`），實際上有一部分只是 `span` 的重複計票。

**已做的**: `co_occurring_event_count` 只計正文章節（修掉前置頁事件混入）。

**暫不做的理由**: 用 `event.participants ∩ 該意象的共現實體` 收斂成真正的「同場事件」
資料是現成的，但這是**新的度量定義**，超出設計要求。決議 06 校準時把 `W.ev` 調低，
是可接受的收法。

**觸發時機**: 決議 06 的權重校準（屆時一併決定是調權重還是換定義）。

---

### 🟡 中優先（功能完善）

#### B-080 後端 deferred import 分類（結論：不搬）

**背景**: 2026-08-19 執行「後端結構性殘留清理」計畫 §3 時做的分類。全後端有
276 處函式內 import（`# noqa: PLC0415`），讀起來吵，且曾有人開過分支
`refactor/hoist-deferred-imports` 準備搬上去 —— 那個分支零 commit，開了沒做。

**計畫明訂第一步是分類，不是搬動**，因為成因不同、處置也不同。分類結果：

| 成因 | 處數 | 佔比 | 該怎麼辦 |
|---|---|---|---|
| 第一方（`storysphere.*`） | 206 | 75% | **不能搬** —— 迴避循環 import 與延後建構服務。熱點是 `api/deps.py`（32）、`workflows/ingestion.py`（14）、`api/main.py`（13） |
| 重量級三方（langchain / langgraph / torch / qdrant / neo4j …） | 44 | 16% | **不該搬** —— 刻意縮短冷啟動 |
| 輕量（asyncio / datetime / time / json / functools …） | 26 | 9% | 唯一可搬的，但扣掉 yake / pypdf / docx / ebooklib / lxml 這些同樣屬可選解析器的，實際約 **15 處** |

**結論：關掉這一項。** 真正可搬的約 15 / 276 ≈ **5.4%**，動它要逐處查證是否
真的無循環依賴，風險與收益不成比例；而讀起來吵的那 75% 正是**不能**動的那批。

**待辦（只剩收尾）**:
- 刪掉空的 `refactor/hoist-deferred-imports` 分支，免得下次又有人以為這件事待辦
- 若日後真的要動，只碰上表第三列，且必須逐處確認無循環依賴

**觸發時機**: 不再觸發。本條目記錄的是「查過了，不做」。

---

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

#### B-041 章節審閱 UI 需要專用 Design Token
**背景**: 章節審閱功能（`/upload/review/:bookId`）的視覺語言（切分點指示線、章節 tag、標題高亮）暫時沿用 `--entity-con-*`（靛紫）token，但這組 token 在 manuscript / minimal-ink / pulp 三個主題下會被覆蓋為灰色，紫色語意在非預設主題下失效。

**待辦內容**:
- 在 `frontend/src/styles/tokens.css` 新增 `--review-*` token 系列（建議：`--review-bg`、`--review-border`、`--review-fg`、`--review-dot`）
- 四個主題（default / manuscript / minimal-ink / pulp）各補一組值
- 同步更新 `docs/DESIGN_TOKENS.md` 對照表
- 章節審閱元件（ChapterReviewPage、段落卡片的 title_span highlight）改用新 token

**2026-09-13 結案——前提已消失**: 上述背景寫於四主題時代。現在 `tokens.css` 只有
**Warm（`:root`）+ Ink（`[data-theme="ink"]`）兩個主題**，manuscript / minimal-ink / pulp
都不存在；而 `--entity-con-*` 四個 token **只定義在 `:root`，ink 沒有覆蓋它們**（實測
`rg "entity-con" tokens.css` 只命中 L74–77）。所以「紫色語意在非預設主題下失效」不成立。

這與 B-047「非預設主題下節點類型識別困難」結案的是同一條理由（design system v2 兩主題
共用 entity 色環）。日後若再擴主題並覆蓋 entity 色環，重開新票。

**觸發時機**: ~~章節審閱功能完成後的 UI 視覺 QA~~ —— 不再適用。

**前置依賴**: 無（已結案）

---

#### B-045 敘事結構頁：英雄旅程主視圖 + 情節骨幹摘要 ✅ 已完成（2026-06-01）
新增 `/books/:bookId/narrative` 頁，英雄旅程四佈局可切換 + 情節骨幹摘要，封裝 `api/narrative.ts`，BookNav 加入入口。詳見 `docs/BACKLOG_ARCHIVE.md`。

---

#### B-046 建構概覽：節點「觸發建構」CTA 對接 pipeline endpoint ✅ Phase 1 已完成（2026-08-11）
> 原 B-044，2026-06-30 重編：原號與已歸檔的「閱讀頁 EpistemicSidePanel 入口優化」撞號。

Phase 1 接上 12 個節點（summaries / keywords / symbols / kg_entity·concept·relation·event /
cep / character_analysis_result / eep / causality_analysis / impact_analysis），含 token 確認
視窗與 task 輪詢；同時修好 rerun 端點不落盤章節摘要與關鍵字的既有 bug。詳見
[BACKLOG_ARCHIVE.md](BACKLOG_ARCHIVE.md)。

**Phase 2 待辦（仍為 disabled 占位的節點）**:
- `tension_lines` / `tension_theme` / `hero_journey_stage` / `temporal_analysis`：端點已存在
  （`/tension/analyze`、`/tension/theme/synthesize`、`/narrative/hero-journey`、`/narrative/temporal`），
  只需補進 `BuildOverviewPage.tsx` 的 `NODE_TO_TRIGGER` 與 i18n `unraveling.cta.node.*`
- `narrative_structure`：對應的 `POST /narrative/classify` 在書已失去 event EEP 快取時會覆寫 KG 的
  kernel 權重，放進一鍵 CTA 太危險。需先讓 classify 對缺快取的情況安全，才能接上
- `teu` / `voice_profile` / `chronological_rank` / `kg_temporal_relation`：無對應批次端點，需先新增後端

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

#### B-048 Neo4j 能力缺口（切過去等於整個圖譜功能面停擺）
> 原 B-035，2026-06-30 重編：原號與已歸檔的「坎伯英雄旅程 LLM 結構對應」撞號。
> **2026-09-05 大幅改寫。** 原標題與內容只記 Link Prediction 一項，實際盤點後
> 發現有三項，而且漏記的兩項比記下來的那項嚴重。原文的診斷沒有錯，錯在範圍。

**原本的框架已被推翻**: 這條目原先寫著「這是輕量 NetworkX vs 完整 Neo4j 功能分拆的
**第一個具體案例**。後續所有新功能若有類似的 backend 差異，均需在此記錄」。
那條原則**沒有被遵守**——2026-09-05 盤點時，Neo4j 已有三項能力缺口，只有一項在案，
而漏掉的兩項打掉的是知識圖譜頁本身，不是附屬功能。原則寫下來但沒有機制守，
結果就是它自己記錄的那一項反而是影響最小的。

**完整清單（2026-09-05）**:

| 缺口 | 位置 | 停擺的功能 |
|------|------|-----------|
| `list_relations` | `kg_service_neo4j.py` `raise NotImplementedError` | 知識圖譜頁、角色指標、派系分析、推斷關係 |
| `get_snapshot` | 同上 | 知識圖譜頁、認知狀態、派系分析 |
| Link Prediction 演算法耦合 | `link_prediction_service.py:62` 直接讀 `self._kg._graph` 私有屬性取 networkx 圖物件 | 推斷關係 |

`KG_DEPENDENT_FEATURES` 目前列了 5 個功能（`graph` / `character_metrics` /
`factions` / `link_prediction` / `epistemic_state`），**5 個全部被牽連**。
切到 Neo4j 不是「部分功能降級」，是整個圖譜功能面停擺。

**為什麼沒人發現**: `tests/services/test_kg_backend_parity.py` 驗的是結構——抽象覆蓋、
簽章一致、無未宣告分歧。那兩個方法簽章正確、通過每一項檢查，執行時才拋。
一套全綠的 parity 測試，旁邊擺著一個服務不了圖譜頁的後端。
而 `POST /kg/switch` 只驗連線不驗能力，切過去回一句 `"Switched to neo4j."`。

**已完成（不含任何 Neo4j 實作）**:
- **2026-09-05 PR #83** —— `KGServiceBase.UNSUPPORTED` 把缺口寫成介面的一部分，
  值是 `KG_DEPENDENT_FEATURES` 的 id 而非散文（翻譯歸前端、對照歸後端）；
  parity 測試 AST 掃描兩個實作，釘住宣告等於原始碼實際會 raise 的成員，雙向都擋。
  下一個缺口無法再靜默增加。
- **2026-09-05 PR #84** —— `GET /kg/status` 的 `unsupportedByMode` 回報每個可選後端
  的缺口（讀類別而非 instance，才答得出「切過去會怎樣」）；設定頁在**按下之前**
  就列出會停用哪些功能。

**待辦（真正的實作，尚未動）**:
- `list_relations` 的 Cypher 實作
- `get_snapshot` 的 Cypher 實作
- `KGServiceBase` 新增抽象方法 `get_neighbor_ids(entity_id: str) -> list[str]`，
  讓 Link Prediction 的算法層與 backend 解耦
  - NetworkX：用現有圖結構實作
  - Neo4j：用 `CALL gds.alpha.linkprediction.adamicAdar(...)`
- `LinkPredictionService.run_inference()` 改用抽象方法，**不再讀 `self._kg._graph`**
  這個私有屬性
- 每補完一項，把它從 `Neo4jKGService.UNSUPPORTED` 移除——parity 測試會擋住
  陳舊宣告，所以忘了拿掉會紅

**前置依賴**: B-011（Neo4j docker-compose 環境）。沒有可跑的 Neo4j 就驗不了 Cypher，
這也是上面「已完成」的兩項刻意都不碰實作的原因。

**這次學到的**: 「原則寫在 backlog 但沒有機制守」等於沒有。B-048 自己就是反例——
它明文要求後續缺口都要記在這裡，然後兩個缺口在它眼皮底下長出來沒人記。
PR #83 的作法（把宣告放進生產程式碼、用測試釘住宣告等於現實）才是那條原則的
可執行版本。

---

#### B-011 生產環境配置
**內容**:
- Dockerfile + docker-compose（API + Qdrant + 可選 Neo4j）
- PostgreSQL 遷移（`database_url` 已支援，需測試）
- `uvicorn --workers N` 配合 B-003 TaskStore 持久化

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

#### B-053 Secret 管理（prod）
> 來源：2026-07-08 防禦性安全稽核（低風險項）。
**背景**: GEMINI / Langfuse key 現存於 `.env`（已 gitignore、本機夠用）。正式對外部署時應改用 secret manager，避免明文檔案外流。

**待辦內容**:
- 依部署階梯擇一：單機 / Docker → pydantic-settings `secrets_dir` 或 Docker secrets；GCP（用 Gemini 最順）→ GCP Secret Manager。
- 程式碼側可加 `secrets_dir` 支援；建立 secret 儲存與 IAM 為 ops 動作。

**觸發時機**: **部署方向（單機 / 雲）確定後**。

**前置依賴**: 部署方向確定。

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

#### B-059 派系語意命名（LLM 為 F-16 社群取名）
**背景**: F-16 派系偵測（#6d）定案為純圖計算、無 LLM，`label` 一律是「Faction N」佔位字串；圖譜頁社群模式與角色分析頁總覽（20260716 翻新計畫的派系分群）都只能以 `topMemberNames` 組合稱呼（「寇仲、徐子陵 等 12 人」）。若由 LLM 依成員與關係取語意名稱（「宇文閥」「宋閥」），兩頁可同時受益。

**待辦內容**:
- 前置問題：分群結果隨 `resolution` / `min_cluster_size` / `chapter` 參數變動，派系無穩定身分——需先決定命名策略：(a) 只對預設參數的分群命名並快取；(b) 以成員集合 hash 當 key 快取；(c) 每次現算（LLM 成本）
- 後端：`FactionService` 之上加命名層（LLM 取名 + 快取），#6d response 的 `label` 填語意名稱（保留佔位字串為 fallback）
- 前端：圖譜頁 ClusterOverviewPanel 與角色頁總覽派系卡自動受益，無需改版面
- API contract：#6d `label` 欄位語意更新

**觸發時機**: ~~角色頁總覽派系分群（20260716 計畫 #1）上線後~~ —— **前置已滿足**（見下），現在的觸發條件只剩「佔位稱呼被回報不夠用時」。

**前置依賴（2026-09-13 查證：已滿足）**: `docs/plans/20260716-character-page-revamp.md` #1 已於 2026-07-17 `cd7c315` 上線——`CharacterOverviewLanding` 已在跑 `useFactions()` + `applyFactionsAndMetrics()`，`QuadrantView` 也吃 `factions`。與 F-16 同一類漂移：被另一張票順手完成，沒人回頭更新這裡。

---

#### B-060 原型篩選 facet 改以 archetype id 比對
**背景**: 角色分析頁原型篩選（#14）的計數是前端把 `analyzed[].archetypes` 的**名稱字串**與 `frameworksData.ts` taxonomy 名稱做精確相等比對。名稱隨語言而異（後端存書籍語言的 config 名稱、前端 taxonomy 取 UI 語言），所以「EN 介面 + 中文書」時全部計數為 0、篩選恆空。2026-07-18 已將前端 taxonomy 與後端 config 名稱逐字對齊（同語言下正確），跨語言問題屬結構性殘留。

**待辦內容**:
- 後端 #6a `analyzed[].archetypes` 增列 archetype **id**（config 已有 `id` 欄位；`resolve_archetype_name` 處同步回傳 id）
- 前端 `ArchetypeFilterDropdown` facet 與 `archFilter` 篩選改以 id 比對，顯示仍用 taxonomy 名稱
- API contract #6a 同步更新

**觸發時機**: EN 介面使用需求出現時。

---

#### B-063 關係圖角色名冊比對支援 KG 別名
**背景**: 角色分析頁關係 ego 圖的節點可點擊性（橘圈）取決於 CEP relation target 名稱與角色名冊（#6a analyzed+unanalyzed）**精確字串相等**。CEP 寫的名字若是別名 / 異體字（實例：傅君婥在徐子陵關係圖中呈灰圈不可點），即使該角色存在也無法跳轉。

**待辦內容**:
- 名冊比對擴充 KG entity 的 `aliases`（#6a 或另取 entity alias 對照表），name → id lookup 涵蓋別名
- 先查證傅君婥在 KG 中的實際 entity 名稱與 alias 記錄，確認漏配原因

**觸發時機**: 關係圖灰圈誤判回報累積時。

---

#### B-071 張力頁格點與迷你柱狀圖無非視覺替代
**背景**: 2026-08-05 翻新已加入完整鍵盤快捷鍵（J/K/A/X/E/Space/V/Esc）與 `aria-pressed` / `aria-label`，比舊版好很多，但 P1-9 未完全解決。

**✅ 已完成（2026-08-21）**:

- **抽屜焦點處理**。B-070 把抽屜在 1080px 以下改成 overlay 之後，這條從「未定」變成有實害：
  被蓋住的主體沒有 `inert` 也沒有 focus trap，tab 會走進看不見的內容。改法是 `.tn-shell-main`
  在 overlay 且抽屜開啟時掛 `inert`，開啟時記住原焦點並移入抽屜、關閉時歸還。
  **刻意不是傳統 focus trap**：Tab 走完抽屜會到左側導覽列，而導覽列在 x<48、沒有被抽屜蓋住，
  鎖住它反而是敵意行為。`inert` 只拿掉真正被遮蔽的內容，比硬 trap 更貼近實際的視覺狀態。
  用平台原生 `inert`（React 19 支援 boolean prop），未裝 focus-trap 套件、未新增 `useMediaQuery`
  hook——照 `useEscapeKey` 註解自陳的紀律，一個呼叫端先內聯。
- **非視覺替代**。格子的 `aria-label` 逐個列出強度、裝飾用的 `<i>` 柱子全標 `aria-hidden`。

**原記載有誤，一併更正**: 本條原寫「鍵盤與螢幕閱讀器取不到背後的 `tension_description`」——
**這句是錯的**。`tension_description` 在 `TensionTEUInspector.tsx:145` 與
`TensionReviewDrawer.tsx:148` 都是**可見的 `<p>` 純文字**，一直讀得到。格子的 `aria-label`
（`tension.grid.cellLabel`）也早就存在，會念出章節與 TEU 數。真正缺的一直是**強度**——
柱子的高度與 low/mid/high 色帶完全沒有非視覺出口。

`TensionTEUInspector` 的迷你柱只標 `aria-hidden`、未加朗讀內容：展開該章之後每個 TEU 的強度
本來就是可見文字（`:131` 的 `formatIntensity`），在收合標題再念一串只是把同樣的數字念兩遍。
格點格子的情況不同，那裡的強度沒有其他出口。

**剩餘待辦**:
- Ink 主題下 success / warning / error 會塌成同一個黑，**語意不能只靠顏色**——已拆為 **B-086**，
  因為那是全站議題（stepper 已用「圓形 machine / 方形 gate」處理，其餘狀態指示尚未逐一檢查），
  且會動到 `tokens.css` 與 `DESIGN_TOKENS.md`，範圍與本條不同。

**觸發時機**: 本條剩下的部分已移出，見 B-086。

---

#### B-099 `LLMClient.get_fallback` 的暫緩理由已過期，全系統實際上沒有任何 fallback

**背景**: B-090 把 `get_fallback` 列為零引用但**暫緩不刪**，理由記為「很可能就是
B-075『fallback 鏈是壞的』的成因」。2026-09-06 走查 core/ 時複查，**那個理由已經
不成立**：B-075 早在 2026-08-20 結案（`is_configured()` 收斂、行內註解清除、
`_has_key` 改為純委派）。

**但結論仍然是不刪，只是換了個理由——而且是更強的理由**:

`get_with_local_fallback()`（15 個服務全走它）的鏈是 **cloud → local**，而 B-075
修好之後 `has_local` 正確回報 False，所以它回傳的是**裸的 primary、`fallbacks=[]`**。
也就是說：**現在全系統每一條 LLM 路徑都沒有任何 fallback**。這是 B-075 修正的正確
結果（原本掛著的是一個必定失敗的假 local），但它同時意味著跨雲 fallback 從未存在過。

`get_fallback()` 是**唯一**實作「換另一家雲端」的程式碼（gemini → openai →
anthropic，排除 primary），而 `get_with_local_fallback` 的 docstring 明寫
「Multiple cloud providers are NOT chained」。所以它不是死碼，是**寫好沒接的能力**，
屬 B-091 的第 3 種結局。

**這正是 B-073 缺的那一塊**: Gemini 對「手」回報 PROHIBITED_CONTENT 時需要的是
**換一家 provider**，不是重試同一家（`RETRYABLE` 刻意不含 `LLMResponseBlocked`，
理由正是「同一家會再拒一次」）。local 那條路在沒有本地模型時等於沒有。

**決定：暫不接，但理由換掉了**（2026-09-07）

使用者的判斷：**一般使用者不會為了備援去準備好幾家 LLM 的 API key**。跨雲 fallback
的前提是「手上有第二把可用的 key」，而那個前提在這個專案的實際使用情境下多半不成立
——`.env` 目前也確實只有 Gemini 是真的設定好的（OpenAI / Anthropic 是 placeholder，
已被 `is_configured()` 正確判為未設定）。接了也不會生效，直到有人填一把真的 key。

**所以 `get_fallback()` 繼續留著不刪，但這次的理由是有效的**：它是唯一的跨雲切換
實作，而「要不要跨雲」是一個懸而未決的產品問題，不是遺留物。**與 B-090 當初記的
理由（「很可能是 B-075 的成因」）不同，那個已經過期；這個不會。**

**接線的技術前提（查過，留給日後）**: 不能只是把 `get_fallback()` 塞進
`with_fallbacks([...])`。`with_fallbacks` 只在 LLM 物件**拋例外**時切換，而 Gemini 的
封鎖不是例外——langchain 收到的是空的 `AIMessage`，是 `llm_text(response)` 在 invoke
**回傳之後**才看出 `block_reason` 並拋 `LLMResponseBlocked`，那個位置在 LLM 物件外面。
真正要改的是呼叫層：捕捉 `LLMResponseBlocked` → 換 provider → 重跑一次。呼叫點分布是
**20 處走 `call_llm()`**（改一個地方就全涵蓋，且象徵詮釋那條在內）、**13 處直接
`ainvoke`**（各自處理，或先收斂）。

**這對 B-073 的意思**: 「手」的詮釋在可預見的未來不會靠 fallback 解決。剩下的槓桿是
**改提示讓 Gemini 不拒絕**，或接受它產不出來。前者沒試過。

**觸發時機**: 待排。若哪天有第二家 provider 是實際可用的，第一步只需改 `call_llm()`。

**觸發時機**: 待排。與 B-073 綁在一起決定。

---

#### B-121 每回合都把 23 個工具重講一遍，佔 chat 輸入 token 的七成

**背景**: 2026-09-12 量 §3-4 的工具選擇基線時，順帶量到的成本結構。原本的假設是
「深度分析工具比其他工具貴得多」（走查 §3-4 原文），**那個假設不成立**——
`get_global_timeline`（34,224 token）與 `get_character_arc`（32,546）都比
`analyze_character`（32,231）貴，而 `analyze_event` 只花 12,714，與最便宜的無異。

**真正的成本是固定開銷**：每次帶工具目錄的呼叫地板 **4,145 token**，其中約 3,200 是
23 個工具定義、約 900 是系統提示。24 題共 48 次這種呼叫，**光地板就 198,960 token，
佔全部 input 285,084 的 70%**。

> **選哪個工具對成本幾乎沒有影響；有影響的是每回合把 23 個工具重講一遍。**

**裁剪已實測（2026-09-12）**，閱讀頁情境下拿掉 8 個明顯不相關的工具
（`get_relation_stats` / `get_relation_paths` / `get_subgraph` / `compare_entities` /
`compare_characters` / `extract_entities_from_text` / `gen_summary` /
`get_global_timeline`）：

| | 準確率 | input token 中位 |
|---|---|---|
| 23 工具 | 15/17 = 88% | 4,146 |
| **15 工具** | **15/17 = 88%** | **2,982** |

**選擇改變的題數：0。** 每次呼叫省 **1,164 token = 28%**，準確率一個字沒動，
N=3 之下三次也全同。

**量測上的限制**: 題庫刻意覆蓋全部 23 個工具（為了量準確率），所以裁掉 8 個會讓
7 題失去正解，只能比倖存的 17 題。

**還沒做的是設計不是量測**: 需要一份「頁面 → 工具子集」的對照表。`ChatState` 已經
帶 `page_context`，資料在手上；難的是決定每頁該給哪些，而**給少了會讓某些問題無解**
——那不是準確率下降，是能力消失，兩者要分開看。

**與供應商快取的關係**: 系統提示 **97% 穩定**，會變的只有尾巴 84–285 字（頁面脈絡、
聚焦實體）且已在最後面，形狀對快取有利。但 `gemini-2.5-flash` 的顯式內容快取有最低
token 門檻、4,145 大概不夠格；隱式快取可能適用，然而 langfuse 的 usage 沒有 cached
token 欄位，**本次無法判斷有沒有命中**。裁剪不依賴供應商，兩條路不互斥。

**量測見** `docs/plans/20260912-chat-tool-selection-baseline.md`（該份第七節把這一項
列為「沒量」的缺口——依 plans 不回頭修改的紀律，補上的結果記在這裡）。

**觸發時機**: 想降低 chat token 成本時；或 chat 工具數再往上加時（每加一個，
每回合每次呼叫都變貴）。

---

**✅ 已修（2026-09-13）——讓那句保證變成真的，而不是刪掉它**

`tool_registry.py:96` 寫著「a caller that has no AnalysisAgent still gets a working
agent, minus these two」。有兩條路：拿掉選填讓它失效，或讓它成立。**選後者**——
前者會弄壞 7 個既有測試與一個刻意的契約（`test_chat_tool_wiring.py` 明寫
「選填是刻意的」），而且**同一個機制正是 B-121 需要的**：按頁面裁剪工具時，提示
也得跟著裁。

`prune_prompt_for_tools(prompt, bound)`：工具沒綁上時，把提示裡提到它的路由建議拿掉。

**按子句裁，不按行裁。** 一行可以路由到兩個工具：

```
- For "What happened in event X?" … → get_event_profile (full data, no LLM);
  for deep causal/impact analysis → analyze_event
```

整行砍掉會連帶拿走 `get_event_profile` 的建議——那是用一個缺陷換另一個。
子句以 `;` 分隔，整行子句都被砍才砍掉該行。全 23 工具在場時**提示一字不動**
（裁剪是零成本的）。

**哨兵測試抓到我自己的守衛是空轉的。** 第一版的關鍵測試直接呼叫
`build_context_prompt(state, lang, bound)` 並自己把 `bound` 餵進去——那測的是裁剪
函式，不是「agent 有沒有把自己綁定的工具傳下去」。把 `chat_agent.py` 的接線拆掉，
那一版 6 條全過。改走 `_build_messages` 的真實路徑後才會紅。
**守衛要走使用者走的那條路，不是走它自己鋪的那條。**

**驗證**: 六條測試（裁剪三條、接線兩條、外加一條確認「沒有 agent 時確實會少那兩個」，
否則接線那條是空轉的）；兩種哨兵拆法都確認會紅；後端重啟後實打 chat 兩題正常。

---

**判讀（2026-09-13）——量完之後決定不照原設計實作**

三條理由，按份量排：

**一、省下的錢接近零。** 每題 input 11,878 token，裁 8 個工具省 2,328。以 Flash 的
input 價格估（$0.10–0.30 / 1M），**每題省 $0.0002–0.0007**——要省下 100 美元得問
**14 萬到 43 萬題**。

**二、代價是能力，不是準確率。** 「裁到 15 個工具準確率不變」是真的，但那只證明
**留下來的工具選得一樣準**。真正的代價是：在閱讀頁問「比較伊內絲和泰奧多爾」而
`compare_characters` 被裁掉了——那不是答得比較差，是**答不出來**。

**三、那張對照表目前只能用猜的。** 「哪一頁該給哪些工具」需要知道使用者在各頁實際
問什麼。chat 不落盤、`token_usage` 裡一筆 `chat` 都沒有、langfuse 2026-09-12 才開。
**等 langfuse 累積一段真實使用之後再談這張表**，在那之前排出來的是我的想像。

**描述精簡也不划算**: 描述佔目錄的 50%（8,185 字元），但其中真正重複的只有
「`Input: …`」那段（14%，把參數 schema 用散文再講一遍）與 6 個工具的「Returns …」
（5%）。**合計只省整個目錄的 7–9%，卻要改 23 個檔**。USE / DO NOT USE / 交叉指引
不能動——那正是實測擋住過度選擇的東西。

**成立且未過期的部分**: 目錄佔 chat 輸入 token 的 **70%** 是事實，量法見 plans。
若哪天 chat 用量大到成本有感，回頭看 B-122 而不是這一項。

---

#### B-123 角色分析頁的左欄不隨視窗收縮，窄螢幕下主區只剩 114px

**背景**: 2026-09-13 做 B-065 的瀏覽器實測時撞見，當時判定超出該票範圍、先記著。

**實測**（`.ca-left` 與 `.ca-content` 的實際寬度）:

| 視窗寬 | 左欄 | 主區 | 橫向溢出 |
|---|---|---|---|
| 430px | 268 | **114** | 0 |
| 768px | 268 | 452 | 0 |
| 1024px | 268 | 708 | 0 |

**左欄固定 268px，完全不隨視窗收縮。** 430px 之下主區只剩 114px——角色群像、定位
象限、提及量排行全部擠在那個寬度裡，實質不可用。

**不是溢出問題**: 三種寬度的橫向溢出都是 0，所以掃描式的檢查抓不到它；要量的是
**主區剩多少**，不是頁面有沒有爆出去。

**待辦內容**:
- 決定窄螢幕下左欄的行為：收合成抽屜、或變成上方的橫向選單
- 其餘功能頁要一併檢查——這是「固定寬側欄」的通病，不見得只有這一頁
  （符號頁 `.sym-page`、閱讀頁三欄都值得量一次）

**觸發時機**: 有人真的在窄螢幕上用這些頁時；或下次動任一功能頁的佈局時。
**目前優先度低**——使用者實際上在桌機寬度使用。

---

#### B-122 Gemini 隱式快取一次都沒命中，而前綴形狀是對的

**背景**: 2026-09-13 判讀 B-121 時實測。先前寫「langfuse 的 usage 沒有 cached token
欄位，無法判斷有沒有命中」——**那是偷懶**，LangChain 的回應物件自己就帶
`usage_metadata.input_token_details`。

**實測**: 同一份 4,144 token 前綴（系統提示 + 23 個工具定義）連續呼叫 5 次：

```
#1..#5  input_tokens 4144  cache_read 0
```

**五次全部 cache_read = 0。** `gemini-2.5-flash` 的隱式快取在這個工作負載上沒有作用。

**這推翻了「等供應商快取就好」。** 前綴的形狀其實完全對——**97% 穩定**，會變的只有
尾巴 84–285 字（頁面脈絡、聚焦實體）而且已經在最後面。問題不在形狀。

**沒查明的**: 為什麼不命中。候選——傳了 `tools` 參數時不適用、region 差異、
`langchain-google-genai` 走的 API 路徑沒啟用。**未查證**。

**待辦內容**:
- 查明隱式快取不命中的原因（先看 Google 官方對 2.5 系列 implicit caching 的條件）
- 評估**顯式快取**（`cachedContent`）：需確認 `gemini-2.5-flash` 的最低 token 門檻。
  2.0 時代是 32,768，4,144 不夠格；2.5 有沒有降**我沒查證**
- 命中的話省的是那 70% 的大部分，而且**零能力損失**——這是與 B-121 最大的差別

**觸發時機**: chat 用量大到成本有感時；或有人要動 chat 的系統提示 / 工具目錄時
（前綴一動，快取的前提就要重估）。

---

**查證完成（2026-09-13）——沒重現，但排除掉的東西比原本多**

**94 次 pytest 呼叫、0 次失敗。** 其中整套 suite 跑 42 次（30 次預設 sqlite backend
＋ 12 次 `TASK_STORE_BACKEND=memory`，三串平行製造時序壓力，每次不同
`PYTHONHASHSEED`），全部 `2077 passed`。

**最有份量的一條是 CI 統計。** `gates.yml` 至今 **102 次成功、1 次失敗**，而那 1 次是
已知的 2026-08-21 `ruff check tests/` 還紅著的那次。若真是 1/8，102 次全綠的機率
約 **1.2e-6**。**所以「約 1/8」是一次觀測，不是量到的比率**——標題已改。

**`Event loop is closed` 已從「疑犯」升格為「證明無罪」。** 原條目只說「成功的執行也會
出現」；更硬的理由是它**在結構上不可能弄紅測試**：來源是 `aiosqlite` 在已關閉的
loop 上呼叫 `call_soon_threadsafe`，pytest 的 `threadexception` 外掛把它變成
`PytestUnhandledThreadExceptionWarning`，而那只有在 `-W error` 下才會變成錯誤——
`pyproject.toml` 沒設 `filterwarnings`、CI 沒設 `PYTHONWARNINGS`、**全 repo 沒有任何
測試用 `pytest.warns` / `catch_warnings` / `simplefilter`**（已獨立複驗）。它的出現次數
確實隨機（42 次裡是 0、4、12…36），但結果從不改變。

**其餘排除**:
- **Qdrant 本機儲存的跨行程鎖**：`kg_settings.py:89-96` 繞過 DI 直接建真的
  `QdrantClient`，所以本機後端跑著時會持有 `var/qdrant_local` 的 flock。實測在持鎖
  狀態下跑 `tests/api`，結果與未持鎖**逐字相同**——例外被 `except Exception: pass` 吃掉
- **測試順序不可能是變因**：`pytest-randomly` / `pytest-repeat` / `pytest-xdist`
  **三個都沒裝**（以 import 複驗，不只看 `pyproject.toml`）。收集順序固定
- **背景任務外洩是確定性的**：`tests/api/test_ingest.py` 那 8 個 `202` 上傳每次都留
  8 筆 `Task exception was never retrieved`，42 次都是 8——是噪音地板不是變異源

**唯一的重播把手是 `PYTHONHASHSEED`**（既然沒有隨機化外掛）。建議 CI 印出它，
未來真的紅了才有辦法重放。**未實作**——那是 CI 改動，另行決定。

**沒能排除的**: 沒重現就無法指認成因，以上全是排除法。而且是在**沒有 `.env`** 的
worktree 裡跑的（`TASK_STORE_BACKEND` 有另外覆蓋，因為專案記憶點名過它），
LLM / langfuse 的真實值未套用。2026-09-05 之後 suite 從 1864 長到 2077、
落了 129 個 commit——**那個 flake 可能已經自己消失了**。

**處置**: 保持開著但降級。真的再撞見時，**先留測試名稱與 `PYTHONHASHSEED` 再重跑**。

---

#### B-124 三條單元測試實際上在對開發者的 `.env` 下斷言

**背景**: 2026-09-13 查 B-094 時順帶發現，**與那個 flake 無關**（這種錯會每次都紅，
不是 1/8）。

`tests/config/test_lightweight_mode.py` 多處呼叫不帶參數的 `Settings()`，而
`SettingsConfigDict(env_file=".env")` 會去讀**開發者本機的 `.env`**。於是這些測試斷言的
不是預設值，是那台機器當下的設定。

**實測**：`DEPLOY_MODE=full python -m pytest tests/config/test_lightweight_mode.py`
→ **3 failed, 8 passed**：

- `TestDeployMode::test_default_deploy_mode_is_lightweight`
- `TestQdrantMode::test_qdrant_local_path_absolute_is_absolute`
- `TestQdrantMode::test_qdrant_local_path_absolute_resolves_relative`

今天全綠只是因為目前的 `.env` 剛好沒設 `DEPLOY_MODE`（全庫只剩 5 個鍵有值）。
**有人補一行就紅，而紅的原因與程式碼無關。**

**待辦內容**:
- 讓這些測試明確與 `.env` 隔離（`Settings(_env_file=None)`，或 fixture 清掉相關環境變數）
- 掃一次還有沒有別的測試呼叫不帶參數的 `Settings()`

**觸發時機**: 補 `.env` 的鍵時（會當場撞到）；或下次動 `settings.py` 時。

---

#### B-094 pytest 有一個間歇性失敗（約 1/8）

**背景**: 2026-09-05 跑 B-091 的閘門時遇到 `1 failed, 1864 passed`，
其後連跑 7 次全綠（含刻意與 `npm run build` 併行以複製當時的資源競爭），
無法重現，也因此**沒有拿到失敗的測試名稱**。

**不是當時那批造成的**: 該分支 `git diff origin/main --name-only` 對
`backend/` 與 `tests/` 的異動是零，全部落在 `frontend/` 與 `docs/`。
所以這是既有的 flaky，只是剛好被撞見。

**唯一線索**: 輸出裡有大量 `RuntimeError: Event loop is closed`，指向
async 測試的 teardown。那些訊息平時也會出現（成功的執行也有），所以不能
直接當成兇手，但嫌疑集中在會起背景 task 的那幾組。

**為什麼值得追**: 這專案已經有過一次「閘門紅著沒人看」的教訓（B-066，
`tsc -b` 長期紅到累積 10 個錯誤）。1/8 的 flaky 比長紅更糟——它會讓
「重跑一次就過了」變成習慣動作，等到真的壞掉時沒人相信那個紅燈。

**待辦**:
- 下次撞見時**先把測試名稱留下來**再重跑（`-ra` 或 `--tb=short`，別只看摘要行）
- 若能重現，優先查會建立背景 task 的那幾組（`task_runner`、`sqlite_task_store`、
  `checkpoint_ttl`）—— 已單獨連跑 6 次未重現，所以可能是跨檔案的交互作用
- 考慮在 CI 加 `-p no:cacheprovider` 之外的種子紀錄，讓失敗可回放

**觸發時機**: 下次 CI 或本地再次撞見時。在那之前不值得為它停下手邊工作。

---

#### B-125 語氣分布量的是句式而非語氣，且對所有角色幾乎給出同一張圖

**背景**: 2026-09-24 對照設計稿時發現設計上有六七種語氣類別，而實作只有三種，
追查計算方式後認為問題不在類別數量，在**度量定義**。

**現況怎麼算**（`services/voice_profiling_service.py`）:

1. `get_paragraphs_by_entity()` 撈出**提到這個角色的所有段落**（`:150`）——
   不是這個角色說的話。沒有對白抽取，也沒有說話者歸屬，敘述段、旁人對白、
   場景描寫只要點到名字就全部計入。
2. `_SENTENCE_SPLIT`（`:56`）切句，數句尾是 `？`／`！` 的句子。
3. `_tone_distribution()`（`:277`）把 `declarative = 1 − Q − E` 當餘數推出來。

全程不打 LLM（`docs/API_CONTRACT.md:2019` 明訂）。

**問題一：這是句式（sentence mood），不是語氣。** 標點終結符只能分出陳述／疑問／
感嘆，量不到情緒或社交語氣（疏離、戲謔、命令、懇求…）。前端 `character.voice.tones`
把它翻成「陳述／疑問／感嘆」，名實相符；但區塊標題叫「語氣分布」，名實不符。

**問題二：沒有鑑別力。** 中文散文的問號驚嘆號本就稀少，輸入又混入大量敘述段，
陳述必然壓倒性勝出。《名字的潮汐》全書實測 **陳述 97.24% / 疑問 2.38% / 感嘆 0.38%**。
每個角色都會長得像這樣——三個角色並排看是同一張圖，這張堆疊條沒有在回答任何問題。

**問題三：孤兒收尾引號污染句數（可獨立修）。** 切句在 `？` 之後就切，於是
`「你要去哪裡？」` 被切成 `「你要去哪裡？`（判 Q，正確）與 `」`（判 D，錯誤）。
全書 798 句中有 **80 句（10.0%）是純 `」`**。實測影響：

| | 句數 | 疑問 | 感嘆 | 陳述 | 平均句長 |
|---|---|---|---|---|---|
| 現況 | 798 | 2.38% | 0.38% | 97.24% | 17.99 |
| 去掉孤兒引號 | 718 | 2.65% | 0.42% | 96.94% | **20.00** |

對語氣條只差 0.3pp（因為問題二本來就蓋過一切），但**平均句長被拉低 10%**——
那是 stat card 上一個看得到的錯數字（孤兒 `」` 去標點後詞數為 0，落不進任何直方圖
分桶卻仍計入分母）。

**待辦內容**（依序，前者可獨立出貨）:

- **(a) 修孤兒引號**：切句後濾掉 `^[」』”’）)]+$` 的片段。約 2 行，只影響
  `avg_sentence_length` 與句長直方圖的正確性，不改度量定義。
- **(b) 決定語氣分布要不要重做**。若要，兩個前提得先定案：
  - **輸入範圍**：維持「提到角色的段落」（現況，訊號被敘述稀釋），或改成
    「角色的對白」（需要說話者歸屬，目前不存在）。這是成本最大的一項。
  - **類別集合**：必須是**固定 enum**，否則跨角色不可比。設計稿的六七類需要
    先確認來源與定義。若改成 LLM 逐段標註，則從「零 LLM 成本」變成有成本。
  - 前端 `ToneDistribution`（`VoiceProfilingPanel.tsx:227`）本來就是通用的：
    有幾段畫幾段、label 找不到翻譯就顯示原文、`TONE_PALETTE` 備了 6 色以
    `i % length` 兜底。**寫死三種的只有後端**與 `API_CONTRACT.md:2015` 的註解。
- **(c) 證據不足時的行為**：真要改 LLM 分類，對白量少的配角必然落在低訊號區。
  依既有判準，訊號不可靠時不產出，不給退化預設值。

**先不做的理由**: (b) 是換度量定義，牽動後端計算、API 契約、設計稿三邊，
超出目前任何在途任務的範圍。(a) 與 (b) 無依賴，可先做。

**觸發時機**: 設計稿的語氣類別來源確認後；或下次動 voice 面板時順手做 (a)。

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
**設計文件**: `docs/plans/<YYYYMMDD>-narrative-rhythm.md`（待建立，可與 F-07 合併）

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
**設計文件**: `docs/plans/<YYYYMMDD>-reading-memory.md`（待建立）

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

### 🟠 Wave 3 — 深度分析功能

#### F-05 What-If 情境推演
**分類**: 分析功能 — Wave 3（核心體驗功能）
**設計文件**: `docs/plans/<YYYYMMDD>-what-if.md`（待建立）

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
**設計文件**: `docs/plans/<YYYYMMDD>-thematic-map.md`（待建立）

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
**設計文件**: `docs/plans/<YYYYMMDD>-narrative-focalization.md`（待建立）

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
**設計文件**: `docs/plans/<YYYYMMDD>-character-similarity.md`（待建立）

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
**設計文件**: `docs/plans/<YYYYMMDD>-role-agent.md`（待建立，因複雜度需完整 guide）

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
**設計文件**: `docs/plans/<YYYYMMDD>-image-generation.md`（待建立）

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
**設計文件**: `docs/plans/<YYYYMMDD>-whatif-system.md`（待建立）

**內容**: F-05 的延伸，加入多分支管理 UI、分支事件鏈的完整視覺化、分支之間的比對工具，以及將 Role Agent（F-13）帶入 What-If 分支進行角色對話驗證。

**前置依賴**: F-05、F-13

---

#### F-20 Role Agent 完整系統
**分類**: 整合 — Wave 5
**設計文件**: `docs/plans/<YYYYMMDD>-role-agent.md`（同 F-13）

**內容**: F-13 的完整實作，加入視角重述模式（角色日記 / 回憶錄生成）、對話記錄掛回 KG 作為「平行事件」、多角色聊天室的完整 orchestration 邏輯。

**前置依賴**: F-13（F-02、F-03、F-04）

---

#### F-15 世界觀建構完整系統
**分類**: 整合 — Wave 5（新使用模式）
**設計文件**: `docs/plans/<YYYYMMDD>-worldbuilding.md`（待建立）

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
- **I-002 階段（本票）**: 建立 `backend/storysphere/cli/migrate.py` 骨架，接入現有 `services/kg_migration.py` 處理 KG 方向的 lightweight → standard（NetworkX → Neo4j）
- **I-003 後續**: Vector migration（Qdrant local path → Qdrant service）實作

**修改範圍**:
- 新增 `backend/storysphere/cli/` 目錄與 `migrate.py`（2026-09-13 更正：原寫 `src/cli/`，`src/` 已於 2026-07-01 `3004d7a` 改名為 `backend/`）
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
| B-041 | 章節審閱 UI 專用 Design Token | 🟢 低 | **不做**（2026-09-13；前提消失——原述的 manuscript / minimal-ink / pulp 三主題已不存在，現為 Warm + Ink 兩主題，且 `--entity-con-*` 只定義在 `:root`、ink 未覆蓋。與 B-047 同一條理由） |
| B-042 | 章節審閱頁面：段落 Role 自動識別 | 🟢 低 | 待開始 |
| B-043 | 閱讀頁：欄 2 章節搜尋 | 🟡 中 | ✅ 已完成 |
| B-044 | 閱讀頁：EpistemicSidePanel 入口可發現性優化 | 🟡 中 | ✅ 已完成 |
| B-045 | 敘事結構頁：英雄旅程主視圖 + 情節骨幹摘要 | 🟡 中 | ✅ 已完成 |
| B-046 | 建構概覽：節點觸發建構 CTA 對接 pipeline | 🟢 低 | 🔶 Phase 1 已完成（2026-08-11，12 節點已接，見 ARCHIVE）；Phase 2 待開始（張力 / 英雄旅程 / 時序四節點只需補 `NODE_TO_TRIGGER`；`narrative_structure` 待 classify 對缺快取安全；另四節點無批次端點） |
| B-047 | 知識圖譜：非預設主題下節點類型識別困難 | 🟢 低 | ✅ 已解（design system v2 兩主題共用 entity 色環，問題不復存在） |
| B-048 | Neo4j 能力缺口（切過去等於整個圖譜功能面停擺） | 🟡 中 | 🔶 部分完成（2026-09-05；PR #83 防護、PR #84 事前警告；三項缺口的實作待 B-011）|
| B-049 | 累積 Lint 債清理（ruff + eslint） | 🟢 低 | ✅ 已完成 |
| B-050 | 邊界輔助辨識：段內拆分（intra-paragraph split） | 🟢 低 | 待開始（2026-09-13 補登：先前有條目但漏了狀態列。實作確認未做——無任何段內切分程式碼） |
| B-051 | WebSocket 連線身分認證 | 🟢 低 | 待開始（前置：部署方向 + 認證決策） |
| B-052 | log 中 neo4j/qdrant URL 遮罩 | 🟢 低 | ✅ 已完成（2026-08-22；7 處，其中 1 處是回應 body 不是 log，見 ARCHIVE） |
| B-053 | Secret 管理（prod） | 🟢 低 | 待開始（前置：部署方向確定） |
| B-054 | Splash 圖庫更換 + wording 同步 | ✅ | 完成（2026-07-16，歸檔於 ARCHIVE） |
| B-055 | 章節審閱 review-data 分章載入 | 🟢 低 | 待開始（觸發：上傳流程 UX 重構） |
| B-056 | Phase 1 文件解析 sub-progress | 🟢 低 | 待開始（觸發：大檔解析體感回報） |
| B-057 | 批次上傳（含跳過審閱選項） | 🟢 低 | 待開始（觸發：批次需求出現） |
| B-058 | 處理卡系統吉祥物欄 | 🟢 低 | 待開始（觸發：吉祥物資產備妥） |
| B-059 | 派系語意命名（LLM 為 F-16 社群取名） | 🟢 低 | 待開始（2026-09-13 查證：**前置已滿足**——角色頁派系分群 2026-07-17 `cd7c315` 就上線了。觸發條件只剩「`Faction N` 佔位稱呼被回報不夠用時」；命名策略三選一仍待決） |
| B-060 | 原型篩選 facet 改以 archetype id 比對 | 🟢 低 | 待開始（觸發：EN 介面使用需求） |
| B-061 | 前後端原型 taxonomy 漂移防護測試 | 🟢 低 | ✅ 已完成（2026-08-22；後端 pytest 讀前端檔案，8 項，四組現況皆一致，見 ARCHIVE） |
| B-062 | tension / narrative 前端寫死 language='zh' | 🟡 中 | ✅ 已完成（2026-08-21；後端補 `language` + 前端六個呼叫點接上，影響比原記載大，見 ARCHIVE） |
| B-063 | 關係圖角色名冊比對支援 KG 別名 | 🟢 低 | 待開始（觸發：灰圈誤判回報累積） |
| B-064 | 未分析卡「生成分析」按鈕文字對齊 canvas「建立」 | 🟢 低 | ✅ 已完成（2026-08-22；清單卡 + 排行列兩處改用新 key，事件兩處按 UI_SPEC 不動，見 ARCHIVE） |
| B-065 | 各功能頁操作說明缺乏統一機制 | 🟡 中 | ✅ 已完成（2026-09-13；三層規範寫入 UI_SPEC §4.2，兩套 ribbon 收成 `GuidanceRibbon`，九個功能頁全數補上頁層說明，並修掉時間軸那句叫使用者做不存在動作的錯提示） |
| B-073 | Gemini 對「手」的提示回報 PROHIBITED_CONTENT | 🔴 高 | ✅ 結案（2026-08-10 Phase 1–3 完成；2026-09-13 修正指向——原寫「待 B-075」是錯的，B-075 交付的是設定判準收斂，真正決定 fallback 的是 B-099「暫不實作」。「手」產不出詮釋是既定限制，見 ARCHIVE） |
| B-074 | SEP 把前置頁文字當證據送進 LLM | 🔴 高 | ✅ 已完成（2026-08-10）；2026-09-13 逐庫查證，「海」那筆受污染舊詮釋**已不存在**（`8f18dd59` 是潮汐誤刪重傳前的舊 id，資料隨舊書一起沒了，早於 B-117），原條目內的 DELETE SQL 已無對象，待決策結案 |
| B-075 | 全系統 LLM fallback 鏈是壞的（假 local model + placeholder 誤判） | 🔴 高 | ✅ 已完成（2026-08-20 複查：`Settings.has_*` 收斂早已落地——`is_configured()` 是唯一判準，`llm_client._has_key` 已改為純委派；`.env` 的行內註解也已清除） |
| B-076 | provider 封鎖在 30+ 呼叫點偽裝成解析失敗 | 🟡 中 | 已完成（2026-08-10）；24 處呼叫點改用共用 `llm_text()` |
| B-077 | 語言顯示名查表大小寫敏感（`zh-TW` → 「Respond in Zh.」） | 🟢 低 | 已完成（2026-08-10）；原記的「回傳簡體」是驗證腳本的產物，生產路徑無此問題 |
| B-079 | 19.7% 的 imagery occurrence 指向不含該詞的段落 | 🟡 中 | ✅ 已完成（2026-08-20 PR #61；兩個根因：靜默退回第一段 + pypdf 字中空白。定位正確率 80.3% → 100%） |
| B-078 | 象徵事件依附與貫穿度共線（`W.ev` 定義待決） | 🟢 低 | 暫不實作（2026-08-10 收攏；觸發：決議 06 權重校準） |
| B-081 | 四個服務的 token 歸屬缺口（共 7 處） | 🟡 中 | ✅ 已完成（2026-08-20 PR #62；設在公開進入點，併入 `analysis`，另加 AST 掃描測試防回歸） |
| B-082 | 重跑 KG 抽取會累積重複的實體 / 關係 / 事件 | 🔴 高 | ✅ 已完成（2026-08-20 PR #60；`_persist_to_kg` delete-first，連帶清 `inferred_relations`） |
| B-083 | pypdf 在 CJK 字中插空白，`mention_count` 漏數 | 🟡 中 | ✅ 已完成（2026-08-20 PR #64；`core/utils/text_matching.squash_spacing()`，41 個實體的漏數修正） |
| B-080 | 後端 deferred import 分類 | 🟢 低 | **不做**（2026-08-19 分類：276 處中僅 ~5.4% 可搬；75% 是循環依賴迴避） |
| B-084 | 後端實體類別欄位是純 `str`，擋住 4 個前端型別接回 generated | 🟢 低 | ✅ 已完成（2026-08-22；4 個型別已接回，只需改 1 個消費端而非預期的 12 個 cast；`status` 那半拆為 B-088，見 ARCHIVE） |
| B-085 | 五道閘門沒有任何 CI 在盯 | 🟡 中 | ✅ 已完成（2026-08-22；`.github/workflows/gates.yml`，觸發條件在 2026-08-21 滿足） |
| B-066 | 前端 `tsc -b` 既有 10 項型別錯誤 | 🟡 中 | ✅ 已完成（2026-08-20；10 項全清，`npm run build` 於 main 首次 exit 0） |
| B-067 | mock 模式下時間軸覆蓋率恆為 0% | 🟢 低 | **不做**（2026-08-20；`api/mock/` 整層已移除，前提消失） |
| B-068 | 事件抽取把同一場戲切成多個 event | 🟡 中 | ✅ 已完成（2026-09-12；`group_scenes()` 排版分隔符 F1 0.79，無分隔線的章節整章不回傳而非回傳「一場」；張力頁 Step 1 已接上 `scene_index`。三個「從上游解」的方向都量過且都更差，見 plans） |
| B-069 | 張力證據「同場景摺疊」無可用判準 | 🟢 低 | ✅ 結案——目標本身是錯的（2026-09-12 量化：合併會抹掉 60% 事件、16/20 場景的 `event_type` 不只一種。正解是按 B-068 的 `scene_index` 分組顯示，不是減少則數） |
| B-070 | 張力分析頁 RWD 未做 | 🟡 中 | ✅ 已完成（2026-08-21；三項待決全數收斂，見 ARCHIVE 與 UI_SPEC §3.8） |
| B-071 | 張力頁格點與迷你柱狀圖無非視覺替代 | 🟢 低 | 🔶 部分完成（2026-08-21；抽屜焦點與非視覺替代已做，Ink 語意拆為 B-086） |
| B-086 | Ink 主題下狀態語意只靠顏色 | 🟢 低 | ✅ 已完成（2026-08-22；盤點 109 處只有 1 處是真問題，見 ARCHIVE） |
| B-087 | 張力頁零引用的狀態色 CSS | 🟢 低 | ✅ 已完成（2026-08-22；實際範圍是兩整段共 243 行，非原記的 6 行，見 ARCHIVE） |
| B-072 | 張力 Step 1 組裝失敗的 TEU 無清單可看 | 🟢 低 | ✅ 已完成（2026-09-12；後端確認沒留清單，改回傳 `failures`（id/標題/章/例外），前端加收合面板。原記載的「只亮一個 failed 旗標」不成立——部分失敗其實什麼都不亮。同形狀另三處另立 B-113） |
| B-088 | 書卡狀態徽章永遠是「已就緒」 | 🟢 低 | ✅ 已完成（2026-08-22；改由 pipeline_status 推導 3 值，`processing` 證實產不出來已移除；順帶收掉 PipelineStatusResponse，見 ARCHIVE） |
| B-089 | 建構概覽把從未執行過的步驟標成「已完成」 | 🟡 中 | ✅ 已完成（2026-09-05 PR #79；`kg_concept` 兩半都非零才 complete，並移除永遠推不動它的 CTA，見 ARCHIVE） |
| B-090 | 零引用符號清除（第一批） | 🟢 低 | ✅ 已完成（2026-09-05 PR #80；5 個候選三種結局——3 刪、1 因是被手抄的 schema 改為讓工具用它、1 暫緩待 B-075，見 ARCHIVE） |
| B-091 | 全面徹查零使用程式碼 | 🟡 中 | ✅ 已完成（2026-09-08；backend 3→2、前端匯出 15→0、CSS 86→0、i18n 340→19、model 欄位 5 筆、私有方法範圍清空；掃描器修掉三個判準缺陷） |
| B-092 | ConceptInferencePipeline 從未接線，張力分析一直少一段證據 | 🟡 中 | ✅ 已完成（2026-09-10 PR #101/#102/#103；四段全數落地，見 ARCHIVE） |
| B-093 | 前後端 taxonomy 漂移防護只蓋了五分之二 | 🟢 低 | ✅ 已完成（2026-09-06 PR #87；防護 2/5 → 5/5、新增 id 集合對等、hero_journey 英文 5 筆對齊、刪掉零引用的 `STAGE_IDS`/`PHASES`，見 ARCHIVE；殘項另立 B-095） |
| B-094 | pytest 撞見過一次間歇性失敗（原記「約 1/8」） | 🟢 低 | 🔶 查證完成、未重現（2026-09-13；94 次 pytest 呼叫 0 失敗 + CI 102 次全綠 → 「約 1/8」是**一次觀測不是量到的比率**。`Event loop is closed` 已證明在結構上不可能弄紅測試。無隨機化外掛，`PYTHONHASHSEED` 是唯一的重播把手）（2026-09-05 撞見一次，7 次重跑未重現，未取得測試名稱；非該批造成） |
| B-124 | 三條單元測試實際上在對開發者的 `.env` 下斷言 | 🟢 低 | 待開始（2026-09-13 查 B-094 時順帶發現，與那個 flake 無關。`Settings()` 不帶參數會讀本機 `.env`；實測 `DEPLOY_MODE=full` 就讓 3 條變紅。今天綠只是因為 `.env` 剛好沒設那個鍵） |
| B-125 | 語氣分布量的是句式而非語氣，且對所有角色幾乎給出同一張圖 | 🟡 中 | 待開始（2026-09-24 對設計稿時發現。輸入是「提到角色的段落」不是對白，判準是句尾標點，《名字的潮汐》實測陳述 97.24%，每個角色都長一樣。另有孤兒收尾引號佔 10% 句數、把平均句長拉低 10%，該項可獨立修） |
| B-105 | 移除 10 個無呼叫端的 HTTP 端點 | 🟢 低 | ✅ 已完成（2026-09-07；`documents.py` / `relations.py` 整檔刪除、`entities.py` 只留 `GET /:entityId`，連同 7 個孤兒 schema 與兩個測試檔；generated.ts 少 673 行） |
| B-106 | `narrative_position` 有五個讀者、零個寫者 | 🟡 中 | ✅ 已完成（2026-09-10 PR #104 + B2 措辭；兩本書已重跑填滿。代價：要求章內序會推高事件顆粒度 +30%。**2026-09-12 三個「沒試過的方向」全部量完、全部不成立，顆粒度稅確認付不掉**；處置是 B-068 的讀取端場景層） |
| B-107 | Age of Fire 的事件資料停留在 B-082 修好之前 | 🟢 低 | ✅ 已完成（2026-09-10 重跑 KG；101 → 49 事件，60 筆重複標題歸零） |
| B-108 | 事件衍生的快取失效規則掛在錯的步驟上 | 🟡 中 | ✅ 已完成（2026-09-10；`knowledge-graph` 才是重生 event id 的步驟，卻既不清 `event:` 也不收 TEU keys；`feature-extraction` 那份多餘規則留作獨立一題） |
| B-109 | `Event.location_id` 是第二個零寫者欄位 | 🟢 低 | ✅ 已完成（2026-09-12；刪欄位與四個消費端。地點一直都在 `participants` 裡（提示不限型別），唯一實害是時間軸地點篩選永遠不出現——改認地點型參與者後從 0 個選項變 9 個。原記「查不到消費者」有誤） |
| B-110 | 張力頁重新整理後就忘記 Step 1 跑過 | 🟡 中 | ✅ 已完成（2026-09-11；`hasTeus` 不看 `teus` query，導致 23 筆 TEU 的書顯示空狀態並引導使用者重跑一次完整 LLM pass） |
| B-111 | `feature-extraction` 刪掉四個家族的快取，但它不重生那些 id | 🟡 中 | ✅ 已完成（2026-09-12；B-108 說要開卻從未開出的那一題。`event:` / `character:` 改判為 stale 並補上 #6a/#6b/#7a/#7d 的回報路徑與兩頁徽章，`epistemic:` / `teu:` 零依賴直接移除；五項測試在釘住舊行為已改判準） |
| B-113 | 「`failed += 1` 然後繼續、不留清單」還有三處 | 🟢 低 | ✅ 已完成（2026-09-12；後端三處回傳 `failures`，前端三頁共用 `BatchFailureList`。**瀏覽器實測已補**，並修掉實測才發現的缺陷：角色頁 toast 內清單無高度上限，20 筆會把標題與關閉鈕頂出畫面） |
| B-114 | 全站焦點環漏掉 `<summary>` | 🟢 低 | ✅ 已完成（2026-09-12；`:where()` 加入 `summary`，三個 details 元件一次涵蓋，tension.css 的 local 規則同時刪除） |
| B-115 | 只有收尾標點的一行被判成場景分隔線 | 🟡 中 | ✅ 已完成（2026-09-12；`_is_separator_segment` 排除整段皆行文標點者。實測 16 筆真分隔全留、4 筆偽陽性全除；刻意不用長度判準——真分隔 `～` 只有 1 字。既有資料需重跑 ingestion，B-068 實作應於讀取端再套一次） |
| B-116 | `temperature=0` 之下 Gemini 仍然不可重現 | 🟡 中 | ✅ 已查明 + 基線已量（2026-09-12；來源是供應端非 llm_retry。N=30 基線：ch1 事件數 range 2、ch7 range 0——雜訊不一定打到你在量的指標，需逐章逐指標量。先前根據 N=5 說「效應不可靠」已更正。**2026-09-12 再更正「不要用 ch7」那句——零變異是零底噪、鑑別力最高；另量到措辭會讓雜訊搬家但不會變少**） |
| B-117 | 已刪書籍的殘留快取 | 🟢 低 | ✅ 已完成（2026-09-12；`analysis_cache` 清掉 17 筆孤兒、26→9，備份在專案外並逐項核對。連帶讓走查 §3-3 的 40 筆 pending 推斷關係失去前提——該表已空） |
| B-118 | 走查 §3-1 三個未掃範圍全數收束，掃描器補上 corpus 拆分／框架回呼／巢狀函式 | 🟡 中 | ✅ 已完成（2026-09-12；巢狀函式 0 筆、scripts 三個裡一個有文件化用法另兩個是已用畢的 one-off。六個刪除候選經使用者批准後已刪，見 `ba15406`） |
| B-119 | 系統提示硬寫工具名，與註冊表會各自漂移 | 🟡 中 | ✅ 已完成（2026-09-13；工具沒綁上時，提示裡提到它的**子句**一併裁掉——按子句不按行，同行的 `get_event_profile` 得以保留。守衛走 `_build_messages` 真實路徑，哨兵測試抓到第一版只測函式不測接線） |
| B-120 | Langfuse 憑證錯誤是沉默失敗 | 🟡 中 | ✅ 已完成（2026-09-12；啟動時 `auth_check()` 探測：被拒→ERROR 並關閉追蹤、連不上→警告但保留。`auth_check()` 是**丟例外**不是回傳 False，第一版守衛因此形同虛設，照 B-061 實測才抓到） |
| B-121 | 每回合都把 23 個工具重講一遍，佔 chat 輸入 token 的七成 | 🟢 低 | 🔶 已量測，**不照原設計實作**（2026-09-13；裁剪每題只省 $0.0002–0.0007，代價是能力消失而非準確率下降，且對照表無使用資料可依據。真正的槓桿是快取，見 B-122） |
| B-122 | Gemini 隱式快取一次都沒命中，而前綴形狀是對的 | 🟢 低 | 待開始（2026-09-13 實測 `cache_read` 連 5 次皆 0。前綴 97% 穩定、變動部分已在尾巴，形狀沒問題；不命中的原因與顯式快取的門檻**都未查證**。命中的話省 70% 的大部分且零能力損失） |
| B-123 | 角色分析頁的左欄不隨視窗收縮，窄螢幕下主區只剩 114px | 🟢 低 | 待開始（2026-09-13 實測：左欄固定 268px，430px 視窗下主區僅 114px。橫向溢出為 0，所以掃描抓不到——要量的是主區剩多少。其餘固定寬側欄的頁面應一併檢查） |
| B-104 | 兩個已完整實作的深度分析工具永遠註冊不進 chat agent | 🟡 中 | ✅ 已完成（2026-09-07 F 走查；已接上 chat agent 並補雙端守衛，文件反向漂移一併修正；選擇準確率影響待 langfuse 基線） |
| B-103 | 建構概覽的 Relations 節點顯示全庫計數 | 🟢 低 | ✅ 已完成（2026-09-07；雙後端新增 `relation_count_for()`，雙向關聯去重，實測 696 → 分書 203/69/259/55） |
| B-102 | 段落層 keywords 產得出來、送得出去，就是沒有存 | 🟢 低 | ✅ 已完成（2026-09-07；`paragraphs.keywords_json` + 寫入 2 處讀取 3 處；既有書需重跑 feature-extraction 才有值） |
| B-099 | `get_fallback` 的暫緩理由已過期，全系統實際上沒有任何 fallback | 🟢 低 | 暫不實作（2026-09-07 收攏：一般使用者不會備多家 LLM key，前提不成立；`get_fallback` 保留，理由換成有效的那個。技術前提已查明留在條目裡） |
| B-100 | token 歸屬修好之後沒有任何資料驗證過 | 🟢 低 | ✅ 已完成（2026-09-12 實測：108 筆新資料、未歸屬 0 筆、跨 6 個 service 2 本書。注意歷史那 4206 筆已不在庫裡，不是同一個母體，不能宣稱「98.3% → 0%」） |
| B-101 | 前置頁排除數有兩套規則，而且不是同一條 | 🟢 低 | ✅ 已完成（2026-09-07；數字搬進 #15i overview item，前端兩個出口改讀後端值，規則收斂為一條） |
| B-095 | 英雄旅程的順序常數 `STAGE_ORDER` / `STAGE_PHASE` 無防護 | 🟢 低 | ✅ 已完成（2026-09-07；順序、phase、兩語系一致三項守衛，哨兵各驗過會紅） |
| B-096 | classify 的洗白守衛只擋全損，不擋部分損失 | 🟡 中 | ✅ 已完成（2026-09-07；成因是把「沒有 EEP」讀成「判定為未分類」，改為保留無法重現的權重，`_would_wipe` 隨之移除） |
| B-097 | NarrativeService 對 KG 的寫入從不落盤 | 🟡 中 | ✅ 已完成（2026-09-07；`narrative_weight` 改為有變化才落盤，`story_time` / `StoryTimeRef` 因零讀者移除） |
| B-098 | scan_dead_code 會把自己 docstring 裡的提及算成引用 | 🟢 低 | ✅ 已完成（2026-09-06；`_code_only()` 以 tokenize 濾掉註解與字串，backend 符號 1 → 3；順帶納入私有方法，該範圍 0 筆） |

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
| F-16 | 角色派系偵測（Faction Detection） | Wave 2 | KG 關係（已有） | ✅ 已完成（2026-05-28 `f0603fd`；狀態欄漏更新到 2026-09-13 才發現。後端 `faction_service` + #6d、前端圖譜頁 community 模式 / `FactionCanvas` / `ClusterOverviewPanel`，角色總覽消費端 2026-07-17 `cd7c315`） |
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
**最後更新**: 2026-09-13（狀態對帳：F-16 / B-046 補正、B-050 補登狀態列、B-041 結案、B-073 指向修正，31 條已完成條目歸檔）
