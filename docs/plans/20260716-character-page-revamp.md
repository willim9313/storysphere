# 角色分析頁翻新計畫

> 2026-07-16 確立。基於 main branch 程式碼審閱(頁面本體 + 四個 Overview pane + Voice / Epistemic / Compare Drawer)+ UI_SPEC §3.4 + API_CONTRACT 對照,**並經實機 Playwright 探索驗證**(測試書:大唐雙龍傳,99 角色/7 章),經用戶確認範圍後成文。
> 下一步:本文件經用戶確認後,作為設計輸入交 **Claude Design** 整頁重新設計;工程實作以實際交付的 `.dc.html` canvas 為準(不是 prose spec)。
> **2026-07-17 設計定稿**:Claude Design canvas 已交付並完成工程查核(結論:無阻斷項),canvas 副本在 `docs/handoff/20260716-character-page/design-return/`。實作以 canvas 為準;查核發現與範圍增補見文末「設計定稿查核」一節(centrality 端點轉正式並擴充 degree、新增 #14 原型篩選)。

## 背景與定位

角色分析頁(`/books/:bookId/characters`)在 2026-05-16 重設計後,資訊架構本身是健康的(3 primary tab + Overview 內 4 sub-tab,層級清楚),此次翻新**不推翻該結構**。

翻新聚焦兩個主題:

1. **從靜態報告變成可導航的分析工具** — 目前所有分析結論(引言、證據、關係、事件)都是死文字,與閱讀頁、圖譜、事件頁之間沒有雙向通道,無法溯源、無法延伸
2. **進頁引導** — 使用者初次進入不知道該從哪個角色看起;現有未選取狀態只是一行提示 + 前 5 位快速入口,沒有回答「這本書有哪些角色群像?誰重要?從誰開始?」

## 範圍總覽

| # | 項目 | 類型 | 優先 | 後端 | 依賴 |
|---|------|------|------|------|------|
| 0 | **修復 #6a 提及數全為 0(Ch.0)** | 資料缺陷 | **P0,其他項的前置** | **需要(小)** | — |
| 1 | 角色總覽 landing(cast overview) | 新功能 | P0 | 依賴 #0(Phase 2 另計) | #0 + 需設計稿 |
| 2 | 引言/證據溯源 → 閱讀頁段落跳轉 | 新功能 | P1 | 無(#22a 語意搜尋現成) | reader-revamp 合併 + 設計稿 |
| 3 | 關係頁 target 可點擊 → 切換角色 | 新功能 | P1 | v1 無;v2 補 `targetEntityId` | 需設計稿(affordance) |
| 4 | 認知狀態事件 → 閱讀頁跳轉 | 新功能 | P1 | 無 | reader-revamp 合併 |
| 5 | 行為頁 keyEvents ↔ 事件分析頁互通 | 新功能 | P1 | v1 名稱比對;v2 補 eventId | — |
| 6 | 左清單排序 + 搜尋涵蓋原型名 | 既有優化 | P0 | 依賴 #0 | #0 |
| 7 | Arc pane 時間軸視覺化 | 既有優化 | P1 | 無 | 需設計稿 |
| 8 | Voice 生成狀態改伺服器判定 | 既有優化 | P0 | 需小改(見下) | — |
| 9 | 認知 tab 誤信欄樂觀過濾一致性 | 既有優化(小修) | P0 | 無 | — |
| 10 | 認知對照視圖(雙角色資訊差) | 新功能 | P1 | 無(#12e 打兩次) | 需設計稿 |
| 11 | 分層批次「先生成要角」 | 新功能 | P1 | 需小改(batch 子集)或前端迴圈 #7b | #0 |
| 12 | 生成中五階段 checklist | 既有優化 | P2 | 無 | — |
| 13 | 鍵盤操作(↑/↓ 切角色、/ 搜尋、1/2/3 切 tab) | 既有優化 | P2 | 無 | — |
| 14 | 左欄原型篩選 dropdown(設計定稿新增) | 新功能 | P1 | 無(#6a `archetypes`) | canvas 已含設計 |

其中 #1 的總覽設計為**排行/象限雙視圖**(2026-07-16 設計演化;派系 #6d 作為象限顏色編碼,象限 Y 軸需新增 centrality 小端點),見該節說明。

---

## 前置修復:#6a 提及數全為 0(#0)

**實機發現**:測試書 99 個角色的左清單、標題列 meta 全部顯示 `Ch.0` — #6a 後端把 `chapter_count` 寫死為 0(`backend/storysphere/api/routers/books.py:1519, 1525`;analyzed 分支的 `AnalysisItem` 也未填,吃 model 預設 0)。

這直接推翻「以 chapterCount 當重要度 proxy」的前端零改動假設 — **#1 的 hero card 選位和 #6 的排序都依賴這個值,必須先修**。

資料是現成的:`Entity` model 有 `mention_count` 與 `first_appearance_chapter`;KG graph 端點證實提及數有意義(寇仲 chunkCount=1002、徐子陵 701、宇文化及 225 — 排序後正是主角群)。修法:#6a 組裝 response 時從 entity 填入真實值;順帶決定 meta 顯示語意(「提及 N 次」比目前「Ch.N」更誠實,`Ch.0` 的標籤語意本來就含糊)。

**API contract 異動**:#6a 欄位語意說明更新,commit 標註 `[api-contract updated]`。

---

## 新功能一:角色總覽 landing(#1)

把內容區「未選取角色」狀態從導航殘根升級為 cast overview。不開新路由、不加 tab,就是內容區的預設畫面。

### 三個層級

**層級一:群像摘要條**
一行統計:「12 位角色 · 已分析 7 · 未分析 5」+ batch 生成入口(與左欄 BatchEepPanel 呼應)。先讓使用者知道這本書的分析覆蓋狀態。

**層級二+三:雙視圖(2026-07-16 設計演化,取代原 spotlight 卡片網格 + 派系分組清單)**

設計進行中的 Claude Design canvas 已把原「spotlight 卡片 + 派系分組」演化為**排行/象限雙視圖切換**,經可行性查核後採納此方向:

*視圖一:提及量排行(預設)*
- Hero card:排名第 1 的角色放大呈現 — 頭像 + 名稱 + 「核心角色」標籤(前端規則推導)+ 提及量 bar + 引導文案;**若尚未分析,CTA 為「建立核心角色分析」**(實測寇仲即此情境)
- 其後為排行列:名次 + 頭像 + 名稱 + 原型 badge(已分析)/「尚未分析」chip + profileSummary 片段(已分析)+ 提及量 bar(條長=相對全書最大值,線性尺度 — 主角與長尾的落差本身是資訊,不取 log)
- **長尾收合規則仍然適用**:99 列不平鋪,顯示前 N + 「展開其餘 M 位」

*視圖二:定位象限(泡泡圖)*
- X 軸:敘事存在感(提及量/出場跨度,log 尺度);Y 軸:結構重要性(PageRank / 中介中心性);泡泡大小=關係連結數(degree);顏色=派系(#6d)
- 四象限:主角群(高×高)/ **易被略過的關鍵角色(低存在感×高結構重要性 — 本圖核心分析價值)** / 背景常客 / 龍套;切線=兩軸中位數(canvas 已定案)
- **Y 軸與泡泡大小共用一個新後端端點**(設計定稿後轉正式,見 API 依賴表):回傳每角色 `{pagerank, degree}` — degree 必須來自 KG 而非 `cep.relations`(後者只有已分析角色才有;canvas 的 mock 資料此二值皆為假資料,README 自承)。KG 為 in-memory NetworkX,模式同 #6d(同步、純圖計算、免 polling),`nx.pagerank` / `nx.betweenness_centrality` / degree 皆現成
- 設計待定案項:(a) 象限切線定義 — 建議兩軸**中位數**,否則 log 尺度下角色擠單側;(b) label 密度規則 — 99 顆泡泡只標 top N、其餘 hover;(c) **66/99 位無派系** → 真實畫面三分之二泡泡同色,建議無歸屬者低飽和/描邊處理

*派系資料的角色調整*:派系從「層級三的分組結構」改為「象限視圖的顏色編碼」— 設計上的有意取捨(排行回答「從誰開始」、象限回答「誰被低估」)。#6d 仍是依賴,佔位命名限制不變(見下)。

*批次入口*:兩檔批次(#11)的落點需在設計稿確認(建議層級一統計條)。

**長尾規模(實機發現)**:測試書有 **99 個角色**(98 未分析)— 平鋪清單毫無引導意義,任何視圖都必須有收合規則。實測 #6d 對本書回傳 10 個有意義的派系(隋室:楊廣/楊堅/李淵、宋閥、寇仲/徐子陵主角團、宇文閥…),**但 66/99 位無派系歸屬**(`unaffiliatedNames`)— 這是派系從分組結構調整為象限顏色編碼的佐證之一:以派系當主要組織結構時「其他」組反而是最大宗。

**命名限制**:#6d 的 `label` 是「Faction N」佔位字串(F-16 定案純圖計算、無 LLM),本次以 `topMemberNames` 組合稱呼;語意命名(「宇文閥」)另立 **B-059**(`docs/BACKLOG.md`),不在本次範圍。

### 回程路徑(必做,容易漏)

選了角色之後 overview 就回不去了 — 需在左清單頂部加「← 角色總覽」入口(或標題列麵包屑)。取代現有 quickAccess 前 5 位入口區塊。

### 資料可行性

**零後端改動**:#6a `GET /books/:bookId/analysis/characters` 的 `AnalysisItem.content` 就是 `profile.summary`(`backend/storysphere/api/routers/books.py:1506`),前端已取得但目前未使用。archetypes / chapterCount / status 亦齊備。

### Phase 2(需後端,可後做,不在本次範圍)

- **群像簡介**:LLM 生成一段 cast synopsis,放層級一下方(新 endpoint)
- **出場分布 sparkline**:每張卡加 per-chapter 提及熱度迷你條(需 per-chapter mention counts,新 endpoint;與標題列 sparkline 構想共用)

### 為何不用「進頁自動選中主角」

自動選中會跳過群像結構、剝奪方向感,且「提及最多 = 使用者想看的」不一定成立。Overview 保留選擇權,把推薦做在視覺層級裡。

---

## 新功能二:證據溯源與跨頁導航(#2–#5)

共同主題:頁面上到處是「宣稱」,但無法驗證出處、無法延伸探索。

### #2 引言/證據 → 閱讀頁段落跳轉

可點擊的目標文字:

| 位置 | 欄位 |
|------|------|
| PersonaPane archetype 證據列 | `archetypes[].evidence[]` |
| RelationsPane 引言 | `cep.quotes[]` |
| VoiceProfilingPanel 代表引言 | `representativeQuotes[]` |

機制:點擊 → `POST /api/v1/search/`(#22a 語意搜尋,現成)以引言文字定位段落 → 導向閱讀頁並跳至該段(複用 reader-revamp 的認知面板段落級跳轉機制,commit `175fc38`)。

**依賴:`feat/reader-page-revamp` 先合併 main。**

### #3 關係頁 target 可點擊

`cep.relations[].target` 目前是純字串(`frontend/src/api/types.ts:193`)。v1:前端把 target 名稱對照左清單角色名,對得上就渲染成可點,點擊 `handleSelectEntity` 切換角色。v2(可後做):後端在 CEP relations 補 `targetEntityId`,免除名稱比對的 alias 誤差。

**實機發現**:同一 target 會出現多列(宇文化及的關係中「楊廣」有兩列:下屬+敵人),且 target 可能是非角色實體(「宇文閥」是組織,名稱比對不會誤連,符合預期)。設計時建議**按 target 分組**,一個對象一張卡、多段關係描述堆疊,可點性也更清楚。

**資料語意(2026-07-16 查核)**:`cep.relations` **不是 KG 邊的直接搬運**,是 LLM 策展產物 — CEP 萃取時把 KG 關係邊(上限 20 條)+ 時間軸事件 + 原文段落餵給 LLM,由它選出「重要關係」並撰寫類型與描述(`analysis_service._extract_cep`)。這解釋了楊廣重複列與 target 為自由字串的現象。**全量關係在圖譜頁**(graph 端點回傳完整 edges)— 兩者互補:關係 sub-tab 是策展+解讀,圖譜是全量網絡,故本區塊保留「在圖譜中查看 ↗」出口;若未來要在角色頁內做 ego graph,資料源是 graph 端點,不是 `cep.relations`。

### #4 認知狀態事件 → 閱讀頁跳轉

EpistemicStateSection 的已知/未知/誤信事件列(現只有 Ch.X 標籤)點擊跳到閱讀頁該章;若事件有可用文字,升級為段落級(同 #2 機制)。**依賴同 #2。**

**實機發現**:事件量不小(宇文化及在第 7 章游標下:已知 28 / 未知 34),兩欄各是長平鋪列表;ChapterTimeline 的 marker 在同章大量重疊(Ch.1 就有十多個點疊在同一位置,無法分辨)。設計時建議:(a) 事件欄**依章節分組**;(b) timeline marker 同章**聚合成一顆帶數字的點**,hover 展開清單。

### #5 行為頁 keyEvents ↔ 事件分析頁互通

keyEvents 有 chapter + 事件名,事件分析頁(#6b)已存在但互不相連。v1:名稱比對事件分析清單,對得上就連結過去(帶 `location.state.selectId`,同角色頁既有模式);v2:後端 CEP keyEvents 補 eventId。

---

## 既有功能優化(#6–#9)

### #6 左清單排序 + 搜尋 + 提及量視覺化

- 已分析/未分析兩組均**預設依提及數降冪**(#0 修復後),讓「該先分析誰」一目了然
- 每列加一條**相對於全書最大值的迷你提及量 bar**(寇仲滿格、龍套一絲),捲動 99 人清單時重要度地形一眼可見
- 搜尋除名字外,同時比對當前 framework 的原型名

### #7 Arc pane 時間軸視覺化

弧線是天生的時間軸資料(`chapterRange` + `phase`),目前只是文字卡直列。改為:章節軸(複用/延伸 `ChapterTimeline` 元件)上鋪 phase 區段,`cep.keyEvents` 以 marker 疊加,「角色在哪一章轉折」一眼可見。原文字描述保留在軸下方(點擊 phase 區段捲至對應描述)。

**實機發現**:實際 `chapterRange` 會重疊(宇文化及:Ch.1-2 / Ch.2-3 / Ch.3-5,相鄰階段共享邊界章)— 區段渲染要能處理重疊邊界(以轉折點切分或允許相鄰段共點),設計稿需含此 case。

### #8 Voice 生成狀態改伺服器判定

現況:「是否已生成」存 localStorage `voice_generated:${bookId}:${entityId}`,換瀏覽器/清 storage 即與伺服器脫鉤。而 #16a GET 是 **lazy 生成**(呼叫即觸發計算,無 404),前端才需要這個 gate。

**實機重現**:以全新瀏覽器 profile 開啟已分析角色的語音 tab,一律顯示「尚無語音風格」空狀態 — 與伺服器是否已有快取無關,證實此問題非理論性。

改法:#16a 增加 query 參數(如 `?cached_only=1`)— 已有快取回 200,無快取回 404 且**不觸發生成**。前端進 Voice tab 先打 cached_only 判定狀態,移除 localStorage hack;順帶顯示 `generatedAt`。

**API contract 異動**:#16a 補參數說明,commit 標註 `[api-contract updated]`。

### #9 認知 tab 誤信欄樂觀過濾(小修)

已知/未知有做 `chapter <= displayedChapter` 樂觀過濾,誤信欄直接用 `state.misbeliefs` 原始值(`EpistemicStateSection.tsx:148`),拖曳游標時三欄行為不一致。補上同樣的過濾(misbelief 若無 chapter 欄位則保留顯示)。

### #10 認知對照視圖 — 雙角色資訊差(新功能)

認知 tab 現為單角色視角(實測:宇文化及在第 7 章游標下已知 28 / 未知 34)。戲劇反諷的本質是**資訊差**:新增「對照另一角色」入口 → 選第二位角色 → 三欄呈現「只有 A 知道 / 都知道 / 只有 B 知道」,共用同一條章節游標,拖曳看資訊差隨劇情擴大或收斂。

- 資料:純前端,#12e 對兩個 characterId 各打一次,以事件 id 做集合運算
- 互動模式:複用框架對照 drawer 的雙欄版型(實測驗證可用)
- 第二角色選擇器:建議只列已有 visibility 資料的角色

### #11 分層批次 — 「先生成要角」(新功能)

「一鍵生成全部」對 98 位未分析是很重的承諾。#0 修復後,batch 入口提供兩檔:**「先生成前 10 位要角」**(依提及數)與「生成全部」,confirm dialog 顯示對應數量。左上進度條在早期就有意義(1% → 快速到 10%)。

- 後端:batch endpoint(#6c 系)支援 `entityIds` 子集參數(小改),或前端以 #7b 逐一觸發(免後端,但失去 batch 的 skip/failed 彙整)— 實作時擇一,傾向前者
- **API contract 異動**:若走後端子集參數,同步更新並標註 `[api-contract updated]`

### #12 生成中五階段 checklist(既有優化)

目前單角色生成中只有 spinner + stage 文字 + 百分比。符號頁已有五階段 checklist 模式(`InterpretationGenerating` 的 `deriveStages`),角色生成套用同一模式(彙整證據 → 原型判定 → 弧線 → …),等待體驗更有內容且跨頁一致。純前端,依 #8 task 的 stage/progress 推導。

### #13 鍵盤操作(既有優化)

檢視器的使用模式是「一個一個角色巡」:`↑/↓` 切換左清單角色、`/` 聚焦搜尋、`1/2/3` 切 primary tab。注意與既有 Esc(關 drawer)不衝突;焦點在輸入框時不攔截。純前端。

### #14 左欄原型篩選 dropdown(設計定稿新增)

Canvas 在左欄框架選擇器下方新增「依原型篩選已分析角色」:可搜尋的多選 popover,列出當前 framework 的原型分類與各原型的已分析角色數;選中值以可移除的 accent pill 呈現,過濾已分析清單;切換 framework 時重置篩選。

- 資料:純前端 — #6a `analyzed[].archetypes` 依 framework 聚合計數即可
- 原型分類清單:`frontend/src/data/frameworksData.ts` 已有 Jung 12 / Schmidt 45 的 taxonomy(zh/en),與框架索引頁同源

---

## 既有功能盤點(保留不動,供設計參考)

- 3 primary tab(人物概覽/語音風格/認知狀態)+ Overview 4 sub-tab 結構
- Framework 切換唯一入口在左清單 chip;切換不打 API
- 框架對照 Drawer(右側 640px)及其三個觸發點
- BatchEepPanel 批次生成 + 完成 toast
- Tip Ribbon(localStorage 永久 dismiss)
- 標題列:角色名 + framework badge + Ch.X + 在圖譜中查看 + 框架對照 + 覆蓋重新生成(+ partial 時的重試失敗部分)
- ChapterTimeline 拖曳 + 200ms debounce + 樂觀更新模式

---

## 分工模式

- **UI 設計**:交 Claude Design 整頁重新設計。需要新視覺的元件:總覽 landing(統計條/hero card/卡片網格/次要角色 row)、Arc 時間軸、引言「可溯源」affordance(hover/點擊線索)、關係 target 與認知事件的可點擊 affordance、「← 角色總覽」回程入口。
- **工程**:接 canvas 後接資料、路由與跳轉邏輯;**實作以 `.dc.html` canvas + `colors_and_type.css` 為準**(DesignSync `list_files` → `get_file`),不以 prose spec 為準。每批 ≤3 檔案為原則,超出先拆。

## 分批實作建議

| Batch | 內容 | 前置 | 狀態 |
|-------|------|------|------|
| 1(P0 小修 + 資料修復) | **#0 提及數修復(後端)**、#6 清單排序/搜尋/提及量 bar、#9 誤信欄過濾、#8 Voice 狀態(含小後端)、#13 鍵盤操作 | 無 | ✅ 2026-07-17(`96d9856`;#12 挪至 Batch 2 避免重工) |
| 2(canvas 對稿) | #1 角色總覽 landing(排行/象限雙視圖)、#7 Arc 時間軸、#10 認知對照視圖、#11 分層批次、#14 原型篩選、#12 生成中 checklist | #0 + centrality 端點 + canvas | ✅ 2026-07-17(`cd7c315`) |
| 3(跨頁導航) | #3 關係可點(含 target 分組)、#5 keyEvents 互通(v1 名稱比對) | 設計稿 | ✅ 已併入 Batch 2B 一次完成 |
| 4(溯源跳轉) | #2 引言溯源、#4 認知事件跳轉 | ~~reader-revamp 合併~~(2026-07-17 確認 PR #15 已併入 main,前置成立;跳轉機制抽共用 `lib/passageLookup.ts` + `hooks/useSourceJump.ts`) | ✅ 2026-07-17(證據列/引言/語音引言/認知事件/對照 drawer 皆可溯源;閱讀頁 state 契約僅認 paragraphId,章節級 fallback 以加寬搜尋+提示取代) |

## 前端/後端分工

**後端(小改,集中在 Batch 1–2 前完成)**:
- #0:#6a 填入真實提及數/首次出場章
- #8:#16a 增 `cached_only` 參數
- #11:batch endpoint 支援 `entityIds` 子集(若不走前端迴圈)
- #1 象限:角色子圖 centrality 端點,每角色回 `{pagerank, degree}`(模式同 #6d;設計定稿已轉正式)
- v2 後補:#7a CEP `targetEntityId` / `eventId`

**前端(其餘全部)**:總覽 landing、派系分群、清單排序與 bar、Arc 時間軸、認知對照、溯源跳轉、關係/事件互通、checklist、鍵盤操作 — 詳見設計交付包 `docs/handoff/20260716-character-page/`。

## API 依賴一覽

| 項目 | Endpoint | 狀態 |
|------|----------|------|
| 提及數/首次出場 | #6a 填入 `mention_count` 等真實值(現寫死 0) | **需修復(小)** |
| 總覽資料 | #6a 角色清單(`content` = profile summary) | 現成 |
| 派系分群(象限顏色) | #6d `GET /books/:bookId/analysis/factions`(同步、免 polling) | 現成 |
| 結構重要性 + 關係連結數(象限 Y 軸與泡泡大小、hero 關係數) | 新端點:角色子圖每角色 `{pagerank, degree}`(NetworkX 現成,模式同 #6d) | **需新增(小)**,設計定稿已轉正式 |
| 認知對照 | #12e 對兩個 characterId 各打一次 | 現成 |
| 分層批次 | batch endpoint 增 `entityIds` 子集參數 | **需新增(小)**(或前端迴圈 #7b) |
| 引言定位 | #22a `POST /api/v1/search/` | 現成 |
| 段落跳轉機制 | reader 認知面板段落級跳轉 | 在 `feat/reader-page-revamp`,待合併 |
| Voice 狀態判定 | #16a 增 `cached_only` 參數 | **需新增(小)** |
| relations `targetEntityId` / keyEvents `eventId` | #7a CEP 欄位擴充 | v2 可後做 |

## 驗收要點

- 左清單與標題列不再出現 `Ch.0`;測試書排序後寇仲/徐子陵等主角群置頂
- 初次進頁即見角色總覽;點 hero card 載入該角色;選角色後可經「← 角色總覽」返回
- 主角未分析時 hero card 顯示「建立」CTA;99 角色的書層級三預設收合
- 點 archetype 證據/引言 → 閱讀頁對應段落(有跳轉高亮)
- 關係頁同一對象多段關係收成一組;點「楊廣」→ 切到楊廣分析;行為頁點事件 → 事件分析頁選中該事件
- 左清單預設依提及數降冪;搜尋「統治者」能找到該原型的角色
- Arc tab 呈現章節軸 + phase 區段(重疊區間正常渲染)+ keyEvents marker
- 清 localStorage 後 Voice tab 狀態仍正確(已生成顯示結果,未生成顯示空狀態)
- 認知 tab 拖曳游標時,誤信欄與已知/未知欄同步縮減;timeline 同章多事件聚合顯示
- 總覽排行視圖:寇仲為 hero(未分析時顯示「建立核心角色分析」CTA),排行依提及數降冪、長尾預設收合
- 總覽象限視圖(若定案):四象限切線=兩軸中位數;label 只標 top N;泡泡顏色=派系、無歸屬者低飽和;李世民類角色落在「易被略過的關鍵角色」象限
- 認知對照:選寇仲 vs 宇文化及,三欄集合正確、共用游標拖曳同步更新
- batch 入口有「先生成前 10 位要角」/「全部」兩檔,confirm 顯示對應數量
- 生成單一角色時顯示階段 checklist(非純 spinner)
- `↑/↓` 可在左清單移動並載入角色;`/` 聚焦搜尋;輸入框內按鍵不被攔截
- 原型篩選:選「統治者」後已分析清單只剩該原型角色,pill 可移除,切 framework 重置
- 象限泡泡大小與 hero「關係連結 N 條」來自 centrality 端點的 degree(未分析角色也有值)
- 關係邊型別遇到五種已知型別以外的字串時 fallback 為「其他」色,不噴錯

## 實機探索紀錄

2026-07-16 以 Playwright 於本機(5173/8000)實測,真實 payload 已整理進設計交付包 `docs/handoff/20260716-character-page/`。(現況截圖原本也在交付包內,2026-07-17 依用戶決定移除——整頁重新設計,避免舊畫面錨定視覺;以下文字紀錄即為截圖的觀察結論。)關鍵證據:

- 左清單/標題列全部 `Ch.0`;`curl #6a` 證實 99 個角色 `chapterCount` 皆為 0
- KG graph 端點:寇仲 chunkCount=1002、白衣女 801、徐子陵 701、宇文化及 225(提及數可用且有意義)
- 宇文化及關係 11 段,楊廣重複兩列;弧線 3 階段(Ch.1-2 / 2-3 / 3-5 重疊)
- 認知 tab:已知 28 / 未知 34 / 誤信 0,timeline marker 同章重疊
- 新 profile 開語音 tab → 空狀態(localStorage gate 重現)
- #6d 派系:10 個有意義派系,但 66/99 位無歸屬;`label` 是「Faction N」佔位字串,稱呼需用 `topMemberNames` 組合

---

## 設計定稿查核(2026-07-17)

Claude Design canvas 已交付(`docs/handoff/20260716-character-page/design-return/Character Analysis.dc.html` 為存檔副本,設計專案內另有六張設計截圖與 `_ds/` bundle)。工程查核結論:**無阻斷項**。實作以 canvas 為準,以下為查核發現與對應處置:

**Mock 資料 vs 真實後端的落差(實作必改)**:
1. 象限 Y 軸在 mock 是 `x*0.48 + nameHash*0.52` 假資料(設計 README 自承);泡泡大小的關係數對未分析角色是隨機數 → 兩者皆由新 centrality 端點供給(`{pagerank, degree}`),degree 不可用 `cep.relations` 計算(僅已分析角色才有)
2. 生成 checklist 的 6 步 vs 後端實際 3 個 progress 事件(5% CEP / 30% archetype+arc+profile / 85% coverage),且「特質/關係/事件」三步實際都出自 CEP 同一步 → 比照符號頁 `InterpretationGenerating.deriveStages` 前端推導,或實作時微調步驟文案
3. 認知對照 mock 以事件 title 做集合差 → 實作改用 event id

**實作注意(非落差,是慣例轉換)**:
4. Token 命名翻譯:canvas 用設計系統全名(`--entity-character-dot`),repo 沿用縮寫(`--entity-char-dot`,tokens.css 檔頭已注明對照)— 機械翻譯,不可照抄
5. 關係邊配色:canvas 寫死五種 zh-TW 型別對照(敵人/盟友/下屬/成員/其他 → entity 色相);真實 payload 恰為此五種,但 `cep.relations.type` 是 LLM 自由字串,**必須 fallback 到「其他」**(en 書會全數 fallback,可接受;型別枚舉化留給 v2 CEP prompt)
6. 弧線色帶是 `colors[i % 3]` 按階段索引輪替(`--narrative-*-border` 純作色盤),非敘事模式語意 → 無資料缺口

**已確認與計畫一致**:雙視圖與中位數切線、hero CTA 兩態、ego-network 用 `cep.relations`(與 #3 資料語意判斷一致)、雙軌章節游標、認知對照 drawer(720px)、批次兩檔 + 直白 token 成本 modal、語音空狀態、溯源 affordance 以 toast mock(對應 Batch 4,等 reader-revamp 合併)。

**範圍增補**:#14 左欄原型篩選 dropdown(canvas 新增,純前端)。
