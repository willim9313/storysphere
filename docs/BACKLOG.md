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

### B-022 SEP Domain Model + 組裝 Pipeline
**背景**: 符號學目前止於原始提取（`ImageryEntity` + 共現圖），缺乏結構化的語境 profile，無法作為 LLM 詮釋的輸入。本 ticket 對應 B-026（TEU 組裝）的符號學等價物，只做結構化、不做 LLM 詮釋。
**前置依賴**: B-020, B-021（均已完成）

**內容**:
- `src/domain/symbol_analysis.py`：`SEP`（Symbol Evidence Profile）— 欄位包含 `imagery_id`, `book_id`, `occurrence_contexts`（段落文字 + 章節位置）、`co_occurring_entities`（人物/事件 ID）、`chapter_distribution`（各章出現頻率）、`peak_chapters`
- `SymbolService.assemble_sep(imagery_id, book_id)` — 從 `SymbolService`、`SymbolGraphService`、`DocumentService` 並行拉取資料組裝 SEP，存入 `AnalysisCache`（key: `sep:{book_id}:{imagery_id}`）
- `GET /api/v1/symbols/{imagery_id}/sep` — 查詢已組裝的 SEP；若 cache miss 則即時組裝
- SEP 不含任何 LLM 呼叫，純資料彙整

**設計決策**:
- SEP 存入 `AnalysisCache` 而非 SQLite，與 CEP/EEP/TEU 一致
- `co_occurring_entities` 只記錄 entity ID，不展開完整資料（避免 SEP 過大）

**連帶更新**:
- `src/api/routers/unraveling.py`：Layer 2 補充 `sep` 節點，計數用 `cache.count_keys(f"sep:{book_id}:%")`；補充邊 `symbols → sep`、`kg_entity → sep`
- B-040 完成後再補 `sep → symbol_analysis_result`（Layer 3）節點與邊

---

### B-040 符號深度分析（Symbol Deep Analysis）
**背景**: 以 SEP 為輸入，進行 LLM 詮釋，產出符號意義命題與跨層連結。對應 B-022a 完成後的下一層，架構上類比 B-027~B-029（TensionLine → TensionTheme）。
**前置依賴**: B-022

**內容**:
- `src/domain/symbol_analysis.py` 補充：`SymbolInterpretation` — 欄位包含 `theme`（主題命題）、`polarity`（正/負/中性）、`evidence_summary`、`linked_characters`、`linked_events`、`confidence`
- `SymbolAnalysisService.analyze_symbol(imagery_id, book_id)` — LLM 讀取 SEP 產出 `SymbolInterpretation`，存入 `AnalysisCache`（key: `symbol_analysis:{book_id}:{imagery_id}`）
- `AnalysisAgent.analyze_symbol()` — 入口方法（類比 `analyze_character` / `analyze_event`），async task + WebSocket 推送
- API 端點：`POST /api/v1/symbols/{imagery_id}/analyze` → task_id；`GET /api/v1/symbols/{imagery_id}/interpretation`
- 詮釋持久化：`PATCH /api/v1/symbols/{imagery_id}/interpretation` 支援人工修訂（HITL，類比 TensionLine review）
- 跨書比較留待評估（選配，複雜度高）

---

## 📋 狀態追蹤

| ID | 項目 | 優先 | 狀態 |
|----|------|------|------|
| B-011 | 生產環境配置 | 🟢 低 | 待開始 |
| B-014 | Local LLM 選型評估 | 🟡 中 | 進行中 |
| B-022 | SEP Domain Model + 組裝 Pipeline | 🟢 低 | 待開始 |
| B-040 | 符號深度分析（Symbol Deep Analysis）| 🟢 低 | 待開始 |

---

**維護者**: William
**最後更新**: 2026-04-22（B-022 拆分為 B-022 SEP + B-040 符號深度分析）
