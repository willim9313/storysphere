# StorySphere — 開發 Backlog

**用途**: 記錄已識別但尚未排入 Phase 的開發項目
**更新日期**: 2026-04-01

> 已完成項目歸檔於 [BACKLOG_ARCHIVE.md](BACKLOG_ARCHIVE.md)

---

## 🔴 高優先（功能缺口）

### B-012 前端後端 API 整合驗證
**背景**: 前端已完成重構（2026-03-15），對齊 `API_CONTRACT.md` 的全部端點，但目前仍使用 mock 資料（`VITE_MOCK=true`）
**內容**:
- 驗證後端 `/books`, `/chapters`, `/chunks`, `/graph`, `/analysis` 端點回傳格式與前端 types 一致
- 確保 `TaskStatus` 的 `status` 欄位為 `done/error`（非 `completed/failed`）、`progress: 0-100`、`stage: string`
- ~~Segment-based Chunk 回傳（後端需產出 `segments: Segment[]`）~~ ✅ 已實作（ingestion-time paragraph entity linking + stored offsets）
- 前端 `uploadBook(file)` 只傳 file（不含 title），後端 `POST /books/upload` 需對應

**驗收**: `VITE_MOCK=false` 時，Library → Upload → Reader → Analysis → Graph 端到端可跑通

---

## 🟡 中優先（功能完善）

### B-014 Local LLM 選型評估（進行中）
**背景**: qwen2.5-3b JSON schema 遵從度不穩定（null 代替 []、malformed JSON），已換至 Phi-3.5-mini-instruct Q4_K_M（社群量化），功能正常但速度偏慢。

**Local model 選型條件**:
- JSON schema 遵從度：能穩定回傳 `[]` 而非 `null`，不截斷 JSON
- 大小：Q4_K_M 量化後 ≤ 5GB
- 格式：GGUF，相容 llama.cpp server（OpenAI-compatible `/v1` API）
- 推理速度：single-turn < 30s 為可接受範圍

**待評估候選**:
- Phi-3.5-mini-instruct Q4_K_M（~2.2GB）← 目前使用，格式遵從佳但偏慢
- Qwen2.5-7B-Instruct Q4_K_M（~4.7GB）← 同 family 升級版
- Llama-3.2-3B-Instruct Q4_K_M（~2.0GB）← Meta 新一代 3B

**目標**: 找到速度與格式穩定性平衡最佳的選項。

---

## 🟢 低優先（可選升級）

### B-008 Neo4j Backend
**背景**: ADR-009 設計為 NetworkX（預設）↔ Neo4j（大規模可選），`kg_mode='neo4j'` 有 settings 但未實作
**內容**: `KGService` 加入 Neo4j 分支，`kg_mode='neo4j'` 時使用 `neo4j` driver
**前置條件**: 需要 Docker + Neo4j 實例

---

### B-011 生產環境配置
**內容**:
- Dockerfile + docker-compose（API + Qdrant + 可選 Neo4j）
- PostgreSQL 遷移（`database_url` 已支援，需測試）
- `uvicorn --workers N` 配合 B-003 TaskStore 持久化

---

---

## 🔴 高優先（功能缺口）— 主題分析：符號學模組

### B-017 意象實體識別策略研究（符號學前置依賴）
**背景**: 符號學分析模組的核心技術挑戰。現有 NER pipeline 處理具體命名實體（人物/地點），但符號學需要識別「光」、「水」、「門」等**意象實體**，其邊界模糊、語境依賴、可能以隱喻形式出現，無法直接用現有 NER 解決。
**設計文件**: `docs/notes/symbolic_analysis_design_notes.md` Section 四

**內容**:
- 評估三種識別策略的可行性：
  1. **詞嵌入聚類**：用 `sentence-transformers`（已有）計算語義相似度，將「光」/「火焰」/「燭光」聚合成符號族群
  2. **LLM 輔助標注**：prompt Gemini 識別段落中具有符號功能的意象詞彙
  3. **人工種子 + 擴展**：分析者提供初始符號清單，系統擴展到語義相近詞彙
- 用一本具體小說手動走完三層分析流程，驗證整體設計合理性
- 評估現有向量搜索（Qdrant）能否支援語境採樣需求
- 輸出可行性評估報告，確定最終策略（或組合策略）

