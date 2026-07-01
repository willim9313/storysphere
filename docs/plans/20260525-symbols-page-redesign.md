# 符號意象頁重新設計 — Design Handoff

**日期**：2026-05-25
**範疇**：`/books/:bookId/symbols`（`SymbolsPage` 及其底下 `ChapterDistChart` / `ImageryItem` / `TimelineRow` / `SymbolDetail` / `EmptyState`）
**設計系統**：沿用既有 Token 系統；Token 來源唯一為 `frontend/src/styles/tokens.css`（對照表見 `docs/DESIGN_TOKENS.md`）
**設計參考**：無設計稿；請根據設計系統自行規劃，並參考 `EventAnalysisPage` / `CharacterAnalysisPage` / `TimelinePage` / `TensionPage`（已完成重設計）的視覺語言與元件慣例維持一致性

---

## 1. 重新設計動機

- **主要痛點：頁面只暴露了 3/8 個後端 endpoint，能力嚴重未對齊**。
  - 現在只接了 `#15a list` / `#15b timeline` / `#15c co-occurrences`。**完全沒有入口**呼叫 `#15d SEP` / `#15e analyze（LLM 詮釋）` / `#15f polling` / `#15g get interpretation` / `#15h HITL review`。
  - 後端早已支援「對單一意象觸發 LLM 詮釋 → 取得 `theme` / `polarity` / `evidence_summary` / `linked_characters` / `linked_events` / `confidence` → HITL 審核 approve/modify/reject」整套流程，前端卻只給使用者看「出現次數 + 章節分布 + 共現詞 + 出現紀錄」這種純統計層。
  - 使用者沒辦法回答最關鍵的問題：「**這個意象在這本書裡到底象徵什麼？**」
- **次要觀察**：
  - 詳情區資訊密度低：220px 章節 bar chart + 共現 pills + 出現紀錄 list 三塊上下堆，沒有主從關係，也沒有「結論在上、佐證在下」的閱讀引導
  - `ChapterDistChart` SVG 寬度由意象的章節數動態決定（`BAR_W=18` × N），長書（>40 章）會橫向 scroll，且**完全沒有與張力線 / 事件節點對齊**，無法做跨頁脈絡比對
  - 共現詞只能在 pill 之間跳，看不到「兩個意象一起出現在哪幾段」；`linked_characters` / `linked_events`（即使從 #15g 拿到）也沒有跳轉到 KG / Event 詳情的路徑
  - 左側清單只能用 type filter + 關鍵字搜尋。沒有「按出現頻率」、「按首次出現章節」、「按 polarity」、「按審核狀態」等排序維度
  - EmptyState 過於簡陋（`Telescope` icon + 兩行文字），沒有說明意象是如何被萃取的、何時會有資料、為何沒資料
  - i18n key 放在 `settings.json` 的 `symbols.*` namespace，**與其他分析頁（`analysis.json`）不一致**；新增詮釋相關 key 時需評估是否搬家
- **主要使用者情境**：
  - 第一次進頁面：能在 3 秒內理解「這頁列出了書中所有重複出現的象徵意象，可以挑一個看它在這本書裡的意義」
  - 已有資料：能快速掃完 N 個意象，挑出高頻或感興趣的 → 觸發 LLM 詮釋 → 審核 theme / polarity → 跨連到相關角色 / 事件
  - 進階：比較兩個意象的共現脈絡（例：「光」與「鏡子」是否總是同章出現）
- **成功指標**：頁面能讓使用者實際完成「挑意象 → 看詮釋 → 審核 → 跨連」的完整工作流；意象不再只是統計，而是有語意的分析單位

---

## 2. 範疇（hard scope）

### 包含
- 主畫面 `SymbolsPage`（雙欄：左 240px 清單 + 右 flex 詳情）
- 左側 Panel：類型 filter chip + 搜尋欄 + 意象清單（`ImageryItem`）
- 右側 Detail：標題區、`ChapterDistChart`、共現詞區、出現紀錄列表（`TimelineRow`）
- 各種狀態：list loading / empty（無資料） / not selected / detail loading / interpretation 三狀態（尚未生成 / 生成中 / 已生成 + 審核四狀態）
- **新增**：LLM 詮釋觸發 / 進度 / 結果面板（連 `#15d–#15h`）
- **新增**：HITL 審核 UI（pending / approved / modified / rejected 四狀態，含 inline modify theme / polarity）
- **新增**：linked_characters / linked_events 跨頁跳轉 affordance

