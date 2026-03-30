# StorySphere 張力分析模組 — 規劃與設計筆記

**建立日期**: 2026-03-30
**狀態**: 設計完成階段（Schema Defined）
**來源**: 分析方法論討論

---

## 一、背景與定位

### 張力分析在整體分析框架中的位置

本模組屬於 Framework 2（三條平行分析線）的第二條線，與符號學和敘事學並行：

| 分析線 | 核心問題 | 分析層次 |
|--------|----------|----------|
| **符號學** | 這個意象在文本裡承載什麼意義？ | 語義層 |
| **張力分析** | 文本裡存在哪些對立，如何被處理？ | 結構層 |
| **敘事學** | 故事是用什麼方式被說出來的？ | 形式層 |

### 核心設計原則

> 張力分析的工作是識別對立、追蹤演變、描述處理方式——不是裁判哪一方正確。

這個原則決定了系統設計的邊界：
- 系統負責**識別和組織**（對立的兩個極點是什麼、怎麼演變）
- 人或 LLM 負責**詮釋**（這個對立在說什麼命題）
- 最終的 TensionTheme 命題需要人工審核確認

---

## 二、張力的分類框架

### 張力類型（tension_type）

張力依據對立關係的性質分為四類：

| 類型 | 描述 | 標誌 | 例子 |
|------|------|------|------|
| **intrapersonal** | 同一角色內部的矛盾驅動力 | 人物猶豫、後悔、做出自己不相信的選擇 | 佛羅多想要魔戒又想摧毀它 |
| **interpersonal** | 兩個角色代表不同價值觀的結構性衝突 | 即使溝通完全透明，衝突仍然存在 | 波羅莫 vs 阿拉貢對於魔戒的使用 |
| **axiological** | 兩個本身都正當的價值觀被放在對立位置 | 文本拒絕給出明確答案，或給出答案但代價很高 | 正義 vs 慈悲、個人自由 vs 集體安全 |
| **structural** | 敘事形式本身製造的張力（讀者期待 vs 文本走向） | 需要從類型期待和實際走向的落差來識別 | 用喜劇語調寫悲劇結局 |

### 解決方式（resolution_type）

張力在全書層面的處理方式分為四類：

| 類型 | 描述 |
|------|------|
| **resolution** | 張力被消解，對立的一方勝出或兩者被整合 |
| **suspension** | 張力維持到結束，文本拒絕解決它 |
| **transformation** | 張力沒有被解決，但性質改變——從對立變成共存，或從外部衝突變成內化的複雜性 |
| **avoidance** | 文本迴避了它自己製造的張力（這本身是分析結果，說明文本在哪裡出現裂縫） |

### 軌跡模式（trajectory_pattern）

張力線在全書的強度走向：

| 模式 | 描述 |
|------|------|
| **rising** | 張力越來越強，到高潮爆發 |
| **sustained** | 張力維持全書，強度相對穩定 |
| **resolved** | 張力在某個點之後強度下降或消失 |
| **inverted** | 對立的兩個極點在某個點互換位置 |

---

## 三、底層素材的三類來源

張力分析的底層證據分三類，由具體到抽象：

**第一類：人物層面**
最直接的張力來源，聚焦於人物的選擇和衝突。
- 人物做出重要選擇的場景（特別是兩個選項都有代價的選擇）
- 人物之間的直接衝突（特別是雙方都有道理的衝突）
- 人物的內心猶豫（語言本身反映張力）

**第二類：價值觀層面**
比人物衝突更抽象，追蹤哪些價值觀被放在對立位置。
- 不同人物代表不同價值觀的場景
- 同一人物同時持有矛盾價值觀的場景
- 敘事者對某個選擇的態度是否曖昧或刻意迴避評判

**第三類：結構層面**
最隱性的一類，敘事結構本身製造的張力。
- 預期和結果之間的落差
- 敘事者刻意省略或跳過的場景
- 結局是否真正「解決」了衝突，還是只是停止了它

