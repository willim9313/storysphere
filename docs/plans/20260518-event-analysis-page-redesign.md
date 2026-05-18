# 事件分析頁重新設計 — Design Handoff

**日期**：2026-05-18
**範疇**：`/books/:bookId/events`（`EventAnalysisPage` 及其底下 `components/analysis/EventAnalysisDetail`、`BatchEepPanel`）
**設計系統**：沿用既有 Token 系統；Token 來源唯一為 `frontend/src/styles/tokens.css`（對照表見 `docs/DESIGN_TOKENS.md`）
**設計參考**：無設計稿；請根據設計系統自行規劃，並參考 `CharacterAnalysisPage`（已完成重設計）的視覺語言與元件慣例維持一致性

---

## 1. 重新設計動機

- **痛點 1（EEP 可掃描性差）**：EEP 所有維度（摘要 / 狀態變化 / 參與者 / 因果 / 影響）全用同款 AnalysisAccordion 呈現。各維度資訊密度差異極大（summary 一段文字 vs. participantRoles 複雜列表），卻沒有任何視覺層次區分，使用者難以快速定位關鍵維度
- **痛點 2（BatchEepPanel 進度視覺弱）**：進度條過小（`h-1.5`）、執行中只有 spinner + 一行文字，缺乏完成感與階段感；使用者不易判斷批次是否正常執行
- **痛點 3（與角色分析頁風格不一致）**：CharacterAnalysisPage 已完成重設計，EventAnalysisPage 仍是舊風格；兩頁共用版面骨架（260px 左清單 + 內容區），視覺語言卻落差明顯
- **痛點 4（清單資訊密度不足）**：清單 item 目前只顯示事件名稱，無法快速辨識事件重要性（KERNEL / SATELLITE）或所屬章節，使用者需要進入詳情才能判斷優先閱讀順序
- **主要使用者情境**：
  - 分析者批次生成所有 EEP 後，逐一審閱各事件的主題意義（thematicSignificance）與影響
  - 讀者想快速定位某類型（KERNEL）事件，了解其前後因果鏈
- **成功指標**：清單掃描速度提升（事件重要性一眼可辨）；EEP 詳情各維度層次感清晰，不需逐一展開才能判斷內容

---

## 2. 範疇（hard scope）

### 包含
- 主畫面 `EventAnalysisPage`（左側清單 + 內容區）
- 左側清單：`BatchEepPanel`、搜尋欄、已分析/未分析分組、清單 item（AnalyzedItem / UnanalyzedItem）
- 內容區頂部：事件名 + 「覆蓋重新生成」按鈕
- 事件分析詳情：`EventAnalysisDetail`（目前全用 `AnalysisAccordion`）
- BatchEepPanel 的進度視覺
- 各種狀態：loading / 未選擇事件 / 未生成 / 生成中（task polling）/ 生成失敗 / 觸發錯誤

### 不包含（保留現狀）
- 後端 API 形狀（response schema 不動，僅外觀與排版可改）
- 路由與資料載入策略（React Query keys、URL 結構不動）
- Task polling 機制（`useTaskPolling`、generateTaskId 狀態機不動）
- `AnalysisAccordion` 元件本身的 DOM 結構（若繼續沿用），但樣式可調整
- `AnalyzedItem` / `UnanalyzedItem` 共用元件的既有 props 介面（可擴充，不可移除現有 props）

---

## 3. 現況快照（必讀，避免憑空設計）

### 3.1 資訊架構

```
[Left Panel 260px]                [Content Area flex (p-6, overflow-y)]
  ├─ BatchEepPanel                  ├─ 標題列：event title (serif) + 「覆蓋重新生成」按鈕
  │   ├─ header: "事件分析 12/30"   │
  │   ├─ 進度條 (h-1.5)             ├─ EventAnalysisDetail（AnalysisAccordion × 8 sections）
  │   └─ 「一鍵生成全部 EEP」按鈕   │
  ├─ 搜尋欄                         └─ （無 Tab；與角色分析頁不同，目前只有單一詳情視圖）
  └─ 清單（可捲動）
      ├─ 已分析 (N)
      │   └─ AnalyzedItem [name][●]
      └─ 尚未分析 (M)
          └─ UnanalyzedItem [name][建立]
```

### 3.2 EventAnalysisDetail 8 個 section 的內容

