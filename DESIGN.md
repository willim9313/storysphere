---
name: StorySphere
description: 小說分析工作台——暖紙上的墨線（Ink on Paper）
colors:
  # 權威順序：frontend/src/styles/tokens.css > docs/DESIGN_TOKENS.md > 本檔。
  # 鍵名 = tokens.css 的 token 名（去掉 --）；-ink 後綴 = [data-theme="ink"] 的值。
  # 值與 tokens.css 不一致時 tests/docs/test_docs_drift.py::TestDesignMdSync 會失敗。
  bg-primary: "#f8f3e7"
  bg-secondary: "#f1e8d5"
  bg-tertiary: "#e9ddc6"
  paper-warmth-0: "#fdfaf1"
  fg-primary: "#2a2620"
  fg-secondary: "#5f5648"
  fg-muted: "#938876"
  border: "#ddceb2"
  accent: "#a0522f"
  accent-fg: "#f8f3e7"
  panel-bg: "#efe6d3"
  panel-bg-card: "#e7dcc6"
  panel-border: "#d3c3a4"
  color-success: "#587437"
  color-success-bg: "#eef1df"
  color-warning: "#906115"
  color-warning-bg: "#f6edd6"
  color-error: "#a8482c"
  color-error-bg: "#f4e4da"
  color-info: "#5c6683"
  color-info-bg: "#e8e7ee"
  bg-primary-ink: "#ffffff"
  bg-secondary-ink: "#f6f6f4"
  bg-tertiary-ink: "#ececea"
  fg-primary-ink: "#151515"
  fg-secondary-ink: "#3f3f3f"
  fg-muted-ink: "#8c8c8c"
  border-ink: "#1a1a1a"
  accent-ink: "#111111"
  accent-fg-ink: "#ffffff"
  panel-bg-ink: "#f6f6f4"
  panel-bg-card-ink: "#ededeb"
  panel-border-ink: "#1a1a1a"
  color-success-ink: "#151515"
  color-success-bg-ink: "#ececea"
  color-warning-ink: "#151515"
  color-warning-bg-ink: "#ececea"
  color-error-ink: "#151515"
  color-error-bg-ink: "#ececea"
  color-info-ink: "#151515"
  color-info-bg-ink: "#ececea"
typography:
  display:
    fontFamily: "'Spectral', 'Noto Serif TC', Georgia, serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.3
  headline:
    fontFamily: "'Spectral', 'Noto Serif TC', Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "'Spectral', 'Noto Serif TC', Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.3
  reading:
    fontFamily: "'Spectral', 'Noto Serif TC', Georgia, serif"
    lineHeight: 1.6
  body:
    fontFamily: "'DM Sans', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'DM Sans', 'Noto Sans TC', system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.06em"
  mono:
    fontFamily: "'Fira Code', 'Noto Sans TC', 'Courier New', monospace"
    fontSize: "0.6875rem"
  hand:
    fontFamily: "'Caveat', 'Noto Serif TC', cursive"
    fontSize: "1.25rem"
rounded:
  radius-sm: "0.25rem"
  radius-md: "0.5rem"
  radius-lg: "0.75rem"
  radius-xl: "1rem"
  pill-radius: "20px"
  badge-radius: "20px"
