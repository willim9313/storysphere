# 前端全頁面設計 Review — Design System 偏離與優化清單

> 產出日期：2026-06-13
> 範圍：`frontend/src/pages/` 全 16 頁 + 共用元件，比對 `tokens.css` / `DESIGN_TOKENS.md` / `UI_SPEC.md`

---

## 實作進度（更新 2026-06-13）

| 項目 | 狀態 | Commit / 備註 |
|------|------|--------------|
| A 區 #1–#4（StatusBadge/ErrorMessage/ClassifyVisibilityButton/EntityDetailPanel token 偏離） | ✅ 完成 | `8a4e370` |
| A 區 #5（GraphPage cytoscape epistemic-dim 主題化） | ✅ 完成 | `a813f55` |
| C-i18n（LibraryPage 3 條寫死中文） | ✅ 完成 | `303586c` |
| B2（新增 `--accent-fg`，取代 on-accent `#fff`） | ✅ 完成 | `081dcac` |
| B1（字級收斂到 scale，方向 = 7 階 + 底階 11px） | ✅ 完成 | `cd501b2` / `58aac81` / `b88e722`；map 見 [20260613-b1-font-size-scale-snap.md](20260613-b1-font-size-scale-snap.md) |
| B4（共用 EmptyState/Skeleton） | ⛔ 跳過 | 深查後發現各頁 `*-empty` 實為 error/loading/CTA 多載狀態、**且全部正確使用 token（無 DS 偏離）**；抽元件只買 DRY 卻有回歸風險，決議不做 |
| B3（RWD） | ⏸ 擱置 | 維持 desktop-only |

> ⚠️ B1 為視覺重設計（半階壓平、字級統一），需在 **4 主題 × 主要頁面**目測確認密集面板無換行/溢出。

---

## 總體評估

Token 系統設計完整（4 主題、語意分層、B&W 主題用「填充極性 / 灰階梯度」取代色相）。
主要問題**不在 token 設計，而在執行面的洩漏**：少數元件繞過 token 直接寫死色碼，在 default 主題看不出來，
切到 manuscript / minimal-ink / pulp 就破壞嚴格灰階。其次是兩個系統性一致性債（字級 token 幾乎未被使用、缺共用狀態元件）。

---

## A. Design System 偏離（會破壞主題的真錯誤，優先）

| # | 位置 | 問題 | 修法 | 嚴重度 |
|---|------|------|------|--------|
| 1 | `components/library/StatusBadge.tsx:5-8` | 狀態色寫死成彩色 map（`#dcfce7`/`#166534`…），完全不吃主題；B&W 三主題下書庫卡片冒出綠/藍/黃/紅徽章 | 改用 `--color-success-bg/-fg`、`--color-info-*`、`--color-warning-*`、`--color-error-*` | 🔴 高 |
| 2 | `components/graph/EntityDetailPanel.tsx:232,233,270` | 用 `var(--danger, #e53e3e)`，但 `--danger` token 不存在 → 永遠 fallback 紅色（同時是潛在 bug） | 換 `--color-error` | 🔴 高 |
| 3 | `components/ui/ErrorMessage.tsx:8` | 共用錯誤元件背景寫死 `#fff1f2`，全站共用、影響面大 | 換 `--color-error-bg` | 🟠 中高 |
| 4 | `components/epistemic/ClassifyVisibilityButton.tsx:46,81` | 直接 `color:'#16a34a'` / `'#dc2626'`，無 var | 換 `--color-success` / `--color-error` | 🟠 中 |
| 5 | `pages/GraphPage.tsx:208-212` | Cytoscape dimmed 節點寫死 `#e5e7eb`/`#9ca3af`；其他圖譜色都用 `getComputedStyle` 讀 token，唯獨這裡不一致 | 改由 `getComputedStyle` 讀對應 token（如 `--fg-muted` / `--border`） | 🟠 中 |

> 容許範圍（可不改）：`search.css` / `build-overview.css` / `global.css` 內的 `#000`/`#fff` 多在
> `[data-theme="pulp/manuscript"]` 區塊當紋理/陰影，符合 DESIGN_TOKENS §4「元件層差異」。
> 若要極致一致可抽 token，低優先。

---

## B. 系統性一致性債

### B1. 字級 token 形同虛設
- 定義了 `--font-size-xs~3xl` 一整套 scale，但全站有 **147 處** inline `fontSize: 11 / 13 / ...`
  （集中於 `narrative/PlotSpine.tsx`、`graph/*`、`narrative/*`）。
- 連 `global.css` 共用元件（`.pill`、`.ss-*`）都直接寫 `font-size: 10px/11px/12px/13px`。
- 這些 10/11/13 甚至不在 scale 上（scale 為 12/14/16…），等於字級沒有單一真實來源。
- **建議**：補 `--font-size-2xs`(~11px) 等小級距，逐步把 inline 數字收斂回 token。

### B2. `color: white` / `#fff` 散落在 accent 底上
- `.btn-primary`、`pages/LibraryPage.tsx:177`、`.st-seg-btn.active`、`.tl-btn-*` 等。
- 目前能動是因 4 主題的 `--accent` 皆深色 → 隱性耦合；加淺色 accent 主題就會破。
- **建議**：定義 `--accent-fg` token（現值 `#fff`）統一引用。

### B3. 缺 RWD（**已決策擱置**）
- 全站 CSS 僅 1 個 `@media`（methodology.css）；Sidebar 固定 48px、頁面多固定 grid / `h-screen`。
- 決策：維持 desktop-only，暫不處理。建議日後於 UI_SPEC 明文標註定位。

### B4. 缺共用狀態元件
- `components/ui/` 只有 `LoadingSpinner`、`ErrorMessage`，**無 Empty / Skeleton**。
- 各頁自刻空狀態（各頁 empty 處理數從 0 到 20 不等），視覺與文案不一致。
- **建議**：抽 `<EmptyState icon title hint action>` 與 skeleton 版型。

### B5. Loading 體驗
- 頁面普遍 `if (isLoading) return <LoadingSpinner/>`（整頁 block + 版面跳動），非骨架屏。
- 對 GraphPage / TimelinePage 等重頁面體感較差。

---

## C. 個別頁面 / 結構

- **i18n 漏網**：`pages/LibraryPage.tsx:81,91,100` 的 `'等待章節審閱'`、`'審閱章節 →'`、`'查看進度 →'`
  為寫死中文，但同檔已 `useTranslation('library')`，其餘全站走 i18n。
- **巨型頁面元件**：`TimelinePage.tsx` 1944 行、`BuildOverviewPage.tsx` 958、`GraphPage.tsx` 899。
  非樣式問題但維護性風險，建議後續拆 sub-component。

---

## 建議優先序

1. **A 區（1–5）**：唯一會實際破壞主題的，純色碼替換、不動版面、無 API 變動，工作量小收益明確。
2. **B4 / B5**（共用 Empty/Skeleton）+ **C 的 i18n 漏網**。
3. **B1**（字級 token 收斂）作為漸進重構。
4. **B2**（`--accent-fg`）順手可做。
5. B3（RWD）已擱置。

---

## 實作備註（未來動工時）

- A 區為純色碼替換，**不觸發 API_CONTRACT**；DoD 需跑 `cd frontend && npm run lint`。
- 若補新 token（B1/B2）→ 必須同步更新 `docs/DESIGN_TOKENS.md` 對照表（CLAUDE.md 主題系統紀律）。
- 動工前先列 checkpoint（影響檔案清單）。
