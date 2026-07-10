# StorySphere — Design Tokens 主題對照表（v2 · Ink on Paper）

> 本文件為所有主題 token 的唯一真實來源（source of truth）。
> Token 實作位於 `frontend/src/styles/tokens.css`。
> 設計 contract 為 Claude Design 專案（`a070c329-…`）的 `colors_and_type.css`。
> UI 頁面規格見 `docs/UI_SPEC.md`；主題切換實作見本文第 2 節。

---

## 1. 主題清單

| 主題名稱 | 描述 |
|---------|------|
| `warm`（預設） | Warm — 暖象牙紙上的墨線。文學感、書房感；焦赭 accent，entity 為低彩度 warm hue arc |
| `ink` | Ink — 純黑白鋼筆線稿。全單色，語意由字形＋標籤承載；entity/symbol 分類色**沿用 Warm arc** |

舊四主題（`default` / `manuscript` / `minimal-ink` / `pulp`）已於 2026-07-10 移除。

**主題置換的兩層** — palette（表面/墨色/accent/status）與 component shape（§3.15）；字體、spacing、版面**不**隨主題改變。

---

## 2. 切換機制

主題以 `data-theme` attribute 掛在 `<html>` 元素上。未設定（或任何非 `ink` 值）解析為 Warm 基準（`:root`）；`data-theme="ink"` 套用單色覆寫塊。

`ThemeContext` 負責：
1. **初始化**：app 啟動時從 `localStorage` 讀取 `storysphere:theme`，套用至 `<html data-theme="...">`
2. **切換**：使用者選擇主題時，更新 `<html>` attribute 並寫入 `localStorage`
3. **舊值遷移**：`default`/`manuscript` → `warm`；`minimal-ink`/`pulp` → `ink`（`index.html` 的 FOUC bootstrap script 同步此映射）

---

## 3. Token 對照表

### 3.1 背景層次

| Token | warm | ink |
|-------|------|-----|
| `--bg-primary` | `#f8f3e7` | `#ffffff` |
| `--bg-secondary` | `#f1e8d5` | `#f6f6f4` |
| `--bg-tertiary` | `#e9ddc6` | `#ececea` |

### 3.2 文字

| Token | warm | ink |
|-------|------|-----|
| `--fg-primary` | `#2a2620` | `#151515` |
| `--fg-secondary` | `#5f5648` | `#3f3f3f` |
| `--fg-muted` | `#938876` | `#8c8c8c` |

### 3.3 邊框與 Accent

| Token | warm | ink |
|-------|------|-----|
| `--border` | `#ddceb2` | `#1a1a1a` |
| `--accent` | `#b05a34`（焦赭） | `#111111` |
| `--accent-fg` | `#f8f3e7` | `#ffffff` |

### 3.4 工具面板

| Token | warm | ink |
|-------|------|-----|
| `--panel-bg` | `#efe6d3` | `#f6f6f4` |
| `--panel-bg-card` | `#e7dcc6` | `#ededeb` |
| `--panel-border` | `#d3c3a4` | `#1a1a1a` |
| `--panel-fg` | `#2a2620` | `#151515` |
| `--panel-fg-muted` | `#938876` | `#8c8c8c` |

### 3.5 字體（兩主題共用，不隨主題置換）

| Token | 值 | 用途 |
|-------|----|----|
| `--font-serif` | `'Spectral', 'Noto Serif TC', Georgia, serif` | 內容本身：書名、章名、正文、頁面標題 |
| `--font-sans` | `'DM Sans', 'Noto Sans TC', system-ui, sans-serif` | chrome：按鈕、meta、badge、nav |
| `--font-hand` | `'Caveat', 'Noto Serif TC', cursive` | **僅限插畫語彙**（doodle 標註、empty-state 說明、splash 花飾）；禁用於 chrome 與正文 |
| `--font-mono` | `'Fira Code', 'Courier New', monospace` | log、key、code |
| `--font-cjk` | `'Noto Sans TC', sans-serif` | CJK fallback |

判準：一個東西**是**內容 → serif；**關於**內容 → sans。

### 3.5.1 字級（Font Size）

主題無關；所有 font-size 一律引用 token，禁止 hardcode px。

| Token | rem | px |
|-------|-----|----|
| `--font-size-2xs`  | `0.6875rem` | 11 |
| `--font-size-xs`   | `0.75rem`   | 12 |
| `--font-size-sm`   | `0.875rem`  | 14 |
| `--font-size-base` | `1rem`      | 16 |
| `--font-size-lg`   | `1.125rem`  | 18 |
| `--font-size-xl`   | `1.25rem`   | 20 |
| `--font-size-2xl`  | `1.5rem`    | 24 |
| `--font-size-3xl`  | `2rem`      | 32 |

