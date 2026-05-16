# 知識圖譜頁重新設計 — Design Handoff

**日期**：2026-05-16
**範疇**：`/books/:bookId/graph`（`GraphPage` 及其底下 `components/graph/*`）
**設計系統**：沿用既有 Claude Design 中已上傳之 design system；Token 來源唯一為 `frontend/src/styles/tokens.css`（對照表見 `docs/DESIGN_TOKENS.md`）

---

## 1. 重新設計動機（待填）

> ⚠️ 開始實作前必須填妥此節，否則設計會缺少方向。

- 痛點 1：（例：節點數量大時難以辨認，缺乏 cluster / focus 機制）
- 痛點 2：
- 痛點 3：
- 主要使用者情境（user flow）：
  - 例：讀者讀到第三章，想看截至目前出現過的角色關係
  - 例：研究者想審核系統推斷出的關係邊
- 成功指標（怎樣算重新設計成功）：

---

## 2. 範疇（hard scope）

### 包含
- 主畫面 `GraphPage`（Canvas + 浮動工具列 + 右側面板層級）
- 浮動工具列 `GraphToolbar`（搜尋、類型 filter、推斷關係按鈕、動畫模式、reset）
- 右側面板：`EntityDetailPanel` / `EventDetailPanel` / `AnalysisPanel` / `ParagraphsPanel` / `InferredEdgePanel`
- 底部控制：`TimelineControls`（章節快照）、`EpistemicOverlay`（認知視角）
- 縮放控制（右下角 +/-）與統計徽章（節點/關係數）
- 各種狀態：loading / empty / error / 大量節點 / 小量節點

### 不包含（保留現狀）
- Cytoscape.js 渲染引擎本身（force-directed layout 演算法）
- 後端 API 形狀（節點與邊的資料結構不動，僅外觀與互動可改）
- 路由與資料載入策略（React Query keys、URL 結構不動）

---

## 3. 現況快照（必讀，避免憑空設計）

### 3.1 資訊架構

```
[GraphCanvas（全幅）]
  ├─ 左上：GraphToolbar（搜尋 / 類型 filter / 推斷按鈕 / 動畫模式 / reset）
  ├─ 左下：TimelineControls + EpistemicOverlay（疊在 timeline 上方）
  ├─ 右下：縮放控制（+/-）、統計徽章（節點/關係數）
  └─ 右側面板（最多三層，第三層切換時替換）：
       Layer 1: GraphCanvas
       Layer 2: EntityDetailPanel | EventDetailPanel （260px）
       Layer 3: AnalysisPanel (360px) | ParagraphsPanel (400px) | InferredEdgePanel
```

### 3.2 節點視覺規則（現況）
- 大小：依 `chunkCount` 縮放（20px–60px）
- 顏色：依實體類型 — character 藍 / location 綠 / concept 紫 / event 紅
- 選中態：accent 色邊框，連出 edge 加深，其餘淡化
- Epistemic 灰化：選中角色尚未認知的節點 → dashed 灰邊（不重新請求圖譜，只改樣式）
- 推斷邊：虛線樣式

### 3.3 主要互動流程
```
進入頁面
  → 載入 GET /books/:bookId/graph
  → 解析 ?entity= query → 自動選中對應節點

點擊節點：
  - event 類型 → EventDetailPanel
  - 非 event → EntityDetailPanel
  → 點「查看分析」推出 AnalysisPanel
  → 點「相關段落」推出 ParagraphsPanel

點擊推斷邊（虛線）→ InferredEdgePanel（可 Confirm / Reject）
執行推論 → 刷新圖譜與推斷關係資料

TimelineControls 切換章節 → 重新請求圖譜（帶 mode=chapter & position）
EpistemicOverlay 選角色 → 只疊加灰化樣式（不打 API）
```

### 3.4 推斷關係按鈕狀態機（要保留）
| 狀態 | 顯示 | 樣式 |
|------|------|------|
| 未執行 | 「執行推論」 | 預設灰 |
| 執行中 | spinner + 「推論中…」 | disabled |
| 有資料（隱藏中） | 「顯示推斷關係」 | 橘色邊框 |
| 顯示中 | 「隱藏推斷關係」 | 橘色背景 |

---

## 4. 資料 / API 參考

### 節點與邊形狀
```ts
interface GraphNode {
  id: string;
  name: string;
  type: 'character' | 'location' | 'concept' | 'event';
  description?: string;
  chunkCount: number;
  eventType?: string;   // type === 'event' 時
  chapter?: number;     // type === 'event' 時
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  weight?: number;
  inferred?: boolean;
  confidence?: number;
  inferredId?: string;
}
```

### 相關 endpoints（完整定義見 `docs/API_CONTRACT.md`）
- `#9`  圖譜資料：`GET /books/:bookId/graph`（支援 `mode/position/include_inferred`）
- `#9b` 實體段落：`GET /books/:bookId/entities/:entityId/chunks`
- `#10a–d` 推斷關係：run / list / confirm / reject
- `#11` 事件詳情：`GET /books/:bookId/events/:eventId`
- `#12a–c` Timeline：config（GET/PUT）+ detect
- `#12d–e` Epistemic：classify-visibility + state

---

## 5. 必要保留（hard constraint）

- **互動模型**：三層右側面板「第三層切換時替換而非疊加」的規則
- **資料形狀**：節點與邊的 schema 不動（重設計 = 視覺與排版，非後端）
- **狀態持久化**：`graph:${bookId}:epistemic:*` localStorage key 不動
- **暖白底面板**：所有面板均為 `var(--bg-primary)`，`border-left: 1px solid var(--border)`
- **Token 制度**：禁止硬編碼色碼；新增 token 必須同步更新 `docs/DESIGN_TOKENS.md`

---

## 6. 可變更的設計面向

- 工具列佈局（垂直/水平、收合行為、icon 風格）
- 節點與邊的視覺語彙（顏色、形狀、邊樣式、selected/hover 微互動）
- 面板的進場/退場動畫、間距比例
- 統計徽章、縮放控制的位置與形態
- Empty / Error / Loading state 的呈現
- 推斷關係按鈕的視覺（狀態機要保留，但表現方式可改）
- TimelineControls 與 EpistemicOverlay 的群組方式

---

## 7. 效能與規模假設（待用戶確認）

- 預期節點數量上限：（例：500 / 2000 / 10000？影響是否需 cluster）
- 是否需 server-side filter（目前是前端 filter 全量資料）：
- 是否需要在大量節點時自動 simplify 視覺：

---

## 8. 開放問題（送 Claude Design 前先決定）

- [ ] 第 1 節痛點與情境是否填妥？
- [ ] 第 7 節效能假設是否填妥？
- [ ] 是否要同時提供 dark mode 設計，還是只做亮色四主題？
- [ ] 是否新增功能（例：mini-map、bookmark、節點 cluster）？若有請列出
- [ ] 行動裝置是否需考慮？（目前頁面是桌面導向）

---

## 9. 對應 UI_SPEC 與 API_CONTRACT 段落（直接引用，不重複內容）

- UI 規格細節：`docs/UI_SPEC.md` § 3.6（知識圖譜頁）
- API 規格：`docs/API_CONTRACT.md` § 9, 9b, 10a–d, 11, 12a–e
- Token 對照表：`docs/DESIGN_TOKENS.md`
