# Phase 3 Implementation Guide — Tool Layer

## Overview

Phase 3 implements the base tool layer: 15 LangChain `BaseTool` subclasses
that Phase 4's Chat Agent will use for knowledge graph queries, text retrieval,
and analysis.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  Chat Agent (Phase 4)            │
│           LangGraph + tool selection             │
└────────────────┬─────────────────────────────────┘
                 │ calls tools
┌────────────────▼─────────────────────────────────┐
│              Tool Layer (Phase 3)                │
│  15 BaseTool subclasses (thin wrappers)          │
│  tool_registry.py → get_chat_tools()             │
└────────┬──────────┬──────────┬───────────────────┘
         │          │          │
    ┌────▼──┐  ┌────▼──┐  ┌───▼────┐
    │  KG   │  │  Doc  │  │ Vector │
    │Service│  │Service│  │Service │
    └───────┘  └───────┘  └────────┘
```

## Design Principles

1. **Thin Wrapper**: Tools don't contain business logic. They validate input,
   forward to a service, and format output.

2. **Service Injection**: Each tool receives its service dependency via
   constructor (`kg_service=`, `doc_service=`, `vector_service=`).

3. **ADR-008 Descriptions**: Every tool has a precise `description` with
   USE/DO NOT USE guidance. This is critical for agent tool selection accuracy.

4. **Async-first**: All tools implement `_arun()` with `_run()` as a sync
   fallback via `asyncio.get_event_loop().run_until_complete()`.

## File Structure

```
src/tools/
├── __init__.py               # Re-exports get_chat_tools, get_analysis_tools
├── base.py                   # format_entity/relation/event, handle_not_found
├── schemas.py                # Pydantic I/O schemas for all tools
├── tool_registry.py          # get_chat_tools() / get_analysis_tools()
├── graph_tools/              # 6 tools: entity attrs/relations/timeline, paths, subgraph, stats
├── retrieval_tools/          # 3 tools: vector search, summary, paragraphs
├── analysis_tools/           # 1 complete (insight) + 2 stubs (character/event)
└── other_tools/              # 3 tools: extract entities, compare, chapter summary
```

## Services Added in Phase 3

### KGService — 4 new methods
- `get_entity_timeline(entity_id)` — Events sorted by chapter
- `get_relation_paths(source, target, max_length)` — All simple paths via NetworkX
- `get_subgraph(entity_id, k_hops)` — k-hop ego-graph
- `get_relation_stats(entity_id?)` — Type distribution + weight stats

### DocumentService — 1 new method
- `get_chapter_summary(document_id, chapter_number)` — Single chapter summary

### VectorService — New service
- `search(query_text, top_k, document_id?)` — Qdrant semantic search
- `ensure_collection()` — Idempotent collection creation
- `upsert_paragraphs(paragraphs)` — Batch vector upsert
- Dev/test: automatic in-memory Qdrant (`":memory:"`)

## Tool Registry

```python
from tools import get_chat_tools

tools = get_chat_tools(
    kg_service=kg_svc,
    doc_service=doc_svc,
    vector_service=vec_svc,
    llm=llm,                    # optional, for GenerateInsightTool
    entity_extractor=extractor,  # optional, for ExtractEntitiesFromTextTool
)
# Returns 13 fully-functional tools (stubs excluded from chat)
```

For Phase 5 deep analysis:
```python
from tools import get_analysis_tools

tools = get_analysis_tools(...)  # Returns 13 + 2 stubs = 15 tools
```

## Stub Design (Phase 5)

`AnalyzeCharacterTool` and `AnalyzeEventTool` are stubs with:
- Complete `args_schema` (Pydantic input validation)
- Complete `description` (for agent tool selection)
- System prompt template (ready for domain knowledge)
- Output schema (for validation)
- `_arun()` raises `NotImplementedError("Phase 5: ...")`

## Testing

All tools are tested with mock services (no real DB/API needed):

```bash
# Run all Phase 3 tests
uv run pytest tests/tools/ tests/services/test_kg_service_queries.py \
    tests/services/test_document_service_summary.py \
    tests/services/test_vector_service.py -v

# Run full non-integration suite
uv run pytest -m "not integration" -v
```

## Tool Count Summary

| Category | Tools | Status |
|----------|-------|--------|
| Graph | 6 | ✅ |
| Retrieval | 3 | ✅ |
| Analysis | 1 + 2 stubs | ✅/❌ |
| Other | 3 | ✅ |
| **Total** | **15** | **13 + 2 stubs** |

## Next Steps (Phase 4)

Phase 4 will:
1. Import `get_chat_tools()` into the LangGraph chat agent
2. Bind tools to the agent's tool node
3. Implement streaming WebSocket responses
4. Add ChatState tool result caching (5-min TTL)