### 3.6 線條性格

| Token | warm | ink |
|-------|------|-----|
| `--line-weight` | `1px` | `1px` |
| `--border-width` | `var(--line-weight)` | 繼承 |
| `--border-style` | `solid` | `solid` |
| `--node-shadow` | `none` | `none` |
| `--divider-style` | `1px solid var(--border)` | `1px solid var(--border)` |

> 舊 manuscript 的 dashed 與 pulp 的 offset shadow 已移除；`--node-shadow` 恆為 `none`。
> `--line-weight` 給 Cytoscape canvas（JS `getComputedStyle` 讀取），`--border-width` 給 CSS。

### 3.7 實體 Pill 顏色（Entity arc · 跨主題共用）

7 類 = 低彩度 **warm hue arc**（clay → ochre → olive，rose & mauve），oklch 表示；每個 tint 讀起來是「染色的紙」。**Ink 主題刻意不覆寫** —— 分類語意跨主題一致。

> 命名注意：設計 contract 用全名（`--entity-character-*`），repo 沿用既有縮寫。對照：`char`=character、`loc`=location、`org`=organization、`obj`=object、`con`=concept、`evt`=event。

| 類型 | bg | border | fg | dot |
|------|----|----|----|----|
| char | `oklch(0.945 0.032 55)` | `oklch(0.83 0.055 52)` | `oklch(0.43 0.075 48)` | `oklch(0.62 0.105 50)` |
| loc | `oklch(0.945 0.030 118)` | `oklch(0.83 0.050 118)` | `oklch(0.43 0.060 120)` | `oklch(0.58 0.075 120)` |
| org | `oklch(0.950 0.038 85)` | `oklch(0.84 0.060 84)` | `oklch(0.45 0.070 80)` | `oklch(0.64 0.100 82)` |
| obj | `oklch(0.940 0.035 33)` | `oklch(0.82 0.060 33)` | `oklch(0.44 0.080 30)` | `oklch(0.59 0.110 32)` |
| con | `oklch(0.935 0.030 345)` | `oklch(0.81 0.050 345)` | `oklch(0.44 0.065 345)` | `oklch(0.57 0.090 348)` |
| evt | `oklch(0.935 0.038 22)` | `oklch(0.81 0.065 22)` | `oklch(0.45 0.090 20)` | `oklch(0.57 0.120 22)` |
| other | `oklch(0.935 0.012 75)` | `oklch(0.81 0.020 72)` | `oklch(0.46 0.020 70)` | `oklch(0.58 0.030 70)` |

**新色相禁令**：需要新分類色時，取既有 entity/symbol/status token 或 warm arc 未使用的一步，不發明新 hue。

### 3.8 象徵意象類型（Symbol Pills · 跨主題共用）

同一 warm arc 重映射（bg / fg / dot 對應 entity 表的同色相）：

| Symbol 類型 | 對應色相 |
|------|---------|
| object | = entity obj（clay 33°） |
| nature | = entity loc（olive 118°） |
| spatial | = entity org（ochre 85°） |
| body | = entity evt（brick 22°） |
| color | = entity con（mauve 345°） |
| other | = entity other（灰調 75°） |

#### 符號詮釋極性（Polarity）

warm 由 status 色系派生；ink 用 fill polarity（深淺取代色相）。

| 屬性 | warm | ink |
|------|------|-----|
| `--polarity-positive-bg/-fg/-edge/-dot` | `#eef1df` / `#4a6330` / `#b7c78e` / `#5f7d3b` | `#ffffff` / `#151515` / `#151515` / `#151515` |
| `--polarity-negative-bg/-fg/-edge/-dot` | `#f4e4da` / `#8a3a22` / `#d3a78f` / `#a8482c` | `#151515` / `#ffffff` / `#000000` / `#ffffff` |
| `--polarity-neutral-bg/-fg/-edge/-dot` | `#f1e8d5` / `#5f5648` / `#ddceb2` / `#938876` | `#f6f6f4` / `#8c8c8c` / `#cfcfcf` / `#8c8c8c` |
| `--polarity-mixed-bg/-fg/-edge/-dot` | `#f6edd6` / `#8a5c13` / `#dcc08a` / `#ad7519` | `#d8d8d8` / `#151515` / `#8c8c8c` / `#3f3f3f` |

#### 符號章節密度（Symbol density）

| 屬性 | warm（焦赭 ramp） | ink（灰階 ramp） |
|------|------|-----|
| `--symbol-density-low` | `#e9ddc6` | `#ececea` |
| `--symbol-density-mid` | `#cf9a72` | `#8c8c8c` |
| `--symbol-density-high` | `#b05a34` | `#151515` |
| `--symbol-density-peak` | `#7d3e22` | `#000000` |

