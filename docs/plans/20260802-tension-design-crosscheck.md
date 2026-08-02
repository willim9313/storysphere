# 張力分析頁：設計稿 vs 翻新計劃 核對

**日期：** 2026-08-02
**設計稿：** Claude Design project `0d872800-124b-41c4-af76-9cd49c33c7f5`（`design_handoff_tension_analysis/`）
**被核對的計劃：** [20260731-tension-page-revamp.md](20260731-tension-page-revamp.md)
**結論：** 以設計稿為準。計劃的 P1 全區作廢、6 個待決問題全被回答，但設計稿追加了 **7 項後端契約**，Phase 3（前端實作）前必須插入 Phase 1b。

---

## 0. 現況：計劃的 Phase 0 / Phase 1 已完成

`feat/tension-data-contracts`（PR #22）已合併，計劃的第一批後端契約全數落地：

| 計劃項 | commit | 狀態 |
|---|---|---|
| P0-6 覆蓋率揭露 | `450218e` | ✅ `group_teus` 回 `coverage` |
| P0-1 `GET /tension/teus` | `f93461d` | ✅ `TEUDetail` 含 `line_id` |
| P2-4 carrier entity type | `63be9d0` | ✅ `Carrier.entity_type` + `pole_*_stance` |
| P4-1 frye/booker id | `a59c15d` | ✅ 讀寫兩端正規化 |
| P0-4 force / dirty | `db61f65` `ddfa381` | ✅ `is_stale` + `stale_reason`，重跑送 `force=true` |

**設計稿與這批的相容性：良好。** `line_id` nullable、`is_stale`、`entity_type` 正是設計稿列為「資訊骨幹」的三項。

---

## 1. 設計稿回答了計劃的 6 個待決問題

| # | 計劃的待決 | 設計稿的答案 | 後續動作 |
|---|---|---|---|
| 1 | P0-6：未涵蓋 TEU 自動補分組 or 只回報？ | **只回報 + 人工指派**。格點最後一列「未歸入任何張力線」、虛線描邊、專屬篩選、每筆有「指派到張力線」按鈕 | **需要新 endpoint**（見 §2.7） |
| 2 | P0-1：TEU 一覽常駐 or 階段性？ | **常駐**。做成模式切換的第二個 tab（`張力線 6` ⇄ `TEU 逐章 38`），ready 狀態下也留著 | 無爭議，照做 |
| 3 | P0-3：未審核完是否硬擋 Step 3？ | **軟擋**。stepper step 5 未就緒時 `border-style:dashed; opacity:.7`，note 顯示「尚有 n 條未審核」，`合成全書主題` 按鈕只在 6/6 時長出來 | **「一鍵生成全部」決定不做**（§5.2），因此 Step 3 的唯一入口就是 6/6 後的按鈕與 hero 的「重新合成」 |
| 4 | P0-4：dirty 判定前端 or 後端？ | **後端**——與已 shipped 的 `is_stale` 一致 | ✅ 已完成 |
| 5 | P2-1：pole 指派不穩定，UI 能緩解到什麼程度？ | 明確答案：抽屜以**多數決**決定 A/B，並顯示「6 則中有 3 則相反」警告條，逐則展開可看個別指派 | **需要 `flipped`**（見 §2.1） |
| 6 | P2-2：重複 TEU 的相似度判準？ | **沒回答**。設計把 `sceneGroupId` 直接列為後端必須提供的欄位，前端只負責摺疊顯示 | **判準仍未定，且沒有現成欄位可用**（見 §2.2） |

---

## 2. 設計稿新增的後端契約需求（計劃裡沒有）

設計稿 README 自己標明：「`flipped`、`sceneGroupId`、`lineId`、`stale` ——這四項是整個設計的資訊骨幹，缺一個就有一塊 UI 沒東西可畫。」後兩項已完成，前兩項沒有。實際盤點下來共 7 項缺口：

### 2.1 `TEU.flipped`（A/B 與所屬線的多數決相反）

- **設計用途：** 抽屜的「A/B 指派不穩定」警告條、證據展開區的 `⇄ 指派相反 ·` 前綴
- **現況：** 無此欄位。**且前端無法推導** —— `#14e` 的 `TEUSummary` 連 `pole_a_concept` / `pole_b_concept` 都沒有（只有 carriers 與 stance），連比對的原料都缺。`TEUDetail`（`#14d-2`）才有 pole concept，但那支端點不帶 line 上下文
- **兩條修法：**
  - (a) 後端在 `get_lines_with_teus()` 算好 `flipped: bool` 塞進 `TEUSummary`
  - (b) `TEUSummary` 補 `pole_a_concept` / `pole_b_concept`，前端自己做多數決
