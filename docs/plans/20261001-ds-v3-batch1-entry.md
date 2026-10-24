# DS v3 第 1 批：入口流程（書庫・上傳・章節審閱）—— 實作計畫

> 規劃日期：2026-10-01 · 傘票 B-126 · 整合分支 `feat/ds-v3`（基於 `ed7c8be`）
>
> **這是規劃當下的快照，實作後即凍結。** 與現況衝突時以程式碼、`API_CONTRACT.md`、`UI_SPEC.md` 為準。

## 來源

Handoff `redesign_v3_handoff_batch_1.zip`（只留本機，不進 repo）。權威順序同第 0 批：
**決議紀錄 `.dc.html` > 提案 `.dc.html`**；`specs/spec-function.md` 前三條路由的第 6 節「不可丟失」為硬約束；
`PROJECT_RULES.md` 不變。`ss-kit.css` 與 `colors_and_type.css` 與第 0 批**位元組相同**，本批不動 tokens。

## API 完備性檢查

| 需求 | 現況 | 結論 |
|---|---|---|
| 書庫處理中卡＋人工閘門帶 | `GET /tasks` 已有 kind／title／status／stage／progress／`result.bookId` | 不改 API；書庫改讀共用 `qk.tasks.list()`，不再讀 sessionStorage（副作用：別分頁的任務也會出現） |
| 失敗分類（有無應用層 JSON body） | 後端全域 handler 回 JSON 500；Vite 代理斷線回空 body | 不改 API；前端 `ApiError` 補 `hasBody`、`code` |
| 最近開啟軌 | `BookResponse.lastOpenedAt` 有欄位、**後端從不寫** | **補後端**（Q5）：見 1-1a |
| 「已處理 mm:ss」從 `startedAt` 回推 | API 無此欄位，現況用 `createdAt`（#128 後為 UTC Z） | 沿用 `createdAt`（Q2）；審閱等待時間會計入，已接受 |
| 章節審閱 409 | `GET review-data`、`POST review` 只要不在 `awaiting_review` 一律 409、detail 相同 | **補後端**（Q1）：409 帶 `code` 區分「已送出」與「已終止／未開放」，見 1-3a |
| 章節審閱 503 | `RuntimeError` → 503，實際來源為 `llm_client` 的未設定 provider | 不改 API，直接對到定案的 503 橫幅 |

## 已裁決（2026-10-01）

- **Q1 409**：後端分 code。已終止那種用草稿文案標 TODO。
- **Q2 計時**：沿用 `createdAt`，不排除審閱等待時間。
- **Q3 投件拒絕**：採設計的「每檔一列」版型，文字沿用既有 i18n（`dropzone.errorInvalidFormat`／`errorTooLarge`），組成「{檔名} · 既有訊息」。
- **Q4 總覽摘要行**：照 02 決議紀錄，切換「逐章／總覽」，摘要行沿用逐章態原句，不新增字串。
- **Q5 最近開啟**：保留條件渲染、RecentBookCard 改 C 區樣式，**並補後端寫入 `lastOpenedAt`**。
  「觸發分析」實為導覽（spec §4 標零成本），不加 sparkles。

## 工程決定（記入 `DS_V3_DESIGN_FEEDBACK.md`）

- 書庫密度：書卡＋處理中任務 **> 8 張**切滿載（稀疏 max-w 960 一排 4 張，8 張＝兩排）。
- 最近開啟軌位置：A／B 主版型沒畫，放在人工閘門帶之下、篩選列之上，橫排最多 3 張。
- 按鈕旁的成本說明（「寫入資料 · 先停在章節審閱…」「逐項重跑：消耗 token…」「接受系統判斷：寫入資料…」）比照 0-F 視為註解。
- 部分完成卡保留既有「書籍已儲存，但以下步驟未能完成 · 可直接重跑」（稿漏畫）。
- 目錄入口沿用既有「目錄對照」（README 寫「查看目錄」，canvas 與 i18n 為「目錄對照」）。
- 「終止處理」改為先開損失清單確認框（現況按下即終止），文案用 README §5 草稿。
- 「處理中」狀態下的步驟沒有 `subTotal` 時不畫假進度條（03 決議紀錄 C 區圖例：只在後端有真實進度時畫）。

## 子任務拆分

每個子任務一個分支、一個 PR，base `feat/ds-v3`。1-0 合入後，1-1／1-2／1-3 可平行。

| # | 分支 | 內容 |
|---|---|---|
| 1-0 | `feat/ds-v3-12-batch1-shared` | 共用：`ApiError.hasBody/code` ＋ `failureKind()`；`PageFailure`；`EmptyState`；`ConfirmDialog` 損失清單版（`items`、`danger`）；kit 補 `.ss-badge*`／`.ss-pill*`／`.ss-progress`／`.ss-tabs` 分段型；`common.json` 定案失敗文案 |
| 1-1a | `feat/ds-v3-13-last-opened` | 後端：`documents.last_opened_at` 欄位（ALTER 遷移）、`POST /books/:id/opened`（204／404）、`GET /books` 與 `GET /books/:id` 回傳；前端 `BookLayout` 進書時呼叫一次 `[api-contract updated]` |
| 1-1b | `feat/ds-v3-14-library` | 書庫：兩套密度、人工閘門帶、BookCard 改 kit（status 字符、降級告警移位、兩段式刪除）、處理中卡、三種空狀態、兩種失敗、骨架、最近開啟軌 |
| 1-2 | `feat/ds-v3-15-upload` | 上傳：C／B 換檔、投件拒絕每檔一列、表單（偵測徽章、同名警告位置）、7 步 timeline、murmur 型別對映、等待審閱區、部分完成、已完成／失敗卡、頁面失敗、終止確認框 |
| 1-3a | `feat/ds-v3-16-review-409` | 後端：審閱相關 409 帶 `code`（`review_submitted`／`review_closed`／`review_not_open`）`[api-contract updated]` |
| 1-3b | `feat/ds-v3-17-review` | 章節審閱：麵包屑外框、結構脊小方塊、總覽態 B′、收合導軌 Ink 修正、角色對照表、目錄抽屜三態、邊界輔助五態橫幅（含 503）、切分／復原／送出／放棄、載入與送出失敗、409 主版型 |

### 409 code 判準（1-3a）

| 任務狀態 | code | 前端呈現 |
|---|---|---|
| running／done，且 `result.bookId` 存在（已過審閱點） | `review_submitted` | 409 主版型：「這本書的章節審閱已經送出」 |
| error（含終止） | `review_closed` | 草稿 TODO：「這本書的處理已終止」／「審閱視窗已關閉，這一頁的編輯不會被接受。」 |
| 找不到任務，或尚未到審閱點 | `review_not_open` | 草稿 TODO：「這本書目前不在章節審閱階段」／「這一頁的編輯不會被接受。」 |

回應形狀沿用現有 `{"detail": str}`，**加一個頂層 `code`**（與 `schemas/common.py::ErrorResponse` 一致）。

## 驗證

- 每個子任務：五道閘門＋vitest 全綠；後端改動兩種 task store backend 各跑一次 `tests/api`。
- 畫面：對應決議紀錄 frame 逐區並排截圖（Warm／Ink）；不可丟失表逐條核對落點。
- 失敗態：`playwright-cli route` 模擬 JSON 4xx／5xx、空 body 502、斷線；409 三種 code；503。
- 最近開啟軌：真實點進書後回書庫確認出現；排序以 mock 驗。

## 不做

- `pipelineStatus` 四階段進度化、作者行（README 刻意不做）。
- TimelineConfigModal 內容（屬 `/timeline`）。
- murmur 篩選／搜尋。
