# StorySphere

> **Intelligent Novel Analysis System — Agent-Driven Architecture**

**Language:** English | [繁體中文](README.zh-TW.md)

---

## Overview

StorySphere ingests novels (PDF / DOCX / EPUB), runs a multi-stage ETL pipeline to extract entities, relations, events, symbols, and keywords, then exposes the results through a REST + WebSocket API and a React frontend.

**Core capabilities:**
- **Document ingestion** — PDF / DOCX / EPUB parsing, chapter detection, paragraph-level chunking
- **Knowledge graph** — automatic character/location/item extraction and relationship mapping (NetworkX or Neo4j)
- **Faction detection** — community-algorithm-based character grouping
- **Semantic search** — paragraph-level vector embeddings (Qdrant), plus SQLite full-text fallback
- **Deep analysis** — character CEP extraction, Jung/Schmidt archetype classification, growth arcs; event causality & impact analysis
- **Symbol analysis** — imagery detection, symbol graph, cross-chapter trend tracking
- **Tension analysis** — narrative tension arcs, conflict-pole identification, thematic synthesis
- **Narrative structure** — Hero's Journey mapping, plot spine, temporal ordering, voice profiling, epistemic-state tracking
- **Build overview** — pipeline diagnostics dashboard (per-pipeline progress, blockers, follow-up CTAs)
- **Conversational agent** — LangGraph streaming chat agent with tool access, available on every book page
- **Visualization** — knowledge graph, event timeline, and per-analysis panels

