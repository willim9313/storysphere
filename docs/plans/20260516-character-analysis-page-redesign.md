# 角色分析頁重新設計 — Design Handoff

**日期**：2026-05-16
**範疇**：`/books/:bookId/characters`（`CharacterAnalysisPage` 及其底下 `components/analysis/*`）
**設計系統**：沿用既有 Claude Design 中已上傳之 design system；Token 來源唯一為 `frontend/src/styles/tokens.css`（對照表見 `docs/DESIGN_TOKENS.md`）

---

## 1. 重新設計動機（待填）

> ⚠️ 開始實作前必須填妥此節，否則設計會缺少方向。

- 痛點 1：（例：Accordion 全部塞 markdown，可掃描性低；切框架後使用者要重新展開）
- 痛點 2：（例：Voice / Overview / Epistemic 三塊資訊密度不一致，視覺權重失衡）
- 痛點 3：
- 主要使用者情境（user flow）：
  - 例：讀者讀完幾章，想看某角色的原型定位與目前的認知盲區
  - 例：作者想比對 Jung 與 Schmidt 兩框架在同一角色上的差異
- 成功指標（怎樣算重新設計成功）：

---

## 2. 範疇（hard scope）

### 包含
- 主畫面 `CharacterAnalysisPage`（左側清單 + 內容區）
- 左側清單：`AnalyzedItem` / `UnanalyzedItem`、框架切換 chip、搜尋欄、已分析/未分析分組
- 內容區頂部：角色名 + 框架 badge + 「在圖譜中查看 ↗」+「覆蓋重新生成」按鈕
- Detail Tab 切換（`overview` / `voice`）
- Overview 內容：`CharacterAnalysisDetail` + `AnalysisAccordion`（8 個 section）
- Voice 內容：`VoiceProfilingPanel`（4 個 stat card + tone badge + speech style + patterns + quotes）
- Overview 底部：`EpistemicStateSection`（章節 slider + 已知/未知/誤信三 section）
- 各種狀態：loading / 未選擇角色 / 未生成 / 生成中（task polling）/ 生成失敗 / Voice 未請求

### 不包含（保留現狀）
- 後端 API 形狀（response schema 不動，僅外觀與排版可改）
- 路由與資料載入策略（React Query keys、URL 結構不動）
- Jung / Schmidt 框架資料定義（`frameworksData.ts` 不動）
- Markdown 渲染管線（`MarkdownRenderer` 內部實作不動，但呼叫方式可改）
- Task polling 機制（`useTaskPolling`、generateTaskId 狀態機不動）

---

## 3. 現況快照（必讀，避免憑空設計）

### 3.1 資訊架構

```
[Left Panel 260px]                [Content Area flex (p-6, overflow-y)]
  ├─ Framework chips (Jung 12 |     ├─ 標題列：name (serif) + framework badge
  │   Schmidt 45) + 框架索引 ↗      │   + 「在圖譜中查看 ↗」+「覆蓋重新生成」
  ├─ 搜尋欄                          ├─ Detail Tab：[ overview | voice ]
  └─ 清單（可捲動）                  ├─ overview：
      ├─ 已分析 (N)                  │   ├─ 框架切換 chip（重複，與左側同步）
      │   └─ AnalyzedItem            │   ├─ 框架缺資料時：橫幅 + 重生按鈕
      │       [avatar][name][arch][●]│   └─ AnalysisAccordion（8 sections，
      └─ 尚未分析 (M)                │        預設展開前 2 個）
          └─ UnanalyzedItem          ├─ voice：VoiceProfilingPanel
              [avatar][name][建立]   └─ 分隔線 → EpistemicStateSection
                                          ├─ 章節 slider
                                          ├─ 已知事件（綠）
                                          ├─ 未知事件（橘）
                                          └─ 誤信 (misbeliefs)（紅）
```

### 3.2 Accordion 8 個 section 的內容（overview）

