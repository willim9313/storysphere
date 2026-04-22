# StorySphere — 開發 Backlog

**用途**: 記錄已識別但尚未排入 Phase 的開發項目
**更新日期**: 2026-04-02

> 已完成項目歸檔於 [BACKLOG_ARCHIVE.md](BACKLOG_ARCHIVE.md)

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
| B-011 | 生產環境配置 | 🟢 低 | 待開始 |
| B-014 | Local LLM 選型評估 | 🟡 中 | 進行中 |
| B-022 | 符號學 Pipeline 整合與 Deep Analysis 對接 | 🟢 低 | 待開始 |

---

**維護者**: William
**最後更新**: 2026-04-22（B-039 展開卷軸完成，移至 archive）