這三類是**同一個張力事件從不同角度的描述**，一個完整的分析需要同時捕捉三層。

---

## 四、Concept 節點的設計

### 兩種 Concept 節點

張力分析依賴 Concept 節點作為「對立極點」的描述來源。Concept 節點分兩種：

| | Surface Concept | Inferred Concept |
|---|---|---|
| **來源** | NER / ingestion 直接提取 | LLM 從段落群推斷 |
| **文本對應** | 有明確的 span 可以 highlight | 只能指向段落群，無法直接 highlight |
| **可信度** | 高（文本直接支持） | 中（詮釋，可能有爭議） |
| **產生時機** | ingestion pipeline | pre-analysis step（TEU 計算前） |

**重要區分**：
- Surface Concept：文本裡直接說出來的詞彙，例如段落中出現「自由」
- Inferred Concept：多個段落的語義場加在一起才能歸納的命題，例如「權力腐化善意」——沒有任何一段直接說出這個命題

### Concept 節點 Schema

```python
class ConceptNode(BaseModel):
    id: str
    label: str                          # 概念名稱

    extraction_method: Literal[
        "ner",                          # 直接從文本提取
        "inferred"                      # LLM 從段落群推斷
    ]

    # Surface Concept 有此欄位，Inferred Concept 為 None
    source_spans: List[SpanRef] | None

    # Inferred Concept 必填，Surface Concept 可選
    supporting_passages: List[PassageRef]

    # Inferred Concept 專用：哪個分析步驟產生了這個節點
    inferred_by: str | None             # e.g. "tension_pre_analysis_v1"
    confidence: float | None            # LLM 對這個推斷的置信度
```

### Concept 節點的產生時機

```
Ingestion Pipeline
  └── Surface Concept：NER 直接提取，存入 KG

Pre-Analysis Step（TEU 計算前的前置作業）
  └── Inferred Concept：LLM 從候選段落群推斷
  └── 完成後才能進行 TEU 組裝
```

這個分工確保 ingestion pipeline 不承擔推論工作，同時 Inferred Concept 不是即時計算，有明確的前置步驟邊界。

---

## 五、Event 節點的強化

### 新增標記欄位

現有的 Event 節點需要在 ingestion 時新增三個欄位，作為張力分析的進入點：

```python
class EventNode(BaseModel):
    # 現有欄位
    id: str
    subject: str
    action: str
    object: str | None
    source_passages: List[PassageRef]

    # 新增：張力信號（三值，不是 boolean）
    tension_signal: Literal["none", "potential", "explicit"]
    # none     = 純敘事推進，沒有對立跡象
    # potential = 有衝突跡象但不明確，需要 TEU 分析確認
    # explicit  = 明確的對立場景，直接觸發 TEU

    # 新增：情感標記（僅在 tension_signal != "none" 時填入）
    emotional_intensity: float | None   # 0-1，強度，不分正負
    emotional_valence: Literal[
        "positive", "negative", "mixed", "neutral"
    ] | None
```

**設計說明**：
- `tension_signal` 使用三值而非 boolean，給 ingestion 時 LLM 判斷一個模糊地帶，比強迫二選一更誠實
- `emotional_intensity` 和 `emotional_valence` 只在有張力信號時填入，避免對所有 chunk 進行不必要的 LLM 調用
- ingestion 是一次性工作，這個額外標記的成本可以接受

---

## 六、TEU（Tension Evidence Unit）Schema

### 設計說明

TEU 是張力分析的最小單元，描述**一個場景內的對立關係**。

核心差異在於：TEU 的主語是**對立關係本身**，角色和概念都是這個對立關係的承載者，而不是分析主體。這和 CEP（以角色為中心）有根本的視角差異。

CEP 和 TEU 的關係：
```
CEP（角色A）  ─┐
CEP（角色B）  ─┼─→ TEU（衝突場景）─→ 張力分析
Chapter Summary─┤
Concept 節點  ─┘
```

