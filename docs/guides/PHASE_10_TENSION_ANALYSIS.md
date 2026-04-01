# Phase 10 — Tension Analysis (B-023 ~ B-030)

## 概覽

張力分析模組透過三層次的資料結構，將小說中的衝突與對立從場景層提煉至全書主題層：

```
TEU (Tension Evidence Unit)      — 場景層，每個 Event 一個
    ↓  grouping (LLM)
TensionLine                      — 跨場景模式，2-6 條／書
    ↓  synthesis (LLM + HITL)
TensionTheme                     — 全書主題命題，1 個／書
```

---

## 前置條件

在執行張力分析前，書籍必須完成：
- **Ingestion**（文本切分、實體/事件抽取）
- **Event 節點的 `tension_signal` 欄位**（B-023 新增，在 ingestion 時由 LLM 填入）
- **Inferred Concept 節點產生**（B-025，非必要但可提升品質）

---

## 端到端工作流

### Step 1：Mode A 全書批次 TEU 組裝

**API**：`POST /api/v1/tension/analyze`

```json
{
  "document_id": "book-uuid",
  "language": "zh",
  "force": false,
  "concurrency": 5
}
```

- 自動篩選 `tension_signal != "none"` 的 Event 節點
- 每個 Event 送往 LLM，識別二元對立的兩個 Pole（概念名稱 + 承載角色 + 立場描述）
- 結果快取於 SQLite（`teu:{event_id}`），7 天 TTL
- 使用 `asyncio.Semaphore` 控制並行（預設 5）

**輪詢進度**：`GET /api/v1/tension/analyze/{task_id}`

回傳：
```json
{
  "total_events": 120,
  "candidates": 45,
  "assembled": 43,
  "failed": 2
}
```

---

### Step 2：TensionLine 自動 grouping（B-027）

**API**：`POST /api/v1/tension/lines/group`

```json
{
  "document_id": "book-uuid",
  "language": "zh",
  "force": false
}
```

- 讀取所有已快取的 TEU
- LLM 將語義相近的 TEU 分組，產生 2-6 條 TensionLine
- 每條 TensionLine 有：
  - `canonical_pole_a` / `canonical_pole_b`：標準化的對立標籤
  - `intensity_summary`：平均強度（0-1）
  - `chapter_range`：[最小章節, 最大章節]
  - `teu_ids`：組成的 TEU ID 列表

**取得結果**：`GET /api/v1/tension/lines?book_id={id}`

---

### Step 3：HITL 審核 TensionLine（B-027）

**API**：`PATCH /api/v1/tension/lines/{line_id}/review`

```json
{
  "document_id": "book-uuid",
  "review_status": "approved",          // approved | modified | rejected
  "canonical_pole_a": "自由",            // 可選，修改後的標籤
  "canonical_pole_b": "束縛"
}
```

- `approved`：接受 LLM 的分組結果
- `modified`：接受但修改 pole 標籤
- `rejected`：拒絕此 TensionLine（不納入 TensionTheme 合成）

---

### Step 4：TensionTheme 合成（B-029）

**API**：`POST /api/v1/tension/theme/synthesize`

```json
{
  "document_id": "book-uuid",
  "language": "zh",
  "force": false
}
```

- 輸入：已審核的 TensionLine（`approved` + `modified`）
  - 若無審核過的，自動回退至使用全部 TensionLine
- LLM 產出：
  - `proposition`：全書層面的主題命題（1-2 句）
  - `frye_mythos`：Frye 四大原型模式（comedy / romance / tragedy / irony_satire）
  - `booker_plot`：Booker 七大基本情節（overcoming_the_monster / rags_to_riches / the_quest / voyage_and_return / comedy / tragedy / rebirth）
- 快取：`tension_theme:{document_id}`

---

### Step 5：HITL 審核 TensionTheme（B-029）

**API**：`PATCH /api/v1/tension/theme/{theme_id}/review`

```json
{
  "document_id": "book-uuid",
  "review_status": "modified",
  "proposition": "這部小說主張，個人對自由的渴望在面對集體義務時必然走向悲劇性的自我毀滅。"
}
```

---

## 資料模型

### TEU

