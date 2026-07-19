# 知識圖譜頁重設計 — 實作計劃

> 日期：2026-07-18
> 依據（優先序由高到低）：本文件 §2 完整度裁決 → brief §9 對帳裁決 → canvas `知識圖譜重設計.dc.html` → brief 本文
> 相關文件：`20260718-kg-redesign-brief.md`（設計輸入＋canvas 對帳）；Claude Design 專案另有 `_Handover.dc.html`（決策摘要，與本計劃一致）

---

## 狀態：✅ 全數完成（2026-07-19）

六期全部實作、通過 lint/tsc/vitest 並 commit 於 `feat/kg-page-revamp`：
Phase 1 `50d35cf`（＋校調 `2a07689`）／2 `a538549`／3 `9cdb8e9`；Phase 4 `1a30fd5`、Phase 5 `76003ad`、Phase 6（本次 commit）。
交付項⑤（類型檢視）依使用者裁決保留 super-node/drill-in、僅改確定性 preset 分組排列（避開 canvas 個別節點佈局的抵觸）；社群「淡化其餘實體」toggle 暫緩（保留 super-node FactionCanvas 無個別實體圖層）。UI_SPEC §3.6 已同步改寫；BACKLOG 無對應 KG 翻新條目（後端依賴 F-01/F-02/F-16 早已歸檔）。

---

## 1. 範圍

重構 `/books/:id/graph` 前端至 canvas 設計，含 F1~F4 新功能。**後端零新 endpoint**：faction 章節參數與 `topMemberNames` 後端已支援，其餘皆前端工作。API_CONTRACT 無變動。

## 2. 完整度裁決（canvas 比現況殘缺的部分，實作一律補回）

使用者已確認「部分功能沒有現在版本實作的完整」——以下為逐項盤點與裁決，實作時**本節優先於 canvas**：

| # | canvas 殘缺處 | 裁決 |
|---|--------------|------|
| C1 | 搜尋只剩輸入框 | **保留** SearchDropdown 分組下拉（實體/章節/段落 stub），套新卡片視覺（＝brief §9-4） |
| C2 | 無事件詳情面板 | **保留** EventDetailPanel 內容欄位，套新面板樣式（＝brief §9-8，已確認） |
| C3 | 時間軸只剩 chapter/story toggle，TimelineConfigModal 消失 | **保留** modal（偵測統計、viable 判定、啟用切換），入口改為時間軸 lens 分頁內的小齒輪；story toggle 依 viable 做 gated（brief §9-6） |
| C4 | 詳情面板無「查看深度分析→」與段落跳轉 | **保留**第三層 AnalysisPanel / ParagraphsPanel 與跳轉閱讀頁連結，套新樣式 |
| C5 | 迷你地圖無 viewport 追蹤/recenter | **保留**現有互動，套新視覺 |
| C6 | 圖例無計數、不可點擊 toggle | **採 canvas 設計**：型別開關唯一入口是 filter chips（解掉現況「兩處控制同一狀態」問題）；圖例改為純說明＋顯示各型別計數 |
| C7 | 「淡入/逐個」動畫模式消失 | **採 canvas 設計**：移除 UI 選項，固定淡入。Handover 文件明示此裁決 |
| C8 | 社群 drill-in 只有面板返回鈕，畫布無變化 | 實作：drill-in 時畫布 zoom-fit 至該陣營＋其餘淡出；面板列成員清單（點成員切個別，沿用現況行為） |
| C9 | 「重設視圖」只清 zoom/選取 | 重置範圍＝現況（含搜尋、型別篩選、drill 狀態） |
| C10 | 推論邊點擊無反應 | **保留**現況：點推測邊 → 開審核面板並聚焦該筆 |

C6、C7 是「有意移除」而非補回——若你不同意，實作前提出。

## 3. 分期與檔案異動

原則：每期一個 commit、通過 lint/測試才進下一期；≤3 個主要檔案/期（型別與 i18n 檔為附帶異動不計）。

### Phase 1 — 畫布呈現核心（聚焦模式、標籤策略、邊語意）
- 修改：`GraphCanvas.tsx`、`graphTransform.ts`、`GraphPage.tsx`（樣式與 stylesheet 邏輯）
- 內容：選取聚焦（非鄰居 dim 至 ~0.1）；標籤 top-N（依 degree，聚焦時焦點＋前 N 鄰居）＋事件標題單行截斷＋zoom 門檻；邊語意配色（合作/敵對/一般/推測，`--graph-*`/語意 token）；節點大小=登場頻率；載入後自動 fit；孤兒節點（degree 0）自畫布移除
- 測試：graphTransform 純函數測試（top-N 選取、孤兒分離）

