# StorySphere — Design Tokens 主題對照表

> 本文件為所有主題 token 的唯一真實來源（source of truth）。  
> Token 實作位於 `frontend/src/styles/tokens.css`。  
> UI 頁面規格見 `docs/UI_SPEC.md`；主題切換實作見本文第 2 節。

---

## 1. 主題清單

| 主題名稱 | 描述 |
|---------|------|
| `default` | Warm Analytical — 暖白底、serif 正文，參考 Notion + Linear 混合風格 |
| `manuscript` | Manuscript — 手稿斜線紋、dashed 邊框、IM Fell English serif，學術研究感 |
| `minimal-ink` | Minimal Ink — 極端黑白對比、大留白、system sans-serif，編輯設計感 |
| `pulp` | Pulp — 厚重邊框、offset shadow、Space Mono + 手寫字，漫畫輕小說感 |

---

## 2. 切換機制

主題以 `data-theme` attribute 掛在 `<html>` 元素上，值為主題名稱字串（例如 `data-theme="manuscript"`）。

`ThemeContext` 負責：
1. **初始化**：app 啟動時從 `localStorage` 讀取 `storysphere:theme`，套用至 `<html data-theme="...">`
2. **切換**：使用者選擇主題時，更新 `<html>` attribute 並寫入 `localStorage`

**Dark mode** 為獨立維度，不在此處理。Dark mode 以 `data-theme="dark"` 控制，見 `UI_SPEC.md` Section 5（未來備註）。

---

## 3. Token 對照表

### 3.1 背景層次

| Token | default | manuscript | minimal-ink | pulp |
|-------|---------|-----------|-------------|------|
| `--bg-primary` | `#faf8f4` | `#f8f6f2` | `#ffffff` | `#ffffff` |
| `--bg-secondary` | `#f4ede0` | `#f0ede6` | `#f5f5f5` | `#f2f2f2` |
| `--bg-tertiary` | `#efe8d8` | `#e8e4db` | `#ebebeb` | `#e5e5e5` |

### 3.2 文字

| Token | default | manuscript | minimal-ink | pulp |
|-------|---------|-----------|-------------|------|
| `--fg-primary` | `#1c1814` | `#0d0d0d` | `#000000` | `#000000` |
| `--fg-secondary` | `#5a4f42` | `#333333` | `#333333` | `#1a1a1a` |
| `--fg-muted` | `#8a7a68` | `#888888` | `#888888` | `#666666` |

### 3.3 邊框與 Accent

| Token | default | manuscript | minimal-ink | pulp |
|-------|---------|-----------|-------------|------|
| `--border` | `#e0d4c4` | `#333333` | `#000000` | `#000000` |
| `--accent` | `#8b5e3c` | `#000000` | `#000000` | `#000000` |

### 3.4 工具面板

| Token | default | manuscript | minimal-ink | pulp |
|-------|---------|-----------|-------------|------|
| `--panel-bg` | `#ede4d8` | `#ede9e0` | `#eeeeee` | `#eeeeee` |
| `--panel-bg-card` | `#e4d9cc` | `#e4e0d5` | `#e5e5e5` | `#e0e0e0` |
| `--panel-border` | `#d4c8b8` | `#555555` | `#000000` | `#000000` |
| `--panel-fg` | `#1c1814` | `#0d0d0d` | `#000000` | `#000000` |
| `--panel-fg-muted` | `#8a7a68` | `#888888` | `#888888` | `#666666` |

### 3.5 字體

| Token | default | manuscript | minimal-ink | pulp |
|-------|---------|-----------|-------------|------|
| `--font-serif` | `'Libre Baskerville', Georgia, serif` | `'IM Fell English', Georgia, serif` | `system-ui, -apple-system, sans-serif` | `'Permanent Marker', cursive` |
| `--font-sans` | `'DM Sans', system-ui, sans-serif` | `'IM Fell English', Georgia, serif` | `system-ui, -apple-system, sans-serif` | `'Space Mono', 'Courier New', monospace` |

### 3.6 主題專用 Token

| Token | default | manuscript | minimal-ink | pulp |
|-------|---------|-----------|-------------|------|
| `--line-weight` | `1px` | `1px` | `0.5px` | `2px` |
| `--border-style` | `solid` | `dashed` | `solid` | `solid` |
| `--node-shadow` | `none` | `none` | `none` | `2px 2px 0 #000000` |
| `--divider-style` | `1px solid var(--border)` | `1px solid #333333` | `1.5px solid #000000` | `2px dashed #888888` |

### 3.7 實體 Pill 顏色

#### character

