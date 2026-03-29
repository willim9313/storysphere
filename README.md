# StorySphere

> **Intelligent Novel Analysis System — Agent-Driven Architecture**
> 智能小說分析系統，以 Agent 驅動架構自動解析、理解並探索小說內容。

---

## Overview / 概覽

StorySphere ingests novels (PDF / DOCX), runs a multi-stage ETL pipeline to extract entities, relations, events, and keywords, then exposes the results through a streaming REST + WebSocket API and a React frontend. An LLM-powered chat agent lets readers have natural-language conversations with any book.

主要能力：
- **自動解析** PDF / DOCX 小說，偵測章節、切分段落
- **知識圖譜** — 自動抽取角色、地點、物品及其關係
- **向量語義搜尋** — 段落級 embedding (Qdrant)
- **深度分析** — 角色 CEP、原型分類、成長弧線；事件因果分析
- **對話探索** — LangGraph ReAct Chat Agent，支援串流回覆
- **視覺化** — 知識圖譜、事件時間軸、分析面板

---

## Tech Stack / 技術棧

| Layer | Technology |
|---|---|
| LLM Orchestration | LangChain · LangGraph · Gemini 2.0 Flash (primary) · GPT-4o-mini · Claude Haiku · Local LLM (Ollama / llama.cpp) |
| Backend API | FastAPI · Uvicorn · WebSocket |
| Knowledge Graph | NetworkX (default) · Neo4j (optional, large-scale) |
| Vector DB | Qdrant |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` |
| Storage | SQLite (aiosqlite · SQLAlchemy) |
| Keyword Extraction | YAKE · TF-IDF · LLM · Composite |
| Frontend | React 18 · TypeScript · Vite · React Router |
| Package Manager (Python) | **uv** |

---

## Architecture / 架構

```
┌─────────────────────────────────────────────────┐
│                  React Frontend                 │
│  Library · Reader · Graph · Timeline · Analysis │
└────────────────────┬────────────────────────────┘
                     │  HTTP / WebSocket
┌────────────────────▼────────────────────────────┐
│              FastAPI  (src/api/)                │
│  /api/v1/books  entities  relations  analysis   │
│  WS /ws/chat  /ws/chat-deep  /ws/tasks/{id}     │
└──┬─────────────────┬─────────────────┬──────────┘
   │                 │                 │
   ▼                 ▼                 ▼
Chat Agent     Analysis Agent    Ingestion Workflow
(LangGraph     (cache-first,     (ETL Pipelines)
 ReAct)         async, SQLite)
   │                 │                 │
   └────────┬────────┘        ┌────────┘
            ▼                 ▼
         Tools (18)        Services
     graph / retrieval /   KG · Document
     analysis / composite  Vector · Summary
                           Extraction · Analysis
            │
   ┌────────┴────────┐
   ▼                 ▼
NetworkX / Neo4j   Qdrant
(Knowledge Graph)  (Vector DB)
```

### Three Query Paths / 三條查詢路徑

| Path | Latency | Implementation |
|---|---|---|
| **Map / Card Query** | < 100 ms | Sync REST, pure data lookup |
| **Chat** | Streaming 2–5 s | LangGraph ReAct agent, WebSocket |
| **Deep Analysis** | 2–5 s (cache hit < 100 ms) | Async, 7-day SQLite cache, WebSocket push |

---

## Project Structure / 專案結構

```
storysphere/
├── src/
│   ├── api/               # FastAPI routers, schemas, WebSocket managers
│   ├── agents/
│   │   ├── chat_agent.py       # LangGraph streaming chat agent
│   │   ├── analysis_agent.py   # Cache-first deep analysis orchestrator
│   │   ├── timeline_agent.py   # Timeline event agent
│   │   └── states.py           # ChatState (Pydantic, 8 fields)
│   ├── services/          # Business logic (KG, Document, Vector, Summary, Analysis…)
│   ├── tools/
│   │   ├── graph_tools/        # 6 tools: entity/relation/subgraph queries
│   │   ├── retrieval_tools/    # 5 tools: vector search, summary, keywords, paragraphs
│   │   ├── analysis_tools/     # 3 tools: insight, character analysis, event analysis
│   │   └── composite_tools/    # 4 tools: entity profile, relationship, character arc, event profile
│   ├── pipelines/         # ETL — document processing, feature extraction, KG building
│   ├── workflows/         # High-level business orchestration (ingestion)
│   ├── domain/            # Entity, Relation, Event, Document Pydantic models
│   ├── core/              # LLM client factory, metrics, tracing, utilities
│   └── config/            # Settings (pydantic-settings), archetype JSON configs
├── frontend/
│   ├── src/
│   │   ├── pages/         # LibraryPage, ReaderPage, GraphPage, TimelinePage, AnalysisPage…
│   │   ├── components/    # layout / chat / graph / reader / timeline / analysis / ui
│   │   └── contexts/      # ThemeContext, ChatContext
│   └── package.json
├── docs/
│   ├── CORE.md            # Master design document (always read first)
│   └── appendix/          # ADR-001 to ADR-009, tools catalog, parallel impl notes
├── tests/                 # 331+ unit tests (pytest)
├── pyproject.toml
└── .env.example
```

---

## Quick Start / 快速開始

### Prerequisites / 前置需求

- Python ≥ 3.11 (managed via pyenv recommended)
- Node.js ≥ 18
- [`uv`](https://github.com/astral-sh/uv) — Python package manager
- A **Gemini API key** (primary LLM) — or OpenAI / Anthropic / local LLM as alternative

### Backend

```bash
# 1. Clone and enter the project
git clone <repo-url> && cd StorySphere

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env — at minimum set GEMINI_API_KEY

