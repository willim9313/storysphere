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
├── backend/storysphere/   # single Python namespace (imports as storysphere.*)
│   ├── api/               # FastAPI app, routers, schemas (camelCase), task store
│   ├── agents/            # ChatAgent (LangGraph streaming), AnalysisAgent (cache-first), ChatState
│   ├── services/          # business logic — KG, document, vector, symbol, tension, narrative, …
│   ├── tools/             # chat-agent tools: graph / retrieval / analysis / composite / other
│   ├── pipelines/         # ETL — document processing, feature extraction, KG, summarization,
│   │                      #       symbol discovery, temporal
│   ├── workflows/         # LangGraph ingestion with HITL chapter review
│   ├── domain/            # Pydantic domain models (snake_case)
│   ├── core/              # multi-provider LLM client (fallback chain), metrics, tracing
│   └── config/            # settings, archetype / mythos JSON configs
├── frontend/src/          # React 19 + Vite — pages/, components/, contexts/, api/, i18n/
├── docs/                  # see the Docs section below
├── tests/                 # pytest
├── pyproject.toml
└── .env.example
```

The per-file layout is deliberately **not** mirrored here — it drifts silently. Read
`backend/storysphere/` directly; the layering and dependency rules are in
[`docs/CORE.md`](docs/CORE.md).

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

Base path for all HTTP routes: **`/api/v1`**. The WebSocket route (`WS /ws/chat?session_id=<uuid>`,
streaming chat agent) is unprefixed.

Routes are grouped by domain — books (upload, chapters, review workflow, rerun-by-step),
knowledge graph (entities, relations, factions, character metrics), search, deep analysis,
narrative, tension, symbols, plus operational routes for tasks, metrics, token usage and settings.

**[`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) is the single source of truth** for every
endpoint, its request/response shape and its error semantics — the router inventory is not
duplicated here because it drifts. A drift test (`tests/docs/test_docs_drift.py`) asserts that
every live `/api/v1` route is either specified in that document or explicitly declared unlisted.

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

## Tools

The chat agent works through a tool layer split into five categories:

| Category | What it covers |
|---|---|
| **Graph** | Entity attributes and relations, relation paths, subgraphs, relation stats, entity and global timelines |
| **Retrieval** | Vector search, book / chapter summaries, paragraphs, keywords |
| **Analysis** | Insight generation, character and event deep analysis |
| **Composite** | Multi-step combinations — entity profile, relationship, character arc, event profile, character comparison |
| **Other** | Entity comparison, entity extraction |

`AnalyzeCharacter` / `AnalyzeEvent` are only exposed to the chat agent when an `analysis_agent`
dependency is wired in.

The tool inventory with full descriptions lives in
[`docs/appendix/TOOLS_CATALOG.md`](docs/appendix/TOOLS_CATALOG.md); the design rules for writing
one are in [`docs/guides/tools-layer.md`](docs/guides/tools-layer.md).

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

Tests cover agents, services, tools, pipelines, workflows and API endpoints. Conventions —
the three test layers, fixture rules, naming — are in
[`docs/guides/TESTING.md`](docs/guides/TESTING.md).

---

## Docs

- [`docs/CORE.md`](docs/CORE.md) — Architecture decision index — the *why* behind the design (start here)
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — Frontend/backend API spec, single source of truth
- [`docs/UI_SPEC.md`](docs/UI_SPEC.md) — UI component design spec
- [`docs/DESIGN_TOKENS.md`](docs/DESIGN_TOKENS.md) — CSS token reference
- [`docs/domain-glossary.md`](docs/domain-glossary.md) — Domain terminology
- [`docs/BACKLOG.md`](docs/BACKLOG.md) — Live backlog (see `docs/BACKLOG_ARCHIVE.md` for resolved items)
- [`docs/type-generation.md`](docs/type-generation.md) — Why TypeScript types are generated, and the camelCase / snake_case rule
- [`docs/appendix/`](docs/appendix/) — ADR-001 through ADR-009, tools catalog, parallelism notes
- [`docs/guides/`](docs/guides/) — Per-subsystem architecture references (pipelines, tools layer, chat agent, …) plus testing and Langfuse setup

These two deliberately do **not** reflect the current state — read them as history, not as a spec:

- [`docs/plans/`](docs/plans/README.md) — Dated planning snapshots, frozen once implemented. Where they conflict with the code, `API_CONTRACT.md` or `UI_SPEC.md`, those win.
- [`docs/archive/`](docs/archive/README.md) — Superseded or obsolete documents, kept for archaeology only

---

## License

[MIT](LICENSE)
