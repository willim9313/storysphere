# 象徵意象頁重設計 — 設計稿 × 需求書交叉比對

> 日期：2026-08-07
> 設計來源：Claude Design 專案 `4bbaa74a-af34-4bd3-8009-458c1157784d`
> `design_handoff_symbol_imagery_page/`（canvas 已存至 `docs/handoff/20260806-symbols-page/design-return/`）
> 需求書：`docs/plans/20260806-symbols-page-redesign-brief.md`
> 比對基準：canvas 1b 區段的實際 markup 與 `class Component` 邏輯（非 README 散文），
> 對照 `docs/handoff/20260806-symbols-page/sample-payloads/` 的真實 payload 與 repo 現況程式碼。

---

## 1. 結論

設計忠實回應了需求書的主軸與六個開放問題，**沒有退回 PR #27 修掉的三個錯誤**，token 紀律乾淨。
但有 **6 項落差必須在動工前有答案**（第 3 節 B1–B6），其中 3 項需要後端或契約異動，
不是純前端工作。另有 5 項需要你拍板的判斷（第 4 節 C1–C5）。

---

## 2. 相符項目（已逐條驗證）

| 需求書 | 設計對應 | 驗證方式 |
|---|---|---|
| §1 主軸從頻率換成行為 | `ranked()` 預設 `load`，`freq` 降為第五個「對照」主軸 | canvas L777–784 |
| §2 六個行為訊號 | D3 行為摘要六格，全部零 LLM | canvas L816–838 |
| §3.1 章節座標不是 1..N | `AXIS = [-1,0,1..10,11]`，前置／正文／後記三段 | canvas L694 |
| §3.2 共現三陷阱 | 一過濾（`selfHit`）、二分流（`chars`/`scenes`）、三改名「場景與物件」 | canvas L861–868, L930–936 |
| §3.3 SEP 被閒置 | SEP 從一行提示升格為排序主軸與 D8 主要內容 | canvas L716–723 |
| §3.4 長尾 | B6 詞雲，不進清單／不進排序／不進批次，可點可搜 | canvas L997–1004, L953 |
| §5 A1 軸域寫死 | 軸域含 `-1`/`0`/`11`，非正文格以虛線區分 | canvas L758–767 |
| §5 A2 峰值取前 3 名 | `peak: v===x.peakV`，`distMeta` 列出所有達最大值的章 | canvas L845, L910–911 |
| §5 A3 per-row 正規化 | `maxCell()` 跨意象取最大值；未退回 per-row | canvas L741–748 |
| §5.1–5.6, 5.8–5.11 | 依序對應 B3/D8/D3/B1/D9/D9/B6/D1/URL/D1+C | — |
| §6 CSS variable 紀律 | 1b 產品區 100% `var(--*)`；唯三處硬編碼在畫布外框標籤（L54–58, 61） | 全檔 grep |
| §8.3 長尾實算 | 設計糾正 brief 的 17 → **18**。我用 15a 實算確認：29 items、`freq==1` 共 18、`freq>1` 共 11 | 15a payload |

排序公式（`load`）的三個設計判斷我認為站得住：`trust` 當乘數而非加項、`damp` 壓掉「2 次出現算出 100% 依附」、
權重集中在單一常數 `W` 待校準。

---

## 3. 落差：動工前必須有答案

### B1. entity token 名稱對不上 repo（機械性，但會整頁壞掉）

canvas 用 `--entity-character-*` / `--entity-location-*` / `--entity-concept-*` /
`--entity-object-*` / `--entity-organization-*`（L862, L867）。

repo `frontend/src/styles/tokens.css` 只有縮寫：`--entity-char-*` / `--entity-loc-*` /
`--entity-con-*` / `--entity-obj-*` / `--entity-org-*` / `--entity-other-*` / `--entity-evt-*`。
tokens.css 第 6 行本身就註明了這個差異（「設計 contract 用全名，本檔沿用 repo 既有縮寫」）。

→ 實作需一張 `entity_type → token 前綴` 對照表。**不需新增 token**，但 README 宣稱
「全部來自既有 token」在這點上字面不成立。

### B2. SEP 只回 entity UUID，沒有 name、沒有 entity_type

實測 `15d-sep-hai.json`：`co_occurring_entity_counts` 是 `{uuid: count}`，
API_CONTRACT #15d 也是這樣寫的。

但設計的三件核心事情都需要 UUID 以外的資訊：

- 角色依附訊號 → 需要 `entity_type === 'character'`
- 自我匹配過濾 → 需要比對 **名稱** 與意象詞
- 「場景與物件」分流 → 需要 `entity_type`

handoff 裡的 `resolved-cooccurrence-hai.json` 是**離線手工解析的參考檔，不是 API**。

→ 現成路徑只有 `#9 GET /books/:bookId/graph`（回 `nodes[]` 含 `id`/`name`/`type`），
整本抓一次、前端建 `Map<uuid, {name, type}>`。
**需拍板**：接受多打一次 #9，還是要後端在 SEP 回應補上 name/type。

