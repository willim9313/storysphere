# StorySphere 敘事學分析模組 — 規劃與設計筆記

**建立日期**: 2026-03-30
**狀態**: 概念規劃階段（Backlog）
**來源**: 分析方法論討論

---

## 一、背景與定位

### 敘事學在整體分析框架中的位置

本模組屬於 Framework 2（三條平行分析線）的第三條線，與符號學和張力分析並行：

| 分析線 | 核心問題 | 分析層次 |
|--------|----------|----------|
| **符號學** | 這個意象在文本裡承載什麼意義？ | 語義層 |
| **張力分析** | 文本裡存在哪些對立，如何被處理？ | 結構層 |
| **敘事學** | 故事是用什麼方式被說出來的？ | 形式層 |

### 與現有規劃的關係

敘事學的部分內容已進入現有架構，部分尚未涉及：

| 理論家 | 核心貢獻 | 現有架構狀態 |
|--------|----------|--------------|
| **普羅普** | 功能序列 | ✅ 已在 ingestion pipeline（Event 節點三元組） |
| **坎伯** | 英雄旅程結構 | ✅ 與 Frye/Booker 同層次，Framework 1 延伸 |
| **查特曼** | Kernel/Satellite 區分 | ⚠️ 未設計，本模組重點之一 |
| **熱奈特** | 時序、聚焦、聲音 | ⚠️ 部分可行，見可行性評估 |

### 核心設計原則

> 敘事學分析的工作是描述「怎麼說」——作者在敘述層面做了什麼選擇，以及這些選擇的結構效果。詮釋這些選擇的意義，是分析者的工作。

這個原則決定了系統設計的邊界：
- 系統負責**識別和標記**（時序偏差、情節重要性層級）
- 人或 LLM 負責**詮釋**（這個敘述選擇在說什麼）
- 敘事學的許多分析維度需要 HITL，因為判斷邊界本身就是模糊的

---

## 二、核心概念釐清

### 故事（Story）vs. 論述（Discourse）

查特曼的這個區分是整個模組的基礎前提：

- **故事（Story）**：虛構世界裡發生的事件，按照它們在那個世界裡的實際順序排列
- **論述（Discourse）**：作者選擇如何把這些事件說出來——順序、比例、視角、語言距離

**對 StorySphere 的意義**：現有的時間軸分析（Event 節點按章節排列）重建的是**故事時間**。敘事學的時序分析關注的是**論述時間和故事時間的落差**——這是兩個不同的問題，共用部分資料，但提問完全不同。

### 普羅普的功能（Function）

普羅普的核心洞察：故事的組成單位不是人物，而是人物行動對故事進程的**功能**。不同人物可以執行相同的功能；相同的功能在不同故事裡以不同面貌出現。

31 個功能按固定順序構成故事的深層語法。這個結構和 Event 節點的 subject/action/object 三元組天然對應，已是現有 ingestion pipeline 的基礎。

### 查特曼的 Kernel/Satellite

- **Kernel（核心情節）**：刪去會改變故事因果鏈的事件節點。它們是敘事的骨幹，無法省略。
- **Satellite（衛星情節）**：對核心情節的補充、渲染、延伸。刪去不會斷裂故事，但會影響體驗的豐富度和主題的深度。

這個區分對分析者的價值是：快速識別一本書的**情節骨幹**，以及作者在哪些地方花了不成比例的篇幅渲染衛星情節（這些地方往往藏有主題重量）。

### 熱奈特的三個維度

**時序（Order）**：文本中事件被說出的順序 vs. 故事時間的實際順序。
- 倒敘（analepsis）：現在敘述更早發生的事
- 預敘（prolepsis）：現在暗示或敘述將來才發生的事
- 時距（duration）：事件的文本篇幅 vs. 故事時間的長短，兩者的比例揭示作者的重視程度

**聚焦（Focalization）**：誰的眼睛在看？
- 零聚焦：敘事者知道一切（全知視角）
- 內聚焦：限制在某個人物的視角和認知範圍內
- 外聚焦：只描述行為和外部事實，不進入任何人物的內心

**聲音（Voice）**：敘事者和人物的距離。自由間接引語是邊界最模糊的形式——敘事者的語言滲入人物的內心，兩者界限故意被模糊。

---

## 三、可行性評估

### 普羅普功能序列 ✅ 已完成

**可行性**：高。ingestion pipeline 已實作，不需新增資料結構。

