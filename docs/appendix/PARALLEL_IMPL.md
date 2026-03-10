# Appendix: Phase 6 並行實作技術細節

## asyncio.gather 模式詳解

### 基礎用法

```python
import asyncio

# 並行執行，收集全部結果（含例外）
results = await asyncio.gather(coro1(), coro2(), coro3(), return_exceptions=True)

# 結果順序 = 傳入順序
r1, r2, r3 = results

# 統一例外處理
for r in results:
    if isinstance(r, Exception):
        logger.warning("Task failed: %s", r)
```

### 動態任務列表

```python
# 當任務數量不固定時
tasks = [classify(cep, fw) for fw in frameworks]
arc_task = generate_arc(cep)
profile_task = generate_profile(name, cep)

all_results = await asyncio.gather(*tasks, arc_task, profile_task, return_exceptions=True)

n = len(frameworks)
fw_results = all_results[:n]       # 前 n 個是 archetype 結果
arc_result  = all_results[n]       # 第 n+1 個是 arc
prof_result = all_results[n + 1]   # 第 n+2 個是 profile
```

---

## 各組件依賴圖

### GetEntityProfileTool

```
entity_id
    │
    ▼
resolve_entity          ← 必須先完成（後續需要 entity.id, entity.name 等）
    │
    ├──► get_summary()        ← asyncio.gather ─┐
    ├──► get_passages()       ← asyncio.gather ─┤ 三者並行
    └──► get_relations()      ← asyncio.gather ─┘
```

### GetEntityRelationshipTool

```
entity_a, entity_b
    │
    ├──► _resolve_entity(a)   ← asyncio.gather ─┐ 兩者並行
    └──► _resolve_entity(b)   ← asyncio.gather ─┘
         │
         ├──► get_paths(e1.id, e2.id)   ← asyncio.gather ─┐ 兩者並行
         └──► vector_search(query)      ← asyncio.gather ─┘
```

### GetCharacterArcTool

```
entity_id
    │
    ▼
resolve_entity
    │
    ├──► get_timeline()       ← asyncio.gather ─┐ 兩者並行
    └──► get_passages()       ← asyncio.gather ─┘
         │
         ▼
    generate_insight()        ← 串行（需要 timeline 結果）
```

### CompareCharactersTool

```
entity_a, entity_b
    │
    ├──► _resolve_entity(a)   ← asyncio.gather ─┐ 兩者並行
    └──► _resolve_entity(b)   ← asyncio.gather ─┘
         │
         ├──► get_relations(e1.id)   ← asyncio.gather ─┐ 兩者並行
         └──► get_relations(e2.id)   ← asyncio.gather ─┘
              │
              ▼
         generate_insight()   ← 串行
```

### AnalysisService.analyze_character()

```
entity_name, document_id
    │
    ▼
_extract_cep()  ←─ 內部三路並行:
    ├──► gather_kg()        （entity lookup → relations + timeline 並行）
    ├──► gather_vector()    （vector search）
    └──► gather_keywords()  （keyword service）
         │
         ▼ (LLM call for CEP)
    cep: CEPResult
         │
         ├──► _classify_archetype(fw1)  ← asyncio.gather ─┐
         ├──► _classify_archetype(fw2)  ← asyncio.gather ─┤ 全部並行
         ├──► _generate_character_arc() ← asyncio.gather ─┤
         └──► _generate_profile()       ← asyncio.gather ─┘
              │
              ▼ (pure computation)
         _compute_coverage()
```

### AnalysisService.analyze_event()

```
event_id, document_id
    │
    ▼
_extract_eep()              ← 串行（複雜 KG 聚合）
    │
    ├──► _analyze_causality()  ← asyncio.gather ─┐ 兩者並行
    └──► _analyze_impact()     ← asyncio.gather ─┘
         │
         ▼
    _generate_event_summary()  ← 串行（需要兩者結果）
         │
         ▼ (pure computation)
    _compute_event_coverage()
```

---

## 效能估算（理論值）

| 組件 | 優化前 | 優化後 | 加速比 |
|------|-------|-------|-------|
| GetEntityProfileTool | ~1000ms | ~400ms | 2.5x |
| GetEntityRelationshipTool | ~800ms | ~350ms | 2.3x |
| GetCharacterArcTool | ~600ms | ~400ms | 1.5x |
| CompareCharactersTool | ~700ms | ~400ms | 1.75x |
| analyze_character() | 6-8s | 2-3s | 2.5-3x |
| analyze_event() | 6-7s | 4.5-5.5s | 1.3x |

---

## 降級行為

| 失敗場景 | 降級值 |
|--------|-------|
| get_summary 失敗 | `first_appearance_summary: null` |
| vector search 失敗 | `relevant_passages: []` |
| get_relations 失敗 | `relation_count: 0, relation_types: []` |
| archetype classification 失敗 | 跳過該 framework |
| arc generation 失敗 | `arc: []` |
| profile generation 失敗 | `profile.summary: ""` |
| causality 失敗 | `CausalityAnalysis` 空欄位 |
| impact 失敗 | `ImpactAnalysis` 空欄位 |

---

## 注意事項與已知限制

### 1. asyncio.gather 執行順序

在 Python asyncio 中，`gather` 的結果順序與傳入順序完全一致。
但各 coroutine 的實際執行順序取決於 I/O 等待，不保證特定順序。

### 2. Tenacity Retry 相容性

`@retry` 裝飾器包裝的方法（如 `_classify_archetype`）在 `gather` 內部
正常運作。每個 coroutine 獨立管理自己的重試邏輯。

### 3. Mock 測試相容性

`AsyncMock` 與 `asyncio.gather` 完全相容。由於 mock 立即 resolve，
測試中的執行順序與傳入順序一致，現有測試無需修改。

### 4. _extract_cep 的關鍵詞去重

原版本在函數末尾有第二次 `keyword_service.get_entity_keywords` 呼叫
（用於建立 `top_terms`）。並行版本消除此重複呼叫，直接使用
`gather_keywords()` 的結果，減少一次 I/O 操作。

### 5. EEP 的 participant 抓取限制

`_extract_eep` 內部有 participant 逐一抓取的串行迴圈（`for pid in event.participants`）。
此部分可進一步優化（gather 所有 get_entity 呼叫），但 Phase 6 範圍不包含此優化。