### B3. 排序需要全書 SEP，但 #15d 是 per-symbol

敘事負載的 `attach` / `events` / `allies` 三個分量全部來自 SEP。
主清單 11 個意象 → 進頁要打 11 次 #15d（長尾 18 個不進排序可略），加 B2 的 #9，
固定 12 個請求才排得出第一屏。

README 有標 ⚠️，但決議 02 講的是**共現批次端點**，不是 SEP 批次。這題沒有結論。

→ 三選一：(a) 11 次併發、(b) 新增後端彙總端點、
(c) 漸進降級——SEP 未到齊前先用 `span + freq` 排，到齊後重排。

### B4. §8.4（每次進頁 N 個 404）沒被回答，但設計依賴它

六條決議涵蓋 §8.1 / §8.2 / §8.3 / §8.5 / §3.2 / §5.11 —— **獨缺 §8.4**。

而設計把「審核狀態免費可得」當成前提用在四個地方：清單列的「待審」徽章、
清單列的極性圓點、`review` 排序主軸（七個主軸之一）、總覽 meta 的「LLM 詮釋 1/29」。

現況 #15a 不回 interpretation 狀態，#15g 對未生成者回 404 → 這就是 29 個 404，
也就是需求書 §5.7 點名的那個問題原封不動被繼承。

→ **建議在這輪一併處理**：#15a 的 `ImageryEntity` 補
`has_interpretation: boolean` 與 `review_status: string | null`。
後端小改 + `docs/API_CONTRACT.md` 同步 + `npm run gen:types`。
否則必須從設計拿掉審核徽章與 `review` 排序主軸。

### B5. 沒有批次 analyze 端點

B1 頁首三顆批次鈕（訊號最強前 5 名／全部 11 個／勾選多筆）在 API 上沒有對應。
角色有 `#7h POST /books/:bookId/entities/analyze-all`，事件有 `#7g`，**象徵只有 per-symbol 的 #15e**。

→ 建議新增 `POST /symbols/analyze-all`，沿用 `BatchEepResult` 進度格式與 #8 polling，
與既有兩頁的慣例一致（設計自己也寫「照事件頁 BatchEepPanel」）。
替代方案是前端序列迴圈，但取消／進度／可離開頁面這三件事會難做對。

### B6. `chapterAxis.ts` 要擴充，不是直接沿用

現況（PR #27）是**二分**：`>= 1` 算正文進 `bodyEntries`，`< 1` 只由 `outsideBodyCount()`
給一個總數、不給軸格；且 `bodyChapterMax()` 回 `max(資料最大章, bookChapterCount)`，
會把超界的第 11 章**併進正文軸**。

設計要的是**三分**：前置頁(-1) / 目次(0) / 正文 1..BODY_N / 後記 >BODY_N，
四段各有軸格，且後記**不進** `span` / `shape` / `first` 的計算（canvas L711）。

需求書 §6 說「沿用而非重寫」。

→ 我的解讀是：在 `chapterAxis.ts` **新增**函式（前置／後記分段、軸格建構），
不動既有四個 export 與 20 個單元測試。**需你確認這個解讀**。
另外 canvas 的 `BODY_N = 10` 與 13 格 AXIS 是原型寫死值，實作必須由 `book.chapterCount`
與資料推得（README 也這樣要求）。

---

## 4. 需要你拍板的判斷

### C1. 四個現有能力在設計稿上消失了

需求書 §4 說「可以改呈現方式、改入口位置，**不能砍功能**」。以下四項在 canvas 1b 找不到：

| 能力 | 現況位置 | 設計稿狀態 |
|---|---|---|
| 詮釋的 `linked_characters` / `linked_events` chip，可跳角色頁／事件頁 | `InterpretationHero.tsx:232`、`CoOccurrencePanel.tsx:116,137` | D4 只有命題／極性／信心／佐證／HITL，無 chip |
| 出現紀錄的關鍵字＋別名高亮 | `OccurrencesTimeline.tsx:22` `highlight()` | D9 是純引文 |
| 出現紀錄的 `co_occurring_terms` 標籤 | `OccurrencesTimeline.tsx:88` | D9 沒有 |
| D8 三欄項目可點 | 現況共現意象可切換 | `chars`/`scenes`/`allies` 都沒有 `on` handler（canvas L861–870） |

第四項還有個連帶問題：「並看」的目標在原型裡是寫死的 `s.sel==='海'?'手':'海'`（L1090）。
實作上**結盟意象欄位應該就是 pin 的入口**，否則 §5.11 只解決了一半。

→ 我判斷這四項是原型省略而非刻意砍除，傾向**全部保留**。請確認。

### C2. 總覽的類型甜甜圈與極性堆疊條被移除

