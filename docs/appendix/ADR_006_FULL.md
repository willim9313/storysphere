# ADR-006: Agent 延遲預期與性能目標

**狀態**: ✅ Approved  
**日期**: 2026-02-22  
**決策者**: William, AI Architect

---

## 背景 (Context)

Agent 推理涉及 LLM 調用，需要定義延遲預期以指導設計。

---

## 決策 (Decision)

**2-5 秒延遲可接受，需要進度提示**

### 開發階段策略

**Phase 1: Sequential 實現（先求能跑）**
- 工具調用序列執行
- 簡化開發和調試
- 確保功能正確性
- 預估延遲：3-5s

**Phase 2: Parallel 優化（後期優化）**
- 組合工具內部並行化
- 使用 asyncio.gather()
- 預估延遲：1.5-2.5s
- 性能提升：40-50%

### 目標值

```
- Map/Card Query：<100ms （同步，無 Agent）
- Chat Query：
  - Phase 1 (Sequential): 3-5s
  - Phase 2 (Parallel): 2-3s
- Deep Analysis：
  - 首次：3-5s （無緩存）
  - 命中緩存：<100ms
```

### Sequential 實現（Phase 1）

```python
class GetEntityRelationshipTool:
    async def ainvoke(self, entity1: str, entity2: str):
        # Sequential 調用
        attrs1 = await self.get_attrs.ainvoke(entity_name=entity1)
        attrs2 = await self.get_attrs.ainvoke(entity_name=entity2)
        relations = await self.get_relations.ainvoke(
            source=entity1, target=entity2
        )
        paragraphs = await self.vector_search.ainvoke(
            query=f"{entity1} {entity2}"
        )
        
        return self._aggregate(attrs1, attrs2, relations, paragraphs)

# 延遲：200ms + 200ms + 300ms + 400ms = 1100ms
```

### Parallel 優化（Phase 2）

```python
class GetEntityRelationshipTool:
    async def ainvoke(self, entity1: str, entity2: str):
        # Parallel 調用
        attrs1, attrs2, relations, paragraphs = await asyncio.gather(
            self.get_attrs.ainvoke(entity_name=entity1),
            self.get_attrs.ainvoke(entity_name=entity2),
            self.get_relations.ainvoke(source=entity1, target=entity2),
            self.vector_search.ainvoke(query=f"{entity1} {entity2}")
        )
        
        return self._aggregate(attrs1, attrs2, relations, paragraphs)

# 延遲：max(200, 200, 300, 400) = 400ms
# 性能提升：1100ms → 400ms (63% faster)
```

### 優化策略

1. 工具並行調用（Phase 2）
2. 智能工具選擇
3. 流式響應
4. 結果緩存（ChatState 5min, Analysis 7天）
5. Token 預算控制

---

## 根據 (Rationale)

- 2-5s 是 Web 應用的可接受範圍
- 進度提示改善用戶體驗
- **先求穩定，後求快速**（Phase 1 → Phase 2）

---

## 後果 (Consequences)

### 實現複雜度
✅ Phase 1 簡單（Sequential）  
✅ Phase 2 需要異步框架（asyncio）  
✅ 需要 WebSocket 推送  
✅ 需要監控和日誌

### 性能預期
- Phase 1: 3-5s（可接受）
- Phase 2: 2-3s（優秀）

### 監控指標
- Agent 端到端延遲（P50, P95, P99）
- 各工具的執行時間分佈
- Token 使用情況
- 緩存命中率
- 工具選擇準確率

---

## 實施計劃

**Phase 1: Sequential 實現（優先）**
- 時間：3-4 週
- 目標：功能完整，延遲 3-5s
- 重點：正確性 > 性能

**Phase 2: Parallel 優化（後期）**
- 時間：1-2 週
- 目標：延遲優化到 2-3s
- 重點：性能 > 複雜度

---

## 相關決策

- [ADR-001: Agent 架構](ADR_001_FULL.md)
- [ADR-003: 工具層（組合工具）](ADR_003_FULL.md)
- [ADR-005: Chat 上下文（工具結果緩存）](ADR_005_FULL.md)

---

## 參考文檔

- [並行化實現細節](PARALLEL_IMPL.md)

---

**最後更新**: 2026-02-22  
**狀態**: ✅ Approved  
**維護者**: William