| 屬性 | default | manuscript | minimal-ink | pulp |
|------|---------|-----------|-------------|------|
| bg（`--entity-char-bg`） | `#eff6ff` | `#f0f0f0` | `#000000` | `#000000` |
| border（`--entity-char-border`） | `#bfdbfe` | `#111111` | `#000000` | `#000000` |
| text（`--entity-char-fg`） | `#1e3a8a` | `#0d0d0d` | `#ffffff` | `#ffffff` |
| dot（`--entity-char-dot`） | `#2563eb` | `#111111` | `#ffffff` | `#ffffff` |

#### location

| 屬性 | default | manuscript | minimal-ink | pulp |
|------|---------|-----------|-------------|------|
| bg（`--entity-loc-bg`） | `#ecfdf5` | `#e8e8e8` | `#ffffff` | `#ffffff` |
| border（`--entity-loc-border`） | `#6ee7b7` | `#444444` | `#000000` | `#000000` |
| text（`--entity-loc-fg`） | `#064e3b` | `#0d0d0d` | `#000000` | `#000000` |
| dot（`--entity-loc-dot`） | `#059669` | `#444444` | `#000000` | `#000000` |

#### organization

| 屬性 | default | manuscript | minimal-ink | pulp |
|------|---------|-----------|-------------|------|
| bg（`--entity-org-bg`） | `#fffbeb` | `#f5f5f5` | `#e0e0e0` | `#e0e0e0` |
| border（`--entity-org-border`） | `#fcd34d` | `#666666` | `#000000` | `#000000` |
| text（`--entity-org-fg`） | `#78350f` | `#222222` | `#000000` | `#000000` |
| dot（`--entity-org-dot`） | `#d97706` | `#666666` | `#000000` | `#000000` |

#### object

| 屬性 | default | manuscript | minimal-ink | pulp |
|------|---------|-----------|-------------|------|
| bg（`--entity-obj-bg`） | `#fdf4ff` | `#ebebeb` | `#f0f0f0` | `#f0f0f0` |
| border（`--entity-obj-border`） | `#e879f9` | `#888888` | `#aaaaaa` | `#000000` |
| text（`--entity-obj-fg`） | `#701a75` | `#222222` | `#333333` | `#000000` |
| dot（`--entity-obj-dot`） | `#c026d3` | `#888888` | `#555555` | `#000000` |

#### concept

| 屬性 | default | manuscript | minimal-ink | pulp |
|------|---------|-----------|-------------|------|
| bg（`--entity-con-bg`） | `#f5f3ff` | `#f0f0f0` | `#ffffff` | `#ffffff` |
| border（`--entity-con-border`） | `#c4b5fd` | `#aaaaaa` | `#aaaaaa` | `#888888` |
| text（`--entity-con-fg`） | `#4c1d95` | `#333333` | `#888888` | `#555555` |
| dot（`--entity-con-dot`） | `#7c3aed` | `#aaaaaa` | `#aaaaaa` | `#555555` |

#### event

| 屬性 | default | manuscript | minimal-ink | pulp |
|------|---------|-----------|-------------|------|
| bg（`--entity-evt-bg`） | `#fff1f2` | `#111111` | `#555555` | `#000000` |
| border（`--entity-evt-border`） | `#fecaca` | `#000000` | `#000000` | `#000000` |
| text（`--entity-evt-fg`） | `#991b1b` | `#f8f6f2` | `#ffffff` | `#ffffff` |
| dot（`--entity-evt-dot`） | `#ef4444` | `#f8f6f2` | `#ffffff` | `#ffffff` |

#### other

| 屬性 | default | manuscript | minimal-ink | pulp |
|------|---------|-----------|-------------|------|
| bg（`--entity-other-bg`） | `#f8fafc` | `#e0e0e0` | `#f5f5f5` | `#f5f5f5` |
| border（`--entity-other-border`） | `#cbd5e1` | `#cccccc` | `#cccccc` | `#aaaaaa` |
| text（`--entity-other-fg`） | `#334155` | `#555555` | `#888888` | `#555555` |
| dot（`--entity-other-dot`） | `#64748b` | `#cccccc` | `#cccccc` | `#aaaaaa` |

### 3.8 象徵意象類型（Symbol Pills）

B&W 主題採 **6 階梯度**策略（manuscript = 淺→深灰階；minimal-ink / pulp = 填充極性 black→white），確保 6 個類型在無彩色環境下仍可區分。

#### object

