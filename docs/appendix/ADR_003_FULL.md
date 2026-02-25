# ADR-003: 工具層設計與實現方式

**狀態**: ✅ Approved  
**日期**: 2026-02-22  
**決策者**: William, AI Architect

---

## 背景 (Context)

Agent 需要調用各種工具（圖查詢、向量搜索等）。需要決定：
1. 工具層與 Services 層的關係
2. 工具的粒度（粗粒度 vs 細粒度）
3. 是否需要組合工具

---

## 決策 (Decision)

**採用方案：細粒度基礎工具 + 組合工具 + Services Thin Wrapper**

### 工具層結構

```
src/tools/
├── __init__.py
├── base.py                      # Tool 基類
├── graph_tools/                 # 圖查詢工具（細粒度）
│   ├── get_entity_attrs.py      # 獲取實體屬性
│   ├── get_entity_relations.py  # 獲取實體關係
│   ├── get_entity_timeline.py   # 獲取實體時間線
│   ├── get_relation_paths.py    # 查找關係路徑
│   ├── get_subgraph.py          # 獲取子圖
│   └── get_relation_stats.py    # 關係統計
├── retrieval_tools/             # 檢索工具
│   ├── vector_search.py         # 語義搜索
│   ├── get_summary.py           # 獲取摘要
│   └── get_paragraphs.py        # 獲取段落
├── analysis_tools/              # 分析工具
│   ├── generate_insight.py      # 生成洞見
│   ├── analyze_character.py     # 角色分析
│   └── analyze_event.py         # 事件分析
├── composite_tools/             # 組合工具
│   ├── get_entity_profile.py    # 實體檔案
│   ├── get_relationship.py      # 關係分析
│   └── get_character_arc.py     # 角色弧線
├── tool_registry.py             # 工具註冊和發現
└── schemas.py                   # Tool 輸入輸出 schema
```

### 設計原則

#### 1. 細粒度基礎工具（15-18 個）

```python
class GetEntityAttributesTool:
    """獲取實體的所有屬性
    
    適用場景：
    - 用戶詢問「張三是誰？」
    - 需要快速獲取實體基本信息
    
    輸入：entity_id 或 entity_name
    輸出：{name, type, attributes: {...}}
    """
    def __init__(self, kg_service: KGService):
        self.kg_service = kg_service
    
    def invoke(self, entity_id: str = None, entity_name: str = None):
        # 輸入驗證
        if not entity_id and not entity_name:
            raise ValueError("必須提供 entity_id 或 entity_name")
        
        # 轉發到 Service
        result = self.kg_service.get_entity_attributes(
            entity_id=entity_id, 
            entity_name=entity_name
        )
        
        # 輸出格式化
        return self._format_output(result)
```

**優點**：
- ✅ 工具描述精確，LLM 更容易選對
- ✅ 單一職責，易於測試
- ✅ 可組合性高

**缺點**：
- ⚠️ 工具數量多（15-18 個）
- ⚠️ Agent 需要多次調用（但可用組合工具解決）

#### 2. 組合工具（3-5 個）

```python
class GetEntityRelationshipTool:
    """獲取兩個實體之間的完整關係信息
    
    內部流程：
    1. 並行獲取兩個實體的屬性
    2. 查詢它們之間的關係
    3. 檢索相關段落
    4. 返回聚合結果
    
    適用場景：
    - 用戶詢問「張三和李四是什麼關係？」
    
    優勢：
    - 一次調用完成複雜查詢
    - 內部並行化，減少總延遲
    - 降低 Agent 的推理負擔
    """
    async def ainvoke(self, entity1: str, entity2: str):
        # Phase 1: Sequential
        attrs1 = await self.get_attrs.ainvoke(entity_name=entity1)
        attrs2 = await self.get_attrs.ainvoke(entity_name=entity2)
        relations = await self.get_relations.ainvoke(
            source=entity1, target=entity2
        )
        paragraphs = await self.vector_search.ainvoke(
            query=f"{entity1} {entity2} 互動"
        )
        
        # 聚合結果
        return {
            "entity1": attrs1,
            "entity2": attrs2,
            "relations": relations,
            "evidence": paragraphs
        }
```

