# 上傳流程 UX 重設計 — 交付包

日期：2026-07-11
交付對象：Claude Design
⚠️ 請掛在**既有的 StorySphere Claude Design 專案**下進行（v2 設計契約：
focus ring、splash tokens、7-type legend 等已在該專案內），不要另開新專案。
設計完成後以 **`.dc.html` canvas** 交回。

## 內容清單

| 檔案 | 說明 |
|------|------|
| `01-design-brief.md` | 需求書本體：範圍、9 項設計需求、約束、驗收清單 |
| `02-tokens.css` | 全站 design token 實作（Warm `:root` + Ink `[data-theme="ink"]`）——硬約束 |
| `03-DESIGN_TOKENS.md` | token 對照表與使用說明 |
| `04-UI_SPEC.md` | 現行 UI 規格全文（上傳頁見 §3.2；重設計後此文件會回寫） |
| `i18n/` | 實際文案：`upload.zh-TW.json`（主要）、`upload.en.json`、`common.zh-TW.json`。排版請用真實字串，勿用 lorem ipsum |
| `screenshots/` | 現況截圖（見下） |
| `sample-payloads/` | 真實 API 回應 JSON（camelCase，非手寫），設計資料狀態時以此為準 |

## 截圖對照

| 檔案 | 內容 |
|------|------|
| `upload-page-all-states-light.png` | Warm 主題上傳頁：**五種卡片狀態一次入鏡**——處理中（running：七步驟時間軸 + murmur 訊息流）、等待審閱（awaiting_review：接受/審閱/終止三動作）、部分完成（partial + failedSteps）、同名警告＋完成（done）、失敗（error banner） |
| `upload-page-all-states-ink.png` | 同上，Ink 主題 |
| `upload-metadata-form-light.png` | 選檔後的 metadata 表單（書名/作者/語系，語系已被自動預偵測填為中文） |
| `chapter-review-light.png` | 章節審閱頁（真實書籍資料）：左側結構脊、章節分隔列（標題/角色/併上併下）、段落角色下拉 |
| `chapter-review-ink.png` | 同上，Ink 主題 |
| `task-center-light.png` | 任務中心側欄（進行中 2 + 已完成 3，含失敗態） |

## 給設計側的已知現象／注意事項

1. **主題只有 Warm 與 Ink 兩套，皆為淺底，沒有深色主題**。
2. Ink 主題下等待審閱的粉紅提示框仍是粉紅（`--entity-con-bg` 無 ink 覆寫）——
   現況如此；重設計時可一併決定 Ink 下的語意色策略。
3. Murmur 訊息流為 **terminal 式自動捲動**（固定行為，勿設計暫停捲動）；
   `sample-payloads/task-status-running.json` 的 `murmurEvents` 是真實格式與
   內容長度分布（topic / character / location / org / event / raw 各型）。
4. 進度時間軸七步驟由 `stepKey` 驅動（見 payload），`subStage + subProgress/subTotal`
   形如「章節特徵 3 / 7」。
5. 任務狀態為 2 秒輪詢，無 push；「已完成通知」需求（brief §3.2）請以 toast 設計。

## Payload 檔案

`task-status-{running|review|partial|done|error}.json` 對應五種卡片狀態，
皆為後端實際回應（含 `stepKey`、`murmurEvents`、`failedSteps` 等欄位）。
