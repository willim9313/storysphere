# Phase 4 Implementation Guide — Composite Tools + Chat Agent

## Overview

Phase 4 builds the conversational layer on top of Phase 3's tool layer:
4 composite tools for common multi-step queries, a LangGraph-based chat agent
with ReAct reasoning, and a query pattern recognizer for fast routing.

## Architecture

```
User query
  │
  ▼
┌──────────────────────────────────────────────────┐
│              ChatAgent                           │
│  ┌──────────────────────────────────────┐        │
│  │  QueryPatternRecognizer              │        │
│  │  (regex, confidence > 0.8 → fast)    │        │
│  └────────┬─────────────┬───────────────┘        │
│      fast │             │ fallback               │
│      route│             ▼                        │
│           │  ┌──────────────────────────┐        │
│           │  │  LangGraph ReAct Agent   │        │
│           │  │  create_react_agent()    │        │
│           │  │  system prompt + tools   │        │
│           │  └──────────┬───────────────┘        │
│           │             │                        │
│           ▼             ▼                        │
│  ┌──────────────────────────────────────┐        │
│  │         18 Tools (14 base + 4 comp.) │        │
│  └────────┬──────────┬──────────┬───────┘        │
│           │          │          │                 │
│      ┌────▼──┐  ┌────▼──┐  ┌───▼────┐           │
│      │  KG   │  │  Doc  │  │ Vector │           │
│      │Service│  │Service│  │Service │           │
│      └───────┘  └───────┘  └────────┘           │
│                                                  │
│  ChatState (external — entity tracking,          │
│             tool cache, pronoun resolution)       │
└──────────────────────────────────────────────────┘
```

## Design Decisions

1. **`create_react_agent` over custom `StateGraph`** — The prebuilt ReAct loop
   handles tool calling and conditional routing. Phase 6 may switch to a custom
   graph if we need custom nodes (e.g., parallel tool execution).

2. **ChatState is external to LangGraph state** — LangGraph uses `MessagesState`
   internally. `ChatState` is managed by `ChatAgent` as an external conversation
   tracker for entity tracking, pronoun resolution, and tool caching.

3. **QueryPatternRecognizer is a pre-filter** — Not a LangGraph node. It runs
   before the agent loop in `ChatAgent.chat()` to fast-route high-confidence
   queries directly to composite tools.

4. **Composite tools do sequential sub-calls** — No `asyncio.gather` yet.
   Phase 6 will parallelize with concurrent service calls.

5. **Bilingual system prompt** — Supports both English and Chinese queries
   with few-shot examples for tool selection.

## File Structure

```
src/agents/
├── states.py              # ChatState (8 fields + 6 methods)
├── pattern_recognizer.py  # QueryPatternRecognizer (6 patterns)
├── chat_agent.py          # ChatAgent (LangGraph wrapper)
└── analysis_agent.py      # (Phase 5 — placeholder)

src/tools/composite_tools/
├── __init__.py                # Exports 4 tools
├── get_entity_profile.py      # GetEntityProfileTool
├── get_relationship.py        # GetEntityRelationshipTool
├── get_character_arc.py       # GetCharacterArcTool
└── compare_characters.py      # CompareCharactersTool
```

## ChatState Methods

| Method | Description |
|--------|-------------|
| `add_entity_mention(entity)` | Track entity mention count, update `current_focus_entity` |
| `resolve_pronoun(pronoun)` | Map he/she/they/他/她/它 → `current_focus_entity` |
| `cache_tool_result(tool_name, result)` | Store result with timestamp |
| `get_cached_result(tool_name, ttl_seconds=300)` | Return cached result if < TTL |
| `add_message(role, content)` | Append to `conversation_history` |
| `trim_history(max_turns=10)` | Keep last N messages |

## Composite Tools

| Tool | Combines | Use Case |
|------|----------|----------|
| `get_entity_profile` | KG attrs + chapter summary + vector search + relations | "Who is X?" |
| `get_entity_relationship` | Entity attrs × 2 + relation paths + evidence passages | "Relationship between X and Y?" |
| `get_character_arc` | Timeline events + vector search + LLM insight | "How does X develop?" |
| `compare_characters` | Entity attrs × 2 + relations + LLM comparison | "Compare X and Y" |

