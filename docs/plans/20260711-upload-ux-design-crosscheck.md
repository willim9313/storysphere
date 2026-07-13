# 上傳流程重設計 — Claude Design 交付 vs 需求書 核對

日期：2026-07-11（實作完成 2026-07-12）
來源設計：Claude Design 專案 `UI redesign planning` / `Upload Flow Redesign.dc.html`
核對對象：`20260711-upload-ux-design-brief.md`（需求書）＋ `frontend/src/styles/tokens.css`（真實 token）

## 實作狀態（2026-07-12 完成）

分 6 階段實作，逐階段 commit：

- **Phase A**（Toast 基礎設施）：`ToastContext` + `ToastHost` + `useTaskNotifications`（掛 AppLayout）
- **Phase B+C**（running 卡升級 + 卡態）：`MurmurWindow` entity pills、`ProcessingCard`
  已耗時時鐘、partial 內嵌重跑、awaiting/partial/done 卡態對齊（awaiting 由 entity-con
  改 color-warning，修正 Ink 主題卡在粉紅的問題）
- **Phase D**（表單/佇列）：`DropZone` 多檔、佇列列表、同名前置警告、語系 badge、error 重試帶 metadata
- **Phase E**（任務中心）：**現行 `TaskCenter`/`TaskRow` 已完整符合 design，無需異動**
- **Phase F**（審閱頁）：**現行 `ChapterReviewPage` 已具 canvas 全部結構（脊/合併/切分/角色/AI 邊界），
  只做外觀對齊即可；glossary 維持既有 overlay popover（刻意不推動閱讀流），視為已對齊**
- 吉祥物欄暫略 → BACKLOG B-058；ETA 縮減為已耗時 → 後端 P3 不做

## 總結

設計高度貼合需求書：9 項需求中 **7 項完整交付**、2 項部分交付（皆為合理縮減），
另有 **1 項淨新增**（系統吉祥物佔位，資產待補）。token 詞彙與真實 tokens.css
近乎 1:1，唯一需轉譯的是 entity 命名（全名→縮寫）。

## Token 核對（實作成敗關鍵）

設計師的 design system（`colors_and_type.css`）與我們的 `tokens.css` 是同一套
"v2 Ink on Paper"，值完全一致。canvas 用到的 shape token 全部存在：
`--card-radius / --card-border-width / --card-shadow / --btn-radius / --pill-radius /
--pill-border-width / --badge-radius / --control-radius / --border-style`、
`--radius-sm|md|lg`、`--shadow-lg`、`--transition-normal`、`--color-{success,warning,error,info}(-bg)`、
`--focus-ring-*` — 皆可直接 `var(--*)` 取用。

**唯一轉譯點 — entity 命名**：canvas 用全名，repo 用縮寫。實作 murmur pill 時對照：

| canvas（全名） | repo token（縮寫） |
|---|---|
| `--entity-character-*` | `--entity-char-*` |
| `--entity-location-*` | `--entity-loc-*` |
| `--entity-organization-*` | `--entity-org-*` |
| `--entity-event-*` | `--entity-evt-*` |
| `--entity-object-*` | `--entity-obj-*` |
| `--entity-concept-*` | `--entity-con-*` |
| `--entity-other-*` | `--entity-other-*` |

註：現行 `MurmurWindow` 把 murmur type `event` 誤映到 `--entity-con-dot`；canvas 的
`mapMurmur` 正確映到 `event`→`evt`、`org`→`org`。實作時採 canvas 的正確映射。

## 逐項核對

| # | 需求 | 交付狀態 |
|---|------|---------|
| 3.1 | Partial 卡片一鍵重跑【高】 | ✅ 完整。每失敗步驟一列 + 重跑/再試 + loading；符號探索首次重跑再失敗示範重試；重跑推「排入任務中心」toast |
| 3.2 | 全域 toast 系統【高】 | ✅ 完整。success/warning/error/info 四型 + 左 3px 色條 + 行動鈕 + 滑入(tSlide) + 任務轉態觸發。瀏覽器 Notification API（選配）未設計——可接受 |
| 3.3 | 已耗時 + 粗略 ETA【中】 | ⚠️ 縮減為「已耗時」（每秒累加 mm:ss），**未做 ETA**。建議接受：LLM 任務 ETA 不可靠。→ 後端 P3（步驟時間戳）**不需做** |
| 3.4 | 書名重複前置警告【中】 | ✅ 完整。表單 input 即時比對書庫，命中顯示 warning（不擋送出）；完成卡另保留同名細條 |
| 3.5 | 失敗任務快速重試【中】 | ✅ 完整。error 卡「重試 · 沿用原書名/作者，只需重新選檔」 |
| 3.6 | 審閱頁操作效率【中】 | ⚠️ **未設計新功能**。canvas 審閱頁 ≈ 現行頁 + 玻璃詞卡；鍵盤快捷／「只看非正文」過濾／通用 undo／分章骨架**皆未出現**。現行審閱頁已具備脊/合併/切分/角色/AI 邊界 |
| 3.7 | 語言偵測結果回饋【低】 | ✅ 完整。「已自動偵測：中文 · 可修改」badge，手動改動後消失 |
| 3.8 | 多檔排隊上傳【低】 | ✅ 完整。佇列卡列 + 逐檔移除 + 佇列→表單推進 |
| 3.9 | Murmur 自動捲動（約束） | ✅ 遵守。`componentDidUpdate` 恆捲到底、無暫停控制 |

**約束**：token 全走 var()✅ / Warm+Ink 雙淺主題✅ / zh 為主✅ / 輪詢非 push✅。

## 淨新增（需求書未列）

- **系統吉祥物佔位**：running 卡改為 3 欄 grid（200px 時間軸 / 1fr murmur / 134px 吉祥物）。
  第 3 欄是「裝飾性動態角色」（GIF/Lottie），**非進度指示器**，資產**待設計補齊**。
  canvas 內為 112×150 虛線斜紋佔位框標「mascot.gif」。
- running 卡升級：真正的垂直 stepper（含連接線）＋ header 已耗時時鐘 ＋ 卡底 2px 進度條。
- compact 時間軸 / compact 佇列為未定稿變體（定稿＝vertical + cards），實作只做定稿。

## 實作建議（我的預設判斷，待你裁定）

1. **吉祥物**：資產未到，且不在原需求。建議 running 卡先做 時間軸 + murmur 兩欄
   （沿用現版佈局但升級 stepper/pills/已耗時），**吉祥物欄暫略**，資產到齊再補（記 BACKLOG）。
   若你要先放佔位框亦可，但生產環境放「mascot.gif」虛線框不妥。
2. **審閱頁 3.6**：canvas 未設計新效率功能，現行頁已約 90% 到位。建議本輪只做審閱頁
   **外觀對齊**（玻璃詞卡改內嵌），鍵盤/過濾/undo/骨架這些**淨新增功能延後另設計**
   （避免實作未經設計的 UX）。
3. **後端**：P1（分章載入）非本輪必需（審閱頁沿用現行整本載入即可）；P3（ETA 時間戳）
   因 3.3 縮減為已耗時而**不需做**；P2（phase1 sub-progress）與本輪無關，維持 BACKLOG。
