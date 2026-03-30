# StorySphere — 開發 Backlog

**用途**: 記錄已識別但尚未排入 Phase 的開發項目
**更新日期**: 2026-03-15

---

## 🔴 高優先（功能缺口）

### B-001 Relations Router（API 層遺漏）
**背景**: Phase 8 guide 有規劃但未實作
**內容**:
- `GET /api/v1/relations/paths?from={id}&to={id}` — 兩實體間關係路徑
- `GET /api/v1/relations/stats` — 全圖關係統計

**實作提示**: 呼叫已有的 `KGService.get_relation_paths()` 和 `get_relation_stats()`，仿 `routers/entities.py` 模式

---

### B-002 Documents Router（API 層遺漏）→ ✅ 已完成
**背景**: 架構圖有 Card Details，但沒有文件查詢 API
**內容**:
- `GET /books` — 列出已 ingest 的書籍
- `GET /books/:bookId` — 書籍詳情（含 chapters 列表）

**實作提示**: 呼叫已有的 `DocumentService.list_documents()` 和 `get_document()`
**備註**: 前端已對齊 `API_CONTRACT.md` 的 `/books` API（2026-03-15 重構完成）

---

### B-003 TaskStore 持久化（多進程安全）
**背景**: 目前 `api/store.py` 是 in-memory dict，多 worker (`uvicorn --workers 4`) 時 task 狀態會丟失
**內容**: 將 `TaskStore` 後端改為 SQLite（或 Redis 可選），讀寫需 async
**設定**: `task_store_backend: Literal["memory", "sqlite"] = "memory"`（Settings 已有此欄位）

---

## 🟡 中優先（功能完善）

### B-004 LangSmith 監控整合
**背景**: 專案大量使用 LangChain / LangGraph，需要 LLM call tracing、prompt 版本管理、latency 分析
**影響範圍**:
- `ChatAgent` — LangGraph ReAct loop 的每次 invoke/stream
- `AnalysisService` — CEP / archetype / arc / EEP 等 LLM calls
- `SummaryService` / `ExtractionService` — 所有 LLM invocations
- `GenerateInsightTool` — 工具層 LLM 呼叫

**實作方式**:
1. 新增環境變數（`.env.example`）：
   ```
   LANGCHAIN_TRACING_V2=true
   LANGCHAIN_API_KEY=ls__...
   LANGCHAIN_PROJECT=storysphere
   LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
   ```
2. 新增 Settings 欄位：
   ```python
   langchain_tracing: bool = False
   langchain_api_key: str = ""
   langchain_project: str = "storysphere"
   ```
3. 在 `api/main.py` lifespan 啟動時設定環境變數（LangChain 自動 patch）
4. 可選：為關鍵 chain 加上 `@traceable` decorator 或手動設定 `run_name`

**依賴**: `langsmith>=0.1.0`（通常隨 `langchain` 一起安裝，確認版本即可）
**文件**: 新增 `docs/guides/LANGSMITH_SETUP.md`

---

### B-005 Analysis WebSocket 推送 → ✅ 已完成
**背景**: ADR-004 設計是 task_id → **WebSocket 主動推送**結果，目前只實作了 polling
**內容**:
- `WS /ws/tasks/{task_id}` — 客戶端訂閱 task_id，server 主動推送 TaskStatus 更新
- `api/ws_manager.py` — ConnectionManager singleton（task_id → list[WebSocket]）
- background task 在 running / done / error 時呼叫 `manager.push()`
- 連接後立即回傳目前狀態；若已 done/error 則直接關閉；進行中每 30s 送 ping

---

### B-006 Metrics API 端點 → ✅ 已完成
**背景**: Phase 7 `MetricsCollector` 收集了 7 個 KPI，但無法從外部查詢
**內容**:
- `GET /api/v1/metrics` — 回傳 `MetricsCollector.get_stats()` 的快照
- 可選：`GET /api/v1/metrics/history` — 近 N 筆 JSON-line logs（略過，MetricsCollector 未維護 rolling buffer）
**實作**: `src/api/routers/metrics.py`，直接呼叫 `get_metrics().get_stats()`

---

