# Phase 2b: Keyword Extraction 實施指南

**前置**: Phase 2（Pipelines）完成
**目標**: 為 FeatureExtractionPipeline 加入可插拔的多策略 keyword extraction 與 hierarchical aggregation
**預估**: 1 週
**狀態**: 📋 計畫中

---

## 概覽

Phase 2 已完成 embedding generation，但 keyword extraction 尚未實作。
此 Phase 補全 `FeatureExtractionPipeline` 中 keyword 相關功能，確保**文檔 ingestion 時即產生 chunk-level keywords**，
寫入 Qdrant metadata，為後續 Phase 5 CEP `top_terms` 提供數據基礎。

### 設計原則

1. **Ingestion 時觸發** — keyword extraction 嵌入 `FeatureExtractionPipeline`，在文檔首次載入時與 embedding 一起執行
2. **多策略可插拔** — 透過 `BaseKeywordExtractor` 介面支援多種抽取方法（LLM、PKE 統計、TF-IDF 等），可自由組合
3. **Chapter-by-chapter 處理** — 與現有 embedding pipeline 一致，記憶體受控

### 數據流（Ingestion 時）

```
IngestionWorkflow.run(file_path)
    │
    ├── 1. DocumentProcessingPipeline  → Document
    ├── 2. FeatureExtractionPipeline   → embeddings + keywords  ← HERE
    │       ├── EmbeddingGenerator (existing)
    │       └── KeywordExtractor (NEW, per chunk)
    │           ├── Strategy A: LLM 抽取
    │           ├── Strategy B: PKE 統計抽取 (MultipartiteRank)
    │           └── Strategy C: TF-IDF fallback
    ├── 3. KnowledgeGraphPipeline      → KG
    ├── 4. SummarizationPipeline       → summaries
    └── 5. DocumentService.save()
              │
              ▼
         KeywordAggregator (post-pipeline)
           ├── chunk → chapter keywords
           └── chapter → book keywords
              │
              ▼
         Qdrant metadata `keywords` 欄位（chunk-level，ingestion 時寫入）
         DocumentService 存儲 chapter/book keywords
```

---

## 步驟 1: BaseKeywordExtractor 介面 + 多策略實作

**路徑**: `src/pipelines/feature_extraction/keyword_extractor.py`

### 抽象介面

```python
from abc import ABC, abstractmethod

class BaseKeywordExtractor(ABC):
    """Base interface for keyword extraction strategies."""

    @abstractmethod
    async def extract(self, text: str, top_k: int = 10) -> dict[str, float]:
        """Extract keywords with relevance scores.

        Returns: {keyword: score} where score ∈ [0, 1]
        """
        ...

    async def extract_batch(self, texts: list[str], top_k: int = 10) -> list[dict[str, float]]:
        """Batch extraction. Default: sequential. Subclasses may override for parallelism."""
        return [await self.extract(t, top_k) for t in texts]
```

### Strategy A: LLM 抽取

```python
class LLMKeywordExtractor(BaseKeywordExtractor):
    """Extract keywords using LLM semantic understanding.

    Strengths: context-aware, captures plot-significant terms, good for literary text.
    Cost: 1 LLM call per chunk.
    """

    def __init__(self, llm: BaseChatModel):
        self.llm = llm

    async def extract(self, text: str, top_k: int = 10) -> dict[str, float]:
        # Prompt → JSON {keyword: score}
        # Retry 3x with tenacity
        # Parse via _parse_json_response
        ...
```

**Prompt 設計**:
```
Extract the top {top_k} keywords from the following text.
Return a JSON object where keys are keywords and values are relevance scores (0.0 to 1.0).
Focus on: character names, locations, key concepts, plot-significant terms.
Do not include common stop words.

Text:
{text}
```

### Strategy B: PKE 統計抽取（舊版移植）

```python
class PKEKeywordExtractor(BaseKeywordExtractor):
    """Statistical keyword extraction using PKE (MultipartiteRank).

    Strengths: fast, deterministic, no LLM cost, good for frequent terms.
    Dependency: pke library.
    """

    def __init__(self, language: str = "en"):
        self.language = language

    async def extract(self, text: str, top_k: int = 10) -> dict[str, float]:
        # pke.unsupervised.MultipartiteRank
        # Synchronous library → run_in_executor
        ...
```

> **依賴**: 需要加入 `pke` 到 `pyproject.toml`。若 pke 安裝困難（依賴 spaCy 等），
> 可改用 `yake`（輕量替代，純 Python，無外部依賴）作為 PKE 備選。

