# StorySphere — 已完成 Backlog 歸檔

**用途**: 已完成項目的設計決策記錄，供日後查閱
**建立日期**: 2026-04-01

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