> **Currently running in lightweight deploy mode**: Qdrant uses local file storage, KG backend is fixed to NetworkX — no external services required. Standard mode (remote Qdrant, optional Neo4j) is also supported; see [Deployment Modes](#deployment-modes).

---

## Tech Stack

| Layer | Technology |
|---|---|
| LLM Orchestration | LangChain · LangGraph · Gemini (primary) · GPT-4o-mini · Claude · Local LLM (Ollama / llama.cpp) |
| Backend API | FastAPI · Uvicorn · WebSocket |
| Knowledge Graph | NetworkX (default) · Neo4j (optional, standard mode only) |
| Vector DB | Qdrant (local file in lightweight mode / remote in standard mode) |
| Embeddings | sentence-transformers `all-MiniLM-L6-v2` |
| Storage | SQLite (aiosqlite · SQLAlchemy) |
| Keyword Extraction | YAKE · TF-IDF · LLM · Composite |
| Tracing | Langfuse (optional) |
| Frontend | React 19 · TypeScript · Vite · React Router v6 · TanStack Query |
| Graph / Data Viz | Cytoscape.js (+ fcose layout) · D3 |
| Frontend i18n | i18next / react-i18next (English + Traditional Chinese) |
| Package Manager (Python) | **uv** |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                           │
│  Library · Reader · Graph · Timeline · Analysis · Symbols ·     │
│  Tension · Narrative · Search · Methodology · Build Overview ·  │
│  Upload · Settings · Token Usage      (ChatWidget on every      │
│                                         book-scoped route)       │
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
(LangGraph,          (cache-first,         (ETL Pipelines,
 streaming)           async, SQLite)        LangGraph + checkpointer)
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

### Query Paths

| Path | Latency | Implementation |
|---|---|---|
| **Map / Card Query** | < 100 ms | Sync REST, pure data lookup |
| **Deep Analysis** | 2–5 s (cache hit < 100 ms) | Async task, SQLite cache (no TTL) |
| **Chat** | Streaming, 2–5 s | LangGraph agent over WebSocket |

---

## Project Structure

```
storysphere/
├── backend/
│   └── storysphere/            # single Python namespace (imports as storysphere.*)
│       ├── api/                # FastAPI app, routers, schemas, task store
│       │   ├── routers/            # 18 routers — see API Overview below
│       │   └── schemas/            # Pydantic response/request schemas (camelCase)
│       ├── agents/
│       │   ├── chat_agent.py           # LangGraph streaming chat agent (StateGraph + ToolNode)
│       │   ├── chat_agent_base.py      # Shared prompt/history helpers
│       │   ├── analysis_agent.py       # Cache-first deep analysis orchestrator
│       │   ├── timeline_agent.py       # Timeline event agent
│       │   ├── pattern_recognizer.py   # Query pre-filter for entity tracking
│       │   └── states.py               # ChatState (Pydantic)
│       ├── services/           # 28 modules — business logic
│       │   ├── kg_service.py / kg_service_base.py / kg_service_neo4j.py
│       │   ├── document_service.py / vector_service.py / summary_service.py
│       │   ├── analysis_service.py / analysis_cache.py / cache_invalidation.py
│       │   ├── symbol_service.py / symbol_analysis_service.py / symbol_graph_service.py
│       │   ├── tension_service.py / narrative_service.py
│       │   ├── faction_service.py / global_timeline_service.py
│       │   ├── epistemic_state_service.py / voice_profiling_service.py
│       │   ├── character_metrics_service.py / link_prediction_service.py
│       │   └── extraction_service.py / keyword_service.py / toc_parser.py
│       ├── tools/               # 23 chat-agent tools — see Tools below
│       │   ├── graph_tools/ (7) · retrieval_tools/ (6) · analysis_tools/ (3)
│       │   └── composite_tools/ (5) · other_tools/ (2)
│       ├── pipelines/           # ETL pipelines
│       │   ├── document_processing/   # loader, chapter detector, chunker
│       │   ├── feature_extraction/    # embeddings, keywords
│       │   ├── knowledge_graph/       # entity/relation extraction, linking
│       │   ├── summarization/         # chapter summarizer
│       │   ├── symbol_discovery/      # imagery detection
│       │   ├── temporal_pipeline.py
│       │   └── concept_inference.py
│       ├── workflows/           # High-level orchestration (LangGraph ingestion, HITL review)
│       ├── domain/              # Entity, Relation, Event, Narrative, Tension, ... Pydantic models
│       ├── core/                # Multi-provider LLM client (fallback chain), metrics, tracing
│       └── config/               # Settings (pydantic-settings), archetype/mythos JSON configs
├── frontend/
│   ├── src/
│   │   ├── router.tsx      # React Router v6 route table
│   │   ├── pages/          # LibraryPage · ReaderPage · GraphPage · TimelinePage
│   │   │                   # CharacterAnalysisPage · EventAnalysisPage · SymbolsPage
│   │   │                   # TensionPage · NarrativePage · SearchPage · MethodologyPage
│   │   │                   # BuildOverviewPage · UploadPage · SettingsPage · TokenUsagePage
│   │   ├── components/     # analysis / chat / epistemic / graph / layout / library
│   │   │                   # methodology / narrative / reader / symbols / tension
│   │   │                   # timeline / tasks / toast / ui / upload
│   │   └── contexts/       # ThemeContext, ChatContext, ToastContext
│   └── package.json
├── docs/
│   ├── CORE.md               # Architecture decisions index (start here)
│   ├── API_CONTRACT.md       # Frontend/backend API spec — single source of truth
│   ├── UI_SPEC.md            # UI component design spec
│   ├── DESIGN_TOKENS.md      # CSS token reference
│   ├── domain-glossary.md    # Domain terminology
│   ├── BACKLOG.md            # Live backlog / BACKLOG_ARCHIVE.md — resolved items
│   ├── plans/                # Dated planning docs for high-complexity features
│   ├── guides/                # Per-subsystem architecture refs + TESTING.md, LANGFUSE_SETUP.md
│   ├── appendix/               # ADR-001 .. ADR-009, tools catalog
│   └── archive/                # Superseded planning docs, kept for history
├── tests/                     # 1,392+ tests (pytest)
├── pyproject.toml
└── .env.example
```

---

## Deployment Modes

StorySphere supports two deployment modes, switched via the `DEPLOY_MODE` environment variable.

| | **lightweight (default)** | **standard** |
|---|---|---|
| Qdrant | Local file (`QDRANT_LOCAL_PATH`) | External service (`QDRANT_URL`) |
| KG backend | Fixed to NetworkX | NetworkX or Neo4j |
| Prerequisites | Python environment only | Qdrant service must be running first |
| Data migration | — | Switching modes requires the migration CLI (`/api/v1/kg/migrate`) |

> **Currently running in lightweight mode.** First launch downloads an embedding model from HuggingFace (~80MB, one-time). In lightweight mode, do **not** run with multiple Uvicorn workers (`--workers > 1`) — local Qdrant does not support concurrent multi-process writes.

---

## Quick Start

### Prerequisites

- Python ≥ 3.11
- Node.js ≥ 18
- [`uv`](https://github.com/astral-sh/uv) — Python package manager
- A **Gemini API key** (primary LLM) — or OpenAI / Anthropic / a local LLM as an alternative

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

## Configuration

All settings are loaded from `.env` (see `.env.example`). Key variables:

| Variable | Default | Description |
|---|---|---|
| `PRIMARY_LLM_PROVIDER` | `gemini` | `gemini` \| `openai` \| `anthropic` \| `local` — fallback order is Gemini → OpenAI → Anthropic → Local |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `OPENAI_API_KEY` | — | OpenAI fallback |
| `ANTHROPIC_API_KEY` | — | Anthropic fallback |
| `LOCAL_LLM_MODEL` | `""` | Local model name (e.g. `llama3.2`). Empty = disabled |
| `LOCAL_LLM_BASE_URL` | `http://localhost:11434/v1` | Ollama / llama.cpp endpoint |
| `DEPLOY_MODE` | `lightweight` | `lightweight` \| `standard` |
| `QDRANT_LOCAL_PATH` | `./var/qdrant_local` | Qdrant local storage path (lightweight mode) |
| `QDRANT_URL` | `http://localhost:6333` | External Qdrant service (standard mode) |
| `KG_MODE` | `networkx` | `networkx` \| `neo4j` (forced to `networkx` in lightweight mode) |
| `KG_AUTO_SWITCH_THRESHOLD` | `10000` | Entity count above which Neo4j is recommended |
| `KG_PERSISTENCE_PATH` | `./var/knowledge_graph.json` | NetworkX KG snapshot path |
| `DATABASE_URL` | `sqlite+aiosqlite:///./var/storysphere.db` | Primary SQLite DB |
| `TASK_STORE_BACKEND` | `sqlite` | `memory` \| `sqlite` — async task persistence |
| `KEYWORD_EXTRACTOR_TYPE` | `yake` | `yake` \| `llm` \| `tfidf` \| `composite` \| `none` |
| `LLM_THINKING_ENABLED` | `false` | Enable extended reasoning (extra tokens) |
| `LANGFUSE_ENABLED` | `false` | Enable Langfuse tracing |
| `CHAT_AGENT_MAX_ITERATIONS` | `10` | ReAct loop cap |
| `ANALYSIS_CACHE_DB_PATH` | `./var/analysis_cache.db` | Deep-analysis SQLite cache |
| `APP_HOST` | `127.0.0.1` | Loopback by default; only set `0.0.0.0` if you knowingly need LAN access |

---

## API Overview

Base path for all HTTP routes: **`/api/v1`**. The WebSocket route is unprefixed.

| Router | Path | Purpose |
|---|---|---|
| `books` | `/books` | Upload, list, detail, delete; chapters, graph, timeline, review workflow, rerun-by-step, TOC parsing, role suggestion (largest router) |
| `unraveling`, `factions`, `character_metrics` | nested under `/books/{id}/...` | Build-overview dashboard, faction detection, character centrality |
| `entities` | `/entities` | List/detail, relations, timeline, subgraph, relation stats |
| `relations` | `/relations` | Relation paths, aggregate stats |
| `documents` | `/documents` | List/detail source documents |
| `search` | `/search` | Semantic (vector) and full-text search |
| `analysis` | `/analysis` | Trigger character / event deep analysis (async task pattern) |
| `narrative` | `/narrative` | Classification, refine, Hero's Journey, temporal ordering, kernel spine, HITL review |
| `tension` | `/tension` | Tension lines, TEUs, theme synthesis, HITL review |
| `symbols` | `/symbols` | Imagery, overview, timeline, co-occurrence, interpretation |
| `kg_settings` | `/kg` | KG backend status, switch, migrate |
| `settings_info` | `/settings` | Runtime configuration info |
| `tasks` | `/tasks` | Async task list, status, cancel |
| `metrics` | `/metrics` | Performance metrics snapshot |
| `token_usage` | `/token-usage` | LLM token usage stats |
| `chat_ws` | `WS /ws/chat?session_id=<uuid>` | Streaming chat agent |

Full request/response schemas: [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).

---

## Ingestion Pipeline

```
Upload PDF / DOCX / EPUB
      │
      ▼
DocumentProcessingPipeline
  ├── Loader (→ raw text)
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
  └── ImageryDetector → SymbolGraph → cross-chapter trend
```

---

## Tools (23 chat-agent tools)

| Category | Tools |
|---|---|
| **Graph** (7) | GetEntityAttrs, GetEntityRelations, GetRelationPaths, GetSubgraph, GetRelationStats, GetEntityTimeline, GetGlobalTimeline |
| **Retrieval** (6) | VectorSearch, GetSummary, GetChapterSummary, GenSummary, GetParagraphs, GetKeywords |
| **Analysis** (3) | GenerateInsight, AnalyzeCharacter, AnalyzeEvent |
| **Composite** (5) | GetEntityProfile, GetEntityRelationship, GetCharacterArc, GetEventProfile, CompareCharacters |
| **Other** (2) | CompareEntities, ExtractEntities |

`AnalyzeCharacter` / `AnalyzeEvent` are only exposed to the chat agent when an `analysis_agent` dependency is wired in.

---

## Deep Analysis

### Character Analysis
1. **CEP Extraction** — parallel collection of KG data, vector evidence, keywords
2. **Archetype Classification** — Jung (12 archetypes) + Schmidt (45 archetypes) JSON configs
3. **Character Arc** — timeline-segmented growth curve
4. **Voice Profiling** — linguistic style profile
5. **Epistemic State** — tracks what a character knows and when
6. **Profile Summary** — natural-language synthesis

### Event Analysis
1. **EEP Extraction** — event evidence from KG + vector search
2. **Causality Analysis** — causal chain reasoning
3. **Impact Analysis** — short/long-term effects on characters and plot

Analysis results are cached in SQLite with no TTL — entries are kept until explicitly invalidated (by re-running a pipeline step or deleting the book). Cache hits return in < 100 ms.

---

## Monitoring

`backend/storysphere/core/metrics.py` — `MetricsCollector` singleton (stdlib-only, thread-safe)

- Tracks: tool selection, tool execution, cache events, agent queries, LLM calls
- Reports: P50 / P95 / P99 latency, success rate, cache hit rate
- JSON-line logs via the `storysphere.metrics` logger
- HTTP endpoint: `GET /api/v1/metrics`

Optional distributed tracing via [Langfuse](docs/guides/LANGFUSE_SETUP.md) (`LANGFUSE_ENABLED=true`).

---

## Testing

```bash
# Run all tests
uv run pytest

# Run with coverage
uv run pytest --cov=backend/storysphere --cov-report=term-missing

# Skip tests that call real external LLM APIs
uv run pytest -m "not integration"

# Include Neo4j-dependent tests (skipped by default)
uv run pytest --neo4j
```

Current test count: **1,392 tests** across agents, services, tools, pipelines, workflows, and API endpoints. See [`docs/guides/TESTING.md`](docs/guides/TESTING.md) for conventions.

---

## Docs

- [`docs/CORE.md`](docs/CORE.md) — Architecture decision index — the *why* behind the design (start here)
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — Frontend/backend API spec, single source of truth
- [`docs/UI_SPEC.md`](docs/UI_SPEC.md) — UI component design spec
- [`docs/DESIGN_TOKENS.md`](docs/DESIGN_TOKENS.md) — CSS token reference
- [`docs/domain-glossary.md`](docs/domain-glossary.md) — Domain terminology
- [`docs/BACKLOG.md`](docs/BACKLOG.md) — Live backlog (see `docs/BACKLOG_ARCHIVE.md` for resolved items)
- [`docs/appendix/`](docs/appendix/) — ADR-001 through ADR-009, tools catalog, parallelism notes
- [`docs/plans/`](docs/plans/) — Planning docs for high-complexity features, archived by date
- [`docs/guides/`](docs/guides/) — Per-subsystem architecture references (pipelines, tools layer, chat agent, …) plus testing and Langfuse setup

---

## License

[MIT](LICENSE)