### 不包含（保留現狀）
- 後端 API 形狀（`ImageryEntity` / `SEP` / `SymbolInterpretation` 不動，僅外觀與排版可改）
- 路由 `/books/:bookId/symbols` 不動
- 意象萃取的觸發機制（書籍上傳時自動執行，不在本頁觸發）
- ChatContext 整合（`setPageContext({ page: 'analysis', bookId, bookTitle })`，注意 page key 是 `'analysis'` 不是 `'symbols'`）
- 6 種 `ImageryType`（object / nature / spatial / body / color / other）的值域與配色 token 對應

---

## 3. 現況快照（必讀，避免憑空設計）

### 3.1 資訊架構

```
[Left Panel 240px,bg-secondary,border-right]
  ├─ Type filter chips（flex-wrap,padding 3 0 2）
  │   ├─ All (N)              ← 灰底/accent active
  │   └─ {object/nature/spatial/body/color/other} (N)  ← 各自 symbol-*-bg 配色,active=dot
  ├─ Search bar（bg-tertiary）
  │   └─ 🔍 placeholder 「搜尋意象…」
  └─ Imagery list（flex-1,overflow-y-auto）
      └─ ImageryItem × N
           [● dot] term            [freq badge]
                   aliases…

[Content Area flex-1,overflow-y-auto]
  └─ 選中時 → SymbolDetail（maxWidth 720,padding 24/20,單欄置中）
       ├─ Header
       │   h1（serif）+ type pill + freq 文字
       │   aliases 行（小字 muted）
       ├─ Chapter Dist Card（border + bg-secondary, padding 16, radius 10）
       │   📖 章節分布   首見第 N 章（右側 muted）
       │   SVG bar chart（BAR_W=18, MAX_H=48）
       ├─ Co-occurrences Card（同樣式）
       │   🔗 共現意象
       │   {term + count} pills × N（點擊切換選中）
       └─ Occurrences Card（border + 子列表）
           Header: 🔭 出現紀錄    {count} 筆
           TimelineRow × N
             [Ch.N / #pos]  context_window…    {co_occurring_terms tags}

  └─ 未選中 → EmptyState
       Telescope icon (40px, opacity 0.25)
       hasData ? 「選擇左側意象以查看詳細資訊」
              : 「尚無符號意象資料」+「重新上傳書籍後將自動執行意象萃取」
```

### 3.2 `ImageryItem`（左側列）

- 整列 button（hover/active 用 `bg-tertiary`）
- 左：8px 圓點，色 = `symbol-{type}-dot`
- 中：term（12px medium）+ aliases（12px muted, `·` 分隔）
- 右：frequency badge（`bg-tertiary` / `fg-secondary`）
- 無強度視覺、無 polarity、無審核狀態 indicator

### 3.3 `ChapterDistChart`（SVG）

- 每章一根 bar，`BAR_W = 18`，`GAP = 3`，`MAX_H = 48`，`LABEL_H = 14`
- SVG 寬 = `entries.length * (BAR_W + GAP)` → 長書會橫向 scroll
- fill：`var(--accent)`，opacity 0.75（**單色，沒區分高低密度**）
- bar 下方標 章節序號（9px muted）
- bar 上方若 `cnt > 1` 標數字（9px `fg-secondary`）
- 無 hover tooltip、無 y 軸刻度、無 marginal indicator（峰值章節）

### 3.4 `TimelineRow`

- 左 40px 欄：`Ch{N}`（accent semibold）/ `#{position}`（muted）垂直堆
- 右 flex：`context_window`（12px `fg-secondary`，無前後文時顯示「（無前後文）」muted italic）
- 下方 `co_occurring_terms` tag pills（`bg-tertiary` / `fg-muted`，12px）
- 無 chapter 群組、無時間軸視覺、無「跳到閱讀頁」CTA

### 3.5 `SymbolDetail` 中段三 card

- Header 區：`h1` serif + type pill（`symbol-{type}-bg/fg`）+ freq 灰字
- aliases：`「異體：A、B、C」`（無 pill）
- 章節分布 card：`BookOpen` icon + 「章節分布」+ 首見章節（右側 muted）
- 共現意象 card：`Link2` icon + 「共現意象」+ pills（每個 pill = `symbol-{type}-bg/fg` + 內嵌 count）
- 出現紀錄 card：`Telescope` icon header + TimelineRow 列表（無分頁、無 chapter group）

### 3.6 EmptyState

