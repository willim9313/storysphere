# Phase 7：監控 & 調優 (Monitoring & Tuning)

## 目標

為 StorySphere 建立輕量級可觀測性層，追蹤 ADR-006/007 定義的成功指標。

## 成功指標閾值

| 指標 | 閾值 | `get_stats()` 路徑 |
|------|------|---------------------|
| 工具選擇準確率 | >85% | 手動標記 + `tool_selection` |
| 結構化輸出解析成功率 | >98% | 未來 ExtractionService 插樁 |
| 工具執行成功率 | >95% | `tool_execution[*].success_rate` |
| Agent 端到端成功率 | >90% | `agent_query.all.success_rate` |
| 分析緩存命中率 | >60% | `cache_events[*].hit_rate` |
| Chat 延遲 P95 | <3s | `agent_query.all.latency_p95_ms` |

## 架構

### 核心模組：`src/core/metrics.py`

- **stdlib-only**：`threading`, `collections`, `contextlib`, `time`, `json`, `logging`
- **Thread-safe**：單一 `threading.Lock` 保護所有寫入
- **結構化日誌**：每個事件 emit 一條 JSON-line 到 `storysphere.metrics` logger
- **單例**：`get_metrics()` 雙重檢查鎖，與 `get_settings()` 同模式

### 插樁位置

| 文件 | 方法 | 記錄內容 |
|------|------|---------|
| `agents/chat_agent.py` | `chat()` | `record_agent_query` (success/failure + latency) |
| `agents/chat_agent.py` | `_agent_invoke()` | `record_tool_selection` (agent_loop, per ToolMessage) |
| `agents/chat_agent.py` | `_fast_route()` | `record_tool_selection` (fast_route + query_pattern) |
| `agents/analysis_agent.py` | `analyze_character()` | `record_cache_event` + `record_tool_execution` |
| `agents/analysis_agent.py` | `analyze_event()` | `record_cache_event` + `record_tool_execution` |

## API 速查

```python
from core.metrics import get_metrics

m = get_metrics()

# 記錄工具選擇
m.record_tool_selection("get_entity_profile", source="fast_route", query_pattern="entity_info")

# 記錄工具執行
m.record_tool_execution("get_entity_profile", success=True, latency_ms=342.1)
m.record_tool_execution("get_entity_profile", success=False, latency_ms=50.0, error="ValueError")

# 記錄緩存事件
m.record_cache_event("character", hit=True, cache_key="character:doc-1:alice")
m.record_cache_event("event", hit=False)

# 記錄 Agent 查詢
m.record_agent_query(success=True, latency_ms=1800.5, route="agent_loop")

# Timer context manager（自動記錄 latency + success/failure）
with m.timer("tool_execution", "my_tool"):
    result = await tool.arun(...)

# 查詢統計快照
stats = m.get_stats()
```

## JSON-line 日誌格式

設定 `storysphere.metrics` logger 輸出到文件或 stdout：

```python
import logging
logging.getLogger("storysphere.metrics").setLevel(logging.INFO)
```

每個事件輸出一行 JSON：

```json
{"event": "tool_selection", "tool_name": "get_entity_profile", "source": "fast_route", "query_pattern": "entity_info", "ts": 1741564800.123}
{"event": "tool_execution", "tool_name": "get_entity_profile", "success": true, "latency_ms": 342.1, "ts": 1741564800.456}
{"event": "cache_event", "cache_type": "character", "hit": true, "cache_key": "character:doc-1:alice", "ts": 1741564800.789}
{"event": "agent_query", "success": true, "latency_ms": 1800.5, "route": "agent_loop", "ts": 1741564801.234}
```

## `get_stats()` 輸出結構

```python
{
    "tool_selection": {
        "get_entity_profile": {"total": 42, "fast_route": 10, "agent_loop": 32}
    },
    "tool_execution": {
        "get_entity_profile": {
            "total": 42, "success": 40, "failure": 2,
            "success_rate": 0.952,
            "latency_p50_ms": 320.5,
            "latency_p95_ms": 890.2,
            "latency_p99_ms": 1200.0,
        },
        "analyze_character": {...},
        "analyze_event": {...},
    },
    "cache_events": {
        "character": {"total": 20, "hit": 15, "miss": 5, "hit_rate": 0.75},
        "event": {"total": 10, "hit": 7, "miss": 3, "hit_rate": 0.70},
    },
    "agent_query": {
        "all": {
            "total": 100, "success": 92, "failure": 8,
            "success_rate": 0.92,
            "latency_p50_ms": 1500.0,
            "latency_p95_ms": 2800.0,
            "latency_p99_ms": 3200.0,
            "routes": {"fast_route": 30, "agent_loop": 70},
            "errors": {"RuntimeError": 5, "TimeoutError": 3},
        }
    },
}
```

## HTTP API（B-006）

`GET /api/v1/metrics` 直接暴露 `get_stats()` 快照，永遠回傳 200。

```bash
curl http://localhost:8000/api/v1/metrics | python -m json.tool
```

**回應結構**與 `get_stats()` 相同（見上方）。

實作：`src/api/routers/metrics.py`

---

## 驗證指令

```bash
# Metrics 單元測試
uv run pytest tests/core/test_metrics.py -v

# 全部單元測試（確保插樁未破壞現有邏輯）
uv run pytest -m "not integration" --tb=short

# 預期：331+ tests passing
```

## 閾值檢查範例

```python
stats = get_metrics().get_stats()

# 工具執行成功率 >95%
for tool, data in stats["tool_execution"].items():
    assert data["success_rate"] > 0.95, f"{tool} 執行成功率過低: {data['success_rate']:.1%}"

# Agent 端到端成功率 >90%
agent_stats = stats["agent_query"]["all"]
assert agent_stats["success_rate"] > 0.90

# Chat 延遲 P95 <3000ms
assert agent_stats["latency_p95_ms"] < 3000

# 分析緩存命中率 >60%
for cache_type, data in stats["cache_events"].items():
    if data["total"] > 10:
        assert data["hit_rate"] > 0.60, f"{cache_type} 緩存命中率過低: {data['hit_rate']:.1%}"
```

## 未來擴展（Phase 8+）

- **ExtractionService 插樁**：追蹤結構化輸出解析成功率（>98% 閾值）
- **Prometheus 匯出**：`MetricsCollector.export_prometheus()` → 在 `/api/v1/metrics` 基礎上新增 Prometheus text format 輸出
- **告警**：當 `success_rate` 低於閾值時發送告警（webhook/email）
- **持久化**：將 `get_stats()` 快照定期寫入 SQLite 或 JSON 文件