CEP 是 TEU 的原料之一，不是替代品。

### Schema

```python
class TensionPole(BaseModel):
    label: str                          # 對立極點的描述，e.g. "忠誠"
    carriers: List[str]                 # 承載者 ID（Character / Concept node）
    carrier_types: List[Literal[
        "character", "concept", "situation"
    ]]

class TEU(BaseModel):
    id: str

    # 來源定位
    event_id: str                       # 觸發此 TEU 的 Event 節點
    chapter_ref: str
    passage_refs: List[str]             # 支持段落

    # 核心結構（固定兩個極點）
    poles: List[TensionPole]

    tension_type: Literal[
        "intrapersonal",
        "interpersonal",
        "axiological",
        "structural"
    ]

    # 場景內的處理方式
    local_resolution: Literal[
        "unresolved",                   # 場景內未處理
        "deferred",                     # 推遲到後面
        "partially_resolved",
        "resolved"
    ]

    # 產生方式
    generated_by: str                   # e.g. "tension_pre_analysis_v1"
    confidence: float
```

---

## 七、TensionLine Schema

### 設計說明

TensionLine 是跨場景持續存在的對立模式，由多個 TEU 群集而成。

群集的依據有兩個維度：
- **概念相似性**：兩個 TEU 的對立極點涉及相同或相關的 Concept 節點
- **承載者重疊**：兩個 TEU 涉及相同的角色或陣營

群集步驟需要 **HITL 介入**，因為概念相似但實際上獨立的主題可能被錯誤合併。

### Schema

```python
class TrajectoryPoint(BaseModel):
    chapter_ref: str
    teu_id: str
    intensity: float                    # 0-1，來源：對應 Event 節點的 emotional_intensity

class TensionLine(BaseModel):
    id: str
    name: str                           # e.g. "忠誠 vs 自保"

    # 組成
    teu_ids: List[str]
    trajectory: List[TrajectoryPoint]   # 按章節排序

    # 模式分類
    tension_type: Literal[
        "intrapersonal",
        "interpersonal",
        "axiological",
        "structural"
    ]
    trajectory_pattern: Literal[
        "rising",
        "sustained",
        "resolved",
        "inverted"
    ]
    resolution_type: Literal[
        "resolution",
        "suspension",
        "transformation",
        "avoidance"
    ]
    peak_chapter: str

    # HITL 狀態
    review_status: Literal[
        "system_generated",
        "human_approved",
        "human_modified",
        "human_rejected"
    ]
    review_notes: str | None            # 人工修改的備註
```

---

## 八、TensionTheme Schema

### 設計說明

TensionTheme 是全書層面的張力主題命題，由多條 TensionLine 合成而來。

這是最需要人介入的一步——系統的角色是提供組織好的輸入，讓 LLM 或人來產出命題，而不是自動生成最終結論。最終命題需要人工審核。

### Schema

```python
class TensionTheme(BaseModel):
    id: str
    book_id: str

    # 組成
    tension_line_ids: List[str]

    # 主題命題
    proposition: str                    # 全書核心張力的自然語言描述

    # 與其他分析的對應
    related_mythos: str | None          # Frye/Booker 標籤
    related_archetypes: List[str]       # 涉及的原型 ID（來自 Jung/Schmidt）

    # 產生狀態
    confidence: Literal[
        "system_generated",
        "human_reviewed"
    ]
    review_notes: str | None
```

---

## 九、完整資料流

### 節點層次關係

```
Book
 └── TensionTheme（1個，書級命題）[需人工審核]
       └── TensionLine（N條，跨場景張力線）[HITL grouping]
             └── TEU（N個，場景層對立單元）
                   └── Event 節點（觸發來源）
```

### 處理流程

