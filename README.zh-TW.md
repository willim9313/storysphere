# StorySphere

> **智能小說分析系統 — Agent 驅動架構**

**Language:** [English](README.md) | 繁體中文

---

## 概覽

StorySphere 讀入小說（PDF / DOCX / EPUB），透過多階段 ETL 管線抽取實體、關係、事件、符號與關鍵字，並以 REST + WebSocket API 與 React 前端呈現分析結果。

**主要能力：**
- **文件攝取** — PDF / DOCX / EPUB 解析、章節偵測、段落級切分
- **知識圖譜** — 自動抽取角色 / 地點 / 物品及其關係（NetworkX 或 Neo4j）
- **陣營偵測** — 社群演算法自動識別角色派系分佈
- **語意搜尋** — 段落級向量 embedding（Qdrant），並支援 SQLite 全文檢索作為備援
- **深度分析** — 角色 CEP 抽取、Jung / Schmidt 原型分類、成長弧線；事件因果與影響分析
- **符號分析** — 意象偵測、符號圖譜、跨章節出現趨勢
- **張力分析** — 敘事張力弧線、衝突極點識別、主題綜合
- **敘事結構** — 英雄旅程對位、情節骨幹、時序排列、人物聲音側寫、認識論狀態追蹤
- **建構概覽** — 管線診斷儀表板（各 pipeline 進度 / 阻斷點 / 後續 CTA）
- **對話 Agent** — LangGraph 串流 chat agent，具工具存取能力，任一書籍頁面皆可使用
- **視覺化** — 知識圖譜、事件時間軸、各分析面板

> **目前運行在輕量模式（lightweight）**：Qdrant 以本地檔案儲存，KG 後端固定為 NetworkX，無需額外外部服務。也支援 standard 模式（遠端 Qdrant、可選 Neo4j），詳見〈部署模式〉。

---

## 技術棧

| 層級 | 技術 |
|---|---|
| LLM 協調 | LangChain · LangGraph · Gemini（主要）· GPT-4o-mini · Claude · Local LLM（Ollama / llama.cpp） |
| Backend API | FastAPI · Uvicorn · WebSocket |
| 知識圖譜 | NetworkX（預設）· Neo4j（選用，僅 standard 模式） |
| 向量資料庫 | Qdrant（lightweight 模式為本地檔案 / standard 模式為遠端服務） |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` |
| 儲存 | SQLite（aiosqlite · SQLAlchemy） |
| 關鍵字抽取 | YAKE · TF-IDF · LLM · Composite |
| 追蹤 | Langfuse（選用） |
| 前端 | React 19 · TypeScript · Vite · React Router v6 · TanStack Query |
| 圖形視覺化 | Cytoscape.js（+ fcose layout）· D3 |
| 前端多語系 | i18next / react-i18next（英文 + 繁體中文） |
| Python 套件管理 | **uv** |

---

## 架構

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                           │
│  Library · Reader · Graph · Timeline · Analysis · Symbols ·     │
│  Tension · Narrative · Search · Methodology · Build Overview ·  │
│  Upload · Settings · Token Usage      （ChatWidget 掛載於        │
│                                         每個書籍頁面）             │
└────────────────────────┬────────────────────────────────────────┘
                         │  HTTP / WebSocket
┌────────────────────────▼────────────────────────────────────────┐
│                FastAPI  (backend/storysphere/api/)               │
│  /api/v1/books  /entities  /relations  /documents  /search      │
│  /analysis  /narrative  /tension  /symbols  /kg  /settings      │
│  /tasks  /metrics  /token-usage                                 │
│  WS /ws/chat                                                     │
└──┬──────────────────────┬──────────────────────┬───────────────┘
   │                      │                      │
   ▼                      ▼                      ▼
Chat Agent           Analysis Agent        Ingestion Workflow
（LangGraph，        （cache-first，        （ETL Pipelines，
  串流）               async, SQLite）        LangGraph + checkpointer）
                          │                      │
                          └──────────┬───────────┘
                                     ▼
                                  Services
                          KG · Document · Vector
                          Summary · Symbol · Tension
                          Narrative · Faction · Analysis
                          Epistemic · VoiceProfiling
                                     │
                          ┌──────────┴──────────┐
                          ▼                     ▼
                   NetworkX / Neo4j          Qdrant
                   （知識圖譜）              （向量資料庫）
```

