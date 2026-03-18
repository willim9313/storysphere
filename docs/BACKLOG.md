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

### B-010 Composite Tool #5（預留）
**背景**: CORE.md 設計 3-5 個 composite tools，目前只有 4 個
**候選**: `GetEventProfileTool`（事件完整檔案：EEP + timeline + participants）

---

### B-011 生產環境配置
**內容**:
- Dockerfile + docker-compose（API + Qdrant + 可選 Neo4j）
- PostgreSQL 遷移（`database_url` 已支援，需測試）
- `uvicorn --workers N` 配合 B-003 TaskStore 持久化

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
| B-010 | Composite Tool #5 | 🟢 低 | 待開始 |
| B-011 | 生產環境配置 | 🟢 低 | 待開始 |
| B-012 | 前端後端 API 整合驗證 | 🟡 中 | 待開始 |

---

### B-012 前端後端 API 整合驗證
**背景**: 前端已完成重構（2026-03-15），對齊 `API_CONTRACT.md` 的全部端點，但目前仍使用 mock 資料（`VITE_MOCK=true`）
**內容**:
- 驗證後端 `/books`, `/chapters`, `/chunks`, `/graph`, `/analysis` 端點回傳格式與前端 types 一致
- 確保 `TaskStatus` 的 `status` 欄位為 `done/error`（非 `completed/failed`）、`progress: 0-100`、`stage: string`
- Segment-based Chunk 回傳（後端需產出 `segments: Segment[]`）
- 前端 `uploadBook(file)` 只傳 file（不含 title），後端 `POST /books/upload` 需對應

**驗收**: `VITE_MOCK=false` 時，Library → Upload → Reader → Analysis → Graph 端到端可跑通

---

**維護者**: William
**最後更新**: 2026-03-18
