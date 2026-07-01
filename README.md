# StorySphere

> **Intelligent Novel Analysis System — Agent-Driven Architecture**
> 智能小說分析系統，以 Agent 驅動架構自動解析、理解並探索小說內容。

---

## Overview / 概覽

StorySphere ingests novels (PDF / DOCX), runs a multi-stage ETL pipeline to extract entities, relations, events, symbols, and keywords, then exposes the results through a streaming REST + WebSocket API and a React frontend.

主要能力：
- **自動解析** PDF / DOCX 小說，偵測章節、切分段落
- **知識圖譜** — 自動抽取角色、地點、物品及其關係
- **陣營偵測** — 社群演算法自動識別角色派系分佈
- **向量語義搜尋** — 段落級 embedding (Qdrant)
- **深度分析** — 角色 CEP、Jung/Schmidt 原型分類、成長弧線；事件因果分析
- **符號分析** — 意象偵測、符號圖譜、跨章節出現趨勢
- **張力分析** — 敘事張力弧線、衝突極點識別
- **敘事分析** — 人物聲音側寫、認識論狀態追蹤
- **建構概覽** — 管線狀態診斷儀表板（各 pipeline 進度 / 阻斷點 / 觸發 CTA）
- **視覺化** — 知識圖譜、事件時間軸、分析面板

> **目前運行在輕量模式（lightweight）**：Qdrant 以本地檔案儲存，KG 後端固定為 NetworkX，無需額外外部服務。預計後續切回 standard 模式。

---

## Tech Stack / 技術棧

| Layer | Technology |
|---|---|
| LLM Orchestration | LangChain · LangGraph · Gemini 2.0 Flash (primary) · GPT-4o-mini · Claude Haiku · Local LLM (Ollama / llama.cpp) |
| Backend API | FastAPI · Uvicorn · WebSocket |
| Knowledge Graph | NetworkX (default) · Neo4j (optional, standard mode only) |
| Vector DB | Qdrant (local file in lightweight mode / remote in standard mode) |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` |
| Storage | SQLite (aiosqlite · SQLAlchemy) |
| Keyword Extraction | YAKE · TF-IDF · LLM · Composite |
| Frontend | React 19 · TypeScript · Vite · React Router |
| Package Manager (Python) | **uv** |

---

## Architecture / 架構

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                           │
│  Library · Reader · Graph · Timeline · Analysis · Symbols ·     │
│  Tension · Build Overview · Upload · Settings · Token Usage     │
└────────────────────────┬────────────────────────────────────────┘
                         │  HTTP / WebSocket
┌────────────────────────▼────────────────────────────────────────┐
│                    FastAPI  (backend/storysphere/api/)              │
│  /books  /entities  /relations  /search  /analysis             │
│  /narrative  /tension  /symbols  /factions  /unraveling        │
│  /kg_settings  /tasks  /metrics  /token-usage                  │
│  WS /ws/chat (暫停中)  WS /ws/tasks/{id}                        │
└──┬──────────────────────┬──────────────────────┬───────────────┘
   │                      │                      │
   ▼                      ▼                      ▼
Chat Agent           Analysis Agent        Ingestion Workflow
(LangGraph,          (cache-first,         (ETL Pipelines)
 暫停中)              async, SQLite)
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
                   (Knowledge Graph)      (Vector DB)
```

### Query Paths / 查詢路徑

| Path | Latency | Implementation |
|---|---|---|
| **Map / Card Query** | < 100 ms | Sync REST, pure data lookup |
| **Deep Analysis** | 2–5 s (cache hit < 100 ms) | Async, 7-day SQLite cache, WebSocket push |
| **Chat** | Streaming 2–5 s | LangGraph Agent, WebSocket（暫停中） |

---

## Project Structure / 專案結構

