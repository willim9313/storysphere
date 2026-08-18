# 效能 — 並行化優化

**狀態**: ✅ 已實作 · `asyncio.gather` 用於 16 個模組
**內容**: Sequential → Parallel 的優化策略與目標延遲

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

修改位置：`backend/storysphere/tools/composite_tools/get_entity_profile.py`

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

---

## 函式內的延遲 import 是刻意的，不要「順手清乾淨」

`backend/storysphere/` 有 214 個寫在函式內、標著 `# noqa: PLC0415` 的
`storysphere.*` import。它們看起來像沒清乾淨的技術債，實際上是**啟動成本的閘門**。

原因：`core/llm_client.py` 透過 `langchain_huggingface` 拉進 `torch` +
`transformers`，一次約 2,000 個模組。幾乎每個 service 都會間接碰到它，所以
任何一個 service 的 import 都會付這個代價。

實測（把無守衛的 108 個提到檔案頂端後）：

| import | 提頂前 | 提頂後 |
|--------|--------|--------|
| `storysphere.api.main`（uvicorn 啟動路徑） | 2.13s / 2,582 模組 | **3.42s / 3,477 模組** |
| `storysphere.api.deps` | 0.18s / 353 模組 | **2.65s / 3,321 模組** |

**不是為了打斷循環相依。** 169 個模組的扁平 import 圖是 DAG，零循環——提頂不會
炸循環，只會變慢。

另有 48 個包在 `if` / `try` 裡，那些連語意都不能動，例如 `api/deps.py` 依
`kg_backend` 設定二選一載入 Neo4j 或 NetworkX——提頂會讓 NetworkX 模式也無條件
把 `neo4j` 拉進來。

### 什麼情況可以提頂

只有一種：**該模組被 import 時，目標本來就已經被間接載入**（提頂等於零成本）。
目前符合這條的有 31 個。驗證方式是在乾淨的直譯器裡 `import <模組>`，再檢查目標
是否已在 `sys.modules`：

```bash
python -c "
import sys; base=set(sys.modules)
import storysphere.services.narrative_service
print('storysphere.services.kg_service' in sys.modules)"
```

除非跑過這個檢查，否則不要動這些 import。