- 全高置中，`Telescope` 40px（opacity 0.25），下方 1–2 行文字
- 無「意象萃取進度說明」、無「為何沒資料」診斷、無進入 unraveling 頁的 CTA

### 3.7 互動 / 狀態

| 狀態判定條件 | 顯示內容 |
|------------|---------|
| `listLoading` | 左側 LoadingSpinner |
| `entities.length === 0` | 左側 noData 文字 + 右側 EmptyState (hasData=false) |
| `entities.length > 0 && !selected` | 左側清單 + 右側 EmptyState (hasData=true) |
| `selected && timelineLoading` | 右側出現紀錄區 LoadingSpinner |
| `selected && coLoading` | 右側共現詞區 LoadingSpinner |
| `typeFilter` set | 左側清單只顯示該 type；其他 type chip 仍以 `symbol-*-bg` 顯示但 active 是被選中的那個 |
| `search` 有值 | 左側清單在 client side 過濾（term substring match） |

### 3.8 與其他頁面的整合

- `setPageContext({ page: 'analysis', bookId, bookTitle })`：**這頁 page key 是 `'analysis'`**（與 CharacterAnalysisPage / EventAnalysisPage / TensionPage 共用），不是 `'symbols'`。重設計時不要改
- 與 [CharacterAnalysisPage](../../frontend/src/pages/CharacterAnalysisPage.tsx)（L71）傳的 `analysisTab: 'characters'` 不同，**這頁沒有傳 `analysisTab`**——若改為與其他分析頁並列為 tab 形式，需評估是否補一個 `analysisTab: 'symbols'`
- 沒有跨頁跳轉（沒有「去看 KG」/「去 timeline 看」/「去 character 詳情」之類按鈕）
- 沒有 entity / event 選中同步（chat context 沒有 `selectedEntity` / `selectedEvent`）

---

## 4. 資料 / API 參考

### 主要型別

**目前 `ImageryEntity` / `SymbolTimelineEntry` / `CoOccurrenceEntry` 是手寫在 [`frontend/src/api/symbols.ts`](../../frontend/src/api/symbols.ts) L3–L33，不在 `generated.ts` 裡**（router 雖有 `response_model=`，但前端為了便利仍手寫）。`SEP` / `SymbolInterpretation` 完全沒有前端型別。

**欄位命名：snake_case（domain/ + api/schemas/symbols.py 都無 `alias_generator=to_camel`）**：

```ts
// 已有（接了 endpoint）
interface ImageryEntity {
  id: string;
  book_id: string;
  term: string;                                  // canonical form
  imagery_type: 'object'|'nature'|'spatial'|'body'|'color'|'other';
  aliases: string[];
  frequency: number;
  chapter_distribution: Record<string, number>;  // { "1": 3, "2": 1, ... } 注意 key 是 string
  first_chapter: number | null;
}

interface SymbolTimelineEntry {
  chapter_number: number;
  position: number;                              // 0-based within chapter
  context_window: string;                        // ~200 chars
  co_occurring_terms: string[];
  occurrence_id: string;
}

interface CoOccurrenceEntry {
  term: string;
  imagery_id: string;
  co_occurrence_count: number;
  imagery_type: string;
}

// 尚未接入（重設計需新增 caller 與 UI）
interface SEP {                                  // #15d
  id: string;
  imagery_id: string;
  book_id: string;
  term: string;
  imagery_type: string;
  frequency: number;
  occurrence_contexts: {
    occurrence_id: string;
    paragraph_id: string;
    chapter_number: number;
    position: number;
    paragraph_text: string;                      // 完整段落（比 timeline 的 context_window 更長）
    context_window: string;
  }[];
  co_occurring_entity_ids: string[];             // KG entity IDs
  co_occurring_event_ids: string[];              // Event IDs
  chapter_distribution: Record<string, number>;
  peak_chapters: number[];                       // 按頻率降序的頂點章節
  assembled_by: string;
  assembled_at: string;
}

interface SymbolInterpretation {                 // #15g
  id: string;
  imagery_id: string;
  book_id: string;
  term: string;
  theme: string;                                 // 1–2 句象徵主題命題
  polarity: 'positive' | 'negative' | 'neutral' | 'mixed';
  evidence_summary: string;                      // 2–3 句 SEP 佐證綜述
  linked_characters: string[];                   // KG entity IDs
  linked_events: string[];                       // Event IDs
  confidence: number;                            // 0–1
  assembled_by: string;
  assembled_at: string;
  review_status: 'pending' | 'approved' | 'modified' | 'rejected';
}

interface TaskStatus {                           // 共用,api/schemas/common.py(camelCase)
  taskId: string;
  status: 'pending' | 'running' | 'done' | 'error';
  progress?: number;                             // 0–100
  stage?: string;                                // 後端寫死,目前未統一中英文
  result?: unknown;
  error?: string;
}
```