```
storysphere/
├── backend/
│   └── storysphere/       # 單一 Python 命名空間（import 皆為 from storysphere.*）
│       ├── api/               # FastAPI routers, schemas, WebSocket managers
│       ├── agents/
│       │   ├── chat_agent.py       # LangGraph streaming chat agent（暫停中）
│       │   ├── chat_agent_base.py  # Chat agent base class
│       │   ├── analysis_agent.py   # Cache-first deep analysis orchestrator
│       │   ├── timeline_agent.py   # Timeline event agent
│       │   ├── pattern_recognizer.py # Pattern recognition utilities
│       │   └── states.py           # ChatState (Pydantic)
│       ├── services/          # Business logic
│       │   ├── kg_service.py / kg_service_neo4j.py
│       │   ├── document_service.py / vector_service.py / summary_service.py
│       │   ├── analysis_service.py / analysis_cache.py
│       │   ├── symbol_service.py / symbol_analysis_service.py / symbol_graph_service.py
│       │   ├── tension_service.py / narrative_service.py
│       │   ├── faction_service.py / global_timeline_service.py
│       │   ├── epistemic_state_service.py / voice_profiling_service.py
│       │   └── extraction_service.py / keyword_service.py
│       ├── tools/
│       │   ├── graph_tools/        # 7 tools: entity/relation/subgraph/global-timeline queries
│       │   ├── retrieval_tools/    # 6 tools: vector search, summary, chapter summary, keywords, paragraphs
│       │   ├── analysis_tools/     # 3 tools: insight, character analysis, event analysis
│       │   ├── composite_tools/    # 5 tools: entity profile, relationship, character arc, event profile, compare characters
│       │   └── other_tools/        # 2 tools: compare entities, extract entities
│       ├── pipelines/         # ETL pipelines
│       │   ├── document_processing/
│       │   ├── feature_extraction/
│       │   ├── knowledge_graph/
│       │   ├── summarization/
│       │   ├── symbol_discovery/
│       │   ├── temporal_pipeline.py
│       │   └── concept_inference.py
│       ├── workflows/         # High-level orchestration (ingestion, HITL chapter review)
│       ├── domain/            # Entity, Relation, Event, Document Pydantic models
│       ├── core/              # LLM client factory, metrics, tracing, utilities
│       └── config/            # Settings (pydantic-settings), archetype JSON configs
├── frontend/
│   ├── src/
│   │   ├── pages/         # LibraryPage · ReaderPage · GraphPage · TimelinePage
│   │   │                  # AnalysisPage · CharacterAnalysisPage · EventAnalysisPage
│   │   │                  # SymbolsPage · TensionPage · FrameworksPage
│   │   │                  # BuildOverviewPage · UploadPage · SettingsPage · TokenUsagePage
│   │   ├── components/    # layout / chat / graph / reader / timeline / analysis
│   │   │                  # symbols / tension / epistemic / upload / ui
│   │   └── contexts/      # ThemeContext, ChatContext
│   └── package.json
├── docs/
│   ├── CORE.md            # Master design document (always read first)
│   ├── API_CONTRACT.md    # 前後端 API 規格（唯一真相來源）
│   ├── UI_SPEC.md         # UI 元件設計規格
│   ├── plans/             # 高複雜度功能規劃文件存檔
│   ├── guides/            # TESTING.md 等開發指南
│   └── appendix/          # ADR-001 to ADR-009, tools catalog
├── tests/                 # 890+ tests (pytest)
├── pyproject.toml
└── .env.example
```

---

## Deployment Modes / 部署模式

StorySphere 支援兩種部署模式，透過 `DEPLOY_MODE` 環境變數切換。

| | **lightweight（預設）** | **standard** |
|---|---|---|
| Qdrant | 本地檔案（`QDRANT_LOCAL_PATH`） | 外部服務（`QDRANT_URL`） |
| KG 後端 | 固定 NetworkX | NetworkX 或 Neo4j |
| 前置需求 | 僅 Python 環境 | Qdrant 服務需先啟動 |
| 資料遷移 | — | 切換模式需執行 Migration CLI |

> **目前使用 lightweight 模式。** 首次啟動會從 HuggingFace 下載 embedding model（~80MB，一次性）。

---

## Quick Start / 快速開始

### Prerequisites / 前置需求

