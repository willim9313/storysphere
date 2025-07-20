# 敘事領域 - 小說解析器 / StorySphere - Novel Analyzer

> 敘事領域(StorySphere)是一個基於 LLM 和向量資料庫的小說分析系統，提供文本摘要、關鍵字提取、知識圖譜構建和角色分析等功能。

## 核心功能

### 文件處理與索引
- 支援 PDF/DOCX 格式小說文件載入
- 自動章節識別與切分（支援中英文章節標題）
- 文本 Chunk 切分與向量化儲存
- Qdrant 向量資料庫整合

### 自然語言處理
- **摘要生成**：層級式摘要（章節級、全書級）
- **關鍵字提取**：基於 MultipartiteRank 算法
- **知識圖譜**：實體關係抽取與正規化
- **角色分析**：角色屬性、關係網絡分析

### 知識圖譜構建
- 實體識別與屬性提取（人物、地點、組織等）
- 關係識別與三元組構建
- 實體正規化與去重
- 圖譜視覺化

### 分析功能
- 角色行為軌跡分析(in progress)
- 主題與情感分析(in progress)
- 寫作風格分析(in progress)
- 層級式內容聚合(in progress)

## 專案架構

```
storysphere/
├── src/                           # 核心程式碼
│   ├── core/                      # 核心模組
│   │   ├── indexing/             # 向量資料庫操作
│   │   │   └── vector_store.py   # Qdrant 向量儲存
│   │   ├── llm/                  # LLM 客戶端
│   │   │   ├── gemini_client.py  # Google Gemini
│   │   │   ├── ollama_client.py  # Ollama 本地模型
│   │   │   └── openai_client.py  # OpenAI API
│   │   ├── nlp/                  # NLP 工具
│   │   │   ├── llm_operator.py   # LLM 任務封裝
│   │   │   └── keyword_extractor.py # 關鍵字提取
│   │   ├── kg/                   # 知識圖譜
│   │   │   ├── loader.py         # 資料載入
│   │   │   ├── entity_linker.py  # 實體連結
│   │   │   ├── graph_builder.py  # 圖譜構建
│   │   │   └── kg_retriever.py   # 資料檢索
│   │   ├── validators/           # 資料驗證
│   │   │   ├── kg_schema_validator.py    # KG 結構驗證
│   │   │   └── nlp_utils_validator.py    # NLP 輸出驗證
│   │   └── utils/                # 工具函數
│   │       ├── id_generator.py   # ID 生成器
│   │       └── output_extractor.py # 輸出解析
│   ├── pipelines/                # 資料處理管道
│   │   ├── preprocessing/        # 預處理
│   │   │   ├── loader.py         # 文件載入
│   │   │   ├── chapter_splitter.py # 章節切分
│   │   │   └── chunk_splitter.py # 文本切分
│   │   ├── feature_extraction/   # 特徵提取
│   │   │   └── run_llm_tasks.py  # LLM 任務執行
│   │   ├── vector_indexing/      # 向量索引
│   │   │   └── embed_and_store.py # 向量化與儲存
│   │   ├── nlp/                  # NLP 管道
│   │   │   ├── hierarchical_process.py # 層級處理
│   │   │   └── keyword_aggregator.py   # 關鍵字聚合
│   │   └── kg/                   # 知識圖譜管道
│   │       ├── canonical_entity_pipeline.py # 實體正規化
│   │       ├── graph_construction_pipeline.py # 圖譜構建
│   │       └── entity_attribute_extraction_pipeline.py # 屬性提取
│   └── workflows/                # 工作流程
│       ├── indexing/             # 索引工作流
│       │   └── run_doc_ingestion.py # 文件攝取流程
│       ├── nlp/                  # NLP 工作流
│       │   ├── generate_hierarchical_summary.py # 層級摘要
│       │   └── generate_hierarchical_keywords.py # 層級關鍵字
│       ├── kg/                   # 知識圖譜工作流
│       │   └── run_full_kg_workflow.py # 完整 KG 流程
│       └── character_analysis/   # 角色分析工作流
│           └── character_analysis.py # 角色分析
├── tests/                        # 測試程式碼
├── data/                         # 資料目錄
│   ├── novella/                 # 小說文件
│   ├── kg_storage/              # 知識圖譜資料
│   └── art/                     # 分析結果
├── config/                       # 配置文件
│   └── schema_kg_story.yaml     # KG 結構定義
├── main_test_*.py               # 測試腳本
└── requirements.txt             # 依賴套件
```

## 🛠️ 安裝與設定

### 環境需求
- Python 3.12.9
- Qdrant 向量資料庫
- LLM API 金鑰 (Gemini/OpenAI/Ollama)