**優點**：
- ✅ 減少 Agent 調用次數（5 次 → 1 次）
- ✅ 內部可並行化（Phase 2 優化）
- ✅ 常見場景快速響應

**缺點**：
- ⚠️ 工具複雜度增加（但可控）
- ⚠️ 不夠靈活（但基礎工具仍可用）

#### 3. Services Thin Wrapper

- 工具層不重複業務邏輯
- 業務邏輯保留在 Services
- 工具層職責：驗證、轉發、格式化、錯誤處理

### 完整工具列表（18-22 個）

**基礎工具（15-18 個）**：
1. GetEntityAttributesTool - 實體屬性
2. GetEntityRelationsTool - 實體關係
3. GetEntityTimelineTool - 實體時間線
4. GetRelationPathsTool - 關係路徑
5. GetSubgraphTool - 子圖
6. GetRelationStatsTool - 關係統計
7. VectorSearchTool - 語義搜索
8. GetSummaryTool - 獲取摘要（按層級）
9. GetParagraphsTool - 獲取段落（按 ID）
10. GenerateInsightTool - 生成洞見（LLM）
11. AnalyzeCharacterTool - 角色分析（LLM）
12. AnalyzeEventTool - 事件分析（LLM）
13. ExtractEntitiesFromTextTool - 從文本提取實體
14. CompareEntitiesTool - 比較實體
15. GetChapterSummaryTool - 章節摘要
16-18. (預留擴展)

**組合工具（3-5 個）**：
1. GetEntityProfileTool - 實體檔案（attrs + summary + paragraphs）
2. GetEntityRelationshipTool - 關係分析（兩實體完整信息）
3. GetCharacterArcTool - 角色弧線（timeline + events + analysis）
4. CompareCharactersTool - 角色對比（兩角色 + 異同分析）
5. (預留擴展)

---

## 根據 (Rationale)

### 為什麼選擇細粒度工具？

1. **LLM 的工具選擇基於 description**
   - 細粒度工具的 description 更精確
   - 減少選錯工具的概率
   - 提升 Agent 的可靠性

2. **單一職責原則**
   - 每個工具做一件事，易於測試
   - 錯誤更容易定位和修復

3. **可組合性**
   - 基礎工具可被組合工具複用
   - 未來擴展更靈活

### 為什麼需要組合工具？

1. **減少 Agent 調用次數**
   - 常見場景一次調用完成
   - 降低延遲（從 3-4s 到 1-2s）

2. **降低 Agent 推理負擔**
   - Agent 不用思考「先調哪個工具」
   - 直接選擇最合適的組合工具

3. **內部可並行化**
   - Phase 2 優化空間大
   - 對外接口不變

---

## 後果 (Consequences)

### 優點
✅ 工具選擇準確率高（細粒度 description）  
✅ 常見場景響應快（組合工具）  
✅ 代碼不重複（Thin Wrapper）  
✅ 職責清晰，易於維護  
✅ 未來可並行化優化

### 挑戰
⚠️ 工具數量多（18-22 個）  
⚠️ 需要精心設計 description（防止選錯）  
⚠️ 組合工具的複雜度需要控制

### 成功指標
- Agent 工具選擇準確率 >85%
- 常見查詢（使用組合工具）延遲 <2s
- 單元測試覆蓋率 >90%

---

## 實施策略

### Phase 1: 基礎工具（2-3 週）
- 實現 15 個基礎工具
- 每個工具有詳細的 description 和示例
- 完整的單元測試

### Phase 2: 組合工具（1-2 週）
- 實現 3-5 個組合工具
- 先用 sequential 調用基礎工具
- 驗證功能正確性

### Phase 3: 優化並行化（1-2 週）
- 組合工具內部改用 asyncio.gather()
- 性能測試和優化
- 監控延遲改善

---

## 相關決策

- [ADR-001: Agent 架構](ADR_001_FULL.md)
- [ADR-004: 深度分析執行](ADR_004_FULL.md)
- [ADR-008: 工具選擇準確性](ADR_008_FULL.md)

---

## 參考文檔

- [工具目錄（完整 Description）](TOOLS_CATALOG.md)

---

**最後更新**: 2026-02-22  
**狀態**: ✅ Approved  
**維護者**: William
