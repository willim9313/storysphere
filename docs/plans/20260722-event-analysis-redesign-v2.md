# 事件分析頁重新設計 v2 — 計劃

**日期**：2026-07-22（最後更新 2026-07-22，設計稿第 2 輪修正後）
**範疇**：`/books/:bookId/events`（`EventAnalysisPage`、`EventAnalysisDetail`、`EventListItems`、`BatchEepPanel`）
**前一版**：`docs/plans/20260518-event-analysis-page-redesign.md`（v1，已落地為現況）
**Branch**：`feat/event-analysis-revamp`（自 `origin/main` `45f87d3` 切出）
**設計交付包**：`docs/handoff/20260722-event-analysis-redesign/`
**Claude Design 專案**：`1f66900f-a9c8-4de0-baeb-d64fcb2aeca3` — 主檔 `事件分析.dc.html`
（讀取方式：`DesignSync` MCP，`method: get_file`）

**狀態**：設計稿已完成兩輪修正，**尚未進入實作**。

---

## 0. 給新 session 的起點

讀完 §1（資料語意警告）與 §6（設計稿現況）就能接手。建議順序：

1. **先做 Track A**（§4）——純工程修復，不依賴設計稿，可獨立 PR。
2. **確認 §7 未決事項**（尤其對比入口的修正是否已送 Claude Design）。
3. **依 `.dc.html` canvas 實作 Track B**（§5）——**以 canvas 為準，不要依 prose 重新詮釋**。

---

## 1. ⚠️ 資料語意警告（最重要，先讀）

**`priorEventIds` / `subsequentEventIds` 不是因果關係。**

