# Design System v2 落地回饋 — 資訊缺口清單（給 design system 端補完）

**日期：** 2026-07-10
**來源：** design system v2（Ink on Paper）在 StorySphere repo 的實作過程（`docs/plans/20260710-design-system-v2-ink-on-paper.md`）
**目的：** 以下項目是 `colors_and_type.css` / README / kit 未覆蓋、實作時由工程端**自行推導或臨時決策**的部分。請 design system 端逐項確認：**認可現值就寫進 contract；不認可就給定案值**，我們再拉回來對齊。

推導時一律遵守 README 的「不發明新色相」規則（只取 entity/symbol/status 既有色相或 warm arc 未用步），但**步階選擇與明度配置是工程判斷，未經設計確認**。

---

## A. 完全未定義的 domain token 家族（優先級最高）

contract 只定義了核心 palette + entity/symbol/status/DAG。以下家族產品實際在用，v1 四主題各有定義，v2 全部由工程端推導。每項需要 Warm + Ink 兩組值。

### A1. 符號詮釋極性 `--polarity-{positive,negative,neutral,mixed}-{bg,fg,edge,dot}`
- **用途**：符號意象頁，LLM 詮釋極性 4 值標籤
- **臨時決策**：Warm 從 status 色系派生（positive=橄欖、negative=磚紅、neutral=紙面、mixed=赭黃）；Ink 用 fill polarity（negative=黑底白字、positive=白底黑框、neutral=淡灰、mixed=中灰）
- **現值**：見 repo `docs/DESIGN_TOKENS.md` §3.8

### A2. 符號章節密度 `--symbol-density-{low,mid,high,peak}`
- **用途**：ChapterDistChart 長條 + DensityStrip 縮影，3 階 + 峰值
- **臨時決策**：Warm 用焦赭單色 ramp（`#e9ddc6 → #cf9a72 → #b05a34 → #7d3e22`）；Ink 灰階 ramp
- **需確認**：mid 步 `#cf9a72` 是工程內插值，不在任何設計色票上

### A3. 張力強度 `--tension-intensity-{low,mid,high}-{bg,fg,edge}`
- **用途**：張力分析頁軌跡列填色 + 圖例（離散三階）
- **臨時決策**：同 A2 的焦赭 ramp 邏輯；mid 的 fg `#52301c`、edge `#a96a44` 為工程內插
- **需確認**：high 用 accent 純色（`#b05a34`）作大面積填色，設計端是否接受 accent 作 fill（README 對 accent 的定位是 action/link/active）

### A4. 敘事模式 `--narrative-{present,flashback,flashforward,parallel,unknown}-{border,bg}`
- **用途**：時間軸卡片邊框/底色，5 種敘事模式
- **臨時決策**：present=accent、flashback=info 灰藍、flashforward=warning 赭黃、parallel=concept 藕紫、unknown=muted；present 的 bg `#f3e3d8`（accent 淡化）是工程內插
- **需確認**：Ink 側用五階灰（`#151515 / #6b6b6b / #3f3f3f / #8c8c8c / #cfcfcf`）+ 深淺底，模式間灰階排序是工程排的，語意上 flashforward 比 flashback 深是否符合設計意圖

### A5. 時間軸結構色 `--timeline-{chapter-bg,parallel-bg,parallel-border,causal-stroke,selected-ring}`
- **臨時決策**：causal=accent；parallel 用 concept 藕紫的 rgba（`rgba(158,97,129,…)`）；selected-ring 沿用 README 提到的 `rgba(176,90,52,0.3)`
- **需確認**：半透明 rgba 的具體 alpha 值（0.06 / 0.15 / 0.3）全部沿用 v1 慣例

### A6. Frye Mythos `--frye-{romance,comedy,tragedy,irony}-{bg,fg,border}`
- **臨時決策**：romance=赭黃、comedy=橄欖、tragedy=磚紅、irony=灰藍（status 四色相重映射）；Ink 用灰階 fill polarity（tragedy=黑底白字）
- **需確認**：四個 mythos 對應到哪個色相是工程配的，設計端可能有更好的語意映射（例如 romance 是否該用 rose/mauve 步）

### A7. Booker Plot `--booker-{bg,fg,border,accent}`
- **臨時決策**：沿用 v1「七情節共用單一 muted 框」概念，色值換成紙面色 + 焦赭 accent