# 3. Install Python dependencies
uv sync

# 4. Start the API server
uv run uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload
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
| `KG_MODE` | `networkx` | Knowledge graph backend: `networkx` \| `neo4j` |
| `KG_PERSISTENCE_PATH` | `./data/knowledge_graph.json` | Local KG snapshot path |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant vector DB endpoint |
| `DATABASE_URL` | `sqlite+aiosqlite:///./storysphere.db` | Main SQLite DB |
| `KEYWORD_EXTRACTOR_TYPE` | `yake` | `yake` \| `llm` \| `tfidf` \| `composite` \| `none` |
| `LLM_THINKING_ENABLED` | `false` | Enable extended reasoning (extra tokens) |
| `CHAT_AGENT_MAX_ITERATIONS` | `10` | ReAct loop cap |
| `ANALYSIS_CACHE_DB_PATH` | `./data/analysis_cache.db` | Deep analysis SQLite cache |

---

## API Overview / API 概覽

Base path: `/api/v1`

| Endpoint | Method | Description |
|---|---|---|
| `/books` | GET / POST | List books, ingest a new book |
| `/books/{id}` | GET / DELETE | Book detail / delete |
| `/entities` | GET | Query entities (filter by book, type, name) |
| `/relations` | GET | Query relations |
| `/search` | GET | Semantic vector search |
| `/analysis/{book_id}/character/{name}` | POST | Trigger deep character analysis |
| `/analysis/{book_id}/event/{event_id}` | POST | Trigger deep event analysis |
| `/tasks/{task_id}` | GET | Async task status |
| `/metrics` | GET | In-process performance metrics |
| `/token-usage` | GET | LLM token usage statistics |
| **WS** `/ws/chat` | WebSocket | Streaming chat (LangGraph ReAct) |
| **WS** `/ws/chat-deep` | WebSocket | Deep-analysis chat |
| **WS** `/ws/tasks/{task_id}` | WebSocket | Real-time task progress push |

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
KnowledgGraphPipeline
  ├── EntityExtractor (LLM, tenacity retry)
  ├── RelationExtractor (LLM)
  ├── EntityLinker (dedup by normalised name + alias)
  └── ParagraphEntityLinker
      │
      ▼
SummarizationPipeline
  └── ChapterSummarizer (LLM)
```

---

## Tools / 工具清單 (18 tools)

| Category | Tools |
|---|---|
| **Graph** (6) | GetEntityAttrs, GetEntityRelations, GetRelationPaths, GetSubgraph, GetRelationStats, GetEntityTimeline |
| **Retrieval** (5) | VectorSearch, GetSummary, GenSummary, GetParagraphs, GetKeywords |
| **Analysis** (3) | GenerateInsight, AnalyzeCharacter, AnalyzeEvent |
| **Composite** (4) | GetEntityProfile, GetEntityRelationship, GetCharacterArc, GetEventProfile |

---

## Deep Analysis / 深度分析

### Character Analysis
1. **CEP Extraction** — gathers KG data, vector evidence, and keywords in parallel
2. **Archetype Classification** — Jung (12) + Schmidt (45) archetype JSONs
3. **Character Arc** — timeline-segmented growth curve
4. **Profile Summary** — natural-language synthesis

### Event Analysis
1. **EEP Extraction** — event evidence from KG + vector search
2. **Causality Analysis** — cause-effect chain reasoning
3. **Impact Analysis** — short/long-term effects on characters and plot

Results are cached in SQLite for 7 days; cache hits return in < 100 ms.

---

## Monitoring / 監控

`src/core/metrics.py` — `MetricsCollector` singleton (stdlib-only, thread-safe)

- Records: tool selection, tool execution, cache events, agent queries, LLM calls
- Exposes P50 / P95 / P99 latency, success rate, cache hit rate
- JSON-line logs emitted to `storysphere.metrics` logger
- HTTP endpoint: `GET /api/v1/metrics`

---

## Testing / 測試

```bash
# Run all unit tests
uv run pytest

# Run with coverage
uv run pytest --cov=src --cov-report=term-missing

# Skip integration tests (no API key required)
uv run pytest -m "not integration"
```

Current test count: **331+ passing** across agents, services, tools, pipelines, and core utilities.

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

---

## Docs / 文件

- [`docs/CORE.md`](docs/CORE.md) — Master design document (start here)
- [`docs/appendix/`](docs/appendix/) — Full ADR-001 to ADR-009, tools catalog, parallel implementation notes

---

## License

MIT