### Phase 2 — 工具列與推論流
- 修改：`GraphToolbar.tsx`、`GraphPage.tsx`、`InferredEdgePanel.tsx`
- 內容：雙列工具列；推論三態分離（執行 popover 預告→執行中→「重新推論」menu＋「待審核 N」badge＋「顯示推測邊」toggle）；安全/強制重跑移入 menu（破壞性紅字警示）；移除動畫模式 toggle（C7）；「分享連結」「匯出 PNG」按鈕（功能在 Phase 6）
- 順帶修：EntityDetailPanel 巢狀 `<button>` bug（brief §3-10）

### Phase 3 — LensCard 重構（時間軸/認知視角/書籤三分頁）
- 修改：`LensCard.tsx`、`GraphPage.tsx`、`TimelineConfigModal.tsx`（入口調整）
- 內容：分頁式 lens 卡；認知視角——聚合模式停用態＋說明＋「切回個別」、已知 X/Y 統計、誤信標記 toggle、fallback 改全書終局（brief §9-5）、分類可見性按鈕保留；書籤——聚合模式點擊切個別＋選取、localStorage 說明；時間軸——chapter/story gated toggle（C3）＋ F3 逐章播放
- 測試：epistemic fallback 邏輯、書籤跳轉 handler

### Phase 4 — 類型/社群檢視
- 修改：`FactionCanvas.tsx`、`ClusterOverviewPanel.tsx`、`GraphPage.tsx`（faction query 帶 chapter）
- 內容：faction 分析帶時間軸章節參數（後端已支援）；陣營錨點命名（前端由 `topMemberNames[0]`＋「陣營」推導，後端不動）；社群說明卡＋「淡化顯示其餘實體」toggle；分群參數收進階抽屜（draft/applied 機制沿用）；類型檢視改 canvas 的分組排列；drill-in 行為（C8）
- 測試：命名推導（含核心成員未登場 fallback）、chapter 參數傳遞

### Phase 5 — 實體對模式（F1/F2）
- 新增：`components/graph/PairModeOverlay.tsx`（步進器＋pair 側欄）
- 修改：`EntityComparePanel.tsx`（入口按鈕）、`GraphPage.tsx`（pair 狀態機、獨佔模式）
- 內容：F1 逐章演變（聯集固定佈局、淡入、共同鄰居上限＋「+N」聚合、側欄「本章新增」事件標題堆疊——LLM 敘事不做）；F2 路徑追溯（BFS 最短鏈）；兩個空狀態（變化不足降級、無路徑）；獨佔模式（暫停其他 lens，退出還原）
- 資料：沿用逐章 snapshot（7 章、react-query 快取），不加後端
- 測試：共同鄰居計算、BFS 路徑、空狀態判定（純函數）

### Phase 6 — F4 深連結/匯出＋收尾
- 修改：`GraphPage.tsx`（URL state：entity/chapter/mode）、匯出 PNG（cytoscape `.png()`）、分享連結（複製 URL）
- 文件同步：改寫 `docs/UI_SPEC.md` §3.6；BACKLOG 相關條目歸檔；本計劃標記完成狀態
- 全站驗證：`/verify` 流程實測 8 組畫面狀態（brief §7）

## 4. Checkpoint 四問

1. **異動檔案**：見 §3 各期清單；新增檔案僅 `PairModeOverlay.tsx` 一個；無刪除檔案
2. **現成工具**：cytoscape（既有）、react-query 快取、`topMemberNames`（後端既有欄位）、`?chapter=`（後端既有參數）、`useLocalStorage`（既有 hook）——全部不造新輪子
3. **新依賴**：無（套件零新增；後端零改動）
4. **回滾**：feature branch `feat/kg-page-revamp`，每期一 commit，任一期出問題 revert 該 commit 即可；localStorage key 不變所以使用者狀態不受影響

## 5. 執行方式

依既定慣例：各 Phase 派 sonnet subagent 實作，主 agent 逐期 review diff、跑 lint/測試後 commit。Phase 1 完成後先以 `/verify` 流程實測真實密度（264 節點）下的標籤策略，調校 top-N 參數後才續 Phase 2——這是 brief §9-1 指定的「以真實資料調校」步驟。