### B-007 多語系 `language` 參數統一傳遞 → ✅ 已完成
**背景**: CORE.md 多語系策略：透過 `output_language` 參數控制，但 API / Chat Agent 層未統一傳遞
**內容**:
- Chat WebSocket 訊息加入 `language` 欄位（預設 `"en"`）
- `ChatAgent.chat()` / `astream()` 接受 `language` 參數並注入 system prompt
- 同步查詢 API 加入 `?language=zh` query param（影響 summary 等文字輸出）
**備註**: `ChatState.language` 持久保留 session 語言；entity analyze endpoint 加 `language` query param 並傳給 `AnalysisAgent`

---

## 🟢 低優先（可選升級）

### B-008 Neo4j Backend
**背景**: ADR-009 設計為 NetworkX（預設）↔ Neo4j（大規模可選），`kg_mode='neo4j'` 有 settings 但未實作
**內容**: `KGService` 加入 Neo4j 分支，`kg_mode='neo4j'` 時使用 `neo4j` driver
**前置條件**: 需要 Docker + Neo4j 實例

---

### B-009 GetChapterSummaryTool 完整實作 → ✅ 已完成
**背景**: CORE.md 工具目錄 Tool #15 目前是 stub
**內容**: 實作完整邏輯（目前 `DocumentService.get_chapter_summary()` 已存在，接線即可）
**備註**: `chapter_number` 為必填（與 GetSummaryTool 的可選設計不同），已加入 `get_chat_tools()` 作為第 6 個 Retrieval Tool

---

### B-010 Composite Tool #5 → ✅ 已完成
**背景**: CORE.md 設計 3-5 個 composite tools，目前只有 4 個
**實作**: `GetEventProfileTool` — 輕量級 no-LLM 事件資料聚合器（事件屬性 + 參與者 + timeline context + 段落 + 章節摘要）

---

### B-011 生產環境配置
**內容**:
- Dockerfile + docker-compose（API + Qdrant + 可選 Neo4j）
- PostgreSQL 遷移（`database_url` 已支援，需測試）
- `uvicorn --workers N` 配合 B-003 TaskStore 持久化

---

---

## 🔴 高優先（功能缺口）— 主題分析：符號學模組

### B-017 意象實體識別策略研究（符號學前置依賴）
**背景**: 符號學分析模組的核心技術挑戰。現有 NER pipeline 處理具體命名實體（人物/地點），但符號學需要識別「光」、「水」、「門」等**意象實體**，其邊界模糊、語境依賴、可能以隱喻形式出現，無法直接用現有 NER 解決。
**設計文件**: `docs/notes/symbolic_analysis_design_notes.md` Section 四

**內容**:
- 評估三種識別策略的可行性：
  1. **詞嵌入聚類**：用 `sentence-transformers`（已有）計算語義相似度，將「光」/「火焰」/「燭光」聚合成符號族群
  2. **LLM 輔助標注**：prompt Gemini 識別段落中具有符號功能的意象詞彙
  3. **人工種子 + 擴展**：分析者提供初始符號清單，系統擴展到語義相近詞彙
- 用一本具體小說手動走完三層分析流程，驗證整體設計合理性
- 評估現有向量搜索（Qdrant）能否支援語境採樣需求
- 輸出可行性評估報告，確定最終策略（或組合策略）

**實作提示**: 可先用 `src/services/keyword_service.py` 的 YAKE 提取高頻名詞作為候選意象，再用現有 `sentence-transformers` 做聚類實驗
**前置依賴**: 無（本項是 B-018 ~ B-022 的前置依賴）

---

## 🟡 中優先（功能完善）— 主題分析：符號學模組

### B-018 ImagerEntity Domain Model 設計
**背景**: 符號學模組需要新的實體類型表示意象實體，與現有 `Entity`（人物/地點）平行但語意不同。
**前置依賴**: B-017（策略確定後才能設計 schema 邊界）

**內容**:
- 設計 `ImagerEntity` Pydantic model（`src/domain/imagery.py`）：
  - `ImagerEntity`：符號本身（name, aliases, book_id, frequency, chapter_distribution）
  - `SymbolOccurrence`：單次出現記錄（chunk_id, chapter, position, context_window, co_occurring_symbols）
  - `SymbolCluster`：同義詞族群（canonical_name, variants, semantic_similarity_scores）
- 設計對應的 `DocumentService` 存取方法（`save_symbol`, `get_symbol_occurrences`）

**實作提示**: 參考 `src/domain/models.py` 的 `Entity` / `Event` 設計模式；存儲層沿用 SQLite（與 `analysis_cache.py` 一致）

---

