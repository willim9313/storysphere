# 上傳流程 UX 重設計需求書（交付 Claude Design）

日期：2026-07-11
狀態：需求已確認，待設計
交付對象：Claude Design（前端視覺／互動設計）
配套文件：`20260711-upload-flow-backend-plan.md`（後端先行項目，與本設計並行）

> 交付格式提醒：設計完成後以 **`.dc.html` canvas** 為準交回，開發端依 canvas 實作
> （不依 prose spec 重新詮釋）。

---

## 1. 背景與範圍

書籍上傳流程的功能面已於 2026-07-11 強化完成（取消路徑、重啟恢復、進度
step key、接受捷徑；見 `20260711-upload-flow-hardening.md`），現在進入
UX/UI 重設計。本文件列出**要重新設計的畫面與新增功能需求**。

**涉及畫面／元件**：
- `UploadPage`（上傳頁：閒置 DropZone → metadata 表單 → 處理中卡片列表）
- `ProcessingCard`（單一書籍處理卡：running / awaiting_review / partial / done / error 五態）
- `ProcessingTimeline`（七步驟進度時間軸）
- `MurmurWindow`（LLM 處理過程的即時訊息流）
- `ChapterReviewPage`（章節審閱頁）
- **全域通知（toast）**：新基礎設施，上傳流程是第一個使用者

**明確不在範圍**（已定案，勿設計）：
- 跳過章節審閱的選項——審閱維持強制卡點（單本流程體感 OK）
- 批次上傳的審閱策略（B-057 另案；本次只含「多檔排隊」的 UI，見 §3.8）

---

## 2. 現有流程與狀態（設計的事實基礎）

```
選檔 → metadata 表單（書名/作者/語言，語言有自動預偵測）
     → 上傳（202 + taskId）
     → running（phase 1：解析→語言偵測→入庫，約數十秒）
     → awaiting_review（強制人工卡點：接受系統判斷 / 開始審閱 / 終止）
     → running（phase 2：摘要→特徵→知識圖譜→符號，LLM 密集、可達數十分鐘）
     → done | done+failedSteps（部分完成）| error
```

**可用資料欄位**（`TaskStatus`，2 秒輪詢）：
- `progress`（0–100）、`stage`（中文階段名）
- `stepKey`：`pdfParsing | languageDetect | summarization | featureExtraction | knowledgeGraph | symbolExploration | dataStorage` —— 時間軸步驟狀態以此為準
- `subProgress / subTotal / subStage`（如「章節摘要 8/24」）
- `createdAt`（任務起始時間，可算已耗時）
- `result.failedSteps`（部分完成時的失敗步驟清單）
- `murmurEvents`（增量訊息流，含 stepKey / 章節號 / 事件類型）

---

## 3. 設計需求清單

優先序：**3.1 與 3.2 為功能真缺口（高）**，其餘為體驗強化（中/低）。

### 3.1 Partial-success 卡片的一鍵重跑【高】
部分完成時，卡片目前只有「前往書庫查看」。需求：失敗步驟直接在卡片上
可重跑（後端 `/rerun/:step` 現成；reader 頁已有 PipelineRerunPanel 可參考其
行為，但視覺請重新設計成卡片內動作）。設計要點：
- 每個失敗步驟一個重跑動作 + 重跑中的 loading 態
- 重跑本身也是 task（會出現在任務中心），卡片上需有重跑進行中的表達

### 3.2 全域完成通知（toast 系統）【高】
使用者離開上傳頁後，目前**沒有任何主動通知**。需求：
- App 層全域 toast：任務轉 `done` / `awaiting_review` / `error` 時彈出，
  含書名與跳轉動作（done → 書籍頁；awaiting_review → 審閱頁）
- toast 為新的全域基礎設施：請設計通用樣式（success / warning / error /
  info 四型）供全站復用，上傳流程是首個使用場景
- 選配：瀏覽器 Notification API（分頁在背景時），設計授權請求的時機與文案

### 3.3 處理卡片：已耗時 + 粗略 ETA【中】
長任務（數十分鐘）需要時間感。以 `createdAt` 顯示已耗時；以
`subProgress/subTotal` 速率外插粗略剩餘估計（標示為估計值，避免精確承諾）。

### 3.4 書名重複的前置警告【中】
警告從「上傳後的卡片」提前到「metadata 表單輸入書名時」即時顯示
（前端以現有書庫清單比對）。設計表單內 warning 態；不阻擋送出（可能是
不同版本/翻譯，使用者自行判斷）。

### 3.5 失敗任務的快速重試【中】
phase 1 失敗（壞檔等）目前只能整個重來。需求：errored 卡片加「重試」，
帶回原 metadata（書名/作者/語言）、僅需重新選檔。

### 3.6 審閱頁操作效率【中】
長書審閱是人工時間最長的環節。需求：
- 鍵盤快捷：章節間跳轉、合併等高頻操作（請設計快捷鍵提示的呈現方式）
- 「只看非 body 段落」的過濾檢視模式
- 通用 undo（目前僅段內切分有一步 undo）
- ⚠️ 大書效能：後端將提供分章載入（B-055，見後端計劃書），審閱頁請以
  「漸進載入」為前提設計（骨架 → 段落文字懶載）

### 3.7 語言偵測結果回饋【低】
自動預偵測完成時，語言下拉旁短暫顯示「已自動偵測：中文」之類回饋，
讓使用者知道該值是系統猜測、可修改。（>15MB 檔案會跳過預偵測，維持
「自動偵測」預設——此狀態不需特別提示。）

### 3.8 多檔排隊上傳【低】
DropZone 允許多選/多拖，逐本填 metadata 後排隊上傳。**每本仍走現有
單本流程（含各自的審閱卡點）**，僅為 UI 排隊，不涉及批次審閱策略。
設計要點：佇列的視覺呈現、單本移除、與處理中卡片列表的關係。

### 3.9 MurmurWindow【約束，非新功能】
- **自動捲動為固定行為**（terminal print 概念）：新訊息持續推進，
  **不設計暫停捲動**。
- 可選配不影響捲動的小功能（如單行點擊複製）。

---

## 4. 設計約束（全站既有規範）

- 顏色/字體一律 CSS variable（`var(--*)`），token 見 `frontend/src/styles/tokens.css`
  與 `docs/DESIGN_TOKENS.md`；新 token 需同步對照表
- 雙主題為 **Warm（預設暖色）與 Ink（黑白墨色）**，皆為淺底——**沒有深色主題**；
  兩套主題下皆需成立，主題切換走 ThemeContext
- 文案 i18n（zh 為主）；階段名由後端提供中文 `stage`，步驟名由前端
  `steps.*` i18n key 提供
- 任務狀態一律輪詢呈現（2 秒），無 WebSocket；設計不要假設即時 push
- 現有 UI 規格參照 `docs/UI_SPEC.md`；本次重設計後需回寫該文件

---

## 5. 驗收清單（設計交付時自查）

- [ ] ProcessingCard 五態（running / awaiting_review / partial / done / error）全數有設計
- [ ] 重跑（3.1）含 loading / 再次失敗的表達
- [ ] toast 四型 + 帶動作按鈕的變體
- [ ] 審閱頁在「分章漸進載入」前提下的骨架/載入態
- [ ] Warm 與 Ink 兩主題皆出
- [ ] 以 `.dc.html` canvas 交付
