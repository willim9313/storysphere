# StorySphere — 開發 Backlog

**用途**: 記錄已識別但尚未排入 Phase 的開發項目
**更新日期**: 2026-04-22

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
| B-040 | 符號深度分析（Symbol Deep Analysis）| 🟢 低 | 待開始 |

---

**維護者**: William
**最後更新**: 2026-04-22（B-022 SEP 完成並歸檔，B-040 仍待開始）