```
Ingestion Pipeline
  └── Event 節點提取，同步產出：
        - tension_signal（三值）
        - emotional_intensity（tension != none 時）
        - emotional_valence（tension != none 時）
  └── Surface Concept 節點（NER）

Pre-Analysis Step（TEU 計算前的前置作業）
  └── Inferred Concept 節點（LLM 推論）
        - 輸入：候選段落群
        - 輸出：帶 tag=inferred 的 Concept 節點
        - 完成後才能進行 TEU 組裝

TEU 組裝
  觸發點：tension_signal = "potential" 或 "explicit" 的 Event 節點
  輸入來源：
    - Event 節點（含情感標記）
    - Character 節點（來自 KG）
    - Concept 節點（Surface + Inferred）
    - Chapter Summary（整體情勢）
  輸出：TEU（含 poles, tension_type, local_resolution）

  觸發模式（兩種）：
    - 模式 A：全書掃描，系統自動批次處理所有 tension Event
    - 模式 B：按需產生，用戶指定章節 / 角色 / Event ID

TensionLine 群集（HITL）
  └── 系統自動 grouping（依概念相似性 + 承載者重疊）
  └── 人工審核 / 修改 / 拒絕
  └── review_status 更新
  └── 輸出：TensionLine（含 trajectory, pattern, resolution_type）

TensionTheme 合成
  └── 輸入：TensionLine + Frye/Booker 標籤 + 原型標籤
  └── LLM 產出 proposition
  └── 人工審核確認
  └── 輸出：TensionTheme
```

### 觸發模式 B 支援的查詢粒度

| 查詢方式 | 說明 |
|----------|------|
| 指定章節 | 取該章節所有 tension Event |
| 指定角色 | 取該角色參與的所有 tension Event |
| 指定 Event ID | 直接觸發單一 TEU |
| 指定概念（預留） | 取涉及該概念的所有 tension Event，待符號學模組成熟後啟用 |

---

## 十、與現有 StorySphere 架構的整合

### 可複用的現有能力

| 現有能力 | 張力分析用途 |
|----------|--------------|
| Event 節點（KG） | 張力分析的觸發來源，需新增情感標記欄位 |
| Character 節點（KG） | TEU 的承載者來源 |
| Concept 節點（KG） | 對立極點的描述來源，需區分 surface / inferred |
| Chapter Summary（層級摘要） | 整體情勢的輸入，非 KG 節點 |
| Qdrant 向量搜索 | 找語義相似的 passage，輔助 TEU 組裝 |
| CEP（角色證據包） | TEU 組裝的原料之一 |

### 新增需求

- Event 節點新增 `tension_signal`、`emotional_intensity`、`emotional_valence` 欄位（對應 B-023）
- Concept 節點新增 `extraction_method`、`inferred_by`、`confidence` 欄位（對應 B-024）
- Pre-Analysis Step：Inferred Concept 節點的產生流程（對應 B-025）
- TEU、TensionLine、TensionTheme 的 Domain Model 和儲存（對應 B-026）
- TensionLine grouping 的 HITL 介面（對應 B-027）
- 模式 A（全書掃描）作為 Deep Analysis Workflow 的一個子流程（對應 B-028）

---

## 十一、與符號學模組的關係

張力分析和符號學模組有資料依賴，但設計上保持獨立：

| | 張力分析 | 符號學 |
|---|---|---|
| **Concept 節點** | 使用，作為對立極點的描述 | 使用，作為候選符號的來源 |
| **Event 節點** | 作為觸發點 | 作為情感密度標記的參考 |
| **相依方向** | 依賴 Concept 節點的存在 | 依賴 Event 節點的情感標記 |

兩個模組都依賴 Concept 節點，但互相不直接依賴，可以平行開發。

---

## 十二、開放問題（待研究）

