# 目錄對照提示（TOC Cross-check Hint）

> 審閱頁輔助功能規劃 — 2026-07-12
> 狀態：**已實作**（Phase 1 後端 + Phase 2 前端）。前端設計來源＝Claude Design canvas
> 「章節審核 定稿.dc.html」（project `86b9a750-30fb-4a02-a4bb-5be08f635524`）。定稿細節見 §7。

---

## 1. 目的（一句話）

在章節審閱頁，用 AI 從已偵測到的「目錄頁」解析出**書本自己聲明的章節清單與順序**，並排顯示給用戶，讓他**自行與左側偵測到的章節骨架核對**，一眼看出切分錯誤（多切／漏併）。

**定位：輔助提示，純顯示。** 不做自動配對、不驅動任何切分邏輯。

---

## 2. 為什麼要用 AI（而不是 regex）

目錄頁的原始文字已經在手上（`role=='toc'` 的 chapter，其段落文字照原樣進 review data），但它的格式極不穩定：

- 點引導線 `第一章 開端 …………… 15`
- 巢狀結構（part / 卷 / 章 / 節）
- 多行條目、頁碼有無不一、中英混排

regex 逐條解析脆弱且維護成本高。改用 LLM 讀整段 TOC 文字、輸出結構化的有序條目，穩健得多，且正好沿用現有「邊界輔助辨識」的 opt-in 按鈕呼叫 AI 模式（成本可控、行為一致）。

---

## 3. 後端工程規劃

### 3.1 資料來源
現成：`ChapterRole.toc` 的章節，其段落原始文字已隨 pipeline 存下並進 review data。無需改動偵測邏輯。

### 3.2 新 service：`toc_parser.py`
比照 `services/chapter_role_suggester.py` 的形狀（LLM-assisted、opt-in）。

輸入：TOC 章節的合併文字。
輸出：有序條目清單。

```python
class TocEntry(BaseModel):
    title: str
    page: int | None = None
    level: int = 0          # 0 = 頂層章；巢狀 part/section 遞增

class TocParseResult(BaseModel):
    entries: list[TocEntry]
    source_chapter_idx: int
```

LLM prompt 要點：只做「抽取 + 保序」，不做推論補齊；抽不到就回空 `entries`（前端據此顯示 fallback，不擋流程）。

### 3.3 新端點（比照 `suggest-roles`）
- 路由：`POST /api/v1/books/{book_id}/parse-toc` → `ParseTocResponse`
- opt-in（前端按鈕觸發），與 `#8f suggest-roles` 對稱
- 若該書沒有偵測到 toc 章節 → 回 404 或空結果（前端隱藏入口）

### 3.4 比對訊號放哪
**放前端**（純顯示）。前端拿到 `entries` 後，自行計算：
- 條目數 vs 左側 body 章節數 → 數量對比那一行（最高 CP 值的訊號）
- 逐條列出供人眼比對
後端**不做**自動對齊，避免脆弱邏輯。

### 3.5 後端異動清單（預估）
| 檔案 | 動作 |
|------|------|
| `backend/storysphere/services/toc_parser.py` | 新增 |
| `backend/storysphere/api/schemas/books.py` | 新增 `TocEntry` / `ParseTocResponse` |
| `backend/storysphere/api/routers/books.py` | 新增 `#8g POST /parse-toc` 端點 |
| `docs/API_CONTRACT.md` | 新增端點規格（commit 標 `[api-contract updated]`） |
| `frontend/src/api/generated.ts` | `npm run gen:types` 重生 |

### 3.6 測試（依 TESTING.md）
- `toc_parser` 純函數/service 層：正常目錄、空目錄、巢狀、無頁碼、非目錄文字 → 空結果
- `/parse-toc` 端點：happy path、無 toc 章節的邊界、關鍵欄位出現在回傳
- LLM 呼叫 mock，`AsyncMock.side_effect` 用同步函數

---

## 4. 前端設計交接 Brief（給 Claude Design）

### 4.1 落地脈絡
- 頁面：`ChapterReviewPage.tsx`，現為左右兩欄：
  - **左 = 章節骨架 sidebar**（`cr-spine`，展開 206px / 收合 40px），每個偵測章節一塊，body 章給流水號 `Chapter N`，非 body 章顯示 role，帶標題與段落數，可點擊跳轉。
  - **右 = 閱讀欄**，逐章逐段呈現、可編輯 role/標題/切分。
- 工具列已有一顆 AI-assist 按鈕「邊界輔助辨識」（`#22c`）。新功能的觸發 UX 應與它視覺一致、可預期。

### 4.2 要設計的東西
1. **觸發入口** — 一個 opt-in 觸發（呼叫 AI 解析目錄），行為對齊現有「邊界輔助辨識」。僅在偵測到 toc 章節時出現。
2. **對照面板** — 解析出的目錄清單顯示在哪、長怎樣。內容需含：
   - **數量對比摘要行**：「目錄列出 N 章 · 偵測到 M 個 body 章節」，並用視覺區分**吻合 / 不吻合**兩態（不吻合是最重要的提示）。
   - **有序條目清單**：標題、（可選）頁碼、巢狀層級縮排。
   - **唯讀**，不提供自動對齊/一鍵修正。

### 4.3 需設計的狀態
- 尚未執行（idle，只有入口）
- 執行中（AI loading）
- 成功且有條目
- 解析為空 / 失敗（friendly fallback，不擋審閱流程）
- 沒有 toc 章節（入口隱藏或 disabled）