### B-019 符號學第一層：候選符號發現 Pipeline
**背景**: 三層架構的第一層，回答「有什麼值得追蹤？」，為純統計工作（不涉及語義詮釋）。
**前置依賴**: B-018

**內容**:
- 實作 `src/pipelines/symbol_discovery.py`：
  - 高頻意象提取：去除停用詞後識別頻率異常高的名詞/意象（可複用 YAKE 結果）
  - 情感密度標記：識別在情感強烈段落（衝突、死亡、轉折）密集出現的意象
  - 分佈不均檢測：識別在特定章節突然大量出現或消失的意象
- 輸出候選符號清單，附帶：出現頻率、章節分佈圖、情感密度分數
- 整合進 `IngestionWorkflow`（可選，類似 keyword extraction 的整合方式）

**實作提示**: 情感密度標記可借助現有 `EventAnalysis` 的情感標注結果；分佈分析直接基於 `DocumentService.get_chapter_keywords()` 的章節邊界

---

### B-020 符號共現網絡建構（Layer 2）
**背景**: 三層架構的第二層，回答「這些符號之間有什麼關係？」，建立符號關係網絡。
**前置依賴**: B-019

**內容**:
- 共現矩陣：計算哪些意象總是一起出現、哪些從不同時出現（滑動窗口，window_size 可設定）
- 語境採樣：每個符號出現時提取周圍語義場（複用 Qdrant 向量搜索找相似語境）
- 語境變化追蹤：同一符號在不同章節的語境是否有系統性差異
- **設計決策**：符號共現圖作為 NetworkX 的**平行圖層**（節點類型 `ImageryNode`，與現有 `EntityNode` 共存，不合併）

**實作提示**: 共現圖資料結構與 `src/services/kg_service.py` 相同，可新建 `SymbolGraphService` 複用 NetworkX API；`KGService.get_subgraph()` 的查詢模式可直接借用

---

## 🟢 低優先（可選升級）— 主題分析：符號學模組

### B-021 詮釋輔助介面（Layer 3）— 符號時間軸
**背景**: 三層架構的第三層，將前兩層統計結果組織成分析者可直接閱讀的格式。系統只呈現觀察，不提供詮釋。
**前置依賴**: B-019, B-020

**內容**:
- API 端點：
  - `GET /api/v1/symbols?book_id={id}` — 返回候選符號清單（含頻率、分佈）
  - `GET /api/v1/symbols/{symbol_id}/timeline` — 某符號的所有出現實例，按章節排列附前後文
  - `GET /api/v1/symbols/{symbol_id}/co-occurrences` — 共現關係最強的符號組
- 自動標記語境發生明顯變化的位置（章節邊界的語境差異超過閾值）
- 前端：符號時間軸視覺化元件（參考現有 EventTimeline 元件模式）

---

### B-022 符號學 Pipeline 整合與 Deep Analysis 對接
**背景**: 將三層功能整合為完整 Pipeline，並接入現有 Deep Analysis Workflow，讓分析者可從 Character/Event 分析直接跳轉到相關符號追蹤。
**前置依賴**: B-020, B-021

**內容**:
- 整合 `SymbolDiscoveryPipeline` + `SymbolGraphService` + API layer 為完整符號學分析工作流
- 新增 `AnalysisAgent` 符號學分析入口（類比現有 `analyze_character` / `analyze_event`）
- 詮釋結果持久化設計：分析者手動添加的詮釋命題如何儲存和版本管理
- 評估跨書比較可行性（同一符號在不同作品的意義差異）

---

---

## 🔴 高優先（功能缺口）— 主題分析：張力分析模組

### B-023 Event 節點張力欄位強化
**背景**: 張力分析的觸發機制依賴 Event 節點的 `tension_signal` 標記。目前 ingestion pipeline 提取 Event 節點時未產出此欄位，TEU 組裝無法啟動。
**設計文件**: `docs/notes/tension_analysis_design_notes.md` Section 五

**內容**:
- 更新 `src/domain/models.py` EventNode schema，新增三個欄位：
  - `tension_signal: Literal["none", "potential", "explicit"]`
  - `emotional_intensity: float | None`（0-1，僅 tension != none 時填入）
  - `emotional_valence: Literal["positive", "negative", "mixed", "neutral"] | None`
- 更新 `src/pipelines/entity_extractor.py` 的 Event 提取 prompt，引導 LLM 同時輸出張力標記
- 確認 schema migration 策略（舊 Event 節點補填 `tension_signal="none"` 或重新 ingest）