**延伸空間**：把散落的 Event 節點串成**功能序列**，分析整本書的功能分佈——哪些功能密集出現、哪些缺失、序列節奏是否符合類型預期。這個延伸用現有 KG 的時間軸查詢即可支持。

**結論**：基本完成。延伸工作量小，可作為 Framework 1 的附帶輸出。

---

### 坎伯英雄旅程 ✅ 可行，Framework 1 延伸

**可行性**：高。

**與 Frye/Booker 的差異**：Frye/Booker 輸出的是**類型標籤**（這本書是什麼類型的故事）；坎伯輸出的是**結構對應**（這本書的哪個部分對應英雄旅程的哪個階段）。後者需要把英雄旅程的階段映射到具體章節，比打標籤複雜，但輸入相同（頂層層級摘要 + 章節摘要）。

**輸入**：章節摘要序列
**輸出**：英雄旅程階段標籤，附對應章節範圍

**結論**：可行，和 Frye/Booker 一起規劃為 Framework 1 的後段步驟。

---

### 查特曼 Kernel/Satellite ⚠️ 優先進入設計

**可行性**：中高。是本模組技術上最有抓手的新維度。

**技術入口**：現有的層級摘要架構已隱含粗略的重要性分層——能進入章節摘要的 Event，本來就比只出現在段落層的 Event 重要。這可以作為 Kernel/Satellite 區分的初始信號，再用 LLM 細化。

**核心判斷邏輯**：「刪去這個事件，後續的因果鏈是否還能成立？」這個問題需要 LLM 在足夠的上下文下判斷，可行但需要設計 prompt 和驗證機制。

**分析者價值**：
- 快速看到一本書的**情節骨幹**
- 識別作者在哪些 satellite 情節花了不成比例的篇幅（主題重量的指標）
- 輔助 TEU 組裝（kernel 事件是更可靠的張力觸發點）

**與張力分析的關係**：kernel 事件和 `tension_signal = "explicit"` 的 Event 高度重疊，兩個模組可以共享這個標記結果。

**結論**：值得優先進入設計。是現有架構缺失的真正新維度，技術門檻相對明確。

---

### 熱奈特時序 ⚠️ 可行，有前置依賴

**可行性**：中。

**前置依賴**：要做時序分析，需要先建立**故事時間軸**——把所有事件按虛構世界裡的發生順序排列。目前 Event 節點只有文本位置（`source_passages`），沒有故事內部時間座標。

**故事時間標記的兩種方案**：
1. Ingestion 時 LLM 標記：對每個 Event 推斷其故事時間（相對順序或文本線索），成本高但一次性完成
2. 事後從段落語言推斷：利用「多年前」、「那個夏天」等時間線索，準確率有限

**有效範圍的限制**：對時間線刻意模糊的文類（意識流小說、後現代敘事）無法有效操作。需要在 book-level 標記文類後，決定是否啟用時序分析。

**一旦故事時間軸建立**，時序偏差的計算反而直接：文本位置排名 vs. 故事時間排名的差值，即為倒敘/預敘的量化指標。時距分析（篇幅 vs. 故事時間長短的比例）也可以從段落字數和故事時間推算。

**結論**：可行，但前置成本明確（故事時間標記需要在 ingestion 設計裡預留）。建議在 ingestion pipeline 設計中預留 `story_time` 欄位，實際分析邏輯延後到本模組開發時再補。

---

### 熱奈特聚焦 ❌ 暫緩

**可行性**：中低。

**技術挑戰**：
- 需要對每個段落做視角歸屬標記，ingestion 時的額外工作量大
- 自由間接引語的邊界本身就是模糊的，LLM 標注可信度有限
- 分析者真正想知道的是「視角在哪些關鍵時刻切換」，這需要在標記之上再做模式識別

**結論**：技術可行但成本高、誤差大。現階段暫緩，留待 NLP 能力成熟後重新評估。

---

### 熱奈特聲音（敘事距離） ❌ 現階段不可行

**可行性**：低。

自由間接引語的自動識別是 NLP 學術研究的難題，準確率在現有工具下仍然有限。更根本的問題是：即使識別出來，分析結果很難轉化成對分析者有用的系統性輸出。

**結論**：現階段不可行。不進入設計範圍。

---

## 四、本模組的設計範圍

根據可行性評估，本模組在 backlog 階段的設計範圍確定為以下三個部分：