### 3.9 狀態色（Status）

warm 為暖色功能色（橄欖/赭黃/磚紅/灰藍，沉在紙面上）；ink 全部單色，狀態由 icon 字形承載。

| 屬性 | warm | ink |
|------|------|-----|
| `--color-success` / `-bg` | `#5f7d3b` / `#eef1df` | `#151515` / `#ececea` |
| `--color-warning` / `-bg` | `#ad7519` / `#f6edd6` | `#151515` / `#ececea` |
| `--color-error` / `-bg` | `#a8482c` / `#f4e4da` | `#151515` / `#ececea` |
| `--color-info` / `-bg` | `#5f6a88` / `#e8e7ee` | `#151515` / `#ececea` |

### 3.10 Unraveling DAG 節點狀態

ink 用單色階：fill 極性＋線重承載完成度。

| 屬性 | warm | ink |
|------|------|-----|
| `--status-complete-bg/-border/-fg` | `#eef1df` / `#5f7d3b` / `#4a6330` | `#151515` / `#151515` / `#ffffff` |
| `--status-partial-bg/-border/-fg` | `#f6edd6` / `#ad7519` / `#8a5c13` | `#ffffff` / `#1a1a1a` / `#151515` |
| `--status-empty-bg/-border/-fg` | `#f1e8d5` / `#ddceb2` / `#938876` | `#ffffff` / `#cfcfcf` / `#8c8c8c` |

### 3.11 知識圖譜節點（跨主題共用）

由 entity arc 派生（fill = bg、stroke = dot、label = fg）。**Cytoscape 自帶 color parser 不支援 oklch**，故此家族寫 sRGB hex（自 §3.7 oklch 轉換）；兩主題共用不覆寫。

| 類型 | fill | stroke | label |
|------|------|--------|-------|
| char | `#ffe8d9` | `#b97249` | `#714229` |
| loc | `#ebf0da` | `#74814d` | `#4b552e` |
| con | `#f9e2ee` | `#9e6181` | `#6c445b` |
| evt | `#ffe0de` | `#b35757` | `#803f40` |

### 3.12 張力強度（Tension Intensity）

| 階段 | warm（焦赭 ramp） | ink |
|------|------|-----|
| low `-bg/-fg/-edge` | `#f1e8d5` / `#938876` / `#ddceb2` | `#ffffff` / `#8c8c8c` / `#cfcfcf` |
| mid `-bg/-fg/-edge` | `#cf9a72` / `#52301c` / `#a96a44` | `#8c8c8c` / `#ffffff` / `#3f3f3f` |
| high `-bg/-fg/-edge` | `#b05a34` / `#f8f3e7` / `#7d3e22` | `#151515` / `#ffffff` / `#000000` |

### 3.13 Frye Mythos · 神話模式

warm 取 warm arc 四步（romance=赭黃、comedy=橄欖、tragedy=磚紅、irony=灰藍）；ink 灰階 fill polarity。

| Mythos | warm `-bg/-fg/-border` | ink `-bg/-fg/-border` |
|--------|------|-----|
| romance | `#f6edd6` / `#8a5c13` / `#dcc08a` | `#ffffff` / `#151515` / `#151515` |
| comedy | `#eef1df` / `#4a6330` / `#b7c78e` | `#ececea` / `#151515` / `#3f3f3f` |
| tragedy | `#f4e4da` / `#8a3a22` / `#d3a78f` | `#151515` / `#ffffff` / `#000000` |
| irony | `#e8e7ee` / `#47506b` / `#a9aec4` | `#8c8c8c` / `#ffffff` / `#151515` |

`data-mode="irony_satire"` 共用 `irony` 配色。

### 3.14 Booker Plot · 基本情節

| Token | warm | ink |
|-------|------|-----|
| `--booker-bg` | `#f1e8d5` | `#ececea` |
| `--booker-fg` | `#5f5648` | `#151515` |
| `--booker-border` | `#d3c3a4` | `#1a1a1a` |
| `--booker-accent` | `#b05a34` | `#111111` |

### 3.15 Component Shape Tokens（主題以「形」分化）

元件 CSS 消費這組，不直接寫 radius / border-width / shadow 原始值。Warm = 軟紙面；Ink = 平面直角重線的鋼筆稿 —— **同一份 markup**。

