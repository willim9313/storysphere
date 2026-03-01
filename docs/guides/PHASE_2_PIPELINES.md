# Phase 2: Pipelines 實施指南

**版本**: v1.0
**更新日期**: 2026-02-26
**狀態**: ✅ 已實作完成

---

## 目標與完成定義

Phase 2 實作 ADR-002 所定義的 ETL Pipelines 層，以及基礎 Services shell。

### 完成標準

- [x] PDF / DOCX → Document（含 Chapters, Paragraphs）可正常解析
- [x] Paragraphs 向量化（sentence-transformers）並可寫入 Qdrant
- [x] Entities 抽取（Gemini LLM）、去重（EntityLinker）、寫入 KGService
- [x] Relations、Events 抽取並寫入 KGService
- [x] `IngestionWorkflow` 串接三條 pipeline 端到端可執行
- [x] 單元測試覆蓋各 pipeline 模組與 Services
- [x] Services shell（KGService + DocumentService）就緒供 Phase 3 工具使用

---

## 架構概覽

### 資料流

```
PDF / DOCX
    │
    ▼
DocumentProcessingPipeline
  ├── loader.py          PDF/DOCX → list[(index, text)]
  ├── chapter_detector.py → list[ChapterSpan]
  ├── chunker.py         → list[Paragraph]
  └── pipeline.py        → Document
    │
    ├─────────────────────────────────────────┐
    ▼                                         ▼
FeatureExtractionPipeline              KnowledgeGraphPipeline
  ├── embedding_generator.py             ├── entity_extractor.py   (Gemini)
  │   HuggingFaceEmbeddings              ├── relation_extractor.py (Gemini)
  │   (all-MiniLM-L6-v2, 384 dims)      ├── entity_linker.py      (dedup)
  └── pipeline.py → Qdrant               └── pipeline.py → KGService
    │                                         │
    └────────────────┬────────────────────────┘
                     ▼
              DocumentService
              (SQLite / aiosqlite)
```

---

## 各模組實作說明

### 1. `pipelines/base.py` — 抽象基類

```python
class BasePipeline(ABC, Generic[InputT, OutputT]):
    async def run(self, input_data: InputT) -> OutputT: ...
    async def __call__(self, input_data) -> OutputT: ...  # logs + delegates
    def _log_step(self, step: str, **kwargs): ...
```

所有 Pipelines 都是 async，I/O 不阻塞主執行緒。

---

### 2. Document Processing Pipeline

#### `loader.py`
- `load_pdf(path)` — 使用 `pypdf`，每頁一條 `(index, text)`
- `load_docx(path)` — 使用 `python-docx`，每段落一條

#### `chapter_detector.py`
啟發式規則，優先級由高到低：
1. "Chapter N" / "Chapter One" (英文)
2. "第N章" (中文)
3. 獨立羅馬數字 (I, II, III…)
4. 獨立阿拉伯數字 (1, 2, 3…)
5. Prologue / Epilogue / Preface 等

> 若無任何章節標題，整個文件視為第 1 章。

#### `chunker.py`
- 超過 `MAX_CHARS=1200` 的段落：按句子邊界拆分
- 少於 `MIN_CHARS=50` 的段落：與後繼段落合併

---

### 3. Feature Extraction Pipeline

#### `embedding_generator.py`
- 包裝 `langchain_huggingface.HuggingFaceEmbeddings`
- 從 `Settings` 讀取 model/device/batch_size
- `_get_embeddings()` 使用 `lru_cache` 避免重複載入模型
- 提供 `embed_texts()`（同步）和 `aembed_texts()`（異步，thread pool）

#### `pipeline.py`

處理邏輯為**逐章（chapter-by-chapter）**，峰值記憶體隨最大章節規模而定，
而非整本書的段落總量。

```
for chapter in doc.chapters:
    vectors = embed(chapter.paragraphs)   # 單一章節，通常 20-50 段
    if qdrant:
        upsert(vectors)                   # 寫入後 vectors 超出 scope → GC
    else:
        para.embedding = vec              # dev/test：存入 Paragraph
    # vectors 在此迭代結束後即可被 GC
```

| 路徑 | Paragraph.embedding | 向量去向 |
|------|---------------------|---------|
| 有 Qdrant（生產）| **不設定（None）** | Qdrant |
| 無 Qdrant（開發/測試）| 設定 | DocumentService→SQLite |

**峰值記憶體估算（1,000 頁書，~10,000 段）：**
- 舊設計（全書一次）：模型 90MB + 三份向量 ~330MB ≈ **420MB+**
- 新設計（逐章）：模型 90MB + 單章向量 ~0.5MB ≈ **~91MB**

---

### 4. Knowledge Graph Pipeline

#### `entity_extractor.py`
- System prompt 要求 LLM 輸出 JSON `{"entities": [...]}`
- 每個 entity: name, entity_type, aliases, description, attributes
- 使用 `tenacity` retry（最多 3 次，指數退避）
- 支援 markdown fence 的 JSON 解析

#### `relation_extractor.py`
- System prompt 要求同時輸出 `relations` 和 `events`
- 輸入：章節文字 + 已知 entity 名稱清單
- 只提取清單中已知的 entity 間的關係（避免幻覺）
- 同樣使用 tenacity retry

