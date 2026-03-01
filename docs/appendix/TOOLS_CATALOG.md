# Tools Catalog — StorySphere Phase 3

> ADR-008: Tool descriptions are critical for agent tool selection accuracy (>85% target).
> Each tool includes precise USE/DO NOT USE guidance and example queries.

---

## Graph Tools (6)

### 1. `get_entity_attributes`
**Description:** Retrieve an entity's full attribute profile (name, type, aliases, description, custom attributes, first appearance chapter, mention count).

| Aspect | Details |
|--------|---------|
| **Input** | `entity_id` — UUID or exact entity name |
| **Output** | Entity object (JSON) |
| **USE when** | User asks about a character/location/org's properties, aliases, or description |
| **DO NOT USE when** | User asks about relationships (→ `get_entity_relations`) or events (→ `get_entity_timeline`) |

**Example queries:**
- "Who is Alice?"
- "What are Bob's aliases?"
- "Describe London."

---

### 2. `get_entity_relations`
**Description:** List all relationships (incoming, outgoing, or both) for an entity.

| Aspect | Details |
|--------|---------|
| **Input** | `entity_id` — UUID/name; `direction` — "in", "out", or "both" (default) |
| **Output** | List of Relation objects (JSON) |
| **USE when** | User asks about connections, social network, or who is related to whom |
| **DO NOT USE when** | User asks about paths between two entities (→ `get_relation_paths`) |

**Example queries:**
- "Who are Alice's friends?"
- "What relationships does Bob have?"
- "Show all connections for London."

---

### 3. `get_entity_timeline`
**Description:** Get a chronological timeline of all events involving an entity, sorted by chapter.

| Aspect | Details |
|--------|---------|
| **Input** | `entity_id` — UUID or exact name |
| **Output** | List of Event objects sorted by chapter (JSON) |
| **USE when** | User asks about what happened to a character over time, story arc, event history |
| **DO NOT USE when** | User asks about a single event's deep analysis (→ `analyze_event`) |

**Example queries:**
- "What happened to Alice?"
- "Show Bob's timeline."
- "Events involving London in order."

---

### 4. `get_relation_paths`
**Description:** Find all simple paths between two entities up to a maximum hop count.

| Aspect | Details |
|--------|---------|
| **Input** | `source` — UUID/name; `target` — UUID/name; `max_length` — 1–5 (default 3) |
| **Output** | List of paths, each showing entities and connecting relations (JSON) |
| **USE when** | User asks how two characters are connected, degrees of separation |
| **DO NOT USE when** | User asks about a single entity's direct relations (→ `get_entity_relations`) |

**Example queries:**
- "How are Alice and Carol connected?"
- "What is the relationship path from Bob to London?"

---

### 5. `get_subgraph`
**Description:** Extract the k-hop ego-graph neighbourhood around an entity.

| Aspect | Details |
|--------|---------|
| **Input** | `entity_id` — UUID/name; `k_hops` — 1–3 (default 2) |
| **Output** | Subgraph with nodes and edges (JSON) |
| **USE when** | User asks about the network around an entity, local graph exploration, "who is near X" |
| **DO NOT USE when** | User asks about specific paths between two entities (→ `get_relation_paths`) |

**Example queries:**
- "Show me the network around Alice."
- "What entities are within 2 hops of London?"

---

### 6. `get_relation_stats`
**Description:** Get statistical summary of relations: type distribution, average/min/max weight, total count.

| Aspect | Details |
|--------|---------|
| **Input** | `entity_id` — optional UUID/name; omit for global stats |
| **Output** | Statistics object (JSON) |
| **USE when** | User asks about overall relationship patterns, most common types, statistical summary |
| **DO NOT USE when** | User asks about listing specific relations (→ `get_entity_relations`) |

**Example queries:**
- "What types of relationships are most common?"
- "Show relationship statistics."
- "How strong are Alice's connections on average?"

---

## Retrieval Tools (3)

### 7. `vector_search`
**Description:** Semantic search over novel paragraphs using vector embeddings.

| Aspect | Details |
|--------|---------|
| **Input** | `query` — natural language; `top_k` — 1–20 (default 5); `document_id` — optional filter |
| **Output** | List of scored paragraphs (JSON) |
| **USE when** | User asks free-form content questions, topic/theme search, finding passages |
| **DO NOT USE when** | User asks for chapter summaries (→ `get_summary`) or entity data (→ graph tools) |

