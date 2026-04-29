# StorySphere — Design Tokens 主題對照表

> 本文件為所有主題 token 的唯一真實來源（source of truth）。  
> Token 實作位於 `frontend/src/styles/tokens.css`。  
> UI 頁面規格見 `docs/UI_SPEC.md`；主題切換實作見本文第 2 節。

---

## 1. 主題清單

| 主題名稱 | 描述 |
|---------|------|
| `default` | Warm Analytical — 暖白底、serif 正文，參考 Notion + Linear 混合風格 |
| `theme-2` | 待定 |

---

## 2. 切換機制

主題以 `data-theme` attribute 掛在 `<html>` 元素上，值為主題名稱字串（例如 `data-theme="default"`）。

`ThemeContext` 負責：
1. **初始化**：app 啟動時從 `localStorage` 讀取 `storysphere:theme`，套用至 `<html data-theme="...">`
2. **切換**：使用者選擇主題時，更新 `<html>` attribute 並寫入 `localStorage`

**Dark mode** 為獨立維度，不在此處理。Dark mode 以 `data-theme="dark"` 控制，見 `UI_SPEC.md` Section 5（未來備註）。

---

## 3. Token 對照表

### 3.1 背景層次

| Token | default | theme-2 |
|-------|---------|---------|
| `--bg-primary` | `#faf8f4` | — |
| `--bg-secondary` | `#f4ede0` | — |
| `--bg-tertiary` | `#efe8d8` | — |

### 3.2 文字

| Token | default | theme-2 |
|-------|---------|---------|
| `--fg-primary` | `#1c1814` | — |
| `--fg-secondary` | `#5a4f42` | — |
| `--fg-muted` | `#8a7a68` | — |

### 3.3 邊框與 Accent

| Token | default | theme-2 |
|-------|---------|---------|
| `--border` | `#e0d4c4` | — |
| `--accent` | `#8b5e3c` | — |

### 3.4 工具面板

工具面板（知識圖譜 EntityDetailPanel、分析 sidebar 等）使用比主內容區略深的暖米色作為底色。

| Token | default | theme-2 |
|-------|---------|---------|
| `--panel-bg` | `#ede4d8` | — |
| `--panel-bg-card` | `#e4d9cc` | — |
| `--panel-border` | `#d4c8b8` | — |
| `--panel-fg` | `#1c1814` | — |
| `--panel-fg-muted` | `#8a7a68` | — |

### 3.5 實體 Pill 顏色

顏色值為硬編碼色碼（非 CSS variable）；CSS variable 名稱列於括號內供參。

#### character（寶藍 220°）

| 屬性 | default | theme-2 |
|------|---------|---------|
| bg（`--entity-char-bg`） | `#eff6ff` | — |
| border（`--entity-char-border`） | `#bfdbfe` | — |
| text（`--entity-char-fg`） | `#1e3a8a` | — |
| dot（`--entity-char-dot`） | `#2563eb` | — |

#### location（翠綠 155°）

| 屬性 | default | theme-2 |
|------|---------|---------|
| bg（`--entity-loc-bg`） | `#ecfdf5` | — |
| border（`--entity-loc-border`） | `#6ee7b7` | — |
| text（`--entity-loc-fg`） | `#064e3b` | — |
| dot（`--entity-loc-dot`） | `#059669` | — |

#### organization（琥珀 38°）

| 屬性 | default | theme-2 |
|------|---------|---------|
| bg（`--entity-org-bg`） | `#fffbeb` | — |
| border（`--entity-org-border`） | `#fcd34d` | — |
| text（`--entity-org-fg`） | `#78350f` | — |
| dot（`--entity-org-dot`） | `#d97706` | — |

#### object（洋紅 300°）

| 屬性 | default | theme-2 |
|------|---------|---------|
| bg（`--entity-obj-bg`） | `#fdf4ff` | — |
| border（`--entity-obj-border`） | `#e879f9` | — |
| text（`--entity-obj-fg`） | `#701a75` | — |
| dot（`--entity-obj-dot`） | `#c026d3` | — |

#### concept（靛紫 265°）

| 屬性 | default | theme-2 |
|------|---------|---------|
| bg（`--entity-con-bg`） | `#f5f3ff` | — |
| border（`--entity-con-border`） | `#c4b5fd` | — |
| text（`--entity-con-fg`） | `#4c1d95` | — |
| dot（`--entity-con-dot`） | `#7c3aed` | — |

#### event（緋紅）

| 屬性 | default | theme-2 |
|------|---------|---------|
| bg（`--entity-evt-bg`） | `#fff1f2` | — |
| border（`--entity-evt-border`） | `#fecaca` | — |
| text（`--entity-evt-fg`） | `#991b1b` | — |
| dot（`--entity-evt-dot`） | `#ef4444` | — |

#### other（石板灰）

| 屬性 | default | theme-2 |
|------|---------|---------|
| bg（`--entity-other-bg`） | `#f8fafc` | — |
| border（`--entity-other-border`） | `#cbd5e1` | — |
| text（`--entity-other-fg`） | `#334155` | — |
| dot（`--entity-other-dot`） | `#64748b` | — |

### 3.6 知識圖譜節點

Cytoscape.js 節點 fill / stroke 色碼（`--graph-*`）。

| 類型 | Token（fill） | default | Token（stroke） | default | theme-2 |
|------|--------------|---------|----------------|---------|---------|
| character | `--graph-char-fill` | `#dbeafe` | `--graph-char-stroke` | `#3b82f6` | — |
| location | `--graph-loc-fill` | `#dcfce7` | `--graph-loc-stroke` | `#22c55e` | — |
| concept | `--graph-con-fill` | `#ede9fe` | `--graph-con-stroke` | `#8b5cf6` | — |
| event | `--graph-evt-fill` | `#fee2e2` | `--graph-evt-stroke` | `#ef4444` | — |

---

## 4. 元件層差異

若某主題的視覺差異超出 token 替換範圍（例如 pill 改為純色塊、卡片改為無邊框），在此節記錄。

> 目前所有主題差異均可透過 token 覆蓋，無需元件層變異。

---

## 5. 新增主題 SOP

1. **主題清單**（第 1 節）：新增一列，填入主題名稱與描述。
2. **Token 對照表**（第 3 節）：在各表格新增一欄，填入對應色碼。
3. **元件層差異**（第 4 節）：確認是否有超出 token 覆蓋範圍的視覺差異，若有則記錄。
4. **tokens.css**：在 `frontend/src/styles/tokens.css` 新增對應的 `[data-theme="<name>"]` 覆蓋區塊。
5. **ThemeContext**：確認主題名稱已加入可選清單。