- **建議 (a)**：翻轉判定是語意比對（TEU 的 pole concept vs line 的 canonical pole），放後端與 grouping 邏輯同處比較穩

### 2.2 `TEU.scene_group_id`（同場景重複抽取）

- **設計用途：** 表格「證據」欄的 `6 → 3 則`、抽屜的「疑似同場景，摺疊為 3」與逐字對照展開
- **現況：無任何現成來源。** 已確認：
  - TEU 快取鍵是 `teu:{event_id}`，**一個 event 只會有一個 TEU** → `event_id` 不能當 scene group
  - `Event` model（[events.py:46](../../backend/storysphere/domain/events.py)）只有 `chapter` 與 `narrative_position`，**沒有 chunk / scene 錨點**
  - 也就是說 P2-2 觀察到的「Ch3 三則近乎逐字重複」是**上游 event 抽取把同一場戲切成三個 event**，不是同一個 event 被抽三次
- **這是本次核對中唯一「設計稿假設了一個不存在的資料」的地方**

> ⚠️ **2026-08-02 驗證結果：以下判準已證實無效，本項從 Phase 1b 移除。**
> 在 `名字的潮汐` 38 個 TEU 上，門檻 0.3 / 0.4 / 0.5 / 0.6 / 0.7 **全部產出 0 組**。
> 原因是 LLM 每次都用不同方式轉述同一句對白，集合比對看不出是同一句；全書只有
> 5 個引文字串曾出現在兩個 TEU 中。改用字元級相似度會把該摺的 3 則摺成 2 則，
> 比不摺更糟。根因是**事件抽取把一場戲切成多個 event**（一 event 一 TEU）。
>
> 已轉為 backlog **B-069**（摺疊判準）與 **B-068**（事件去重，根因）。
> 張力頁證據區改為誠實顯示「n 則」，不做摺疊、不提供逐字對照。
>
> 以下保留原判準規格作為「已試過、不可行」的紀錄。

**原判準（已作廢）：同章節 + 引文集合 Jaccard 重疊率 ≥ 0.5 視為同場景。**

| 項目 | 決定 |
|---|---|
| 比對範圍 | 同 `document_id` **且**同 `chapter` 的 TEU 兩兩比對。跨章一律不同組 |
| 相似度 | 兩筆 TEU 的 `evidence: list[str]` 視為集合，取 Jaccard = \|A∩B\| / \|A∪B\| |
| 門檻 | **≥ 0.5** 判為同場景 |
| 引文正規化 | 比對前去除前後空白與所有標點／引號（LLM 常對同一句話微調標點）；比對用正規化後的字串，顯示仍用原文 |
| 傳遞性 | 用 union-find 取傳遞閉包 —— A~B、B~C 則 A、B、C 同組。避免出現「摺疊組互相重疊」這種前端畫不出來的結構 |
| group id | 組內**最小的 TEU id**（字典序）。純衍生、穩定、不需 migration |
| 單筆情形 | 沒有同組者的 TEU **也給 group id**（自己一組）。前端一律用「組大小 > 1」判斷要不要顯示摺疊，不做 null 分支 |
| `evidence` 為空 | 無從判定，一律自成一組 |

實作位置與語氣：

- 放在 `TensionService` 的**共用 helper**，`get_lines_with_teus()`（`#14e`）與 TEU 稽核端點（`#14d-2`）**必須呼叫同一個**，否則同一批 TEU 在兩個模式下會分出不同的組
- **不落地存進 cache** —— 這是衍生值，且門檻未來可能調整；存了就要 migration
- 回報語氣是**「疑似」而非斷言**，對應設計稿文案「6 則 · 疑似同場景，摺疊為 3」。摺疊只影響顯示，**不影響強度平均、章節覆蓋、TEU 計數等任何計算**
- 已知偽陽性風險：同一章內兩場不同的戲若引用了同一段對白（例如回憶重述），會被誤併。接受此風險，因為使用者展開後就會看到逐字對照、自己判得出來

**驗證已執行（2026-08-02）**，結果見本節開頭的警告框：所有門檻皆為 0 組，判準作廢。
「調門檻不改演算法」的升級規則在此不適用——問題不在門檻。

### 2.3 `TensionLine.assembled_by` / `assembled_at`

