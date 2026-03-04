# ADR-009: Tech Stack 選擇

**狀態**: ✅ Approved  
**日期**: 2026-02-22  
**決策者**: William, AI Architect

---

## 背景 (Context)

StorySphere 需要確定完整的技術棧，支持：
- Agent-Driven 架構（LangChain + LangGraph）
- 多種數據存儲（關係型、向量、圖）
- 異步任務處理（Deep Analysis）
- WebSocket 實時推送
- 輕量部署（用戶友好）
- 可選擴展（生產環境）

---

## 決策 (Decision)

採用 **MVP 輕量 → 生產可選升級** 策略

### 核心框架
```python
LangChain ^0.1.0          # Agent 框架
LangGraph ^0.0.20         # 狀態機
Pydantic ^2.0             # 數據驗證
tenacity ^8.0             # 重試機制
```

### LLM 提供商
```python
Primary: Gemini (google-generativeai ^0.4.0)  # ⭐ 用戶要求
Fallback: OpenAI (openai ^1.0)
Fallback: Anthropic (anthropic ^0.18)
```

**原因**：
- Gemini: 性價比高，中文支持好
- OpenAI: 備選，成熟穩定
- Anthropic: Claude 作為第二備選

### Web 框架
```python
FastAPI ^0.110            # API 框架
uvicorn ^0.27             # ASGI 服務器
websockets ^12.0          # WebSocket 支持 ⭐
```

**原因**：
- FastAPI: 異步原生，自動 OpenAPI 文檔
- WebSocket: Deep Analysis 進度推送

### 數據存儲

#### 關係型（輕量優先）
```python
SQLite (內建)             # 開發/小規模 ⭐ 默認
→ PostgreSQL (可選)       # 多用戶/生產
```

**原因**：
- SQLite: 零配置，用戶友好
- 數據量小（摘要、緩存），SQLite 夠用
- 需要時可升級 PostgreSQL

#### 向量數據庫
```python
Qdrant (qdrant-client ^1.7)  # 已有
```

#### 知識圖譜（雙模式）⭐
```python
# 默認模式
NetworkX ^3.0             # 內存圖（輕量）
+ JSON 持久化             # 保存到檔案

# 可選模式（Docker）
Neo4j ^5.0                # 圖資料庫（大規模備案）
```

**切換邏輯**：
```python
class KGConfig:
    mode: Literal["networkx", "neo4j"] = "networkx"
    neo4j_uri: str = "bolt://localhost:7687"
    
    # 自動切換條件
    auto_switch_threshold: int = 10_000  # 實體數
```

**原因**：
- NetworkX: 開發快，部署簡單，<10K 實體夠用
- Neo4j: Docker 部署，僅在大規模時啟用
- 統一接口（KGService），切換透明

### 緩存 & 任務

#### 緩存
```python
# ChatState 緩存（5min TTL）
內存 dict                 # 簡單，單實例 ⭐

# Deep Analysis 緩存（7天）
SQLite                    # 持久化
```

**原因**：
- 內存: 5min 緩存不需持久化
- SQLite: 7天緩存需持久化，但量不大

**可選升級**：
```python
Redis ^5.0                # 分散式緩存（多實例）
```

#### 任務隊列
```python
FastAPI BackgroundTasks   # 內建 ⭐ 默認
```

**原因**：
- 簡單，無需額外服務
- Deep Analysis 頻率低（每天 <100 次）
- 重啟丟失任務可接受（用戶重新觸發）

**可選升級**：
```python
RQ (Redis Queue)          # 輕量任務隊列
Celery                    # 完整功能（複雜）
```

### 文檔處理
```python
pypdf ^4.0                # PDF 解析
python-docx ^1.1          # DOCX 解析
```

### 監控
```python
# MVP 階段
Python logging + 文件日誌
簡單統計（存 SQLite）

# 生產階段（可選）
Prometheus + Grafana
LangSmith (LangChain 官方，付費)
```

---

## 根據 (Rationale)

### 1. 輕量優先
- SQLite + 內存緩存 + FastAPI BackgroundTasks
- **零額外服務**（除 Qdrant）
- 用戶友好（一鍵部署）

### 2. 可選升級
- 所有組件都有升級路徑
- 根據實際需求決定
- 不強制使用複雜方案

### 3. 雙模式設計（NetworkX ↔ Neo4j）
- 開發快速（NetworkX）
- 擴展性保留（Neo4j）
- 統一接口（切換透明）

### 4. WebSocket vs SSE
- **選擇 WebSocket**：雙向通信（未來可能需要）
- FastAPI 原生支持
- SSE 僅單向推送，擴展性受限

---

## 後果 (Consequences)

### 優點
✅ 零額外服務（開發/小規模）  
✅ 部署簡單（用戶友好）  
✅ 功能完整（所有需求都滿足）  
✅ 可擴展（有升級路徑）  
✅ 成本可控（LLM 為主要成本）

### 限制
⚠️ SQLite: 不支持高並發寫入（但讀多寫少，可接受）  
⚠️ 內存緩存: 單實例，重啟丟失（但 5min TTL，影響小）  
⚠️ BackgroundTasks: 重啟丟失任務（可接受，用戶重新觸發）  
⚠️ NetworkX: 大規模圖（>10K 實體）性能下降（但可切換 Neo4j）

### 升級路徑

**階段 1: MVP（默認配置）**
```
SQLite + NetworkX + 內存緩存 + BackgroundTasks
→ 支持：單機、小規模、開發/測試
```

**階段 2: 生產（可選升級）**
```
PostgreSQL + NetworkX + Redis + RQ
→ 支持：多用戶、中規模、生產環境
```