| Section | 來源欄位 | 現況呈現 |
|---------|---------|---------|
| 事件摘要 | `summary.summary` | 純文字 |
| 狀態變化 | `eep.stateBefore` + `eep.stateAfter` + `eep.structuralRole` + `eep.eventImportance` + `eep.thematicSignificance` | bold label + 文字，全塞一個 accordion |
| 參與者角色 | `eep.participantRoles[]`（entityName + role + impactDescription） | bullet list |
| 因果分析 | `causality.rootCause` + `causality.causalChain[]` + `causality.chainSummary` | numbered list |
| 影響 | `impact.impactSummary` + `impact.participantImpacts[]` + `impact.relationChanges[]` | 混合段落 + bullet |
| 因果因素 | `eep.causalFactors[]` | bullet list |
| 後果 | `eep.consequences[]` | bullet list |
| 關鍵台詞 | `eep.keyQuotes[]` | blockquote |

> **注意**：「狀態變化」accordion 把 5 個語意截然不同的欄位（before/after 狀態、結構角色、重要性、主題意義）全塞成一段 markdown，是可掃描性最差的地方，建議優先重構。

### 3.3 事件重要性（KERNEL / SATELLITE）

- `eventImportance` 值為 `'KERNEL'` 或 `'SATELLITE'`（見 `docs/domain-glossary.md` § event_importance）
- KERNEL = 故事驅動的關鍵事件；SATELLITE = 補充細節的支線事件
- 目前清單 item **沒有顯示**這個欄位（只有詳情頁才能看到），是清單資訊不足的主因

### 3.4 主要互動流程

```
進入頁面
  → 載入 GET /books/:bookId/analysis/events
  → 無預設選中（顯示「選擇一個事件」提示）

點擊已分析事件：
  → 載入 GET /books/:bookId/events/:eventId/analysis
  → 顯示 EventAnalysisDetail

點擊未分析事件：
  → 顯示「未生成」引導，按「建立」→ trigger #7e → polling #8
  → 完成後 invalidate query，清單更新，內容刷新

點「一鍵生成全部 EEP」：
  → ConfirmDialog → trigger #7g → polling（每 3 秒）
  → 進度即時更新（invalidate events list）
  → 完成：batchSummary toast

點「覆蓋重新生成」：
  → ConfirmDialog → DELETE #7f → re-trigger #7e → polling
```

### 3.5 狀態機（content area）

| 狀態判定條件 | 顯示內容 |
|------------|---------|
| `!selectedEntityId` | 「選擇一個事件」提示 |
| `selectedEntityId && detailLoading` | LoadingSpinner |
| `eventDetail` 存在 | 標題列 + EventAnalysisDetail |
| `genTask.status === 'error'` | 錯誤訊息 + 重試按鈕 |
| `generateTaskId && genTask.status !== 'done'` | LoadingSpinner + stage/progress |
| `selectedUnanalyzed` | 「未生成」引導 + 建立按鈕 |
| `triggerError` | 錯誤訊息 + 確認按鈕 |

---

## 4. 資料 / API 參考

### 主要型別（完整定義見 `frontend/src/api/generated.ts`）

```ts
interface EventAnalysisDetail {
  eventId: string;
  title: string;
  eep: EventEvidenceProfile;
  causality: CausalityAnalysis;
  impact: ImpactAnalysis;
  summary: { summary: string };
  analyzedAt: string;
}

interface EventEvidenceProfile {
  stateBefore: string;
  stateAfter: string;
  causalFactors: string[];
  priorEventIds: string[];
  subsequentEventIds: string[];
  participantRoles: ParticipantRole[];  // { entityName, role, impactDescription }
  consequences: string[];
  structuralRole: string;
  eventImportance: string;  // 'KERNEL' | 'SATELLITE'
  thematicSignificance: string;
  textEvidence: string[];
  keyQuotes: string[];
  topTerms: Record<string, number>;
}

interface CausalityAnalysis {
  rootCause: string;
  causalChain: string[];
  chainSummary: string;
}

interface ImpactAnalysis {
  impactSummary: string;
  participantImpacts: string[];
  relationChanges: string[];
}

interface BatchEepResult {
  progress: number;
  total: number;
  failed: number;
  skipped: number;
}
```

### 相關 endpoints（完整定義見 `docs/API_CONTRACT.md`）