### 查詢路徑

| 路徑 | 延遲 | 實作方式 |
|---|---|---|
| **Map / Card 查詢** | < 100 ms | 同步 REST，純資料查詢 |
| **深度分析** | 2–5 秒（快取命中 < 100 ms） | 非同步任務，SQLite 快取（無 TTL） |
| **對話** | 串流，2–5 秒 | LangGraph agent，透過 WebSocket |

---

## 專案結構

```
storysphere/
├── backend/
│   └── storysphere/            # 單一 Python 命名空間（import 皆為 from storysphere.*）
│       ├── api/                # FastAPI app、routers、schemas、task store
│       │   ├── routers/            # 18 個 router — 詳見下方〈API 概覽〉
│       │   └── schemas/            # Pydantic request/response schema（camelCase）
│       ├── agents/
│       │   ├── chat_agent.py           # LangGraph 串流 chat agent（StateGraph + ToolNode）
│       │   ├── chat_agent_base.py      # 共用 prompt / history 建構邏輯
│       │   ├── analysis_agent.py       # cache-first 深度分析協調器
│       │   ├── timeline_agent.py       # 時間軸事件 agent
│       │   ├── pattern_recognizer.py   # 查詢預過濾（實體追蹤）
│       │   └── states.py               # ChatState（Pydantic）
│       ├── services/           # 28 個模組 — 商業邏輯
│       │   ├── kg_service.py / kg_service_base.py / kg_service_neo4j.py
│       │   ├── document_service.py / vector_service.py / summary_service.py
│       │   ├── analysis_service.py / analysis_cache.py / cache_invalidation.py
│       │   ├── symbol_service.py / symbol_analysis_service.py / symbol_graph_service.py
│       │   ├── tension_service.py / narrative_service.py
│       │   ├── faction_service.py / global_timeline_service.py
│       │   ├── epistemic_state_service.py / voice_profiling_service.py
│       │   ├── character_metrics_service.py / link_prediction_service.py
│       │   └── extraction_service.py / keyword_service.py / toc_parser.py
│       ├── tools/               # 23 個 chat agent 工具 — 詳見下方〈工具清單〉
│       │   ├── graph_tools/ (7) · retrieval_tools/ (6) · analysis_tools/ (3)
│       │   └── composite_tools/ (5) · other_tools/ (2)
│       ├── pipelines/           # ETL 管線
│       │   ├── document_processing/   # loader、章節偵測、切分
│       │   ├── feature_extraction/    # embeddings、關鍵字
│       │   ├── knowledge_graph/       # 實體 / 關係抽取與連結
│       │   ├── summarization/         # 章節摘要
│       │   ├── symbol_discovery/      # 意象偵測
│       │   ├── temporal_pipeline.py
│       │   └── concept_inference.py
│       ├── workflows/           # 高階流程協調（LangGraph 攝取流程、HITL 審閱）
│       ├── domain/              # Entity / Relation / Event / Narrative / Tension 等 Pydantic model
│       ├── core/                # 多供應商 LLM client（含 fallback chain）、metrics、tracing
│       └── config/               # Settings（pydantic-settings）、原型 / mythos JSON 設定
├── frontend/
│   ├── src/
│   │   ├── router.tsx      # React Router v6 路由表
│   │   ├── pages/          # LibraryPage · ReaderPage · GraphPage · TimelinePage
│   │   │                   # CharacterAnalysisPage · EventAnalysisPage · SymbolsPage
│   │   │                   # TensionPage · NarrativePage · SearchPage · MethodologyPage
│   │   │                   # BuildOverviewPage · UploadPage · SettingsPage · TokenUsagePage
│   │   ├── components/     # analysis / chat / epistemic / graph / layout / library
│   │   │                   # methodology / narrative / reader / symbols / tension
│   │   │                   # timeline / tasks / toast / ui / upload
│   │   └── contexts/       # ThemeContext、ChatContext、ToastContext
│   └── package.json
├── docs/
│   ├── CORE.md               # 架構決策索引（從這裡開始讀）
│   ├── API_CONTRACT.md       # 前後端 API 規格，唯一真相來源
│   ├── UI_SPEC.md            # UI 元件設計規格
│   ├── DESIGN_TOKENS.md      # CSS token 對照表
│   ├── domain-glossary.md    # 領域術語表
│   ├── BACKLOG.md            # 現行 backlog（已結案項目見 BACKLOG_ARCHIVE.md）
│   ├── plans/                # 高複雜度功能規劃文件存檔
│   ├── guides/                # 各子系統架構參考 ＋ TESTING.md、LANGFUSE_SETUP.md
│   ├── appendix/               # ADR-001 至 ADR-009、工具目錄
│   └── archive/                # 已被取代的規劃文件，保留作歷史
├── tests/                     # 1,392+ 測試（pytest）
├── pyproject.toml
└── .env.example
```