1. **Kernel/Satellite 區分**：新資料結構設計，優先
2. **坎伯英雄旅程結構對應**：Framework 1 延伸，和 Frye/Booker 一起規劃
3. **熱奈特時序（部分）**：Ingestion 預留 `story_time` 欄位，分析邏輯延後

以下設計集中在 Kernel/Satellite，因為這是本模組對現有架構最實質的新貢獻。

---

## 五、Kernel/Satellite 資料結構設計

### Event 節點新增欄位

現有 Event 節點需要新增一個欄位，作為 Kernel/Satellite 區分的標記：

```python
class EventNode(BaseModel):
    # 現有欄位
    id: str
    subject: str
    action: str
    object: str | None
    source_passages: List[PassageRef]
    tension_signal: Literal["none", "potential", "explicit"]  # 張力分析已有（B-023）

    # 新增：情節重要性層級
    narrative_weight: Literal[
        "kernel",       # 刪去會斷裂因果鏈
        "satellite",    # 補充渲染，刪去不影響骨幹
        "unclassified"  # 尚未分類（ingestion 時預設值）
    ] = "unclassified"

    # 新增：分類的產生方式
    narrative_weight_source: Literal[
        "summary_heuristic",    # 從層級摘要推斷（快速、粗略）
        "llm_classified",       # LLM 完整判斷
        "human_verified"        # 人工確認
    ] | None = None

    # 新增：故事時間（熱奈特時序用，預留）
    story_time: StoryTimeRef | None = None
```

> ⚠️ **注意**：`narrative_weight` 和 `story_time` 欄位應與 B-023 的 `tension_signal` 欄位在**同一次 schema migration** 中加入，避免多次 ingestion pipeline 修改。對應 B-031。

### StoryTimeRef（預留，熱奈特時序用）

```python
class StoryTimeRef(BaseModel):
    # 相對順序（必填，從文本線索推斷）
    relative_order: int | None          # 在故事時間軸上的排名估計

    # 文本時間線索（如果有）
    time_anchor: str | None             # e.g. "三年前"、"那個冬天"

    # 絕對時間（如果作品有明確時間設定）
    absolute_time: str | None           # e.g. "1943年春"

    # 推斷信心
    confidence: Literal["high", "medium", "low"]
```

### NarrativeStructure 節點（書級）

```python
class NarrativeStructure(BaseModel):
    id: str
    book_id: str

    # Kernel/Satellite 統計
    kernel_count: int
    satellite_count: int
    kernel_event_ids: List[str]

    # 坎伯英雄旅程對應（Framework 1 延伸）
    hero_journey_mapping: List[HeroJourneyStage] | None

    # 普羅普功能序列摘要
    propp_sequence_summary: List[ProppFunctionRef] | None

    # 產生狀態
    generated_by: str
    review_status: Literal[
        "system_generated",
        "human_approved",
        "human_modified"
    ]
```

### HeroJourneyStage

```python
class HeroJourneyStage(BaseModel):
    stage_name: Literal[
        # 啟程
        "ordinary_world",
        "call_to_adventure",
        "refusal_of_call",
        "meeting_the_mentor",
        "crossing_threshold",
        # 啟蒙
        "tests_allies_enemies",
        "approach_innermost_cave",
        "ordeal",
        "reward",
        # 回歸
        "road_back",
        "resurrection",
        "return_with_elixir"
    ]
    chapter_range: List[str]            # 對應的章節 ID 列表
    key_event_ids: List[str]            # 這個階段的代表性 Event
    confidence: float
    notes: str | None
```

---

## 六、Kernel/Satellite 分類流程

### 兩階段分類策略

**第一階段：摘要啟發式（快速、全覆蓋）**

利用現有層級摘要架構的隱含重要性信號：

```
出現在書級摘要的 Event → kernel 候選（高可能性）
出現在章節摘要但不在書級 → satellite 候選（高可能性）
只出現在段落層 → satellite（大概率）
```

這個步驟不需要額外 LLM 調用，直接從摘要層級推斷，標記 `narrative_weight_source = "summary_heuristic"`。

**第二階段：LLM 細化（按需，針對候選集）**

對啟發式結果不確定的 Event（例如出現在章節摘要但語義上看起來是渲染性的），用 LLM 做完整判斷：