### 相關 endpoints（完整定義見 `docs/API_CONTRACT.md` #15a–#15h）

| # | Method + Path | 用途 | 目前前端是否接入 |
|---|---------------|------|-----------------|
| #15a | `GET /symbols?book_id=X` | 列表 | ✓ |
| #15b | `GET /symbols/:imageryId/timeline` | 出現紀錄 | ✓ |
| #15c | `GET /symbols/:imageryId/co-occurrences?top_k=N` | 共現詞 | ✓ |
| #15d | `GET /symbols/:imageryId/sep?force=bool` | SEP（純資料彙整，無 LLM） | ✗ |
| #15e | `POST /symbols/:imageryId/analyze` | 觸發 LLM 詮釋 | ✗ |
| #15f | `GET /symbols/:imageryId/analyze/:taskId` | 詮釋專用 polling | ✗ |
| #15g | `GET /symbols/:imageryId/interpretation?book_id=X` | 取詮釋（404 = 尚未生成） | ✗ |
| #15h | `PATCH /symbols/:imageryId/interpretation` | HITL 審核 | ✗ |

> 注意：#15e–#15f 有**專用** polling endpoint，不走共用的 #8 `/tasks/:taskId/status`（與 Tension 三步驟同樣慣例）。

### 領域術語（完整見 `docs/domain-glossary.md`）

- **ImageryEntity**：書中重複出現、具象徵意義的詞條（如「鏡子」、「光」），含 canonical term + aliases（語義變體）
- **SymbolOccurrence**：單一段落中該意象的一次出現，含 chapter / position / 200 字 context window
- **SEP（Symbol Evidence Profile，B-022）**：純資料層彙整的「該意象的證據檔案」——所有出現脈絡 + 共現的 KG entity / event + 章節分布 + 峰值章節。是 #15e LLM 詮釋的輸入
- **SymbolInterpretation（B-040）**：LLM 對 SEP 的詮釋結果——一句 thematic proposition、polarity、證據綜述、最關聯的角色與事件、自報信心度。支援 HITL 審核
- **ImageryType**：六種粗分類——object（鏡、門、鑰匙）/ nature（水、光、火、月）/ spatial（房間、門檻、橋）/ body（手、眼、血）/ color（紅、白）/ other

---

## 5. 必要保留（hard constraint）

- **資料形狀**：8 個 endpoint 的 response schema 不動（重設計 = 視覺與排版，非後端）
- **`ImageryType` 六值**：`object / nature / spatial / body / color / other`，與 `--symbol-*` token 一一對應（已四主題完整定義）
- **`review_status` 四值**：`pending / approved / modified / rejected`（與 TensionLine / TensionTheme / Character / Event 共用語意：中性 / 成功綠 / 資訊藍 / 錯誤紅）
- **`polarity` 四值**：`positive / negative / neutral / mixed`——重設計時若要做視覺化，需新增 token 但不可改值域
- **Task polling 流程**：#15e/#15f 走專用 endpoint，不要改成走共用 #8
- **路由與資料載入策略**：路由 `/books/:bookId/symbols` 不動；現有 `useQuery` keys `['books', bookId, 'symbols', ...]` 結構不動，新增 SEP / interpretation query 時延續相同前綴
- **Token 制度**：禁止硬編碼色碼；色碼一律用 `var(--*)`；新增 token 必須同步更新 `docs/DESIGN_TOKENS.md`
- **TypeScript 型別來源**：理想上一律從 `frontend/src/api/generated.ts` 取；**目前 symbols 系列例外**（見 §7 技術債），重設計時不要新增手寫型別，而是評估是否能把 schema 拉進 generated.ts
- **i18n**：所有文案必須走 `useTranslation`；新增 key 必須 zh-TW + en 同步
- **ChatContext 整合**：`setPageContext({ page: 'analysis', bookId, bookTitle })` 不變
- **欄位命名陷阱**：取值時用 snake_case（`imagery_type` / `chapter_distribution` / `first_chapter` / `co_occurring_terms` / `linked_characters` / `peak_chapters` / `evidence_summary`...），非 camelCase
- **`chapter_distribution` 的 key 是 string**：JSON 化後 `{ "1": 3, ... }`，遍歷時要 `Number(ch)` 轉回