**實作提示**: 可先用 `src/services/keyword_service.py` 的 YAKE 提取高頻名詞作為候選意象，再用現有 `sentence-transformers` 做聚類實驗
**前置依賴**: 無（本項是 B-018 ~ B-022 的前置依賴）

---

## 🟡 中優先（功能完善）— 主題分析：符號學模組

### B-018 ImagerEntity Domain Model 設計
**背景**: 符號學模組需要新的實體類型表示意象實體，與現有 `Entity`（人物/地點）平行但語意不同。
**前置依賴**: B-017（策略確定後才能設計 schema 邊界）

**內容**:
- 設計 `ImagerEntity` Pydantic model（`src/domain/imagery.py`）：
  - `ImagerEntity`：符號本身（name, aliases, book_id, frequency, chapter_distribution）
  - `SymbolOccurrence`：單次出現記錄（chunk_id, chapter, position, context_window, co_occurring_symbols）
  - `SymbolCluster`：同義詞族群（canonical_name, variants, semantic_similarity_scores）
- 設計對應的 `DocumentService` 存取方法（`save_symbol`, `get_symbol_occurrences`）

**實作提示**: 參考 `src/domain/models.py` 的 `Entity` / `Event` 設計模式；存儲層沿用 SQLite（與 `analysis_cache.py` 一致）

---

### B-019 符號學第一層：候選符號發現 Pipeline
**背景**: 三層架構的第一層，回答「有什麼值得追蹤？」，為純統計工作（不涉及語義詮釋）。
**前置依賴**: B-018

**內容**:
- 實作 `src/pipelines/symbol_discovery.py`：
  - 高頻意象提取：去除停用詞後識別頻率異常高的名詞/意象（可複用 YAKE 結果）
  - 情感密度標記：識別在情感強烈段落（衝突、死亡、轉折）密集出現的意象
  - 分佈不均檢測：識別在特定章節突然大量出現或消失的意象
- 輸出候選符號清單，附帶：出現頻率、章節分佈圖、情感密度分數
- 整合進 `IngestionWorkflow`（可選，類似 keyword extraction 的整合方式）

**實作提示**: 情感密度標記可借助現有 `EventAnalysis` 的情感標注結果；分佈分析直接基於 `DocumentService.get_chapter_keywords()` 的章節邊界

---

### B-020 符號共現網絡建構（Layer 2）
**背景**: 三層架構的第二層，回答「這些符號之間有什麼關係？」，建立符號關係網絡。
**前置依賴**: B-019

**內容**:
- 共現矩陣：計算哪些意象總是一起出現、哪些從不同時出現（滑動窗口，window_size 可設定）
- 語境採樣：每個符號出現時提取周圍語義場（複用 Qdrant 向量搜索找相似語境）
- 語境變化追蹤：同一符號在不同章節的語境是否有系統性差異
- **設計決策**：符號共現圖作為 NetworkX 的**平行圖層**（節點類型 `ImageryNode`，與現有 `EntityNode` 共存，不合併）

**實作提示**: 共現圖資料結構與 `src/services/kg_service.py` 相同，可新建 `SymbolGraphService` 複用 NetworkX API；`KGService.get_subgraph()` 的查詢模式可直接借用

---

## 🟢 低優先（可選升級）— 主題分析：符號學模組

### B-021 詮釋輔助介面（Layer 3）— 符號時間軸
**背景**: 三層架構的第三層，將前兩層統計結果組織成分析者可直接閱讀的格式。系統只呈現觀察，不提供詮釋。
**前置依賴**: B-019, B-020

**內容**:
- API 端點：
  - `GET /api/v1/symbols?book_id={id}` — 返回候選符號清單（含頻率、分佈）
  - `GET /api/v1/symbols/{symbol_id}/timeline` — 某符號的所有出現實例，按章節排列附前後文
  - `GET /api/v1/symbols/{symbol_id}/co-occurrences` — 共現關係最強的符號組
- 自動標記語境發生明顯變化的位置（章節邊界的語境差異超過閾值）
- 前端：符號時間軸視覺化元件（參考現有 EventTimeline 元件模式）

---

### B-022 符號學 Pipeline 整合與 Deep Analysis 對接
**背景**: 將三層功能整合為完整 Pipeline，並接入現有 Deep Analysis Workflow，讓分析者可從 Character/Event 分析直接跳轉到相關符號追蹤。
**前置依賴**: B-020, B-021