| Section | 來源欄位 | 備註 |
|---------|---------|------|
| 角色側寫 | `profileSummary` | 純文字 |
| 原型（Jung 或 Schmidt） | `archetypes[framework]` | subtitle = primary，body = primary/secondary/confidence/evidence |
| 性格特徵 | `cep.traits[]` | bullet list |
| 行動模式 | `cep.actions[]` | bullet list |
| 關係動力 | `cep.relations[]` | target + type + description |
| 關鍵事件 | `cep.keyEvents[]` | event + chapter + significance |
| 代表台詞 | `cep.quotes[]` | blockquote |
| 角色弧線 | `arc[]` | chapterRange + phase + description，多段 `---` 分隔 |

### 3.3 框架切換的雙位置設計（注意）

目前 framework chip **在左側清單頂部與 overview 頂部都有一份**，兩處共用同一個 `framework` state。redesign 時要決定：
- 保持兩處同步（現況），還是合併到單一位置
- 切換框架時不重新請求 API（只切換顯示），這是現況保留邏輯

### 3.4 主要互動流程

```
進入頁面
  → 載入 GET /books/:bookId/analysis/characters
  → 預設不選中任何角色（顯示「選擇一個角色」提示）

點擊已分析角色：
  → 載入 GET /books/:bookId/entities/:entityId/analysis
  → 預設 overview tab

點擊未分析角色：
  → 顯示「未生成」引導，按「建立」→ trigger #7b → polling #8
  → 完成後 invalidate query，內容刷新

點 Voice tab：
  → 若 localStorage 已標記過 → 自動載入
  → 否則顯示空狀態 + 「分析」按鈕

切換框架：
  → 不打 API，只切換 archetype 顯示
  → 若該框架尚未產出（archetypes 沒對應 framework）→ 顯示橫幅 + 重生按鈕

點「覆蓋重新生成」：
  → ConfirmDialog → DELETE 舊資料 → 重觸發 → polling
```

### 3.5 狀態機（content area）

| 狀態判定條件 | 顯示內容 |
|------------|---------|
| `!selectedEntityId` | 「選擇一個角色」提示 |
| `selectedEntityId && analysisLoading` | LoadingSpinner |
| `entityAnalysis` 存在 | 完整內容（標題列 + Tab + Accordion + Epistemic） |
| `genTask.status === 'error'` | 錯誤訊息 + 重試按鈕 |
| `generateTaskId && genTask.status !== 'done'` | LoadingSpinner + stage/progress |
| `selectedUnanalyzed` | 「未生成」引導 + 建立按鈕 |
| `triggerError` | 錯誤訊息 + 確認按鈕 |

---

## 4. 資料 / API 參考

### 主要型別（完整定義見 `frontend/src/api/generated.ts`）

```ts
interface CharacterAnalysisDetail {
  entityId: string;
  entityName: string;
  profileSummary: string;
  archetypes: ArchetypeDetail[];   // 一定包含 Jung 與 Schmidt 兩份（若已生成）
  cep: CepData | null;             // traits / actions / relations / keyEvents / quotes
  arc: ArcSegment[];
  generatedAt: string;
}

interface ArchetypeDetail {
  framework: string;               // 'jung' | 'schmidt'
  primary: string;
  secondary: string | null;
  confidence: number;              // 0–1
  evidence: string[];
}

interface ArcSegment {
  chapterRange: string;
  phase: string;
  description: string;
}
```

### 相關 endpoints（完整定義見 `docs/API_CONTRACT.md`）

- `#6a` 角色清單：`GET /books/:bookId/analysis/characters`
- `#6c` 重新生成：`POST /books/:bookId/analysis/:section/:itemId/regenerate`
- `#7a` 深度分析：`GET /books/:bookId/entities/:entityId/analysis`
- `#7b` 觸發分析：`POST /books/:bookId/entities/:entityId/analyze`（一律同時產生 Jung + Schmidt，**前端切換框架不重打**）
- `#7c` 清除分析：`DELETE /books/:bookId/entities/:entityId/analysis`
- `#8`  Task polling
- `#12e` 認知狀態：`GET /books/:bookId/entities/:entityId/epistemic-state`
- `#16a` 語音風格、`#16b` 清除語音風格

