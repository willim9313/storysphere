# StorySphere 核心設計文檔

**版本**: v2.1
**更新日期**: 2026-03-07
**用途**: 開發時的核心參考（始終載入，~2K tokens）

---

## 🚀 快速開始（30 秒）

**StorySphere** 是一個智能小說分析系統，使用 **Agent-Driven 架構**自動提取和分析小說內容。

**核心能力**：
- 📖 自動解析 PDF/DOCX 小說
- 🧠 提取實體、關係、事件
- 💬 Chat 對話式探索
- 🔍 深度角色/事件分析
- 🗺️ 知識圖譜可視化

**技術棧**：LangChain + LangGraph + Gemini + FastAPI + Neo4j/NetworkX

---

## 🎯 8 個關鍵決策（ADR 摘要）

### ADR-001: Agent 架構
**決策**: LangChain + LangGraph  
**路徑**: 三個並行處理路徑
- **Map/Card Query**: 同步 <100ms（純數據查詢）
- **Deep Analysis**: 非同步 2-5s（優先緩存 7 天）
- **Chat Interface**: 流式 2-5s（Reasoning Agent）

📄 [完整版](appendix/ADR_001_FULL.md)

---

### ADR-002: Pipelines & Workflows
**決策**: 完全重構，職責分離  
**原則**:
- **Pipelines** = 確定的 ETL（文檔處理、特徵提取、KG 構建）
- **Workflows** = 業務編排（可能涉及 Agent）

📄 [完整版](appendix/ADR_002_FULL.md)

---

### ADR-003: 工具層設計 ⭐
**決策**: 細粒度基礎工具 + 組合工具 + Services Thin Wrapper  
**結構**:
- **基礎工具**: 15-18 個（單一職責，精確 description）
- **組合工具**: 3-5 個（常見場景，內部並行）
- **Thin Wrapper**: 業務邏輯在 Services

📄 [完整版](appendix/ADR_003_FULL.md) | [工具目錄](appendix/TOOLS_CATALOG.md)

---

### ADR-004: Deep Analysis 執行
**決策**: 優先緩存 + 實時觸發 + 異步處理  
**流程**:
```
檢查緩存（<7天）→ 命中返回 <100ms
    ↓ 未命中
創建任務 → task_id → 後台執行 → WebSocket 推送
    ↓
存入資料庫（緩存 7 天）
```

📄 [完整版](appendix/ADR_004_FULL.md)

---

### ADR-005: Chat 上下文管理 ⭐
**決策**: 同對話內，無跨對話記憶  
**ChatState** (8 字段):
- 對話歷史（5-10 輪）
- 檢測實體
- **當前焦點實體**（指代消解）
- **實體提及次數**
- **工具結果緩存**（5 分鐘）

📄 [完整版](appendix/ADR_005_FULL.md) | [ChatState 實現](appendix/CHATSTATE_DESIGN.md)

---

### ADR-006: 性能目標
**決策**: Sequential → Parallel 漸進式優化  
**目標**:
- Phase 1 (Sequential): 3-5s
- Phase 2 (Parallel): 2-3s（asyncio.gather）

📄 [完整版](appendix/ADR_006_FULL.md) | [並行化實現](appendix/PARALLEL_IMPL.md)

---

### ADR-007: 風險管理 ⭐
**決策**: 三層體系（預防、檢測、降級）
**六大風險**:
1. 工具選擇錯誤 → 精確 description + 限制工具集
2. 結構化輸出失敗 → Pydantic + Retry (3次)
3. 工具執行失敗 → 超時管理 + 降級
4. LLM 調用失敗 → 多提供商備份
5. JSON 解析脆弱性 → 4 步 fallback chain（✅ 已移植至 `src/core/utils/output_extractor.py`）
6. Prompt Injection → DataSanitizer（✅ 已移植至 `src/core/utils/data_sanitizer.py`）

📄 [完整版](appendix/ADR_007_FULL.md)

---

### ADR-008: 工具選擇準確性 ⭐
**決策**: 五大策略提升準確率 >85%  
**策略**:
1. 精確 Description（含示例、適用/不適用場景）
2. 限制工具集（Chat ≠ Deep Analysis）
3. Few-shot Examples（System Prompt）
4. 查詢模式識別（快速路由）
5. 工具選擇驗證（Post-Selection）

📄 [完整版](appendix/ADR_008_FULL.md)

---

### ADR-009: Tech Stack ⭐ NEW
**決策**: MVP 輕量 → 生產可選升級

**核心**:
- Agent: LangChain + LangGraph
- LLM: Gemini (Primary), OpenAI/Anthropic (Fallback)
- Web: FastAPI + WebSocket
- **包管理: uv** ⭐

