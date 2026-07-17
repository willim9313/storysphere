# 角色分析頁翻新 — 交付包

日期:2026-07-16
交付對象:Claude Design
⚠️ 請掛在**既有的 StorySphere Claude Design 專案**下進行(v2 設計契約:
focus ring、splash tokens、7-type legend 等已在該專案內),不要另開新專案。
設計完成後以 **`.dc.html` canvas** 交回。

## 內容清單

| 檔案 | 說明 |
|------|------|
| `01-design-brief.md` | 需求書本體:6 組設計需求(A–F)、約束、資料現況 |
| `02-tokens.css` | 全站 design token 實作(Warm `:root` + Ink `[data-theme="ink"]`)——硬約束 |
| `03-DESIGN_TOKENS.md` | token 對照表與使用說明 |
| `04-UI_SPEC.md` | 現行 UI 規格全文(角色分析頁見 §3.4;重設計後此文件會回寫) |
| `i18n/` | 實際文案:`analysis.zh-TW.json`(主要)、`analysis.en.json`、`common.zh-TW.json`。排版請用真實字串,勿用 lorem ipsum |
| `sample-payloads/` | 真實 API 回應 JSON(camelCase,非手寫),設計資料狀態時以此為準 |

> **本包刻意不含現況截圖**(2026-07-17 決定):本次為整頁重新設計,舊畫面會
> 變成視覺錨點、限縮設計自由度。現況僅以 `04-UI_SPEC.md` §3.4 的文字規格
> 描述——該規格供理解**功能與資料結構**,不約束新視覺。

## 給設計側的已知現象/注意事項

1. **主題只有 Warm 與 Ink 兩套,皆為淺底,沒有深色主題**。
2. payload 裡的 `chapterCount: 0` 是已確認的後端缺陷,設計時
   以修復後的真實提及數為準(量級:寇仲 1002、徐子陵 701、宇文化及 225)。
3. `epistemic-state-ch7.json`(123KB)是單一角色在最末章游標下的真實事件量
   分布——已知/未知各數十筆、同章大量群聚,聚合與分組設計以此為準。
4. `factions.json` 為 F-16 派系偵測真實輸出:10 個派系 + 派系間 cooperation
   / rivalry 分數 + `unaffiliatedNames`;`label` 欄位是「Faction N」佔位字串,
   前端顯示時以 `topMemberNames` 組稱呼(如「寇仲、徐子陵 等 12 人」),設計
   時派系卡命名請以此為前提,不要假設有語意化派系名。另外 **66/99 位角色無
   派系歸屬**(`unaffiliatedNames`)——「其他」組是最大宗,需預設收合。
5. 語音 tab 為 lazy 生成(GET 即觸發 LLM 計算),故未附 payload;其內容版型
   不在本次範圍,只有空狀態會被總覽/導航動線影響。
6. 生成流程為 task polling(2 秒),生成中 checklist(需求 F)沿用符號頁
   `InterpretationGenerating` 模式即可。

## Payload 檔案

| 檔案 | 端點 | 用途 |
|------|------|------|
| `characters-list.json` | #6a `GET /books/:id/analysis/characters` | 左清單與總覽資料(`content` = 角色一句話摘要) |
| `entity-analysis.json` | #7a `GET /books/:id/entities/:eid/analysis` | 詳情頁全部欄位(archetypes/cep/arc),宇文化及 |
| `epistemic-state-ch7.json` | #12e `GET /books/:id/entities/:eid/epistemic-state?up_to_chapter=7` | 認知狀態事件量與欄位 |
| `factions.json` | #6d `GET /books/:id/analysis/factions` | 派系分群(總覽層級三) |
