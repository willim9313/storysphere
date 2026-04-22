# StorySphere — 已完成 Backlog 歸檔

**用途**: 已完成項目的設計決策記錄，供日後查閱
**建立日期**: 2026-04-01

---

## B-040 符號深度分析（Symbol Deep Analysis）✅ 完成（2026-04-22）
**背景**: B-022 SEP 完成後的下一層 — 以 SEP 為輸入，LLM 產出符號意義命題與跨層連結。架構類比 B-027~B-029（TensionLine → TensionTheme）與 B-026（CEP → CharacterAnalysisResult）。

**內容**:
- `domain/symbol_analysis.py` 新增 `SymbolInterpretation` — 欄位：`theme` / `polarity`(positive|negative|neutral|mixed) / `evidence_summary` / `linked_characters` / `linked_events` / `confidence` / `review_status`(pending|approved|modified|rejected)
- `services/symbol_analysis_service.py` — `SymbolAnalysisService.analyze_symbol(imagery_id, book_id, ...)` cache-first，讀取 SEP → LLM 詮釋 → 存入 `symbol_analysis:{book_id}:{imagery_id}`；`update_interpretation_review()` 支援 HITL
- `agents/analysis_agent.py` — `AnalysisAgent.analyze_symbol()` 入口，async task + metrics tracking
- API endpoints：
  - `POST /api/v1/symbols/{imagery_id}/analyze` → 202 + task_id
  - `GET  /api/v1/symbols/{imagery_id}/analyze/{task_id}` 輪詢
  - `GET  /api/v1/symbols/{imagery_id}/interpretation?book_id=` 取回詮釋
  - `PATCH /api/v1/symbols/{imagery_id}/interpretation` HITL review（可修改 theme/polarity）
- Unraveling DAG：Layer 3 新增 `symbol_analysis_result` 節點，edges `sep→` / `kg_entity→` / `kg_event→`；cache.count_keys 統計 `symbol_analysis:{book_id}:%`

**關鍵設計**:
- LLM 產生的 `linked_characters` / `linked_events` 必須在 SEP 的 `co_occurring_*_ids` 白名單內，超出範圍會被過濾（防幻覺）
- `confidence` clamp 到 [0.0, 1.0]；`polarity` 強制四選一，非法值 fallback 到 `"neutral"`
- tenacity retry 3 次（ValueError / KeyError），透過 `extract_json_from_text` 容錯 LLM 輸出
- 跨書比較（optional）延後評估，複雜度高

**實作**: `src/domain/symbol_analysis.py`（SymbolInterpretation）, `src/services/symbol_analysis_service.py`, `src/agents/analysis_agent.py`（analyze_symbol）, `src/api/routers/symbols.py`（analyze/interpretation endpoints）, `src/api/routers/unraveling.py`（symbol_analysis_result node）

**測試**: `tests/services/test_symbol_analysis_service.py`（9 tests — cache hit/miss/force、LLM ID 過濾、confidence clamp、polarity 校驗、HITL review）、`tests/api/test_symbols.py`（新增 analyze/interpretation/review 測試）、`tests/api/test_unraveling.py`（加入 `symbol_analysis_result` 到 expected nodes）

---

## B-008 Neo4j Backend ✅ 完成
**背景**: ADR-009 設計為 NetworkX（預設）↔ Neo4j（大規模可選），`kg_mode='neo4j'` 有 settings 但未實作。
**內容**:
- `KGServiceBase` ABC 定義 16 個抽象 method
- `Neo4jKGService` 使用 neo4j async driver v6（`properties(r)` 取代 `.data()` 序列化 tuple bug）
- Runtime 切換：`POST /api/v1/kg/switch`，清除 lru_cache，不需重啟
- 雙向遷移：`POST /api/v1/kg/migrate`（nx↔neo4j），async task + task_store 追蹤
- `GET /api/v1/kg/status` 顯示目前 backend、counts、連線狀態
- 前端 `/settings` 頁面：mode toggle、stats、migration 進度
- books.py 移除 `kg._graph` 直接存取，改用公開 API

