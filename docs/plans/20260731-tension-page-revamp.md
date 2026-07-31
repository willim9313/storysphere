# 張力分析頁 UI/UX 翻新計劃

**日期：** 2026-07-31（2026-07-31 更新：新增 P0-6，並據此改寫 P1-1 與實作順序）
**狀態：** 待 review（尚未進入設計與開發）
**驗證對象：** 僅以 `名字的潮汐` 為準。`大唐雙龍傳` 資料量過大，本階段不跑。
**範圍：** `frontend/src/pages/TensionPage.tsx`、`frontend/src/components/tension/`、`frontend/src/styles/tension.css`、`frontend/src/api/tension.ts`；部分項目涉及 `backend/storysphere/api/routers/tension.py` 與 `services/tension_service.py`

---

## 0. 驗證方式與資料基礎

以 playwright 實際操作 `名字的潮汐`（10 章）的張力分析頁，涵蓋三種狀態：

| 狀態 | 資料 | 用途 |
|------|------|------|
| 空狀態 | 真實（無資料） | onboarding / 空狀態 |
| 6 條線 / 16 TEU | mock fixture（用真實圖譜實體名） | 一般規模 |
| 18 條線 | mock fixture | 規模壓力 |
| **5 條線 / 20 TEU** | **真實 LLM 產出** | **最終判準** |

**重要：** mock 與真實產出的差異極大，多數結論以真實產出為準。凡標記「真實資料」的項目，都是 mock 階段看不出來的。

真實產出摘要：

```
個人選擇與自由 vs 既定命運與責任        6 TEU  ch [1,5]  0.80  approved
記憶的自主與神聖性 vs 記憶的追尋與佔有   3 TEU  ch [3,3]  0.73  approved
追尋與面對過去 vs 保護與避免重蹈覆轍     3 TEU  ch [4,4]  0.80  approved
犧牲與奉獻 vs 生存與放下                4 TEU  ch [8,8]  0.82  approved
過去的執念與誘惑 vs 活在當下與未來       4 TEU  ch [9,9]  0.75  approved

theme: review_status=approved, frye_mythos="悲劇", booker_plot="悲劇"
```

**注意：這 5 條線只涵蓋 38 個 TEU 中的 20 個。** 詳見 P0-6——本頁多數「資料形狀」的觀察都受該缺陷汙染，讀本文件時請先看 P0-6。

---

## 1. 核心診斷：3 步 stepper vs 5 階段工作流

這是使用者回報的「順序感很怪異」的根因，也是本計劃的主軸。

Stepper 呈現的模型：

```
[1] TEU 組裝  →  [2] TensionLine 聚合  →  [3] TensionTheme 合成
```

實際的工作流：

```
[1] TEU 組裝 → 〔檢視 TEU〕 → [2] 聚合 → 〔逐條審核 N 條線〕 → [3] 合成
                  ↑ 不存在                    ↑ 不在 stepper 裡
```

兩個被省略的階段造成三個具體後果：

- **Step 1 沒有產出可看**（→ P0-1）
- **Step 1 完成後的空狀態文案仍叫你去跑 Step 1**（→ P0-2）
- **審核階段在進度模型中不存在，使用者被誘導 1→2→3 一路按到底，導致主題由未審核的線合成**（→ P0-3）

三顆按鈕橫排、每顆都有 `>` 或 `↻` 的 CTA，視覺上是一組連續動作；但正確用法是在 2 和 3 之間插入可能長達數十分鐘的人工審核。**設計上需要讓「審核」成為 stepper 的一等公民。**

---

## P0 — 流程、引導與正確性

### P0-1 Step 1 的產出無法檢視（缺 API）

- **現象：** Step 1 跑完（數分鐘 LLM 呼叫），畫面唯一的回饋是 stepper 上一行「組裝完成 · 20 / 24 場景」。頁面主體仍是 onboarding hero + 空狀態。
- **根因：** 後端沒有 `GET /tension/teus`。現有 endpoint 只有 `/analyze`、`/lines/group`、`/lines`、`/theme` 四組。TEU 快取鍵是 `teu:{event_id}`，沒有 document 反向索引。
- **好消息：** `get_lines_with_teus()` 已經在用 `self._cache.list_by_prefix("teu:")` + `teu.document_id == document_id` 做這件事（[tension_service.py](../../backend/storysphere/services/tension_service.py)）。抽成獨立方法即可，成本低。
- **可能做法：**
  - 新增 `GET /tension/teus?book_id=`（回傳 `list[TEUSummary]` + chapter）
  - Step 1 完成後在頁面主體顯示「TEU 一覽」：按章節分組、每章顯示場景數與強度分布，可展開看單筆 TEU
  - 這一區在 Step 2 完成後可收合成次要資訊，讓位給 TensionLine
