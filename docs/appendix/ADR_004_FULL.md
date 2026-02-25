# ADR-004: 深度分析執行策略

**狀態**: ✅ Approved  
**日期**: 2026-02-22  
**決策者**: William, AI Architect

---

## 背景 (Context)

用戶點擊"深度分析"按鈕時，系統需要生成結構化的分析結果（如角色檔案）。

**選項**：
1. 實時分析（按需計算，2-5s 延遲）
2. 預生成（後台異步，立即展示）
3. 混合（常見實體預生成，非常見實時分析）

---

## 決策 (Decision)

**採用：優先使用緩存 + 實時觸發 + 異步處理**

### 完整流程

```
用戶點擊 "深度分析"
  ↓
1. 檢查資料庫緩存
   ├─ 緩存存在且未過期（<7天）
   │  └─ 立即返回結果（<100ms）
   │
   └─ 緩存不存在或已過期
      ↓
2. 創建分析任務
   ├─ 立即返回 task_id + 進度端點
   └─ 後台非同步執行
      ↓
3. 後台執行流程
   ├─ Step 1: 信息收集（並行調用工具）
   ├─ Step 2: LLM 分析 + Pydantic 驗證
   ├─ Step 3: 結果存入資料庫（緩存）
   └─ Step 4: WebSocket 推送完成
   ↓
4. 前端接收結果
   └─ 通過 WebSocket 實時更新 UI
```

---

## 根據 (Rationale)

- **優先緩存**：大部分查詢命中緩存，<100ms 響應
- **按需分析**：token 消耗大（>3000），預生成不經濟
- **2-5s 延遲**：首次分析，用戶可接受
- **異步處理**：避免阻塞主流程
- **結果持久化**：減少重複計算

---

## 後果 (Consequences)

### 實現需求
✅ Task Queue（FastAPI BackgroundTasks）  
✅ WebSocket 推送進度  
✅ 資料庫存儲分析結果  
✅ Pydantic 驗證輸出格式  
✅ 重試機制（LLM 可能失敗）

### 性能預期
- 首次分析：2-5s（無緩存）
- 後續分析（同一實體）：<100ms（從緩存）
- 緩存命中率預估：60-80%（常見角色反覆查詢）

### 成本控制
- 緩存有效期：7 天
- 過期後重新分析（保持數據新鮮度）
- 預估成本：~$0.01 per analysis

---

## 實施細節

### Pydantic 模型

```python
class CharacterAnalysisResult(BaseModel):
    """角色深度分析結果"""
    entity_id: str
    entity_name: str
    
    # 基本信息
    basic_info: Dict[str, Any]
    
    # 角色檔案
    profile: CharacterProfile
    
    # 故事弧線
    character_arc: List[ArcSegment]
    
    # 關鍵事件
    key_events: List[EventSummary]
    
    # 關係網絡
    relationships: List[RelationshipSummary]
    
    # 洞見和分析
    insights: List[InsightCard]
    
    # 元數據
    analyzed_at: datetime
    expires_at: datetime  # 7 天後過期
    version: str = "1.0"
    
    @validator('character_arc')
    def validate_arc_not_empty(cls, v):
        if not v:
            raise ValueError("character_arc 不能為空")
        return v
```

### 重試機制

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10)
)
async def generate_analysis_with_llm(data: dict) -> dict:
    """使用 LLM 生成分析，帶重試"""
    response = await llm.ainvoke(...)
    
    # Pydantic 驗證
    try:
        result = CharacterAnalysisResult(**response)
        return result.dict()
    except ValidationError as e:
        logger.error(f"LLM 輸出驗證失敗: {e}")
        raise  # 觸發重試
```

---

## 相關決策

- [ADR-001: Agent 架構](ADR_001_FULL.md)
- [ADR-003: 工具層](ADR_003_FULL.md)
- [ADR-007: 風險管理](ADR_007_FULL.md)

---

## 參考文檔

- [Pydantic 模型定義](PYDANTIC_MODELS.md)

---

**最後更新**: 2026-02-22  
**狀態**: ✅ Approved  
**維護者**: William