### 安裝步驟

1. **克隆專案**
```bash
git clone <repository-url>
cd storysphere
```

2. **安裝依賴**
```bash
pip install -r requirements.txt
```

3. **設定環境變數**
```bash
# 複製環境變數模板
cp .env.example .env

# 編輯 .env 文件，設定以下變數：
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-1.5-flash
QDRANT_HOST=localhost
QDRANT_PORT=6333
```

4. **啟動 Qdrant 資料庫**
```bash
docker run -p 6333:6333 qdrant/qdrant
```

## 使用方式

### 1. 文件攝取與處理

```python
from src.workflows.indexing.run_doc_ingestion import run_ingestion_pipeline

# 處理小說文件，生成向量索引
run_ingestion_pipeline(
    input_dir="./data/novella",
    collection_name="MyNovel",
    api_key="your_api_key",
    model_name="gemini-1.5-flash",
    limit_pages=10  # 限制處理頁數（可選）
)
```

### 2. 層級摘要生成

```python
from src.workflows.nlp.generate_hierarchical_summary import (
    gen_hierarchical_chapter_summary,
    gen_hierarchical_book_summary
)

# 生成章節級摘要
gen_hierarchical_chapter_summary(
    target_collection_doc_id="doc_uuid",
    source_collection="MyNovel"
)

# 生成全書摘要
gen_hierarchical_book_summary(
    target_collection_doc_id="doc_uuid",
    omni_chapters_collection="chapter_summaries",
    omni_books_collection="book_summaries"
)
```

### 3. 知識圖譜構建

```python
from src.workflows.kg.run_full_kg_workflow import run_full_kg_workflow

# 執行完整的知識圖譜構建流程
run_full_kg_workflow(
    entity_path="./data/kg_storage/kg_entity_set.json",
    relation_path="./data/kg_storage/kg_relation_set.json"
)
```

### 4. 角色分析

```python
from src.workflows.character_analysis.character_analysis import (
    run_character_analysis_workflow
)

# 分析指定角色
run_character_analysis_workflow(
    target_role=["Harry Potter", "Hermione Granger"],
    kg_entity_path="./data/kg_storage/kg_entity_set.json"
)
```

## 📊 核心模組說明

### Vector Store (向量儲存)
- **位置**: `src/core/indexing/vector_store.py`
- **功能**: Qdrant 向量資料庫操作封裝
- **主要方法**: `store_chunk()`, `search()`, `get_by_id()`

### LLM Operator (LLM 操作器)
- **位置**: `src/core/nlp/llm_operator.py`
- **功能**: 統一的 LLM 任務介面
- **支援任務**: 摘要、關鍵字提取、知識圖譜抽取

### Knowledge Graph Pipeline (知識圖譜管道)
- **位置**: `src/pipelines/kg/`
- **功能**: 實體抽取、正規化、圖譜構建
- **輸出**: JSON 格式的實體關係資料

### Hierarchical Processor (層級處理器)
- **位置**: `src/pipelines/nlp/hierarchical_process.py`
- **功能**: 多層級內容聚合（chunk → 章節 → 全書）

## 🔧 測試腳本

專案提供多個測試腳本供快速驗證功能：

- `main_test_run_doc_ingestion.py`: 測試文件攝取流程
- `main_test_kg.py`: 測試知識圖譜構建
- `main_test_hierarchical.py`: 測試層級摘要與關鍵字
- `main_test_entity_retriever.py`: 測試實體檢索與角色分析

## 📈 支援的文件格式

- **PDF**: 使用 PyPDF2/pypdf 解析
- **DOCX**: 使用 python-docx 處理
- **章節識別**: 支援中英文章節標題模式

## 🎯 應用場景

- 📚 **文學研究**: 自動化文本分析與摘要
- 🎭 **角色研究**: 角色關係網絡與行為分析
- 📖 **內容整理**: 大部頭小說的結構化整理
- 🔍 **語義搜尋**: 基於向量相似度的內容檢索

## ⚠️ 注意事項

1. **API 配額**: LLM API 呼叫會產生費用，請注意使用量
2. **記憶體使用**: 大型文件處理需要充足記憶體
3. **向量資料庫**: 確保 Qdrant 服務正常運行
4. **模型選擇**: 不同 LLM 模型效果可能有差異

## 🤝 貢獻指南

別了，我還有很多想實現的功能。  
以下列舉幾個有點意思的：
- 增加知識圖譜中關係預測的推論功能
- 角色劇情模擬：用戶自己決定可能的情境，利用既有角色資訊做出what if scenario
- 圖像生成：using text2image model
    - 可以指定風格對角色生成圖像
    - 對劇情或是特定段落生成圖像等
    - 但這個坑可能有點大