| 屬性 | default | manuscript | minimal-ink | pulp |
|------|---------|-----------|-------------|------|
| bg（`--symbol-object-bg`） | `#dbeafe` | `#f2f2f2` | `#000000` | `#000000` |
| text（`--symbol-object-fg`） | `#1e40af` | `#0d0d0d` | `#ffffff` | `#ffffff` |
| dot（`--symbol-object-dot`） | `#3b82f6` | `#111111` | `#ffffff` | `#ffffff` |

#### nature

| 屬性 | default | manuscript | minimal-ink | pulp |
|------|---------|-----------|-------------|------|
| bg（`--symbol-nature-bg`） | `#dcfce7` | `#e0e0e0` | `#3a3a3a` | `#333333` |
| text（`--symbol-nature-fg`） | `#166534` | `#0d0d0d` | `#ffffff` | `#ffffff` |
| dot（`--symbol-nature-dot`） | `#22c55e` | `#333333` | `#cccccc` | `#ffffff` |

#### spatial

| 屬性 | default | manuscript | minimal-ink | pulp |
|------|---------|-----------|-------------|------|
| bg（`--symbol-spatial-bg`） | `#fef9c3` | `#cccccc` | `#777777` | `#777777` |
| text（`--symbol-spatial-fg`） | `#713f12` | `#0d0d0d` | `#ffffff` | `#ffffff` |
| dot（`--symbol-spatial-dot`） | `#eab308` | `#555555` | `#ffffff` | `#ffffff` |

#### body

| 屬性 | default | manuscript | minimal-ink | pulp |
|------|---------|-----------|-------------|------|
| bg（`--symbol-body-bg`） | `#fee2e2` | `#888888` | `#c0c0c0` | `#bbbbbb` |
| text（`--symbol-body-fg`） | `#991b1b` | `#ffffff` | `#000000` | `#000000` |
| dot（`--symbol-body-dot`） | `#ef4444` | `#eeeeee` | `#000000` | `#000000` |

#### color

| 屬性 | default | manuscript | minimal-ink | pulp |
|------|---------|-----------|-------------|------|
| bg（`--symbol-color-bg`） | `#ede9fe` | `#444444` | `#e8e8e8` | `#e5e5e5` |
| text（`--symbol-color-fg`） | `#4c1d95` | `#ffffff` | `#000000` | `#000000` |
| dot（`--symbol-color-dot`） | `#8b5cf6` | `#cccccc` | `#555555` | `#555555` |

#### other

| 屬性 | default | manuscript | minimal-ink | pulp |
|------|---------|-----------|-------------|------|
| bg（`--symbol-other-bg`） | `#f1f5f9` | `#111111` | `#f5f5f5` | `#f5f5f5` |
| text（`--symbol-other-fg`） | `#475569` | `#f2f2f2` | `#888888` | `#555555` |
| dot（`--symbol-other-dot`） | `#94a3b8` | `#888888` | `#cccccc` | `#aaaaaa` |

### 3.9 狀態色（Status）

通用語意色，由 `--color-success / warning / error / info` 與其 `-bg` 變體組成。default 主題保持彩色語意（綠/橘/紅/藍）；B&W 主題改採嚴格灰階（狀態以 icon 形態與權重傳達，非色相）。

| 屬性 | default | manuscript | minimal-ink | pulp |
|------|---------|-----------|-------------|------|
| `--color-success` | `#16a34a` | `#0d0d0d` | `#000000` | `#000000` |
| `--color-success-bg` | `#f0fdf4` | `#e8e4db` | `#ebebeb` | `#e5e5e5` |
| `--color-warning` | `#d97706` | `#555555` | `#555555` | `#555555` |
| `--color-warning-bg` | `#fffbeb` | `#e8e4db` | `#ebebeb` | `#e5e5e5` |
| `--color-error` | `#dc2626` | `#0d0d0d` | `#000000` | `#000000` |
| `--color-error-bg` | `#fff5f5` | `#e8e4db` | `#ebebeb` | `#e5e5e5` |
| `--color-info` | `#2563eb` | `#888888` | `#888888` | `#888888` |
| `--color-info-bg` | `#eff6ff` | `#e8e4db` | `#ebebeb` | `#e5e5e5` |

### 3.10 Unraveling DAG 節點狀態

依完成度（complete / partial / empty）區分。default 主題保留彩色（綠/橘/灰）；B&W 主題改採填充密度梯度（complete = 最深 / 最強對比；empty = 最淺 / 最弱對比）。