```
輸入：
  - 候選 Event 的完整描述
  - 前後因果鏈上的相鄰 Event
  - 所在章節的摘要

判斷提示：
  「如果移除這個事件，後續這些事件（列出）是否仍然可以發生？
   如果是，這個事件是 satellite；如果不是，它是 kernel。」

輸出：
  - narrative_weight: kernel | satellite
  - reasoning: 判斷依據（一句話）
  - confidence: float
```

標記 `narrative_weight_source = "llm_classified"`。

### 觸發模式

| 模式 | 說明 | 觸發時機 |
|------|------|----------|
| **全書掃描** | 對所有 Event 做兩階段分類 | Deep Analysis Workflow 觸發 |
| **按需分類** | 用戶指定章節或角色，只分類相關 Event | Chat Agent 或 Card 觸發 |

---

## 七、與現有 StorySphere 架構的整合

### 可複用的現有能力

| 現有能力 | 敘事學用途 |
|----------|------------|
| Event 節點（KG） | Kernel/Satellite 標記的基礎，需新增 `narrative_weight` 欄位 |
| 層級摘要（書/章）| Kernel/Satellite 啟發式分類的主要信號 |
| Frye/Booker 標籤 | 坎伯英雄旅程的前置輸入（類型確認後才做結構對應） |
| Chapter Summary | 坎伯階段對應的輸入 |
| CEP（角色證據包）| 聚焦分析的潛在輸入（暫緩） |

### 新增需求

- Event 節點新增 `narrative_weight`、`narrative_weight_source`、`story_time` 欄位（對應 B-031，**建議與 B-023 合併進同一次 migration**）
- `NarrativeStructure` 節點（書級，存儲 Kernel 清單和英雄旅程對應）（對應 B-033）
- Kernel/Satellite 分類的兩階段流程（啟發式 + LLM 細化）（對應 B-033, B-034）
- 坎伯英雄旅程的 LLM 分類 prompt（對應 B-035）
- Ingestion pipeline 預留 `story_time` 欄位（對應 B-031）和時間線索提取（對應 B-032）

### 與張力分析模組的關係

兩個模組共享 Event 節點，但互相不直接依賴：

| | 敘事學 | 張力分析 |
|---|---|---|
| **Event 節點** | 讀取並標記 `narrative_weight` | 讀取並標記 `tension_signal` |
| **相依方向** | 依賴層級摘要存在 | 依賴 Concept 節點存在 |
| **交叉點** | kernel 事件和 `tension_signal = "explicit"` 高度重疊，可互相參照 |
| **Migration 協同** | B-031 應與 B-023 合併，一次性完成 Event 節點所有新欄位 |

---

## 八、熱奈特時序的預留設計

本模組不完整實作熱奈特時序分析，但在 ingestion 設計中預留必要欄位：

### Ingestion 時預留的工作

在 Event 節點提取時，LLM 同步嘗試識別以下信號（允許空值）：

```python
# ingestion prompt 新增項（選填）
"""
如果段落中有明確的時間線索（例如「多年前」、「那個夏天」、「三天後」），
請提取並填入 time_anchor 欄位。
如果沒有明確線索，留空。
"""
```

這個做法的成本增量很小（ingestion 時只提取文本中已存在的線索，不做推斷），但為未來的時序分析保留了入口。

### 時序分析的完整實作條件（未來評估用）

時序分析的完整實作需要以下前置條件都滿足才啟動：

1. 書級 `story_time_structure` 標記為 `"linear"` 或 `"partially_linear"`（非意識流）
2. 足夠比例的 Event 節點有 `story_time.relative_order` 值
3. 分析者明確觸發（不作為自動步驟）

---

## 九、開放問題（待研究）

1. **Kernel 判斷的準確率驗證**：LLM 對 Kernel/Satellite 的判斷，需要用具體小說手動驗證準確率，特別是邊界案例（「幾乎是 kernel 的 satellite」）（→ B-033 驗收條件）
2. **故事時間標記的可靠性**：對時間線索模糊的段落，LLM 推斷的 `relative_order` 可信度需要評估，避免建立一個錯誤的故事時間軸（→ B-037 前置評估）
3. **坎伯階段邊界的模糊性**：英雄旅程的階段在現實文本中往往有重疊，章節和階段的對應不是一對一關係，需要設計允許重疊的資料結構（→ B-035 設計決策）
4. **多主角作品的處理**：坎伯框架假設一個主角的旅程，多主角作品（如《魔戒》群戲）需要決定是分開分析還是整合為一條旅程（→ B-035 開放問題）
5. **Kernel/Satellite 和摘要層級的分歧**：如果一個 Event 出現在章節摘要，但 LLM 判斷它是 satellite，應以哪個為準？需要定義衝突解決規則（→ B-034 設計決策）