---

## 6. 可變更的設計面向

- **整頁版面骨架**：目前左 240 / 右 flex。可改：
  - 左清單加排序維度（freq / first chapter / polarity / review status）
  - 加「總覽」mode（先不選任何意象時，顯示整本書意象的 dashboard：類型分布、頻率長尾、章節密度熱圖）
  - 右側 detail 改三欄或上下分區（結論 hero / 證據 / 出現紀錄）
- **詳情區資訊層次（最重要）**：
  - **加入 `SymbolInterpretation` hero 區**：theme（serif 大字命題）+ polarity badge（pos/neg/neu/mixed 各自色）+ confidence meter + evidence_summary（敘述段）+ HITL 審核三按鈕（Approve / Modify / Reject）
  - **未生成詮釋時**：顯示 CTA「生成 LLM 詮釋」按鈕；點擊後進入 progress 視覺（呼叫 #15e → polling #15f → 完成自動 `refetch` #15g）
  - **生成中**：顯示 stage / progress（後端 `progress_callback` 會推進度）
  - **已生成 + pending**：呈現完整 interpretation + 顯眼的審核三按鈕
  - **已生成 + approved/modified/rejected**：顯示對應 status badge + 「重新生成」按鈕（`force_refresh: true`）
- **章節分布圖** (`ChapterDistChart`)：
  - 補 y 軸刻度或 max indicator
  - 用 `peak_chapters`（來自 SEP）標示峰值章節（marker / glow）
  - 改 token 化的漸層（low/mid/high density）取代單色 + opacity
  - hover 顯示「該章 N 次 + 該章共現 top-3 詞」
  - 長書時改 sticky / collapse / scroll 處理
- **共現意象**：
  - 加「共現強度」視覺（pill 大小 / 邊框粗細 / 漸層 by count）
  - hover 顯示「共現出現在哪幾章」迷你 sparkline
  - 改成可切「共現意象」/「共現角色 (`co_occurring_entity_ids`)」/「共現事件 (`co_occurring_event_ids`)」三個 tab（後兩者來自 SEP，目前完全沒用）
- **出現紀錄**：
  - 按 chapter 群組（每章 collapse / expand）
  - 補「跳到閱讀頁」CTA（routing 到 `/books/:bookId/read/:paragraphId`，若有的話）
  - context_window 加 term highlight（把該意象詞條框出來）
  - 分頁或虛擬列表（高頻意象可能有上百筆）
- **左側清單**：
  - ImageryItem 加 polarity dot / review_status indicator（若已有 interpretation）
  - 排序 / 分組（按 type 折疊、按 freq 排）
  - 「對比模式」：多選兩個意象並排比較共現脈絡
- **跨頁跳轉**：
  - `linked_characters` → 跳到 `/books/:bookId/characters/:entityId`
  - `linked_events` → 跳到 `/books/:bookId/events/:eventId`
  - 章節分布 bar 點擊 → 跳到 `/books/:bookId/timeline?chapter=N`
- **EmptyState**：onboarding-style 引導（解釋意象萃取何時執行、為何沒資料、如何到 unraveling 頁查診斷）
- **總覽 dashboard mode**（無選中時）：類型 donut / 頻率長尾 bar / 章節密度 heatmap / polarity 分布

---

## 7. 與其他已重設計頁的一致性參考

符號意象頁的版面骨架（左清單 240px + 右詳情）與 `CharacterAnalysisPage` / `EventAnalysisPage` 一致，重設計時應直接借鏡：

- 與 `CharacterAnalysisPage` / `EventAnalysisPage` / `TimelinePage` / `TensionPage` 共用的小元件樣式：標題 serif、按鈕 padding、segmented control 樣式、accordion ChevronDown/Right 圖示與配色、status badge 配色
- SymbolInterpretation hero panel 可參考 `TensionThemePanel` 的 hero card 處理（border 1.5px / 命題 serif / 雙 badge / 三審核按鈕）
- HITL 三按鈕（Approve / Modify / Reject）外觀請與 `TensionLineCard` / `TensionThemePanel` 完全一致（綠 bg/fg / 藍 bg/fg / 紅 bg/fg）
- CSS class 命名慣例：CharacterAnalysisPage 用 `.ca-*`、EventAnalysisPage 用 `.ea-*`、TimelinePage 用 `.tl-*`、TensionPage 計畫用 `.tn-*`；**SymbolsPage 目前完全是 inline style + tailwind，沒有對應的 CSS 檔**。重設計請新建 `frontend/src/styles/symbols.css` 並使用 `.sym-*` prefix