**注意事項**:
- neo4j driver v6：`result.data()` 將 relationship 序列化為 tuple，需用 `properties(r)` in Cypher
- Pydantic `to_camel` 對 `neo4j_*` 欄位會產生 `neo4J*`（數字後大寫），改用 `graph_db_*` 命名迴避
- 前端型別必須用 `npm run gen:types` 生成，避免手寫欄位名錯誤

**實作**: `src/services/kg_service_base.py`, `kg_service_neo4j.py`, `kg_migration.py`; `src/api/routers/kg_settings.py`; `frontend/src/pages/SettingsPage.tsx`

---

## B-001 Relations Router（API 層遺漏）✅ 完成
**背景**: Phase 8 guide 有規劃但未實作
**內容**:
- `GET /api/v1/relations/paths?source_id={id}&target_id={id}` — 兩實體間關係路徑
- `GET /api/v1/relations/stats?entity_id={id}` — 全圖關係統計（entity_id 可選）

**實作**: `src/api/routers/relations.py`，已掛載至 `main.py`

---

## B-002 Documents Router（API 層遺漏）✅ 完成
**背景**: 架構圖有 Card Details，但沒有文件查詢 API
**內容**:
- `GET /books` — 列出已 ingest 的書籍
- `GET /books/:bookId` — 書籍詳情（含 chapters 列表）

**實作提示**: 呼叫已有的 `DocumentService.list_documents()` 和 `get_document()`
**備註**: 前端已對齊 `API_CONTRACT.md` 的 `/books` API（2026-03-15 重構完成）

---

## B-003 TaskStore 持久化（多進程安全）✅ 完成
**背景**: 目前 `api/store.py` 是 in-memory dict，多 worker (`uvicorn --workers 4`) 時 task 狀態會丟失
**實作**: `SQLiteTaskStore`（WAL mode）+ 啟動時自動清理 TTL 過期 task
**設定**: `task_store_backend`, `task_store_db_path`, `task_store_ttl_days`（預設 30 天）

---

## B-004 Langfuse 監控整合 ✅ 完成
**背景**: 改用 Langfuse（支援自託管）替代 LangSmith
**實作**:
- `src/core/tracing.py` — `configure_langfuse()` + `get_langfuse_handler()` singleton
- `src/agents/chat_agent.py` — `ainvoke`/`astream` 注入 `CallbackHandler`
- `src/agents/analysis_agent.py` — `@_langfuse_observe` 取代 `@traceable`
- Settings: `langfuse_enabled`, `langfuse_public_key`, `langfuse_secret_key`, `langfuse_base_url`
- **文件**: `docs/guides/LANGFUSE_SETUP.md`

---

## B-005 Analysis WebSocket 推送 ✅ 完成
**背景**: ADR-004 設計是 task_id → **WebSocket 主動推送**結果，目前只實作了 polling
**內容**:
- `WS /ws/tasks/{task_id}` — 客戶端訂閱 task_id，server 主動推送 TaskStatus 更新
- `api/ws_manager.py` — ConnectionManager singleton（task_id → list[WebSocket]）
- background task 在 running / done / error 時呼叫 `manager.push()`
- 連接後立即回傳目前狀態；若已 done/error 則直接關閉；進行中每 30s 送 ping

---

## B-006 Metrics API 端點 ✅ 完成
**背景**: Phase 7 `MetricsCollector` 收集了 7 個 KPI，但無法從外部查詢
**內容**:
- `GET /api/v1/metrics` — 回傳 `MetricsCollector.get_stats()` 的快照
- 可選：`GET /api/v1/metrics/history` — 近 N 筆 JSON-line logs（略過，MetricsCollector 未維護 rolling buffer）
**實作**: `src/api/routers/metrics.py`，直接呼叫 `get_metrics().get_stats()`

---

