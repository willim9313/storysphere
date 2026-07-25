# 事件分析頁 UX 重設計 v2 — 交付包

日期：2026-07-22
交付對象：Claude Design
⚠️ 請掛在**既有的 StorySphere Claude Design 專案**下進行（token 系統、focus ring、
7-type legend、Warm/Ink 雙主題等契約已在該專案內），不要另開新專案。
設計完成後以 **`.dc.html` canvas** 交回，開發端依 canvas 實作（不依 prose 重新詮釋）。

配套計劃：`docs/plans/20260722-event-analysis-redesign-v2.md`
前一版設計：v1 已落地為現況（見計劃 §1 現況快照）。

## 內容清單

| 檔案 | 說明 |
|------|------|
| `01-design-brief.md` | 需求書本體：範圍、6 項需求、約束、驗收清單 |
| `02-tokens.css` | 全站 design token 實作（Warm `:root` + Ink `[data-theme="ink"]`）——硬約束 |
| `03-DESIGN_TOKENS.md` | token 對照表與使用說明 |
| `i18n/analysis.zh-TW.json` | 事件分析頁真實文案（主要）；排版請用真字串，勿用 lorem ipsum |
| `i18n/common.zh-TW.json` | 共用文案 |
| `sample-payloads/eep-complete.json` | 真實完整 EEP 回應；設計詳情頁以此為資料事實 |
| `sample-payloads/event-list.json` | 清單回應（analyzed/unanalyzed 各數筆） |
| `screenshots/` | 現況截圖（見下） |

## 截圖對照（現況，Warm 為主）

| 檔案 | 內容 |
|------|------|
| `ea-warm-detail-01.png` | 左清單（已分析/未分析分組）+ 詳情頂部：標題列、主題意義+摘要 hero、前後狀態 |
| `ea-warm-detail-02.png` | 參與角色卡片（發起者/行動者/受益者）+ 因果分析（根本原因 + 階梯因果鏈）起始 |
| `ea-warm-detail-03.png` | 影響分析（雙欄：對參與者 / 關係變化）+ 因果因素與後果 |
| `ea-warm-detail-04.png` | 因果因素/後果 + 關鍵引言 |
| `ea-ink-detail-01.png` | Ink 主題現況（同一事件） |

## 藍本截圖（角色分析頁——請比照補上事件版總覽落地頁）

| 檔案 | 內容 |
|------|------|
| `ca-overview-warm.png` | **角色頁總覽落地頁（要複製的模式）**：標題「角色群像」+ 統計（99 位 · 已分析 6 · 未分析 93）+ 批次入口（前 10 位/全部）+ 雙視圖切換（定位象限/提及量排行）+ 象限地圖 + 派系圖例 + 頂部研究者導覽 banner |
| `ca-overview-ranking-warm.png` | 同頁的「提及量排行」視圖：#1 主角卡 + 排序長條 + 未分析者就地「生成分析」 |

> 事件頁目前**沒有**這種落地頁（進頁只有被動的「選擇一個事件」）。brief §3.0 要補的就是
> 事件版對應物：象限地圖 → 「章節 × 重要度」故事骨幹圖；排行 → 依章節/重要度排序。

## 給設計側的已知現象／注意事項

0. **（本次修改重點）事件頁缺總覽落地頁**：進頁只有被動的「選擇一個事件」空狀態，
   使用者不知道能做什麼。角色頁已用 `CharacterOverviewLanding` 解決（見上方藍本截圖）——
   請比照補上事件版總覽（brief §3.0，優先序最高）。清單組織與跨事件因果流收攏進此落地頁。
1. **主題只有 Warm 與 Ink 兩套，皆為淺底，沒有深色主題**；兩套下皆需成立。
   **響應式/窄螢幕不在範疇**（固定雙欄 260px + 內容區）。
2. **本次重設計核心是「呈現既有但被埋沒的資料」**，不是加後端欄位：
   - 清單每筆已有 `chapter` / `importance`(KERNEL/SATELLITE) / `narrativeMode`，
     但現況清單只按「已分析/未分析」兩組平鋪，無章節分組、無篩選、無排序。
   - 詳情 `eep` 已含 **`priorEventIds` / `subsequentEventIds`**——跨事件因果流（brief §3.5）
     可直接用這兩欄，無須動後端。
3. **角色配色語意待重訂**：現況把 `beneficiary`（受益者）歸到 witness 色桶（語意錯）；
   角色列舉見 `sample-payloads/eep-complete.json` 的 `participantRoles[].role`。
4. **任務為 2 秒輪詢，無 push**；生成中以 stage chip + 進度呈現（現況已有，可沿用其資料）。
5. 批次「一鍵生成全部 EEP」現況為全有全無、無 ETA；brief §3.3 要子集 + 粗略耗時。
6. 詳情各 section 在資料為空時**整段不渲染**（非顯示空狀態）——設計時以有資料為主，
   但 `status: partial` 時個別 section 會顯示「該維度分析失敗」的降級態，需保留。
