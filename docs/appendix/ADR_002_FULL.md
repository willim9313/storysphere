# ADR-002: Pipelines & Workflows 層次清晰化

**狀態**: ✅ Approved  
**日期**: 2026-02-22  
**決策者**: William, AI Architect

---

## 背景 (Context)

當前項目的 `src/pipelines/` 和 `src/workflows/` 職責不清晰，難以維護。

在 Agent 架構下：
- 一些流程需要保持確定性（數據處理）
- 一些流程需要靈活性（Agent 驅動）

---

## 決策 (Decision)

**完全重構 Pipelines & Workflows，不保留既有結構。**

### 新架構

#### Pipelines 層 (確定的、可復現的、無決策)

```
src/pipelines/
├── document_processing/
│   ├── loader.py           # PDF/DOCX 文本提取
│   ├── chapter_detector.py # 章節自動識別
│   ├── chunker.py          # 文本分塊
│   └── pipeline.py         # 編排流程
├── feature_extraction/
│   ├── keyword_extractor.py
│   ├── embedding_generator.py
│   └── pipeline.py
├── knowledge_graph/
│   ├── entity_extractor.py
│   ├── relation_extractor.py
│   ├── entity_linker.py    # 去重
│   └── pipeline.py
└── base.py                 # Pipeline 基類
```

#### Workflows 層 (高級業務流程，可能包含 Agent)

```
src/workflows/
├── ingestion.py            # 文檔攝取工作流（自動化）
├── chat_workflow.py        # Chat Agent 工作流（LangGraph）
├── analysis_workflow.py    # 深度分析工作流（LangGraph）
└── base.py                 # Workflow 基類
```

### 決策樹

- **數據處理** → Pipeline（無需決策）
- **用戶交互** → Workflow（可能涉及決策/Agent）

---

## 根據 (Rationale)

- Pipeline = 確定的 ETL，Workflow = 業務編排
- Agent 工作流就在 `workflows/` 層實現（用 LangGraph）
- 清晰的職責分離便於開發和維護

---

## 後果 (Consequences)

### 變更
⚠️ 需要刪除/重寫所有既有的 pipelines 和 workflows  
⚠️ 測試也需要重新組織  
✅ 長期維護成本降低

---

## 實作細節補充（Phase 2 完成後）

### `base.py` 抽象介面

```python
class BasePipeline(ABC, Generic[InputT, OutputT]):
    async def run(self, input_data: InputT) -> OutputT: ...
    async def __call__(self, input_data) -> OutputT: ...
    def _log_step(self, step: str, **kwargs): ...
```

`BaseWorkflow` 介面相同，定義於 `src/workflows/base.py`。

### Pipeline 輸入/輸出合約

| Pipeline | 輸入 | 輸出 |
|----------|------|------|
| `DocumentProcessingPipeline` | `Path` (PDF/DOCX) | `Document` |
| `FeatureExtractionPipeline` | `Document` | `FeatureExtractionResult` |
| `KnowledgeGraphPipeline` | `Document` | `KGExtractionResult` |

### Services 層互動方式

- Pipelines **不直接** import Services；Services 透過建構子注入（dependency injection）
- `KnowledgeGraphPipeline(kg_service=...)` — 傳入 None 時只抽取，不寫入
- `FeatureExtractionPipeline(qdrant_client=...)` — 傳入 None 時只生成 embedding

### LangChain 使用邊界（決策 4）

| 層次 | 使用方式 |
|------|---------|
| 文件載入 | 直接用 `pypdf` / `python-docx` |
| Pipeline 編排 | 純 Python async |
| LLM 抽取 | `LLMClient`（已封裝 LangChain）|
| Embedding | `langchain_huggingface.HuggingFaceEmbeddings` |

### Embedding 設定（決策 5）

Settings 新增欄位：`embedding_model_name`, `embedding_device`,
`embedding_batch_size`, `qdrant_vector_size`。

預設：`all-MiniLM-L6-v2`（384 維，CPU，batch 32）。

### KG Schema 定義

```
Entity Types (6): character, location, organization, object, concept, other
Relation Types (10): family, friendship, romance, enemy, ally, subordinate,
                     located_in, member_of, owns, other
Event Types (10): plot, conflict, revelation, turning_point, meeting,
                  battle, death, romance, alliance, other
```

> **舊版演進備註**: 舊版用 7 entity types（含 Person/Time/Event）+ 9 relation types（action-based: knows, possesses 等）。新版改為文學導向 schema：Person→character、移除 Time/Event entity type（Event 為獨立 domain model）、relation type 改為 relationship-category-based。

### Entity Canonicalization（EntityLinker）

已實現的 3 階段去重流程（`src/pipelines/knowledge_graph/entity_linker.py`）：

1. **載入**: 將 entity/relation 載入結構化格式，正規化名稱（大小寫、空白、別名）
2. **相似度聚類**: Embed entity names（all-MiniLM-L6-v2）→ cosine similarity（0.95 threshold）→ connected components → canonical name（longest / most-frequent strategy）
3. **圖建構**: 以 canonical entities 重新建構知識圖譜，合併重複邊

### 向量元數據 Schema

Qdrant 每個 chunk 的 metadata payload：

| 欄位 | 類型 | 說明 |
|------|------|------|
| `doc_id` | str | 文檔 ID |
| `chapter_number` | int | 章節編號 |
| `chapter_title` | str | 章節標題 |
| `chunk_seq` | int | chunk 在章節內序號 |
| `summary` | str | chunk 摘要 |
| `keywords` | list[str] | 關鍵詞 |
| `entities` | list[str] | 角色名列表 |

> **舊版備註**: 舊版還在 metadata 中存放 `kg_entities`、`kg_relations`（raw KG data），新版可視檢索需求決定是否保留。

### Keyword Aggregation（未來擴展）

舊版 `KeywordAggregator` 提供了 hierarchical aggregation 設計（chunk→chapter→book）：

- **聚合策略**: sum / avg / max
- **頻率加權**: log normalization
- **語義合併**: SentenceTransformer + AgglomerativeClustering

標記為未來 `FeatureExtractionPipeline` 擴展，Phase 2 當前使用簡單的 chunk-level keywords。

---

## 相關決策

- [ADR-001: Agent 架構](ADR_001_FULL.md)
- [ADR-003: 工具層](ADR_003_FULL.md)

---

**最後更新**: 2026-02-26
**狀態**: ✅ Approved + Implemented
**維護者**: William