完整樣式參考：
- [frontend/src/styles/character-analysis.css](../../frontend/src/styles/character-analysis.css)（871 行）
- [frontend/src/styles/event-analysis.css](../../frontend/src/styles/event-analysis.css)（938 行）
- [frontend/src/pages/CharacterAnalysisPage.tsx](../../frontend/src/pages/CharacterAnalysisPage.tsx)（513 行）
- [frontend/src/pages/EventAnalysisPage.tsx](../../frontend/src/pages/EventAnalysisPage.tsx)（471 行）
- [frontend/src/pages/TensionPage.tsx](../../frontend/src/pages/TensionPage.tsx)（739 行，同期重設計，參考 HITL + 三審核按鈕 / inline edit 處理）

### 既有技術債（重設計時須處理或標注）

| 技術債 | 現況 | 重設計時的建議 |
|--------|------|---------------|
| Symbol 型別手寫 | [`frontend/src/api/symbols.ts`](../../frontend/src/api/symbols.ts) L3–L33 手寫 `ImageryEntity` / `SymbolTimelineEntry` / `CoOccurrenceEntry`；`SEP` / `SymbolInterpretation` 完全沒前端型別 | 後端 router 已用 `response_model=`，前端改從 `generated.ts` 取；補上 SEP / SymbolInterpretation 的 caller 時一律走 generated |
| 後端 8 endpoint 只接了 3 個 | `symbols.ts` 缺 #15d–#15h | 補齊 caller：`fetchSep` / `triggerSymbolAnalysis` / `fetchSymbolAnalysisTask` / `fetchSymbolInterpretation` / `reviewSymbolInterpretation` |
| 單檔 352 行混 inline style + tailwind | `SymbolsPage.tsx` 把 `ChapterDistChart` / `ImageryItem` / `TimelineRow` / `SymbolDetail` / `EmptyState` 全塞在一個檔 | 拆分為 `components/symbols/*`（見 §8 建議結構） |
| i18n namespace 不一致 | `symbols.*` 在 [`settings.json`](../../frontend/src/i18n/locales/zh-TW/settings.json) L63–L88，其他分析頁在 `analysis.json` | 把 `symbols.*` 整段搬到 `analysis.json`；本次新增 interpretation 相關 key 一律放 `analysis.json` 的 `symbol.*`（單數，與 `tension.*` / `event.*` 命名對齊） |
| `polarity` 沒對應 token | 後端有 4 值（positive/negative/neutral/mixed）但前端無視覺化 | 新增 `--polarity-{positive,negative,neutral,mixed}-{bg,fg}` token，並更新 `DESIGN_TOKENS.md` |
| `ChapterDistChart` 單色 + opacity | fill 寫死 `var(--accent)`，opacity 0.75 | 改為密度漸層（low/mid/high），新增 `--symbol-density-{low,mid,high}` token 或用 color-mix |
| `linked_characters` / `linked_events` / `co_occurring_entity_ids` / `co_occurring_event_ids` 無 UI | SEP / Interpretation 都有但前端拿不到也不顯示 | 重設計時設計跨頁跳轉的 affordance（pill / list / link 按鈕） |
| 沒有 `analysisTab` 同步 | `setPageContext` 沒傳 `analysisTab: 'symbols'`，與 CharacterAnalysisPage 慣例不同 | 若要與其他分析頁並列為 tab，補上 `analysisTab: 'symbols'`；否則維持現狀並在 brief 標注 |

---

## 8. 對應 UI_SPEC 與 API_CONTRACT 段落（直接引用，不重複內容）

- UI 規格細節：[`docs/UI_SPEC.md`](../UI_SPEC.md) § 3.9 象徵意象頁（L733–L758）— **目前只描述了已接入的 3 個 endpoint，#15d–#15h 沒寫；重設計時須同步補上**
- API 規格：[`docs/API_CONTRACT.md`](../API_CONTRACT.md) § 15a–15h（L1059–L1262）
- Token 對照表：[`docs/DESIGN_TOKENS.md`](../DESIGN_TOKENS.md) § 3.8 Symbol Pills（L149–L199，四主題 × 6 類型 × 3 槽位已完整）；新增的 `--polarity-*` / `--symbol-density-*` 也須回填
- 領域術語（ImageryEntity / SymbolOccurrence / SEP / SymbolInterpretation / ImageryType）：[`docs/domain-glossary.md`](../domain-glossary.md) 「符號意象」段