**階段 3: 規模化（全面升級）**
```
PostgreSQL + Neo4j + Redis + Celery + Prometheus
→ 支持：大規模、高可用、企業級
```

---

## 舊版演進備註

### Multi-LLM Client 演進
舊版用自建 Adapter Pattern（`GeminiClient`, `OpenAIClient`, `OllamaClient`），每個 client 實現統一介面。新版改用 LangChain 統一接口（`langchain-google-genai`, `langchain-openai`, `langchain-anthropic`），透過 `LLMClient` factory 建構，不再需要自建 client classes。

### 文檔處理演進
舊版用 LlamaIndex `SimpleDirectoryReader`（引入大量依賴），新版改用 `pypdf` + `python-docx` 直接處理（減少依賴，更可控）。

### Token Counting（Phase 7 備案）
舊版有 `TokenCounterFactory`：TikToken for OpenAI、Gemini API counter with local fallback。新版 Phase 7 監控階段可考慮移植，用於 LLM 成本追蹤和 prompt 長度管理。

### 章節偵測
舊版 `ChapterExtractor` 有 7 種 regex pattern，支持中英文章節標題偵測（如「第X章」、「Chapter X」、「卷X」等）。新版 `chapter_detector.py` 應確認已涵蓋這些 pattern。

---

## 實施細節

### 安裝依賴
```bash
# 使用 uv（推薦）⭐
uv sync                    # 安裝所有依賴（含 dev）
uv sync --no-dev           # 僅安裝生產依賴

# 新增依賴
uv add <package>           # 生產依賴
uv add --dev <package>     # 開發依賴
```

### 環境變量（.env）
```bash
# LLM API Keys
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key  # 可選
ANTHROPIC_API_KEY=your_anthropic_key  # 可選

# 數據庫
DATABASE_URL=sqlite:///./storysphere.db  # SQLite
# DATABASE_URL=postgresql://user:pass@localhost/storysphere  # PostgreSQL（可選）

# 知識圖譜模式
KG_MODE=networkx  # 或 neo4j
NEO4J_URI=bolt://localhost:7687  # Neo4j（可選）
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Qdrant
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your_qdrant_key  # 可選

# 日誌
LOG_LEVEL=INFO
LOG_FILE=logs/storysphere.log
```

### Docker Compose（可選，Neo4j）
```yaml
version: '3.8'
services:
  neo4j:
    image: neo4j:5.0
    ports:
      - "7474:7474"  # HTTP
      - "7687:7687"  # Bolt
    environment:
      NEO4J_AUTH: neo4j/password
    volumes:
      - neo4j_data:/data

volumes:
  neo4j_data:
```

### KG 雙模式實現
```python
# config/kg_config.py
class KGConfig(BaseSettings):
    mode: Literal["networkx", "neo4j"] = "networkx"
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "password"
    auto_switch_threshold: int = 10_000

# services/kg_service.py
class KGService:
    def __init__(self, config: KGConfig):
        if config.mode == "networkx":
            self.backend = NetworkXBackend()
        else:
            self.backend = Neo4jBackend(
                uri=config.neo4j_uri,
                user=config.neo4j_user,
                password=config.neo4j_password
            )
    
    # 統一接口
    def get_entity(self, entity_id: str): ...
    def get_relations(self, source: str, target: str): ...
    def add_entity(self, entity: Entity): ...
    
    # 自動切換檢查
    def check_auto_switch(self):
        if self.backend.entity_count() > self.config.auto_switch_threshold:
            logger.warning(f"實體數超過 {self.config.auto_switch_threshold}，建議切換到 Neo4j")
```

---

## 成本估算

### LLM 成本（主要）
```
Chat Query (Gemini):
- 平均 2000 tokens
- 成本：~$0.002/query
- 1000/day → $60/month

Deep Analysis (Gemini):
- 平均 4500 tokens
- 成本：~$0.008/analysis
- 100/day → $24/month

總計：~$84/month（考慮緩存後 ~$50/month）
```

### 基礎設施成本
```
SQLite + NetworkX: $0（本地）
Qdrant: $0（本地部署）或 $25/month（雲端）

可選升級：
PostgreSQL: $25/month（AWS RDS Micro）
Redis: $15/month（AWS ElastiCache）
Neo4j: $65/month（Neo4j Aura Starter）

總計：
- MVP: ~$50/month（僅 LLM）
- 生產: ~$115/month（LLM + PG + Redis）
- 規模化: ~$180/month（全部服務）
```

---

## 決策檢查清單

### 已決定
- [x] Agent 框架: LangChain + LangGraph
- [x] LLM: Gemini (Primary)
- [x] Web 框架: FastAPI + WebSocket
- [x] 關係型: SQLite（默認）→ PostgreSQL（可選）
- [x] 知識圖譜: NetworkX（默認）↔ Neo4j（可選）
- [x] 緩存: 內存 + SQLite
- [x] 任務隊列: FastAPI BackgroundTasks
- [x] 文檔處理: pypdf + python-docx
- [x] 監控: Python logging（MVP）

### 待決定（未來）
- [ ] 用戶認證方案（如需多用戶）
- [ ] 文件上傳存儲（本地 / S3）
- [ ] 部署方案（Docker / K8s）
- [ ] CI/CD 流程

---

## 版本歷史

| 版本 | 日期 | 變更 |
|------|------|------|
| 1.0 | 2026-02-22 | 初版：確定 MVP Tech Stack |

---

## 相關文檔

- [pyproject.toml](../../pyproject.toml) - 完整依賴配置
- [CORE.md](../CORE.md) - 核心設計文檔
- [PHASE_1_REFACTOR.md](../guides/PHASE_1_REFACTOR.md) - 環境設置

---

**最後更新**: 2026-02-22  
**狀態**: ✅ Approved  
**維護者**: William
