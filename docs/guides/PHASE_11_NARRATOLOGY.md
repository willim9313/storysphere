# Phase 11 — Narratology Analysis

**理論基礎**: 查特曼（Kernel/Satellite）、坎伯（英雄旅程）、熱奈特（時序）
**完成日期**: 2026-04-02
**相關 Backlog**: B-031 ~ B-038

---

## 概覽

敘事學模組提供三條平行的結構分析路徑：

| 路徑 | 核心問題 | 主要輸出 |
|------|----------|----------|
| **Kernel/Satellite** | 哪些事件是情節骨幹？ | `narrative_weight` 欄位 + kernel spine |
| **英雄旅程** | 這本書對應旅程的哪些階段？ | `HeroJourneyStage` 列表 |
| **熱奈特時序** | 文本時間和故事時間有多少落差？ | `TemporalAnalysis` + displacement 列表 |

---

## 架構

```
src/
├── domain/
│   ├── events.py              # Event 模型（narrative_weight, story_time_hint, story_time）
│   └── narrative.py           # NarrativeStructure, HeroJourneyStage,
│                              # TemporalAnalysis, TemporalDisplacement, ...
├── services/
│   └── narrative_service.py   # NarrativeService（所有分析邏輯）
├── config/
│   ├── hero_journey.py        # Campbell 12 階段 loader
│   └── hero_journey/
│       ├── hero_journey_en.json
│       └── hero_journey_zh.json
├── agents/
│   └── analysis_agent.py      # analyze_narrative() 入口
└── api/
    ├── routers/narrative.py   # /api/v1/narrative/* 端點
    └── schemas/narrative.py   # Request schemas
```

---

## 快速開始

### 1. Kernel/Satellite 兩階段分類

```bash
# 第一階段：啟發式分類（快，無 LLM）
curl -X POST http://localhost:8000/api/v1/narrative/classify \
  -H "Content-Type: application/json" \
  -d '{"document_id": "YOUR_BOOK_ID"}'
# → {"task_id": "...", "status": "pending"}

# 輪詢結果
curl http://localhost:8000/api/v1/narrative/classify/{task_id}

# 第二階段：LLM 細化（對 satellite 事件再判斷）
curl -X POST http://localhost:8000/api/v1/narrative/refine \
  -H "Content-Type: application/json" \
  -d '{"document_id": "YOUR_BOOK_ID", "language": "zh"}'
```

**分類邏輯（Phase 1 啟發式）**：
- Event 標題出現在書級摘要 → kernel（confidence 0.85）
- Event 標題出現在章節摘要 → kernel（confidence 0.65）
- 未出現在任何摘要 → satellite（confidence 0.60）

**LLM 細化（Phase 2）**：
- 預設對所有 satellite 進行 LLM 二次判斷
- 判斷邏輯：「刪去此事件，後續因果鏈是否仍成立？」
- LLM 與啟發式衝突時 LLM 優先；分歧記錄於 WARNING log

### 2. 查詢情節骨幹

```bash
# 取得 kernel 事件列表（按章節 + narrative_position 排序）
curl "http://localhost:8000/api/v1/narrative/kernel-spine?book_id=YOUR_BOOK_ID"
```

### 3. 英雄旅程映射

```bash
# 觸發 Campbell 12 階段映射
curl -X POST http://localhost:8000/api/v1/narrative/hero-journey \
  -H "Content-Type: application/json" \
  -d '{"document_id": "YOUR_BOOK_ID", "language": "zh"}'

# 輪詢
curl http://localhost:8000/api/v1/narrative/hero-journey/{task_id}
```

**設計決策**：
- 章節範圍允許相鄰階段重疊（`chapter_range` 為列表）
- 無明確文本證據的階段直接省略（不強迫 12 階段全部出現）
- 多主角作品映射為整體旅程，角色對應記錄在 `notes` 欄位

### 4. 完整分析（AnalysisAgent 入口）

```python
# 從 Python / 其他 Agent 調用
result = await analysis_agent.analyze_narrative(
    document_id="YOUR_BOOK_ID",
    language="zh",
)
# result = {
#   "narrative_structure": {...},   # NarrativeStructure dict
#   "hero_journey_stages": [...],   # HeroJourneyStage list
# }
```

