# ADR-007: 風險管理與降級策略

**狀態**: ✅ Approved  
**日期**: 2026-02-22  
**決策者**: William, AI Architect

---

## 背景 (Context)

Agent 系統涉及 LLM 調用、工具執行、網絡請求等不確定因素，需要完善的錯誤處理和降級策略。

---

## 決策 (Decision)

**建立三層風險管理體系：預防、檢測、降級**

### 1. 工具選擇準確性（風險 1）

#### 預防措施

```python
# 1. 精確的工具 Description
class GetEntityAttributesTool:
    description = """獲取實體的所有屬性信息
    
    適用場景：
    - 用戶詢問「XX是誰？」
    - 用戶詢問「XX的背景/簡介」
    
    不適用場景：
    - 查詢實體之間的關係（使用 get_entity_relations）
    - 搜索相關段落（使用 vector_search）
    
    示例查詢：
    - "張三是誰？"
    - "告訴我李四的背景"
    """

# 2. 限制 Agent 可用工具
chat_agent = ChatAgent(
    available_tools=[
        "get_entity_attributes",
        "get_entity_relations",
        "vector_search",
        # 不提供 analyze_character（Deep Analysis 專用）
    ]
)

# 3. Few-shot Examples
system_prompt = """
範例 1:
用戶：「張三是誰？」
工具：get_entity_attributes(entity_name="張三")
"""
```

#### 檢測措施

```python
class ToolSelectionMonitor:
    def log_tool_selection(self, query: str, selected_tools: List[str]):
        logger.info(f"Query: {query}, Tools: {selected_tools}")
```

#### 降級措施

```python
if tool_selection_confidence < 0.6:
    # 要求 Agent 重新選擇或提示用戶
    pass
```

---

### 2. 結構化輸出失敗（風險 2）

#### 預防措施

