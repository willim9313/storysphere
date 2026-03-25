# Phase 9: 事件時間維度與全域時間線

**前置**：Phase 5b（事件分析 / EEP）完成、Phase 3（Knowledge Graph Tools）完成
**目標**：讓每個事件同時擁有「敘事位置」與「故事世界時間位置」，以 DAG 拓撲排序計算全域時序，支援前端時間維度探索與主題框架分析的時序證據需求

---

## 目錄

1. [問題定義與動機](#1-問題定義與動機)
2. [核心概念：兩套時間座標](#2-核心概念兩套時間座標)
3. [EEP 作為時序推理的基礎](#3-eep-作為時序推理的基礎)
4. [新增領域物件](#4-新增領域物件)
5. [DAG 演算法設計](#5-dag-演算法設計)
6. [兩階段 LLM Pipeline](#6-兩階段-llm-pipeline)
7. [架構與資料流](#7-架構與資料流)
8. [需建立或修改的檔案](#8-需建立或修改的檔案)
9. [API 設計](#9-api-設計)
10. [前端 UI 應用](#10-前端-ui-應用)
11. [實作路徑](#11-實作路徑)
12. [敘事理論對應](#12-敘事理論對應)

---

## 1. 問題定義與動機

### 現有限制

目前 `Event` 只有一個時間維度：

```python
chapter: int  # 事件在文本中出現的章節 = 唯一的時序依據
```

`KGService.get_entity_timeline()` 以章節號碼排序即為全部邏輯：

```python
return sorted(events, key=lambda e: e.chapter)
```

這在線性敘事中可以接受，但無法處理：

| 敘事手法 | 說明 | 章節順序 vs 故事時序 |
|---------|------|---------------------|
| 倒敘（flashback） | 角色回憶過去事件 | 章節晚 → 故事早 |
| 插敘（analepsis） | 打斷現在進度插入過去 | 章節中 → 故事前 |
| 預敘（prolepsis） | 提前揭示未來事件 | 章節早 → 故事晚 |
| 平行時間線 | 多條時間線交錯推進 | 無法以單一軸線排序 |
| 環形結構 | 結尾呼應開頭 | 章節末 ≈ 故事始 |

### 目標

1. **全域事件時間線**：讓所有事件能按故事世界時序排列，而非僅依章節號碼
2. **支援時間維度探索**：前端能提供「敘事順序」與「故事時序」兩種瀏覽視角
3. **主題框架分析的時序證據**：分析報告中的因果鏈、角色弧線能反映真實故事時序

---

## 2. 核心概念：兩套時間座標

每個事件同時存在於兩個時間軸：

```
敘事軸（Narrative Order / Sjuzhet）
  第1章 → 第2章 → 第3章 → 第4章 → 第5章
           [A]      [D←倒敘]    [B]      [C]

故事時序軸（Story Time / Fabula）
  [D] ──→ [A] ──→ [B] ──→ [C]
  （最早）              （最晚）
```

| 欄位 | 代表 | 來源 |
|------|------|------|
| `chapter` | 敘事位置（現有） | 文本章節號碼 |
| `narrative_position` | 敘事位置細排（新增） | 段落在全書中的位置 |
| `story_time_hint` | 故事時序線索（新增） | LLM 從文本提取 |
| `narrative_mode` | 敘事模式（新增） | LLM 判斷 |
| `chronological_rank` | 故事時序排名（新增） | DAG 拓撲排序計算 |

**`chronological_rank` 是派生值**，不由 LLM 直接猜測，而是從 `TemporalRelation` DAG 計算出來，確保一致性。

---

## 3. EEP 作為時序推理的基礎

`EventEvidenceProfile` 已包含數個對時序推理極有價值的欄位，**這是 Phase 9 的關鍵資產**：

### 3.1 EEP 欄位與時序推理的對應

| EEP 欄位 | 時序推理用途 |
|---------|------------|
| `prior_event_ids` | 確定此事件的「故事時序前驅事件」候選集合 |
| `subsequent_event_ids` | 確定此事件的「故事時序後繼事件」候選集合 |
| `state_before` / `state_after` | 驗證時序一致性：B 的 `state_before` 應與 A 的 `state_after` 相符 |
| `causal_factors` | 因果關係隱含時序：原因必在結果之前 |
| `structural_role` | Kernel/Satellite 區分，Kernel 事件更值得信賴作為時序錨點 |
| `event_importance` | KERNEL 事件是時序骨架，SATELLITE 事件填充細節 |

### 3.2 EEP 驅動 TemporalRelation 提取

Phase 9 的 Phase 2 LLM（全書時序推理）**優先利用 EEP 的 `prior_event_ids` / `subsequent_event_ids`** 作為候選邊集合，再由 LLM 判斷每條候選關係的：

- 類型（before / after / simultaneous / causes）
- 信心度（`confidence: float`）
- 原文依據（`evidence: str`）

這樣比從零開始要求 LLM 找出所有關係要精準得多。

### 3.3 狀態一致性驗證

```
EEP(A).state_after  應與  EEP(B).state_before  語意相符
                            ↕
            TemporalRelation: A → before → B
```

DAG 建構後可用此驗證機制過濾矛盾邊。

---

## 4. 新增領域物件

### 4.1 Event 擴充欄位

**檔案**：`src/domain/events.py`

```python
class NarrativeMode(str, Enum):
    PRESENT    = "present"      # 主線現在進行
    FLASHBACK  = "flashback"    # 倒敘（過去）
    FLASHFORWARD = "flashforward"  # 預敘（未來）
    PARALLEL   = "parallel"     # 平行時間線
    UNKNOWN    = "unknown"

class Event(BaseModel):
    # --- 現有欄位 ---
    id: str
    document_id: Optional[str] = None
    title: str
    event_type: EventType
    description: str
    chapter: int
    participants: list[str]
    location_id: Optional[str] = None
    significance: Optional[str] = None
    consequences: list[str] = []

    # --- 新增：敘事位置細排 ---
    narrative_position: Optional[int] = None
    # 全書段落位置（paragraph.position 的全局序號）
    # 用於同章節內事件的細排，以及「敘事順序」軸的精確排序

    # --- 新增：故事時序 ---
    narrative_mode: NarrativeMode = NarrativeMode.UNKNOWN
    # LLM 判斷：此段文字是現在/倒敘/預敘/平行？

    story_time_hint: Optional[str] = None
    # LLM 提取的時間線索原文，e.g. "三年前的那場戰役"、"翌日清晨"

    chronological_rank: Optional[float] = None
    # 派生值，由 GlobalTimelineService 計算
    # 範圍 0.0 ~ 1.0（全書最早 → 最晚），同時發生的事件相同值
    # None 表示尚未計算或無法推斷
```

### 4.2 TemporalRelation（全新物件）

**檔案**：`src/domain/temporal.py`（新建）

```python
from enum import Enum
from pydantic import BaseModel
from typing import Optional

class TemporalRelationType(str, Enum):
    BEFORE       = "before"        # A 明確在 B 之前
    AFTER        = "after"         # A 明確在 B 之後（建構時標準化為 BEFORE + swap）
    SIMULTANEOUS = "simultaneous"  # A 與 B 同時發生
    DURING       = "during"        # A 發生在 B 的期間內（B 的時間跨度包含 A）
    CAUSES       = "causes"        # A 導致 B（語意強版 BEFORE）
    UNKNOWN      = "unknown"       # 有提及但無法確定

class TemporalRelation(BaseModel):
    id: str                             # UUID
    document_id: str                    # 書籍 ID
    source_event_id: str                # 起點事件
    target_event_id: str                # 終點事件
    relation_type: TemporalRelationType
    confidence: float                   # 0.0 ~ 1.0，LLM 確信度
    evidence: str                       # 原文或推理依據
    derived_from_eep: bool = False      # 是否源自 EEP 的 prior/subsequent_event_ids
```

> **標準化原則**：所有 `AFTER` 關係在存入時反轉為 `BEFORE`（交換 source/target），
> 讓 DAG 邊方向統一為「時序前 → 時序後」。

---

## 5. DAG 演算法設計

### 5.1 整體流程

```
TemporalRelation 清單
        ↓
  build_temporal_dag()
  建立 NetworkX DiGraph
  節點 = Event ID
  有向邊 = BEFORE / CAUSES（隱含 BEFORE）
  邊屬性 = confidence, relation_type
        ↓
  nx.is_directed_acyclic_graph() 檢查
  → False（有環）：resolve_cycles() 移除矛盾邊
        ↓
  nx.topological_sort() 產生線性排序
  同層節點（無約束）→ 以 narrative_position 打破平局
        ↓
  normalize_ranks() 正規化為 0.0 ~ 1.0
  SIMULTANEOUS 的事件對 → 指定相同 rank
        ↓
  寫回 Event.chronological_rank
```

### 5.2 循環解決策略（resolve_cycles）

LLM 可能產生矛盾的時序判斷（A before B 且 B before A），形成有向環：

```python
def resolve_cycles(G: nx.DiGraph) -> nx.DiGraph:
    """
    逐步移除低信心邊直到 DAG。
    每次迭代：找出所有 cycle → 移除 cycle 中 confidence 最低的邊
    最壞情況 O(E²)，但實務上 LLM 矛盾邊不多
    """
    while not nx.is_directed_acyclic_graph(G):
        try:
            cycle = nx.find_cycle(G, orientation="original")
        except nx.NetworkXNoCycle:
            break
        # 找出 cycle 中信心最低的邊
        weakest = min(cycle, key=lambda e: G[e[0]][e[1]].get("confidence", 0.0))
        G.remove_edge(weakest[0], weakest[1])
    return G
```

### 5.3 排名正規化

```python
def compute_chronological_ranks(G: nx.DiGraph, events: dict[str, Event]) -> dict[str, float]:
    """
    拓撲排序 → 層次化分配 rank。
    同一拓撲層（互不約束）的事件：
      - 若 SIMULTANEOUS 關係 → 強制相同 rank
      - 否則以 narrative_position 排序，在層內細分
    """
    sorted_ids = list(nx.topological_sort(G))
    # 計算每個節點的「最長前驅路徑長度」作為層次
    layers = nx.dag_longest_path_length  # 近似計算
    # ... 正規化為 0.0 ~ 1.0
```

### 5.4 為何用 NetworkX

專案已將 NetworkX 作為 KG 的核心圖庫（`KGService` 使用 `MultiDiGraph`）。Temporal DAG 可以：

- 作為獨立的 `DiGraph`（不與實體關係圖混合）
- 使用相同的 persist/load 機制
- 利用已有的 `nx.topological_sort`、`nx.is_directed_acyclic_graph`、`nx.find_cycle`

---

## 6. 兩階段 LLM Pipeline

### Phase 1：章節 Ingestion 時（擴充現有 extraction）

**時機**：`ExtractionService.extract_relations()` 之中，每個章節處理時

**目標**：為每個抽取出的事件補充：
- `narrative_mode`（現在 / 倒敘 / 預敘 / 平行）
- `story_time_hint`（原文時間線索片段）

**Prompt 擴充方向**（加入現有 `_RELATION_SYSTEM_PROMPT`）：

```
對於每個事件，額外判斷：
- "narrative_mode": 此事件在文本中是「現在進行」(present)、
  「倒敘」(flashback)、「預敘」(flashforward)，還是「平行時間線」(parallel)？
  若無法確定則填 "unknown"。
- "story_time_hint": 文中是否有明確的時間線索描述此事件發生的時間？
  例如「三年前」「戰爭結束翌日」「她十二歲那年」。
  若無則填 null。
```

**注意**：Phase 1 只做局部判斷（單章視野），不嘗試跨章節排序。

### Phase 2：全書 Ingestion 完成後（新的 GlobalTimeline Agent）

**時機**：Ingestion workflow 的最後一步，在 KG pipeline 完成後執行

**輸入資料**：
1. 全書所有 `Event` 清單（含 `story_time_hint`、`narrative_mode`）
2. 全書所有已計算完成的 `EventEvidenceProfile`（含 `prior_event_ids`、`subsequent_event_ids`、`causal_factors`、`state_before/after`）

**任務**：對 EEP 提供的 `prior/subsequent_event_ids` 候選邊進行逐一判斷：

```
候選關係：EEP(B).prior_event_ids 中存在 A
→ 請判斷：
  1. A 與 B 的故事時序關係為何？（before/simultaneous/during/unknown）
  2. 確信度（0.0～1.0）
  3. 原文或推理依據（一句話）
```

分批處理（每批 ~20-30 個候選關係），避免 context 過長。

**EEP 不可用時的 fallback**：
若某書的 EEP 尚未計算，Phase 2 退回為僅依 `narrative_mode = flashback/flashforward` 的事件建立基本約束。

---

## 7. 架構與資料流

### 7.1 新增元件

```
src/
  domain/
    temporal.py              ← TemporalRelation, TemporalRelationType（新建）
    events.py                ← 擴充 NarrativeMode, 新欄位（修改）
  services/
    global_timeline_service.py  ← DAG 建構、cycle 解決、rank 計算（新建）
  agents/
    timeline_agent.py           ← Phase 2 LLM 編排（新建）
  pipelines/
    temporal_pipeline.py        ← 全書時序 pipeline，供 ingestion 呼叫（新建）
  tools/
    graph_tools/
      get_global_timeline.py    ← 查詢全書全域時間線的 Tool（新建）
      get_entity_timeline.py    ← 擴充，支援 chronological_rank 排序（修改）
  api/
    routers/
      books.py                  ← 新增 /books/{id}/timeline endpoint（修改）
```

### 7.2 Ingestion Workflow 擴充

**檔案**：`src/workflows/ingestion.py`

```
現有步驟：
  1. DocumentProcessingPipeline
  2. FeatureExtractionPipeline
  3. KnowledgeGraphPipeline      ← Phase 1 在此擴充
  4. DocumentService.save()
  5. KGService.save()

新增步驟（在步驟 5 之後）：
  6. TemporalPipeline.run()
     ├── 收集所有 Event + EEP
     ├── Phase 2 LLM → TemporalRelation 清單
     ├── GlobalTimelineService.build_and_rank()
     │     ├── build_temporal_dag()
     │     ├── resolve_cycles()
     │     └── compute_chronological_ranks()
     └── 將 chronological_rank 寫回 Event（透過 KGService）
```

### 7.3 資料依賴關係

```
Event（Phase 1 填入）
  narrative_mode, story_time_hint
        ↓
EventEvidenceProfile（Phase 5b 既有）
  prior_event_ids, subsequent_event_ids
  state_before, state_after, causal_factors
        ↓
Phase 2 LLM → TemporalRelation 清單
        ↓
GlobalTimelineService（DAG 演算法）
        ↓
Event.chronological_rank（寫回）
```

---

## 8. 需建立或修改的檔案

### 新建

| 檔案 | 說明 |
|------|------|
| `src/domain/temporal.py` | `TemporalRelation`, `TemporalRelationType` |
| `src/services/global_timeline_service.py` | DAG 建構、cycle 解決、rank 計算 |
| `src/agents/timeline_agent.py` | Phase 2 LLM 編排，含分批處理 |
| `src/pipelines/temporal_pipeline.py` | Ingestion 步驟 6 的 pipeline 包裝 |
| `src/tools/graph_tools/get_global_timeline.py` | 全域時間線查詢 Tool |
| `tests/services/test_global_timeline_service.py` | 純演算法測試（不含 LLM） |

### 修改

| 檔案 | 修改內容 |
|------|---------|
| `src/domain/events.py` | 加入 `NarrativeMode`、4 個新欄位 |
| `src/services/extraction_service.py` | Phase 1 prompt 擴充，解析新欄位 |
| `src/services/kg_service.py` | 支援按 `chronological_rank` 排序；儲存 TemporalRelation |
| `src/workflows/ingestion.py` | 加入步驟 6（TemporalPipeline） |
| `src/tools/graph_tools/get_entity_timeline.py` | 新增 `sort_by` 參數（`narrative` / `chronological`） |
| `src/api/routers/books.py` | 新增 `GET /books/{id}/timeline` |

---

## 9. API 設計

### 9.1 全域時間線

```
GET /api/v1/books/{book_id}/timeline
  Query params:
    order: "narrative" | "chronological"  (default: "chronological")
    event_type: str (optional filter)
    min_importance: "kernel" | "satellite" (optional filter)

Response:
  {
    "book_id": "...",
    "order": "chronological",
    "computed_at": "2026-03-25T...",
    "events": [
      {
        "event_id": "...",
        "title": "...",
        "event_type": "...",
        "chapter": 5,                    // 敘事位置
        "narrative_mode": "flashback",
        "chronological_rank": 0.12,      // 故事時序位置
        "story_time_hint": "三年前的那場戰役",
        "event_importance": "kernel",
        "participants": ["...", "..."]
      },
      ...
    ],
    "temporal_relations": [             // 可選，供前端畫關係線
      {
        "source": "event_id_a",
        "target": "event_id_b",
        "type": "before",
        "confidence": 0.92
      }
    ]
  }
```

### 9.2 實體時間線擴充

```
GET /api/v1/entities/{entity_id}/timeline
  Query params:
    order: "narrative" | "chronological"  (新增，default: "narrative" 保持向後相容)

Response: 現有 TimelineEntry 格式，加入：
  - chronological_rank: float | null
  - narrative_mode: string
```

---

## 10. 前端 UI 應用

> 前端頁面規格獨立維護於 [`docs/UI_SPEC.md`](../UI_SPEC.md)，
> 請見「**時間維度探索**」章節。
>
> 本文件僅列出 Phase 9 後端對前端的**資料契約需求**，供 API 設計參考。

### 後端對前端的資料需求摘要

| UI 功能 | 所需欄位 |
|---------|---------|
| 雙軸時間線切換 | `chapter`（敘事位置）、`chronological_rank`（故事時序） |
| 敘事模式標示 | `narrative_mode`（present / flashback / flashforward） |
| 時序連結線 | `TemporalRelation`（source、target、type、confidence） |
| 信心度視覺化 | `TemporalRelation.confidence` |
| 因果鏈視圖 | `TemporalRelation.relation_type = causes` |
| 角色弧線（真實時序） | `chronological_rank` + entity filter |

---

## 11. 實作路徑

### Step 1：純演算法層（無 LLM，可獨立測試）
- 新建 `src/domain/temporal.py`
- 擴充 `src/domain/events.py`
- 實作 `GlobalTimelineService`（build_dag、resolve_cycles、compute_ranks）
- 撰寫單元測試（手動構造假事件與假 TemporalRelation 驗證）

### Step 2：Phase 1 Extraction 擴充
- 修改 `extraction_service.py` 的 prompt 與 `_RawEvent` schema
- 加入 `narrative_mode`、`story_time_hint` 的解析
- 更新相關測試

### Step 3：KGService 擴充
- 支援儲存/讀取 `TemporalRelation`
- `get_entity_timeline()` 新增 `sort_by` 參數

### Step 4：Phase 2 LLM Agent
- 實作 `timeline_agent.py`（分批處理 EEP 候選邊）
- 實作 `temporal_pipeline.py`

### Step 5：Ingestion 串接
- `ingestion.py` 加入步驟 6

### Step 6：API + Tool
- 新增 `get_global_timeline.py` Tool
- 新增 `GET /books/{id}/timeline` 端點

### Step 7：前端
- 時間線視圖元件
- 雙軸切換邏輯
- 主題框架分析的時序證據整合

---

## 12. 敘事理論對應

| 設計元素 | 理論概念 | 來源 |
|---------|---------|------|
| `chapter` vs `chronological_rank` | Sjuzhet vs Fabula（故事 vs 論述） | Gérard Genette, *Narrative Discourse* |
| `narrative_mode: flashback/flashforward` | Analepsis / Prolepsis | Genette |
| `TemporalRelation.CAUSES` | 因果性是故事最小結構 | E.M. Forster, *Aspects of the Novel* |
| `event_importance: KERNEL/SATELLITE` | Kernel events = plot skeleton | Seymour Chatman, *Story and Discourse* |
| DAG 拓撲排序 | 因果序必為偏序（partial order） | Temporal Constraint Networks |
| `state_before/after` 一致性驗證 | State Transition Theory | 一般事件語義學 |