### 4.4 設計約束（硬性）
- 只用 design token `var(--*)`，禁止硬編色碼（見 `docs/DESIGN_TOKENS.md`）。
- 明暗兩主題都要處理（theme-aware）。
- 必須融入既有兩欄佈局，**不得干擾核心審閱流程**（右欄閱讀/編輯仍是主角）。
- 面板可摺疊；預設不搶版面。

### 4.5 留給設計者決定的問題 — **已由定稿解答（見 §7）**
- 對照清單放哪 → **右側滑出 drawer（326px）**，左側 spine ＝偵測結構，兩份各自獨立、中間不連線。
- 如何並排但不暗示自動配對 → 兩份清單分處 drawer 與 spine，明確不連線，人眼比對。
- 不吻合警示多顯眼 → **整條摘要行換底色 + icon + 差額徽章**（吻合綠、不吻合警示色）。

### 4.6 交回實作時的前端異動（預估）
| 檔案 | 動作 |
|------|------|
| `frontend/src/api/ingest.ts` | 新增 `parseToc(bookId)` |
| `frontend/src/api/types.ts` 或直接用 `generated.ts` | 取用 `ParseTocResponse` 型別 |
| `ChapterReviewPage.tsx` + 新子元件 | 依設計稿實作面板與觸發 |
| `docs/UI_SPEC.md` | 新增元件規格 |

---

## 5. 紅線（實作時務必守住）

- ❌ 不做「目錄條目 → 偵測章節」自動對齊 / 一鍵修正切分 — 那是另一量級的脆弱功能，本任務範圍外。
- ❌ 不改動 `detect_chapters` 的偵測邏輯。
- ✅ 只做：AI 解析目錄 → 結構化條目 → 前端唯讀並排 + 數量對比。

## 6. 回滾方式
純新增（新 service / 新端點 / 新前端元件與 API），不改既有行為路徑。回滾即移除新增檔案與端點註冊、還原 `books.py` router、重生型別即可。

---

## 7. 定稿設計（來自 Claude Design canvas「章節審核 定稿.dc.html」）

> 前端一律照此定稿；所有色彩皆為既有 `var(--*)` token，四主題通用。

### 7.1 觸發入口（狀態 A）
- 位置：閱讀欄中，**角色為 `toc` 的章節** divider 下方，出現一個置中提示框：
  邊框 `var(--accent)`、底 `var(--bg-secondary)`、說明文「這是偵測到的**目錄頁**。可用 AI 解析出書本聲明的章節清單，與偵測結構對照。」＋按鈕「✦ 解析目錄並對照」。
- **僅在有 `toc` 章節時出現**；沒有則完全隱藏。點擊才呼叫 AI（opt-in，與「邊界輔助辨識」對稱）。

### 7.2 對照面板 — 右側 drawer（`width:326px`）
- `position:absolute; top/right/bottom:0; background:var(--bg-secondary); border-left:1px solid var(--border); box-shadow:var(--shadow-lg); z-index:5; overflow:auto`。兩欄閱讀／編輯區不動。
- Header：標題「書本目錄」＋徽章「AI 解析 · 唯讀」＋重新解析鈕（↻）＋關閉鈕（✕）。

### 7.3 五態
| 態 | 呈現 |
|----|------|
| A 尚未執行 | 只有 §7.1 入口按鈕 |
| B 執行中 | drawer 內 spinner ＋「AI 正在讀整段目錄文字，抽出有序章節…」 |
| C 成功·不吻合 | 摘要行走 `--color-warning-bg`／`--color-warning`，差額徽章「漏切 N 章」／「多切 N 章」，如「目錄 4 · 偵測 3」 |
| D 成功·吻合 | 摘要行走 `--color-success-bg`／`--color-success`「數量吻合 · 目錄 4 = 偵測 4」 |
| E 為空／失敗 | 「這段文字解析不出章節清單，可能不是標準目錄格式。這不影響你繼續審核。」＋「重新解析」 |

### 7.4 面板內容
- **數量對比摘要行**：icon ＋「數量對比」＋差額徽章（`showDelta` 時）；整條依吻合與否換底色。比對 = 目錄「正文章節」條目數 vs 偵測 body 章節數（前端計算）。
- **有序條目清單**：每列 `label`（序號/章次，min-width 44px）＋`title`（serif、ellipsis）＋（非正文條目）「非正文」徽章 ＋（有頁碼）`p.{page}`（mono）。以 `level` 縮排。

### 7.5 資料形狀（後端回傳，前端只讀）
```ts
TocEntry  = { title: string; page: number | null; level: number; isBody: boolean }
ParseTocResponse = { entries: TocEntry[] }
```
- `isBody=false` 的條目（如「跋」）顯示「非正文」徽章，且**不計入數量對比**。
- 差額 = 目錄 body 條目數 − 偵測 body 章節數；>0=漏切、<0=多切、0=吻合。

### 7.6 後端端點決策
- `POST /api/v1/books/{book_id}/parse-toc`（無 request body），**後端載入已存文件、取 `role==toc` 章節文字**送 LLM 解析 → 回 `ParseTocResponse`。與 `POST /suggest-roles` 完全對稱。
- 無 `toc` 章節或解析不出 → 回空 `entries`（前端顯示狀態 E）。無 LLM provider → 503（前端顯示失敗）。
