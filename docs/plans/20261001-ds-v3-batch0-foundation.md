# DS v3 第 0 批：基礎外框 + 共通控制項 + tokens —— 實作計畫

> 規劃日期：2026-10-01 · 傘票 B-126 · 整合分支 `feat/ds-v3`（基於 origin/main `c2fbf6c`）
>
> **這是規劃當下的快照，實作後即凍結。** 與現況衝突時以程式碼、`API_CONTRACT.md`、`UI_SPEC.md` 為準。

## 來源

Handoff `redesign_v3_handoff_batch_0.zip`（只留本機，不進 repo）。權威順序：
**決議紀錄 `.dc.html` > 提案 `.dc.html`**；18 稿與 `ds-cards/preview/` 規格卡衝突時**以規格卡為準**。
`PROJECT_RULES.md`（文案不承諾未實作行為、失敗分類看有無應用層 JSON body、LLM 成本字符、
既有 i18n 逐字保留）適用本批與之後所有批次。

## 現況盤點（實測）

| 項目 | 現況 | handoff 要求 | 落差 |
|---|---|---|---|
| tokens | `tokens.css` 與 `colors_and_type.css` 共有 102 個變數名，值只差 splash 兩項與 `--font-mono` | 8 階 `--space-1…8`、`--input-*`、`--ss-llm-glyph` | 8 階間距**完全沒定義**，但已有 1 處 `var(--space-4)` 在用（實際解析為空）；舊 `--space-xs…2xl` 有 69 處使用 |
| 命名 | 產品用縮寫 `--entity-char-*`／`--graph-org-*` | 契約用全名 | README §3 明言是「命名橋接」，**保留產品縮寫**，不改名 |
| kit | 產品沒有任何 `.ss-*` class | `ss-kit.css` 570 行、約 130 個 class | 整層新增 |
| Sidebar | 兩態（expanded boolean，存 localStorage） | 三態 collapsed 48／overlay 180 不推擠／pinned 180 推擠 | 需改狀態機 |
| Toast | `ToastContext` 已有 5200／9000ms；頁內 `ca-toast`／`ea-toast` 另存在 | 一份實作＋`persist` 第三檔 | 加 `persist`、刪頁內 toast |
| 浮動元件 | toast z60 蓋泡泡 z50，同錨 bottom 24 | 讓位軌 24／88／144，z 序泡泡 60 > toast 55 > FAB 30 | 新增共用常數＋佔位 context |
| 原生 `confirm()` | 2 處（Symbols） | 改 ConfirmDialog | 見下方範圍決策 |
| 原生 `title=` | 138 處 | 改 Tooltip | 見下方範圍決策 |
| Splash 圖 | `assets/splash/cover_v2.png` 1672×941 | `splash-cover.png` 1400×788 | 同一張圖的縮圖，**沿用產品原檔**，不換 |

## 已裁決

- **Splash 濃度**（2026-10-01）：採 handoff design system 那組——Warm `0.42` · `sepia(0.15) contrast(1.05)`；
  Ink `0.28` · `grayscale(1) contrast(1.3)`。比產品現況（0.62／0.70）淡，使用者以設計稿為準。
- **聊天 `prompts.recommend`**：刪除（zh-TW／en 兩邊＋`ChatWindow.tsx` 一行）。`page: 'library'` 值保留，
  它是無 provider 時的預設值。
- **`--font-mono`**：採 handoff（插入 `'Noto Sans TC'`，讓 mono 內的中文不退回系統字）。

## 範圍決策（待確認）

第 0 批的角色是**建立共用基礎＋套用在外框上**，不是全站替換。理由：逐頁替換應該跟著該頁的重寫一起做，
否則同一頁會被動兩次，且第 0 批 PR 會碰到十幾個頁面檔案。

| 項目 | 第 0 批做 | 留給該頁的批次 |
|---|---|---|
| `ss-kit.css` | 只引入外框與共通控制項用到的 class（btn 家族含 `-llm`／`-danger`、booknav、tabs、loader、progress、badge） | bookcard、graph、reader、panel、stat 等頁面 class 隨該頁引入 |
| 8 階間距 | 定義 token；外框元件改用 | 69 處舊 `--space-*` 隨各頁重寫遷移，舊 token 保留到全部遷完 |
| Tooltip | 建元件；套在側欄與外框 | 138 處 `title=` 隨各頁替換 |
| ConfirmDialog | 依規格卡改外觀、加損失清單變體 | 2 處 `confirm()` 在符號頁，隨第 4 批替換 |
| 輸入框／分頁 | token＋共用 class | `.tn-input`／`.ea-search` 等 5 個收斂隨各頁 |
| Toast 合併 | **本批做**（README §1.5 T1 明定在本批，且是全域行為） | — |

