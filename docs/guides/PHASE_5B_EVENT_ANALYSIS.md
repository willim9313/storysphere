# Phase 5b: 事件分析實施指南 (Event Analysis)

**前置**: Phase 5a（角色分析）完成、Phase 4（Chat Agent）完成
**目標**: 實作 `EventAnalysisResult`，使用事件證據檔案（EEP）、4 步驟 LLM pipeline，以及快取優先的 AnalysisAgent 整合，填補現有的 `AnalyzeEventTool` stub

---

## 目錄

1. [概覽與設計理念](#1-概覽與設計理念)
2. [核心概念：事件證據檔案（EEP）](#2-核心概念事件證據檔案eep)
3. [分析 Pipeline：4 個 LLM 子步驟](#3-分析-pipeline4-個-llm-子步驟)
4. [Pydantic Models](#4-pydantic-models)
5. [快取策略](#5-快取策略)
6. [Prompt 設計](#6-prompt-設計)
7. [資料流程圖](#7-資料流程圖)
8. [需建立或修改的檔案](#8-需建立或修改的檔案)
9. [實作注意事項與陷阱](#9-實作注意事項與陷阱)
10. [測試計畫](#10-測試計畫)
11. [敘事理論對應](#11-敘事理論對應)

---

## 1. 概覽與設計理念

### 事件分析產出什麼

事件分析生成 `EventAnalysisResult`——對單一敘事事件的結構化深度分析。核心是**事件證據檔案（EEP, Event Evidence Profile）**，其架構與 Phase 5a 的 CEP（角色證據檔案）對應，但聚焦於狀態轉換與因果鏈，而非人格原型。

最終輸出回答四個問題：

- **發生了什麼變化？**（`state_before` → `state_after`）
- **為什麼會發生？**（導致此事件的因果鏈）
- **之後發生了什麼？**（直接 + 下游後果，透過時間軸識別）
- **誰受到影響，如何受影響？**（參與者角色分解）

### 與角色分析的差異

| 維度 | 角色分析（5a） | 事件分析（5b） |
|------|--------------|--------------|
| 分析對象 | 單一實體（角色） | 單一事件 |
| 核心檔案 | CEP（行動、特質、關係） | EEP（狀態、原因、後果） |
| 原型分類 | Jung（12）+ Schmidt（45） | 無——改用結構性角色 |
| 發展軸 | 跨章節的角色弧線 | 跨章節的因果鏈 |
| 主要 KG 查詢 | `get_entity_timeline()` | `get_events()` + 參與者時間軸 |
| LLM 子步驟 | 4（CEP + 原型 + 弧線 + 摘要） | 4（EEP + 因果 + 影響 + 摘要） |

### 使用的資料來源

1. **KGService**：事件物件（標題、類型、描述、章節、參與者、後果）
2. **KGService**：參與者實體 + 其關係圖
3. **KGService**：參與者事件時間軸（用於識別因果與後續事件）
4. **VectorService**：文本證據段落（對事件關鍵字做語意搜尋）
5. **KeywordService** *(可選)*：章節級關鍵字，提供主題脈絡

---

## 2. 核心概念：事件證據檔案（EEP）

EEP 是在 LLM 分析**之前**組裝的結構化證據包。從 KG 結構化資料與向量文本檢索建立，然後作為 grounding context 傳入 LLM prompts。

### EEP 欄位

```python
class EventEvidenceProfile(BaseModel):
    # 狀態轉換（事件理論核心）
    state_before: str                        # 事件前的世界/角色狀態（推斷）
    state_after: str                         # 事件後的世界/角色狀態（推斷）

    # 因果證據
    causal_factors: list[str]                # 導致此事件的因素描述
    prior_event_ids: list[str]               # 涉及相同參與者的早期事件 IDs

    # 參與者分析
    participant_roles: list[ParticipantRole] # 每個參與者實體各一筆

    # 後果證據
    consequences: list[str]                  # 來自 Event.consequences + 推斷內容
    subsequent_event_ids: list[str]          # 涉及相同參與者的後續事件 IDs

    # 結構分析
    structural_role: str                     # 如 "Turning Point"、"Inciting Incident"
    event_importance: EventImportance        # KERNEL 或 SATELLITE

    # 主題層
    thematic_significance: str              # 基調、主題、象徵意義（1-2 句）

    # 文本證據
    text_evidence: list[str]                # 來自 VectorService 的原文段落（去除 metadata，最多 8 條）
    key_quotes: list[str]                   # LLM 從原文中提取的 2-4 條精華引文（對白或關鍵描寫）
    top_terms: dict[str, float]             # 關鍵字與分數（來自 KeywordService）
```

### 敘事理論基礎

EEP 欄位直接對應敘事理論概念（見 `event_analysis.md`）：

| EEP 欄位 | 理論概念 | 來源 |
|----------|----------|------|
| `state_before/after` | 狀態轉換（State Transition） | Gérard Genette |
| `causal_factors` | 因果性（cause + motivation） | E. M. Forster |
| `participant_roles` | 角色在事件中的位置 | Role theory |
| `structural_role` | 事件結構功能 | Vladimir Propp |
| `event_importance` | Kernel vs Satellite | Seymour Chatman |
| `key_quotes` | 具體文本錨點（對白、場景描寫） | Close reading |
| `thematic_significance` | 主題 + 象徵意義 | 一般敘事學 |

---

## 3. 分析 Pipeline：4 個 LLM 子步驟

### 流程概覽

```
analyze_event(event_id, document_id)
  ├── Step 1: _extract_eep()             → EventEvidenceProfile
  ├── Step 2: _analyze_causality()       → CausalityAnalysis
  ├── Step 3: _analyze_impact()          → ImpactAnalysis
  └── Step 4: _generate_event_summary()  → EventSummary
  └── _compute_event_coverage()          → EventCoverageMetrics  [無 LLM]
```

所有 LLM 步驟使用 `@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=5))`。

---

### Step 1：`_extract_eep(event_id, document_id)` → `EventEvidenceProfile`

**目的**：組裝結構化證據 + 執行 LLM 填入 EEP 欄位。

**資料收集**（LLM 呼叫前）：
```python
# 1. 取得事件
event = await kg_service.get_event(event_id)  # 需新增此方法

# 2. 取得參與者實體
participants = [
    await kg_service.get_entity(pid)
    for pid in event.participants
]

# 3. 透過參與者時間軸找出前後事件
timelines = [
    await kg_service.get_entity_timeline(pid)
    for pid in event.participants
]
prior_events      = [e for e in flatten(timelines) if e.chapter < event.chapter]
subsequent_events = [e for e in flatten(timelines) if e.chapter > event.chapter]

# 4. 向量搜尋文本證據
chunks = await vector_service.search(
    query=f"{event.title} {event.description}",
    top_k=10,
    document_id=document_id,
)

# 5. 關鍵字（可選）
top_terms = {}
if keyword_service:
    top_terms = await keyword_service.get_chapter_keywords(document_id, event.chapter)
```

**LLM 呼叫**：Prompt 接收事件元資料 + 參與者名稱 + 前後事件列表 + 文本段落 → 回傳 state_before、state_after、causal_factors、participant_roles、structural_role、event_importance、thematic_significance 的 JSON。

---

### Step 2：`_analyze_causality(eep, event)` → `CausalityAnalysis`

**目的**：建構敘事因果鏈——是什麼事件序列與條件導致了此事件。

**資料**：使用 `eep.prior_event_ids` + `eep.causal_factors` + 參與者關係脈絡。

**LLM 呼叫**：根據 EEP 因果證據，要求 LLM：
1. 識別**根本原因**（最早可追溯的原因）
2. 將**因果鏈**排列為敘事序列
3. 識別哪些先前事件是**觸發事件**（直接原因）
4. 撰寫**因果鏈摘要**（2-3 句）

**輸出**：
```python
class CausalityAnalysis(BaseModel):
    root_cause: str                  # 最早可識別的原因
    causal_chain: list[str]          # 導向事件的有序敘事步驟
    trigger_event_ids: list[str]     # 直接觸發事件（prior_event_ids 的子集）
    chain_summary: str               # 2-3 句綜合說明
```

---

### Step 3：`_analyze_impact(eep, event)` → `ImpactAnalysis`

**目的**：追蹤*因為*此事件而發生的事——參與者影響 + 下游事件鏈。

**資料**：使用 `eep.subsequent_event_ids` + `eep.participant_roles` + `eep.consequences`。

**LLM 呼叫**：根據 EEP 後果證據與參與者角色，要求 LLM：
1. 對每位參與者描述**事件如何改變了他們**（角色特定影響）
2. 識別哪些**後續事件**是由此事件直接引起的
3. 描述任何**關係狀態變化**（如同盟變為敵對）
4. 撰寫**影響摘要**（2-3 句）

**輸出**：
```python
class ImpactAnalysis(BaseModel):
    affected_participant_ids: list[str]  # 受重大影響的參與者
    participant_impacts: list[str]       # 每位參與者的影響描述
    relation_changes: list[str]          # 關係狀態變化（若有）
    subsequent_event_ids: list[str]      # 直接引起的後續事件
    impact_summary: str                  # 2-3 句綜合說明
```

---

### Step 4：`_generate_event_summary(event, eep, causality, impact)` → `EventSummary`

**目的**：將所有分析綜合為約 150 字的敘事段落。

**輸入**：事件元資料 + EEP + CausalityAnalysis + ImpactAnalysis

**輸出**：
```python
class EventSummary(BaseModel):
    summary: str   # 約 150 字的敘事綜合
```

**Prompt 要求 LLM 涵蓋**：
- 發生了什麼、什麼改變了（狀態轉換）
- 為什麼發生（因果性）
- 誰參與、以何種角色
- 導致什麼後果（影響）
- 在故事中的結構角色與主題意義

---

### 覆蓋率計算（無 LLM）

```python
@staticmethod
def _compute_event_coverage(eep, causality, impact) -> EventCoverageMetrics:
    gaps = []
    if not eep.prior_event_ids:
        gaps.append("No prior events found for causal analysis")
    if not eep.subsequent_event_ids:
        gaps.append("No subsequent events found for impact analysis")
    if not eep.text_evidence:
        gaps.append("No text evidence chunks found")
    if len(eep.participant_roles) == 0:
        gaps.append("No participant roles identified")
    return EventCoverageMetrics(
        evidence_chunk_count=len(eep.text_evidence),
        participant_count=len(eep.participant_roles),
        causal_event_count=len(eep.prior_event_ids),
        subsequent_event_count=len(eep.subsequent_event_ids),
        gaps=gaps,
    )
```

---

## 4. Pydantic Models

新增至 `src/services/analysis_models.py`：

```python
from enum import Enum

# --- 支援用 enums ---

class ParticipantRoleType(str, Enum):
    INITIATOR   = "initiator"    # 引發/啟動事件
    ACTOR       = "actor"        # 主動參與
    REACTOR     = "reactor"      # 被迫回應
    VICTIM      = "victim"       # 受到傷害或負面影響
    BENEFICIARY = "beneficiary"  # 獲得正面影響

class EventImportance(str, Enum):
    KERNEL    = "kernel"    # 結構性——移除後情節崩潰
    SATELLITE = "satellite" # 支撐性——氣氛、節奏、角色細節

# --- EEP 建構元件 ---

class ParticipantRole(BaseModel):
    entity_id: str
    entity_name: str
    role: ParticipantRoleType
    impact_description: str        # 1 句：此事件如何影響該角色

class EventEvidenceProfile(BaseModel):
    state_before: str
    state_after: str
    causal_factors: list[str]
    prior_event_ids: list[str]
    participant_roles: list[ParticipantRole]
    consequences: list[str]
    subsequent_event_ids: list[str]
    structural_role: str           # 如 "Turning Point"、"Climax"、"Inciting Incident"
    event_importance: EventImportance
    thematic_significance: str
    text_evidence: list[str]       # 最多 10 段
    top_terms: dict[str, float]

# --- 分析結果 ---

class CausalityAnalysis(BaseModel):
    root_cause: str
    causal_chain: list[str]        # 有序敘事步驟
    trigger_event_ids: list[str]   # 直接原因事件
    chain_summary: str

class ImpactAnalysis(BaseModel):
    affected_participant_ids: list[str]
    participant_impacts: list[str]
    relation_changes: list[str]
    subsequent_event_ids: list[str]
    impact_summary: str

class EventSummary(BaseModel):
    summary: str                   # 約 150 字的敘事

class EventCoverageMetrics(BaseModel):
    evidence_chunk_count: int
    participant_count: int
    causal_event_count: int
    subsequent_event_count: int
    gaps: list[str]

# --- 頂層結果 ---

class EventAnalysisResult(BaseModel):
    event_id: str
    title: str
    document_id: str
    eep: EventEvidenceProfile
    causality: CausalityAnalysis
    impact: ImpactAnalysis
    summary: EventSummary
    coverage: EventCoverageMetrics
    analyzed_at: datetime
```

---

## 5. 快取策略

直接複用 `AnalysisCache`，無需修改。只有 key 格式不同：

```python
# 角色分析 key
AnalysisCache.make_key("character", document_id, entity_name)
# → "character:{document_id}:{entity_name.lower()}"

# 事件分析 key
cache_key = f"event:{document_id}:{event_id}"
# event_id 已是 UUID，不需要 lower()
```

**AnalysisAgent 擴充**：

```python
async def analyze_event(
    self,
    event_id: str,
    document_id: str,
    force_refresh: bool = False,
) -> EventAnalysisResult:
    cache_key = f"event:{document_id}:{event_id}"
    if not force_refresh and self._cache:
        cached = await self._cache.get(cache_key)
        if cached:
            return EventAnalysisResult(**cached)
    result = await self._analysis_service.analyze_event(event_id, document_id)
    if self._cache:
        await self._cache.set(cache_key, result.model_dump(mode="json"))
    return result
```

---

## 6. Prompt 設計

### Prompt 1：EEP 提取

```
System:
You are a literary analyst. Given a narrative event and supporting evidence,
extract a structured Event Evidence Profile.

Return JSON with exactly these keys:
{
  "state_before": str,          // 事件前的世界/角色狀態（1-2 句）
  "state_after": str,           // 事件後的世界/角色狀態（1-2 句）
  "causal_factors": [str, ...], // 2-5 個導致或促成此事件的因素
  "participant_roles": [
    {
      "entity_name": str,
      "role": "initiator"|"actor"|"reactor"|"victim"|"beneficiary",
      "impact_description": str
    }, ...
  ],
  "structural_role": str,       // 其中之一：Setup, Inciting Incident, Turning Point,
                                //   Escalation, Crisis, Climax, Resolution
  "event_importance": "kernel"|"satellite",
  "thematic_significance": str, // 基調、主題、象徵意義（1-2 句）
  "key_quotes": [str, ...]      // 2-4 條從原文中提取的精華引文（對白或關鍵描寫，每條一句話）
}

Human message template:
---
EVENT:
Title: {event.title}
Type: {event.event_type}
Chapter: {event.chapter}
Description: {event.description}
Significance: {event.significance or "not specified"}
Consequences: {sanitized consequences list}

PARTICIPANTS:
{for each entity: name, type, brief attributes}

PRIOR EVENTS (same participants, earlier chapters):
{list of prior event titles + chapter numbers, max 10}

TEXT EVIDENCE:
{vector chunks, max 8, formatted by DataSanitizer.format_vector_store_results()}
---
```

### Prompt 2：因果分析

```
System:
You are a literary analyst specializing in narrative causality.
Given a narrative event and its evidence profile, construct the causal chain
that led to this event.

Return JSON:
{
  "root_cause": str,           // 最早可追溯的原因（1-2 句）
  "causal_chain": [str, ...],  // 導向事件的有序步驟（3-6 項）
  "trigger_event_ids": [str],  // 直接觸發此事件的 prior_event_ids
  "chain_summary": str         // 2-3 句：為何發生此事件
}

Human message template:
---
EVENT: {event.title} (Chapter {event.chapter})
Description: {event.description}

EEP CAUSAL FACTORS:
{eep.causal_factors as numbered list}

PRIOR EVENTS (chronological):
{prior events with ids, titles, chapters, descriptions}

RELEVANT TEXT EXCERPTS:
{eep.text_evidence[:3] — 原文段落，提供因果推理的文本依據}
---
```

### Prompt 3：影響分析

```
System:
You are a literary analyst specializing in narrative consequences.
Given a narrative event and its evidence, analyze its impact on participants
and the story world.

Return JSON:
{
  "affected_participant_ids": [str],  // 受重大影響的實體 IDs
  "participant_impacts": [str],       // 按相同順序，每位參與者各一條描述
  "relation_changes": [str],          // 事件引起的關係狀態變化（可為空）
  "subsequent_event_ids": [str],      // 由此事件直接引起的後續事件 IDs
  "impact_summary": str               // 2-3 句：事件影響綜合說明
}

Human message template:
---
EVENT: {event.title} (Chapter {event.chapter})
State before: {eep.state_before}
State after: {eep.state_after}

EEP CONSEQUENCES:
{eep.consequences as numbered list}

PARTICIPANT ROLES:
{for each participant_role: name, role, initial impact_description}

SUBSEQUENT EVENTS (chronological):
{subsequent events with ids, titles, chapters, descriptions}

RELEVANT TEXT EXCERPTS:
{eep.text_evidence[:3] — 原文段落，提供影響評估的文本依據}
---
```

### Prompt 4：事件摘要

```
System:
You are a literary analyst. Write a vivid ~150-word narrative summary of
a story event, synthesizing its causes, participants, consequences, and
thematic meaning.

Return JSON:
{
  "summary": str  // 約 150 字的敘事段落
}

The summary must cover:
1. 發生了什麼、什麼改變了（狀態轉換）
2. 為什麼發生（因果性）
3. 誰參與、以何種角色
4. 導致什麼後果
5. 在故事中的結構角色與主題意義

Style requirements:
- 引用 KEY QUOTES 中的具體場景、對白或意象，讓摘要有文本細節支撐
- 禁止使用模板化用語：「埋下伏筆」「預示著」「揭示了」「不僅…也…」「為後續…奠定基礎」
- 用具體的因果描述取代抽象評論
- 風格應具分析性但生動，非公式化

Human message template:
---
EVENT: {event.title} ({event.event_type}, Chapter {event.chapter})
Structural role: {eep.structural_role} ({eep.event_importance})

STATE BEFORE: {eep.state_before}
STATE AFTER: {eep.state_after}

CAUSAL CHAIN:
{causality.causal_chain as numbered list}

IMPACT SUMMARY: {impact.impact_summary}

RELATION CHANGES: {impact.relation_changes, comma-separated}

PARTICIPANTS: {comma-separated participant names with roles}

KEY QUOTES FROM TEXT:
{eep.key_quotes[:3], 以「」括起}

THEMATIC SIGNIFICANCE: {eep.thematic_significance}
---
```

---

## 7. 資料流程圖

```
analyze_event(event_id, document_id)
│
├── [KGService] get_event(event_id)
│     └── Event(title, type, chapter, participants, consequences, ...)
│
├── [KGService] get_entity(pid) × N 位參與者
│     └── Entity(name, type, attributes)
│
├── [KGService] get_entity_timeline(pid) × N 位參與者
│     ├── prior_events      (chapter < event.chapter)
│     └── subsequent_events (chapter > event.chapter)
│
├── [KGService] get_entity_relations(pid) × N 位參與者
│     └── 因果脈絡用的 Relation triples
│
├── [VectorService] search(事件標題 + 描述, top_k=10)
│     └── text_evidence 段落
│
├── [KeywordService] get_chapter_keywords(doc_id, chapter) [可選]
│     └── top_terms dict
│
▼
_extract_eep()  ──[LLM]──►  EventEvidenceProfile
│   (state_before/after, causal_factors, participant_roles,
│    structural_role, event_importance, thematic_significance)
│
├── _analyze_causality(eep, event)  ──[LLM]──►  CausalityAnalysis
│   (root_cause, causal_chain, trigger_event_ids, chain_summary)
│
├── _analyze_impact(eep, event)  ──[LLM]──►  ImpactAnalysis
│   (participant_impacts, relation_changes, subsequent_event_ids, impact_summary)
│
├── _generate_event_summary(event, eep, causality, impact)  ──[LLM]──►  EventSummary
│   (約 150 字敘事)
│
└── _compute_event_coverage(eep, causality, impact)  [無 LLM]  ──►  EventCoverageMetrics
│
▼
EventAnalysisResult(
    event_id, title, document_id,
    eep, causality, impact, summary, coverage,
    analyzed_at
)
```

---

## 8. 需建立或修改的檔案

### KGService：新增 `get_event(event_id)` 方法
**檔案**：`src/services/kg_service.py`
- 目前有 `get_events(entity_id=None)` 但無單一事件查詢
- 新增：`async def get_event(self, event_id: str) -> Event | None`

### Analysis Models：新增事件相關 models
**檔案**：`src/services/analysis_models.py`
- 新增：`ParticipantRoleType`、`EventImportance` enums
- 新增：`ParticipantRole`、`EventEvidenceProfile`、`CausalityAnalysis`、`ImpactAnalysis`、`EventSummary`、`EventCoverageMetrics`、`EventAnalysisResult`

### Analysis Service：新增 `analyze_event()` pipeline
**檔案**：`src/services/analysis_service.py`
- 新增 4 個系統提示常數：`_EEP_SYSTEM_PROMPT`、`_CAUSALITY_SYSTEM_PROMPT`、`_IMPACT_SYSTEM_PROMPT`、`_EVENT_SUMMARY_SYSTEM_PROMPT`
- 新增公開方法：`async def analyze_event(event_id, document_id) → EventAnalysisResult`
- 新增私有方法：`_extract_eep()`、`_analyze_causality()`、`_analyze_impact()`、`_generate_event_summary()`
- 新增靜態方法：`_compute_event_coverage()`

### Analysis Agent：新增 `analyze_event()` 方法
**檔案**：`src/agents/analysis_agent.py`
- 新增：`async def analyze_event(event_id, document_id, force_refresh=False) → EventAnalysisResult`
- Cache key 格式：`f"event:{document_id}:{event_id}"`

### AnalyzeEventTool：實作 stub
**檔案**：`src/tools/analysis_tools/analyze_event.py`
- 將 `raise NotImplementedError` 替換為委派呼叫 `analysis_agent.analyze_event()`
- 輸入：`AnalyzeEventInput(event_id, include_consequences=True)`
- 輸出 JSON：符合 `EventAnalysisOutput` schema 的 flat dict

### Schemas：擴充 AnalyzeEventInput
**檔案**：`src/tools/schemas.py`
- 擴充 `AnalyzeEventInput`：新增 `document_id: str = ""`
- 擴充 `EventAnalysisOutput`：對齊 `EventAnalysisResult` 欄位

### Tool Registry：將 AnalyzeEventTool 接入對話
**檔案**：`src/tools/tool_registry.py`
- `get_chat_tools()` 已接受 `analysis_agent` 參數；將 `AnalyzeEventTool` 與 `AnalyzeCharacterTool` 一起加入

### 不需修改
- `src/services/analysis_cache.py` — 通用，直接複用
- `src/core/utils/output_extractor.py` — 直接複用
- `src/core/utils/data_sanitizer.py` — 直接複用

---

## 9. 實作注意事項與陷阱

### KGService：`get_event()` 尚不存在
目前 `kg_service.get_events()` 依實體過濾。在 `self._events` dict 中新增直接查詢 `get_event(event_id)` 即可——一行程式碼。

### 參與者可能為空
部分 LLM 提取的事件有 `participants: []`。EEP pipeline 必須優雅處理：
- 若無參與者則跳過時間軸查詢
- EEP 中標記 `participant_roles: []`
- 覆蓋率指標會標記「No participant roles identified」

### 前後事件去重
多位參與者可能共享事件。合併時間軸時使用 `seen_ids: set`，避免 `prior_event_ids` 和 `subsequent_event_ids` 中出現重複事件。

### EEP 與 AnalyzeEventInput 不一致
目前 stub 只接受 `event_id`。完整實作需要 `document_id` 來限定向量搜尋範圍。在 `AnalyzeEventInput` 中新增 `document_id: str = ""` 並傳遞至下層。

### `include_consequences` 參數
Stub 有 `include_consequences: bool = True`。完整實作中：
- 若為 `False`：跳過 `_analyze_impact()`，將 `impact` 設為 `None`（結果中改為 Optional）
- 最簡實作：永遠執行影響分析，保留此 flag 供未來優化使用

### JSON 解析
所有 LLM 呼叫使用 `src/core/utils/output_extractor.py` 中的 `extract_json_from_text()`（4 步驟 fallback）。模式與角色分析完全相同——以相同方式包裹每個 LLM 回應。

### Temperature 設定
使用現有的 `settings.analysis_temperature`（已在 Settings 中）。不需新增設定。

---

## 10. 測試計畫

參照 `tests/services/test_analysis_service.py` 與 `tests/tools/test_analysis_tools.py` 的結構。

### 單元測試：`tests/services/test_event_analysis.py`

```python
# Test 1: _extract_eep — mock KGService + VectorService + LLM
# - 驗證 EEP 欄位從 mock 資料正確填入
# - 驗證空參與者的優雅處理

# Test 2: _analyze_causality — mock EEP + mock LLM
# - 驗證 CausalityAnalysis 欄位
# - 驗證空 prior_event_ids 回傳最簡因果鏈

# Test 3: _analyze_impact — mock EEP + mock LLM
# - 驗證 ImpactAnalysis 欄位
# - 驗證空 subsequent_event_ids 的處理

# Test 4: _generate_event_summary — mock 所有輸入 + mock LLM
# - 驗證回傳約 150 字的摘要

# Test 5: _compute_event_coverage — 純函數，無需 mock
# - 驗證缺少資料時 gaps 列表正確填入
# - 驗證所有指標計數正確

# Test 6: analyze_event() 完整流程
# - mock 所有 services + LLM
# - 驗證 EventAnalysisResult 結構完整
# - 驗證 analyzed_at 已設定
```

### 快取測試：`tests/services/test_event_analysis_cache.py`

```python
# Test 7: Cache hit — 第二次呼叫回傳快取結果，LLM 未被呼叫
# Test 8: Cache miss — LLM 被呼叫，結果已儲存
# Test 9: force_refresh=True — 略過快取，重新執行 LLM
```

### 工具測試：`tests/tools/test_analyze_event_tool.py`

```python
# Test 10: analysis_agent=None 時回傳錯誤 dict
# Test 11: 工具委派至 analysis_agent.analyze_event()
# Test 12: 工具輸出 JSON 符合 EventAnalysisOutput schema
```

---

## 11. 敘事理論對應

下表將每個實作元件對應回 `event_analysis.md` 中的理論框架：

| 理論概念 | 來源（event_analysis.md §） | 實作 |
|----------|---------------------------|------|
| 狀態轉換（A → Event → B） | §1, §2.1 | `eep.state_before`, `eep.state_after` |
| 因果性（cause → motivation → consequence） | §2.2 | `CausalityAnalysis.causal_chain` + `root_cause` |
| 衝突表達 | §2.3 | `eep.thematic_significance`（衝突類型） |
| 結構性角色（Propp functions） | §3 | `eep.structural_role` |
| Kernel vs Satellite | §4 | `eep.event_importance` enum |
| 敘事視角（focalization） | §5 | `participant_roles[].impact_description`（角色視角） |
| 角色在事件中的位置 | §6 | `ParticipantRoleType` enum（Initiator/Actor/Reactor/Victim/Beneficiary） |
| 敘事節奏 | §7 | 透過 `eep.text_evidence` 段落密度隱性呈現 |
| 事件類型學 | §8 | 對應現有 `EventType` enum（REVELATION、BETRAYAL 等） |
| 主題 / 象徵意義 | §9 | `eep.thematic_significance` |
| 10 個核心分析問題 | §10 | 由 EEP + CausalityAnalysis + ImpactAnalysis + EventSummary 共同涵蓋 |

`event_analysis.md` 結論中的三個層次直接對應：

```
事件核心  → EventEvidenceProfile（state_before/after, participant_roles, structural_role）
事件結構  → CausalityAnalysis（在因果鏈中的位置）+ eep.structural_role
事件影響  → ImpactAnalysis（participant_impacts, relation_changes, subsequent_events）
```

---

## 驗證

實作完成後：

1. **單元測試**：`uv run pytest tests/services/test_event_analysis.py tests/tools/test_analyze_event_tool.py -v`
2. **完整測試套件**（確認無回歸）：`uv run pytest --ignore=tests/integration -v`
3. **手動 smoke test**（若 KG 已有資料）：
   ```python
   from agents.analysis_agent import AnalysisAgent
   result = await agent.analyze_event("some-event-uuid", "doc-1")
   print(result.summary.summary)
   print(result.causality.chain_summary)
   ```
