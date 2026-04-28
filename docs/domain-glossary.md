# StorySphere 領域術語表

> **受眾**：前端開發者（含 Claude Code session）。  
> 說明各術語的定義、它在 UI 上如何呈現、與後端 model/API 欄位的對應關係。  
> 非用戶文件，也非後端技術規格。

---

## 張力分析（Tension Analysis）

### TEU — Tension Event Unit

**定義**：最小張力單元。系統從書中每個事件提取出的一組「對立極對」記錄，代表「這個事件包含了哪兩股對立力量的碰撞」。

**後端 model**：`TensionEventUnit`，欄位包含 `pole_a`、`pole_b`、`intensity`（0–1）、`chapter`。

**UI 呈現**：TEU 本身不直接在介面上顯示單一卡片；它們是 Step 1 的輸出中間產物，在 Step 2 聚合為 TensionLine 後，卡片標題列才會顯示 `N TEU` 的統計數字。

---

### TensionLine — 張力線

**定義**：跨章節持續存在的對立張力軸。由 Step 2 將多個 TEU 聚合而成，代表「整本書中反覆出現的同一組對立」。

**後端 model**：`TensionLine`，關鍵欄位：

| 欄位 | 說明 | UI 對應 |
|------|------|---------|
| `canonical_pole_a` | 第一極的規範化名稱 | 卡片標題、可 inline 編輯 |
| `canonical_pole_b` | 第二極的規範化名稱 | 卡片標題、可 inline 編輯 |
| `teu_ids` | 構成此線的 TEU ID 列表 | 顯示 `N TEU` |
| `chapter_range` | 此張力線橫跨的章節範圍 | 軌跡圖橫條寬度、標題列 `ch1–ch5` |
| `intensity_summary` | 強度摘要（0–1） | 軌跡圖橫條顏色（低→藍，高→橘紅）；百分比顯示 |
| `review_status` | 審核狀態（見下） | 卡片邊框色、狀態 badge |

**`review_status` 對應**：

| 值 | 中文 | 卡片邊框 |
|----|------|---------|
| `pending` | 待審核 | 灰 |
| `approved` | 已確認 | 綠 |
| `modified` | 已修改 | 藍 |
| `rejected` | 已拒絕 | 紅，整列 opacity: 0.4 |

**UI 呈現**：`TensionPage` 的 TensionLineCard，accordion 展開後可進行審核操作。

---

### TensionTheme — 張力主題

**定義**：全書的核心對立命題。由 Step 3 從所有 approved/modified 的 TensionLine 中合成，以一句話描述「這本書最根本的戲劇衝突是什麼」。

**後端 model**：`TensionTheme`，關鍵欄位：

| 欄位 | 說明 | UI 對應 |
|------|------|---------|
| `proposition` | 主題命題文字 | 主要內容，可 inline 編輯 |
| `frye_mythos` | Frye 神話模式（見下） | 黃色 badge |
| `booker_plot` | Booker 七大基本情節（見下） | 紫色 badge |
| `review_status` | 同 TensionLine 的審核狀態 | 面板邊框色 |

**UI 呈現**：`TensionPage` 最下方的 TensionThemePanel，Step 3 完成後出現。

---

### Frye Mythos

**定義**：Northrop Frye 文學理論中的四大神話模式，用來分類敘事的情感基調與結構原型。

| 值 | 中文 | 說明 |
|----|------|------|
| `romance` | 浪漫傳奇 | 英雄征服、光明勝暗 |
| `tragedy` | 悲劇 | 英雄隕落、命運注定 |
| `comedy` | 喜劇 | 混亂後的和諧、社群重建 |
| `irony` | 反諷 | 去英雄化、現實的複雜性 |

**UI 呈現**：`TensionThemePanel` 中的黃色 badge（`background: #fef9c3; color: #713f12`）。

---

### Booker Plot

**定義**：Christopher Booker 《七大基本情節》中的情節類型。

| 值 | 中文 |
|----|------|
| `overcoming_the_monster` | 克服怪物 |
| `rags_to_riches` | 白手起家 |
| `the_quest` | 追尋之旅 |
| `voyage_and_return` | 出走與歸返 |
| `comedy` | 喜劇 |
| `tragedy` | 悲劇 |
| `rebirth` | 重生 |

**UI 呈現**：`TensionThemePanel` 中的紫色 badge（`background: #ede9fe; color: #4c1d95`）。

---

## 事件分析（Event Analysis）

### EEP — Event Epistemic Profile

**定義**：事件的完整深度分析結果，包含多個維度的結構化資料，記錄「這個事件在故事世界中的完整意義」。

**關鍵欄位**：

| 欄位 | 說明 | UI 位置 |
|------|------|---------|
| `state_before` | 事件發生前的世界狀態 | EEP 證據剖析 accordion |
| `state_after` | 事件發生後的世界狀態 | EEP 證據剖析 accordion |
| `causal_factors` | 導致事件的因果因素列表 | EEP 證據剖析 accordion |
| `structural_role` | 事件在故事結構中的角色 | EEP 證據剖析 accordion |
| `event_importance` | `KERNEL` 或 `SATELLITE`（見下） | badge；時間軸節點大小 |
| `thematic_significance` | 主題意義說明 | EEP 證據剖析 accordion |
| `text_evidence` | 原文引用列表 | 可展開的原文項目 |

**UI 呈現**：事件分析頁 `EventAnalysisDetail` 元件；知識圖譜頁 `EventDetailPanel`；時間軸頁事件詳情面板的「EEP 證據剖析」accordion（預設收合）。

---

### event_importance — 事件重要性