| 屬性 | default | manuscript | minimal-ink | pulp |
|------|---------|-----------|-------------|------|
| `--status-complete-bg` | `#f0fdf4` | `#d8d8d8` | `#000000` | `#000000` |
| `--status-complete-border` | `#22c55e` | `#000000` | `#000000` | `#000000` |
| `--status-complete-fg` | `#15803d` | `#0d0d0d` | `#ffffff` | `#ffffff` |
| `--status-partial-bg` | `#fffbeb` | `#ebebeb` | `#aaaaaa` | `#aaaaaa` |
| `--status-partial-border` | `#f59e0b` | `#555555` | `#000000` | `#000000` |
| `--status-partial-fg` | `#92400e` | `#333333` | `#000000` | `#000000` |
| `--status-empty-bg` | `#f3f4f6` | `#f5f5f5` | `#ffffff` | `#ffffff` |
| `--status-empty-border` | `#d1d5db` | `#aaaaaa` | `#aaaaaa` | `#000000` |
| `--status-empty-fg` | `#6b7280` | `#888888` | `#888888` | `#555555` |

### 3.11 知識圖譜節點

label 渲染於節點下方外部（`text-valign: 'bottom'`），背景為 `--bg-primary`，因此 label 顏色一律設為可讀於頁面背景的深色（B&W 主題對齊 `--fg-primary`），不依賴 fill 亮度。fill / stroke 的色階仍依類型區分。

| 類型 | Token | default | manuscript | minimal-ink | pulp |
|------|-------|---------|-----------|-------------|------|
| character | `--graph-char-fill` | `#dbeafe` | `#d8d8d8` | `#000000` | `#000000` |
| | `--graph-char-stroke` | `#3b82f6` | `#000000` | `#000000` | `#000000` |
| | `--graph-char-label` | `#1e3a8a` | `#0d0d0d` | `#000000` | `#000000` |
| location | `--graph-loc-fill` | `#dcfce7` | `#b8b8b8` | `#ffffff` | `#ffffff` |
| | `--graph-loc-stroke` | `#22c55e` | `#333333` | `#000000` | `#000000` |
| | `--graph-loc-label` | `#064e3b` | `#0d0d0d` | `#000000` | `#000000` |
| concept | `--graph-con-fill` | `#ede9fe` | `#909090` | `#aaaaaa` | `#aaaaaa` |
| | `--graph-con-stroke` | `#8b5cf6` | `#555555` | `#000000` | `#000000` |
| | `--graph-con-label` | `#4c1d95` | `#0d0d0d` | `#000000` | `#000000` |
| event | `--graph-evt-fill` | `#fee2e2` | `#3a3a3a` | `#555555` | `#444444` |
| | `--graph-evt-stroke` | `#ef4444` | `#000000` | `#000000` | `#000000` |
| | `--graph-evt-label` | `#991b1b` | `#0d0d0d` | `#000000` | `#000000` |

---

## 4. 元件層差異

若某主題的視覺差異超出 token 替換範圍，在此節記錄。

| 主題 | 差異項目 | 說明 |
|------|---------|------|
| `manuscript` | KG 節點 fill | 設計稿要求斜線紋（SVG `<pattern>`）；token 層僅定義灰階色，紋理實作於元件層（子任務 F-17.4） |
| `manuscript` | KG / Unraveling edge | `--border-style: dashed` 由 `cytoscapeConfig.ts` 與 `UnravelingPage` 的 `getUnravelingStylesheet()` 讀取後套用為 `line-style: dashed`（已實作） |
| `pulp` | HTML 表面 shadow | `--node-shadow: 2px 2px 0 #000` 在 `[data-theme="pulp"] .card` 套用 `box-shadow`（已實作）。**Cytoscape 限制**：canvas 渲染不支援 box-shadow，KG / Unraveling 節點不套用 shadow |
| `minimal-ink` / `pulp` | KG node border-width | `--line-weight` 由 cytoscapeConfig 讀取後套為 `border-width = max(1, lineWeight × 2)`（已實作；minimal-ink hairline、pulp bold） |

---

## 5. 新增主題 SOP

1. **主題清單**（第 1 節）：新增一列，填入主題名稱與描述。
2. **Token 對照表**（第 3 節）：在各表格新增一欄，填入對應色碼。
3. **元件層差異**（第 4 節）：確認是否有超出 token 覆蓋範圍的視覺差異，若有則記錄。
4. **tokens.css**：在 `frontend/src/styles/tokens.css` 新增對應的 `[data-theme="<name>"]` 覆蓋區塊。
5. **ThemeContext**：確認主題名稱已加入 `VALID_THEMES` Set。
6. **SettingsPage**：在 `THEME_OPTIONS` 陣列新增一項（含名稱、描述、preview 色塊）。
7. **i18n**：在 `settings.json`（zh-TW / en）新增對應的 `theme.<id>` 與 `theme.<id>Desc` 字串。