此方法依序執行：heuristic → LLM refine → hero journey。

### 5. 查詢結構快照

```bash
# 取得完整 NarrativeStructure（需先執行 classify）
curl "http://localhost:8000/api/v1/narrative?book_id=YOUR_BOOK_ID"

# HITL 審核
curl -X PATCH http://localhost:8000/api/v1/narrative/YOUR_BOOK_ID/review \
  -H "Content-Type: application/json" \
  -d '{"review_status": "approved"}'
```

---

## 熱奈特時序分析（B-037）

> ⚠️ **前置條件**：需要 ≥ 60% 的 Event 節點有 `story_time_hint`（ingestion 時自動收集）。

### 確認覆蓋率

```bash
curl "http://localhost:8000/api/v1/narrative/temporal/coverage?book_id=YOUR_BOOK_ID"
# → {
#     "total_events": 85,
#     "events_with_hint": 52,
#     "coverage": 0.612,
#     "coverage_sufficient": true
#   }
```

### 觸發時序分析

```bash
curl -X POST http://localhost:8000/api/v1/narrative/temporal \
  -H "Content-Type: application/json" \
  -d '{"document_id": "YOUR_BOOK_ID", "language": "zh"}'

curl http://localhost:8000/api/v1/narrative/temporal/{task_id}
```

### 輸出解讀

```json
{
  "story_time_structure": "partially_linear",
  "coverage": 0.612,
  "coverage_sufficient": true,
  "analepsis_event_ids": ["evt-abc", "evt-def"],
  "prolepsis_event_ids": [],
  "displacements": [
    {
      "event_id": "evt-abc",
      "title": "主角回憶童年",
      "chapter": 5,
      "text_rank": 20,
      "story_rank": 3,
      "displacement": -17,
      "displacement_type": "analepsis",
      "story_time_hint": "多年前"
    }
  ]
}
```

- `displacement < 0`：倒敘（analepsis）—— 此事件在文本中出現的時間晚於其故事世界的時間
- `displacement > 0`：預敘（prolepsis）—— 此事件在文本中出現的時間早於其故事世界的時間
- `|displacement| < 3`：視為線性（閾值可在 `_compute_displacements` 中調整）

---

## 資料流

```
ingestion
  └─ extraction_service.py
       └─ story_time_hint: str | None   ← 文本中的時間線索（如「三年前」）

narrative/classify  →  Event.narrative_weight = "kernel" | "satellite"
                        Event.narrative_weight_source = "summary_heuristic"

narrative/refine    →  Event.narrative_weight (updated)
                        Event.narrative_weight_source = "llm_classified"

narrative/hero-journey  →  NarrativeStructure.hero_journey_stages

narrative/temporal  →  Event.story_time.relative_order (updated)
                        TemporalAnalysis (cached)
```

---

## 持久化

所有分析結果透過 `AnalysisCache`（SQLite）持久化：

| Cache Key | 內容 |
|-----------|------|
| `narrative_structure:{document_id}` | `NarrativeStructure`（含 kernel/satellite 列表、hero journey stages） |
| `hero_journey:{document_id}` | `HeroJourneyStage` 列表（獨立快取） |
| `temporal_analysis:{document_id}` | `TemporalAnalysis`（displacement 列表、結構分類） |

`Event.narrative_weight` 和 `Event.story_time` 只更新 KGService 的 in-memory 物件，重啟後需重新執行分析。

---

## 開放問題（待後續評估）

1. **Kernel 準確率驗證**：建議用一本已知結構的小說手動驗證 Phase 1 + Phase 2 的分類結果，特別是「出現在章節摘要但語義上是 satellite」的邊界案例。

2. **時序覆蓋率不足的作品**：`story_time_hint` 覆蓋率 < 60% 時，`analyze_temporal_order` 會直接回傳 `coverage_sufficient: false`，不執行 LLM 排序。可考慮降低閾值或讓分析者手動觸發。

3. **多主角英雄旅程**：目前以整體旅程映射，角色對應放在 `notes`。若需要分角色映射，需擴充 `HeroJourneyStage` schema。

4. **KGService 持久化**：`narrative_weight` 和 `story_time` 更新目前只在 in-memory 有效，重啟後需重跑。長期建議加入 KGService 的持久化機制。