- Python ≥ 3.11（建議使用 pyenv 管理）
- Node.js ≥ 18
- [`uv`](https://github.com/astral-sh/uv) — Python package manager
- **Gemini API key**（primary LLM）— 或 OpenAI / Anthropic / 本地 LLM 作為替代

### Backend

```bash
# 1. Clone and enter the project
git clone <repo-url> && cd StorySphere

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env — at minimum set GEMINI_API_KEY
# DEPLOY_MODE defaults to lightweight (no external Qdrant needed)

# 3. Install Python dependencies
uv sync

# 4. Start the API server
uv run uvicorn storysphere.api.main:app --host 0.0.0.0 --port 8000 --reload
```

API docs available at `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

---

## Configuration / 環境設定

All settings are loaded from `.env` (see `.env.example`). Key variables:

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | — | Google Gemini API key (primary LLM) |
| `OPENAI_API_KEY` | — | OpenAI fallback |
| `ANTHROPIC_API_KEY` | — | Anthropic fallback |
| `LOCAL_LLM_MODEL` | `""` | Local model name (e.g. `llama3.2`). Empty = disabled |
| `LOCAL_LLM_BASE_URL` | `http://localhost:11434/v1` | Ollama / llama.cpp endpoint |
| `DEPLOY_MODE` | `lightweight` | `lightweight` \| `standard` |
| `QDRANT_LOCAL_PATH` | `./var/qdrant_local` | Qdrant 本地儲存路徑（lightweight 模式） |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant 外部服務（standard 模式） |
| `KG_MODE` | `networkx` | `networkx` \| `neo4j`（lightweight 模式固定 networkx） |
| `KG_PERSISTENCE_PATH` | `./var/knowledge_graph.json` | NetworkX KG 快照路徑 |
| `DATABASE_URL` | `sqlite+aiosqlite:///./var/storysphere.db` | 主要 SQLite DB |
| `KEYWORD_EXTRACTOR_TYPE` | `yake` | `yake` \| `llm` \| `tfidf` \| `composite` \| `none` |
| `LLM_THINKING_ENABLED` | `false` | 啟用 extended reasoning（額外 token） |
| `CHAT_AGENT_MAX_ITERATIONS` | `10` | ReAct loop 上限 |
| `ANALYSIS_CACHE_DB_PATH` | `./var/analysis_cache.db` | 深度分析 SQLite 快取 |

---

## API Overview / API 概覽

Base path: `/api/v1`

| Endpoint | Method | Description |
|---|---|---|
| `/books` | GET | 書庫列表 |
| `/books/upload` | POST | 上傳 PDF / DOCX，觸發處理流程 |
| `/books/{id}` | GET / DELETE | 書籍詳情 / 刪除 |
| `/entities` | GET | 查詢實體（可按書、類型、名稱篩選） |
| `/relations` | GET | 查詢關係 |
| `/factions/{book_id}` | GET | 陣營偵測（社群演算法） |
| `/search` | GET | 語義向量搜尋 |
| `/analysis/{book_id}/character/{name}` | POST | 觸發角色深度分析 |
| `/analysis/{book_id}/event/{event_id}` | POST | 觸發事件深度分析 |
| `/narrative/{book_id}/...` | GET | 敘事分析（聲音側寫、認識論狀態） |
| `/tension/{book_id}/...` | GET | 張力弧線、衝突極點 |
| `/symbols/{book_id}/...` | GET | 符號圖譜、意象趨勢 |
| `/unraveling/{book_id}` | GET | 建構概覽（管線診斷儀表板） |
| `/kg_settings` | GET / PUT | 知識圖譜後端設定 |
| `/tasks/{task_id}` | GET | 非同步任務狀態 |
| `/metrics` | GET | 效能指標 |
| `/token-usage` | GET | LLM token 用量統計 |
| **WS** `/ws/chat` | WebSocket | 串流對話（LangGraph Agent，暫停中） |
| **WS** `/ws/tasks/{task_id}` | WebSocket | 任務即時進度推送 |

---

## Ingestion Pipeline / 文本攝取流程

```
Upload PDF / DOCX
      │
      ▼
DocumentProcessingPipeline
  ├── Loader (PDF / DOCX → raw text)
  ├── ChapterDetector
  └── Chunker (paragraph-level)
      │
      ▼
FeatureExtractionPipeline
  ├── EmbeddingGenerator → Qdrant
  └── KeywordExtractor (YAKE / LLM / TF-IDF / Composite)
      │
      ▼
KnowledgeGraphPipeline
  ├── EntityExtractor (LLM, tenacity retry)
  ├── RelationExtractor (LLM)
  ├── EntityLinker (dedup by normalised name + alias)
  └── ParagraphEntityLinker
      │
      ▼
SummarizationPipeline
  └── ChapterSummarizer (LLM)
      │
      ▼
SymbolDiscoveryPipeline
  └── ImageryDetector → SymbolGraph → CrossChapter trend
```

---

## Tools / 工具清單（23 tools）

| Category | Tools |
|---|---|
| **Graph** (7) | GetEntityAttrs, GetEntityRelations, GetRelationPaths, GetSubgraph, GetRelationStats, GetEntityTimeline, GetGlobalTimeline |
| **Retrieval** (6) | VectorSearch, GetSummary, GetChapterSummary, GenSummary, GetParagraphs, GetKeywords |
| **Analysis** (3) | GenerateInsight, AnalyzeCharacter, AnalyzeEvent |
| **Composite** (5) | GetEntityProfile, GetEntityRelationship, GetCharacterArc, GetEventProfile, CompareCharacters |
| **Other** (2) | CompareEntities, ExtractEntities |

---

## Deep Analysis / 深度分析

### Character Analysis
1. **CEP Extraction** — 並行蒐集 KG 資料、向量證據、關鍵字
2. **Archetype Classification** — Jung（12 原型）+ Schmidt（45 原型）JSON 設定
3. **Character Arc** — 時間軸分段成長曲線
4. **Voice Profiling** — 語言風格側寫
5. **Epistemic State** — 認識論狀態追蹤（角色知道什麼、何時知道的）
6. **Profile Summary** — 自然語言綜合輸出

### Event Analysis
1. **EEP Extraction** — 從 KG + 向量搜尋取事件證據
2. **Causality Analysis** — 因果鏈推理
3. **Impact Analysis** — 對角色與情節的短 / 長期影響

分析結果快取於 SQLite 7 天；快取命中回傳時間 < 100 ms。

---

## Monitoring / 監控

`backend/storysphere/core/metrics.py` — `MetricsCollector` singleton（stdlib-only，thread-safe）

- 記錄：工具選擇、工具執行、快取事件、Agent 查詢、LLM 呼叫
- 統計：P50 / P95 / P99 latency、success rate、cache hit rate
- JSON-line logs 輸出至 `storysphere.metrics` logger
- HTTP endpoint：`GET /api/v1/metrics`

---

## Testing / 測試

```bash
# Run all unit tests
uv run pytest

# Run with coverage
uv run pytest --cov=backend/storysphere --cov-report=term-missing

# Skip integration tests (no API key required)
uv run pytest -m "not integration"
```

Current test count: **873 passing** across agents, services, tools, pipelines, and core utilities.

---

## Development Status / 開發進度

| Phase | Status | Description |
|---|---|---|
| Phase 1 | ✅ Done | Base layer — config, domain, LLM client |
| Phase 2 | ✅ Done | ETL pipelines (document, embedding, KG, summarization) |
| Phase 2b | ✅ Done | Keyword extraction (YAKE / LLM / TF-IDF / Composite) |
| Phase 3 | ✅ Done | 15 base tools |
| Phase 4 | ✅ Done | Composite tools + LangGraph Chat Agent |
| Phase 5 | ✅ Done | Deep Analysis — character (CEP, archetypes, arc) + event |
| Phase 6 | ✅ Done | Parallel optimization (`asyncio.gather`) |
| Phase 7 | ✅ Done | Monitoring — `MetricsCollector`, token usage tracking |
| Phase 8 | ✅ Done | Symbol discovery pipeline + 符號分析頁 |
| Phase 9 | ✅ Done | Tension analysis + 張力分析頁 |
| Phase 10 | ✅ Done | Epistemic state tracking + Voice profiling |
| Phase 11 | ✅ Done | Faction detection (community algorithm) |
| Phase 12 | ✅ Done | UI 全面重設計（KG / Timeline / Character / Event / Symbols / Tension / Build Overview） |
| Phase 13 | ✅ Done | Lightweight deployment mode（I-001） |
| Phase 14 | 🔄 Planned | Standard mode migration CLI（I-002）；Chat Agent 重新啟用 |

---

## Docs / 文件

- [`docs/CORE.md`](docs/CORE.md) — Master design document（從這裡開始讀）
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — 前後端 API 唯一規格
- [`docs/UI_SPEC.md`](docs/UI_SPEC.md) — UI 元件設計規格
- [`docs/appendix/`](docs/appendix/) — ADR-001 to ADR-009、工具目錄、並行實作說明
- [`docs/plans/`](docs/plans/) — 高複雜度功能規劃文件存檔

---

## License

MIT