**實作提示**: 提取 prompt 參考 EEP 的 `emotional_valence` 設計（已有類似概念）；三值設計比 boolean 更誠實，不強迫 LLM 二選一
**前置依賴**: 無（可與 B-024 並行）

---

### B-024 Concept 節點 surface/inferred 分類強化
**背景**: 張力分析用 Concept 節點描述對立極點，但需要區分「文本直接說出的概念」（surface）和「LLM 從段落推斷的命題」（inferred），兩者可信度和使用方式不同。
**設計文件**: `docs/notes/tension_analysis_design_notes.md` Section 四

**內容**:
- 更新 ConceptNode schema，新增欄位：
  - `extraction_method: Literal["ner", "inferred"]`
  - `source_spans: List[SpanRef] | None`（Surface 專用）
  - `inferred_by: str | None`（Inferred 專用，e.g. `"tension_pre_analysis_v1"`）
  - `confidence: float | None`（Inferred 專用）
- ingestion pipeline 產出 Concept 節點時，自動標記 `extraction_method="ner"`
- 驗證現有 KGService 查詢能否按 `extraction_method` 過濾

**前置依賴**: 無（可與 B-023 並行）

---

## 🟡 中優先（功能完善）— 主題分析：張力分析模組

### B-025 Pre-Analysis Step：Inferred Concept 節點產生流程
**背景**: Inferred Concept 節點（LLM 從段落群推斷的抽象命題，如「權力腐化善意」）不在 ingestion 時產出，而是 TEU 組裝的前置作業。此步驟有獨立的邊界。
**前置依賴**: B-024

**內容**:
- 實作 `src/pipelines/concept_inference.py`：
  - 輸入：候選段落群（可由 `emotional_intensity` 高的 Event 節點定位）
  - LLM prompt：從段落群歸納隱性命題，產出帶置信度的 Concept 標籤
  - 輸出：`ConceptNode`（`extraction_method="inferred"`, `inferred_by`, `confidence`），存入 KG
- 設計 `inferred_by` 的命名規範（e.g. `"tension_pre_analysis_v1"`）
- 此步驟可在用戶觸發張力分析時 lazy 執行

**實作提示**: 參考 `src/services/analysis_service.py` 的 archetype 推斷流程（LLM + confidence + 結果持久化）

---

### B-026 TEU Domain Model + 組裝 Pipeline（模式 B 優先）
**背景**: TEU（Tension Evidence Unit）是張力分析的最小單元，描述一個場景內的對立關係。模式 B（按需、單 Event 觸發）優先實作，比全書掃描更易驗證。
**前置依賴**: B-023, B-024, B-025

**內容**:
- 新增 `src/domain/tension.py`：`TensionPole`, `TEU`, `TensionLine`, `TensionTheme` Pydantic models
- 新增 `src/services/tension_service.py`：
  - `assemble_teu(event_id)` — 模式 B：單一 Event 觸發，從 KG 拉取 Character + Concept 節點 + Chapter Summary，LLM 組裝 TEU
  - `save_teu()` / `get_teu()` 存取層
- 輸入來源（TEU 組裝的原料）：
  - Event 節點（含情感標記）
  - Character 節點（來自 KGService）
  - Concept 節點（Surface + Inferred）
  - Chapter Summary（來自 DocumentService）
  - CEP（可選，來自 AnalysisAgent）
- 模式 A（全書掃描）延至 B-028

**實作提示**: TEU 組裝 prompt 的結構類似 EEP，但主語從「事件」換成「對立關係本身」

---

## 🟢 低優先（可選升級）— 主題分析：張力分析模組

### B-027 TensionLine 自動 grouping + HITL 審核介面
**背景**: TensionLine 是跨場景的對立模式，由多個 TEU 群集而成。群集需要 HITL（Human-in-the-Loop）介入，防止概念相似但實際獨立的主題被錯誤合併。
**前置依賴**: B-026
**開放問題**: intensity 聚合方式（平均值 / 最大值）、grouping 演算法（向量距離 vs LLM）待評估

**內容**:
- 自動 grouping 邏輯（兩個維度）：
  - 概念相似性：TEU 的對立極點涉及相同或相關 Concept 節點（向量距離優先評估）
  - 承載者重疊：TEU 涉及相同角色或陣營
