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