spacing:
  space-1: "0.125rem"
  space-2: "0.25rem"
  space-3: "0.375rem"
  space-4: "0.5rem"
  space-5: "0.75rem"
  space-6: "1rem"
  space-7: "1.5rem"
  space-8: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-fg}"
    rounded: "{rounded.radius-md}"
    padding: "0.5rem 1rem"
  button-secondary:
    backgroundColor: "{colors.bg-primary}"
    textColor: "{colors.fg-primary}"
    rounded: "{rounded.radius-md}"
    padding: "0.5rem 1rem"
  button-secondary-hover:
    backgroundColor: "{colors.bg-secondary}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.fg-secondary}"
    rounded: "{rounded.radius-md}"
    padding: "0.5rem 1rem"
  button-ghost-hover:
    textColor: "{colors.accent}"
  card-book:
    backgroundColor: "{colors.bg-primary}"
    rounded: "{rounded.radius-lg}"
    padding: "{spacing.space-6}"
  card-book-hover:
    backgroundColor: "{colors.bg-secondary}"
  input:
    backgroundColor: "{colors.bg-primary}"
    textColor: "{colors.fg-primary}"
    rounded: "{rounded.radius-md}"
  badge-success:
    backgroundColor: "{colors.color-success-bg}"
    textColor: "{colors.color-success}"
    rounded: "{rounded.badge-radius}"
    padding: "0.125rem 0.5rem"
  rail-item:
    backgroundColor: "transparent"
    textColor: "{colors.fg-secondary}"
    rounded: "{rounded.radius-md}"
    size: "36px"
  rail-item-active:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.accent}"
  guidance:
    backgroundColor: "{colors.color-info-bg}"
    textColor: "{colors.fg-secondary}"
    rounded: "{rounded.radius-sm}"
    padding: "{spacing.space-5}"
---

# Design System: StorySphere

> **本檔是衍生摘要。** 數值權威是 `frontend/src/styles/tokens.css`，完整對照表（含 entity／tone／cat／symbol／frye／narrative 等資料家族）是 `docs/DESIGN_TOKENS.md`，頁面規格是 `docs/UI_SPEC.md`。三者衝突時以前者為準；本檔只負責「怎麼用、為什麼」。

## Overview

**Creative North Star: "Ink on Paper"**

StorySphere 是一張攤在書桌上的暖象牙紙，分析結果是用細墨線畫上去的。紙面是沉靜的底，墨是內容，焦赭（burnt sienna）是唯一會出聲的顏色。一切裝飾都要能被說成「書房裡本來就有的東西」：紙張的層次、墨線的粗細、眉批式的手寫註記。

這是 Operate 型的工作台：密度高、工具多、九個書籍功能並列。所以表達的力道不在大面積色彩或動態，而在精準的細節——serif 與 sans 的分工、hairline 邊框、只有在需要時才出現的墨色強調。兩個主題共用同一份版面與字體：**Warm** 是暖紙上的墨線，**Ink** 是白紙上的純黑鋼筆稿；主題只置換 palette 與 component shape 兩層。

資料視覺化（實體、語氣、派系、象徵、張力）使用一條低彩度的 warm hue arc——每個色塊讀起來都像「染過色的紙」，而不是螢光標籤。

**Key Characteristics:**
- 暖紙三層表面＋暖墨三階文字，唯一 accent 是焦赭
- serif 承載內容本身，sans 承載關於內容的 chrome
- hairline（1px）邊框與微陰影；Ink 主題完全平面、直角、較重單線
- 分類色跨主題不變；Ink 下狀態語意改由字形與標籤承載
- 動態克制：只過渡顏色與透明度，按下不縮放、hover 不長陰影

## Colors

暖紙與暖墨構成整個中性層，焦赭是唯一的品牌聲音，功能色沉在紙面上而不浮起來。

### Primary
- **Burnt Sienna 焦赭**（`accent`）：主按鈕填色、連結、作用中的側欄項目字色、底線分頁的 2px 指示線、進度條、焦點環。Ink 主題下換成近黑墨（`accent-ink`）。

### Neutral
- **Ivory Paper 象牙紙**（`bg-primary`）：主內容與閱讀區的底；卡片與輸入框也坐在這層。
- **Folded Paper 摺紙**（`bg-secondary`）：側欄、統計卡、segmented 底軌、hover 底。
- **Aged Paper 舊紙**（`bg-tertiary`）：側欄書籍群底、作用中項目底、進度條軌、選取反白。
- **Fresh Sheet 新紙**（`paper-warmth-0`）：閱讀頁紙張色溫最淺一檔；也是深色類別色塊上的紙色字。
- **Warm Ink 暖墨**（`fg-primary`）／**Faded Ink 褪墨**（`fg-secondary`）／**Pencil 鉛筆灰**（`fg-muted`）：文字三階；muted 只給註記、計數、placeholder。
- **Deckle Edge 毛邊**（`border`）：所有 hairline 邊框與分隔線。Ink 下變成近黑實線。
- **Panel 工具板**（`panel-bg`／`panel-bg-card`／`panel-border`）：圖譜側板、設定卡等工具面板。