- **待決：** TEU 一覽是常駐區塊，還是只在「有 TEU 但無 Line」時出現？（影響 Step 2 之後的版面）

### P0-2 空狀態文案在 Step 1 完成後仍要求執行 Step 1

- **現象：** `hasTeus === true`（analyzeResult 有值）但 `hasLines === false` 時，畫面下方顯示「尚無張力分析資料 / **請先執行 Step 1 和 Step 2**」。
- **根因：** [TensionPage.tsx:303](../../frontend/src/pages/TensionPage.tsx) 只判斷 `!hasLines`，`tension.emptyHint` 是靜態字串。
- **做法：** 空狀態依 `hasTeus` 分岔成兩種文案與兩種 CTA。與 P0-1 一起做。

### P0-3 審核階段不在進度模型中，且合成會略過審核結果

- **現象：** stepper 誘導 1→2→3 連續按。若照做，`synthesize_theme` 走 `reviewed if reviewed else lines` 的 fallback，用**全部未審核的線**合成主題。而 Step 3 的文案卻宣稱「從已審核的 TensionLine 合成」。
- **做法（設計層）：** 在 stepper 中把審核表達為一個階段，例如：
  - Step 2 完成後，Step 3 預設為 `disabled`，顯示「尚有 N 條未審核」
  - 或在 2 與 3 之間插入一個非按鈕的進度指示（`審核 3 / 5`），隨審核進度填滿
- **待決：** 未審核完是否**硬性**擋住 Step 3？（擋住比較正確，但會擋掉「先看看主題長怎樣」的探索路徑）

### P0-4 `force=false` 使審核對最終產出無效，↻ 是會回報成功的無操作

- **現象：** Step 3 完成後 CTA 變成 `↻`。點下去 → `force=false` → `synthesize_theme` 直接回快取 → `save_theme` 原樣重存 → task 回報成功 → 畫面顯示「主題已合成」。**審核了什麼都不影響結果。**
- **證據鏈：**
  - [api/tension.ts](../../frontend/src/api/tension.ts) 三個 trigger 全部寫死 `force = false`，UI 無任何路徑送出 `true`
  - `synthesize_theme()` 開頭 `if not force: cached → return`
  - `update_line_review()` 只存 lines，**不 invalidate `tension_theme:{document_id}`**
- **現況風險：** 目前這本書 5 條線已全部 approved 且 theme 已合成。之後若改判任何一條，↻ 不會有任何效果。
- **做法：**
  - `↻` 送 `force=true`
  - 加二次確認（這是花錢的 LLM 呼叫）
  - line 審核後在 theme 上標記「已過期，建議重新合成」（前端比對 `theme.assembled_at` 與最後審核時間，或後端在 review 時寫入 dirty flag）
- **待決：** dirty 判定放前端（簡單、但需要 line 上有 reviewed_at）還是後端（正確、但要改 model）？

### P0-5 組裝失敗數被吞掉

- **現象：** `analyze_book_tensions` 回傳 `{total_events, candidates, assembled, failed}`，UI 只顯示 `assembled / candidates`。若 8 個事件失敗，畫面顯示「32 / 40 場景」而不提失敗。
- **做法：** `failed > 0` 時顯示警示與可展開的失敗清單。

### P0-6 聚合階段靜默丟失 47% 的 TEU ⚠️ 實際優先序最高

> 2026-07-31 新增。此項推翻了 P1-1 原本的結論，並汙染了本文件中多數關於「資料形狀」的觀察。

- **現象：** 從 `var/analysis_cache.db` 直接統計（零 LLM 成本）：

  ```
  Step 1 組裝出的 TEU：38 個，分布於 ch1–10（每章約 4 個）
  Step 2 聚合後進入張力線的：20 個
  被靜默丟棄的：           18 個（47%）
  ```