**Example queries:**
- "Find passages about betrayal."
- "Where is the garden described?"
- "What does the text say about love?"

---

### 8. `get_summary`
**Description:** Get chapter summaries for a document.

| Aspect | Details |
|--------|---------|
| **Input** | `document_id`; `chapter_number` — optional (omit for all chapters) |
| **Output** | Summary text or list of chapter summaries (JSON) |
| **USE when** | User asks for chapter overview, "what happens in chapter X", plot summaries |
| **DO NOT USE when** | User wants raw text (→ `get_paragraphs`) or semantic search (→ `vector_search`) |

**Example queries:**
- "Summarize chapter 3."
- "Give me an overview of all chapters."

---

### 9. `get_paragraphs`
**Description:** Retrieve original paragraph texts from a document.

| Aspect | Details |
|--------|---------|
| **Input** | `document_id`; `chapter_number` — optional |
| **Output** | List of paragraphs with text, chapter, and position (JSON) |
| **USE when** | User wants to read raw text, quote passages, needs source material |
| **DO NOT USE when** | User wants summaries (→ `get_summary`) or semantic search (→ `vector_search`) |

**Example queries:**
- "Show me the text of chapter 2."
- "Read chapter 1 paragraphs."

---

## Analysis Tools (1 complete + 2 stubs)

### 10. `generate_insight` ✅
**Description:** Generate an AI-powered literary insight using a single LLM call.

| Aspect | Details |
|--------|---------|
| **Input** | `topic` — question/theme; `context` — supporting data |
| **Output** | Topic + generated insight text (JSON) |
| **USE when** | User asks for interpretation, thematic analysis, AI commentary |
| **DO NOT USE when** | User wants raw data (→ graph/retrieval tools) |

**Example queries:**
- "What is the theme of the novel?"
- "Analyze the significance of this passage."

---

### 14. `analyze_character` ❌ STUB
**Description:** Deep character analysis — personality, relationships, arc, motivations.

| Aspect | Details |
|--------|---------|
| **Status** | Phase 5 — needs domain knowledge |
| **Workaround** | Use `get_entity_attributes` + `get_entity_timeline` + `generate_insight` |

---

### 15. `analyze_event` ❌ STUB
**Description:** Deep event analysis — significance, causes, consequences, affected characters.

| Aspect | Details |
|--------|---------|
| **Status** | Phase 5 — needs domain knowledge |
| **Workaround** | Use `get_entity_timeline` + `generate_insight` |

---

## Other Tools (3)

### 11. `extract_entities_from_text` ✅
**Description:** Extract named entities from free-form text using LLM-based NER.

| Aspect | Details |
|--------|---------|
| **Input** | `text` — free-form string |
| **Output** | List of detected entities (JSON) |
| **USE when** | User pastes text and wants entity identification |
| **DO NOT USE when** | User asks about existing KG entities (→ `get_entity_attributes`) |

---

### 12. `compare_entities` ✅
**Description:** Compare two entities side-by-side: attributes, relations, event counts.

| Aspect | Details |
|--------|---------|
| **Input** | `entity_a`, `entity_b` — UUID or name |
| **Output** | Comparison object with both entity profiles and shared connections (JSON) |
| **USE when** | User asks to compare two characters, contrast entities |
| **DO NOT USE when** | User asks about a single entity (→ `get_entity_attributes`) |

---

### 13. `get_chapter_summary` ✅
**Description:** Get the summary of a specific chapter by document ID and chapter number.

| Aspect | Details |
|--------|---------|
| **Input** | `document_id`, `chapter_number` |
| **Output** | Chapter summary text (JSON) |
| **USE when** | User asks "what happens in chapter X" for a known chapter number |
| **DO NOT USE when** | User wants all chapter summaries (→ `get_summary`) |

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Graph Tools | 6 | ✅ Complete |
| Retrieval Tools | 3 | ✅ Complete |
| Analysis Tools | 1 | ✅ Complete |
| Analysis Stubs | 2 | ❌ Phase 5 |
| Other Tools | 3 | ✅ Complete |
| **Total** | **15** | **13 complete + 2 stubs** |
