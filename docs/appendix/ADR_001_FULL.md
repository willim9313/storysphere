# ADR-001: 系統架構轉向 Agent-Driven 模式

**狀態**: ✅ Approved  
**日期**: 2026-02-22  
**決策者**: William, AI Architect

---

## 背景 (Context)

當前 StorySphere 採用固定 workflow 進行文本分析，缺乏與用戶的靈活交互能力。需要支持：
- 文檔自動化處理（保持固定流程）
- 基於 Chat 的交互式探索（靈活查詢）
- 按需觸發的深度分析（高 token 消耗）

---

## 決策 (Decision)

採用 **LangChain + LangGraph** 構建 Agent 架構，支持三個並行的處理路徑：

### 1. 路徑 1: Map & Card Query (同步，<100ms)
- 用於知識圖譜可視化和實體卡片展示
- 純數據查詢，無 Agent 參與
- 工具：graph_query, vector_search, summary_retrieval

### 2. 路徑 2: Deep Analysis (非同步，2-5s)

**定位**: 預定義的、結構化的、產品級功能

**觸發方式**：
- 用戶點擊實體卡片上的「深度分析」按鈕
- 明確的產品功能入口

**執行策略（優先使用緩存）**：
```
1. 檢查資料庫中是否有該實體的分析結果
   ├─ 有且未過期（<7天）→ 直接返回
   └─ 無或已過期 → 執行步驟 2

2. 後台非同步執行分析
   ├─ Step 1: 信息收集（並行調用工具）
   ├─ Step 2: LLM 分析 + 結構化（Pydantic 驗證）
   ├─ Step 3: 結果存入資料庫
   └─ Step 4: WebSocket 推送完成狀態
```

**輸出格式**：
- 固定的 Insight Cards 結構
- 包含：角色檔案、性格分析、故事弧線等
- 結構化 JSON（經 Pydantic 驗證）

**與 Chat 的區別**：
- Deep Analysis = 產品功能，固定流程，結果可持久化
- Chat = 輔助探索，靈活查詢，對話內上下文
- Chat Agent 不會直接觸發 Deep Analysis

### 3. 路徑 3: Chat Interface (同步流式，2-5s)
- 用於多輪自由形式查詢
- 完整 Reasoning Agent（LangGraph-based）
- 複雜的狀態流轉和工具選擇
- 支持同對話內上下文，無跨對話記憶
- 用戶可以詢問已有的深度分析結果

---

## 根據 (Rationale)

- LangGraph 天生適合複雜的狀態機和多步驟工作流
- Chat Agent 需要條件邏輯和反饋循環，LangGraph 表達力強
- 分離確定性路徑（Map/Card）和靈活路徑（Chat/Analysis），各取所需
- **Deep Analysis 優先使用緩存**，避免重複計算和 token 浪費
- **職責清晰**：Deep Analysis = 產品功能，Chat = 輔助工具

---

## 後果 (Consequences)

### 優點
✅ 靈活支持多種用戶交互模式  
✅ 清晰的數據流和決策流  
✅ 易於調試和監控（LangGraph 可視化）  
✅ 逐步演進而非大刀闊斧改造  
✅ 避免路徑 2 和路徑 3 的職責混淆

### 挑戰
⚠️ 需要新增 Agent 層和 Tool 層  
⚠️ Token 消耗和成本需要監控  
⚠️ LangGraph 學習曲線  
⚠️ 需要設計深度分析結果的緩存和過期策略

---

## 實施細節

### Deep Analysis 的緩存策略

```python
# 偽代碼示例
async def trigger_deep_analysis(entity_id: str):
    # 1. 先查緩存
    cached = await db.get_analysis(entity_id)
    if cached and not is_expired(cached, days=7):
        return cached
    
    # 2. 無緩存或已過期，觸發新分析
    task_id = create_async_task(analyze_entity, entity_id)
    return {"task_id": task_id, "status": "processing"}

async def analyze_entity(entity_id: str):
    # 3. 執行分析並存儲
    result = await deep_analysis_workflow.run(entity_id)
    await db.save_analysis(entity_id, result)
    await websocket.push(task_id, result)
```

---

## 相關決策

- [ADR-002: Pipelines & Workflows 重構](ADR_002_FULL.md)
- [ADR-003: 工具層設計](ADR_003_FULL.md)
- [ADR-004: 深度分析執行策略](ADR_004_FULL.md)
- [ADR-005: Chat 上下文管理](ADR_005_FULL.md)

---

**最後更新**: 2026-02-22  
**狀態**: ✅ Approved  
**維護者**: William
