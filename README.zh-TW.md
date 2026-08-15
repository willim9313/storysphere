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
├── backend/storysphere/   # 單一 Python 命名空間（import 皆為 from storysphere.*）
│   ├── api/               # FastAPI app、routers、schemas（camelCase）、task store
│   ├── agents/            # ChatAgent（LangGraph 串流）、AnalysisAgent（cache-first）、ChatState
│   ├── services/          # 商業邏輯 — KG、文件、向量、象徵、張力、敘事 …
│   ├── tools/             # chat agent 工具：graph / retrieval / analysis / composite / other
│   ├── pipelines/         # ETL — 文件處理、特徵抽取、知識圖譜、摘要、意象偵測、時序
│   ├── workflows/         # LangGraph 攝取流程（含 HITL 章節審閱）
│   ├── domain/            # Pydantic 領域模型（snake_case）
│   ├── core/              # 多供應商 LLM client（含 fallback chain）、metrics、tracing
│   └── config/            # Settings、原型 / mythos JSON 設定
├── frontend/src/          # React 19 + Vite — pages/、components/、contexts/、api/、i18n/
├── docs/                  # 見下方〈文件〉一節
├── tests/                 # pytest
├── pyproject.toml
└── .env.example
```

**逐檔結構刻意不在這裡鏡射一份**——那會無聲漂移。請直接看 `backend/storysphere/`；
分層與依賴方向規則見 [`docs/CORE.md`](docs/CORE.md)。

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

所有 HTTP 路由的基礎路徑為 **`/api/v1`**；WebSocket 路由（`WS /ws/chat?session_id=<uuid>`，
串流對話 agent）不帶此前綴。

路由依領域分組——書籍（上傳、章節、審閱流程、分步重跑）、知識圖譜（實體、關係、陣營、
角色中心性）、搜尋、深度分析、敘事結構、張力、象徵，以及任務、指標、token 用量、
設定等維運路由。

**[`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) 是每個端點的唯一規格來源**，涵蓋請求 /
回應形狀與錯誤語意——router 清單不在此重複一份，因為它會漂移。漂移測試
（`tests/docs/test_docs_drift.py`）會驗證每個實際存在的 `/api/v1` 路由，
要嘛在該文件中有規格、要嘛被明確標記為未納入契約。

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

## 工具清單

Chat agent 透過一層工具存取系統能力，分為五類：

| 類別 | 涵蓋範圍 |
|---|---|
| **Graph** | 實體屬性與關係、關係路徑、子圖、關係統計、實體與全域時間軸 |
| **Retrieval** | 向量搜尋、書籍 / 章節摘要、段落、關鍵字 |
| **Analysis** | 洞察生成、角色與事件深度分析 |
| **Composite** | 多步驟組合 — 實體檔案、關係、角色弧線、事件檔案、角色比較 |
| **Other** | 實體比較、實體抽取 |

`AnalyzeCharacter` / `AnalyzeEvent` 僅在有注入 `analysis_agent` 依賴時才會暴露給 chat agent。

完整工具清單與 description 見
[`docs/appendix/TOOLS_CATALOG.md`](docs/appendix/TOOLS_CATALOG.md)；
撰寫工具的設計原則見 [`docs/guides/tools-layer.md`](docs/guides/tools-layer.md)。

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

測試涵蓋 agents、services、tools、pipelines、workflows 與 API endpoints。撰寫慣例——
三層測試分工、fixture 規則、命名——見 [`docs/guides/TESTING.md`](docs/guides/TESTING.md)。

---

## 文件

- [`docs/CORE.md`](docs/CORE.md) — 架構決策索引 —— 記錄「為什麼這樣設計」（從這裡開始讀）
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — 前後端 API 規格，唯一真相來源
- [`docs/UI_SPEC.md`](docs/UI_SPEC.md) — UI 元件設計規格
- [`docs/DESIGN_TOKENS.md`](docs/DESIGN_TOKENS.md) — CSS token 對照表
- [`docs/domain-glossary.md`](docs/domain-glossary.md) — 領域術語表
- [`docs/BACKLOG.md`](docs/BACKLOG.md) — 現行 backlog（已結案項目見 `docs/BACKLOG_ARCHIVE.md`）
- [`docs/type-generation.md`](docs/type-generation.md) — 為何 TypeScript 型別要自動產生，以及 camelCase / snake_case 規則
- [`docs/appendix/`](docs/appendix/) — ADR-001 至 ADR-009、工具目錄、並行實作說明
- [`docs/guides/`](docs/guides/) — 各子系統的架構參考（pipelines、工具層、chat agent…）＋ 測試規範與 Langfuse 設定

以下兩處**刻意不反映現況**，請當歷史讀，不要當規格：

- [`docs/plans/`](docs/plans/README.md) — 規劃當下的凍結快照，實作後不再更新。與程式碼、`API_CONTRACT.md`、`UI_SPEC.md` 衝突時，以後者為準
- [`docs/archive/`](docs/archive/README.md) — 已失效或已被取代的文件，只作考古用

---

## License

[MIT](LICENSE)