#### `entity_linker.py`
- 精確名稱匹配（正規化：lowercase, 去標點）
- Alias 交叉比對（一個 entity 的 alias = 另一個 entity 的名稱）
- 合併策略：mention_count 最高者為 canonical，合併所有 aliases + attributes

#### `pipeline.py`
順序：
1. 每章節抽 entities（文字存入 `chapter_texts` dict）
2. 全文件 EntityLinker 去重
3. 每章節抽 relations + events：用 `pop()` 取出章節文字並從 dict 移除 → 已處理章節的文字立即可被 GC
4. 可選：寫入 KGService

---

### 5. Services 層

#### `kg_service.py` (NetworkX MultiDiGraph)
| 方法 | 說明 |
|------|------|
| `add_entity(entity)` | 加入節點 |
| `get_entity(id)` | 按 ID 查詢 |
| `get_entity_by_name(name)` | 按名稱/alias 查詢（忽略大小寫）|
| `list_entities(type?)` | 列出所有實體（可過濾類型）|
| `add_relation(relation)` | 加入有向邊 |
| `get_relations(entity_id, direction)` | 查詢進/出/雙向關係 |
| `add_event(event)` | 存儲事件 + 關聯參與者節點 |
| `get_events(entity_id?)` | 查詢事件（可過濾 entity）|
| `save()` / `load()` | JSON 持久化 |

#### `document_service.py` (SQLAlchemy + aiosqlite)
| 方法 | 說明 |
|------|------|
| `init_db()` | 建立表格（idempotent）|
| `save_document(doc)` | Upsert document + chapters + paragraphs |
| `get_document(id)` | 完整取回（含所有段落）|
| `list_documents()` | 輕量列表（id, title, file_type）|
| `get_paragraphs(doc_id, chapter?)` | 按章節查詢段落 |

---

### 6. Ingestion Workflow

`IngestionWorkflow` 串接所有步驟，容錯設計：
- Feature extraction 失敗 → 記錄 error，繼續執行 KG
- KG extraction 失敗 → 記錄 error，繼續 persist document
- Document persist 失敗 → 記錄 error，仍回傳 result

建構參數：
- `skip_qdrant=True` — 無 Qdrant 環境時跳過向量寫入
- `skip_kg=True` — 純文件處理，不做 LLM 抽取

---

## 新增依賴

```toml
# pyproject.toml (已更新)
"sentence-transformers>=3.0"
"langchain-huggingface>=0.1.0"
```

安裝：
```bash
uv sync
```

---

## 設定項（Settings）

```python
# src/config/settings.py (已更新)
embedding_model_name: str = "all-MiniLM-L6-v2"
embedding_device: str = "cpu"
embedding_batch_size: int = 32
qdrant_vector_size: int = 384
```

對應 `.env` 變數（`.env.example` 已更新）：
```env
EMBEDDING_MODEL_NAME=all-MiniLM-L6-v2
EMBEDDING_DEVICE=cpu
EMBEDDING_BATCH_SIZE=32
QDRANT_VECTOR_SIZE=384
```

---

## 測試策略

### 單元測試（不需 API key）
```bash
uv run pytest tests/pipelines/ tests/services/ -m "not integration" -v
```

涵蓋：
- `test_document_processing.py` — chapter_detector, chunker, pipeline
- `test_feature_extraction.py` — EmbeddingGenerator (mocked), pipeline
- `test_knowledge_graph.py` — EntityLinker, JSON 解析器
- `test_kg_service.py` — KGService CRUD + persistence
- `test_document_service.py` — DocumentService CRUD

### 整合測試（需 GEMINI_API_KEY）
```bash
uv run pytest tests/ -m integration -v
```

---

## 快速開始

```python
import asyncio
from pathlib import Path
from workflows.ingestion import IngestionWorkflow

async def main():
    workflow = IngestionWorkflow(skip_qdrant=True)  # no Qdrant needed
    result = await workflow.run(Path("my_novel.pdf"))
    print(f"Entities: {result.entities}")
    print(f"Relations: {result.relations}")
    print(f"Events: {result.events}")

asyncio.run(main())
```

---

## 常見問題

### Q: 為什麼 KG pipeline 很慢？
A: 每章節需要兩次 LLM 呼叫（entity + relation/event），大型書籍需要數分鐘。
Phase 6 將用 `asyncio.gather` 並行化章節處理。

### Q: Embedding 模型第一次下載很久？
A: `all-MiniLM-L6-v2` 約 90MB，第一次 `_get_embeddings()` 會自動從 HuggingFace 下載並快取。
後續呼叫透過 `lru_cache` 直接使用已載入的模型。

### Q: 如何換用更強的 Embedding 模型？
A: 修改 `.env` 中的 `EMBEDDING_MODEL_NAME` 和 `QDRANT_VECTOR_SIZE`，重建 Qdrant collection。

### Q: 沒有 GEMINI_API_KEY 怎麼辦？
A: LLMClient 自動 fallback 到 OPENAI_API_KEY 或 ANTHROPIC_API_KEY。
若都沒有，設定 `skip_kg=True` 跳過 KG extraction，仍可完成文件解析和向量化。

---

**維護者**: William
**最後更新**: 2026-02-26