### Strategy C: TF-IDF Fallback（輕量備援）

```python
class TFIDFKeywordExtractor(BaseKeywordExtractor):
    """Simple TF-IDF based keyword extraction as lightweight fallback.

    Strengths: zero external dependencies, fast, always available.
    """

    async def extract(self, text: str, top_k: int = 10) -> dict[str, float]:
        # scikit-learn TfidfVectorizer (already in deps via sentence-transformers)
        # or simple word frequency + IDF from corpus
        ...
```

### 組合策略：CompositeKeywordExtractor

```python
class CompositeKeywordExtractor(BaseKeywordExtractor):
    """Combine multiple extractors: merge and re-rank results.

    Mirrors the old version's dual-track approach (PKE + LLM).
    """

    def __init__(
        self,
        extractors: list[tuple[BaseKeywordExtractor, float]],  # (extractor, weight)
    ):
        # e.g. [(LLMKeywordExtractor(...), 0.7), (PKEKeywordExtractor(), 0.3)]
        self.extractors = extractors

    async def extract(self, text: str, top_k: int = 10) -> dict[str, float]:
        # 1. Run all extractors (concurrently via asyncio.gather)
        # 2. Weighted merge: score = Σ(weight_i * score_i) for each keyword
        # 3. Normalize scores to [0, 1]
        # 4. Return top_k
        ...
```

### 使用範例

```python
# LLM only (simple)
extractor = LLMKeywordExtractor(llm)

# PKE only (fast, no LLM cost)
extractor = PKEKeywordExtractor(language="zh")

# Dual-track (old version style)
extractor = CompositeKeywordExtractor([
    (LLMKeywordExtractor(llm), 0.7),
    (PKEKeywordExtractor(), 0.3),
])

# LLM primary + TF-IDF fallback (no pke dependency)
extractor = CompositeKeywordExtractor([
    (LLMKeywordExtractor(llm), 0.8),
    (TFIDFKeywordExtractor(), 0.2),
])
```

---

## 步驟 2: KeywordAggregator

**路徑**: `src/pipelines/feature_extraction/keyword_aggregator.py`

（與先前設計相同，保持不變）

### 階層聚合

```python
class KeywordAggregator:
    """Hierarchical keyword aggregation: chunk → chapter → book."""

    def __init__(
        self,
        strategy: str = "sum",           # sum | avg | max
        top_k: int = 20,
        weight_by_count: bool = True,    # log(frequency + 1) weighting
        semantic_merge: bool = False,     # Phase 6 可開啟
    ):
        ...

    def aggregate_to_chapter(
        self, chunk_keywords: list[dict[str, float]]
    ) -> dict[str, float]:
        """Aggregate chunk-level keywords to chapter level."""
        # 1. 合併所有 chunk keywords
        # 2. 按 strategy 計算分數
        # 3. weight_by_count: multiply by log(count + 1)
        # 4. Log normalization
        # 5. 取 top_k
        ...

    def aggregate_to_book(
        self, chapter_keywords: list[dict[str, float]]
    ) -> dict[str, float]:
        """Aggregate chapter-level keywords to book level."""
        ...
```

### 聚合策略

| 策略 | 說明 |
|------|------|
| `sum` | 累加分數（偏好高頻詞），default |
| `avg` | 平均分數（偏好穩定出現的詞） |
| `max` | 取最大分數（偏好局部重要的詞） |

### 語義合併（Optional, Phase 6）

使用 SentenceTransformer embedding + AgglomerativeClustering 合併語義相近的 keywords。
Phase 2b 暫不實作，標記為 Phase 6 優化項。

---

## 步驟 3: 整合到 FeatureExtractionPipeline

更新 `src/pipelines/feature_extraction/pipeline.py`，在 embedding 生成後加入 keyword extraction：