## B-007 多語系 `language` 參數統一傳遞 ✅ 完成
**背景**: CORE.md 多語系策略：透過 `output_language` 參數控制，但 API / Chat Agent 層未統一傳遞
**內容**:
- Chat WebSocket 訊息加入 `language` 欄位（預設 `"en"`）
- `ChatAgent.chat()` / `astream()` 接受 `language` 參數並注入 system prompt
- 同步查詢 API 加入 `?language=zh` query param（影響 summary 等文字輸出）
**備註**: `ChatState.language` 持久保留 session 語言；entity analyze endpoint 加 `language` query param 並傳給 `AnalysisAgent`

---

## B-009 GetChapterSummaryTool 完整實作 ✅ 完成
**背景**: CORE.md 工具目錄 Tool #15 目前是 stub
**內容**: 實作完整邏輯（目前 `DocumentService.get_chapter_summary()` 已存在，接線即可）
**備註**: `chapter_number` 為必填（與 GetSummaryTool 的可選設計不同），已加入 `get_chat_tools()` 作為第 6 個 Retrieval Tool

---

## B-010 Composite Tool #5 ✅ 完成
**背景**: CORE.md 設計 3-5 個 composite tools，目前只有 4 個
**實作**: `GetEventProfileTool` — 輕量級 no-LLM 事件資料聚合器（事件屬性 + 參與者 + timeline context + 段落 + 章節摘要）

---