極性堆疊條是需求書 §5.3 自己點名的廢卡（「整張只有一條灰條」），移除合理。
類型分布的功能由帶計數的類型晶片（`全部 29 / 自然 11 / 器物 9 …`）吸收。

→ 我認為 OK，列出來讓你知道這是相對 §4.2 的功能刪減。

### C3. 熱圖色階規則與 PR #27 的定案不是同一件事

需求書 §6 定案「跨意象的單章最大值正規化」。
canvas 的 `densityColor()`（L750–756）是**絕對次數分桶**：1 次 → mid、2 次 → high、≥3 次 → peak。
`maxCell()` 只用在長條圖**高度**，沒用在顏色。

兩者在這本書上結果幾乎一樣（而且分桶的圖例更誠實：「1 次／2 次／3 次以上」比「40%」好懂），
**沒有退回 per-row**，所以精神上沒違反定案。

但實測 15a 的全書單章最大值是 **2，不是 3** —— 所以 `--symbol-density-peak` 這一階在
《名字的潮汐》上永遠不會亮，README §B4 寫的「正文單章最大值 3」也對不上真實資料。

→ 建議：保留分桶，但**用 `globalChapterMax()` 決定分桶邊界與圖例階數**
（max ≤ 2 時圖例只畫兩階），避免圖例上掛一個永遠不出現的顏色。

### C4.「第一名是手不是海」沒有真實資料支撐

canvas 的 `SEP` 常數（L657–671）只有「海」標了 `real:true`，是 #15d 的真實回應。
「手」的 `ch:[['伊內絲',5]]`、`ev:14`、`al:8` 全部是示範替代值（README 自己也寫了）。

所以「敘事負載第一名是手」是用**編造的依附／事件／結盟數**算出來的。

→ 不影響設計採用（公式本身合理，README 也明確要求即時計算），
但**不要把「手 > 海」當成已驗證結論**寫進 commit message、BACKLOG 或 UI 文案。
上線後照決議 06 用兩本書的真實資料回頭校準 `W`。

### C5. i18n 要新增 60–80 個 key × 2 語言

handoff 的 `analysis.zh-TW.symbol.json` 就是 repo 現況的 45 個 key（113 leaf，
只差 PR #27 才加的 `outsideBody`）—— 我逐 key 比對過，沒有任何新增。

設計引入的文案一個都不在裡面：行為摘要、敘事負載、六個訊號的 label 與 note、
六種分布形狀、六個行為分群、單次出現詞、CTA 三分支、自我匹配說明、批次面板、
生成五段 stage、非正文三段標籤……而且畫布**只有 zh-TW，en 需另外寫**。

→ 這是實打實的工作量，要算進排程。

### C6. 小事：README 的一處筆誤

README §B1 範例字串寫「29 個意象 · 66 次出現」，15a 實測是 **63**
（canvas 的 `totalOcc` 自己算出來也是 63）。純文件筆誤，實作是動態計算，不影響。

---

## 5. 建議的開發切分

CLAUDE.md 規定「一次異動超過 3 個檔案先拆成子任務」。這頁保守估計會動 12+ 個檔案，必須拆。

| Phase | 範圍 | 涉及 |
|---|---|---|
| **0** 契約 | #15a 補 `has_interpretation`/`review_status`；新增 `POST /symbols/analyze-all` | backend + `docs/API_CONTRACT.md` + `npm run gen:types` |
| **1** 計算層 | `chapterAxis.ts` 擴充（三分軸域）；新增 `symbolSignals.ts`（`calc`/`load`/`shape`/`ranked`，常數 `W` 集中）；entity 解析 hook | 純函數 + 單元測試，無 UI |
| **2** 左欄 | A1–A4 | `SymbolList.tsx` 重寫 |
| **3** 總覽 | B1–B6 | `SymbolsDashboard.tsx` 重寫 + 批次面板 |
| **4** 詳情 | D1–D9 | 現有 7 個 detail 元件改造 |
| **5** 收尾 | cluster C、URL 狀態、en i18n | 新元件 + router |

每個 phase 各自過 `ruff check backend/` / `npm run lint` / `npm run build` 閘門，
判準是「無新增錯誤」（依 CLAUDE.md 的 main 基線 diff 流程）。

---

## 6. 待你回覆的六題

1. **B2** entity 解析走 `#9 graph` 前端建 map，還是要後端在 SEP 補 name/type？
2. **B3** 全書 SEP：11 次併發 / 新增彙總端點 / 漸進降級？
3. **B4** 這輪補 #15a 的 interpretation 狀態欄位（我建議），還是拿掉審核徽章與 `review` 排序？
4. **B5** 新增 `POST /symbols/analyze-all`（我建議），還是前端序列迴圈？
5. **B6** `chapterAxis.ts` 用「新增函式、不動既有 export」的方式擴充，可以嗎？
6. **C1** 四個消失的既有能力全部保留（我建議），還是其中哪些確定要砍？