- **設計用途：** 聚合失敗卡的 `tension_aggregator_v1 · 2026/07/31 14:22`、重跑區的版本 meta
- **現況：** `TEU` 有 provenance、`TensionTheme` 有 provenance，**唯獨 `TensionLine` 兩個都沒有**（[tension.py:84-101](../../backend/storysphere/domain/tension.py)）
- **成本低**，加兩個欄位即可

### 2.4 極點描述 `poleADesc` / `poleBDesc`

- **設計用途：** 抽屜的「極點 A / 極點 B」兩張卡各有一行描述（`400 13px/1.75 serif`）
- **現況：** `TensionLine` 只有 `canonical_pole_a/b`（標籤）與 `thematic_note`（全線註記）
- **降級選項：** 用聚合後的 `pole_a_stance` 頂替。但語意不同 —— stance 是「載體如何體現該極」，不是「該極是什麼」。**建議先用 stance 上線，標記為已知落差**，不為此多跑一次 LLM

### 2.5 修改紀錄 `edit: { poleA, poleB, note, editedAt, editedBy }`

- **設計用途：** 抽屜的「人工修改註記」區塊，顯示 `原始：{舊 A} vs {舊 B}` 與 `理由：…`；標籤編輯器有「修改理由」輸入框
- **現況：** `#14f PATCH /tension/lines/:lineId/review` 只吃 `canonical_pole_a/b`，**原地覆寫，原始標籤永久遺失**，也沒有 `note` 欄位
- 需要在 `TensionLine` 加一個 `edit` 子物件並擴充 `#14f` request body

### 2.6 `theme.reviewed_count_at_synth`

- **設計用途：** theme hero 的「合成時有 {n} 條尚未審核」警告
- **現況：** 未儲存。用「當下的未審核數」代替是錯的語意（合成後又審核了，警告會自己消失，但那則主題仍然是用未審核的線合出來的）

### 2.7 「指派 TEU 到張力線」endpoint

- **設計用途：** 落單清單每列右側、TEU 逐章模式的未歸入卡片底部，各有一顆「指派到張力線」按鈕
- **現況：** 無。需要類似 `PATCH /tension/teus/:teuId/assign`（body: `document_id`, `line_id`），並連帶更新該 line 的 `teu_ids` / `chapter_range` / `intensity_summary`
- **注意：** 這會讓 line 的 `intensity_summary` 與 `chapter_range` 變成可被人工改動的衍生值，要決定是後端重算還是前端算

### 2.8（次要）`chunkRef` —— 「回到原文」的定位精度

- **設計用途：** TEU 卡與抽屜證據的 `回到原文 · 第 n 章 ↗`
- **現況：** 閱讀頁 deep-link 吃的是 `location.state = { paragraphId: <chunkId>, chapterNumber }`（[ReaderPage.tsx:115-162](../../frontend/src/pages/ReaderPage.tsx)），有 `chunk-jump-flash` 高亮。**TEU 只有 `chapter`，沒有 chunk id**
- **降級：** 只跳章節、不高亮段落。設計文案寫的就是「第 n 章」，**降級後仍然符合設計**，可接受。若要精確定位需 TEU 補 chunk 錨點（上游 event 也沒有，成本高）
- **建議：先做章節層級跳轉，不列入 Phase 1b**

### 2.9（次要）Step 2 的四段子步驟

- 設計 §4 要求進度卡顯示四段具名子步驟（讀取 TEU / 建立相似度矩陣 / 歸納對立軸並命名極點 / 寫回並計算章節覆蓋）
- `group_teus` 已有 `progress_callback(pct, stage)`（[tension.py:59](../../backend/storysphere/api/routers/tension.py)），只需確認 stage 字串對得上這四段，屬小改

---

## 3. 設計稿刪掉的東西

### 3.1 軌跡圖全部消失 → P1 全區作廢 ✅

`TensionTrajectoryDashboard.tsx` 被「章節格點（Chapter grid）」取代：一列一線、一格一章、每個 TEU 一根柱。計劃預期的 P1-1 ~ P1-3、P1-5 ~ P1-8 **全部隨舊圖消失**，不需單獨排工。

**但 P1-4（強度分桶）設計給了不同的答案。** 計劃提的是「本書分位數」，設計給的是明確的線性正規化：

```
t = (avg - min) / (max - min)     // 本書內的相對值
條長 = 8 + t × 92 (%)
檔位：t > .66 → 高；t > .33 → 中；其餘 低
表格顯示的數字仍是原始平均（.82 這種去前導 0 的兩位小數）
```