### Status
- **Olive 橄欖**（成功）、**Ochre 赭黃**（警告）、**Brick 磚紅**（錯誤）、**Slate Blue 灰藍**（資訊）：各自配一個同色相的淡底（`*-bg`）。Ink 下四者全部收成墨色＋淺灰底。

### Data families（值見 DESIGN_TOKENS.md，本檔不抄）
- **Entity arc**（§3.7）：7 類實體 clay → ochre → olive，加 rose 與 mauve；bg／border／fg／dot 四件一組。
- **Graph node**（§3.11）：entity arc 轉成 sRGB hex，因為 Cytoscape 不解析 oklch。
- **Tone**（§3.7.1）、**Categorical**（§3.7.2）、**Symbol／Polarity／Density**（§3.8）、**Tension**（§3.12）、**Frye／Booker**（§3.13–3.14）、**Narrative mode**（§3.17）。

### Named Rules
**The No New Hue Rule.** 需要新分類色時，取既有 entity／symbol／status token 或 warm arc 上未使用的一步；不發明新色相。

**The Shared Taxonomy Rule.** Entity、symbol、graph、tone、categorical 這些分類色在 Ink 主題**不覆寫**——同一個角色在兩個主題下是同一色。

**The Glyph Not Hue Rule.** 狀態與分類不得只靠色相區分。Ink 主題下 status 全是墨色，辨識完全靠 icon 字形、形狀（實心圓／空心圈／實心方）與文字標籤；Warm 也必須照同樣的方式能讀懂。

**The Categorical Registry Rule.** `cat-*` 只用在資料標記（點、色塊、描邊），不做 pill、不進正文，新用途先在 DESIGN_TOKENS 登記再用；依排名配色、不依名稱。

## Typography

**Content Font:** Spectral（fallback Noto Serif TC、Georgia）
**Chrome Font:** DM Sans（fallback Noto Sans TC、system-ui）
**Mono Font:** Fira Code（fallback Noto Sans TC，讓 mono 裡的中文不退回系統字）
**Illustration Font:** Caveat（僅限插畫語彙）

**Character:** 一款帶書卷氣的文字 serif 配一款安靜的幾何 sans——書頁與書頁旁的工具列。中英文都有對應的 Noto TC 後援，中英並重。

### Hierarchy
- **Display**（serif 700，2rem，1.3）：書庫頁標題這類一頁只有一個的大標。
- **Headline**（serif 700，1.5rem，1.3）：各分析頁的頁面標題（「事件圖景」等）。
- **Title**（serif 700，1.125rem，1.3）：面板、分區、卡片的標題。
- **Reading**（serif，預設 17px／1.6）：閱讀頁正文。字級與行距由使用者在 Aa 面板調整，所以不釘在字級 scale 上。
- **Body**（sans 400，0.875rem，1.6）：chrome 內文、說明、表單。
- **Label**（sans 600，0.6875rem，0.06em 字距）：eyebrow、分區小標、計數、pill／badge。
- **Mono**（0.6875rem）：段落編號、log、key、raw 輸出。

字級只有 8 階（11／12／14／16／18／20／24／32px），一律引用 `--font-size-*`。

### Named Rules
**The Is-Or-About Rule.** 一個東西**是**內容（書名、章名、正文、頁面標題）→ serif；**關於**內容（按鈕、meta、badge、nav、統計）→ sans。

**The Caveat Quarantine Rule.** Caveat 只出現在插畫時刻：empty-state 手寫標語、doodle 標註、splash 花飾。不進 chrome、不進正文。

**The Measure Rule.** 說明文字段落限寬 40–72ch；閱讀正文欄寬上限 760px。

## Layout

全站是固定左側欄＋主內容區。側欄三態：收合 48px（預設，icon-only＋tooltip）、浮層 180px（蓋在內容上不推擠）、釘選 180px（推擠內容）。進入書籍後，主內容頂端是 28px 的書名列（`← 書庫 | 書名 › 目前功能`），**不放導航**；九個書籍功能只在側欄書籍群切換。

