# ADR-008: 工具選擇準確性提升策略

**狀態**: ✅ Approved  
**日期**: 2026-02-22  
**決策者**: William, AI Architect

---

## 背景 (Context)

Agent 的核心能力是「選擇正確的工具」。如果選錯工具，會導致：
- 用戶體驗差（答非所問）
- token 浪費（調用無關工具）
- 延遲增加（需要重試）

---

## 決策 (Decision)

**採用多層策略提升工具選擇準確率到 >85%**

### 策略 1: 精確的工具 Description

```python
# ❌ 錯誤示範：Description 太模糊
class GraphQueryTool:
    description = "查詢知識圖譜"

# ✅ 正確示範：Description 精確且有示例
class GetEntityAttributesTool:
    name = "get_entity_attributes"
    description = """獲取實體的所有屬性信息
    
    ✅ 適用場景：
    - 用戶詢問「XX是誰？」
    - 用戶詢問「XX的背景」「XX的簡介」
    
    ❌ 不適用場景：
    - 查詢實體之間的關係 → 使用 get_entity_relations
    - 搜索相關段落 → 使用 vector_search
    
    輸入參數：
    - entity_name: 實體名稱（如「張三」）
    
    示例查詢：
    1. "張三是誰？" → get_entity_attributes(entity_name="張三")
    2. "告訴我李四的背景" → get_entity_attributes(entity_name="李四")
    
    ⚠️ 注意：此工具只返回基本屬性，不包括關係網絡
    """
```

---

### 策略 2: 限制可用工具範圍

```python
# 為不同 Agent 配置不同的工具集

# Chat Agent 的工具集（輔助探索）
chat_tools = [
    "get_entity_attributes",
    "get_entity_relations",
    "vector_search",
    "get_entity_profile",
    "get_entity_relationship",
    # 不包括分析工具（Deep Analysis 專用）
]

# Deep Analysis Agent 的工具集（深度分析）
analysis_tools = [
    "get_entity_attributes",
    "get_entity_timeline",
    "analyze_character",
    "analyze_event",
    "generate_insight",
]

chat_agent = ChatAgent(available_tools=chat_tools)
analysis_agent = AnalysisAgent(available_tools=analysis_tools)
```

---

### 策略 3: Few-shot Examples

```python
system_prompt = """
你是一個小說分析助手，幫助用戶探索小說內容。

以下是正確的工具使用範例，請參考：

【範例 1：查詢實體基本信息】
用戶：「張三是誰？」
思考：需要獲取實體的基本屬性
工具選擇：get_entity_attributes(entity_name="張三")
✅ 正確

【範例 2：查詢實體關係】
用戶：「張三和李四是什麼關係？」
思考：需要查詢兩個實體之間的關係
工具選擇：get_entity_relationship(entity1="張三", entity2="李四")
✅ 正確（使用組合工具，更高效）

【範例 3：錯誤示範】
用戶：「張三是誰？」
思考：搜索一下看看
工具選擇：vector_search(query="張三是誰")
❌ 錯誤！應該用 get_entity_attributes

現在，請根據用戶的查詢選擇合適的工具。
"""
```

---

### 策略 4: 查詢模式識別（快速路由）

```python
class QueryPatternRecognizer:
    """識別常見查詢模式，快速路由到工具"""
    
    patterns = [
        {
            "name": "entity_info",
            "keywords": ["是誰", "背景", "簡介"],
            "tools": ["get_entity_attributes"],
            "confidence": 0.9
        },
        {
            "name": "relationship",
            "keywords": ["關係", "和", "與"],
            "tools": ["get_entity_relationship"],
            "confidence": 0.85
        },
        {
            "name": "timeline",
            "keywords": ["時間線", "發展", "演變"],
            "tools": ["get_entity_timeline"],
            "confidence": 0.8
        },
    ]
    
    def recognize(self, query: str) -> Optional[Dict]:
        for pattern in self.patterns:
            if self._match_pattern(query, pattern):
                return pattern
        return None

# 在 Agent 中使用
async def chat_agent_with_pattern_recognition(query: str, state: ChatState):
    # 1. 嘗試快速路由
    pattern = recognizer.recognize(query)
    
    if pattern and pattern["confidence"] > 0.8:
        # 高置信度：直接使用推薦工具，跳過 Agent 推理
        tools = pattern["tools"]
        logger.info(f"快速路由: {query} → {tools}")
        return await execute_tools(tools)
    
    # 2. 低置信度或無匹配：使用 Agent 推理
    return await agent.run(query, state)
```

---

### 策略 5: 工具選擇驗證（Post-Selection Validation）

```python
class ToolSelectionValidator:
    """驗證 Agent 選擇的工具是否合理"""
    
    def validate(self, query: str, selected_tools: List[str]) -> bool:
        # 規則 1: 不允許同時選擇衝突的工具
        conflicts = [
            ("get_entity_attributes", "analyze_character"),
            ("vector_search", "get_entity_relationship"),
        ]
        
        for tool1, tool2 in conflicts:
            if tool1 in selected_tools and tool2 in selected_tools:
                logger.warning(f"工具衝突: {tool1} 和 {tool2}")
                return False
        
        # 規則 2: 某些工具需要前置工具
        dependencies = {
            "get_entity_relationship": ["get_entity_attributes"],
        }
        
        for tool, deps in dependencies.items():
            if tool in selected_tools:
                if not any(dep in selected_tools for dep in deps):
                    # 自動添加前置工具
                    selected_tools = deps + selected_tools
        
        return True
```

---

## 根據 (Rationale)

1. **精確 Description**：LLM 依賴文本描述選擇工具
2. **限制工具集**：選項越少，選錯概率越低
3. **Few-shot Examples**：LLM 善於模仿範例
4. **快速路由**：常見模式直接路由，不經過 Agent（更快更準）
5. **驗證機制**：事後檢查，防止明顯錯誤

---

## 後果 (Consequences)

### 優點
✅ 工具選擇準確率大幅提升（預估 >85%）  
✅ 常見查詢快速路由（<1s）  
✅ 減少 token 浪費  
✅ 用戶體驗更好

### 挑戰
⚠️ 需要精心設計 Description（工作量大）  
⚠️ Few-shot Examples 需要反覆測試  
⚠️ 查詢模式需要持續更新（新場景）

### 成功指標
- 工具選擇準確率 >85%
- 快速路由覆蓋率 >50%（常見查詢）
- 用戶滿意度 >4/5

---

## 實施計劃

**Phase 1: 基礎實現（2 週）**
- 為所有工具編寫詳細 Description
- 限制不同 Agent 的工具集
- 添加 Few-shot Examples

**Phase 2: 快速路由（1 週）**
- 實現 QueryPatternRecognizer
- 定義 5-10 個常見模式
- 測試路由準確率

**Phase 3: 驗證機制（1 週）**
- 實現 ToolSelectionValidator
- 定義驗證規則
- 集成到 Agent

**Phase 4: 監控和優化（持續）**
- 收集工具選擇日誌
- 分析選錯的案例
- 持續優化 Description 和 Examples

---

## 相關決策

- [ADR-003: 工具層設計](ADR_003_FULL.md)
- [ADR-007: 風險管理](ADR_007_FULL.md)

---

## 參考文檔

- [工具目錄（完整 Description）](TOOLS_CATALOG.md)

---

**最後更新**: 2026-02-22  
**狀態**: ✅ Approved  
**維護者**: William