**明確不做**（README §1.8）：任務中心改覆蓋層、四套確認模式統一、kind 標籤中文化、聊天擴到非書籍路由。
研究者導覽（spec §7／第 19 稿）不在本批。

## 子任務拆分

每個子任務一個分支、一個 PR，base `feat/ds-v3`，依序進行，前一個合入後再開下一個。

| # | 分支 | 內容 | 主要檔案 |
|---|---|---|---|
| 0-1 | `feat/ds-v3-00-tokens` | tokens 合併：新增 8 階間距、`--input-*`、`--ss-llm-glyph`；splash 兩值；mono 補 CJK | `tokens.css`、`DESIGN_TOKENS.md` |
| 0-2 | `feat/ds-v3-01-kit` | 引入 kit 子集為 `styles/ss-kit.css`，逐段對照不整份覆蓋 | `ss-kit.css`（新）、`main.tsx` 或 `global.css` import |
| 0-3 | `feat/ds-v3-02-primitives` | Tooltip（新）、ConfirmDialog 改規格、LLM 字符、motion／focus 規則 | `ui/Tooltip.tsx`（新）、`ui/ConfirmDialog.tsx`、`UI_SPEC.md` |
| 0-4 | `feat/ds-v3-03-toast` | `persist` 檔、外觀四相位、刪 `ca-toast`／`ea-toast` 改 push host | `ToastContext.tsx`、`ToastHost.tsx`、角色／事件頁＋CSS（超過 3 檔，再拆 a／b） |
| 0-5 | `feat/ds-v3-04-float-rail` | 軌常數＋佔位 context、z 序反轉、toast／泡泡／FAB 讓位 | 新 context、`ToastHost.tsx`、`ChatBubble.tsx`、`ReaderPage.tsx` |
| 0-6 | `feat/ds-v3-05-rail` | 側欄三態、任務徽章、Tooltip、矮視窗溢出；麵包屑 28px | `Sidebar.tsx`、`AppLayout.tsx`、`BookNav.tsx` |
| 0-7 | `feat/ds-v3-06-taskcenter` | 任務中心三態、TaskRow 規格 | `TaskCenter.tsx`、`TaskRow.tsx`、`taskKinds.ts` |
| 0-8 | `feat/ds-v3-07-chat` | 視窗規格、ContextBadge 換 Lucide、`white`→`--accent-fg`、fallback 建議提問、刪 `recommend` | `components/chat/*`、`chat.json` ×2 |
| 0-9 | `feat/ds-v3-08-splash` | 字標靠左、暈影、載入條 | `SplashScreen.tsx`、`global.css` |

0-1、0-2 是其後所有子任務的前提；0-3 之後大致獨立，但 0-5 依賴 0-4（toast 落點）。

## API 完整性檢查（B-126 的第二個完成條件）

外框只吃一個資料源：`TaskStatus`（`generated.ts`）。逐欄對照 handoff §6：

| 設計需要 | 後端欄位 | 狀態 |
|---|---|---|
| 狀態（含 `awaiting_review`） | `status` | ✅ |
| 進度百分比／stage 字串 | `progress`、`stage` | ✅ |
| kind chip | `kind?` | ✅（缺 kind 時 fallback 已在 `taskKinds.ts`） |
| 標題 | `title?` | ✅ |
| 「剛剛完成」相對時間 | `createdAt?` | ⚠️ 只有建立時間，**沒有完成時間**。長任務的「N 分鐘前完成」會算成從建立起算 |
| toast 行動鈕去處 | `result.bookId` | ✅（缺了不渲染鈕，設計已涵蓋） |
| 部分完成 | `status` 沒有 partial；`done` 且 `result` 帶失敗步驟即為部分完成（`useTaskNotifications.ts`、`TaskRow.tsx` 已如此判定） | ✅ |
| ETA | 無 | ✅ 設計明定不做 |

「完成時間」缺口若確認影響文案，**另開票**，不在第 0 批補後端。

## 每個子任務的完成條件

- CLAUDE.md 五道閘門全綠
- 動 token → `DESIGN_TOKENS.md`；動元件 → `UI_SPEC.md`
- 新 i18n 字串單獨列出標為草稿（本批只有一條已裁決：「注意，此動作會消耗 token」）
- 視覺子任務：把決議紀錄 `.dc.html` 渲染出來（`design/` 下起 http server），與產品在**同尺寸、兩主題**下並排截圖對照；只量 computed style 不算驗證

## 回滾

每個子任務是獨立 PR 進 `feat/ds-v3`，revert 該 merge commit 即可；main 不受影響直到整批合回。