**定義**：事件在故事結構中的分量。

| 值 | 含義 | 時間軸節點大小 |
|----|------|--------------|
| `KERNEL` | 核心事件：影響故事走向的關鍵節點 | 48px |
| `SATELLITE` | 衛星事件：豐富細節，移除不影響主線 | 32px |
| （未分類） | 尚未執行 EEP 分析 | 36px |

**UI 呈現**：時間軸頁節點大小；事件詳情面板的 importance badge。注意：**不以顏色區分**（顏色已由 `narrative_mode` 使用，避免雙重編碼）。

---

### narrative_mode — 敘事模式

**定義**：事件在敘事時間軸上的位置類型，描述「作者選擇以什麼時序關係來講述這個事件」。

| 值 | 含義 | 時間軸節點顏色 |
|----|------|--------------|
| `present` | 正時序 | 不顯示 badge；暖棕色 |
| `flashback` | 倒敘 | ⏪ badge；藍色 |
| `flashforward` | 預敘 | ⏩ badge；橘色 |
| `parallel` | 平行敘事（同時發生） | ⏸ badge；紫色 |
| `unknown` | 未判定 | ? badge；灰色 |

**UI 呈現**：時間軸頁節點左上角小 badge 及節點底色；矩陣視圖散點顏色。

---

### chronological_rank — 故事時序位置

**定義**：事件在「故事世界的時間線」中的相對位置，0.0 = 故事最早，1.0 = 故事最晚。由 pipeline 計算，非由文本直接標記。

**UI 呈現**：
- 時間軸「故事時序」模式的排列依據
- 矩陣視圖 Y 軸刻度
- 事件詳情面板顯示「時序位置 0.35 / 1.0」
- `null` 表示尚未計算 → 時間軸工具列旁顯示 ⚠️

---

### TemporalRelation — 時序關係邊

**定義**：兩個事件之間有明確文本證據支持的時間先後或因果關係。

關鍵欄位：
- `relation_type`：`before`（前後）/ `causes`（因果）
- `confidence`：0.0–1.0，信心度
- `text_evidence`：支持此關係的原文

**UI 呈現**：時間軸「故事時序」模式的上層連線。依 `confidence` 決定樣式（≥0.8 實線 / 0.5–0.8 虛線 / <0.5 不顯示）；`causes` 關係用 accent 色 + 箭頭。

---

## 知識圖譜（Knowledge Graph）

### Inferred Relation — 推斷關係

**定義**：系統透過 Common Neighbors + Adamic-Adar 演算法，從現有關係網絡中預測「可能存在但文本中未明確記載」的實體關係。

**演算法**：基於連結預測（Link Prediction），同時出現在多個共同鄰居的節點，被判定為可能有隱性關係。

**UI 呈現**：知識圖譜頁中以**虛線邊**呈現，顏色與一般關係邊區分。
- 工具欄按鈕控制是否顯示
- 點擊推斷邊 → `InferredEdgePanel`（右側面板）
- 面板中可 **Confirm（確認加入圖譜）** 或 **Reject（排除）**

---

### Epistemic State — 角色認知狀態

**定義**：「在故事世界的第 N 章為止，角色 X 知道哪些事」的模型。記錄某角色在特定時間點的知識邊界。

**UI 呈現**：
1. **知識圖譜頁 EpistemicOverlay**：選擇角色 + 章節 → 灰色虛線樣式標示此角色「不知道」的節點
2. **角色分析頁 EpistemicStateSection**：以 chapter slider 選擇時間點，分組顯示已知/未知的實體與事件

---

## 象徵意象（Symbols & Imagery）

### ImageryEntity — 意象實體

**定義**：書中具有象徵意義的詞條（物件、自然景象、空間、身體意象、顏色等），由系統自動識別並追蹤跨章節的出現頻率。

**類型（imagery_type）**：

| 值 | 中文 | 色系 |
|----|------|------|
| `object` | 物件 | 藍 |
| `nature` | 自然 | 綠 |
| `spatial` | 空間 | 黃 |
| `body` | 身體 | 紅 |
| `color` | 顏色 | 紫 |
| `other` | 其他 | 灰 |

**co_occurrence**：兩個意象在同一 chunk 中共同出現的次數，用來識別意象群集。

---

## 敘事結構（Narratology）

### Fabula vs Sjuzhet

**Fabula（故事）**：故事世界的實際時間順序，即「事件真正發生的先後」。對應 `chronological_rank`。

**Sjuzhet（情節）**：作者選擇呈現給讀者的敘事順序，即「書中章節的排列順序」。對應 `chapter` 序號。

**UI 呈現**：時間軸頁「矩陣視圖（Fabula-Sjuzhet Matrix）」的 X/Y 軸定義。對角線代表「敘事順序 = 故事時序」（線性敘事）；偏離對角線代表非線性敘事。

---

## 通用術語

### Task Polling — 任務輪詢

**定義**：後端長時間任務（LLM 呼叫、Pipeline 執行）以非同步方式進行。前端呼叫觸發 API 取得 `taskId` 後，定期（2–3 秒）呼叫 `GET /tasks/:taskId/status` 取得進度。

**TaskStatus 關鍵欄位**：

| 欄位 | 說明 |
|------|------|
| `status` | `pending / running / done / error` |
| `progress` | 0–100 進度百分比 |
| `stage` | 當前執行階段的文字描述 |
| `result` | 完成後的結果資料（各任務格式不同） |
| `error` | 失敗時的錯誤訊息 |

**UI 呈現**：各頁面的 loading 狀態、進度條、stage 文字。Hook：`useTaskPolling(taskId, fetcher?)`。