| Token | warm | ink | 作用對象 |
|-------|------|-----|---------|
| `--card-radius` | `var(--radius-lg)`（12px） | `var(--radius-sm)`（4px） | 書卡、settings 卡、panel、option card |
| `--card-border-width` | `1px` | `1.5px` | 卡片與 panel 外框 |
| `--card-shadow` | `var(--shadow-sm)` | `none` | 卡片 elevation（Ink 全平面） |
| `--btn-radius` | `var(--radius-md)`（8px） | `var(--radius-sm)`（4px） | 按鈕 |
| `--btn-border-width` | `1px` | `1.5px` | 按鈕外框 |
| `--btn-shadow` | `none` | `none` | 按鈕 elevation |
| `--pill-radius` | `20px`（全圓 lozenge） | `4px`（矩形 tag） | entity / symbol pill |
| `--pill-border-width` | `0.5px` | `1px` | pill 外框 |
| `--badge-radius` | `20px` | `4px` | status badge |
| `--control-radius` | `var(--radius-md)` | `var(--radius-sm)` | input、toggle、select |

兩主題需要進一步分化時在此層加 token（如 `--tab-radius`、`--input-border-width`），保持 palette 層與 shape 層分離。

### 3.16 插畫語彙（Illustration）

線稿插畫（empty state、splash、section mark）：細墨線、**不填色**、略鬆。SVG stroke/weight 一律取用：

| Token | warm | ink |
|-------|------|-----|
| `--illustration-stroke` | `var(--fg-primary)` | `#151515` |
| `--illustration-stroke-soft` | `var(--fg-muted)` | `#8c8c8c` |
| `--illustration-accent` | `var(--accent)` | `#151515` |
| `--illustration-fill` | `none` | `none` |
| `--illustration-weight` | `1.5px` | `1.5px` |
| `--illustration-weight-fine` | `1px` | `1px` |

規則：不上色、不填滿、不放進密集 UI；motif 為閱讀與分析的傢俱（書、筆尖、樹、屋、舟、流程節點、標點），從 Lucide line path 放大構成。

### 3.17 其他派生家族

| 家族 | warm | ink |
|------|------|-----|
| `--narrative-present-border/-bg` | `#b05a34` / `#f3e3d8` | `#151515` / `#ececea` |
| `--narrative-flashback-border/-bg` | `#5f6a88` / `#e8e7ee` | `#6b6b6b` / `#e4e4e2` |
| `--narrative-flashforward-border/-bg` | `#ad7519` / `#f6edd6` | `#3f3f3f` / `#d8d8d6` |
| `--narrative-parallel-border/-bg` | `#9e6181` / `#f9e2ee` | `#8c8c8c` / `#f6f6f4` |
| `--narrative-unknown-border/-bg` | `#938876` / `#f1e8d5` | `#cfcfcf` / `#fafafa` |
| `--timeline-chapter-bg` | `rgba(233,221,198,0.15)` | `rgba(0,0,0,0.02)` |
| `--timeline-parallel-bg/-border` | `rgba(158,97,129,0.06)` / `rgba(158,97,129,0.3)` | `rgba(0,0,0,0.02)` / `rgba(0,0,0,0.12)` |
| `--timeline-causal-stroke` | `#b05a34` | `#151515` |
| `--timeline-selected-ring` | `rgba(176,90,52,0.3)` | `rgba(0,0,0,0.2)` |
| `--shadow-sm/md/lg` | 暖影 `rgba(42,38,32,0.07–0.11)` | 中性 `rgba(0,0,0,0.08–0.12)` |

---

## 4. 元件層差異

| 主題 | 差異項目 | 說明 |
|------|---------|------|
| `ink` | Badge | 單色 badge 外加 `--border-width` 墨線外框（`[data-theme="ink"] .ss-badge` 模式，見設計 kit.css） |
| `ink` | Danger 按鈕 | `--color-error` 在 ink 為單色，`.ss-btn-danger` 轉為 `--fg-primary` 外框樣式 |
| 共通 | KG 節點 | `border-width` 讀 `--line-weight`（兩主題皆 1px）；`--node-shadow` 恆 `none`；entity/graph 色兩主題共用 |

---

## 5. 新增主題 SOP

1. **主題清單**（第 1 節）：新增一列，填入主題名稱與描述。
2. **Token 對照表**（第 3 節）：在各表格新增一欄。palette 層與 shape 層（§3.15）都要定義。
3. **元件層差異**（第 4 節）：確認是否有超出 token 覆蓋範圍的視覺差異。
4. **tokens.css**：新增 `[data-theme="<name>"]` 覆寫區塊。
5. **ThemeContext**：主題名稱加入 `VALID_THEMES` Set；`index.html` FOUC bootstrap 同步。
6. **SettingsPage**：`THEME_OPTS` 新增一項（含名稱、描述、preview 色塊）。
7. **i18n**：`settings.json`（zh-TW / en）新增對應字串。