- API 端點：
  - `GET /api/v1/tension/lines?book_id={id}` — 返回系統生成的 TensionLine 列表
  - `PATCH /api/v1/tension/lines/{id}/review` — 更新 `review_status`（approve / modify / reject）
- 前端 HITL 審核元件：每條 TensionLine 顯示組成 TEU、軌跡圖、極點標籤，供分析者快速判斷

---

### B-028 模式 A：全書掃描批次 TEU 組裝
**背景**: 模式 A 對全書所有 `tension_signal != "none"` 的 Event 節點批次組裝 TEU，作為完整分析的入口。
**前置依賴**: B-026

**內容**:
- `TensionService.analyze_book_tensions(book_id)` — 批次模式，以 `asyncio.gather` 並發組裝
- 整合進 `AnalysisAgent`（新入口，類比 `analyze_character` / `analyze_event`）
- API 端點：`POST /api/v1/tension/analyze` → 返回 `task_id`（異步，WebSocket 推送進度）
- 進度追蹤：每完成 N 個 TEU 推送一次 `stage: "teu_assembly"` 狀態更新

---

### B-029 TensionTheme 合成 + Frye/Booker 標籤對應
**背景**: TensionTheme 是全書層面的張力主題命題，由多條 TensionLine 合成。這是最需要人介入的步驟，系統提供組織好的輸入，LLM 產出命題草稿，人工審核確認。
**前置依賴**: B-027

**內容**:
- `TensionService.synthesize_theme(book_id)` — 輸入已審核的 TensionLine + Frye/Booker 標籤 + Jung/Schmidt 原型，LLM 產出 `proposition`
- API 端點：`GET /api/v1/tension/theme?book_id={id}` / `PATCH /api/v1/tension/theme/{id}/review`
- Frye/Booker 標籤整合：參考 `src/config/archetypes.py` 模式，新增 `src/config/mythos.py`

---

### B-030 張力分析與 Deep Analysis Workflow 完整整合
**背景**: 將 B-023 ~ B-029 的所有元件串連為完整端到端工作流，從 ingestion → TEU → TensionLine（HITL）→ TensionTheme（人工審核）。
**前置依賴**: B-028, B-029

**內容**:
- 完整流程文件（`docs/guides/PHASE_10_TENSION_ANALYSIS.md`）
- 前端：張力分析儀表板（TensionLine 軌跡圖、TEU 列表、TensionTheme 命題展示）
- 評估跨書比較可行性（同一張力模式在不同作品的呈現差異）

---

---

## 🔴 高優先（功能缺口）— 主題分析：敘事學模組

### B-031 Event 節點敘事學欄位預留（narrative_weight + story_time）
**背景**: Kernel/Satellite 分類（查特曼）和熱奈特時序分析都依賴 Event 節點的新欄位。這些欄位應在 ingestion 時以預設值填入，後續分析步驟再更新，不需要重新 ingest。
**設計文件**: `docs/notes/narratology_analysis_design_notes.md` Section 五

> ⚠️ **與 B-023 強烈建議合併**：B-023（張力欄位）和 B-031（敘事學欄位）都修改 EventNode schema 和 ingestion prompt。合併成一次 migration，避免重複修改。

**內容**:
- 更新 `src/domain/models.py` EventNode，新增：
  - `narrative_weight: Literal["kernel", "satellite", "unclassified"] = "unclassified"`
  - `narrative_weight_source: Literal["summary_heuristic", "llm_classified", "human_verified"] | None = None`
  - `story_time: StoryTimeRef | None = None`（預留，允許空值）
- 新增 `StoryTimeRef` schema（`relative_order`, `time_anchor`, `absolute_time`, `confidence`）
- Ingestion 時 `narrative_weight` 以 `"unclassified"` 填入，`story_time` 以 `None` 填入

**實作提示**: 預設值確保舊 Event 節點不需補填；`story_time` 欄位整個允許 `null`，不影響現有查詢
**前置依賴**: 建議與 B-023 合併處理

---

## 🟡 中優先（功能完善）— 主題分析：敘事學模組

### B-032 Ingestion prompt 時間線索提取預留
**背景**: 熱奈特時序分析的完整實作需要故事時間軸，但故事時間標記成本高。短期策略是在 ingestion 時提取文本中已存在的時間線索（「多年前」、「那個夏天」），成本增量極小，但為未來保留入口。
**前置依賴**: B-031（schema 先定義）

