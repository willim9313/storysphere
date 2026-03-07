# Phase 4 實施指南 — Composite Tools + Chat Agent

**版本**: v1.0
**狀態**: ✅ 已實作完成

---

## 概覽

Phase 4 在 Phase 3 工具層之上建立對話層：4 個 composite tools 處理常見的多步驟查詢，搭配基於 LangGraph 的 chat agent（ReAct 推理），以及快速路由用的 query pattern recognizer。

## 架構

```
使用者查詢
  │
  ▼
┌──────────────────────────────────────────────────┐
│                   ChatAgent                      │
│  ┌──────────────────────────────────────┐        │
│  │  QueryPatternRecognizer              │        │
│  │  (regex，confidence > 0.8 → 快速路由) │        │
│  └────────┬─────────────┬───────────────┘        │
│      快速  │             │ fallback               │
│      路由  │             ▼                        │
│           │  ┌──────────────────────────┐        │
│           │  │  LangGraph ReAct Agent   │        │
│           │  │  create_react_agent()    │        │
│           │  │  system prompt + tools   │        │
│           │  └──────────┬───────────────┘        │
│           │             │                        │
│           ▼             ▼                        │
│  ┌──────────────────────────────────────┐        │
│  │  18 個工具（14 base + 4 composite）  │        │
│  └────────┬──────────┬──────────┬───────┘        │
│           │          │          │                 │
│      ┌────▼──┐  ┌────▼──┐  ┌───▼────┐           │
│      │  KG   │  │  Doc  │  │ Vector │           │
│      │Service│  │Service│  │Service │           │
│      └───────┘  └───────┘  └────────┘           │
│                                                  │
│  ChatState（外部管理 — 實體追蹤、                 │
│             工具快取、代名詞解析）                 │
└──────────────────────────────────────────────────┘
```

## 設計決策

1. **使用 `create_react_agent` 而非自訂 `StateGraph`** — 預建的 ReAct loop 已處理工具呼叫與條件路由。Phase 6 若需要自訂節點（如平行工具執行）才考慮改用自訂 graph。

2. **ChatState 獨立於 LangGraph state** — LangGraph 內部使用 `MessagesState`；`ChatState` 由 `ChatAgent` 作為外部對話追蹤器管理，負責實體追蹤、代名詞解析與工具快取。

3. **QueryPatternRecognizer 是前置過濾器** — 不是 LangGraph node，而是在 `ChatAgent.chat()` 中 agent loop 之前執行，將高信心查詢直接路由至 composite tools。

4. **Composite tools 採循序呼叫** — 目前不使用 `asyncio.gather`。Phase 6 將改為並行 service 呼叫以提升效能。

5. **雙語系統提示** — 同時支援英文與中文查詢，包含工具選擇的 few-shot 範例。

## 檔案結構

```
src/agents/
├── states.py              # ChatState（8 個欄位 + 6 個方法）
├── pattern_recognizer.py  # QueryPatternRecognizer（6 種模式）
├── chat_agent.py          # ChatAgent（LangGraph wrapper）
└── analysis_agent.py      # （Phase 5 — placeholder）

src/tools/composite_tools/
├── __init__.py                # 匯出 4 個工具
├── get_entity_profile.py      # GetEntityProfileTool
├── get_relationship.py        # GetEntityRelationshipTool
├── get_character_arc.py       # GetCharacterArcTool
└── compare_characters.py      # CompareCharactersTool
```

## ChatState 方法

| 方法 | 說明 |
|------|------|
| `add_entity_mention(entity)` | 追蹤實體提及次數，更新 `current_focus_entity` |
| `resolve_pronoun(pronoun)` | 將 he/she/they/他/她/它 對應至 `current_focus_entity` |
| `cache_tool_result(tool_name, result)` | 儲存結果與時間戳 |
| `get_cached_result(tool_name, ttl_seconds=300)` | 若未過期則回傳快取結果 |
| `add_message(role, content)` | 附加至 `conversation_history` |
| `trim_history(max_turns=10)` | 保留最後 N 條訊息 |

## Composite Tools

| 工具 | 整合內容 | 使用情境 |
|------|----------|----------|
| `get_entity_profile` | KG 屬性 + 章節摘要 + 向量搜尋 + 關係 | "X 是誰？" |
| `get_entity_relationship` | 兩個實體屬性 + 關係路徑 + 文本段落 | "X 與 Y 的關係？" |
| `get_character_arc` | 時間軸事件 + 向量搜尋 + LLM insight | "X 如何發展？" |
| `compare_characters` | 兩個實體屬性 + 關係 + LLM 比較 | "比較 X 與 Y" |