- **丟棄的不是雜訊：**

  | 章節 | 丟棄數 | 例子 |
  |------|--------|------|
  | ch 7 | **6（整章全丟）** | 「真摯的愛與忠誠 vs 世俗的野心與背叛」intensity **0.9** |
  | ch 10 | **1（整章全丟）** | 「吞噬的遺忘 vs 堅韌的生命與記憶」intensity **0.9** |
  | ch 4 | 2 | 「失落與未解 vs 尋求與歸還」intensity 0.9 |

  **ch7 與 ch10 在張力分析頁上完全不存在。** 軌跡圖的軸只畫到 Ch 9，因為 `maxChapter` 是從殘存的線推算的。讀者會認為第 7 章沒有張力，實際上該章組裝出 6 個 TEU、含一個 0.9。

- **根因：** `_call_grouping_llm()` 把 38 個 TEU 一次餵給單一 LLM 呼叫，**完全不驗證覆蓋率**：

  ```python
  valid_ids = [tid for tid in item.get("teu_ids", []) if tid in teu_index]
  ```

  這行只擋掉模型幻想的 id，沒有任何機制檢查每個 TEU 是否被分到某一組。模型漏掉的就永久消失，且不記錄、不回報。

- **對 P1-1 的影響：** 原本把「4/5 條是單章」列為需要設計去遷就的資料形狀，**這個判斷是錯的**。證據：ch2 被丟棄的「記憶的歸還與完整 vs 記憶的犧牲與消逝」與 ch3 那條線「記憶的自主與神聖性 vs 記憶的追尋與佔有」明顯是同一條軸，本應合成一條跨 ch2–3 的線。模型沒做到，於是留下一條假的單章線。**照現在的輸出去設計，等於照著 bug 設計。**

- **成本優勢：** Step 2 只是**一次** LLM 呼叫（Step 1 是 38 次併發）。因此在 `名字的潮汐` 上反覆迭代聚合非常便宜，約為重跑整套的 1/38。

- **做法：**
  - `_call_grouping_llm` 加覆蓋率檢查，計算未被任何 group 涵蓋的 TEU
  - 未涵蓋者走第二次補分組，或至少在回傳中誠實帶出「N 個未歸類」
  - `group_teus` 將覆蓋率納入回傳，讓 UI 能顯示
- **連帶：** 這讓 P0-1（TEU 檢視）從「Step 1 的產出回饋」升級為**必要的稽核介面**——沒有它，使用者永遠不會知道自己少了半份分析。
- **待決：** 未涵蓋的 TEU 要自動補分組（多一次 LLM 呼叫），還是先只回報、由使用者決定？

---

## P1 — 軌跡圖對真實資料失效

**這一區的優先序在真實資料出現後被大幅提高。** mock 階段這張圖看起來可用；真實資料下它是壞的。

### P1-1 單章張力線退化成無意義的樁（真實資料）

> **2026-07-31 修訂：先看 P0-6。** 原本的「待決」已有答案——這是 grouping 的缺陷，不是要遷就的資料形狀。

- **現象：** 5 條線有 **4 條 `chapter_range` 是單一章節**（`[3,3]`、`[4,4]`、`[8,8]`、`[9,9]`）。長條寬度實測 491px / 20px / 20px / 20px / 20px。橫軸對 80% 的資料沒有資訊量。
- **根因：** 上游是 P0-6（聚合丟失 47% TEU，導致本應跨章的線被拆成假單章線）；下游是長條的長度編碼「章節跨度」，遇到單章就退化。
- **`chapter_range` 語意確認：** `[min(chapters), max(chapters)]`，是**區間端點**而非章節集合。因此 `[1,5]` 不代表 ch2/3/4 都有 TEU。目前 UI 把它當連續區間畫成實心長條，會誤示中間章節。
- **連帶：** stepper 寫「CROSS-SCENE 跨場景 / 歸納為**跨章節**張力模式」，與實際輸出矛盾。
- **做法：** **先修 P0-6 並重跑 Step 2，再評估這一項。** 修完之後線數會變多、chapter_range 會真的跨章，屆時的畫法選擇（點狀 vs 熱圖 vs 長條）才有意義。另需考慮以實際有 TEU 的章節繪點，而非把 min–max 畫成實心。

### P1-2 最後一章的張力線完全不可見