### A8. 知識圖譜節點 `--graph-{char,loc,con,evt,org,obj,other}-{fill,stroke,label}`
- **關鍵限制**：**cytoscape 的 color parser 不支援 `oklch()`**，此家族必須是 sRGB hex。目前值是工程端把 entity arc 的 oklch 數學轉換成 hex（fill=bg、stroke=dot、label=fg）
- **需要 design 端做的**：在 contract 內為 entity arc 提供**官方 hex 對照表**（或標注「canvas 類 consumer 需 hex」的規範），避免每次都靠工程轉換；轉換值見 repo `docs/DESIGN_TOKENS.md` §3.11

---

## B. Contract 有暗示但沒給值的項目

### B1. `--accent-fg`（accent 底上的文字色）
- kit 的 `.ss-btn-primary` 寫 `color: var(--bg-primary)`，但 contract 沒有這個 token
- **臨時決策**：Warm `#f8f3e7`、Ink `#ffffff`
- **需確認**：Warm 下 `#f8f3e7` on `#b05a34` 對比約 4.0:1，14px 以下白字場景是否要改純白

### B2. Focus / selection ring
- README 說 shadow 禁令「except a focus state」，但沒有 focus ring 的 token 或規格（顏色、寬度、offset）
- **現況**：repo 各處自行處理（selected ring 用 `rgba(176,90,52,0.3)`）
- **需要**：一個 `--focus-ring` 規格（鍵盤導覽的 a11y 需求）

### B3. 內文行內實體標註（entity-mark）
- 閱讀頁的行內標註：預設 1.5px 底線（dot 色）、hover 浮出該類型淡色塊。kit 只有 `.ss-pill`（chip 型），沒有這個「不搶字流」的行內 pattern
- **臨時決策**：沿用 v1 行為，換新 dot/bg 色
- **需要**：design 端把這個 pattern 收進 kit（或給替代規格）

### B4. Splash 背景圖的透明度/濾鏡處理
- README 說 splash 是「line-art illustration gently behind the wordmark」，沒給「gently」的數值
- **臨時決策**：Warm `opacity 0.22 + sepia(0.15) contrast(0.95)`；Ink `opacity 0.10 + grayscale(1) contrast(1.2)`（沿用 v1 值）

### B5. 字級 `--font-size-2xs`（11px）
- repo 大量使用 11px 階（meta、badge），design 的 type scale 從 `xs` 0.75rem 起跳
- **需確認**：type scale 是否正式收錄 2xs，或 repo 應把 11px 全部 snap 到 12px

---

## C. 資產與素材缺口

### C1. Splash canonical 插畫
- README 指定 `assets/illustrations/reading-hero.png` 為 canonical hero，但 repo 目前用的是自有的 `library-of-books.png`（同為墨線風格）
- **需要**：確認 library-of-books 是否可作為正式 splash；若要換 reading-hero，請提供可交付的資產檔（考慮檔案大小與授權）

### C2. `--font-hand`（Caveat）目前零使用
- 字體已載入、token 已定義，但 repo 沒有任何 empty state / doodle 標註用到它
- **需要**：至少一個 empty-state 的 hand 標註範例規格（哪些頁、什麼文案、多大字級），否則載入 Caveat 是純成本

### C3. 圖例（LegendCard）與 kit 的 graph 範例只有 4 類
- kit 的 graph demo 只涵蓋 character/location/concept/event；實際資料還有 **organization / object**（本次驗證時就因此抓到黑節點 bug）
- **需要**：kit 的 graph 元件與 legend 規格補上 7 類完整版（或明定「graph 只顯示 4 類、其餘歸 other」的產品規則）

---

## D. 規範性 open questions（不擋實作，但要定案）

1. **命名對齊**：contract 用全名（`--entity-character-*`），repo 用縮寫（`--entity-char-*`）。目前靠 DESIGN_TOKENS.md 對照表橋接。長期要不要統一？（統一成全名需改 repo 15 檔）
2. **Dark mode 定位**：v1 文件留了「dark mode 為獨立維度」的伏筆；v2 兩主題皆亮色。dark 是未來第三主題、還是 Warm/Ink 各出 dark 變體？影響 token 架構（`data-theme` 單軸 vs 雙軸）
3. **Shape token 擴充節奏**：README 說「需要分化時再加」（`--tab-radius`、`--input-border-width`…）。建議 design 端預先定義 input/tab/dropdown 三組，這是 repo 下一批會碰到的元件

---

## 對齊方式

上述「現值」全部已實作並可在 repo 執行看到（branch `feat/book-upload-revamp`，切換 Settings → 外觀與主題即可比對）。design 端補完後：
1. 更新 Claude Design 專案的 `colors_and_type.css` / README / kit
2. 工程端 diff contract，逐項把定案值拉回 `frontend/src/styles/tokens.css` 與 `docs/DESIGN_TOKENS.md`