- `#6b` 事件清單：`GET /books/:bookId/analysis/events`
- `#7d` 事件分析詳情：`GET /books/:bookId/events/:eventId/analysis`
- `#7e` 觸發單一分析：`POST /books/:bookId/events/:eventId/analyze`
- `#7f` 清除分析：`DELETE /books/:bookId/events/:eventId/analysis`
- `#7g` 批次 EEP：`POST /books/:bookId/events/analyze-all`
- `#8`  Task polling

---

## 5. 必要保留（hard constraint）

- **資料形狀**：API response schema 不動（重設計 = 視覺與排版，非後端）
- **Task polling 流程**：trigger → polling → invalidate → 刷新，這個 flow 不動
- **Token 制度**：禁止硬編碼色碼；色碼一律用 `var(--*)`；新增 token 必須同步更新 `docs/DESIGN_TOKENS.md`
- **TypeScript 型別來源**：一律從 `frontend/src/api/generated.ts` 取，不可在 `types.ts` 手寫新增
- **i18n**：所有文案必須走 `useTranslation('analysis')`，不可硬寫中文/英文
- **版面骨架與角色分析頁一致**：左側 260px 清單 + 右側內容區；兩頁重設計後應能共用視覺語言
- **ConfirmDialog 機制**：批次執行與覆蓋重新生成都需要保留確認視窗

---

## 6. 可變更的設計面向

- **EventAnalysisDetail 的排版結構**：現況 8 個 section 全用同款 accordion，可改成：
  - 頂部 hero card（摘要 + KERNEL/SATELLITE badge + thematicSignificance）+ 下方 sub-sections
  - 因果分析獨立成 timeline 式視覺
  - 參與者角色改成 entity card 列表（含 avatar）
  - 狀態變化拆成 before/after 並排卡片
- **BatchEepPanel 視覺**：
  - 進度條可加粗（`h-2.5` 或更高）、加動態效果
  - 執行中可加每個事件完成的 tick 動畫
  - 完成態可顯示數字統計卡（analyzed / skipped / failed）
- **清單 item（AnalyzedItem）資訊**：可加 KERNEL/SATELLITE badge、章節號、事件類型 icon
- **未分析 item 的「建立」按鈕時機**：現況滑過才顯示，可改常駐或調整樣式
- **狀態頁（empty / loading / error / 未生成）** 的呈現（可對齊角色分析頁的設計）
- **「覆蓋重新生成」按鈕的位置與樣式**（現況常駐標題列 secondary 按鈕）
- **內容區是否加 Tab**：目前無 Tab；若 EEP 資訊量重新組織後仍複雜，可考慮加「概覽 / 因果 / 影響」Tab

---

## 7. 與角色分析頁的一致性參考

這兩頁共用版面骨架。設計時請參考 `CharacterAnalysisPage`（已完成重設計）的：

- 左側清單 item 的 padding / icon / 選中狀態樣式
- 內容區頂部標題列（serif + 右側 action 按鈕群）的規格
- empty / loading / error 狀態頁的呈現方式
- CSS class 命名慣例（角色分析用 `.ca-*` prefix；事件分析請用 `.ea-*` prefix）

完整樣式見：
- `frontend/src/styles/character-analysis.css`
- `frontend/src/pages/CharacterAnalysisPage.tsx`
- `frontend/src/components/analysis/CharacterAnalysisDetail.tsx`

---

## 8. 對應 UI_SPEC 與 API_CONTRACT 段落（直接引用，不重複內容）

- UI 規格細節：`docs/UI_SPEC.md` § 3.5（事件分析頁）
- API 規格：`docs/API_CONTRACT.md` § 6b / 7d / 7e / 7f / 7g / 8
- Token 對照表：`docs/DESIGN_TOKENS.md`
- 領域術語（EEP 各維度）：`docs/domain-glossary.md` § EEP
- 既有元件：
  - `frontend/src/pages/EventAnalysisPage.tsx`
  - `frontend/src/components/analysis/EventAnalysisDetail.tsx`
  - `frontend/src/components/analysis/BatchEepPanel.tsx`
  - `frontend/src/components/analysis/AnalysisListItems.tsx`（AnalyzedItem / UnanalyzedItem 共用）
  - `frontend/src/hooks/useEventAnalysis.ts`
  - `frontend/src/api/analysis.ts`
