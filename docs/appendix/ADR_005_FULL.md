# ADR-005: Chat 上下文管理方案

**狀態**: ✅ Approved  
**日期**: 2026-02-22  
**決策者**: William, AI Architect

---

## 背景 (Context)

多輪對話中，Agent 需要記住之前的實體和問題。

**選項**：
1. 完全無狀態（每次查詢獨立）
2. 跨對話記憶（記住所有歷史）
3. 同對話內上下文（當前對話內記憶）

---

## 決策 (Decision)

**同對話內上下文，無跨對話記憶**

### 擴展的 ChatState 定義

```python
from typing import List, Dict, Optional
from pydantic import BaseModel

class ChatState(BaseModel):
    """Chat Agent 的狀態"""
    
    # 1. 對話歷史（最近 5-10 輪）
    conversation_history: List[Message] = []
    
    # 2. 檢測到的實體（當前對話提及）
    detected_entities: List[str] = []
    
    # 3. 當前查詢意圖
    intent: Optional[str] = None
    
    # 4. 工具調用結果（用於追問）
    tool_results: Dict[str, Any] = {}
    
    # ===== 新增：指代消解支持 =====
    
    # 5. 當前焦點實體（最近討論的主要實體）
    current_focus_entity: Optional[str] = None
    
    # 6. 實體提及次數（用於消歧）
    entity_mentions: Dict[str, int] = {}
    
    # 7. 上一次工具調用的結果（用於快速追問）
    last_tool_results: Dict[str, Any] = {}
    
    # 8. 上一次查詢的類型（用於上下文推理）
    last_query_type: Optional[str] = None
    
    # ===== 方法 =====
    
    def add_entity_mention(self, entity: str):
        """記錄實體提及"""
        if entity not in self.entity_mentions:
            self.entity_mentions[entity] = 0
        self.entity_mentions[entity] += 1
        
        # 更新焦點實體（提及最多的）
        self.current_focus_entity = max(
            self.entity_mentions, 
            key=self.entity_mentions.get
        )
    
    def resolve_pronoun(self, pronoun: str) -> Optional[str]:
        """解析代詞（如「他」、「她」）"""
        if pronoun in ["他", "她", "它"]:
            return self.current_focus_entity
        return None
    
    def cache_tool_result(self, tool_name: str, result: Any):
        """緩存工具結果（5 分鐘內可複用）"""
        self.last_tool_results[tool_name] = {
            "result": result,
            "timestamp": datetime.now()
        }
    
    def get_cached_result(self, tool_name: str) -> Optional[Any]:
        """獲取緩存的工具結果"""
        cached = self.last_tool_results.get(tool_name)
        if cached:
            # 檢查是否過期（5 分鐘）
            if (datetime.now() - cached["timestamp"]).seconds < 300:
                return cached["result"]
        return None
```

### 使用示例

```python
# 第一輪對話
用戶: "告訴我張三的背景"
Agent: 
  state.add_entity_mention("張三")
  state.current_focus_entity = "張三"
  result = GetEntityAttributesTool().invoke("張三")
  state.cache_tool_result("GetEntityAttributesTool", result)
  [回答...]

# 第二輪對話
用戶: "他和李四的關係呢？"
Agent:
  pronoun_resolved = state.resolve_pronoun("他")  # → "張三"
  state.add_entity_mention("李四")
  
  # 檢查緩存（張三的信息已有）
  zhang_info = state.get_cached_result("GetEntityAttributesTool")
  if zhang_info is None:
      zhang_info = GetEntityAttributesTool().invoke("張三")
  
  # 只需要查李四的信息
  li_info = GetEntityAttributesTool().invoke("李四")
  relation = GetEntityRelationsTool().invoke("張三", "李四")
  
  [回答...]
```

---

## 根據 (Rationale)

- **降低 token 成本**（無需傳遞完整歷史）
- **簡化實現**（無需資料庫持久化）
- **用戶場景**：通常一個會話聚焦於一兩個實體
- **指代消解**：基於焦點實體和提及次數
- **工具結果緩存**：減少重複調用

---

## 後果 (Consequences)

### 限制
⚠️ 用戶不能問"之前我們討論過的事件是什麼"（跨對話）  
⚠️ 對話結束後無法恢復

### 優點
✅ token 高效（~2000/query）  
✅ 實現簡單  
✅ 隱私友好  
✅ 支持指代消解（同對話內）  
✅ 減少重複工具調用（緩存）

### 成功指標
- 指代消解準確率 >90%
- 工具結果緩存命中率 >40%
- 平均 token/query <2500

---

## 相關決策

- [ADR-001: Agent 架構](ADR_001_FULL.md)
- [ADR-006: 性能目標](ADR_006_FULL.md)

---

## 參考文檔

- [ChatState 完整實現](CHATSTATE_DESIGN.md)

---

**最後更新**: 2026-02-22  
**狀態**: ✅ Approved  
**維護者**: William