- **現象：** `過去的執念與誘惑`（ch 9–9，ch9 = maxChapter）長條實測 `left=1415, right=1435`，canvas 右緣 = **1415** → 整條在容器外，畫面只剩一個小圓弧。
- **根因：** `chToPct(maxChapter) = 100%`，加上 `Math.max(x2, x1+2)` 的最小寬度，使最後一章的長條起點就在右邊界。
- **做法：** 對 `x1 + width > 100%` 做內縮，或給 canvas 右側保留 padding。

### P1-3 極點標籤被截斷（真實資料）

- **現象：** 5 條有 **4 條** 標籤截斷（實測 `scrollWidth > clientWidth`）：「記憶的自主與神聖性 vs 記…」「追尋與面對過去 vs 保護與…」「過去的執念與誘惑 vs 活在…」。
- **根因：** 真實 LLM 產出的極點名是 8–10 字（mock 用 2 字，所以沒暴露）。標籤欄寬度固定。
- **做法：** 加寬標籤欄、允許兩行、或 pole A / pole B 上下排列。搭配 P1-1 一併重新配置版面。

### P1-4 強度分桶門檻與實際分布不合

- **現象：** 真實 5 條 = 0.73 / 0.73 / 0.80 / 0.80 / 0.83 → **全部落在 high**。mock 資料則全部落在 mid。三色圖例兩次測試都等於單色。
- **根因：** [intensity.ts](../../frontend/src/components/tension/intensity.ts) 用絕對門檻 0.4 / 0.75；LLM 實際輸出集中在 0.6–0.9。
- **做法：** 改用本書分布的分位數（或至少把門檻校準到觀測分布）。

### P1-5 密度長條首尾位移並與鄰居重疊

- **現象：** 實測 ch1 `left: 0%`（依 `chToPct` 應為 −5%）、ch9 `left: 90%`（應為 95%），兩端各與鄰居重疊約 2.5%，半透明疊出深色塊，且位置不對應章節刻度。
- **根因：** `Math.max(0, Math.min(100 - w, center - w/2))` 的 clamp 破壞了與 `chToPct` 的對位。
- **做法：** 讓密度列與軌跡列共用同一組座標換算，兩端以 padding 容納半根長條而非 clamp。

### P1-6 密度圖沒有刻度

- **現象：** 「TEU 密度」只有相對高度，看不出最高是 3 還是 30。
- **附註：** 密度數值本身也被 P2-2 的重複 TEU 灌水。
- **做法：** 標出最大值，或改成有 y 軸的迷你長條圖。

### P1-7 TEU 圓點壓住百分比標籤

- **現象：** mock 6 條時「57%」被畫成「5◦%」；18 條時 3 處。真實 5 條因只有一條長條而未重現，但成因未變。
- **做法：** 百分比標籤改放長條外側，或圓點避讓。

### P1-8 規模：軸不 sticky、圖過高

- **現象：** 18 條線時軌跡圖高 **938px**（超過視窗），Ch 軸 `position: relative` 不 sticky → 看下半部的列時看不到章節座標，強度圖例也捲出畫面。
- **附註：** 真實資料只有 5 條，此項為規模風險，非當前缺陷。
- **做法：** 軸與圖例 sticky，或給圖表容器 max-height + 內捲。

### P1-9 無障礙

- 每列有 2 個 `tabIndex=0`（label + canvas）指向同一動作 → 5 列 = 10 個 tab stop
- TEU 圓點只有 `title` tooltip，鍵盤與觸控完全取用不到那段 `tension_description`

---

## P2 — 卡片與證據可信度

### P2-1 carrier pills 的 A/B 聚合失效（真實資料）

- **現象：** 「記憶的自主與神聖性 vs 記憶的追尋與佔有」展開後，極點 A 是 `泰奧多爾・萬克` `伊內絲`，極點 B 是 `伊內絲` `泰奧多爾・萬克` — **兩邊完全相同**。
- **根因：** 同一條線裡各 TEU 的 A/B 是對調的：

  ```
  TEU1  A: [泰奧多爾・萬克]  B: [伊內絲]
  TEU2  A: [伊內絲]          B: [泰奧多爾・萬克]
  TEU3  A: [伊內絲]          B: [泰奧多爾・萬克]
  ```

  而 [TensionLineCard.tsx](../../frontend/src/components/tension/TensionLineCard.tsx) 用 `flatMap + unique` 跨 TEU 聚合，把指派關係抹平。另有單一 TEU 內 `A: [伊內絲, 海] B: [海, 伊內絲]` 兩邊全等的案例。
