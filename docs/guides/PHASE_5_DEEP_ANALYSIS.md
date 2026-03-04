# Phase 5: Deep Analysis Workflow 實施指南

**前置**: Phase 4（Chat Agent）完成
**目標**: 實現異步深度分析系統（角色分析、事件分析）
**預估**: 2-3 週

---

## 概覽

Phase 5 實現 ADR-004 定義的 Deep Analysis 流程：

```
用戶觸發分析 → 檢查緩存（<7天）→ 命中返回 <100ms
                              → 未命中 → 創建任務 → task_id
                                         → 後台執行 → WebSocket 推送
                                         → 存入 SQLite（緩存 7 天）
```

---

## 步驟 1: AnalysisService 完善

補全 `src/services/analysis_service.py` 中的 stub 方法：

- `analyze_character(entity_name, doc_id)` → `CharacterAnalysisResult`
- `analyze_event(event_name, doc_id)` → `EventAnalysisResult`

### Pydantic 輸出模型

```python
class CharacterAnalysisResult(BaseModel):
    entity_name: str
    profile: CharacterProfile       # 120 字摘要
    evidence_pack: CEPResult        # 6 類證據
    archetype: ArchetypeResult      # 原型分類
    character_arc: List[ArcSegment] # 弧線
    coverage_quality: CoverageMetrics
```

---

## 步驟 2: Character Evidence Pack (CEP)

CEP 是角色深度分析的核心數據結構，從向量庫和知識圖譜中提取 6 類證據。

### 6 類證據

| 類別 | 來源 | 說明 |
|------|------|------|
| `actions` | VectorService（filter by entity） | 角色的關鍵行為 |
| `traits` | LLM 從 actions 歸納 | 性格特質 |
| `relations` | KGService.get_entity_relations() | 人際關係 |
| `key_events` | KGService.get_entity_timeline() | 參與的重要事件 |
| `quotes` | VectorService（精確匹配對白） | 代表性語錄 |
| `top_terms` | FeatureExtraction keywords | 高頻關聯詞 |

### CEP 提取流程

```python
async def extract_cep(entity_name: str, doc_id: str) -> CEPResult:
    # 1. 從向量庫取得角色相關 chunks
    chunks = await vector_service.scroll(
        filter={"entities": entity_name},
        limit=50
    )

    # 2. DataSanitizer 清理（防 prompt injection）
    clean_chunks = sanitizer.format_vector_store_results(chunks)

    # 3. LLM 提取 CEP
    cep = await llm.ainvoke(CEP_PROMPT.format(
        entity_name=entity_name,
        evidence=clean_chunks
    ))

    # 4. 補充 KG 數據
    cep.relations = await kg_service.get_entity_relations(entity_name)
    cep.key_events = await kg_service.get_entity_timeline(entity_name)

    return cep
```

### 120 字角色摘要格式

```
{name} wants {desire/goal}, so they {key actions}, which leads to {consequence/outcome}.
```

### Coverage Quality Metrics

```python
class CoverageMetrics(BaseModel):
    action_count: int        # 提取到的行為數
    trait_count: int         # 歸納的特質數
    relation_count: int      # 關係數
    event_count: int         # 事件數
    quote_count: int         # 語錄數
    gaps: List[str]          # 缺失的證據類別
    chunk_ids: List[str]     # 溯源 chunk IDs
```

---

## 步驟 3: Archetype Classification

2 階段 pipeline: CEP → Archetype 分類。

### 支持框架

| 框架 | 原型數 | 配置檔 |
|------|--------|--------|
| Jung | 12 | `old_version/config/character_analysis/jung_archetypes_en.json` |
| Schmidt | 45 | `old_version/config/character_analysis/schmidt_archetypes.json` |

### 分類流程

```python
async def classify_archetype(cep: CEPResult, framework: str = "jung") -> ArchetypeResult:
    # 載入框架定義
    archetypes = load_archetype_config(framework)

    # LLM 分類
    result = await llm.ainvoke(ARCHETYPE_PROMPT.format(
        cep=cep.model_dump_json(),
        archetypes=archetypes
    ))

    return ArchetypeResult(
        primary: str,           # 主要原型
        secondary: Optional[str],  # 次要原型
        confidence: float,      # 信心度
        evidence: List[str]     # 支持證據
    )
```

### 配置檔格式

```json
{
  "hero": {
    "name": "Hero",
    "description": "The protagonist who rises to meet a challenge...",
    "traits": ["brave", "determined", "self-sacrificing"],
    "examples": ["Frodo", "Harry Potter"]
  }
}
```

---

## 步驟 4: 完整 Data Flow

```
VectorService.scroll(filter by entity)
    → DataSanitizer.format_vector_store_results()
    → CEP prompt → CEP JSON（_parse_json_response / output_extractor）
    → Archetype prompt → classification JSON
    → CharacterAnalysisResult
    → SQLite cache（7-day TTL）
    → WebSocket push to client
```

---

## 步驟 5: 緩存層

```python
class AnalysisCache:
    """SQLite-based analysis cache with 7-day TTL."""

    async def get(self, key: str) -> Optional[dict]:
        """Return cached result if < 7 days old."""

    async def set(self, key: str, result: dict):
        """Store result with current timestamp."""

    async def invalidate(self, doc_id: str):
        """Invalidate all cache entries for a document."""
```

Cache key format: `{analysis_type}:{doc_id}:{entity_name}`

---

## 步驟 6: Analysis Agent（LangGraph）

```python
# src/agents/analysis_agent.py
class AnalysisAgent:
    """Async deep analysis agent using LangGraph."""

    async def run(self, task: AnalysisTask) -> AnalysisResult:
        # 1. 檢查緩存
        cached = await cache.get(task.cache_key)
        if cached:
            return cached

        # 2. 執行分析
        if task.type == "character":
            result = await analysis_service.analyze_character(...)
        elif task.type == "event":
            result = await analysis_service.analyze_event(...)

        # 3. 存入緩存
        await cache.set(task.cache_key, result)

        # 4. WebSocket 推送
        await ws_manager.send(task.client_id, result)

        return result
```

---

## 步驟 7: WebSocket 推送

```python
# 進度更新格式
{
    "task_id": "abc-123",
    "status": "in_progress",  # pending | in_progress | completed | failed
    "progress": 0.6,
    "step": "Extracting character evidence pack...",
    "result": null  # completed 時填充
}
```

---

## 測試策略

| 測試類型 | 覆蓋 |
|----------|------|
| Unit | CEP extraction logic, cache TTL, archetype config loading |
| Integration | Full analysis pipeline with mock LLM |
| E2E | WebSocket push + cache hit/miss scenarios |

---

## 待移植項目（從舊版）

- [ ] `output_extractor.py` — JSON fallback chain（ADR-007 風險 5）
- [ ] `data_sanitizer.py` — Prompt injection 防護（ADR-007 風險 6）
- [ ] Archetype config files — `old_version/config/character_analysis/`

---

## 相關文檔

- [ADR-004: Deep Analysis 執行](../appendix/ADR_004_FULL.md)
- [ADR-007: 風險管理（風險 5/6）](../appendix/ADR_007_FULL.md)
- [CORE.md](../CORE.md)

---

**維護者**: William
**最後更新**: 2026-03-04