**內容**:
- 整合 `SymbolDiscoveryPipeline` + `SymbolGraphService` + API layer 為完整符號學分析工作流
- 新增 `AnalysisAgent` 符號學分析入口（類比現有 `analyze_character` / `analyze_event`）
- 詮釋結果持久化設計：分析者手動添加的詮釋命題如何儲存和版本管理
- 評估跨書比較可行性（同一符號在不同作品的意義差異）

---

---

## 🟡 中優先（功能完善）— 主題分析：敘事學模組

### B-032 Ingestion prompt 時間線索提取預留
**背景**: 熱奈特時序分析的完整實作需要故事時間軸，但故事時間標記成本高。短期策略是在 ingestion 時提取文本中已存在的時間線索（「多年前」、「那個夏天」），成本增量極小，但為未來保留入口。
**前置依賴**: 無（B-031 已完成，`StoryTimeRef` schema 已定義）

**內容**:
- 更新 Event 提取 prompt（`src/pipelines/entity_extractor.py`），新增選填項：
  ```
  如果段落中有明確的時間線索（例如「多年前」、「那個夏天」、「三天後」），
  請提取並填入 time_anchor 欄位。如果沒有明確線索，留空。
  ```
- 僅提取文本中已存在的線索，不做推斷——此限制確保可靠性
- 驗證：至少一本測試小說中有足夠比例的 Event 節點有 `time_anchor` 值

---

### B-033 Kernel/Satellite 第一階段：摘要啟發式分類
**背景**: 現有層級摘要（書/章/段）已隱含粗略的重要性分層——能進入章節摘要的 Event 本來就比只在段落層的 Event 重要。第一階段直接利用這個信號，不需要額外 LLM 調用。
**前置依賴**: 無（B-031 已完成，`narrative_weight` 欄位已存在）

**內容**:
- 新增 `src/domain/narrative.py`：`NarrativeStructure`, `HeroJourneyStage`, `ProppFunctionRef` models
- 新增 `src/services/narrative_service.py`：
  - `classify_by_heuristic(book_id)` — 依層級摘要推斷 `narrative_weight`，標記 `source="summary_heuristic"`
  - 規則：書級摘要出現 → kernel 候選；只在段落層 → satellite；中間層 → 待 LLM 細化
- 用一本具體小說手動驗證啟發式規則的準確率，特別是邊界案例

**實作提示**: `DocumentService.get_chapter_summary()` 已可查詢各層摘要；Event 的 `source_passages` 對應到摘要層級的邏輯已在 KGService 中有類似模式

---

### B-034 Kernel/Satellite 第二階段：LLM 細化分類
**背景**: 啟發式結果有誤差，特別是出現在章節摘要但語義上是渲染性的 Event。第二階段對不確定的候選集進行 LLM 完整判斷，核心問題：「刪去這個事件，後續因果鏈是否還能成立？」
**前置依賴**: B-033

**內容**:
- `NarrativeService.refine_with_llm(event_ids)` — 輸入：候選 Event + 前後相鄰 Event + 所在章節摘要；LLM 輸出 `kernel | satellite` + 判斷依據 + 置信度
- 定義衝突解決規則：若摘要層級信號和 LLM 判斷不一致，以哪個為準（建議：LLM 判斷優先，記錄分歧供人工審核）
- `NarrativeService.get_kernel_spine(book_id)` — 返回 kernel 事件列表（情節骨幹）

---

### B-035 坎伯英雄旅程 LLM 結構對應
**背景**: Frye/Booker 輸出類型標籤（這本書是什麼故事），坎伯輸出結構對應（哪個章節對應旅程的哪個階段）。兩者輸入相同（章節摘要序列），但後者需要章節到階段的映射，允許重疊。
**前置依賴**: 無（輸入為現有章節摘要，不依賴其他張力/敘事學模組）

**內容**:
- `NarrativeService.map_hero_journey(book_id)` — 輸入章節摘要序列，LLM 輸出 `HeroJourneyStage` 列表（12 個階段 × 對應章節範圍 + 代表性 Event + 置信度）
- 設計決策：多主角作品（如群戲）採用哪種處理策略（分開分析 / 整合為一條旅程 / 跳過）
- 設計決策：階段允許跨章節重疊（`chapter_range` 為列表而非單一值）
- 新增 `src/config/hero_journey.py`（12 個階段定義，類比 `src/config/archetypes.py`）