- **嚴重度：** pills 目前是零資訊且主動誤導。
- **做法：** 聚合時做多數決並標示比例、或按 TEU 分別顯示、或在 A/B 衝突時不顯示 pills。
- **待決：** 這是否也反映 TEU 組裝階段的 pole 指派不穩定？若是，UI 只能緩解不能修好。

### P2-2 「3 則證據」實為同一場戲的三次改寫（真實資料）

- **現象：** 該線的 3 個 TEU **全部在 Ch 3**，描述句近乎逐字重複：

  > 這場景的核心衝突在於記憶的本質：它是否可以被視為一種商品…
  > 這場衝突的核心在於記憶的本質：它究竟是不可侵犯的個人領域…
  > 這場衝突的核心在於記憶的本質：它究竟是神聖不可侵犯的個人遺產…

  引文也重複引同樣三句對白（「記憶不能買賣」「我會付你高額報酬」「請務必先來找我」）。
- **問題：** UI 呈現「3 TEU · 73%」「證據 3 則」，審核者會讀成三重佐證。密度圖同樣被灌水（ch3 顯示 3，實為一場戲）。
- **做法：** 偵測同章節 + 高相似度的 TEU 並摺疊為「3 則證據，皆出自 Ch 3」；引文層級去重。
- **待決：** 相似度用什麼判準？（同 chapter + 引文重疊率是最省的近似）

### P2-3 證據是死路：無法回到原文

- **現象：** `Ch 3` 是純文字，引文不可點，carrier 不可點。要核對一條張力線是否成立，必須自己切到閱讀頁翻章節。
- **做法：** 證據 → 閱讀頁深連結（知識圖譜頁的 F4 深連結有前例可沿用）；carrier → 知識圖譜。
- **附註：** 真實資料下 4/5 條是單章，跳章的價值反而更高、實作也更單純。

### P2-4 carrier 缺 entity type

- **現象：** [TensionLineCard.tsx](../../frontend/src/components/tension/TensionLineCard.tsx) 的註解自陳：所有 pill 一律染成 `character` 色。所以「退名之潮」（concept）、「教會」（organization）、「海」（location）全被畫成角色。
- **做法：** `TEUSummary` 補 carrier 的 entity type（後端小改）。與 P2-1、P2-3 同一區塊，宜一起做。

---

## P3 — 審核操作的規模與收束

### P3-1 無批次操作、無鍵盤、無進度

- 18 條規模下：18 張全收合的同質卡片，每條要 2 次點擊才看得到完整證據（展開卡片 → 展開全部 N 則）= 36 次點擊
- 沒有批次核准、沒有「跳到下一條未審」、沒有審核進度（目前只能從 chip 心算）
- **做法：** 批次核准、鍵盤審核（j/k 移動、a 核准、r 拒絕）、審核進度條（與 P0-3 共用）

### P3-2 兩套篩選機制互相打架

- **現象：** 選「已拒絕 **1**」＋勾「隱藏已拒絕」→ 列表 **0 / 6**，空狀態說「調整上方狀態 chip 試試」——但問題出在 checkbox。且 chip 計數是全集計數，不受 checkbox 影響，會出現「標示 1 卻列出 0」。
- **做法：** 兩者操作同一個維度，應合併成一組控制。

### P3-3 無排序

依強度 / 章節 / 狀態排序都沒有，列表順序是 API 順序。

### P3-4 審核完成後沒有終點狀態

- **現象：** 目前 `待審 0 / 已核准 5`、theme 也已核准。整套審核機具（chips、每張卡三顆按鈕、隱藏已拒絕）全變成死重，而頁面沒有任何收束：沒有摘要、沒有匯出、沒有往下一步（知識圖譜／敘事結構）的出口，就停在最後一張收合的卡片。
- **做法：** 完成態顯示摘要與出口；審核控制降階或收合。

---

## P4 — 其他

### P4-1 `frye_mythos` 存的是顯示名而非 id（後端契約）