---

## 十、下一步建議（對應 Backlog）

### 短期（前置作業，可在其他模組開發時同步完成）

- [ ] **[B-031]** Event 節點敘事學欄位預留（`narrative_weight` + `story_time`）
  - 前置依賴：無（**強烈建議與 B-023 的張力欄位合併進同一次 ingestion migration**，避免重複修改 schema 和 prompt）
  - 預期產出：更新 `src/domain/models.py` EventNode，新增 `narrative_weight="unclassified"`（預設值）和 `story_time=None`（預留，允許空值）
- [ ] **[B-032]** Ingestion prompt 時間線索提取預留
  - 前置依賴：B-031（schema 先定義）
  - 預期產出：更新 Event 提取 prompt，新增選填項「如有明確時間線索請填入 `time_anchor`」；成本增量極小（只提取文本已有的線索，不做推斷）

### 中期（本模組原型實作）

- [ ] **[B-033]** Kernel/Satellite 第一階段：摘要啟發式分類
  - 前置依賴：B-031
  - 預期產出：`src/services/narrative_service.py` — `classify_by_heuristic(book_id)` 方法，依層級摘要推斷 `narrative_weight`，標記 `source="summary_heuristic"`；`NarrativeStructure` schema（`src/domain/narrative.py`）
- [ ] **[B-034]** Kernel/Satellite 第二階段：LLM 細化分類
  - 前置依賴：B-033（啟發式結果作為 LLM 細化的候選集）
  - 預期產出：`NarrativeService.refine_with_llm(event_ids)` — 對啟發式不確定的 Event 進行 LLM 完整判斷；定義 Kernel/Satellite 分歧解決規則（摘要層級 vs LLM 衝突時以哪個為準）
- [ ] **[B-035]** 坎伯英雄旅程 LLM 結構對應
  - 前置依賴：無（輸入為章節摘要序列，現有資料即可）
  - 預期產出：`NarrativeService.map_hero_journey(book_id)` — 輸入章節摘要序列，LLM 輸出 `HeroJourneyStage` 列表，含章節範圍和置信度；解決多主角作品的設計決策

### 長期（完整模組）

- [ ] **[B-036]** NarrativeStructure 節點儲存 + 查詢介面
  - 前置依賴：B-033, B-035
  - 預期產出：`DocumentService.save_narrative_structure()` / `get_narrative_structure()`；API 端點 `GET /api/v1/narrative?book_id={id}`
- [ ] **[B-037]** 熱奈特時序分析（倒敘/預敘識別 + 時距計算）
  - 前置依賴：B-032，且需評估 `story_time` 欄位覆蓋率 ≥ 閾值才啟動
  - 預期產出：`NarrativeService.analyze_temporal_order(book_id)` — 文本位置排名 vs 故事時間排名的差值計算，識別倒敘/預敘節點
- [ ] **[B-038]** 敘事結構視覺化 + Deep Analysis Workflow 完整整合
  - 前置依賴：B-033, B-035, B-036
  - 預期產出：前端情節骨幹圖（Kernel 節點高亮）、英雄旅程對應圖；完整流程文件 `docs/guides/PHASE_11_NARRATOLOGY.md`

---

## 十一、參考框架

- **弗拉基米爾·普羅普（Vladimir Propp）**：《故事形態學》（*Morphology of the Folktale*），功能序列
- **熱拉爾·熱奈特（Gérard Genette）**：《敘事話語》（*Narrative Discourse*），時序、聚焦、聲音
- **西摩·查特曼（Seymour Chatman）**：《故事與話語》（*Story and Discourse*），Kernel/Satellite 區分
- **約瑟夫·坎伯（Joseph Campbell）**：《千面英雄》（*The Hero with a Thousand Faces*），英雄旅程結構
- **諾思羅普·弗萊（Northrop Frye）**：《批評的解剖》（*Anatomy of Criticism*），季節原型與敘事類型（Framework 1 基礎）

---

**最後更新**: 2026-03-30
**狀態**: 概念規劃階段，Ingestion 預留欄位（B-031, B-032）可提前與 B-023 合併處理
**維護者**: William
