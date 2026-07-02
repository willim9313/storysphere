# UX 改善清單（前端全站巡檢）

日期：2026-07-02
來源：重構完成後前端全站巡檢（Library → Reader → 角色分析 → 知識圖譜 → 時間軸 → 張力分析 → 上傳，含窄螢幕）
Console 狀態：0 errors；warnings 為 React Router v7 flag（無害）與 cytoscape font-family invalid（見項目 3）。

---

## 設計決策紀錄

**知識圖譜維持「全部節點一次攤開」**，不做預設隱藏節點的聚焦模式。
理由：使用者要的是全局星圖感。毛球（hairball）的成因不是節點多，而是 **node label + edge label 常駐、互相疊字**。
解法對齊 Obsidian：**節點文字跟隨縮放漸顯；關係文字預設不畫，hover / 選中節點時才顯示。**

實作槓桿：cytoscape 內建 `min-zoomed-font-size`（縮放後有效字級小於門檻即不畫 label），不需自行監聽 zoom 事件。

---

## 修改清單（依優先序）

### 知識圖譜（本次實作）
1. **節點 label 加 `min-zoomed-font-size`** — 縮放拉遠是純星圖，拉近逐漸浮現名字。
2. **邊的關係 label 預設隱藏** — 改為 hover / 選中節點才顯示（selection 已有 `.highlighted` 機制可複用；hover 另加 `.label-visible` class）。
3. **修 cytoscape `font-family` invalid warning** — cytoscape 的 font-family regex 不接受單引號 `'`；在 graph config 內去除 font 字串的引號即可，不動全站 token。

### Reader（後續）
4. 內文實體標註預設改為輕量標記（底線 / 變色），hover 才出色塊。
5. 頂部加「標註密度」開關（全開 / 只主要角色 / 關）＝純閱讀模式。

### 導覽 / 版型（後續）
6. 左側欄改可展開（hover 或釘選顯示中文標籤），取代慢速原生 title tooltip。
7. 窄螢幕頂部書籍分頁列改橫向可滑動 / 收「更多」下拉。
8. Reader 三欄在窄螢幕的降級行為。

### 打磨（後續）
9. 「研究者導覽」橫幅關閉狀態記到 localStorage。
10. 未選取時的右側空面板放近期分析 / 建議入口。
11. 需跑 LLM 的按鈕（重新計算時序、張力 Step 1）標示耗時提示。

---

## 已做得好、值得複製的地方
- 暖色系主題一致、有辨識度。
- 張力分析空狀態（三步 pipeline stepper + 說明卡）是最佳 onboarding 範例，值得複製到圖譜與時間軸。
- 角色詳情頁資訊層級清晰（人物概覽 / 語音風格 / 認知狀態 + Jung 原型信心度條）。