現行 [intensity.ts](../../frontend/src/components/tension/intensity.ts) 是絕對門檻 `0.4 / 0.75` —— **要改成接受整組值、回傳相對檔位**。另注意設計只用到 `-bg` / `-edge` 兩個 token，現行 `intensityBarFg()` 用的 `--tension-intensity-*-fg` 在設計稿的 token 清單中不存在，需確認是否保留。

### 3.2 Frye mythos / Booker plot badge 消失 ⚠️ 需要你決定

設計稿的 theme hero（§7）只有：標籤列 + 命題本文 + 不完整警告 + 支撐張力線 pills + 版本 meta。**README 全文沒有出現 frye / booker / 神話原型 / 情節類型。** 12 張截圖的說明也沒提。

後果：
- 剛 shipped 的 P4-1（`a59c15d` frye/booker id 正規化）變成沒有展示端
- `tension.css` 的五條 `[data-mode="romance|comedy|tragedy|irony|irony_satire"]` 規則整組成為死碼
- `TensionThemeResponse.frye_mythos` / `booker_plot` 仍會回傳，只是沒人畫

**決定（§5.1）：保留，由我們補位置。** `[data-mode]` 規則不刪，但要改成走 token。

### 3.3 Theme 審核（`#14j`）消失

設計的 theme hero 底部只有「重新合成」outline 按鈕，**沒有 theme 的核准 / 拒絕 / 改寫命題**。`#14j PATCH /tension/theme/:themeId/review` 會變成無 UI 呼叫端。

同時 `TensionTheme.review_status` 也沒有展示位置 —— hero 上的 badge 是「最新」/「已過期」（來自 `is_stale`），不是審核狀態。

### 3.4 現有元件的去留

| 元件 | 設計稿對應 | 處置 |
|---|---|---|
| `TensionStepperStrip.tsx` | §1 五段 stepper | 重寫（3 段 → 5 段，含兩個 gate） |
| `TensionOnboardingHero.tsx` | §2 empty state | 重寫（三格圖解 → 單一插畫 + 兩顆 CTA），P4-3 解決 |
| `TensionSummaryChips.tsx` | §9b 篩選列 | 重寫（chips + checkbox 兩套 → 一組連體按鈕），P3-2 解決 |
| `TensionTrajectoryDashboard.tsx` | §9a 章節格點 | **整個換掉** |
| `TensionLineCard.tsx` | §9d 表格 + §11 抽屜 | **整個換掉**（卡片列表 → 表格 + 右側抽屜） |
| `TensionThemeHero.tsx` | §7 theme hero | 重寫 |
| `TensionStatusBadge.tsx` | §9d 狀態欄 badge | 大致可留，需對齊 token |
| `intensity.ts` | §9a/§9d 相對強度 | 改演算法（見 §3.1） |

**幾乎是整頁重寫**，`tension.css`（964 行）同樣。

### 3.5 用詞對照

設計稿用 `edited`，後端用 `modified`。**維持後端的 `modified`**，只在 i18n 對到「已修改」即可，不要為此改契約。

---

## 4. 設計稿沒碰、計劃仍須處理的

### 4.1 P4-2 RWD —— 不但沒被吸收，還變難了

設計稿是 1440px 定寬、`height:100vh` 不滾動、右側 **432px 固定寬**抽屜、格點是 `320px + repeat(10, 1fr)`。**章節數多的書（大唐雙龍傳）與窄視窗都沒有規格。** 需要決定：

- 抽屜在窄視窗改 overlay 還是推擠？
- 格點超過 N 章時橫捲、分頁、還是聚合？
- 表格的 7 欄固定 px 在 1024px 下怎麼收？

### 4.2 P1-9 a11y —— 部分改善，未解決

設計加了完整鍵盤快捷鍵（J/K/A/X/E/Space/V/Esc），這比原本好很多。但：
- 格點的柱子、TEU 迷你柱狀圖仍是純視覺，鍵盤與螢幕閱讀器取用不到 `tension_description`
- 未提 tab order 與 aria 標註
- 設計自己有提醒：Ink 主題下 success/warning/error 塌成同一個黑，**語意不能只靠顏色**

### 4.3 P0-5 組裝失敗數 —— 設計沒有留位置

stepper step 1 的 note 只有 `38 / 41 場景`，**沒有失敗清單的展開位置**，也沒有失敗態的樣式規格。可用「41 個場景中 3 個組裝失敗」的 warning 色 note 塞進去，但這是我們自己補的，非設計稿內容。

---

## 5. 三項決定（2026-08-02 已拍板）

### 5.1 Frye / Booker badge：**保留，由我們補位置**