**內容**:
- 更新 Event 提取 prompt（`src/pipelines/entity_extractor.py`），新增選填項：
  ```
  如果段落中有明確的時間線索（例如「多年前」、「那個夏天」、「三天後」），
  請提取並填入 time_anchor 欄位。如果沒有明確線索，留空。
  ```
- 僅提取文本中已存在的線索，不做推斷——此限制確保可靠性
- 驗證：至少一本測試小說中有足夠比例的 Event 節點有 `time_anchor` 值

---

### B-033 Kernel/Satellite 第一階段：摘要啟發式分類
**背景**: 現有層級摘要（書/章/段）已隱含粗略的重要性分層——能進入章節摘要的 Event 本來就比只在段落層的 Event 重要。第一階段直接利用這個信號，不需要額外 LLM 調用。
**前置依賴**: B-031

**內容**:
- 新增 `src/domain/narrative.py`：`NarrativeStructure`, `HeroJourneyStage`, `ProppFunctionRef` models
- 新增 `src/services/narrative_service.py`：
  - `classify_by_heuristic(book_id)` — 依層級摘要推斷 `narrative_weight`，標記 `source="summary_heuristic"`
  - 規則：書級摘要出現 → kernel 候選；只在段落層 → satellite；中間層 → 待 LLM 細化
- 用一本具體小說手動驗證啟發式規則的準確率，特別是邊界案例

**實作提示**: `DocumentService.get_chapter_summary()` 已可查詢各層摘要；Event 的 `source_passages` 對應到摘要層級的邏輯已在 KGService 中有類似模式

---

### B-034 Kernel/Satellite 第二階段：LLM 細化分類
**背景**: 啟發式結果有誤差，特別是出現在章節摘要但語義上是渲染性的 Event。第二階段對不確定的候選集進行 LLM 完整判斷，核心問題：「刪去這個事件，後續因果鏈是否還能成立？」
**前置依賴**: B-033

**內容**:
- `NarrativeService.refine_with_llm(event_ids)` — 輸入：候選 Event + 前後相鄰 Event + 所在章節摘要；LLM 輸出 `kernel | satellite` + 判斷依據 + 置信度
- 定義衝突解決規則：若摘要層級信號和 LLM 判斷不一致，以哪個為準（建議：LLM 判斷優先，記錄分歧供人工審核）
- `NarrativeService.get_kernel_spine(book_id)` — 返回 kernel 事件列表（情節骨幹）

---

### B-035 坎伯英雄旅程 LLM 結構對應
**背景**: Frye/Booker 輸出類型標籤（這本書是什麼故事），坎伯輸出結構對應（哪個章節對應旅程的哪個階段）。兩者輸入相同（章節摘要序列），但後者需要章節到階段的映射，允許重疊。
**前置依賴**: 無（輸入為現有章節摘要，不依賴其他張力/敘事學模組）

**內容**:
- `NarrativeService.map_hero_journey(book_id)` — 輸入章節摘要序列，LLM 輸出 `HeroJourneyStage` 列表（12 個階段 × 對應章節範圍 + 代表性 Event + 置信度）
- 設計決策：多主角作品（如群戲）採用哪種處理策略（分開分析 / 整合為一條旅程 / 跳過）
- 設計決策：階段允許跨章節重疊（`chapter_range` 為列表而非單一值）
- 新增 `src/config/hero_journey.py`（12 個階段定義，類比 `src/config/archetypes.py`）

**實作提示**: 參考 `src/services/analysis_service.py` 的 archetype 分類模式，輸入/輸出結構高度相似

---

## 🟢 低優先（可選升級）— 主題分析：敘事學模組

### B-036 NarrativeStructure 節點儲存 + 查詢介面
**背景**: 整合 Kernel/Satellite 分類結果和英雄旅程對應，存儲為書級 `NarrativeStructure` 節點，並提供 API 查詢介面。
**前置依賴**: B-033, B-035

**內容**:
- `DocumentService.save_narrative_structure()` / `get_narrative_structure(book_id)`
- API 端點：`GET /api/v1/narrative?book_id={id}` — 返回 `NarrativeStructure`（含 kernel 清單、英雄旅程對應、普羅普序列摘要）
- `PATCH /api/v1/narrative/{id}/review` — 人工審核 / 修改 `review_status`

---