```python
class FeatureExtractionPipeline(BasePipeline[Document, FeatureExtractionResult]):
    """Embed + extract keywords for all paragraphs, chapter by chapter."""

    def __init__(
        self,
        embedding_generator: EmbeddingGenerator | None = None,
        keyword_extractor: BaseKeywordExtractor | None = None,  # NEW
        keyword_aggregator: KeywordAggregator | None = None,    # NEW
        qdrant_client=None,
    ) -> None:
        self._embedder = embedding_generator or EmbeddingGenerator()
        self._kw_extractor = keyword_extractor     # None = skip keyword extraction
        self._kw_aggregator = keyword_aggregator or KeywordAggregator()
        self._qdrant = qdrant_client

    async def run(self, input_data: Document) -> FeatureExtractionResult:
        doc = input_data
        total_embedded = 0
        all_qdrant_ids: list[str] = []
        chunk_keywords: list[dict[str, float]] = []

        for chapter in doc.chapters:
            paragraphs = chapter.paragraphs
            if not paragraphs:
                continue

            texts = [p.text for p in paragraphs]

            # 1. Embedding generation (existing)
            vectors = await self._embedder.aembed_texts(texts)

            # 2. Keyword extraction (NEW — runs alongside embedding)
            chapter_chunk_kws: list[dict[str, float]] = []
            if self._kw_extractor:
                chapter_chunk_kws = await self._kw_extractor.extract_batch(texts)
                chunk_keywords.extend(chapter_chunk_kws)

            # 3. Write to Qdrant with keywords in metadata
            if self._qdrant is not None:
                ids = await self._upsert_to_qdrant(
                    doc, paragraphs, vectors, chapter_chunk_kws
                )
                all_qdrant_ids.extend(ids)
            else:
                for para, vec in zip(paragraphs, vectors):
                    para.embedding = vec

            total_embedded += len(paragraphs)

        # 4. Hierarchical aggregation (NEW)
        chapter_keywords = {}
        book_keywords = {}
        if chunk_keywords and self._kw_aggregator:
            for chapter in doc.chapters:
                idxs = range(chapter.start_paragraph_idx, chapter.end_paragraph_idx)
                chapter_kws = [chunk_keywords[i] for i in idxs if i < len(chunk_keywords)]
                if chapter_kws:
                    chapter_keywords[chapter.number] = (
                        self._kw_aggregator.aggregate_to_chapter(chapter_kws)
                    )
            if chapter_keywords:
                book_keywords = self._kw_aggregator.aggregate_to_book(
                    list(chapter_keywords.values())
                )

        return FeatureExtractionResult(
            document_id=doc.id,
            paragraphs_embedded=total_embedded,
            qdrant_ids=all_qdrant_ids,
            chunk_keywords=chunk_keywords,          # NEW
            chapter_keywords=chapter_keywords,       # NEW
            book_keywords=book_keywords,             # NEW
        )
```

### Qdrant payload 更新

`_upsert_to_qdrant` 的 payload 中加入 keywords：

```python
payload = {
    "document_id": doc.id,
    "document_title": doc.title,
    "chapter_number": para.chapter_number,
    "position": para.position,
    "text": para.text,
    "keywords": list(kw_dict.keys()) if kw_dict else [],        # NEW: keyword strings
    "keyword_scores": kw_dict if kw_dict else {},                # NEW: {keyword: score}
}
```

---

## 步驟 4: IngestionWorkflow 整合

更新 `src/workflows/ingestion.py`，讓 keyword extraction 在 ingestion 時自動觸發：

```python
class IngestionWorkflow(BaseWorkflow[Path, IngestionResult]):
    def __init__(
        self,
        ...,
        keyword_extractor: BaseKeywordExtractor | None = None,  # NEW
    ):
        ...
        # 構建 FeatureExtractionPipeline 時傳入 extractor
        self._feature_pipeline = FeatureExtractionPipeline(
            embedding_generator=...,
            keyword_extractor=keyword_extractor,    # NEW
            qdrant_client=...,
        )
```

### IngestionResult 擴展

```python
@dataclass
class IngestionResult:
    ...
    chunk_keywords_extracted: int = 0     # NEW
    chapter_keywords_generated: int = 0   # NEW
    book_keywords_generated: bool = False  # NEW
```

### Settings 擴展

```python
# config/settings.py
class Settings(BaseSettings):
    ...
    keyword_strategy: str = "llm"                # "llm" | "pke" | "tfidf" | "composite"
    keyword_top_k: int = 10                       # per chunk
    keyword_aggregation_strategy: str = "sum"     # sum | avg | max
    keyword_aggregation_top_k: int = 20           # per chapter/book
```

---

## 步驟 5: 數據存儲

### DocumentService 擴展

新增方法存取 chapter/book level keywords：