---

## 5. 必要保留（hard constraint）

- **資料形狀**：API response schema 不動（重設計 = 視覺與排版，非後端）
- **Task polling 流程**：trigger → polling → invalidate → 刷新，這個 flow 不動
- **Token 制度**：禁止硬編碼色碼；色碼一律用 `var(--*)`；新增 token 必須同步更新 `docs/DESIGN_TOKENS.md`
- **TypeScript 型別來源**：一律從 `frontend/src/api/generated.ts` 取，**不可在 `types.ts` 手寫新增**
- **與其他頁面的視覺一致性**：
  - 「在圖譜中查看 ↗」跳到 `/books/:bookId/graph?entity=:entityId` 必須維持
  - 與 `EventAnalysisPage` 共用「左清單 260px + 內容區」的版面骨架，redesign 時若要改版面，要同步考慮事件分析頁
- **localStorage flag**：`voice_generated:${bookId}:${entityId}` 不動（用於 Voice 自動載入）
- **i18n**：所有文案必須走 `useTranslation('analysis')`，不可硬寫中文/英文

---

## 6. 可變更的設計面向

- **Accordion 結構本身可換掉**：現況 8 個 section 全用同款 accordion，可改成 hero card + sub-section 混搭、或多欄佈局
- **框架切換的位置與形態**：chip / segmented control / tab，二選一或合併
- **左側清單 item 視覺**：avatar 樣式、archetype 標籤呈現方式、狀態點（●）的存在與位置
- **Overview / Voice / Epistemic 三塊的層級關係**：現況是「Tab 切換 + Epistemic 永遠掛在 Overview 下方」，可重新組織（例：3-tab、或合併成 dashboard 式單頁）
- **Voice 4 個 stat card 的呈現**：現況 grid，可改 inline、可加視覺化（mini-chart）
- **Epistemic 三類 (known/unknown/misbelief)** 的視覺權重（現況都是 list，misbelief 卡片較重）
- **狀態頁（empty / loading / error / 未生成）** 的呈現
- **Detail Tab 的視覺**（現況 segmented，可改 underline tab / pill / 其他）
- **「覆蓋重新生成」按鈕的位置與時機**（現況常駐標題列）

---

## 7. 待用戶確認

- [ ] 第 1 節痛點與情境是否填妥？
- [ ] Voice tab 是否值得提升為一級導覽（與 Overview 平級的 Tab）？還是內嵌到 Overview 變成一個 section？
- [ ] Epistemic 區塊是否應從 Overview 抽離成第三個 Tab？目前掛在最下方容易被忽略
- [ ] 是否要做 framework 對照模式（Jung vs Schmidt 並排）？
- [ ] 是否同時考慮事件分析頁 `/books/:bookId/events`？兩頁共用版面骨架，建議同步 redesign
- [ ] 是否要支援 dark mode 設計，還是先做亮色四主題？
- [ ] 行動裝置是否需考慮？（目前頁面是桌面導向）

---

## 8. 對應 UI_SPEC 與 API_CONTRACT 段落（直接引用，不重複內容）

- UI 規格細節：`docs/UI_SPEC.md` § 3.4（角色分析頁）
- API 規格：`docs/API_CONTRACT.md` § 6a / 6c / 7a / 7b / 7c / 8 / 12e / 16a / 16b
- Token 對照表：`docs/DESIGN_TOKENS.md`
- 框架資料：`frontend/src/data/frameworksData.ts`
- 既有元件：
  - `frontend/src/pages/CharacterAnalysisPage.tsx`
  - `frontend/src/components/analysis/CharacterAnalysisDetail.tsx`
  - `frontend/src/components/analysis/AnalysisAccordion.tsx`
  - `frontend/src/components/analysis/AnalysisListItems.tsx`
  - `frontend/src/components/analysis/VoiceProfilingPanel.tsx`
  - `frontend/src/components/analysis/EpistemicStateSection.tsx`
  - `frontend/src/hooks/useCharacterAnalysis.ts`
  - `frontend/src/api/analysis.ts`