### 既有檔案清單（受重設計影響）

| 檔案 | 用途 | 重設計時的處理 |
|------|------|--------------|
| [`frontend/src/pages/SymbolsPage.tsx`](../../frontend/src/pages/SymbolsPage.tsx) | 主頁面，含 `ChapterDistChart` / `ImageryItem` / `TimelineRow` / `SymbolDetail` / `EmptyState`（**單檔 352 行**） | 視重設計拆分為 `components/symbols/*` |
| [`frontend/src/api/symbols.ts`](../../frontend/src/api/symbols.ts) | 3 個 API caller（`fetchSymbols` / `fetchSymbolTimeline` / `fetchCoOccurrences`） | **補齊 5 個新 caller**：`fetchSep` / `triggerSymbolAnalysis` / `fetchSymbolAnalysisTask` / `fetchSymbolInterpretation` / `reviewSymbolInterpretation`；同時改用 `generated.ts` 型別 |
| [`frontend/src/i18n/locales/{zh-TW,en}/settings.json`](../../frontend/src/i18n/locales/zh-TW/settings.json) L63–L88 | `symbols.*` namespace（16 key：searchPlaceholder / all / noData / noResults / chapterDist / firstSeen / coOccurrences / noCoOccurrences / occurrences / occurrenceCount / frequency / aliases / selectPrompt / emptyTitle / emptyHint / types.{object,nature,spatial,body,color,other}） | **整段搬到 `analysis.json` 的 `symbol.*`** 並補新增 key（generateInterpretation / regenerate / theme / polarity.{positive,negative,neutral,mixed} / confidence / evidenceSummary / linkedCharacters / linkedEvents / approve / modify / reject / status.{pending,approved,modified,rejected} / sepLoading / interpretationLoading / interpretationEmpty …），兩語系同步 |
| [`frontend/src/styles/tokens.css`](../../frontend/src/styles/tokens.css) | `--symbol-*` token（已四主題完整定義） | 新增 `--polarity-*` / `--symbol-density-*` 需同步更新 [`docs/DESIGN_TOKENS.md`](../DESIGN_TOKENS.md) |
| `frontend/src/styles/symbols.css` | **目前不存在**，建議新建 | 將 inline style 提取為 `.sym-*` class |
| [`frontend/src/contexts/ChatContext.tsx`](../../frontend/src/contexts/ChatContext.tsx) | `setPageContext({ page: 'analysis', bookId, bookTitle })` | 不需動；若決定補 `analysisTab: 'symbols'` 需確認 ChatContext type 是否已含此值 |
| [`backend/storysphere/api/routers/symbols.py`](../../backend/storysphere/api/routers/symbols.py) | 後端 router（8 endpoints，全部已有 `response_model=`） | 不需動 |
| [`backend/storysphere/api/schemas/symbols.py`](../../backend/storysphere/api/schemas/symbols.py) | `ImageryEntityResponse` / `ImageryListResponse` / `SymbolTimelineEntry` / `CoOccurrenceEntry` | 不需動 |
| [`backend/storysphere/domain/imagery.py`](../../backend/storysphere/domain/imagery.py) / [`backend/storysphere/domain/symbol_analysis.py`](../../backend/storysphere/domain/symbol_analysis.py) | `ImageryEntity` / `SymbolOccurrence` / `SEP` / `SymbolInterpretation` 等 domain model | 不需動 |

### Hooks / Context 依賴（不要動，但會用到）

- `useBook(bookId)` — 取得 `book.title` 給 ChatContext + Header
- `useQuery + fetchSymbols` — 左側意象清單（query key: `['books', bookId, 'symbols', typeFilter]`）
- `useQuery + fetchSymbolTimeline` — 出現紀錄（query key: `['books', bookId, 'symbols', selectedId, 'timeline']`）
- `useQuery + fetchCoOccurrences` — 共現詞（query key: `['books', bookId, 'symbols', selectedId, 'co-occurrences']`）
- **新增建議**：
  - `useQuery + fetchSep` — query key: `['books', bookId, 'symbols', selectedId, 'sep']`
  - `useQuery + fetchSymbolInterpretation` — query key: `['books', bookId, 'symbols', selectedId, 'interpretation']`（`retry: false`，404 → 顯示 CTA）
  - `useTaskPolling(taskId, fetcher)` — 通用 polling hook（與 Tension / Event / Character 共用，餵 `fetchSymbolAnalysisTask`）
  - 視需要拆出 `useSymbolInterpretationTask` hook（包裝 polling + state，類比 Tension 的 `useTensionTask`）
