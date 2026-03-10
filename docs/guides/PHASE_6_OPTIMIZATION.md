# Phase 6：並行優化實施指南

## 目標

| 指標 | Phase 5 | Phase 6 目標 |
|------|---------|-------------|
| Chat P95 延遲 | 5s | 3s |
| 深度分析（角色）首次 | 6-8s | 2-3s |
| 深度分析（事件）首次 | 6-7s | 4.5-5.5s |

實作策略：`asyncio.gather` + `return_exceptions=True` 降級模式。

---

## 並行化原則

### 1. 依賴圖分析

優化前，先建立每個操作的依賴關係：
```
sequential: A → B → C → D
parallel:   A → [B || C || D]   （B, C, D 互不依賴）
```

### 2. 標準模式

```python
import asyncio

results = await asyncio.gather(
    coro_a(),
    coro_b(),
    coro_c(),
    return_exceptions=True,
)

for r in results:
    if isinstance(r, Exception):
        logger.warning("Parallel task failed: %s", r)
        # 降級為空 / 預設值
```

### 3. 錯誤處理規範

- **永遠** 使用 `return_exceptions=True`
- 每個結果都要 `isinstance(r, Exception)` 檢查
- 部分失敗→降級（空結果），不中斷整體流程
- 記錄 `logger.warning`（不是 error）

---

## 複合工具並行化

### GetEntityProfileTool（63%↓）

**依賴圖**：
```
resolve_entity → [get_summary || get_passages || get_relations]
```

修改位置：`src/tools/composite_tools/get_entity_profile.py`

**核心變更**：
```python
summary_r, passages_r, relations_r = await asyncio.gather(
    get_summary(),
    get_passages(),
    get_relations(),
    return_exceptions=True,
)
```

### GetEntityRelationshipTool（50-60%↓）

**依賴圖**：
```
[resolve_entity_a || resolve_entity_b] → [get_paths || get_passages]
```

兩處並行：
1. 兩個 entity resolve（互不依賴）
2. KG relation paths + vector search

### GetCharacterArcTool（30-40%↓）

**依賴圖**：
```
resolve_entity → [get_timeline || get_passages] → generate_insight
```

timeline 與 passages 並行，insight 仍需 timeline 結果。

### CompareCharactersTool（40-50%↓）

**依賴圖**：
```
[resolve_e1 || resolve_e2] → [get_relations_e1 || get_relations_e2] → insight
```

兩處並行：
1. 兩個 entity resolve
2. 兩個 get_relations

---

## AnalysisService 並行化

### analyze_character()（最大收益：2-3x）

**Level A — _extract_cep() 內部**

三個資料來源（KG、向量搜尋、關鍵詞）並行採集：
```python
kg_parts_r, vector_parts_r, keywords_r = await asyncio.gather(
    gather_kg(),
    gather_vector(),
    gather_keywords(),
    return_exceptions=True,
)
```

**Level B — analyze_character() 主流程**

CEP 完成後，archetypes + arc + profile 並行：
```python
all_results = await asyncio.gather(
    *[self._classify_archetype(cep, fw, lang) for fw in frameworks],
    self._generate_character_arc(cep),
    self._generate_profile(entity_name, cep),
    return_exceptions=True,
)
```

### analyze_event()（20-30%↓）

EEP 完成後，causality + impact 並行（互不依賴），再串行 summary：
```python
causality_r, impact_r = await asyncio.gather(
    self._analyze_causality(eep, event),
    self._analyze_impact(eep, event),
    return_exceptions=True,
)
event_summary = await self._generate_event_summary(event, eep, causality, impact)
```

---

## 驗證方式

```bash
# 複合工具測試（結果結構不變）
uv run pytest tests/tools/test_composite_tools.py -v

# AnalysisService 測試（pipeline 正確性）
uv run pytest tests/services/test_analysis_service.py -v

# 全部單元測試
uv run pytest -m "not integration" --tb=short
```

預期：318+ tests passing。

---

## 注意事項

1. **asyncio.gather 順序**：結果順序與傳入順序一致
2. **Mock 測試**：AsyncMock 與 gather 相容，測試不需改動
3. **重試邏輯**：tenacity retry 裝飾器在 gather 內部正常運作
4. **關鍵詞去重**：`_extract_cep` 並行版消除了重複的 keyword service 呼叫