```python
class TEU:
    id: str
    event_id: str
    document_id: str
    chapter: int
    pole_a: TensionPole        # concept_name, carrier_names, stance
    pole_b: TensionPole
    tension_description: str
    intensity: float           # 0.0–1.0
    evidence: list[str]
    thematic_note: str | None
    review_status: "pending" | "approved" | "rejected"
```

### TensionLine

```python
class TensionLine:
    id: str
    document_id: str
    teu_ids: list[str]
    canonical_pole_a: str
    canonical_pole_b: str
    intensity_summary: float
    chapter_range: list[int]   # [min_chapter, max_chapter]
    review_status: "pending" | "approved" | "modified" | "rejected"
```

### TensionTheme

```python
class TensionTheme:
    id: str
    document_id: str
    tension_line_ids: list[str]
    proposition: str
    frye_mythos: str | None    # Frye mythos id
    booker_plot: str | None    # Booker plot id
    assembled_by: str
    assembled_at: datetime
    review_status: "pending" | "approved" | "modified" | "rejected"
```

---

## Frye Mythos 說明

| id | 名稱 | 季節 | 核心模式 |
|----|------|------|---------|
| `romance` | 浪漫傳奇 | 夏 | 英雄完成使命，克服逆境，實現理想化的世界秩序 |
| `comedy` | 喜劇 | 春 | 社會從混亂走向和諧，通常以社會整合為結局 |
| `tragedy` | 悲劇 | 秋 | 傑出個體因致命缺陷或命運而墜落，與社會疏離 |
| `irony_satire` | 諷刺／反諷 | 冬 | 現實無法符合理想，世界被揭露為荒謬或腐敗 |

## Booker Seven Basic Plots

| id | 名稱 | 核心模式 |
|----|------|---------|
| `overcoming_the_monster` | 征服怪物 | 主角擊敗威脅世界的邪惡力量 |
| `rags_to_riches` | 從貧到富 | 卑微者透過真正的成長獲得並守住財富或愛情 |
| `the_quest` | 追尋 | 英雄與同伴踏上旅程尋求重要目標 |
| `voyage_and_return` | 旅程與歸返 | 英雄前往陌生世界，掙扎後帶著改變歸來 |
| `comedy` | 喜劇 | 困惑與誤解最終因真相揭露而圓滿解決 |
| `tragedy` | 悲劇 | 英雄被執念或缺陷吞噬，走向災難性結局 |
| `rebirth` | 重生 | 英雄陷入黑暗咒語，最終被救贖性力量解放 |

---

## 快取鍵模式

| 資料 | 快取鍵 | TTL |
|------|--------|-----|
| TEU | `teu:{event_id}` | 7 天 |
| TensionLines | `tension_lines:{document_id}` | 7 天 |
| TensionTheme | `tension_theme:{document_id}` | 7 天 |

---

## 檔案索引

| 檔案 | 說明 |
|------|------|
| `src/domain/tension.py` | TEU / TensionLine / TensionTheme 資料模型 |
| `src/services/tension_service.py` | 核心服務（組裝、分組、合成、CRUD） |
| `src/api/routers/tension.py` | FastAPI 路由（10 個端點） |
| `src/api/schemas/tension.py` | Request schemas |
| `src/config/mythos.py` | Frye/Booker 定義 loader |
| `src/config/mythos/` | JSON 定義檔（EN + ZH） |
| `src/domain/events.py` | Event 模型（含 tension_signal 等欄位） |
| `frontend/src/pages/TensionPage.tsx` | 張力分析儀表板 |
| `frontend/src/api/tension.ts` | 前端 API 層 |

---

## 開發歷程

- **B-023 + B-031**：Event 節點新增 `tension_signal`、`emotional_intensity`、`emotional_valence` 等欄位
- **B-024**：Entity (Concept) 節點新增 `extraction_method` / `provenance` / `confidence` 欄位
- **B-025**：ConceptInferencePipeline — 從已知 Concept 推斷全書隱含主題概念
- **B-026**：TEU Domain Model + TensionService 核心（Mode B 單事件組裝）
- **B-027**：TensionLine LLM grouping + HITL 審核 API
- **B-028**：Mode A 全書批次 TEU 組裝 + 進度 API
- **B-029**：TensionTheme 合成 + Frye/Booker 標籤對應 + HITL 審核 API
- **B-030**：完整整合（本文件）+ 前端張力分析儀表板