### B-037 熱奈特時序分析（倒敘/預敘識別 + 時距計算）
**背景**: 需要 B-032 的 `time_anchor` 覆蓋率達到足夠比例後才啟動評估。完整實作：文本位置排名 vs 故事時間排名的差值 = 倒敘/預敘量化指標。
**前置依賴**: B-032，且需 `story_time` 覆蓋率評估通過（建議閾值：≥ 60% Event 節點有 `time_anchor`）

**內容**:
- 書級 `story_time_structure` 標記（`"linear"` / `"partially_linear"` / `"non_linear"`），非線性則跳過
- `NarrativeService.analyze_temporal_order(book_id)` — 計算文本位置排名 vs 故事時間排名差值，識別顯著倒敘/預敘節點
- 時距分析：Event 的段落字數 vs 故事時間長短的比例，識別作者不成比例渲染的場景

---

### B-038 敘事結構視覺化 + Deep Analysis Workflow 完整整合
**背景**: 將 B-033 ~ B-036 的所有元件整合為端到端敘事學分析工作流，並提供前端視覺化。
**前置依賴**: B-033, B-035, B-036

**內容**:
- 前端：情節骨幹圖（Kernel 節點高亮於現有時間軸）、英雄旅程對應圖（12 個階段 × 章節範圍）
- 整合進 `AnalysisAgent`（新入口，類比 `analyze_character` / `analyze_event`）
- 完整流程文件：`docs/guides/PHASE_11_NARRATOLOGY.md`

---

## 📋 狀態追蹤

| ID | 項目 | 優先 | 狀態 |
|----|------|------|------|
| B-001 | Relations Router | 🔴 高 | ✅ 完成 |
| B-002 | Documents Router | 🔴 高 | ✅ 完成 |
| B-003 | TaskStore 持久化 | 🔴 高 | ✅ 完成 |
| B-004 | LangSmith 監控 | 🟡 中 | ✅ 完成 |
| B-005 | Analysis WebSocket 推送 | 🟡 中 | ✅ 完成 |
| B-006 | Metrics API 端點 | 🟡 中 | ✅ 完成 |
| B-007 | 多語系傳遞統一 | 🟡 中 | ✅ 完成 |
| B-008 | Neo4j Backend | 🟢 低 | 待開始 |
| B-009 | GetChapterSummaryTool | 🟢 低 | ✅ 完成 |
| B-010 | Composite Tool #5 | 🟢 低 | ✅ 完成 |
| B-011 | 生產環境配置 | 🟢 低 | 待開始 |
| B-012 | 前端後端 API 整合驗證 | 🟡 中 | 待開始 |
| B-013 | LLMKeywordExtractor 解析強化 | 🟡 中 | ✅ 完成 |
| B-014 | Local LLM 選型評估 | 🟡 中 | 進行中 |
| B-015 | Chat Agent Prompt & Flow Review | 🔴 高 | 待開始 |
| B-016 | Chat Context 切頁殘留 | 🔴 高 | 待開始 |
| B-017 | 意象實體識別策略研究 | 🔴 高 | 待開始 |
| B-018 | ImagerEntity Domain Model 設計 | 🟡 中 | 待開始 |
| B-019 | 符號學 Layer 1：候選符號發現 Pipeline | 🟡 中 | 待開始 |
| B-020 | 符號共現網絡建構（Layer 2） | 🟡 中 | 待開始 |
| B-021 | 詮釋輔助介面（Layer 3）符號時間軸 | 🟢 低 | 待開始 |
| B-022 | 符號學 Pipeline 整合與 Deep Analysis 對接 | 🟢 低 | 待開始 |
| B-023 | Event 節點張力欄位強化 | 🔴 高 | 待開始 |
| B-024 | Concept 節點 surface/inferred 分類強化 | 🔴 高 | 待開始 |
| B-025 | Pre-Analysis Step：Inferred Concept 節點產生 | 🟡 中 | 待開始 |
| B-026 | TEU Domain Model + 組裝 Pipeline（模式 B） | 🟡 中 | 待開始 |
| B-027 | TensionLine 自動 grouping + HITL 審核介面 | 🟢 低 | 待開始 |
| B-028 | 模式 A：全書掃描批次 TEU 組裝 | 🟢 低 | 待開始 |
| B-029 | TensionTheme 合成 + Frye/Booker 標籤對應 | 🟢 低 | 待開始 |
| B-030 | 張力分析 Deep Analysis Workflow 完整整合 | 🟢 低 | 待開始 |
| B-031 | Event 節點敘事學欄位預留（建議與 B-023 合併）| 🔴 高 | 待開始 |
| B-032 | Ingestion prompt 時間線索提取預留 | 🟡 中 | 待開始 |
| B-033 | Kernel/Satellite 第一階段：摘要啟發式分類 | 🟡 中 | 待開始 |
| B-034 | Kernel/Satellite 第二階段：LLM 細化分類 | 🟡 中 | 待開始 |
| B-035 | 坎伯英雄旅程 LLM 結構對應 | 🟡 中 | 待開始 |
| B-036 | NarrativeStructure 節點儲存 + 查詢介面 | 🟢 低 | 待開始 |
| B-037 | 熱奈特時序分析（倒敘/預敘識別）| 🟢 低 | 待開始 |
| B-038 | 敘事結構視覺化 + Deep Analysis 整合 | 🟢 低 | 待開始 |

