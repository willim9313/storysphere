# StorySphere — 開發 Backlog

**用途**: 記錄已識別但尚未排入 Phase 的開發項目
**更新日期**: 2026-04-02

> 已完成項目歸檔於 [BACKLOG_ARCHIVE.md](BACKLOG_ARCHIVE.md)

---

## 🔴 高優先（核心功能）

### B-039 展開卷軸（Unraveling）— 資料透明度 DAG
**背景**: 系統為每本書建立的資料量體對用戶不可見，功能不可用時也難以診斷是哪個資料層尚未建立。

**內容**:
- `GET /api/v1/books/{book_id}/unraveling` 聚合端點，向各 service 查詢計數並組裝 manifest JSON
- 三層 DAG 節點：原生文本層（book_meta / chapters / paragraphs）、知識圖譜層（entities / relations / events）、深度分析層（temporal / symbols / character_analysis / event_analysis / narrative_structure / tension_analysis）
- 橫向 DAG 前端頁面，用 Cytoscape.js preset 佈局（layer 欄位驅動 x 座標）
- `AnalysisCache` 新增 `count_keys(pattern)` 方法（非破壞性，含 TTL 過濾）
- TEU 計數特殊處理：先取 event_id 清單，再並行查詢 `teu:{event_id}` 快取鍵

**設計決策**:
- Relation count v1 使用全域 `kg_service.relation_count`（KGService 無 document_id filter），在 meta 標注 `"scope": "global"`
- Symbol occurrence count 用 `sum(e.frequency for e in imagery_entities)`，避免載入所有 SymbolOccurrence

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

### B-011 生產環境配置
**內容**:
- Dockerfile + docker-compose（API + Qdrant + 可選 Neo4j）
- PostgreSQL 遷移（`database_url` 已支援，需測試）
- `uvicorn --workers N` 配合 B-003 TaskStore 持久化

---

### B-022 符號學 Pipeline 整合與 Deep Analysis 對接
**背景**: 將三層功能整合為完整 Pipeline，並接入現有 Deep Analysis Workflow，讓分析者可從 Character/Event 分析直接跳轉到相關符號追蹤。
**前置依賴**: B-020, B-021（均已完成）

**內容**:
- 整合 `SymbolDiscoveryPipeline` + `SymbolGraphService` + API layer 為完整符號學分析工作流
- 新增 `AnalysisAgent` 符號學分析入口（類比現有 `analyze_character` / `analyze_event`）
- 詮釋結果持久化設計：分析者手動添加的詮釋命題如何儲存和版本管理
- 評估跨書比較可行性（同一符號在不同作品的意義差異）

---

## 📋 狀態追蹤

| ID | 項目 | 優先 | 狀態 |
|----|------|------|------|
| B-039 | 展開卷軸（Unraveling）| 🔴 高 | 進行中 |
| B-011 | 生產環境配置 | 🟢 低 | 待開始 |
| B-014 | Local LLM 選型評估 | 🟡 中 | 進行中 |
| B-022 | 符號學 Pipeline 整合與 Deep Analysis 對接 | 🟢 低 | 待開始 |

---

**維護者**: William
**最後更新**: 2026-04-07（B-039 展開卷軸開始開發）
