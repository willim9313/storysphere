# 敘事結構頁：英雄旅程區塊設計規格

**建立日期**: 2026-06-01
**對應頁面**: `/books/:bookId/narrative`（敘事結構頁）
**對應 Backlog**: B-045
**狀態**: 規格確認，待實作

---

## 一、頁面定位

新增路由 `/books/:bookId/narrative`，為張力（TensionPage）和符號（SymbolsPage）之外的第三條平行分析線。

頁面分為兩個 section：

```
[英雄旅程區塊]   ← 主視圖，佔頁面大部分
[情節骨幹摘要]   ← 次要，書級 Kernel/Satellite 統計 + 跳轉至事件分析頁
```

英雄旅程是本頁最獨特的輸出（時間軸頁沒有），是主視圖。Kernel/Satellite 細節在事件分析頁，此處只顯示書級摘要統計。

---

## 二、英雄旅程理論基礎

Joseph Campbell《千面英雄》（1949），採用 **Vogler 1992 好萊塢改編版**（12 階段）。

| 相位 | 階段 `stage_id` |
|------|----------------|
| **啟程 Departure** | `ordinary_world` |
| | `call_to_adventure` |
| | `refusal_of_call` |
| | `meeting_the_mentor` |
| | `crossing_threshold` |
| **啟蒙 Initiation** | `tests_allies_enemies` |
| | `approach_innermost_cave` |
| | `ordeal` |
| | `reward` |
| **回歸 Return** | `road_back` |
| | `resurrection` |
| | `return_with_elixir` |

---

## 三、設計核心原則

### 不是進度條

缺席的階段是有意義的敘事選擇，不是「未完成」。禁止使用進度條語意或「12/12 完成度」作為主視覺。

### 三種顯示狀態

| 狀態 | 條件 | 視覺處理 |
|------|------|---------|
| `filled` — 已識別 | `chapter_range.length > 0` 且 `confidence ≥ 0.6` | 完整顯示 |
| `low-confidence` — 低信心 | `chapter_range.length > 0` 且 `confidence 0.3–0.6` | 顯示但有警示標記 |
| `absent` — 未識別 | `chapter_range.length === 0` | 顯示「—」，不留空白 |

三態必須一眼可區分。

### 允許階段重疊

`chapter_range` 是章節編號（`list[int]`），相鄰階段可包含相同章節（例如 Ch.10 同時屬於「磨難」和「逼近最深處的洞穴」）。設計上不使用互斥的 timeline lane，要能處理重疊情況。

### 點擊展開詳情

點擊任一階段卡片展開：
- 系統生成的詮釋文字（`notes` 欄位，若有）
- 對應章節列表（`chapter_range`）
- 代表性 Kernel 事件 pill（`representative_event_ids`）

### 多主角作品

系統映射為「整體旅程」，多主角說明記錄在 `notes` 欄位，前端不需分角色顯示，在展開詳情時顯示 `notes` 即可。

---

## 四、後端資料結構（已實作）

### `HeroJourneyStage`（`src/storysphere/domain/narrative.py`）

```typescript
interface HeroJourneyStage {
  stage_id: string           // e.g. 'ordinary_world'
  stage_name: string         // 人類可讀名稱，e.g. '平凡世界'
  chapter_range: number[]    // 對應章節編號（int），可空陣列代表缺席
  representative_event_ids: string[]  // 代表性 Kernel 事件 ID
  confidence: number         // 0.0–1.0
  notes: string | null
}
```

### `NarrativeStructure`（`src/storysphere/domain/narrative.py`）

```typescript
interface NarrativeStructure {
  id: string
  document_id: string
  kernel_event_ids: string[]
  satellite_event_ids: string[]
  unclassified_event_ids: string[]
  classification_source: 'summary_heuristic' | 'llm_classified' | 'human_verified'
  hero_journey_stages: HeroJourneyStage[]
  review_status: 'pending' | 'approved' | 'rejected'  // HITL 狀態
}
```

### HITL `review_status` 映射

| 值 | 視覺狀態 |
|----|---------|
| `pending` | system generated（未審閱）|
| `approved` | human approved |
| `rejected` | 標記為不適用 |

---

## 五、API（已實作）

| 操作 | Endpoint | Contract |
|------|----------|---------|
| 觸發英雄旅程分析 | `POST /api/v1/narrative/hero-journey` | #21e |
| 輪詢任務狀態 | `GET /api/v1/narrative/hero-journey/:taskId` | #21f |
| 取得 NarrativeStructure | `GET /api/v1/narrative` | #21k |

---

## 六、前端需新增的檔案

| 檔案 | 說明 |
|------|------|
| `frontend/src/api/narrative.ts` | API wrapper（目前不存在）|
| `frontend/src/pages/NarrativePage.tsx` | 敘事結構頁主頁面 |
| `frontend/src/components/narrative/` | 英雄旅程相關元件目錄 |

`api/narrative.ts` 至少需封裝：
- `triggerHeroJourney(bookId, language)` → POST #21e
- `fetchNarrativeStructure(bookId)` → GET #21k

---

## 七、前端實作約束

1. **Token 制度** — 所有顏色走 `var(--*)` CSS token，新增 token 需同步更新 `docs/DESIGN_TOKENS.md`
2. **i18n** — 所有文案走 `useTranslation('analysis')`，key 前綴 `narrative.*`
3. **階段文案來源** — `src/storysphere/config/hero_journey/hero_journey_zh.json` 和 `hero_journey_en.json`，不要在前端硬寫；`frontend/src/data/frameworksData.ts` 的 `hero_journey` key 有部分重疊內容可參考
4. **避免與時間軸頁重疊** — 參考 `docs/plans/20260519-timeline-page-redesign.md`，敘事結構頁不重複顯示已在時間軸頁呈現的 narrativeMode 資訊
5. **樣式慣例** — 參考 `frontend/src/styles/character-analysis.css` 和 `event-analysis.css`

---

## 八、需要閱讀的檔案（實作前）

- `src/storysphere/config/hero_journey/hero_journey_zh.json` — 12 個階段中文定義與描述
- `src/storysphere/config/hero_journey/hero_journey_en.json` — 英文版
- `src/storysphere/domain/narrative.py` — 完整 domain model
- `docs/API_CONTRACT.md` — #21e、#21f、#21k
- `src/storysphere/api/routers/narrative.py` — endpoint 實作細節
- `frontend/src/data/frameworksData.ts` — 現有 hero_journey 前端說明文字
- `docs/plans/20260519-timeline-page-redesign.md` — 避免重疊
- `frontend/src/styles/tokens.css` — CSS token 完整列表

---

## 九、Definition of Done

- [ ] `frontend/src/api/narrative.ts` 建立，封裝 triggerHeroJourney / fetchNarrativeStructure
- [ ] `NarrativePage.tsx` 可正常顯示英雄旅程 12 階段，三態視覺可區分
- [ ] 點擊階段可展開詳情（notes、chapter_range、representative_event_ids）
- [ ] 情節骨幹摘要區塊顯示 kernel/satellite 書級統計
- [ ] `BookNav` 新增「敘事結構」入口
- [ ] 所有文案走 i18n，key 前綴 `narrative.*`
- [ ] 新增 CSS token 已同步更新 `docs/DESIGN_TOKENS.md`
- [ ] `npm run lint` 和 `ruff check src/` 無新增錯誤
- [ ] BACKLOG.md B-045 狀態更新
