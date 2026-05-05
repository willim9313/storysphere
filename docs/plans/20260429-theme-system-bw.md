# StorySphere UI Theme Design Specification
**Black & White System · v0.1**

## Overview

StorySphere 提供三套可切換的 UI 主題，全部採用嚴格的黑白配色系統——不使用任何其他顏色。視覺差異透過線條粗細、填色方式、字型、紋理與邊框樣式達成。

每個主題有獨立的視覺識別，針對不同讀者風格設計。元件透過 design token 繼承當前主題，切換主題不需更動任何元件邏輯。

---

## Theme 01 — Manuscript

**關鍵詞**：ink · hatching · density · scholarly · tactile · analog · layered · weighted · parchment · deliberate

以手稿注記與學術鋼筆插圖的美學為核心。暗色調由堆疊斜線紋（hatching）而非平填產生，呈現層次感與刻意感。字型選用古典 serif，整體風格嚴肅、厚重、文學性。

**目標讀者**：閱讀經典或嚴肅文學作品的讀者與研究者。

### Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--font-display` | IM Fell English, serif | Headings, node labels, tags |
| `--font-body` | IM Fell English, serif | All body text |
| `--line-weight` | 0.8 – 1.5px | Edges, borders |
| `--border-style` | dashed (3px on, 3px off) | Graph edges |
| `--node-fill` | Hatching (90° stripes) | All node interiors |
| `--node-border` | 1px solid #000 | Theme nodes |
| `--node-border` | 1.5px solid #000 | Character nodes |
| `--tag-fill` | Diagonal hatching overlay | Keyword tags |
| `--stat-border` | 0.5px solid #bbb | Stat card borders |
| `--bar-fill` | Horizontal stripe (1/3px) | Progress bars |

### Node Visual

- **Character nodes**：較密斜線紋（gap 3px）
- **Theme nodes**：較疏斜線紋（gap 5px）
- **Hover state**：加 2px solid outer ring

### Edge Style

- Graph edge：dashed 3/3px · 0.8px · 45% opacity
- Divider：1px solid

---

## Theme 02 — Minimal Ink

**關鍵詞**：void · contrast · silhouette · breath · precise · flat · stamp · editorial · decisive · sparse

以極端黑白對比與最大留白為核心。Character nodes 為實心黑底；theme nodes 為白底細框。無斜線紋、無紋理——差異純粹來自填色極性與線條粗細。字型使用乾淨 sans-serif，整體風格現代、編輯感、精準。

**目標讀者**：偏好簡潔介面的設計敏感用戶。

### Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--font-display` | System sans-serif | Headings, node labels |
| `--font-body` | System sans-serif | All body text |
| `--font-weight` | 400 / 500 only | No 600 or 700 |
| `--line-weight` | 0.5 – 1px | All borders and edges |
| `--border-style` | 0.5px solid #000 | Graph edges (low opacity) |
| `--node-fill-char` | #000000 (solid black) | Character nodes |
| `--node-fill-theme` | #FFFFFF + 1px outline | Theme nodes |
| `--node-text-char` | #FFFFFF | Text on character nodes |
| `--node-text-theme` | #000000 | Text on theme nodes |
| `--bar-fill` | 1.5px solid track | Progress bars |
| `--tag-filled` | Black fill + white text | Active tags |
| `--tag-outline` | White fill + 1px border | Inactive tags |

### Node Visual

- **Character nodes**：solid black fill，white text
- **Theme nodes**：white fill，thin outline
- **Hover**：1.5px outer ring

### Edge Style

- Graph edge：0.5px solid · 18% opacity
- Stat divider：1.5px solid top + bottom

---

## Theme 03 — Pulp

**關鍵詞**：halftone · bold · gritty · expressive · newsprint · rough · narrative · loud · comic · imperfect

以 pulp 印刷、漫畫書與粗體字排版的美學為核心。邊框厚重；節點帶 2px solid offset drop shadow；進度條使用垂直條紋填色；標籤帶小陰影；字型使用等寬字作為 label，手寫風格字作為 display。整體風格響亮、觸感強、表現性。

**目標讀者**：閱讀輕小說、類型小說或圖像敘事作品的讀者。

### Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--font-display` | Permanent Marker / handwritten | Section headers, hero labels |
| `--font-body` | Space Mono / Courier New | All body text, node labels |
| `--line-weight` | 1.5 – 2.5px | All borders and edges |
| `--border-style` | 1.5px solid #000 | Graph edges |
| `--node-shadow` | 2px 2px 0 #000 (offset) | All nodes |
| `--node-fill-char` | #000000 (solid black) | Character nodes |
| `--node-fill-theme` | #FFFFFF + 2px border | Theme nodes |
| `--node-border` | 2px solid #000 | All nodes |
| `--bar-fill` | Vertical stripe (2/2px) | Progress bars |
| `--bar-border` | 1.5px solid #000 | Bar track outline |
| `--tag-shadow` | 2px 2px 0 #000 | Keyword tags |
| `--divider-style` | 2px dashed #888 | Section dividers |

### Node Visual

- 所有節點帶 2px offset black shadow
- **Character nodes**：solid black fill
- **Theme nodes**：white fill，2px border + shadow

### Edge Style

- Graph edge：1.5px solid · 70% opacity
- Section divider：2px dashed #888

---

## Theme Comparison

| | Manuscript | Minimal Ink | Pulp |
|--|-----------|-------------|------|
| 線條粗細 | Fine, 0.8–1.5px | Hairline, 0.5–1px | Bold, 1.5–2.5px |
| 黑白比例 | Mid-gray (hatching) | Extreme contrast | High contrast + shadow |
| 填色方式 | Hatching stripes | Solid fill / none | Solid fill + offset shadow |
| 邊框質感 | Hand-drawn, dashed | Geometric, precise | Thick, imperfect |
| 字型 | IM Fell English (serif) | System sans-serif | Space Mono + Marker |
| 目標讀者 | Literary / academic | Design-sensitive | Genre / light novel |

---

## 實作約束

- 每個主題實作為獨立的 CSS token 覆蓋區塊（`[data-theme="<name>"]`），不複製元件邏輯
- 色彩系統：三個 B&W 主題嚴格使用黑白灰，v1 不引入彩色、不實作 dark mode
- Cytoscape 節點紋理 fill（Manuscript）以靜態 SVG `<pattern>` 實作，透過 `background-image` 參照
- Token 實作位置：`frontend/src/styles/tokens.css`；對照表：`docs/DESIGN_TOKENS.md`
