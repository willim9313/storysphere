# StorySphere 核心設計文檔

**用途**: 架構決策的索引與摘要 —— 「為什麼是這樣設計的」
**更新日期**: 2026-08-14

---

## 本文件的定位

**這份文件擁有的是決策與理由，不是規格。**

凡是程式碼或自動產生的文件能說得更準的東西（型別、欄位、端點、工具清單、目錄結構），
這裡一律**只給指標，不複製**——複製品會漂移，而讀者無從察覺。

現況要查什麼，去哪裡看：

| 想知道 | 準據 |
|--------|------|
| API 端點、請求／回應形狀 | [`docs/API_CONTRACT.md`](API_CONTRACT.md) |
| 前端頁面規格、導航結構 | [`docs/UI_SPEC.md`](UI_SPEC.md) |
| CSS token 與主題對照 | [`docs/DESIGN_TOKENS.md`](DESIGN_TOKENS.md) |
| TypeScript 型別 | `frontend/src/api/generated.ts`（由 openapi.json 產生） |
| ChatState 欄位 | `backend/storysphere/agents/states.py` |
| 工具清單與 description | `backend/storysphere/tools/`、[`appendix/TOOLS_CATALOG.md`](appendix/TOOLS_CATALOG.md) |
| 領域模型 | `backend/storysphere/domain/` |
| 待辦事項 | [`docs/BACKLOG.md`](BACKLOG.md)（已結案者見 [`BACKLOG_ARCHIVE.md`](BACKLOG_ARCHIVE.md)） |
| 環境設置與執行 | [`README.md`](../README.md#quick-start) |

> `docs/API_CONTRACT.md` 與 `docs/DESIGN_TOKENS.md` 的同步由
> `tests/docs/test_docs_drift.py` 自動把關；本文件不在該檢查範圍內，因為它刻意不含規格。

---

## 這是什麼

**StorySphere** 是小說分析系統，用 Agent-Driven 架構自動提取與分析小說內容。

- 解析 PDF / DOCX，切分章節與段落
- 提取實體、關係、事件，建成知識圖譜
- 深度分析：角色、事件、象徵、敘事結構
- Chat 對話式探索
- 前端視覺化：閱讀、圖譜、時間軸、張力、象徵、敘事等頁面

**技術棧**：LangChain + LangGraph · Gemini（主）/ OpenAI / Anthropic（備援）·
FastAPI · Qdrant · NetworkX ↔ Neo4j 可切換 · React 19 + TypeScript + Vite

完整依賴見 [`pyproject.toml`](../pyproject.toml) 與 [ADR-009](appendix/ADR_009_FULL.md)。

---

## 9 個架構決策（ADR 摘要）

每份 ADR 都是 Context → Decision → Rationale → Consequences 的完整格式，並帶有狀態與日期。
**決策被推翻時，ADR 本體會加上註明日期與 PR 的更正區塊**——下方摘要已納入這些更正。

### [ADR-001: 系統架構轉向 Agent-Driven](appendix/ADR_001_FULL.md)
**決策**: LangChain + LangGraph，三條並行處理路徑
- Map/Card Query — 同步，純數據查詢
- Deep Analysis — 非同步，優先讀快取
- Chat — 串流，Reasoning Agent

### [ADR-002: Pipelines & Workflows 分層](appendix/ADR_002_FULL.md)
**決策**: 職責分離 —— **Pipelines** = 確定性 ETL（文件處理、特徵抽取、KG 建構）；
**Workflows** = 業務編排（可能涉及 Agent）。

### [ADR-003: 工具層設計](appendix/ADR_003_FULL.md) ⭐
**決策**: 細粒度基礎工具 + 組合工具 + Services thin wrapper。
業務邏輯放在 Services，工具只負責驗證輸入、轉發、格式化輸出。
→ 設計原則見 [`guides/tools-layer.md`](guides/tools-layer.md)

### [ADR-004: Deep Analysis 執行策略](appendix/ADR_004_FULL.md)
**決策**: 快取優先 + 非同步任務。未命中則建任務、回 taskId、背景執行、輪詢取結果。

> **快取沒有 TTL。** 條目保留至明確 `invalidate()`，由重跑 pipeline 步驟或刪書觸發
> （`services/cache_invalidation.py`）。

### [ADR-005: Chat 上下文管理](appendix/ADR_005_FULL.md) ⭐
**決策**: 記憶只存在於同一段對話內，無跨對話記憶。ChatState 負責對話歷史、
實體追蹤與指代消解（`current_focus_entity`）。

> **沒有工具結果快取。** ChatState 的欄位以 `backend/storysphere/agents/states.py` 為準；
> 除對話歷史與實體追蹤外，另含頁面上下文（book / chapter / page_context / analysis_tab）
> 與語言欄位，讓 chat 知道使用者正在看哪一頁。

### [ADR-006: 延遲預期與性能目標](appendix/ADR_006_FULL.md)
**決策**: Sequential → Parallel 漸進式優化，以 `asyncio.gather` 並行化工具呼叫。
→ 策略見 [`guides/performance.md`](guides/performance.md)；實際指標見 [`guides/monitoring.md`](guides/monitoring.md)

### [ADR-007: 風險管理與降級](appendix/ADR_007_FULL.md) ⭐
**決策**: 預防、檢測、降級三層。六大風險中兩項已落地為程式碼：
- JSON 解析脆弱性 → 4 步 fallback chain（`core/utils/output_extractor.py`）
- Prompt Injection → DataSanitizer（`core/utils/data_sanitizer.py`）

### [ADR-008: 工具選擇準確性](appendix/ADR_008_FULL.md) ⭐
**決策**: 五大策略提升選擇準確率 —— 精確 description（含適用／不適用場景）、
限制工具集、few-shot、查詢模式識別、選擇後驗證。

> 其中「查詢模式識別」**不做快速路由**：`QueryPatternRecognizer` 只負責實體追蹤
> （更新 `current_focus_entity` 供代名詞解析），回應一律由 agent loop 生成。

### [ADR-009: Tech Stack](appendix/ADR_009_FULL.md) ⭐
**決策**: MVP 輕量、生產可選升級。
- 套件管理 **uv**（不用 pip）
- 關聯式 SQLite → PostgreSQL（可選）
- 向量 Qdrant（in-memory / local file / remote 三模式）
- 知識圖譜 NetworkX（預設）↔ Neo4j（可執行期切換，見 API_CONTRACT #18b）
- 任務 FastAPI BackgroundTasks

---

## 系統分層

```
┌─────────────────────────────────────────────┐
│  Frontend (React SPA)                       │
│  閱讀 / 圖譜 / 角色 / 事件 / 時間軸 /        │
│  張力 / 象徵 / 敘事 / 建構概覽 …             │
└─────────────────────────────────────────────┘
                    ↕  REST + WebSocket
┌─────────────────────────────────────────────┐
│  API Layer (FastAPI)                        │
│  同步查詢 · 非同步任務 · Chat WebSocket      │
└─────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│  Agents          │  Workflows               │
│  ChatAgent       │  IngestionGraph (HITL)   │
│  AnalysisAgent   │                          │
└─────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│  Tools Layer                                │
│  graph / retrieval / analysis / composite   │
└─────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│  Services Layer（業務邏輯）                  │
│  KGService · DocumentService · Analysis …   │
└─────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│  Data                                       │
│  KG (NetworkX/Neo4j) · Qdrant · SQLite      │
└─────────────────────────────────────────────┘
```

**依賴方向**：`tools/ → services/`、`pipelines/ → services/`；tools 不得 import pipelines。

目錄結構請直接看 `backend/storysphere/`——這裡不複製一份會漂移的樹狀圖。

---

## KG Schema

```
EntityType   (6): character, location, organization, object, concept, other
RelationType (10): family, friendship, romance, enemy, ally, subordinate,
                   located_in, member_of, owns, other
```

定義在 `backend/storysphere/domain/entities.py` 與 `domain/relations.py`。
演進備註見 [ADR-002](appendix/ADR_002_FULL.md#kg-schema-定義)。

---

## 架構參考（依主題）

`docs/guides/` 下的架構文件記錄**各子系統的設計與理由**，全部已實作。
檔頭標明狀態與實作位置；部分文件以實作前的語氣書寫，請當設計理由讀，不是待辦清單。

| 主題 | 文件 |
|------|------|
| 文件處理與特徵抽取 | [pipelines.md](guides/pipelines.md) |
| 關鍵詞抽取與階層聚合 | [keyword-extraction.md](guides/keyword-extraction.md) |
| Agent 工具層 | [tools-layer.md](guides/tools-layer.md) |
| Chat Agent | [chat-agent.md](guides/chat-agent.md) |
| 深度分析：角色 | [deep-analysis-character.md](guides/deep-analysis-character.md) |
| 深度分析：事件 | [deep-analysis-event.md](guides/deep-analysis-event.md) |
| 時序與全域時間線 | [temporal-timeline.md](guides/temporal-timeline.md) |
| 張力分析 | [tension-analysis.md](guides/tension-analysis.md) |
| 敘事學分析 | [narratology.md](guides/narratology.md) |
| 效能與並行化 | [performance.md](guides/performance.md) |
| 監控與可觀測性 | [monitoring.md](guides/monitoring.md) |
| API 分層（原始設計） | [api-layer.md](guides/api-layer.md) |

**操作指南**（與架構參考分開）：
[TESTING.md](guides/TESTING.md) · [API_TESTING.md](guides/API_TESTING.md) ·
[LANGFUSE_SETUP.md](guides/LANGFUSE_SETUP.md) · [LANGSMITH_SETUP.md](guides/LANGSMITH_SETUP.md)

---

## 附錄

- [ADR-001 ~ ADR-009 完整版](appendix/)
- [工具目錄（完整 description）](appendix/TOOLS_CATALOG.md)
- [並行化實現細節](appendix/PARALLEL_IMPL.md)

---

## 多語系策略

- **Core prompts**: 統一英文
- **Output language**: 由 `output_language` 參數控制
- **UI**: i18n 於前端處理（`frontend/src/i18n/`），不影響 core

---

**維護者**: William