所有 composite tools 遵循相同模式：
- 透過 ID 或名稱解析實體（fallback 至 `get_entity_by_name`）
- 循序呼叫 sub-services，以 try/except 包裹（部分失敗仍回傳可用結果）
- 透過 `json.dumps()` 回傳 JSON 字串
- 接受可選 services（`doc_service`、`vector_service`、`analysis_service`）— 部分為 `None` 時以精簡輸出回應

## QueryPatternRecognizer

6 種模式，支援中英雙語 regex：

| 模式 | 關鍵字（部分） | 對應工具 | 基礎信心值 |
|------|--------------|---------|------------|
| `entity_info` | who is, 是誰, tell me about | `get_entity_profile` | 0.85 |
| `relationship` | relationship, 關係, between X and Y | `get_entity_relationship` | 0.85 |
| `timeline` | timeline, arc, 發展, how does X change | `get_character_arc` | 0.85 |
| `comparison` | compare, 比較, vs, differences between | `compare_characters` | 0.85 |
| `summary` | summary, 摘要, chapter N | `get_summary` | 0.80 |
| `search` | find, search, 搜索, where is X mentioned | `vector_search` | 0.80 |

實體擷取啟發式規則：
- 引號內字串：`"Elizabeth Bennet"`、`「李明」`
- 關鍵字後的大寫名稱：`about Alice`
- 成對名稱：`Alice and Bob`、`Alice vs Bob`

每成功擷取一個實體，信心值 +0.05（上限 0.95）。

## ChatAgent 使用方式

```python
from agents.chat_agent import ChatAgent
from agents.states import ChatState

agent = ChatAgent(
    kg_service=kg,
    doc_service=doc,
    vector_service=vec,
    analysis_service=analysis,  # 可選
    llm=llm,                    # 可選，預設使用 Gemini
)

state = ChatState()
answer = await agent.chat("Alice 是誰？", state)

# 串流模式
async for token in agent.astream("告訴我 Bob 的故事", state):
    print(token, end="")
```

### 執行流程：`chat(query, state)`

1. **代名詞解析** — 若查詢為短語且含代名詞，替換為 focus entity
2. **新增使用者訊息** 至 state
3. **快速路由** — `QueryPatternRecognizer.recognize()`，若信心值 > 0.8 直接呼叫工具、快取結果、回傳
4. **Agent loop** — `self._graph.ainvoke({"messages": [HumanMessage(query)]})`
5. **後處理** — 新增 assistant 訊息、更新實體提及次數、裁切歷史紀錄

### 設定項目

| 設定 | 預設值 | 說明 |
|------|--------|------|
| `chat_agent_max_iterations` | 10 | ReAct loop 最大迭代次數 |
| `chat_agent_temperature` | 0.3 | 對話 LLM 溫度 |

## Tool Registry 更新

```python
from tools import get_chat_tools

tools = get_chat_tools(
    kg_service=kg,
    doc_service=doc,
    vector_service=vec,
    analysis_service=analysis,  # 供 composite tools 使用
    # ... 其他可選 services
)
# 回傳 18 個工具：14 base + 4 composite
```

## 工具數量總覽

| 類別 | 工具數 | 狀態 |
|------|--------|------|
| Graph | 6 | ✅ |
| Retrieval | 5 | ✅ |
| Analysis | 1 + 2 stubs | ✅/❌ |
| Other | 2 | ✅ |
| Composite | 4 | ✅ |
| **合計** | **20** | **18 完整 + 2 stubs** |

## 測試

```bash
# ChatState 方法測試
uv run pytest tests/agents/test_states.py -v

# Composite tools 測試
uv run pytest tests/tools/test_composite_tools.py -v

# Pattern recognizer 測試
uv run pytest tests/agents/test_pattern_recognizer.py -v

# Chat agent 測試
uv run pytest tests/agents/test_chat_agent.py -v

# 完整測試套件（240 個測試）
uv run pytest tests/ -m "not integration" -v
```

所有測試使用 mock services，不需要 API key 或資料庫。

## 下一步（Phase 5）

Phase 5（深度分析工作流程）將：
1. 實作 `AnalyzeCharacterTool` 與 `AnalyzeEventTool` stubs
2. 使用 Phase 2b 關鍵字建立角色演化分析（CEP）
3. 建立以快取優先策略的非同步分析工作流程（7 天 SQLite 快取）
4. 透過 WebSocket 推播長時間分析結果