```python
# 1. 使用 Pydantic 強制驗證
class CharacterAnalysisResult(BaseModel):
    entity_name: str
    profile: CharacterProfile
    character_arc: List[ArcSegment]
    
    @validator('entity_name')
    def name_not_empty(cls, v):
        if not v or v.strip() == "":
            raise ValueError("entity_name 不能為空")
        return v

# 2. 明確的輸出格式說明
system_prompt = """
你必須返回以下 JSON 格式，不要有任何額外的文字：
{
  "entity_name": "...",
  "profile": {...},
  "character_arc": [...]
}

禁止：
- 不要在 JSON 前後加任何解釋性文字
- 不要使用 Markdown 的 ```json 標記
- 確保 JSON 格式正確
"""
```

#### 檢測措施

```python
try:
    result = CharacterAnalysisResult(**llm_output)
except ValidationError as e:
    logger.error(f"Pydantic 驗證失敗: {e}")
    raise
```

#### 降級措施

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10)
)
async def generate_analysis_with_retry(data: dict) -> dict:
    response = await llm.ainvoke(...)
    
    try:
        result = CharacterAnalysisResult(**response)
        return result.dict()
    except ValidationError as e:
        logger.warning(f"解析失敗: {e}")
        raise  # 觸發重試

# 如果 3 次都失敗
try:
    result = await generate_analysis_with_retry(data)
except Exception:
    return {
        "error": "分析生成失敗，請稍後重試",
        "partial_data": {...}
    }
```

---

### 3. 工具執行失敗（風險 3）

#### 預防措施

```python
# 1. 工具超時設置
class BaseTool:
    timeout: int = 30
    
    async def ainvoke(self, **kwargs):
        try:
            return await asyncio.wait_for(
                self._execute(**kwargs),
                timeout=self.timeout
            )
        except asyncio.TimeoutError:
            raise ToolTimeoutError(self.name)

# 2. 資料庫連接池
from sqlalchemy.pool import QueuePool
engine = create_engine(
    db_url,
    poolclass=QueuePool,
    pool_size=10,
    max_overflow=20
)
```

#### 降級措施

```python
async def execute_tool_with_fallback(tool: BaseTool, **kwargs):
    try:
        return await tool.ainvoke(**kwargs)
    except ToolTimeoutError:
        logger.warning(f"{tool.name} 超時，使用降級策略")
        return None
    except DatabaseError:
        cached = get_cached_result(tool.name, kwargs)
        if cached:
            logger.info(f"{tool.name} 使用緩存數據")
            return cached
        return None

# 並行執行，不讓一個失敗影響全部
results = await asyncio.gather(
    execute_tool_with_fallback(tool1, **params1),
    execute_tool_with_fallback(tool2, **params2),
    return_exceptions=True
)

valid_results = [r for r in results if r is not None]
```

---

### 4. LLM 調用失敗（風險 4）

#### 預防措施

```python
# 1. 使用多個 LLM 提供商（備份）
primary_llm = Gemini(model="gemini-pro")
fallback_llm = OpenAI(model="gpt-3.5-turbo")

# 2. 限流和退避
llm = Gemini(
    model="gemini-pro",
    request_timeout=30,
    max_retries=3
)
```

#### 降級措施

```python
async def call_llm_with_fallback(prompt: str):
    try:
        return await primary_llm.ainvoke(prompt)
    except RateLimitError:
        logger.warning("Primary LLM 限流，使用 fallback")
        return await fallback_llm.ainvoke(prompt)
    except Exception as e:
        logger.error(f"LLM 調用失敗: {e}")
        return "抱歉，我現在無法回答，請稍後重試。"
```

---

### 5. JSON 解析脆弱性（風險 5）⚠️ 待移植

#### 現狀

新版 `_parse_json_response()`（`extraction_service.py`）僅處理 markdown fence（`` ```json...``` ``），容易在 LLM 格式偏差時失敗。

#### 舊版方案

舊版 `extract_json_from_text()`（`old_version/src/core/utils/output_extractor.py`）實現了 4 步 fallback chain：

```python
# 1. ```json...``` code block（正則提取）
# 2. <JSON>...</JSON> sentinel tags
# 3. Bracket-balanced scanning（追蹤 {}/[] 嵌套深度）
# 4. Repair heuristics:
#    - 移除 // 和 /* */ 註釋
#    - 移除尾逗號
#    - 修復單引號 → 雙引號
#    - Python literals → JSON (True→true, None→null)
```

#### 行動項

- [ ] 將 `extract_json_from_text()` 移植到 `src/core/utils/output_extractor.py`
- [ ] 替換 `extraction_service.py` 中的簡易 `_parse_json_response()`
- [ ] 確保 `analysis_service.py`、`summary_service.py` 等所有 JSON 解析路徑統一使用

---

### 6. Prompt Injection 防護（風險 6）⚠️ 待移植

#### 現狀

Phase 4 Chat Agent 中用戶輸入將直接進入 prompt，目前沒有清理機制。

#### 舊版方案

舊版 `DataSanitizer`（`old_version/src/core/utils/data_sanitizer.py`）提供了：

```python
# SafeFormatter.escape_braces() — 轉義 {} 防止 format string injection
# format_vector_store_results() — 清理向量 DB 返回的 payload
#   - 截斷過長文本
#   - 移除 prompt-like 內容
#   - 統一格式化
```

#### 行動項

- [ ] 將 `DataSanitizer` 移植到 `src/core/utils/data_sanitizer.py`
- [ ] Phase 4 Chat Agent 的用戶輸入經過 `escape_braces()` 處理
- [ ] 向量搜索結果經過 `format_vector_store_results()` 清理後再注入 prompt

---

## 後果 (Consequences)

### 優點
✅ 系統魯棒性高  
✅ 用戶體驗好（有錯誤提示）  
✅ 可觀測性強（詳細日誌）  
✅ 漸進式降級（部分失敗不影響全部）

### 挑戰
⚠️ 代碼複雜度增加  
⚠️ 需要完善的監控和日誌  
⚠️ 需要定期分析錯誤日誌

### 成功指標
- 工具選擇準確率 >85%
- 結構化輸出解析成功率 >98%（含 JSON fallback chain）
- 工具執行成功率 >95%
- Agent 端到端成功率 >90%
- JSON 解析 fallback 成功率 >99%（4 步 chain）
- Prompt injection 攔截率 >95%

---

## 相關決策

- [ADR-003: 工具層設計](ADR_003_FULL.md)
- [ADR-004: 深度分析（Pydantic + Retry）](ADR_004_FULL.md)
- [ADR-008: 工具選擇準確性](ADR_008_FULL.md)

---

**最後更新**: 2026-02-22  
**狀態**: ✅ Approved  
**維護者**: William