```python
# DocumentService
async def save_chapter_keywords(self, doc_id: str, chapter: int, keywords: dict[str, float]): ...
async def save_book_keywords(self, doc_id: str, keywords: dict[str, float]): ...
async def get_chapter_keywords(self, doc_id: str, chapter: int) -> dict[str, float]: ...
async def get_book_keywords(self, doc_id: str) -> dict[str, float]: ...
```

---

## 步驟 6: KeywordService（Services 層）

**路徑**: `src/services/keyword_service.py`

為 Tools 層提供查詢介面（遵循 `tools/ → services/` 依賴規則）：

```python
class KeywordService:
    """Query interface for keyword data."""

    def __init__(self, doc_service: DocumentService):
        self.doc_service = doc_service

    async def get_chapter_keywords(self, doc_id: str, chapter: int, top_k: int = 20) -> dict[str, float]:
        ...

    async def get_book_keywords(self, doc_id: str, top_k: int = 20) -> dict[str, float]:
        ...

    async def get_entity_keywords(self, doc_id: str, entity_name: str) -> dict[str, float]:
        """Get keywords co-occurring with an entity (for CEP top_terms)."""
        ...
```

---

## 完成標準

- [ ] `BaseKeywordExtractor` 介面定義完成
- [ ] `LLMKeywordExtractor` 可從 chunk 抽取 keywords
- [ ] `PKEKeywordExtractor` 或 `YAKEKeywordExtractor`（統計方法）可獨立運作
- [ ] `TFIDFKeywordExtractor` 作為輕量 fallback
- [ ] `CompositeKeywordExtractor` 可組合多策略
- [ ] `KeywordAggregator` 可做 chunk → chapter → book 聚合
- [ ] `FeatureExtractionPipeline` 整合 keyword extraction（chapter-by-chapter）
- [ ] Qdrant metadata `keywords` + `keyword_scores` 欄位在 ingestion 時正確寫入
- [ ] `IngestionWorkflow` 支持傳入 keyword_extractor 參數
- [ ] `DocumentService` 支持 chapter/book keywords 存取
- [ ] `KeywordService` 提供 Tools 層查詢介面
- [ ] Settings 新增 keyword 相關配置
- [ ] 單元測試覆蓋各模組
- [ ] Phase 5 CEP `top_terms` 可透過 `KeywordService.get_entity_keywords()` 取得數據

---

## 測試策略

| 測試類型 | 覆蓋 |
|----------|------|
| Unit | 各 Extractor (mock LLM / mock pke), KeywordAggregator (各策略), CompositeExtractor, KeywordService |
| Integration | FeatureExtractionPipeline 端到端 (mock LLM + in-memory Qdrant), IngestionWorkflow with keywords |

---

## 依賴管理

### 新增依賴（視策略選擇）

| 依賴 | 用途 | 條件 |
|------|------|------|
| `pke` | MultipartiteRank 統計抽取 | 若使用 PKE 策略（需 spaCy） |
| `yake` | YAKE 統計抽取（輕量替代） | 若 PKE 安裝困難的備選 |

> `scikit-learn` 已在現有依賴中（via `sentence-transformers`），TF-IDF 不需額外安裝。

### 依賴關係

- **被依賴**: Phase 5 CEP `top_terms`
- **依賴**: Phase 2 已完成的 FeatureExtractionPipeline、DocumentService、EmbeddingGenerator

---

## 舊版參考

| 舊版檔案 | 對應新版 | 說明 |
|----------|---------|------|
| `old_version/src/core/nlp/keyword_extractor.py` | `PKEKeywordExtractor` | KpeTool (MultipartiteRank) |
| `old_version/src/core/nlp/llm_operator.py:169-200` | `LLMKeywordExtractor` | LLM extract_keyword() |
| `old_version/src/pipelines/nlp/keyword_aggregator.py` | `KeywordAggregator` | 聚合策略 + 語義合併 |
| `old_version/src/pipelines/nlp/hierarchical_process.py` | `KeywordAggregator` | chunk→chapter→book |
| `old_version/src/pipelines/feature_extraction/run_llm_tasks.py` | Pipeline 整合 | ingestion 時觸發 |

---

## 相關文檔

- [ADR-002: Pipelines & Workflows](../appendix/ADR_002_FULL.md) — Keyword Extraction 節
- [Phase 2: Pipelines](PHASE_2_PIPELINES.md) — 已完成的基礎
- [Phase 5: Deep Analysis](PHASE_5_DEEP_ANALYSIS.md) — CEP `top_terms` 依賴

---

**維護者**: William
**最後更新**: 2026-03-05
