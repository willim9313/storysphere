# 事件節點化：現況調查與開發筆記

## 現況

### 事件的資料結構 (`src/domain/events.py`)

```
Event:
  id, document_id, title, event_type, description,
  chapter, participants (entity IDs), location_id,
  significance, consequences
```

EventType 有 10 種：plot, conflict, revelation, turning_point, meeting, battle, death, romance, alliance, other

### 事件目前的存放方式

- 存在 `KGService._events` dict（記憶體內），不是 graph node
- 透過 `add_event()` 把 event ID 掛到參與者（entity node）的 `event_ids` 屬性上
- `participants` 通常只有角色，地點是透過 `event.location_id` 單獨關聯，不在 participants 裡
- 事件在 ingestion 的 Step 3（`RelationExtractor.extract()`）與 relations 一起逐章節抽取

### 圖譜現況

- graph endpoint (`GET /books/:bookId/graph`) 只從 `kg.list_entities()` 取 node
- Entity types: character, location, organization, object, concept, other
- 事件完全不出現在圖譜上
- 前端 `GraphCanvas` 的 node 樣式只處理以上 entity types

### 事件分析頁現況

- `GET /books/:bookId/analysis/events` 從 `kg.get_events()` 取事件列表
- 事件分析使用 `EventAnalysisResult` model（含 EEP、causality、impact、summary）
- 分析結果存在 `AnalysisCache`，key 格式：`event:{book_id}:{event_id}`

## 需要做的事（待規劃）

### 後端

1. **graph endpoint 加入 event nodes**
   - 從 `kg.get_events(document_id=book_id)` 取事件
   - 組成 GraphNode（type="event"）加入 nodes
   - 根據 `event.participants` 建立 event→entity 的 edges
   - 根據 `event.location_id` 建立 event→location 的 edge

2. **GraphNode / GraphEdge response model**
   - GraphNode 的 `type` 需支援 "event"
   - 可能需要額外欄位（event_type, chapter 等）給前端做篩選

### 前端

1. **GraphCanvas 支援 event node 樣式**
   - 新的 node 形狀或顏色區分事件
   - 前端 `EntityType` type 需加 "event"

2. **篩選/開關功能**
   - 圖譜工具列加 toggle 按鈕，可開關事件 node 的顯示
   - 避免事件過多（本書有 22 個）導致圖譜解讀混亂
   - 可考慮按 event_type 分類篩選

3. **點擊事件 node 的互動**
   - 顯示事件詳情 panel（類似 EntityDetailPanel）
   - 可連結到事件分析頁

## 相關檔案

| 檔案 | 用途 |
|---|---|
| `src/domain/events.py` | Event model 定義 |
| `src/services/kg_service.py:147-162` | add_event / get_event |
| `src/pipelines/knowledge_graph/pipeline.py:115-147` | 事件抽取流程 |
| `src/api/routers/books.py:625-665` | graph endpoint |
| `src/api/routers/books.py:761-814` | event analysis list endpoint |
| `frontend/src/api/types.ts` | GraphNode / EntityType types |
| `frontend/src/components/graph/GraphCanvas.tsx` | 圖譜渲染 |
| `frontend/src/components/graph/GraphToolbar.tsx` | 圖譜工具列 |
| `frontend/src/components/graph/EntityDetailPanel.tsx` | 實體詳情面板 |
