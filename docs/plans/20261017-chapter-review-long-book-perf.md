# 章節審閱頁長書效能 —— 實作計畫

日期：2026-10-17　分支：`fix/ds-v3-185-chapter-review-perf`（base `feat/ds-v3`）

## 背景

章節審閱頁 impeccable 評估（技術稽核 P1）以合成資料（300 章、8100 段，dev build）量得：

| 指標 | 數值 |
|------|------|
| 首次載入 | 約 5.3s，約 8.8 萬 DOM 節點、4.2 萬 `<option>` |
| 章標題每打一字 | 約 1,450ms |
| 點脊跳章 | 約 1,430ms |
| 總覽態 | 300 章只顯示 225 章，尾端 75 章看不到也點不到 |

根因：所有狀態在 `ChapterReviewPage` 單一元件，任何編輯都整頁重渲染 8100 段（每段一個 `Tooltip`＋5 選項 `select`）；
`reindex` 每次為所有章產生新物件，memo 也擋不住。

## 決定（使用者裁決）

### 方案一（本次實作）

1. 正文流的章抽成 `ChapterSection`、段抽成 `ParagraphRow`，皆 `React.memo`。編輯 callback 已是穩定 `useCallback`，
   以 `ci`／`pi` 參數傳入；選中、閃爍以布林傳入。
2. `reindex` 對索引未變的章沿用原物件 → 改章名／章角色只重渲染該章；改段角色只重渲染該列。
3. `.cr-chapter` 加 `content-visibility: auto`（`contain-intrinsic-size` 依段數估高），視窗外章節跳過排版與繪製。
4. 「＋」在此分章的 Tooltip 改為整頁共用一個（每段不再各掛一個 Tooltip 實例）。

完成後以同一支合成資料腳本量化（首載、打字、跳章、DOM 節點數）。

### 方案二（暫不做，量完再議）

方案一後首載仍 >1.5s 時才提：章層級延遲掛載（視窗外章只放依段數估高的佔位）。代價：瀏覽器頁內搜尋找不到未掛載章節。

**不採用逐列虛擬化**：會破壞跨段文字選取、跳章錨點、#183 的焦點與 Tab 序，且要引入新套件。

### 總覽態上限

放得下時行為不變；章數多到 `max(2px)＋1px 章距` 超出可視高度時，總覽容器改為可捲動，不再靜默丟章。
違反 UI_SPEC「不捲動」的字面規格，記入 DS_V3_DESIGN_FEEDBACK。

## 範圍

- `frontend/src/pages/upload/ChapterReviewPage.tsx`
- `frontend/src/styles/chapter-review.css`
- `docs/UI_SPEC.md`、`docs/DS_V3_DESIGN_FEEDBACK.md`

不新增依賴、不新增 token、不改 API。

## 不在範圍

- Tab 停點隨段數線性增加（方案二或逐列虛擬化才會改變）。
- 段落 `select` 懶掛載（方案一量完若仍是首載瓶頸再評估）。