---

### B-014 Local LLM 選型評估
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

### B-013 LLMKeywordExtractor 回傳解析強化 → ✅ 已完成
**背景**: 本地小模型（3B）回傳 JSON 不穩定，`_parse_response` 目前有三個脆弱點：
1. 只處理 ` ``` ` 開頭的 markdown fence，若 LLM 在 JSON 前加說明文字（如 `Here are the keywords:\n{...}`）直接 `JSONDecodeError`
2. 不嘗試從回傳內文中抽取 `{...}` substring，整段不是合法 JSON 就失敗
3. `retry` 只重試 `JSONDecodeError / ValueError / KeyError`，LLM API 錯誤不觸發 retry

**建議修法**: 在 `_parse_response` 加 regex 抽取第一個 `\{.*\}` block（`re.search(r'\{.*\}', content, re.DOTALL)`）再 parse，提升對 noisy 輸出的容錯

**相關檔案**: `src/services/keyword_service.py` — `LLMKeywordExtractor._parse_response()`（line ~172）

---

### B-012 前端後端 API 整合驗證
**背景**: 前端已完成重構（2026-03-15），對齊 `API_CONTRACT.md` 的全部端點，但目前仍使用 mock 資料（`VITE_MOCK=true`）
**內容**:
- 驗證後端 `/books`, `/chapters`, `/chunks`, `/graph`, `/analysis` 端點回傳格式與前端 types 一致
- 確保 `TaskStatus` 的 `status` 欄位為 `done/error`（非 `completed/failed`）、`progress: 0-100`、`stage: string`
- ~~Segment-based Chunk 回傳（後端需產出 `segments: Segment[]`）~~ ✅ 已實作（ingestion-time paragraph entity linking + stored offsets）
- 前端 `uploadBook(file)` 只傳 file（不含 title），後端 `POST /books/upload` 需對應

**驗收**: `VITE_MOCK=false` 時，Library → Upload → Reader → Analysis → Graph 端到端可跑通

---

### B-015 Chat Agent Prompt & Flow Review
**背景**: Chat Agent 目前會直接傾倒工具原始輸出，未根據使用者問題整理回應。已加 `RESPONSE RULES` 但屬於臨時修補。
**內容**:
- 全面審視 `_SYSTEM_PROMPT`（`chat_agent.py`）的指令品質
- 審視各 tool 的 `description` 是否足夠精確（影響 LLM tool selection 準確率）
- 審視 `QueryPatternRecognizer` fast-route 邏輯與 agent loop 的分工
- 審視 `_build_context_prompt` 動態注入的 context 格式
- 考慮加入 few-shot examples 或輸出格式指引
**目標**: agent 回應品質穩定達到「理解問題 → 選對工具 → 整理答案」三步驟

---

### B-016 Chat Context 切頁殘留
**背景**: 從 Reader 切到 Graph 頁面時，chat agent 仍參考 Reader 的 chapter 資料。
**原因**:
1. 前端 `setPageContext` 用 merge（`{ ...prev, ...ctx }`），Graph 頁面未清除 `chapterId` / `chapterTitle`
2. 後端 `ChatState` 的 `book_id` / `chapter_id` 是 per-session 持久的，新訊息的 context 會覆蓋但舊欄位不會自動清除
**修法方向**:
- 各頁面 `setPageContext` 應重置不屬於該頁面的欄位（如 Graph 清 `chapterId`/`chapterTitle`）
- 後端 WebSocket handler 在 hydrate context 時，將未提供的欄位重置為 `None`

---

**維護者**: William
**最後更新**: 2026-03-30