**數據存儲**:
- 關係型: SQLite (開發) → PostgreSQL (可選)
- 向量: Qdrant
- 知識圖譜: NetworkX (默認) ↔ Neo4j (Docker, 大規模備案)

**緩存 & 任務**:
- 緩存: 內存 dict (ChatState 5min) + SQLite (Analysis 7天)
- 任務: FastAPI BackgroundTasks

📄 [完整版](appendix/ADR_009_FULL.md) | [pyproject.toml](../pyproject.toml)

---

## 🏗️ 系統架構（一圖）

```
┌─────────────────────────────────────────────┐
│         UI Layer (用戶交互)                  │
├─────────────┬──────────────┬────────────────┤
│ Map View    │ Card Details │ Chat Interface │
└─────────────┴──────────────┴────────────────┘
       ↑             ↑                ↑
┌─────────────────────────────────────────────┐
│    API Handler / Agent Orchestration         │
├─────────────┬──────────────┬────────────────┤
│ 同步查詢API │ Deep Analysis│ Chat Handler   │
│  <100ms     │ 優先緩存 7天 │ 流式 WebSocket │
└─────────────┴──────────────┴────────────────┘
       ↑             ↑                ↑
┌─────────────────────────────────────────────┐
│    Tools Layer (18-22 個工具)               │
├─────────────┬──────────────┬────────────────┤
│ 基礎工具    │ 組合工具     │ 分析工具      │
│ 15-18 個    │ 3-5 個       │ LLM-based     │
└─────────────┴──────────────┴────────────────┘
       ↑             ↑                ↑
┌─────────────────────────────────────────────┐
│      Services Layer (業務邏輯)               │
├─────────────┬──────────────┬────────────────┤
│ KGService   │ NLPService   │ AnalysisService│
└─────────────┴──────────────┴────────────────┘
       ↑             ↑                ↑
┌─────────────────────────────────────────────┐
│      Data Layer (資料和存儲)                 │
├─────────────┬──────────────┬────────────────┤
│ Knowledge   │ Qdrant       │ SQLite/PG      │
│ Graph (KG)  │ VectorDB     │ Cache + Data   │
│ NX / Neo4j  │              │                │
└─────────────┴──────────────┴────────────────┘
```

---

## 🛠️ 工具目錄（18-22 個）

### 基礎工具（15-18 個）

**圖查詢（6 個）**:
1. GetEntityAttributesTool - 實體屬性
2. GetEntityRelationsTool - 實體關係
3. GetEntityTimelineTool - 實體時間線
4. GetRelationPathsTool - 關係路徑
5. GetSubgraphTool - 子圖
6. GetRelationStatsTool - 關係統計

**檢索（3 個）**:
7. VectorSearchTool - 語義搜索
8. GetSummaryTool - 獲取摘要
9. GetParagraphsTool - 獲取段落

**分析（3 個）**:
10. GenerateInsightTool - 生成洞見
11. AnalyzeCharacterTool - 角色分析
12. AnalyzeEventTool - 事件分析

**其他（3-6 個）**:
13. ExtractEntitiesFromTextTool
14. CompareEntitiesTool
15. GetChapterSummaryTool
16-18. (預留)

### 組合工具（3-5 個）

1. **GetEntityProfileTool** - 實體檔案（attrs + summary + paragraphs）
2. **GetEntityRelationshipTool** - 關係分析（兩實體完整信息）
3. **GetCharacterArcTool** - 角色弧線（timeline + events + analysis）
4. **CompareCharactersTool** - 角色對比
5. (預留)

📄 [完整 Description](appendix/TOOLS_CATALOG.md)

---

## 🧩 KG Schema

```
Entity Types (6): character, location, organization, object, concept, other
Relation Types (10): family, friendship, romance, enemy, ally, subordinate,
                     located_in, member_of, owns, other
```