後端實作見 [`analysis_service.py:814-828`](../../backend/storysphere/services/analysis_service.py#L814-L828)：
對事件的每個 `participant` 取 `get_entity_timeline()`，再依章節切分——
**章節較早者 → prior，較晚者 → subsequent**。

也就是說它的真正語意是：
> 「與本事件**共享參與者**、且位於**較早／較晚章節**的事件」

這是**人物時間線的鄰接**，不是因果推斷。實作與文案**一律不得稱之為「因果」**。

**實測資料稀疏**：本次生成的事件（`宇文化及艦隊駛向江都`，Ch.1，KERNEL）
`priorEventIds: []`、`subsequentEventIds: []` **兩者皆空**（n=1；Ch.1 的 prior 為空屬正常，
但 subsequent 也空是紅旗）。→ **實作前務必先量實際填充率**，見 §7。

**真正的因果在哪**：只有 `causality.root_cause` / `causal_chain` / `chain_summary`，
而 `causal_chain` 是 **`list[str]` 的文字步驟，屬單一事件內部**，跨不了事件。
`causality.trigger_event_ids` 是 prior 的子集（同樣是人物鄰接，非因果）。

> 這個誤解一度寫進 v2 初版計劃與設計 brief，導致設計稿把跨事件視圖命名為
> 「因果流／因果鏈／因果連結強度」。已於第 2 輪修正正名為「**事件脈絡**」。
> 新 session 請勿再退回「因果」用語。

---

## 2. 現況快照（實作的事實基礎）

### 2.1 現行版面骨架（尚未改動的線上實作）

```
[Left Panel 260px]                         [Content Area (overflow-y)]
  ├─ BatchEepPanel（一鍵生成全部 EEP + 進度）  ├─ 標題列：事件名(serif) · K/S 徽章 · 章/chunk · 在圖譜中查看 · 重新生成
  ├─ 搜尋欄（僅比對事件名，前端過濾）           │
  └─ 清單（單一捲軸，僅分「已分析/未分析」）     └─ EventAnalysisDetail（單一捲動，無分頁）：
                                                  主題意義+摘要 hero → 前後狀態 → 參與角色
                                                  → 因果分析 → 影響分析 → 因果因素/後果 → 關鍵引言
```

進頁若未選事件 = 被動空狀態「選擇一個事件」（**這正是本次要解決的主要痛點**）。

### 2.2 可用資料（真實 payload 見 `docs/handoff/.../sample-payloads/`）

- **清單** `GET /books/:id/analysis/events` → `{ analyzed[], unanalyzed[] }`
  每筆含 `chapter`、`importance`（KERNEL/SATELLITE/null）、`narrativeMode`、`status`。
  → 三個維度**現行 UI 都沒用到**，B1/B0 就是把它們呈現出來。
- **詳情** `GET /books/:id/events/:entityId/analysis`
  - `eep`：`stateBefore/After`、`participantRoles[]`、`causalFactors[]`、`consequences[]`、
    `keyQuotes[]`、`thematicSignificance`、`structuralRole`、`eventImportance`、
    `topTerms`（實測 20 筆，**現行 UI 未使用**）、`priorEventIds`/`subsequentEventIds`（見 §1）
  - `causality`（root_cause / causal_chain / chain_summary）、`impact`、`summary`
  - `status`（complete/partial）、`failedParts[]`
- **實測 role 值**：`initiator` / `actor` / `beneficiary`（`participantRoles[].role`）

---

## 3. 範疇（hard scope）

### 包含
- Track A：選取狀態進 URL、生成中 detail query gate、重新生成改為「成功才覆蓋」。
- Track B：總覽落地頁、清單組織、未分析空狀態、批次子集、參與角色語意與圖例、
  跨事件脈絡視圖、事件對比。

### 不包含（維持現狀，勿做）
- **深色模式**（雙主題僅 Warm/Ink，皆淺底，刻意取向）— 使用者明確排除。
- **響應式/窄螢幕**（固定雙欄，不做 mobile 退化）— 使用者明確排除。
- 後端 API response schema（欄位不動）。
- Task polling 機制（`useTaskPolling`、generateTaskId 狀態機）。
- 生成 EEP 的演算法與 LLM pipeline。

---

## 4. Track A — 工程修復（不需設計稿，先做）

| # | 問題 | 現況 | 修法 | 檔案 |
|---|------|------|------|------|
| A1 | 重整/分享掉失選取 | `selectedEntityId` 只存 React state；圖譜跳轉靠 `location.state.selectId`。reload 退回空狀態 | 選取進 URL（`?event=` 或 `/events/:eventId`），deep-link 統一走 URL | `EventAnalysisPage.tsx:43-45`、`router.tsx` |
| A2 | 生成中噴 404 | `handleGenerate` 先 `setSelectedEntityId`，detail query `enabled` 只看 `!!selectedEntityId`，分析未生成就抓 → 連 2 次 404 | query gate 加「該 id 不在生成中」條件。**角色頁 `CharacterAnalysisPage.tsx:102` 已是 `&& !generateTaskId`，照抄即可** | `EventAnalysisPage.tsx:76-80,131-135` |
| A3 | 重新生成會丟舊資料 | 先 `deleteEventAnalysis` 再 trigger；trigger 失敗則舊 EEP 已刪 | 改成生成成功才覆蓋（override 語意），失敗保留舊資料 | `EventAnalysisPage.tsx:475-485` |

> A1–A3 皆為區域性改動，逐項獨立 commit 可回滾。不涉及 API_CONTRACT。
> A1 若改動 URL 結構 → 需更新 `docs/UI_SPEC.md §3.5`。

**另有一處既有 bug（低優先，可併入）**：
`ROLE_CLASS_MAP` 把 `beneficiary`（受益者）歸到 `witness` 色桶，語意錯誤
（[`EventAnalysisDetail.tsx:100`](../../frontend/src/components/analysis/EventAnalysisDetail.tsx#L100)）。B4 會一併重訂。

---

## 5. Track B — 設計需求（第 2 輪修正後的定稿）

| # | 需求 | 優先 | 內容 |
|---|------|------|------|
| B0 | **事件總覽落地頁** ⭐ | 最高 | 建立「無選取 → 總覽；選取 → 詳情 + 返回總覽」雙態骨架。標題「事件圖景」+ 統計（總數/已分析/未分析/核心）+ 研究者導覽 + 三視圖切換 + 批次入口 + 整本未分析時的引導態。藍本＝角色頁 `CharacterOverviewLanding` |
| B1 | 清單組織 | 高 | 章節分組/折疊 + 重要度(K/S)、敘事模式篩選 chip + 分組切換（章節序/重要度）。收攏進 B0 |
| B2 | 未分析空狀態 | 中 | 花 LLM 前先預覽該事件**原文段落**，讓人判斷值不值得分析 |
| B3 | 批次子集 | 中 | 一鍵全部 / 只生成核心(N) / 只生成本章 / 勾選多筆 + **預估耗時**；保留進度、階段、生成-跳過-失敗統計 |
| B4 | 參與角色語意 | 低 | 依真實 role 值（initiator/actor/beneficiary…）重訂色桶（修正 `beneficiary→witness` 錯誤）+ **加圖例** |
| B5 | **事件脈絡**（原「跨事件因果流」） ⭐ | 高 | 用 `prior/subsequentEventIds` 呈現「共享參與者、跨章節」的事件串接。**嚴禁稱因果**，副標須註明「非因果推斷」。總覽一個視圖 + 詳情「上下文位置」tab 雙處。**必須有空資料降級態** |
| B6 | 事件對比 | 低 | 選兩個**已分析**事件並排比較前後狀態與影響（呼應圖譜頁 pair mode）。以 **drawer** 實作，非總覽視圖 |

> **B0 是骨幹**：B1 與 B5 不是獨立畫面，而是總覽落地頁裡的視圖。

---

## 6. 設計稿現況（`事件分析.dc.html`，第 2 輪修正後）

### 6.1 已定稿的結構

- **總覽三視圖**（`landingTabs`，預設 `map`）：
  `故事骨幹圖 (map)` / `重要度排行 (ranking)` / `事件脈絡 (flow)`
  - 故事骨幹圖：X＝章節、Y＝核心/衛星、圈大小＝核心、顏色＝敘事模式、虛線圈＝未分析
    （資料來源全部正確，無疑慮）
  - 事件脈絡：標題「事件脈絡」，副標「依共享參與者、跨章節的相鄰事件串接（**非因果推斷**）」，
    含 `contextEmptyGlobal` 空狀態
- **詳情四分頁**（`detailTabs`）：`概覽` / `因果與影響` / `上下文位置` / `證據`
  - 參與者角色 + 圖例位於**概覽** tab
  - 上下文位置 tab 僅保留 prior→本事件→subsequent 鄰接，含 `noContext` 空狀態
  - 證據 tab 含關鍵引言 + **關鍵詞（topTerms）**
- **對比**：`compareOpen` 獨立 drawer，由總覽工具列右上「對比兩事件」開啟
- partial 降級態、toast、批次 running 態齊備

### 6.2 決議記錄（已接受的偏離）

| 決議 | 說明 |
|------|------|
| ✅ 接受詳情改 4 分頁 | 原計劃寫「詳情頁沿用現況（單一捲動）」。設計 tab 化以對齊角色頁分頁語言，**接受**，本文件同步更新 |
| ✅ 接受新增「關鍵詞/topTerms」 | 資料充足（實測 20 筆），淨增益，保留 |
| ✅ 排行改「重要度優先」 | 原設計以「因果連結強度」排序——命名誤導且該值多半趨近 0 會使排序塌掉。改為主排序＝重要度(KERNEL 優先)、次排序＝參與者數/提及量，關聯數降為次要標註 |
| ✅ 對比＝drawer 非視圖 | 已修正，`landingView` 只接受 `map/ranking/flow` |

### 6.3 兩輪回饋的落地狀況

**第 1 輪（已完成）**：對比移出透鏡列改 drawer ✅｜導覽文案改「三種視圖」✅｜預設視圖＝故事骨幹圖 ✅

**第 2 輪 資料語意（已完成）**：因果流→**事件脈絡** ✅｜副標「非因果推斷」✅｜
全書/單事件空狀態 ✅｜參與者角色移回「概覽」tab ✅｜排行改重要度優先 ✅

---

## 7. 未決事項（新 session 要處理）

**U1. 對比入口修正（回饋已擬，尚未確認是否已送 Claude Design）**
- 詳情頁工具列（`返回總覽 / 在圖譜中查看 / 覆蓋重新生成` 那排）**應補上「對比」按鈕**，
  開啟時自動把**目前事件填為 A**。現況對比只在總覽有，導致「看著 A 的詳情想比 B」
  必須先返回總覽再從零挑兩個。角色頁先例即是把比較放在詳情 titlebar。
- canvas 的 `startView` prop enum／tsType 仍殘留 `'compare'`
  （runtime 只認 `map|ranking|flow`，選 compare 會靜默 fallback）→ **請移除**，
  避免實作端誤以為對比是第四個總覽視圖。
- 對比下拉只列**已分析**事件；已分析 < 2 時入口 disabled 並提示。

**U2. ~~驗證填充率~~ → 已查明根因：`prior/subsequentEventIds` 恆為空，是持久化 bug（2026-07-23）**

**不需要再花 LLM token 量測**——填充率必然是 0%，原因在 `KGService` 的存讀路徑：

1. `add_event()` 把 event.id 追加到參與者的**圖節點屬性** `event_ids`
   （[`kg_service.py:161-170`](../../backend/storysphere/services/kg_service.py#L161-L170)）
2. 但 `save()` 只序列化 `entities` / `events` / `temporal_relations` / `edges`
   （[`kg_service.py:548-566`](../../backend/storysphere/services/kg_service.py#L548-L566)），
   **節點屬性 `event_ids` 從未被寫進 JSON**
3. `load()` 用 `_entity_attrs(entity)` 重建節點屬性，而 `Entity` model 沒有 `event_ids` 欄位；
   events 只塞回 `self._events` dict，**不重新掛回節點**
   （[`kg_service.py:578-583`](../../backend/storysphere/services/kg_service.py#L578-L583)）

⇒ 任何一次重啟／reload 之後，`get_events(entity_id)` 讀到的 `event_ids` 都是空 list
⇒ `get_entity_timeline()` 恆回 `[]`
⇒ `analysis_service.py:819-828` 的 prior/subsequent 迴圈一次都不會進
⇒ **每個事件的 `priorEventIds` / `subsequentEventIds` 都是 `[]`**

**佐證**：`var/knowledge_graph.json` 有 241 entities / 109 events，
**109 個事件全部都有 participants**（資料本身完好），但整份 JSON 裡
`event_ids` 這個字串一次都沒出現。快取中唯一一筆 EEP 的 prior/subsequent 也都是空。

**修法（二選一，皆不動 API schema）**：
- **(a) 最小修**：`load()` 還原 events 後補一段 re-link 迴圈，把 event.id 掛回參與者節點。
  只補 `load()`，約 4 行。缺點：`add_event` 那份反正規化索引仍需與資料同步。
- **(b) 拿掉索引**：`get_events(entity_id)` 改成直接掃
  `[ev for ev in self._events.values() if entity_id in ev.participants]`。
  一行取代三行，同時解掉「ingestion 時 event 先於 entity 加入就漏掛」的第二個破口；
  `add_event` 的 `event_ids` 簿記會變成死碼（**需經使用者確認才可刪**）。n=109，掃描成本可忽略。

**對 B5 的影響**：修好之前，事件脈絡視圖與「上下文位置」tab 必然是空狀態。
**先修這個 bug，再實作 B5**；修完可用同一支腳本重新量填充率確認。

**U3. 文件同步**（實作完成後）
- 回寫 `docs/UI_SPEC.md §3.5`（新版面、路由）
- 若新增 token → 同步 `docs/DESIGN_TOKENS.md`
- Track A 不動 endpoint，**不需**改 `API_CONTRACT.md`

---

## 8. Claude Design 交付包

位置：`docs/handoff/20260722-event-analysis-redesign/`（已全數上傳至 Design 專案 `uploads/`）

| 檔案 | 說明 |
|------|------|
| `README.md` | 交付包導覽 + 已知現象 + 藍本截圖對照 |
| `01-design-brief.md` | 需求書本體（§3.0 總覽落地頁為最高優先） |
| `02-tokens.css` / `03-DESIGN_TOKENS.md` | token 硬約束 |
| `i18n/analysis.zh-TW.json`、`common.zh-TW.json` | 真實文案（排版勿用 lorem） |
| `sample-payloads/eep-complete.json` | 真實完整 EEP（注意 prior/subsequent 為空，見 §1） |
| `sample-payloads/event-list.json` | 清單回應 |
| `screenshots/ea-warm-detail-0{1..4}.png`、`ea-ink-detail-01.png` | 事件頁現況（Warm ×4 + Ink ×1） |
| `screenshots/ca-overview-warm.png`、`ca-overview-ranking-warm.png` | **藍本**：角色頁總覽（象限 / 排行） |

> ⚠️ canvas 內的示範資料（人名、章號、prose、座標）**僅供結構參考**，
> 實作一律即時從真實資料計算，不得寫死。

---

## 9. 動土前 Checkpoint（Track A 開工時填）

1. **異動檔案**：`EventAnalysisPage.tsx`、`router.tsx`（A1）。
2. **現成工具**：React Router `useSearchParams` / route param；角色頁 query gate 可照抄。不新增依賴。
3. **新依賴/結構**：無。
4. **回滾**：三項各自獨立 commit，`git revert` 即還原。

> Track B 開工前另依 CLAUDE.md 補一次 checkpoint（屆時異動檔案會多很多，**須拆子任務**，
> 一次異動勿超過 3 個檔案）。