- 提供更多解析上的工具以及說明，讓使用者更明白自己看的東西是什麼


---

# StorySphere - Novel Analyzer

> An intelligent novel analysis system based on LLM and vector databases, providing text summarization, keyword extraction, knowledge graph construction, and character analysis features.

## Core Features

### Document Processing & Indexing
- Support for PDF/DOCX novel file loading
- Automatic chapter identification and segmentation (supports Chinese and English chapter titles)
- Text chunk splitting and vector storage
- Qdrant vector database integration

### Natural Language Processing
- **Summary Generation**: Hierarchical summaries (chapter-level, book-level)
- **Keyword Extraction**: Based on MultipartiteRank algorithm
- **Knowledge Graph**: Entity relationship extraction and normalization
- **Character Analysis**: Character attributes and relationship network analysis

### Knowledge Graph Construction
- Entity identification and attribute extraction (characters, locations, organizations, etc.)
- Relationship identification and triplet construction
- Entity normalization and deduplication
- Graph visualization

### Analysis Features
- Character behavior trajectory analysis (in progress)
- Theme and sentiment analysis (in progress)
- Writing style analysis (in progress)
- Hierarchical content aggregation (in progress)

## Project Architecture

```
storysphere/
├── src/                           # Core source code
│   ├── core/                      # Core modules
│   │   ├── indexing/             # Vector database operations
│   │   │   └── vector_store.py   # Qdrant vector storage
│   │   ├── llm/                  # LLM clients
│   │   │   ├── gemini_client.py  # Google Gemini
│   │   │   ├── ollama_client.py  # Ollama local models
│   │   │   └── openai_client.py  # OpenAI API
│   │   ├── nlp/                  # NLP tools
│   │   │   ├── llm_operator.py   # LLM task wrapper
│   │   │   └── keyword_extractor.py # Keyword extraction
│   │   ├── kg/                   # Knowledge graph
│   │   │   ├── loader.py         # Data loading
│   │   │   ├── entity_linker.py  # Entity linking
│   │   │   ├── graph_builder.py  # Graph construction
│   │   │   └── kg_retriever.py   # Data retrieval
│   │   ├── validators/           # Data validation
│   │   │   ├── kg_schema_validator.py    # KG structure validation
│   │   │   └── nlp_utils_validator.py    # NLP output validation
│   │   └── utils/                # Utility functions
│   │       ├── id_generator.py   # ID generator
│   │       └── output_extractor.py # Output parsing
│   ├── pipelines/                # Data processing pipelines
│   │   ├── preprocessing/        # Preprocessing
│   │   │   ├── loader.py         # Document loading
│   │   │   ├── chapter_splitter.py # Chapter splitting
│   │   │   └── chunk_splitter.py # Text chunking
│   │   ├── feature_extraction/   # Feature extraction
│   │   │   └── run_llm_tasks.py  # LLM task execution
│   │   ├── vector_indexing/      # Vector indexing
│   │   │   └── embed_and_store.py # Vectorization & storage
│   │   ├── nlp/                  # NLP pipeline
│   │   │   ├── hierarchical_process.py # Hierarchical processing
│   │   │   └── keyword_aggregator.py   # Keyword aggregation
│   │   └── kg/                   # Knowledge graph pipeline
│   │       ├── canonical_entity_pipeline.py # Entity normalization
│   │       ├── graph_construction_pipeline.py # Graph construction
│   │       └── entity_attribute_extraction_pipeline.py # Attribute extraction
│   └── workflows/                # Workflows
│       ├── indexing/             # Indexing workflows
│       │   └── run_doc_ingestion.py # Document ingestion flow
│       ├── nlp/                  # NLP workflows
│       │   ├── generate_hierarchical_summary.py # Hierarchical summary
│       │   └── generate_hierarchical_keywords.py # Hierarchical keywords
│       ├── kg/                   # Knowledge graph workflows
│       │   └── run_full_kg_workflow.py # Full KG workflow
│       └── character_analysis/   # Character analysis workflows
│           └── character_analysis.py # Character analysis
├── tests/                        # Test code
├── data/                         # Data directory
│   ├── novella/                 # Novel files
│   ├── kg_storage/              # Knowledge graph data
│   └── art/                     # Analysis results
├── config/                       # Configuration files
│   └── schema_kg_story.yaml     # KG structure definition
├── main_test_*.py               # Test scripts
└── requirements.txt             # Dependencies
```

## 🛠️ Installation & Setup

### Requirements
- Python 3.12.9
- Qdrant vector database
- LLM API keys (Gemini/OpenAI/Ollama)

### Installation Steps

1. **Clone the project**
```bash
git clone <repository-url>
cd storysphere
```