- **現象：** 實際值是 `"悲劇"` 而非 `"tragedy"`。
- **後果：** `data-mode="悲劇"` → [tension.css](../../frontend/src/styles/tension.css) 的五條 `[data-mode="romance|comedy|tragedy|irony|irony_satire"]` 規則**一條都沒命中** → 實測 Frye badge 的 computed `background-color` = `rgba(0,0,0,0)`，完全無主題色；旁邊 Booker badge 有底色，兩者視覺不一致。切成英文 UI 會顯示「悲劇」。
- **根因：** `get_mythos_summary('frye','zh')` 餵給模型的是「**悲劇** (tragedy)」，prompt 只說 `"frye_mythos": str # The Frye mythos id`，模型挑了粗體中文。
- **做法：** 後端 prompt 明確要求回 id，並在 `_call_theme_llm` 落地前做 id 白名單校驗／中文名反查。
- **附註：** 屬後端修正，但影響前端呈現，宜與前端一併驗收。

### P4-2 完全沒有 RWD

`tension.css` 940 行、**0 個 `@media`**。1024px 下 stepper 擠壓、Ch 軸末刻度被裁切（實測 axis right = 975，「Ch 10」標籤 right = 982）。

### P4-3 空狀態重複

Onboarding hero 已用三格圖解釋完三層管線，下方又接一個空狀態，然後下半頁全空（約 400px）。兩者擇一，CTA 直接放進 hero。與 P0-2 一併處理。

---

## 建議實作順序（2026-07-31 改寫）

原順序把 UI 排在前面。P0-6 出現後改為**先讓資料可信，再設計**——否則設計會照著 bug 畫。

| 階段 | 內容 | 主要理由 |
|------|------|----------|
| **Phase 0** | P0-6 修覆蓋率 → `force=true` 重跑 Step 2（僅 `名字的潮汐`，一次 LLM 呼叫）→ 檢視新輸出 | 這才是該拿去設計的資料形狀。便宜、快，且不修的話後面全部建立在錯的前提上 |
| **Phase 1** | P0-1（`GET /tension/teus`）、P2-4（entity type）、P4-1（frye id）、P0-4（force / dirty） | 四項後端契約補齊，彼此獨立、不依賴任何設計決定，可與 Phase 0 並行 |
| **Phase 2** | Claude Design | 交付：現況截圖 + **修正後的真實輸出（含難看的部分）** + 功能盤點 + Phase 0/1 的結論 |
| **Phase 3** | 依 design canvas 實作前端 | 照慣例從 `.dc.html` canvas 實作，不從文字稿 |
| **Phase 4** | 整合驗收 + 剩餘小修（P1-9 a11y、P4-2 RWD、P0-5） | |

**會被 Phase 2/3 吸收、不需單獨排工的項目：** P0-2、P0-3、P1-1、P1-2、P1-3、P1-6、P1-7、P1-8、P3-1、P3-2、P3-3、P3-4、P4-3（約 13 項）。這些是「現在這個畫法壞了」，重新設計後即消失。

**不論長相如何都要做的工程：** P0-1、P0-4、P0-5、P0-6、P2-1、P2-2、P2-3、P2-4、P4-1、P1-4、P1-9、P4-2（約 12 項）。

若 Phase 0 卡住（例如覆蓋率需要多輪迭代），**不要暫停整條線**——Phase 1 的四項不依賴任何設計或資料決定，可先行。

---

## 待決問題彙整（需使用者決定）

1. **P0-6** — 未涵蓋的 TEU 自動補分組（多一次 LLM 呼叫），還是先只回報？
2. **P0-1** — TEU 一覽是常駐區塊還是階段性區塊？
3. **P0-3** — 未審核完是否硬性擋住 Step 3？
4. **P0-4** — theme dirty 判定放前端還是後端？
5. **P2-1** — pole 指派不穩定是否為 TEU 組裝階段的問題？UI 只能緩解到什麼程度？
6. **P2-2** — 重複 TEU 的相似度判準？

> ~~原 #4「單章線是 UI 遷就資料，還是 grouping 粒度要調整？」~~ — **已由 P0-6 回答：是 grouping 缺陷**。

---

## 附註

- 本計劃僅為調查與規劃產出，**未修改任何程式碼**，也未變更任何真實審核資料。
- 涉及後端的項目：P0-1（新 endpoint）、P0-4（cache invalidation）、P0-6（覆蓋率驗證）、P2-4（TEUSummary 加欄位）、P4-1（prompt 與校驗）。除 P0-6 外都會動到 `docs/API_CONTRACT.md`，實作時需依「API Contract 維護紀律」同步更新。
- 效能附註（非本次範圍）：`get_lines_with_teus()` 每次都對 `teu:` 前綴做全表掃描並在應用層過濾 document_id。TEU 量大時值得加 document 索引。
