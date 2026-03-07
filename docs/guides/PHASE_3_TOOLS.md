# Phase 3 實施指南 — 工具層 (Tool Layer)

**版本**: v1.0
**狀態**: ✅ 已實作完成

---

## 概覽

Phase 3 實作基礎工具層：15 個繼承自 LangChain `BaseTool` 的子類，供 Phase 4 Chat Agent 用於知識圖譜查詢、文本檢索與分析。

## 架構

```
┌──────────────────────────────────────────────────┐
│              Chat Agent（Phase 4）               │
│           LangGraph + tool selection             │
└────────────────┬─────────────────────────────────┘
                 │ 呼叫工具
┌────────────────▼─────────────────────────────────┐
│              工具層（Phase 3）                   │
│  15 個 BaseTool 子類（thin wrappers）            │
│  tool_registry.py → get_chat_tools()             │
└────────┬──────────┬──────────┬───────────────────┘
         │          │          │
    ┌────▼──┐  ┌────▼──┐  ┌───▼────┐
    │  KG   │  │  Doc  │  │ Vector │
    │Service│  │Service│  │Service │
    └───────┘  └───────┘  └────────┘
```

## 設計原則

1. **Thin Wrapper**：工具不含業務邏輯，只負責驗證輸入、轉發給 service、格式化輸出。

2. **Service Injection**：每個工具透過建構子注入依賴（`kg_service=`、`doc_service=`、`vector_service=`）。

3. **ADR-008 工具描述**：每個工具都有精確的 `description`，包含 USE / DO NOT USE 說明。這對 agent 工具選擇準確率（>85%）至關重要。

4. **Async-first**：所有工具實作 `_arun()`，並以 `asyncio.get_event_loop().run_until_complete()` 作為同步 fallback。

## 檔案結構

```
src/tools/
├── __init__.py               # Re-exports get_chat_tools, get_analysis_tools
├── base.py                   # format_entity/relation/event, handle_not_found
├── schemas.py                # 所有工具的 Pydantic I/O schemas
├── tool_registry.py          # get_chat_tools() / get_analysis_tools()
├── graph_tools/              # 6 個工具：entity attrs/relations/timeline, paths, subgraph, stats
├── retrieval_tools/          # 3 個工具：vector search, summary, paragraphs
├── analysis_tools/           # 1 完整（insight）+ 2 stubs（character/event）
└── other_tools/              # 3 個工具：extract entities, compare, chapter summary
```

## Phase 3 新增的 Services

### KGService — 4 個新方法
- `get_entity_timeline(entity_id)` — 依章節排序的事件列表
- `get_relation_paths(source, target, max_length)` — 透過 NetworkX 查詢所有簡單路徑
- `get_subgraph(entity_id, k_hops)` — k-hop ego-graph
- `get_relation_stats(entity_id?)` — 關係類型分佈 + 權重統計

### DocumentService — 1 個新方法
- `get_chapter_summary(document_id, chapter_number)` — 單一章節摘要

### VectorService — 全新 service
- `search(query_text, top_k, document_id?)` — Qdrant 語意搜尋
- `ensure_collection()` — 冪等的 collection 建立
- `upsert_paragraphs(paragraphs)` — 批次向量寫入
- 開發/測試：自動使用 in-memory Qdrant（`":memory:"`）

## Tool Registry 使用方式

```python
from tools import get_chat_tools

tools = get_chat_tools(
    kg_service=kg_svc,
    doc_service=doc_svc,
    vector_service=vec_svc,
    llm=llm,                    # 可選，供 GenerateInsightTool 使用
    entity_extractor=extractor,  # 可選，供 ExtractEntitiesFromTextTool 使用
)
# 回傳 13 個可用工具（stubs 不包含在內）
```

Phase 5 深度分析使用：
```python
from tools import get_analysis_tools

tools = get_analysis_tools(...)  # 回傳 13 + 2 stubs = 15 個工具
```

## Stub 設計（預留給 Phase 5）

`AnalyzeCharacterTool` 與 `AnalyzeEventTool` 是完整定義的 stubs，包含：
- 完整 `args_schema`（Pydantic 輸入驗證）
- 完整 `description`（供 agent 工具選擇）
- 系統提示模板（已備妥領域知識）
- 輸出 schema（供驗證用）
- `_arun()` 拋出 `NotImplementedError("Phase 5: ...")`

## 測試

所有工具使用 mock services 測試，不需要真實 DB / API：

```bash
# 執行 Phase 3 所有測試
uv run pytest tests/tools/ tests/services/test_kg_service_queries.py \
    tests/services/test_document_service_summary.py \
    tests/services/test_vector_service.py -v

# 執行完整非整合測試套件
uv run pytest -m "not integration" -v
```

## 工具數量總覽

| 類別 | 工具數 | 狀態 |
|------|--------|------|
| Graph | 6 | ✅ |
| Retrieval | 3 | ✅ |
| Analysis | 1 + 2 stubs | ✅/❌ |
| Other | 3 | ✅ |
| **合計** | **15** | **13 完整 + 2 stubs** |

## 下一步（Phase 4）

Phase 4 將：
1. 將 `get_chat_tools()` 匯入 LangGraph chat agent
2. 將工具綁定至 agent 的 tool node
3. 實作串流 WebSocket 回應
4. 新增 ChatState 工具結果快取（5 分鐘 TTL）