2. **Install dependencies**
```bash
pip install -r requirements.txt
```

3. **Configure environment variables**
```bash
# Copy environment template
cp .env.example .env

# Edit .env file and set the following variables:
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-1.5-flash
QDRANT_HOST=localhost
QDRANT_PORT=6333
```

4. **Start Qdrant database**
```bash
docker run -p 6333:6333 qdrant/qdrant
```

## Usage

### 1. Document Ingestion & Processing

```python
from src.workflows.indexing.run_doc_ingestion import run_ingestion_pipeline

# Process novel files and generate vector index
run_ingestion_pipeline(
    input_dir="./data/novella",
    collection_name="MyNovel",
    api_key="your_api_key",
    model_name="gemini-1.5-flash",
    limit_pages=10  # Limit processing pages (optional)
)
```

### 2. Hierarchical Summary Generation

```python
from src.workflows.nlp.generate_hierarchical_summary import (
    gen_hierarchical_chapter_summary,
    gen_hierarchical_book_summary
)

# Generate chapter-level summaries
gen_hierarchical_chapter_summary(
    target_collection_doc_id="doc_uuid",
    source_collection="MyNovel"
)

# Generate book-level summary
gen_hierarchical_book_summary(
    target_collection_doc_id="doc_uuid",
    omni_chapters_collection="chapter_summaries",
    omni_books_collection="book_summaries"
)
```

### 3. Knowledge Graph Construction

```python
from src.workflows.kg.run_full_kg_workflow import run_full_kg_workflow

# Execute complete knowledge graph construction workflow
run_full_kg_workflow(
    entity_path="./data/kg_storage/kg_entity_set.json",
    relation_path="./data/kg_storage/kg_relation_set.json"
)
```

### 4. Character Analysis

```python
from src.workflows.character_analysis.character_analysis import (
    run_character_analysis_workflow
)

# Analyze specific characters
run_character_analysis_workflow(
    target_role=["Harry Potter", "Hermione Granger"],
    kg_entity_path="./data/kg_storage/kg_entity_set.json"
)
```

## 📊 Core Module Descriptions

### Vector Store
- **Location**: `src/core/indexing/vector_store.py`
- **Function**: Qdrant vector database operations wrapper
- **Main Methods**: `store_chunk()`, `search()`, `get_by_id()`

### LLM Operator
- **Location**: `src/core/nlp/llm_operator.py`
- **Function**: Unified LLM task interface
- **Supported Tasks**: Summarization, keyword extraction, knowledge graph extraction

### Knowledge Graph Pipeline
- **Location**: `src/pipelines/kg/`
- **Function**: Entity extraction, normalization, graph construction
- **Output**: JSON format entity relationship data

### Hierarchical Processor
- **Location**: `src/pipelines/nlp/hierarchical_process.py`
- **Function**: Multi-level content aggregation (chunk → chapter → book)

## 🔧 Test Scripts

The project provides multiple test scripts for quick functionality verification:

- `main_test_run_doc_ingestion.py`: Test document ingestion workflow
- `main_test_kg.py`: Test knowledge graph construction
- `main_test_hierarchical.py`: Test hierarchical summary & keywords
- `main_test_entity_retriever.py`: Test entity retrieval & character analysis

## 📈 Supported File Formats

- **PDF**: Parsed using PyPDF2/pypdf
- **DOCX**: Processed using python-docx
- **Chapter Recognition**: Supports Chinese and English chapter title patterns

## 🎯 Use Cases

- 📚 **Literary Research**: Automated text analysis and summarization
- 🎭 **Character Studies**: Character relationship networks and behavior analysis
- 📖 **Content Organization**: Structured organization of large novels
- 🔍 **Semantic Search**: Vector similarity-based content retrieval

## ⚠️ Notes

1. **API Quotas**: LLM API calls incur costs, please monitor usage
2. **Memory Usage**: Large document processing requires sufficient memory
3. **Vector Database**: Ensure Qdrant service is running properly
4. **Model Selection**: Different LLM models may have varying performance

## 🤝 Contributing

There are still many features I'd like to implement.  
Here are some interesting ones:

- Add inference capabilities for relationship prediction in knowledge graphs
- Character story simulation: Users can decide possible scenarios and use existing character information for "what if" scenarios
- Image generation: using text2image models
    - Generate character images with specified styles
    - Generate images for plots or specific passages
    - But this might be a big undertaking
- Provide more analysis tools and explanations to help users better understand what they're looking at

---

> 💡 **Tip**: This is a backend analysis framework, suitable for developers who need deep text analysis capabilities. If you need a frontend interface, please develop or integrate existing UI frameworks yourself.