## B-013 LLMKeywordExtractor 回傳解析強化 ✅ 完成
**背景**: 本地小模型（3B）回傳 JSON 不穩定，`_parse_response` 目前有三個脆弱點：
1. 只處理 ` ``` ` 開頭的 markdown fence，若 LLM 在 JSON 前加說明文字（如 `Here are the keywords:\n{...}`）直接 `JSONDecodeError`
2. 不嘗試從回傳內文中抽取 `{...}` substring，整段不是合法 JSON 就失敗
3. `retry` 只重試 `JSONDecodeError / ValueError / KeyError`，LLM API 錯誤不觸發 retry

**修法**: 在 `_parse_response` 加 regex 抽取第一個 `\{.*\}` block（`re.search(r'\{.*\}', content, re.DOTALL)`）再 parse

**相關檔案**: `src/services/keyword_service.py` — `LLMKeywordExtractor._parse_response()`

---

## B-015 Chat Agent Prompt & Flow Review ✅ 完成
**背景**: Chat Agent 目前會直接傾倒工具原始輸出，未根據使用者問題整理回應。已加 `RESPONSE RULES` 但屬於臨時修補。
**內容**:
- 全面審視 `_SYSTEM_PROMPT`（`chat_agent.py`）的指令品質
- 審視各 tool 的 `description` 是否足夠精確（影響 LLM tool selection 準確率）
- 審視 `QueryPatternRecognizer` fast-route 邏輯與 agent loop 的分工
- 審視 `_build_context_prompt` 動態注入的 context 格式
- 考慮加入 few-shot examples 或輸出格式指引
**完成內容**: LangGraph 低階 API 遷移 + Prompt & Tool Description 全面重構

---

## B-016 Chat Context 切頁殘留 ✅ 完成
**背景**: 從 Reader 切到 Graph 頁面時，chat agent 仍參考 Reader 的 chapter 資料。
**原因**:
1. 前端 `setPageContext` 用 merge（`{ ...prev, ...ctx }`），Graph 頁面未清除 `chapterId` / `chapterTitle`
2. 後端 `ChatState` 的 `book_id` / `chapter_id` 是 per-session 持久的，新訊息的 context 會覆蓋但舊欄位不會自動清除
**修法**:
- 各頁面 `setPageContext` 應重置不屬於該頁面的欄位（如 Graph 清 `chapterId`/`chapterTitle`）
- 後端 WebSocket handler 在 hydrate context 時，將未提供的欄位重置為 `None`

---

## B-023 Event 節點張力欄位強化 ✅ 完成
**背景**: 張力分析的觸發機制依賴 Event 節點的 `tension_signal` 標記。原 ingestion pipeline 提取 Event 節點時未產出此欄位，TEU 組裝無法啟動。
**設計文件**: `docs/notes/tension_analysis_design_notes.md` Section 五
**實作**:
- 更新 `src/domain/models.py` EventNode schema，新增三個欄位：`tension_signal`, `emotional_intensity`, `emotional_valence`
- 更新 `src/pipelines/entity_extractor.py` 的 Event 提取 prompt
- 與 B-031 合併為一次 migration（EventNode schema + ingestion prompt 只改一次）

---

## B-024 Concept 節點 surface/inferred 分類強化 ✅ 完成
**背景**: 張力分析用 Concept 節點描述對立極點，需區分「文本直接說出的概念」（surface）和「LLM 推斷的命題」（inferred），兩者可信度不同。
**設計文件**: `docs/notes/tension_analysis_design_notes.md` Section 四
**實作**:
- 更新 ConceptNode schema，新增：`extraction_method`, `source_spans`, `inferred_by`, `confidence`
- Ingestion pipeline 自動標記 `extraction_method="ner"`

---

## B-025 Pre-Analysis Step：Inferred Concept 節點產生流程 ✅ 完成
**背景**: Inferred Concept 節點（LLM 從段落群推斷的抽象命題）不在 ingestion 時產出，而是 TEU 組裝的前置作業。
**前置依賴**: B-024
**實作**: `src/pipelines/concept_inference.py` — 輸入候選段落群，LLM 產出帶置信度的 Concept 標籤，存入 KG

---

## B-026 TEU Domain Model + 組裝 Pipeline（模式 B 優先）✅ 完成
**背景**: TEU（Tension Evidence Unit）是張力分析的最小單元，描述一個場景內的對立關係。模式 B（按需、單 Event 觸發）優先實作。
**前置依賴**: B-023, B-024, B-025
**實作**:
- `src/domain/tension.py`：`TensionPole`, `TEU`, `TensionLine`, `TensionTheme` Pydantic models
- `src/services/tension_service.py`：`assemble_teu(event_id)` + 存取層

---

## B-027 TensionLine 自動 grouping + HITL 審核介面 ✅ 完成
**背景**: TensionLine 是跨場景的對立模式，由多個 TEU 群集而成。需 HITL 介入防止概念相似但獨立的主題被錯誤合併。
**前置依賴**: B-026
**實作**:
- 自動 grouping：概念相似性（向量距離）+ 承載者重疊兩個維度
- API 端點：`GET /api/v1/tension/lines` + `PATCH /api/v1/tension/lines/{id}/review`
- 前端 HITL 審核元件

---

## B-028 模式 A：全書掃描批次 TEU 組裝 ✅ 完成
**背景**: 對全書所有 `tension_signal != "none"` 的 Event 節點批次組裝 TEU，作為完整分析的入口。
**前置依賴**: B-026
**實作**:
- `TensionService.analyze_book_tensions(book_id)` — `asyncio.gather` 並發批次組裝
- API 端點：`POST /api/v1/tension/analyze` → task_id（異步，WebSocket 推送進度）

---

## B-029 TensionTheme 合成 + Frye/Booker 標籤對應 ✅ 完成
**背景**: TensionTheme 是全書層面的張力主題命題，由多條 TensionLine 合成，LLM 產出命題草稿，人工審核確認。
**前置依賴**: B-027
**實作**:
- `TensionService.synthesize_theme(book_id)`
- API 端點：`GET /api/v1/tension/theme` + `PATCH /api/v1/tension/theme/{id}/review`
- `src/config/mythos.py`（Frye/Booker 標籤，類比 `archetypes.py`）

---

## B-030 張力分析與 Deep Analysis Workflow 完整整合 ✅ 完成
**背景**: 將 B-023 ~ B-029 所有元件串連為完整端到端工作流：ingestion → TEU → TensionLine（HITL）→ TensionTheme（人工審核）。
**前置依賴**: B-028, B-029
**實作**:
- 完整流程文件：`docs/guides/PHASE_10_TENSION_ANALYSIS.md`
- 前端：張力分析儀表板（TensionLine 軌跡圖、TEU 列表、TensionTheme 命題展示）

---

## B-031 Event 節點敘事學欄位預留 ✅ 完成（已與 B-023 合併）
**背景**: Kernel/Satellite 分類和熱奈特時序分析都依賴 Event 節點的新欄位，應在 ingestion 時以預設值填入。
**設計文件**: `docs/notes/narratology_analysis_design_notes.md` Section 五
**實作**（與 B-023 合併為一次 migration）:
- 更新 `src/domain/models.py` EventNode，新增：`narrative_weight`, `narrative_weight_source`, `story_time`
- 新增 `StoryTimeRef` schema（`relative_order`, `time_anchor`, `absolute_time`, `confidence`）

---

## B-032 Ingestion prompt 時間線索提取預留 ✅ 完成
**背景**: 熱奈特時序分析需要故事時間軸，ingestion 時提取文本中已存在的時間線索成本低。
**實作**: `src/services/extraction_service.py` — `story_time_hint` 欄位已在 Event 提取 prompt 中（確認實作時發現已完成）

---

## B-033 Kernel/Satellite 第一階段：摘要啟發式分類 ✅ 完成
**背景**: 現有層級摘要隱含粗略重要性分層，直接作為 Kernel/Satellite 第一階段信號。
**實作**:
- `src/domain/narrative.py`：`NarrativeStructure`, `HeroJourneyStage`, `ProppFunctionRef`, `KernelSatelliteResult`
- `src/services/narrative_service.py`：`classify_by_heuristic(document_id)`, `get_kernel_spine(document_id)`

---

## B-034 Kernel/Satellite 第二階段：LLM 細化分類 ✅ 完成
**背景**: 啟發式結果有誤差，特別是出現在章節摘要但語義上是渲染性的事件。
**實作**: `NarrativeService.refine_with_llm()` — 預設對所有 satellite 進行 LLM 二次判斷；LLM 優先，分歧以 WARNING 記錄

---

## B-035 坎伯英雄旅程 LLM 結構對應 ✅ 完成
**背景**: 輸入章節摘要序列，LLM 輸出英雄旅程階段映射。
**實作**:
- `src/config/hero_journey.py`：12 階段 loader + `get_hero_journey_summary()`
- `src/config/hero_journey/hero_journey_{en,zh}.json`：階段定義
- `NarrativeService.map_hero_journey(document_id)`：章節範圍允許重疊；無證據的階段省略

---

## B-036 NarrativeStructure 節點儲存 + 查詢介面 ✅ 完成
**背景**: 整合 Kernel/Satellite 和英雄旅程結果，提供 API 查詢介面。
**實作**:
- `src/api/schemas/narrative.py`：request schemas
- `src/api/routers/narrative.py`：9 個端點（async classify/refine/hero-journey + polling + sync kernel-spine + GET/PATCH structure）
- `NarrativeService.get_cached_structure()` + `update_review()`

---

## B-037 熱奈特時序分析（倒敘/預敘識別）✅ 完成
**背景**: 文本位置排名 vs 故事時間排名的差值，量化倒敘/預敘。
**前置條件**: story_time_hint 覆蓋率 ≥ 60%（透過 GET /narrative/temporal/coverage 確認）
**實作**:
- `src/domain/narrative.py`：`TemporalAnalysis`, `TemporalDisplacement`
- `NarrativeService.check_temporal_coverage()` + `analyze_temporal_order()`
- API 端點：`POST /api/v1/narrative/temporal` + `GET /narrative/temporal/coverage`

---

## B-038 敘事結構視覺化 + Deep Analysis Workflow 完整整合 ✅ 完成
**背景**: 將敘事學模組整合為端到端工作流並提供入口。
**實作**:
- `AnalysisAgent.analyze_narrative(document_id)` — 依序執行 heuristic → LLM refine → hero journey
- `AnalysisAgent.__init__` 加入 `narrative_service` 參數
- `docs/guides/PHASE_11_NARRATOLOGY.md`：完整流程文件

---

## B-022 SEP Domain Model + 組裝 Pipeline ✅ 完成
**背景**: 符號學原止於原始提取（`ImageryEntity` + 共現圖），缺乏結構化的語境 profile，無法作為 LLM 詮釋的輸入。本 ticket 對應 B-026（TEU 組裝）的符號學等價物，只做結構化、不做 LLM 詮釋。下游的 LLM 詮釋步驟拆分為 B-040。
**前置依賴**: B-020, B-021（均已完成）

**實作**:
- `src/domain/symbol_analysis.py`：`SEP`（Symbol Evidence Profile）+ `SEPOccurrenceContext`，欄位包含 `imagery_id`, `book_id`, `term`, `imagery_type`, `frequency`, `occurrence_contexts`（段落文字 + 章節位置）、`co_occurring_entity_ids`、`co_occurring_event_ids`、`chapter_distribution`、`peak_chapters`
- `SymbolService.assemble_sep(imagery_id, book_id, doc_service, kg_service, cache)` — `asyncio.gather` 並行拉取 imagery + occurrences + document + events，組裝 SEP 後存入 `AnalysisCache`（key: `sep:{book_id}:{imagery_id}`）
- `SymbolService.get_sep(imagery_id, book_id, cache)` — cache 查詢
- `GET /api/v1/symbols/{imagery_id}/sep?force=false` — 查詢已組裝的 SEP；cache miss 時即時組裝並持久化
- Unraveling DAG：Layer 2 新增 `sep` 節點（counts: analyzed / total_imagery），邊 `symbols → sep`、`kg_entity → sep`；`cache.count_keys(f"sep:{book_id}:%")` 計數

**設計決策**:
- SEP 存入 `AnalysisCache` 而非 SQLite，與 CEP/EEP/TEU 一致
- `co_occurring_entity_ids` 來源：在 imagery occurrence 所屬 paragraph 的 `paragraph.entities` 欄位；`co_occurring_event_ids` 取章節交集（事件所屬 chapter 出現在 imagery 的 `chapter_distribution` 鍵中）
- `peak_chapters` 取 top 3（`_SEP_PEAK_CHAPTER_COUNT`）
- `assemble_sep` 的依賴透過方法參數注入（類比 `TensionService.assemble_teu`），保持 `SymbolService` 仍為純資料層 + 組裝入口

**測試**: `tests/services/test_symbol_service.py::TestAssembleSEP`（5 案例）+ `tests/api/test_symbols.py::TestSEPEndpoint`（2 案例）

**後續**: B-040 LLM 詮釋以 SEP 為輸入，完成後需在 unraveling DAG 補 `sep → symbol_analysis_result` 邊

**實作**: `src/domain/symbol_analysis.py`, `src/services/symbol_service.py`, `src/api/routers/symbols.py`, `src/api/routers/unraveling.py`

---

## B-039 展開卷軸（Unraveling）— 資料透明度 DAG ✅ 完成
**背景**: 系統為每本書建立的資料量體對用戶不可見，功能不可用時也難以診斷是哪個資料層尚未建立。
**實作**:
- `GET /api/v1/books/{book_id}/unraveling` — 聚合端點，兩輪並行查詢（服務計數 + cache key 計數）組裝 manifest JSON
- 5 層 DAG 節點（layer 0–4）：原生文本層（book_meta/chapters/paragraphs）、知識抽取層（summaries/keywords/symbols + KG compound group）、分析中間層（CEP/EEP/TEU）、合成結果層（character/causality/impact/tension/narrative/hero-journey/temporal）、書籍層面合成（tension_theme/chronological_rank）
- KG 子節點（kg_entity/kg_concept/kg_relation/kg_event/kg_temporal_relation）統一放入 `kg_features` compound group
- 前端 Cytoscape.js DAG 視圖，支援節點點擊高亮與 counts 展示
- `AnalysisCache.count_keys(pattern)` 非破壞性計數（含 TTL 過濾）
- TEU 計數特殊處理：fan-out per event_id（`teu:{event_id}` 鍵）並行查詢後加總

**設計決策**:
- Relation count v1 使用全域 `kg_service.relation_count`（KGService 無 document_id filter），meta 標注 `"scope": "global"`
- Symbol occurrence count 用 `sum(e.frequency for e in imagery_entities)`，避免載入所有 SymbolOccurrence

**實作**: `src/api/routers/unraveling.py`; `frontend/src/api/unraveling.ts`

---

## B-012 前端後端 API 整合驗證 ✅ 完成
**背景**: 前端已完成重構（2026-03-15），對齊 `API_CONTRACT.md` 的全部端點，但目前仍使用 mock 資料（`VITE_MOCK=true`）
**驗收結論**:
- 所有端點回傳格式（camelCase）與前端 types 一致
- `TaskStatus.status` 為 `pending|running|done|error`，符合預期
- `EventAnalysisDetail` 後端已手動構建 camelCase dict，完全對應
- `uploadBook(file, title)` 前端傳兩欄位，後端 `title` 為 Optional，相容
- `.env.local` 中 `VITE_MOCK` 已註解（mock 關閉）
- Segment-based Chunk 回傳已實作（ingestion-time paragraph entity linking + stored offsets）

---

## B-017 意象實體識別策略研究（符號學前置依賴）✅ 完成
**背景**: 符號學分析模組的核心技術挑戰。評估三種識別策略（詞嵌入聚類、LLM 輔助標注、人工種子+擴展）。
**設計文件**: `docs/notes/symbolic_analysis_design_notes.md` Section 四
**結論**: 採用 LLM 輔助標注（主）+ 詞嵌入聚類（同義詞合併），為 B-018~B-022 的前置依賴。

---

## B-018 ImagerEntity Domain Model 設計 ✅ 完成
**背景**: 符號學模組需要新的實體類型表示意象實體，與現有 `Entity`（人物/地點）平行但語意不同。
**實作**:
- `src/domain/imagery.py`：`ImageryType` enum、`ImageryEntity`、`SymbolOccurrence`、`SymbolCluster`（純 Pydantic）
- 持久層：`src/services/symbol_service.py`（aiosqlite，兩張表：`imagery_entities` + `symbol_occurrences`）

---

## B-019 符號學第一層：候選符號發現 Pipeline ✅ 完成
**背景**: 三層架構的第一層，回答「有什麼值得追蹤？」。
**實作**:
- `src/services/imagery_extractor.py`：LLM 提取 + 貪心余弦相似度聚類（EmbeddingGenerator）
- `src/pipelines/symbol_discovery/pipeline.py`：`SymbolDiscoveryPipeline(BasePipeline)`，章節順序處理
- `src/workflows/ingestion.py`：新增 Step 3b（progress=75），`skip_symbols=True` 可跳過；`IngestionResult.imagery_extracted`

---

## B-020 符號共現網絡建構（Layer 2）✅ 完成
**背景**: 三層架構的第二層，回答「這些符號之間有什麼關係？」。
**實作**:
- `src/services/symbol_graph_service.py`：`SymbolGraphService`，on-demand `build_graph()`，NetworkX `DiGraph`
- 與 KGService 的 EntityNode 完全獨立，作為平行圖層

---

## B-021 詮釋輔助介面（Layer 3）— 符號時間軸 ✅ 完成
**背景**: 三層架構的第三層，組織統計結果為可讀格式。系統只呈現觀察，不提供詮釋。
**實作**:
- `src/api/schemas/symbols.py`：`ImageryEntityResponse`、`ImageryListResponse`、`SymbolTimelineEntry`、`CoOccurrenceEntry`（snake_case）
- `src/api/routers/symbols.py`：`GET /symbols`、`GET /symbols/{id}/timeline`、`GET /symbols/{id}/co-occurrences`
- `src/api/deps.py`：`SymbolServiceDep`、`SymbolGraphServiceDep`
- `frontend/src/api/symbols.ts` + `frontend/src/pages/SymbolsPage.tsx`：符號意象分析頁面