間距是 8 階：2／4／6／8／12／16／24／32px（`--space-1` … `--space-8`）。舊的 t-shirt 間距（`--space-xs` … `--space-2xl`）是 legacy，名稱與新階不對應，不可直接改名替換。命中區、徽章等元件固有尺寸（36px rail item、15px 徽章）不進 8 階。

密度依頁面性質分兩種：**工作台頁**（知識圖譜、時間軸）讓畫布是主體、不設 max-width，工具列放不下時換行不裁切；**閱讀與說明頁**（閱讀、方法論）限寬並保留呼吸。**桌面優先，最小支援寬度 720px**（13 吋筆電半螢幕），不做手機版型；窄視窗（≤768px）時多欄頁面自動收合次要欄位，且不得讓主要內容欄被擠到不可讀。

## Elevation & Depth

深度主要靠**紙張層次**（primary → secondary → tertiary）與 hairline 邊框，不靠陰影。陰影只有一組柔和的暖調三階，用於卡片靜止態與浮在內容上的層。Ink 主題完全平面：卡片、按鈕都沒有陰影，改用 1.5px 的墨線外框。

### Shadow Vocabulary
- **sm**（`--shadow-sm`）：卡片靜止態的極淡托起（`--card-shadow`，僅 Warm）。
- **md**（`--shadow-md`）：浮動選單、popover。
- **lg**（`--shadow-lg`）：側欄浮層態、chat 視窗等覆蓋在內容上的層。

對話框遮罩只有一種：40% 暖墨（`--scrim`），**不模糊**。

### Named Rules
**The Paper Stack Rule.** 要表達「在上面一層」，先換紙張階，再考慮陰影。

**The Still Hover Rule.** hover 不長陰影、按下不縮放不位移；狀態變化只過渡 color、background-color、opacity、box-shadow，一律 ease（150ms／250ms）。

## Shapes

形是主題的第二層。元件 CSS 只消費 shape token（`--card-radius`、`--btn-radius`、`--pill-radius`、`--control-radius`、`--*-border-width`、`--card-shadow`），不直接寫原始圓角或陰影。

- **Warm＝軟紙面**：卡片 12px、按鈕與控制項 8px、pill 與 badge 全圓 lozenge（20px）、pill 0.5px 細框。
- **Ink＝鋼筆稿**：卡片、按鈕、控制項一律 4px 直角；pill 變成矩形 tag；外框加粗到 1.5px。

插畫（empty state、splash、section mark）是細墨線、**不填色**、略鬆，線重 1.5px／1px，從 Lucide line path 放大構成；motif 是閱讀與分析的傢俱（書、筆尖、樹、屋、舟、流程節點、標點）。

### Named Rules
**The Same Markup Rule.** Warm 與 Ink 是同一份 markup；兩主題需要進一步分化時，在 shape token 層加 token，不寫主題專屬元件。

## Components

### Buttons
- **Shape:** 微圓角（`--btn-radius`：Warm 8px／Ink 4px），1px 框（Ink 1.5px）。
- **Primary:** 焦赭底、紙色字，sans 500；md 為 8×16px 內距、12px 字，sm 為 4×12px、11px 字。hover 透明度 0.9、active 0.95。
- **Secondary:** 紙底、墨字、毛邊框；hover 降一階紙、active 再降一階。
- **Ghost:** 透明底、褪墨字；hover 字轉焦赭。
- **Danger:** 描邊式磚紅；Ink 下改墨色描邊。
- **Disabled:** 所有變體一致：透明度 0.5、`not-allowed` 游標，hover／active 不反應（kit 統一，頁面不另補）。
- **LLM 成本標記:** 任何會呼叫 LLM、消耗 token 的控制項前面帶一顆 sparkles 字符（`.ss-btn-llm`，以 mask＋currentColor 繪製）。停用時仍在；零成本動作不加。

