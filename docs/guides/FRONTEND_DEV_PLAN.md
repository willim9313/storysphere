# StorySphere 前端開發計劃（已完成）

> **⚠️ 本計劃已完成。**
> - Phase F-1 ~ F-5：初版前端建立（已完成）
> - 前端重構（2026-03-15）：對齊 `API_CONTRACT.md` + `UI_SPEC.md`，全面重寫
>   - 新導航：48px icon-only 左側 Sidebar + 書籍層級 Top Tab Nav
>   - 新路由：`/frameworks` 框架索引頁、`/books/:bookId` 書籍空間（含閱讀/分析/圖譜）
>   - 新 API 層：`books.ts`, `chapters.ts`, `chunks.ts`, `graph.ts`（取代舊 `documents/entities/paragraphs`）
>   - 新 UI：3 欄閱讀頁 + Bezier 曲線、深色詳情面板、Segment-based 實體高亮、5 步 Timeline
>   - 6 個頁面：書庫、上傳、閱讀、深度分析、知識圖譜、框架索引
>
> 後續開發請參考 `docs/API_CONTRACT.md` 和 `docs/UI_SPEC.md`。

## Context
後端已完整實作（FastAPI + WebSocket + LangGraph + 深度分析），前端尚未建立。
規格文件：`docs/FRONTEND_DEV_GUIDE.md`。本計劃分 5 個階段，由基礎到複雜逐步推進。

---

## 技術棧
- **框架**：React 18 + TypeScript（Vite 建置）
- **樣式**：Tailwind CSS（layout/spacing）+ CSS Variables（顏色/字體 token）
- **路由**：React Router v6
- **Server State**：TanStack Query v5
- **圖形引擎**：Cytoscape.js
- **圖示**：Lucide React

---

## 階段規劃

### Phase F-1：基礎設施 + 設計系統
**目標**：建立可運作的 shell，設計系統就位。

工作項目：
1. `frontend/` 目錄，Vite + React 18 + TypeScript 初始化
2. 安裝所有依賴（TanStack Query, React Router, Tailwind, Cytoscape, Lucide）
3. Google Fonts 引入（Libre Baskerville, Noto Sans TC, DM Sans）
4. `src/styles/tokens.css` — 所有 CSS variables（Light + Dark mode）
5. `ThemeContext` — dark mode 切換，掛 `data-theme` 到 `<html>`
6. `src/api/client.ts` — axios/fetch base URL + 所有 API 函數
7. `src/api/queryClient.ts` — TanStack Query QueryClient 設定
8. App shell：Layout 元件、Router 設定（5 條路由）

**驗收**：`npm run dev` 可啟動，路由可切換，dark mode 可切換，設計 token 套用正確。

---

### Phase F-2：首頁 + 上傳頁
**目標**：核心 onboarding 流程完整可用。

工作項目：
1. **首頁 `/`**
   - `BookCard` 元件：書名、章節數、狀態 badge、最後開啟時間
   - `useQuery(['books'])` 拉取書庫列表
   - 「上傳新書」入口按鈕
2. **上傳頁 `/upload`**
   - 拖曳 / 點擊上傳 PDF（`react-dropzone` 或原生）
   - `POST /books/upload` → 取得 taskId
   - `TaskProgressBar` 元件：細線進度條（2px）+ 階段文字
   - Polling：`useQuery(['tasks', taskId], refetchInterval: 2000)`
   - 完成後自動導向 `/books/:bookId`

**驗收**：可上傳 PDF，進度條更新，完成後跳轉。

---

### Phase F-3：閱讀頁
**目標**：核心閱讀體驗完整。

工作項目：
1. **版面**：左側固定寬度章節列表（可收合）+ 右側內容區
2. **章節列表**：`useQuery(['books', bookId, 'chapters'])` + 選中狀態
3. **Chunk 渲染**：
   - `useQuery(['books', bookId, 'chapters', chapterId, 'chunks'])`
   - `SegmentRenderer` 元件：根據 `Segment[]` 渲染純文字或 `<mark>` 高亮
   - 實體高亮 4 種類型對應 CSS variables
4. **關鍵字標籤**：每個 chunk 底部顯示 `keywords[]`
5. **「深度分析」觸發按鈕**：書籍 status !== 'analyzed' 時顯示 → 點擊後確認視窗（含 token 消耗提示）→ 呼叫 `POST /books/:bookId/analyze`

**驗收**：章節可切換，實體高亮顏色正確，深度分析可觸發並追蹤進度。

---

### Phase F-4：深度分析頁
**目標**：書籍層級深度分析結果可讀、可重新生成。

工作項目：
1. 書籍 status !== 'analyzed' 時顯示引導提示
2. 4 個分析區塊：角色 / 事件 / 時間軸 / 主題（各自 TanStack Query）
3. `AnalysisItemCard` 元件：
   - 顯示 Markdown 內容（`react-markdown`）
   - 「重新生成」按鈕 → 確認視窗 → `POST /regenerate` → polling loading 狀態
   - 重新生成期間該卡片顯示 loading，其他卡片維持可讀
4. 各條目獨立 taskId 管理

**驗收**：深度分析結果正確渲染，單一條目可重新生成不影響其他。

---

### Phase F-5：知識圖譜頁
**目標**：互動式知識圖譜完整可用。

工作項目：
1. Cytoscape.js 初始化：`toCytoscapeElements()` 轉換函數
2. 節點樣式：4 種類型顏色，大小根據 `chunkCount`（20px–60px）
3. 左側工具欄：搜尋欄 + 類型過濾 checkbox + 重置按鈕
4. 右側詳情面板（節點點擊展開）：
   - 實體基本資訊
   - 相關 chunks 列表（可展開原文）
   - 深度分析區塊（5 種狀態：未生成/生成中/已生成/清除重生成）
5. Dark mode 節點顏色自動調整

**驗收**：圖譜可渲染，節點點擊顯示詳情，實體深度分析可觸發與查看。

---

## 關鍵規範提醒
- Tailwind 只管 layout/spacing，顏色字體一律走 `var(--*)` CSS variables
- Dark mode：`data-theme="dark"` 掛在 `<html>`，不用 Tailwind class
- 所有 API 請求透過 TanStack Query，不在 component 內直接 fetch
- 知識圖譜允許不同視覺風格（工具感，不強制 Editorial 排版）

## 驗收（整體）
- 所有 5 條路由可正常訪問
- Light/Dark mode 切換正確套用所有 token
- PDF 上傳 → 閱讀 → 深度分析 → 圖譜 完整 end-to-end 流程可跑通（需後端配合）