---

## 部署模式

StorySphere 支援兩種部署模式，透過 `DEPLOY_MODE` 環境變數切換。

| | **lightweight（預設）** | **standard** |
|---|---|---|
| Qdrant | 本地檔案（`QDRANT_LOCAL_PATH`） | 外部服務（`QDRANT_URL`） |
| KG 後端 | 固定 NetworkX | NetworkX 或 Neo4j |
| 前置需求 | 僅 Python 環境 | Qdrant 服務需先啟動 |
| 資料遷移 | — | 切換模式需執行 Migration CLI（`/api/v1/kg/migrate`） |

> **目前使用 lightweight 模式。** 首次啟動會從 HuggingFace 下載 embedding model（約 80MB，一次性）。lightweight 模式下**不可**使用多個 Uvicorn worker（`--workers > 1`）— 本地 Qdrant 不支援多行程並行寫入。

---

## 快速開始

### 前置需求

- Python ≥ 3.11
- Node.js ≥ 18
- [`uv`](https://github.com/astral-sh/uv) — Python 套件管理工具
- **Gemini API key**（主要 LLM）— 或使用 OpenAI / Anthropic / 本地 LLM 作為替代

### Backend

```bash
# 1. Clone 並進入專案
git clone <repo-url> && cd StorySphere

# 2. 複製並填寫環境變數
cp .env.example .env
# 編輯 .env — 至少需設定 GEMINI_API_KEY
# DEPLOY_MODE 預設為 lightweight（不需外部 Qdrant）

# 3. 安裝 Python 依賴
uv sync

# 4. 啟動 API server
uv run uvicorn storysphere.api.main:app --host 0.0.0.0 --port 8000 --reload
```

API 文件位於 `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
# 開啟於 http://localhost:5173
```

---

## 環境設定

所有設定從 `.env` 載入（參考 `.env.example`）。重要變數：

| 變數 | 預設值 | 說明 |
|---|---|---|
| `PRIMARY_LLM_PROVIDER` | `gemini` | `gemini` \| `openai` \| `anthropic` \| `local` — fallback 順序為 Gemini → OpenAI → Anthropic → Local |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `OPENAI_API_KEY` | — | OpenAI 備援 |
| `ANTHROPIC_API_KEY` | — | Anthropic 備援 |
| `LOCAL_LLM_MODEL` | `""` | 本地模型名稱（如 `llama3.2`）。留空則停用 |
| `LOCAL_LLM_BASE_URL` | `http://localhost:11434/v1` | Ollama / llama.cpp 端點 |
| `DEPLOY_MODE` | `lightweight` | `lightweight` \| `standard` |
| `QDRANT_LOCAL_PATH` | `./var/qdrant_local` | Qdrant 本地儲存路徑（lightweight 模式） |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant 外部服務（standard 模式） |
| `KG_MODE` | `networkx` | `networkx` \| `neo4j`（lightweight 模式強制為 networkx） |
| `KG_AUTO_SWITCH_THRESHOLD` | `10000` | 實體數超過此門檻建議改用 Neo4j |
| `KG_PERSISTENCE_PATH` | `./var/knowledge_graph.json` | NetworkX KG 快照路徑 |
| `DATABASE_URL` | `sqlite+aiosqlite:///./var/storysphere.db` | 主要 SQLite DB |
| `TASK_STORE_BACKEND` | `sqlite` | `memory` \| `sqlite` — 非同步任務持久化 |
| `KEYWORD_EXTRACTOR_TYPE` | `yake` | `yake` \| `llm` \| `tfidf` \| `composite` \| `none` |
| `LLM_THINKING_ENABLED` | `false` | 啟用 extended reasoning（額外 token 消耗） |
| `LANGFUSE_ENABLED` | `false` | 啟用 Langfuse 追蹤 |
| `CHAT_AGENT_MAX_ITERATIONS` | `10` | ReAct 迴圈上限 |
| `ANALYSIS_CACHE_DB_PATH` | `./var/analysis_cache.db` | 深度分析 SQLite 快取 |
| `APP_HOST` | `127.0.0.1` | 預設僅本機存取；確定需要區網存取才設為 `0.0.0.0` |

---

## API 概覽

所有 HTTP 路由的基礎路徑為 **`/api/v1`**；WebSocket 路由不帶此前綴。

| Router | 路徑 | 用途 |
|---|---|---|
| `books` | `/books` | 上傳、列表、詳情、刪除；章節、圖譜、時間軸、審閱流程、分步重跑、目錄解析、角色建議（規模最大的 router） |
| `unraveling`、`factions`、`character_metrics` | 掛載於 `/books/{id}/...` | 建構概覽儀表板、陣營偵測、角色中心性 |
| `entities` | `/entities` | 列表 / 詳情、關係、時間軸、子圖、關係統計 |
| `relations` | `/relations` | 關係路徑、彙總統計 |
| `documents` | `/documents` | 來源文件列表 / 詳情 |
| `search` | `/search` | 語意（向量）與全文搜尋 |
| `analysis` | `/analysis` | 觸發角色 / 事件深度分析（非同步任務模式） |
| `narrative` | `/narrative` | 分類、精修、英雄旅程、時序排列、kernel spine、HITL 審閱 |
| `tension` | `/tension` | 張力線、TEU、主題綜合、HITL 審閱 |
| `symbols` | `/symbols` | 意象、總覽、時間軸、共現、詮釋 |
| `kg_settings` | `/kg` | KG 後端狀態、切換、遷移 |
| `settings_info` | `/settings` | 執行期設定資訊 |
| `tasks` | `/tasks` | 非同步任務列表、狀態、取消 |
| `metrics` | `/metrics` | 效能指標快照 |
| `token_usage` | `/token-usage` | LLM token 用量統計 |
| `chat_ws` | `WS /ws/chat?session_id=<uuid>` | 串流對話 agent |

完整請求 / 回應規格請見 [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)。

---

## 文本攝取流程

```
Upload PDF / DOCX / EPUB
      │
      ▼
DocumentProcessingPipeline
  ├── Loader（→ 原始文字）
  ├── ChapterDetector
  └── Chunker（段落級）
      │
      ▼
FeatureExtractionPipeline
  ├── EmbeddingGenerator → Qdrant
  └── KeywordExtractor（YAKE / LLM / TF-IDF / Composite）
      │
      ▼
KnowledgeGraphPipeline
  ├── EntityExtractor（LLM，tenacity 重試）
  ├── RelationExtractor（LLM）
  ├── EntityLinker（依正規化名稱 + 別名去重）
  └── ParagraphEntityLinker
      │
      ▼
SummarizationPipeline
  └── ChapterSummarizer（LLM）
      │
      ▼
SymbolDiscoveryPipeline
  └── ImageryDetector → SymbolGraph → 跨章節趨勢
```

---

## 工具清單（23 個 chat agent 工具）

| 類別 | 工具 |
|---|---|
| **Graph**（7） | GetEntityAttrs, GetEntityRelations, GetRelationPaths, GetSubgraph, GetRelationStats, GetEntityTimeline, GetGlobalTimeline |
| **Retrieval**（6） | VectorSearch, GetSummary, GetChapterSummary, GenSummary, GetParagraphs, GetKeywords |
| **Analysis**（3） | GenerateInsight, AnalyzeCharacter, AnalyzeEvent |
| **Composite**（5） | GetEntityProfile, GetEntityRelationship, GetCharacterArc, GetEventProfile, CompareCharacters |
| **Other**（2） | CompareEntities, ExtractEntities |

`AnalyzeCharacter` / `AnalyzeEvent` 僅在有注入 `analysis_agent` 依賴時才會暴露給 chat agent。

---

## 深度分析

### 角色分析
1. **CEP 抽取** — 並行蒐集 KG 資料、向量證據、關鍵字
2. **原型分類** — Jung（12 原型）+ Schmidt（45 原型）JSON 設定
3. **角色弧線** — 時間軸分段成長曲線
4. **聲音側寫** — 語言風格側寫
5. **認識論狀態** — 追蹤角色知道什麼、何時知道的
6. **側寫摘要** — 自然語言綜合輸出

### 事件分析
1. **EEP 抽取** — 從 KG + 向量搜尋取得事件證據
2. **因果分析** — 因果鏈推理
3. **影響分析** — 對角色與情節的短 / 長期影響

分析結果快取於 SQLite，無 TTL —— 條目保留至明確失效（重跑 pipeline 步驟或刪除書籍時觸發）。快取命中回傳時間 < 100 ms。

---

## 監控

`backend/storysphere/core/metrics.py` — `MetricsCollector` 單例（stdlib-only，thread-safe）

- 記錄：工具選擇、工具執行、快取事件、Agent 查詢、LLM 呼叫
- 統計：P50 / P95 / P99 延遲、成功率、快取命中率
- JSON-line 日誌輸出至 `storysphere.metrics` logger
- HTTP endpoint：`GET /api/v1/metrics`

選用性分散式追蹤：[Langfuse](docs/guides/LANGFUSE_SETUP.md)（`LANGFUSE_ENABLED=true`）。

---

## 測試

```bash
# 跑全部測試
uv run pytest

# 顯示覆蓋率
uv run pytest --cov=backend/storysphere --cov-report=term-missing

# 跳過會呼叫真實外部 LLM API 的測試
uv run pytest -m "not integration"

# 包含預設略過的 Neo4j 相關測試
uv run pytest --neo4j
```

目前測試數：**1,392 個測試**，涵蓋 agents、services、tools、pipelines、workflows 與 API endpoints。撰寫慣例請見 [`docs/guides/TESTING.md`](docs/guides/TESTING.md)。

---

## 文件

- [`docs/CORE.md`](docs/CORE.md) — 架構決策索引 —— 記錄「為什麼這樣設計」（從這裡開始讀）
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — 前後端 API 規格，唯一真相來源
- [`docs/UI_SPEC.md`](docs/UI_SPEC.md) — UI 元件設計規格
- [`docs/DESIGN_TOKENS.md`](docs/DESIGN_TOKENS.md) — CSS token 對照表
- [`docs/domain-glossary.md`](docs/domain-glossary.md) — 領域術語表
- [`docs/BACKLOG.md`](docs/BACKLOG.md) — 現行 backlog（已結案項目見 `docs/BACKLOG_ARCHIVE.md`）
- [`docs/appendix/`](docs/appendix/) — ADR-001 至 ADR-009、工具目錄、並行實作說明
- [`docs/plans/`](docs/plans/) — 高複雜度功能規劃文件存檔
- [`docs/guides/`](docs/guides/) — 各子系統的架構參考（pipelines、工具層、chat agent…）＋ 測試規範與 Langfuse / LangSmith 設定

---

## License

[MIT](LICENSE)