1. **TensionLine intensity 的聚合方式**：從多個 TEU 的 `emotional_intensity` 聚合成 TensionLine 的軌跡強度，用平均值、最大值、還是其他方式？（→ B-027 設計決策）
2. **自動 grouping 的演算法**：概念相似性的計算用向量距離還是 LLM 判斷？兩種的準確率和成本差異需要評估。（→ B-027）
3. **HITL 介面的設計**：TensionLine grouping 的審核介面需要呈現哪些資訊，才能讓分析者快速做出判斷？（→ B-027）
4. **TensionTheme 的粒度**：一本書應該有幾條 TensionLine 才算合理？是否需要設定上限避免過度細分？（→ B-029 驗收條件）
5. **跨書比較**：張力分析是否要支援跨書比較（同一張力模式在不同作品的呈現差異）？（長期）

---

## 十三、下一步建議（對應 Backlog）

### 短期（前置作業）

- [ ] **[B-023]** Event 節點張力欄位強化（ingestion prompt 設計 + schema migration）
  - 前置依賴：無（修改 ingestion pipeline，與其他張力模組工作無依賴）
  - 預期產出：更新 `src/domain/models.py` EventNode schema + `src/pipelines/entity_extractor.py` 的提取 prompt，新 Event 節點含 `tension_signal` / `emotional_intensity` / `emotional_valence`
- [ ] **[B-024]** Concept 節點 surface/inferred 分類強化（ingestion + KG schema）
  - 前置依賴：無（可與 B-023 並行）
  - 預期產出：更新 ConceptNode schema，ingestion 時 NER 結果標記 `extraction_method="ner"`
- [ ] **[B-023/B-024 子項]** 用一本具體小說手動走完完整流程，驗證 TEU 設計合理性

### 中期（原型實作）

- [ ] **[B-025]** Pre-Analysis Step：Inferred Concept 節點產生流程
  - 前置依賴：B-024
  - 預期產出：`src/pipelines/concept_inference.py`，LLM 從候選段落群推斷 Concept 節點，帶 `inferred_by` / `confidence` 欄位
- [ ] **[B-026]** TEU Domain Model + 組裝 Pipeline（模式 B 優先）
  - 前置依賴：B-023, B-024, B-025
  - 預期產出：`src/domain/tension.py`（TEU / TensionPole schema）+ `src/services/tension_service.py`（模式 B：單 Event 觸發）
- [ ] **[B-027 前置]** 設計並測試 TensionLine grouping 的自動化演算法（向量距離 vs LLM 判斷評估）

### 長期（完整模組）

- [ ] **[B-027]** TensionLine 自動 grouping + HITL 審核介面
  - 前置依賴：B-026
  - 預期產出：grouping 服務 + API 端點（`PATCH /api/v1/tension/lines/{id}/review`）+ 前端 HITL 審核元件
- [ ] **[B-028]** 模式 A：全書掃描批次 TEU 組裝
  - 前置依賴：B-026
  - 預期產出：`AnalysisAgent` 新入口 `analyze_tensions(book_id)`，整合進 Deep Analysis Workflow
- [ ] **[B-029]** TensionTheme 合成 + Frye/Booker 標籤對應
  - 前置依賴：B-027
  - 預期產出：`TensionTheme` schema + LLM 合成 pipeline + 人工審核 API
- [ ] **[B-030]** 張力分析與 Deep Analysis Workflow 完整整合
  - 前置依賴：B-028, B-029
  - 預期產出：完整端到端流程，從 ingestion → TEU → TensionLine（HITL）→ TensionTheme（人工審核）

---

## 十四、參考框架

- **亞里斯多德《詩學》**：衝突（agon）作為悲劇的核心元素
- **A.J. 格雷馬斯（Greimas）**：符號方陣（semiotic square），對立關係的形式化描述
- **彼得·布魯克斯（Peter Brooks）**：敘事張力與欲望的驅動（*Reading for the Plot*）
- **米克·巴爾（Mieke Bal）**：敘事學中的衝突結構分析

---

**最後更新**: 2026-03-30
**狀態**: 設計完成，Schema 已定義，待原型實作（從 B-023 開始）
**維護者**: William
