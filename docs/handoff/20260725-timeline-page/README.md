# 時間軸頁 UX 強化 — 交付包

日期：2026-07-25
交付對象：Claude Design

⚠️ 請掛在**既有的 StorySphere Claude Design 專案**下進行（token 系統、focus ring、
Warm/Ink 雙主題等契約已在該專案內），不要另開新專案。
設計完成後以 **`.dc.html` canvas** 交回，開發端依 canvas 實作（不依 prose 重新詮釋）。

配套計劃：`docs/plans/20260725-timeline-page-enhancements.md`（工程分期與成本，設計側不需讀完）
前一輪設計：`docs/plans/20260519-timeline-page-redesign.md`（V2，已落地為現況）

## 內容清單

| 檔案 | 說明 |
|------|------|
| `01-design-brief.md` | **需求書本體**：範圍、資料事實、狀態矩陣、5 項需求、約束、驗收清單 |
| `02-tokens.css` | 全站 design token（Warm `:root` + Ink `[data-theme="ink"]`）——硬約束 |
| `03-DESIGN_TOKENS.md` | token 對照表與使用說明 |
| `i18n/analysis.zh-TW.timeline.json` | 時間軸頁真實文案（`timeline.*` 子樹，45 個 key）；排版請用真字串，勿用 lorem ipsum |
| `sample-payloads/timeline-computed.json` | ⭐ **真實 #13a 回應**（62 事件 / 52 有 rank / 10 無 rank / 200 筆關係） |
| `sample-payloads/timeline-constructed.json` | ⚠️ **手工構造樣本**，見下 |
| `screenshots/` | 現況截圖 7 張（Warm 5 + Ink 2），皆為實跑時序計算後的畫面 |

## 兩份 payload 的差別（重要）

`timeline-computed.json` 是**真實資料**，但真實資料缺了這頁一半的視覺語言：

| 維度 | 真實資料 | 後果 |
|------|----------|------|
| `narrativeMode` | **62/62 全是 `present`** | 倒敘／預敘／並行樣式全部不出現 |
| `CAUSES` 關係 | **0 筆**（但有 199 筆 `before` 被丟棄） | 連線樣式全部不出現 |
| `location` | **0/62** | 篩選的地點分區整區隱藏 |
| Genette displacement | 覆蓋率 14.5% < 60% 門檻，**跑不起來** | 右側色帶與矩陣 Genette 著色不出現 |

`timeline-constructed.json` 就是為了補這四項而**手工注入**的（flashback×3 / flashforward×1 /
parallel×3 / location×21 / CAUSES×12 涵蓋三種 confidence 帶），檔內有 `_README` 欄位標示。

**設計這四類樣式時用 constructed，判斷真實畫面長相時用 computed。**
兩者的差異本身就是一個設計課題：見 brief §2.2–§2.4 與 §7.4。

## 給設計側的三個重點（詳見 brief）

1. **§4.0 工具列右半邊**是使用者主動提出的痛點；且**現況按鈕沒有邊框是 CSS bug 不是設計決策**
   （`.tl button` reset 蓋掉 `.tl-btn`），請直接重新決定，不必揣摩原本為什麼長這樣。
2. **§4.1b 橫向畫布八成是留白**、且看不出右邊還有 55 張卡——第一印象問題。
3. **§3 狀態矩陣 S1–S31**：這頁的狀態比表面上多，請逐格確認設計成立，
   特別是 S5（無 rank）、S18（篩選結果為空，現況未定義）、S21（八成事件未分析）。