- `useChatContext().setPageContext` — 同步 page context
- `LoadingSpinner` from `@/components/ui/LoadingSpinner`
- 圖示：`lucide-react` 已用 `Telescope` / `Search` / `BookOpen` / `Link2`；可加 `Sparkles`（interpretation hero）/ `ChevronDown` / `Check` / `Pencil` / `X` / `RefreshCw`

### 建議的元件拆分（供參考）

```
frontend/src/components/symbols/
  ├─ SymbolList.tsx                 (左側清單外殼,含 filter chips + search)
  ├─ SymbolListItem.tsx             (單列,加 polarity dot / review status indicator)
  ├─ SymbolDetailHeader.tsx         (term + type pill + freq + aliases)
  ├─ SymbolInterpretationPanel.tsx  (hero card:theme + polarity + confidence + evidence_summary + linked_* + 三審核按鈕)
  ├─ SymbolInterpretationEmpty.tsx  (尚未生成 → CTA「生成詮釋」)
  ├─ SymbolInterpretationLoading.tsx(生成中 → stage / progress)
  ├─ ChapterDistChart.tsx           (升級:peak markers / density gradient / hover tooltip)
  ├─ CoOccurrencePanel.tsx          (可切換 意象 / 角色 / 事件 三 tab)
  ├─ OccurrenceTimeline.tsx         (chapter 分組 + 跳閱讀頁 CTA)
  ├─ PolarityBadge.tsx              (共用,4 種 polarity)
  ├─ ReviewStatusBadge.tsx          (共用,4 種 review status,與 Tension 共用)
  ├─ SymbolsEmptyState.tsx          (onboarding 引導)
  └─ hooks/
      ├─ useSymbolInterpretationTask.ts
      └─ useSymbols.ts              (彙整 list / detail 多個 useQuery)
```

### 注意事項

1. **欄位命名是 snake_case**：domain/ + api/schemas/symbols.py 都沒有 `alias_generator=to_camel`，所有取值要用 `imagery_type` / `chapter_distribution` / `first_chapter` / `co_occurring_terms` / `linked_characters` / `linked_events` / `peak_chapters` / `evidence_summary` / `co_occurring_entity_ids` / `co_occurring_event_ids` 而非 camelCase。設計時若引入新元件 props，內部建議用 camelCase，在 mapper 層轉換。
2. **`chapter_distribution` 的 key 是 string**：JSON 反序列化後 `{ "1": 3, "2": 1, ... }`，遍歷時要 `Number(ch)` 轉回；目前 [`SymbolsPage.tsx`](../../frontend/src/pages/SymbolsPage.tsx) L32 已做這個轉換。
3. **`first_chapter` 可能為 null**：（書中只有一章或 distribution 為空時）。目前 i18n 是 `firstSeen: "首見第 {{chapter}} 章"`，null 時顯示 `?`，設計時保留這個 fallback。
4. **`co_occurrences` 自動 build 行為**：[`backend/storysphere/api/routers/symbols.py`](../../backend/storysphere/api/routers/symbols.py) L108–L110 顯示第一次請求時會 auto-build graph，可能耗時數秒。設計時 loading 視覺要能撐住這段時間（目前用 `LoadingSpinner` 是夠的，但若改 dashboard 模式預載入需考慮）。
5. **SEP 與 Interpretation 的依賴**：#15e 觸發詮釋會自動 assemble SEP（若 cache miss）；前端不一定要先呼叫 #15d。但**若想在 hero 顯示「peak_chapters」/「co_occurring_entity_ids 數量」等 SEP 級的統計**，需要單獨呼叫 #15d 取資料。
6. **`review_status` 與 Tension 共用語意**：四值的視覺呈現（中性灰 / 成功綠 / 資訊藍 / 錯誤紅）必須與 Tension 完全一致——`STATUS_COLORS` 應提取成共用 component 而非各頁重複定義。
7. **進度 stage 字串可能中英混雜**：後端 `_run_symbol_analysis`（L172–L202）寫死 stage 字串，目前未統一中英文。i18n 層做不了翻譯；設計時若要顯示 stage 翻譯，需要先讓後端統一 stage code（這是後端工作，不在本 brief 範疇，但可標注為 follow-up）。
8. **`force_refresh` / `force` 行為**：#15d 與 #15e 都支援強制重新組裝 / 重新生成。設計「重新生成」按鈕時記得帶 `force_refresh: true`，並提示使用者「會覆蓋現有審核狀態」。