All composite tools follow the same pattern:
- Resolve entity by ID or name (with fallback to `get_entity_by_name`)
- Call sub-services sequentially, wrapped in try/except (partial results on failure)
- Return JSON string via `json.dumps()`
- Accept optional services (`doc_service`, `vector_service`, `analysis_service`)
  — work with reduced output if some are `None`

## QueryPatternRecognizer

6 patterns with bilingual regex (English + Chinese):

| Pattern | Keywords (subset) | Tool | Base Confidence |
|---------|-------------------|------|-----------------|
| `entity_info` | who is, 是誰, tell me about | `get_entity_profile` | 0.85 |
| `relationship` | relationship, 關係, between X and Y | `get_entity_relationship` | 0.85 |
| `timeline` | timeline, arc, 發展, how does X change | `get_character_arc` | 0.85 |
| `comparison` | compare, 比較, vs, differences between | `compare_characters` | 0.85 |
| `summary` | summary, 摘要, chapter N | `get_summary` | 0.80 |
| `search` | find, search, 搜索, where is X mentioned | `vector_search` | 0.80 |

Entity extraction heuristics:
- Quoted strings: `"Elizabeth Bennet"`, `「李明」`
- Capitalized names after keywords: `about Alice`
- Paired names: `Alice and Bob`, `Alice vs Bob`

Confidence is boosted by +0.05 per extracted entity (capped at 0.95).

## ChatAgent

```python
from agents.chat_agent import ChatAgent
from agents.states import ChatState

agent = ChatAgent(
    kg_service=kg,
    doc_service=doc,
    vector_service=vec,
    analysis_service=analysis,  # optional
    llm=llm,                    # optional, defaults to Gemini
)

state = ChatState()
answer = await agent.chat("Who is Alice?", state)

# Streaming
async for token in agent.astream("Tell me about Bob", state):
    print(token, end="")
```

### Flow: `chat(query, state)`

1. **Pronoun resolution** — If query is short and a pronoun, replace with focus entity
2. **Add user message** to state
3. **Fast route** — `QueryPatternRecognizer.recognize()` → if confidence > 0.8,
   call tool directly, cache result, return
4. **Agent loop** — `self._graph.ainvoke({"messages": [HumanMessage(query)]})`
5. **Post-processing** — Add assistant message, update entity mentions, trim history

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `chat_agent_max_iterations` | 10 | Max ReAct loop iterations |
| `chat_agent_temperature` | 0.3 | LLM temperature for chat |

## Tool Registry Update

```python
from tools import get_chat_tools

tools = get_chat_tools(
    kg_service=kg,
    doc_service=doc,
    vector_service=vec,
    analysis_service=analysis,  # for composite tools
    # ... other optional services
)
# Returns 18 tools: 14 base + 4 composite
```

## Tool Count Summary

| Category | Tools | Status |
|----------|-------|--------|
| Graph | 6 | ✅ |
| Retrieval | 5 | ✅ |
| Analysis | 1 + 2 stubs | ✅/❌ |
| Other | 2 | ✅ |
| Composite | 4 | ✅ |
| **Total** | **20** | **18 + 2 stubs** |

## Testing

```bash
# ChatState methods
uv run pytest tests/agents/test_states.py -v

# Composite tools
uv run pytest tests/tools/test_composite_tools.py -v

# Pattern recognizer
uv run pytest tests/agents/test_pattern_recognizer.py -v

# Chat agent
uv run pytest tests/agents/test_chat_agent.py -v

# Full suite (240 tests)
uv run pytest tests/ -m "not integration" -v
```

All tests use mock services — no API key or database needed.

## Next Steps (Phase 5)

Phase 5 (Deep Analysis Workflow) will:
1. Implement `AnalyzeCharacterTool` and `AnalyzeEventTool` stubs
2. Add Character Evolution Profile (CEP) analysis using Phase 2b keywords
3. Build async analysis workflow with cache-first strategy (7-day SQLite)
4. WebSocket push for long-running analysis results