設計稿沒畫，但功能保留。做法：在 theme hero 的標籤列（`BOOK 全書級 · TENSIONTHEME` 那一行）右側、`最新` badge 旁加兩顆 badge，沿用設計稿的 badge 規格（`padding:2px 9px; border-radius:var(--badge-radius); 500 11px`）。

- P4-1 的後端正規化照常有用，`[data-mode]` CSS 規則**不刪**，但需依 §7 的 token 紀律改寫（現行硬編碼色碼要換成 token）
- 需標明：這一塊**不在設計稿內**，是我們自行補位，Ink 主題下要另外驗

### 5.2 「一鍵生成全部」：**不做這顆按鈕**

empty state 只留 `開始 Step 1 · TEU 組裝` 一顆 accent 按鈕（原本兩顆按鈕的 flex 佈局收成一顆），強制逐步推進。這與計劃 P0-3 的原意一致。

連帶影響：
- 設計 §2 的兩顆按鈕變一顆，token 提示 badge 照留
- theme hero 的「合成時有 n 條尚未審核」警告仍要做 —— 觸發路徑改為 hero 的「重新合成」按鈕（不受 6/6 限制），以及**既有資料**（`名字的潮汐` 現有的 theme 就是舊流程下用未審核線合出來的）

### 5.3 Phase 1b：**§2 的四項全做**

| 項目 | §2 | 備註 |
|---|---|---|
| `flipped` + `TensionLine` provenance + 指派 endpoint | 2.1 / 2.3 / 2.7 | 必做三項 |
| `edit` 紀錄（原始標籤 + 修改理由） | 2.5 | 動 `TensionLine` model 與 `#14f` |
| ~~`scene_group_id`~~ | 2.2 | **已移除**——判準經真實資料驗證失敗（0 組），轉 backlog B-069 / B-068。見 §2.2 |
| `reviewed_count_at_synth` | 2.6 | 觸發路徑見 §5.2 |

**不列入 Phase 1b：**
- 極點描述（§2.4）—— 降級用 `pole_a_stance` 頂替，標記為已知落差
- `chunkRef`（§2.8）—— 先做章節層級跳轉
- Step 2 四段子步驟（§2.9）—— 屬小改，併入 Phase 3 第 2 項

---

## 6. 修正後的實作順序

計劃原本的 Phase 3「依 canvas 實作前端」不能直接接在 Phase 1 後面，中間要插一段：

| 階段 | 內容 | 狀態 |
|---|---|---|
| Phase 0 | P0-6 覆蓋率 + 重跑 Step 2 | ✅ 完成 |
| Phase 1 | 第一批後端契約（P0-1 / P2-4 / P4-1 / P0-4） | ✅ 完成 |
| Phase 2 | Claude Design | ✅ 完成（本文件即核對產出） |
| **Phase 1b** | **第二批後端契約**（§5.3 四項全做）：`flipped`、`TensionLine` provenance、指派 endpoint、`edit` 紀錄、`reviewed_count_at_synth`。`scene_group_id` 驗證失敗已移除（§2.2） | **擋住 Phase 3** |
| Phase 3 | 依 `.dc.html` canvas 實作前端 | 依設計自訂順序（見下） |
| Phase 4 | P4-2 RWD、P1-9 a11y、P0-5 失敗清單 | 設計未涵蓋，仍要做 |

Phase 3 內部沿用設計稿建議的順序（審核主動線價值最高，安全網不要放最後）：

1. 張力線表格 + 篩選/排序 + 審核抽屜
2. Pipeline stepper + 各狀態卡（empty / step1 / running / error）
3. 章節格點 + 未歸入列
4. TEU 逐章模式
5. 鍵盤快捷鍵 + 批次操作
6. 重跑確認框 + stale 狀態

**依 CLAUDE.md「一次異動超過 3 個檔案先拆子任務」，Phase 3 的 6 個子項各自獨立確認。**

---

## 7. 附註

- 設計稿的 `.dc.html` 原型用自訂 template runtime（`support.js`、`<x-dc>`、`<sc-for>`）—— **不要移植**，只讀結構與樣式
- 所有樣式一律走 design token（`var(--*)`），不抄 hex；新增 token 需同步 `docs/DESIGN_TOKENS.md`
- Modal **禁止 `backdrop-filter`**，遮罩是平的 `rgba(42,38,32,0.42)`
- 文字符號（`✓ ! ✕ ▾ ↗ ⇄`）實作時一律換成 Lucide line icons
- Ink 主題必須同時可用
- §2 的後端異動全部會動到 `docs/API_CONTRACT.md`，依「API Contract 維護紀律」在 commit message 標 `[api-contract updated]`
