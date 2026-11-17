# UI 對齊設計稿（T28 前插入）

## 使用者的決定（2026-11-17）

- 照建議開工。三項待決都照建議：
  1. **元件庫**：缺的 class 以設計稿 DS v3 `kit.css` 為準補進 `ss-kit.css`；已有的同名 class 保留現有定義（`ss-pill-*` 的實體 token 名兩邊不同，整份換會壞）。寫回 `05 §2`。
  2. **對話欄的長回覆**：照 `05 §3.3`「對話裡只留旁白」：有結果的那一輪只顯示前 3 行＋「→ 結果 A」，可展開全文；全文用 markdown 渲染，新依賴 `remark-gfm`（表格）。
  3. **流程規則不改 CLAUDE.md**（使用者另外整理成 skill）；只修正 `docs/design/README.md`。

背景：T21–T27 的畫面和設計稿落差大。原因是 `docs/design/README.md` 寫了未驗證的「`.dc.html` 不能用瀏覽器開」，之後沒有人渲染過設計稿；驗收只驗功能；元件庫的規格矛盾沒有提出；設定頁大腦區塊掉在 T23／T25／T27 的縫裡。

依據：07 T21–T24 完成標準（畫面和畫布的 Warm 版一致：版面、狀態、文案）；05 §3（特別是 §3.3 的線框）；`docs/design/canvas/*.dc.html`。

## 先知道的事實

- 色彩 token 兩邊一致；差異在元件與版面。
- 設計稿用到、前端 CSS 沒有的 class：`ss-tabs`／`ss-tab`（Agent、詳情、證據、方法目錄）、`ss-panel*`（證據、方法目錄）、`ss-option-card*`、`ss-theme-*`、`ss-toggle-track`（設定）、`ss-card-link`（書庫、總覽、筆記）。
- 兩邊同名但定義不同的有 28 個，多為小差異。

## 分批

每批一個 commit；該批閘門全過、附並排截圖才進下一批。超過 3 個檔案的批次開工前列檔案給使用者確認。

| 批 | 做什麼 | 檔案 |
| --- | --- | --- |
| 0 全面比對 | README 改成怎麼渲染設計稿；10 個畫面用真實資料並排截圖，列差異清單，使用者逐條決定修或不修；截圖放 `var/ui_compare/` | `docs/design/README.md` |
| 1 Kit | 補缺的 class，同名保留 | `frontend/src/styles/ss-kit.css`、`docs/spec/05`（§2） |
| 2 Agent 工作區 | 對話：泡泡、工具呼叫一行、旁白折疊、markdown；結果卡「view｜結論」兩欄、引用顯示類型／層級／摘要、「怎麼得出的」一行鏈、篩選用 `ss-tabs`；頁首精簡；沒有 session 也顯示骨架 | `AgentPage.tsx`、`ChatPane.tsx`、`ResultCard.tsx`、`package.json` |
| 3 設定 | 大腦區塊（選項卡，接 N-08e–g）；主題卡色票 | `SettingsPage.tsx`、`components/settings/`（新增 1 個） |
| 4 筆記與其他 | 筆記推導時間軸；第 0 批清單中決定要修的 | 依清單 |

## Checkpoint 四題

1. **異動檔案**：見上表；第 4 批等清單。
2. **現成可用**：設計稿 `kit.css`、`react-markdown`、`useBrainSettings`／N-08e–g、`ViewRenderer`、`evidence_list` 的摘要。
3. **新依賴**：`remark-gfm`。沒有新頁面或路由。
4. **還原**：每批一個 commit，`git revert`；不碰 `var/` 既有資料，只新增 `var/ui_compare/`。

## 規格同步

`05 §2`（元件庫）、`05 §3.3`（對話欄折疊）、`docs/design/README.md`（渲染方法）。不碰 API。

## 不做

Ink 主題（設計稿標「暫不更新」）；設計稿有、後端沒有資料的（例：結果卡的章節分布色條），在第 0 批清單標「刻意不做」。