📄 [Schema 演進備註](appendix/ADR_002_FULL.md#kg-schema-定義)

---

## 💬 ChatState 定義

```python
class ChatState(BaseModel):
    # 對話歷史
    conversation_history: List[Message] = []
    
    # 實體追蹤
    detected_entities: List[str] = []
    
    # 當前意圖
    intent: Optional[str] = None
    
    # 工具結果
    tool_results: Dict[str, Any] = {}
    
    # ===== 指代消解 =====
    current_focus_entity: Optional[str] = None
    entity_mentions: Dict[str, int] = {}
    
    # ===== 緩存 (5min) =====
    last_tool_results: Dict[str, Any] = {}
    
    # 上次查詢類型
    last_query_type: Optional[str] = None
```

📄 [完整實現](appendix/CHATSTATE_DESIGN.md)

---

## 📊 性能目標

| 路徑 | Phase 1 | Phase 2 | 緩存 |
|------|---------|---------|------|
| Map/Card | <100ms | - | 不需 |
| Chat | 3-5s | 2-3s | ChatState 5min |
| Deep Analysis | 3-5s (首次) | - | SQLite 7天 |

**優化策略**:
- 工具並行（asyncio.gather）
- 結果緩存（兩層）
- 智能工具選擇（限制集合）
- 快速路由（跳過 Agent）

---

## 📁 項目結構

```
storysphere/
├── docs/                            # 文檔
│   ├── CORE.md                      # 本文件（始終載入）
│   ├── appendix/                    # 詳細參考（按需）
│   │   ├── ADR_00X_FULL.md (9個)
│   │   ├── TOOLS_CATALOG.md
│   │   ├── CHATSTATE_DESIGN.md
│   │   ├── PYDANTIC_MODELS.md
│   │   └── ...
│   └── guides/                      # 實施指南（按 Phase）
│       ├── PHASE_1_REFACTOR.md
│       ├── PHASE_3_TOOLS.md
│       └── ...
├── src/
│   ├── config/                      # 配置
│   ├── domain/                      # 領域模型
│   ├── core/                        # 核心（LLM 客戶端等）
│   ├── services/                    # 業務邏輯
│   ├── pipelines/                   # ETL 流程
│   ├── tools/                       # Agent 工具
│   │   ├── graph_tools/
│   │   ├── retrieval_tools/
│   │   ├── analysis_tools/
│   │   └── composite_tools/
│   ├── agents/                      # Agent 實現
│   │   ├── chat_agent.py
│   │   ├── analysis_agent.py
│   │   └── states.py (ChatState)
│   └── workflows/                   # 高級工作流
├── tests/
├── pyproject.toml
└── README.md
```

---

## 🚀 開發路線（Phase 1-7）

### Phase 1: 基礎層 Refactor (2-3 週)
→ 📄 [guides/PHASE_1_REFACTOR.md](guides/PHASE_1_REFACTOR.md)

### Phase 2: Pipelines 實現 (2-3 週)
→ 📄 [guides/PHASE_2_PIPELINES.md](guides/PHASE_2_PIPELINES.md)

### Phase 2b: Keyword Extraction (1 週)
→ 📄 [guides/PHASE_2B_KEYWORDS.md](guides/PHASE_2B_KEYWORDS.md)
- **Ingestion 時觸發**（嵌入 FeatureExtractionPipeline，文檔載入即產出 keywords）
- **多策略可插拔**：`BaseKeywordExtractor` 介面 + LLM / PKE / TF-IDF / Composite
- `KeywordAggregator`（chunk → chapter → book 階層聚合）
- Qdrant metadata `keywords` + `keyword_scores` 寫入
- **Phase 5 前置條件**（CEP `top_terms` 依賴此功能）

### Phase 3: 基礎工具實現 (2-3 週) ⭐
→ 📄 [guides/PHASE_3_TOOLS.md](guides/PHASE_3_TOOLS.md)
- 實現 15-18 個基礎工具
- **精確 Description 編寫**（關鍵）
- 單元測試

### Phase 4: 組合工具 + Chat Agent (3-4 週)
→ 📄 [guides/PHASE_4_CHAT_AGENT.md](guides/PHASE_4_CHAT_AGENT.md)
- 組合工具（Sequential）
- ChatState 實現
- Chat Agent（LangGraph）

### Phase 5a: Deep Analysis — 角色分析 ✅ DONE
→ 📄 [guides/PHASE_5_DEEP_ANALYSIS.md](guides/PHASE_5_DEEP_ANALYSIS.md)
- 優先緩存邏輯（SQLite 7天 TTL）
- Pydantic + Retry (3次 + exponential backoff)
- Character Evidence Profile (CEP) extraction
- Archetype classification（Jung 12 + Schmidt 45）
- 角色弧線分析（ArcSegment）
- `AnalyzeCharacterTool` → `AnalysisAgent` → `AnalysisService`

### Phase 5b: Deep Analysis — 事件分析 ✅ DONE
→ 📄 [guides/PHASE_5B_EVENT_ANALYSIS.md](guides/PHASE_5B_EVENT_ANALYSIS.md)
- Event Evidence Profile (EEP) extraction
- 4 步 LLM pipeline（EEP → 因果分析 → 影響分析 → 摘要）
- `KGService.get_event()` 單筆查詢
- `AnalyzeEventTool` → `AnalysisAgent.analyze_event()`
- 緩存 key: `event:{document_id}:{event_id}`

### Phase 6: Parallel 優化 (1-2 週)
→ 📄 [guides/PHASE_6_OPTIMIZATION.md](guides/PHASE_6_OPTIMIZATION.md)
- asyncio.gather
- 性能測試

### Phase 7: 監控 & 調優 (持續)
→ 📄 [guides/PHASE_7_MONITORING.md](guides/PHASE_7_MONITORING.md)
- 日誌和統計
- 工具選擇準確率追蹤

### Phase 8: FastAPI 層 (2-3 週)
→ 📄 [guides/PHASE_8_API.md](guides/PHASE_8_API.md)
- **同步查詢 API** (`GET /api/v1/entities`, `/relations` 等) — <100ms
- **文件上傳 API** (`POST /api/v1/ingest`) — 觸發 IngestionWorkflow
- **Deep Analysis API** (`POST /api/v1/analysis/character|event`) — task_id + 輪詢
- **Chat WebSocket** (`WS /ws/chat`) — 流式串流
- 依賴注入（Services/Agents 單例）、錯誤處理、API 文件（OpenAPI）

**總計**: ~14-19 週

---

## 🌐 多語系策略

- **Core prompts**: 統一英文
- **Output language**: 透過 `output_language` 參數控制（`"Respond in {language}"`）
- **UI 層**: 未來 i18n 框架（不影響 core）

---

## 🎯 成功指標

| 指標 | 目標 | 測量 |
|------|------|------|
| 工具選擇準確率 | >85% | 日誌分析 |
| 結構化輸出成功率 | >98% | Pydantic 驗證 |
| 工具執行成功率 | >95% | 成功/總調用 |
| Agent 端到端成功率 | >90% | 完整流程 |
| 緩存命中率 | >60% | Cache hit / Total |
| Chat 延遲 P95 | <5s (P1), <3s (P2) | 監控 |
| 用戶滿意度 | >4/5 | 反饋 |

---

## 📖 附錄索引

### 決策文檔（ADR 完整版）
- [ADR-001: Agent 架構](appendix/ADR_001_FULL.md)
- [ADR-002: Pipelines & Workflows](appendix/ADR_002_FULL.md)
- [ADR-003: 工具層設計](appendix/ADR_003_FULL.md)
- [ADR-004: Deep Analysis](appendix/ADR_004_FULL.md)
- [ADR-005: Chat 上下文](appendix/ADR_005_FULL.md)
- [ADR-006: 性能目標](appendix/ADR_006_FULL.md)
- [ADR-007: 風險管理](appendix/ADR_007_FULL.md)
- [ADR-008: 工具選擇準確性](appendix/ADR_008_FULL.md)
- [ADR-009: Tech Stack](appendix/ADR_009_FULL.md)

### 設計細節
- [工具目錄（18-22 個完整 Description）](appendix/TOOLS_CATALOG.md)
- [ChatState 完整實現](appendix/CHATSTATE_DESIGN.md)
- [Pydantic 模型定義](appendix/PYDANTIC_MODELS.md)
- [並行化實現細節](appendix/PARALLEL_IMPL.md)
- [風險管理策略](appendix/RISK_MANAGEMENT.md)

### 實施指南（按 Phase）
- [Phase 1: Refactor](guides/PHASE_1_REFACTOR.md)
- [Phase 2: Pipelines](guides/PHASE_2_PIPELINES.md)
- [Phase 2b: Keyword Extraction](guides/PHASE_2B_KEYWORDS.md)
- [Phase 3: 工具層](guides/PHASE_3_TOOLS.md)
- [Phase 4: Chat Agent](guides/PHASE_4_CHAT_AGENT.md)
- [Phase 5a: Deep Analysis — 角色](guides/PHASE_5_DEEP_ANALYSIS.md)
- [Phase 5b: Deep Analysis — 事件](guides/PHASE_5B_EVENT_ANALYSIS.md)
- [Phase 6: Optimization](guides/PHASE_6_OPTIMIZATION.md)
- [Phase 7: Monitoring](guides/PHASE_7_MONITORING.md)
- [Phase 8: FastAPI 層](guides/PHASE_8_API.md)

---

## 🔗 快速導航

| 我想... | 查看 |
|--------|------|
| 了解決策原因 | appendix/ADR_00X_FULL.md |
| 查看工具 description | appendix/TOOLS_CATALOG.md |
| 實現 ChatState | appendix/CHATSTATE_DESIGN.md |
| 開始開發 Phase X | guides/PHASE_X_*.md |
| 查看 Tech Stack | appendix/ADR_009_FULL.md + pyproject.toml |

---

## ✅ 開發前檢查清單

- [ ] 閱讀本文件（CORE.md）
- [ ] 確認 Tech Stack（pyproject.toml）
- [ ] 審視當前 Phase 的 Guide
- [ ] 查閱相關 Appendix（按需）
- [ ] 設置開發環境
- [ ] 開始編碼

---

**維護者**: William
**最後更新**: 2026-03-07
**版本**: v2.1
**Token 估算**: ~2K tokens（始終載入）

🚀 祝開發順利！