### Chips（Entity pills）
- **Style:** 帶 5px 色點的小 lozenge，sans 11px，bg／border／fg 取 entity arc 對應類型。
- **用途分工:** pill 用於清單與 chips；閱讀正文的行內實體改用 `.entity-mark`——平時只有一條該類型色的細底線，hover 才浮出淡色塊，文字維持正文色。

### Badges
- 狀態 badge：同色相淡底＋功能色字，sans 11px 500，全圓（Ink 4px＋墨線外框、淺灰底）。

### Cards / Containers
- **Corner Style:** `--card-radius`（Warm 12px／Ink 4px）。
- **Background:** 紙（`bg-primary`）；hover 降到 `bg-secondary`。
- **Shadow Strategy:** Warm 微陰影（sm）；Ink 無。
- **Border:** hairline 毛邊框。
- **Internal Padding:** 16px（書卡）；統計卡 8×16px、底色 `bg-secondary`。

### Inputs / Fields
- **Style:** 紙底、毛邊框、`--input-radius`（＝控制項圓角）；Ink 框 1.5px。
- **Focus:** 全站單一焦點環——2px 焦赭實線外框、2px offset，只在 `:focus-visible` 出現。它與選取狀態的半透明光暈是兩件事。
- **原生控制項:** checkbox、radio、range 的 `accent-color` 跟主題 accent。

### Navigation
- **側欄 rail item:** 36px 命中區、8px 圓角、褪墨 icon；hover 底降到 `bg-tertiary`；作用中＝`bg-tertiary` 底＋焦赭 icon。書籍群底色是 `bg-tertiary`，所以群內 hover／active 反過來用 `bg-secondary`。
- **Segmented:** 同一份資料換檢視。`bg-secondary` 底軌＋毛邊框，選中格浮到紙色、墨字 600。
- **底線分頁:** 切換不同內容。12px sans，idle 鉛筆灰 500 → hover 褪墨 → active 墨色 600＋2px 焦赭底線。

### Researcher Guidance（研究者導覽條）
頁面層級的定向說明。灰藍淡底、hairline 框、4px 圓角，前置 14px info 字符（`::before` 以 mask 繪製）；開頭一律是粗體「研究者導覽：」，11px／1.7 行高。可依頁面關閉，關閉後從書名列右端的 ghost 鈕重開。工作台頁可改成滿版（只留底線）。**永遠不用左側色條。**

### State（空態／錯誤／載入）
置中的 icon＋serif 標題＋說明＋動作。空態 icon 用柔墨線插畫，可配一行 Caveat 手寫標語；錯誤態 icon 用錯誤色，可展開技術細節（mono）。

## Do's and Don'ts

### Do:
- **Do** 一律用 `var(--*)` 取色、字級、間距、圓角；新增或修改 token 時同步 `docs/DESIGN_TOKENS.md`。
- **Do** 元件的圓角、框線、陰影走 shape token（`--card-radius`、`--btn-radius`、`--pill-radius`…），讓 Ink 能改「形」。
- **Do** 新程式碼用 `--space-1` … `--space-8`；看到 legacy 間距時對照實際 px 再換，不要照名字換。
- **Do** 讓每個狀態與分類都有非色相的線索（字形、形狀、文字），並在 Ink 主題下檢查一次。
- **Do** 會花 token 的按鈕都帶 sparkles 字符，一頁只用一種字形。
- **Do** 主題切換只經過 ThemeContext。

### Don't:
- **Don't** 在元件裡寫死色碼；唯一例外是 Cytoscape 需要的 `--graph-*` hex 家族，它也只存在於 tokens.css。
- **Don't** 用 `text-[Npx]` 之類的任意字級；字級只有 8 階。
- **Don't** 把 Caveat 用在按鈕、nav、meta 或正文。
- **Don't** 給導覽條或任何提示框加左側色條。
- **Don't** 在 hover 時長陰影、在按下時縮放或位移，也不要過渡寬度與版面屬性。
- **Don't** 給對話框遮罩加模糊。
- **Don't** 在 Ink 主題覆寫 entity／symbol／graph／tone／categorical 分類色。
- **Don't** 在元件內直接讀寫 localStorage 的主題值或操作 `data-theme`。