**實作提示**: 參考 `src/services/analysis_service.py` 的 archetype 分類模式，輸入/輸出結構高度相似

---

## 🟢 低優先（可選升級）— 主題分析：敘事學模組

### B-036 NarrativeStructure 節點儲存 + 查詢介面
**背景**: 整合 Kernel/Satellite 分類結果和英雄旅程對應，存儲為書級 `NarrativeStructure` 節點，並提供 API 查詢介面。
**前置依賴**: B-033, B-035

**內容**:
- `DocumentService.save_narrative_structure()` / `get_narrative_structure(book_id)`
- API 端點：`GET /api/v1/narrative?book_id={id}` — 返回 `NarrativeStructure`（含 kernel 清單、英雄旅程對應、普羅普序列摘要）
- `PATCH /api/v1/narrative/{id}/review` — 人工審核 / 修改 `review_status`

---

### B-037 熱奈特時序分析（倒敘/預敘識別 + 時距計算）
**背景**: 需要 B-032 的 `time_anchor` 覆蓋率達到足夠比例後才啟動評估。完整實作：文本位置排名 vs 故事時間排名的差值 = 倒敘/預敘量化指標。
**前置依賴**: B-032，且需 `story_time` 覆蓋率評估通過（建議閾值：≥ 60% Event 節點有 `time_anchor`）

**內容**:
- 書級 `story_time_structure` 標記（`"linear"` / `"partially_linear"` / `"non_linear"`），非線性則跳過
- `NarrativeService.analyze_temporal_order(book_id)` — 計算文本位置排名 vs 故事時間排名差值，識別顯著倒敘/預敘節點
- 時距分析：Event 的段落字數 vs 故事時間長短的比例，識別作者不成比例渲染的場景

---

### B-038 敘事結構視覺化 + Deep Analysis Workflow 完整整合
**背景**: 將 B-033 ~ B-036 的所有元件整合為端到端敘事學分析工作流，並提供前端視覺化。
**前置依賴**: B-033, B-035, B-036

**內容**:
- 前端：情節骨幹圖（Kernel 節點高亮於現有時間軸）、英雄旅程對應圖（12 個階段 × 章節範圍）
- 整合進 `AnalysisAgent`（新入口，類比 `analyze_character` / `analyze_event`）
- 完整流程文件：`docs/guides/PHASE_11_NARRATOLOGY.md`

---

## 📋 狀態追蹤

| ID | 項目 | 優先 | 狀態 |
|----|------|------|------|
| B-008 | Neo4j Backend | 🟢 低 | 待開始 |
| B-011 | 生產環境配置 | 🟢 低 | 待開始 |
| B-012 | 前端後端 API 整合驗證 | 🔴 高 | 待開始 |
| B-014 | Local LLM 選型評估 | 🟡 中 | 進行中 |
| B-017 | 意象實體識別策略研究 | 🔴 高 | 待開始 |
| B-018 | ImagerEntity Domain Model 設計 | 🟡 中 | 待開始 |
| B-019 | 符號學 Layer 1：候選符號發現 Pipeline | 🟡 中 | 待開始 |
| B-020 | 符號共現網絡建構（Layer 2） | 🟡 中 | 待開始 |
| B-021 | 詮釋輔助介面（Layer 3）符號時間軸 | 🟢 低 | 待開始 |
| B-022 | 符號學 Pipeline 整合與 Deep Analysis 對接 | 🟢 低 | 待開始 |
| B-032 | Ingestion prompt 時間線索提取預留 | 🟡 中 | 待開始 |
| B-033 | Kernel/Satellite 第一階段：摘要啟發式分類 | 🟡 中 | 待開始 |
| B-034 | Kernel/Satellite 第二階段：LLM 細化分類 | 🟡 中 | 待開始 |
| B-035 | 坎伯英雄旅程 LLM 結構對應 | 🟡 中 | 待開始 |
| B-036 | NarrativeStructure 節點儲存 + 查詢介面 | 🟢 低 | 待開始 |
| B-037 | 熱奈特時序分析（倒敘/預敘識別）| 🟢 低 | 待開始 |
| B-038 | 敘事結構視覺化 + Deep Analysis 整合 | 🟢 低 | 待開始 |

---

**維護者**: William
**最後更新**: 2026-04-02（移除空的敘事學高優先區塊；B-032、B-033 前置依賴 B-031 已完成，解除阻塞）
