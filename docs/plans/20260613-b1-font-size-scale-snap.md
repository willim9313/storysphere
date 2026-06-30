# B1 — 字級收斂到 7 階 scale（視覺重設計）規劃

> 產出日期：2026-06-13
> 來源：前端設計 review（`docs/plans/20260613-frontend-design-review.md`）B1 項
> 取向決策：**收斂到現有 7 階 `--font-size-*` scale**（snap 半階/零散值），接受全站文字密度的視覺變化。
> 狀態：**待確認 map 後實作**（尚未動工）。

---

## 背景

現有 token scale（`tokens.css`）：

| token | rem | px |
|-------|-----|----|
| `--font-size-xs`   | 0.75rem  | 12 |
| `--font-size-sm`   | 0.875rem | 14 |
| `--font-size-base` | 1rem     | 16 |
| `--font-size-lg`   | 1.125rem | 18 |
| `--font-size-xl`   | 1.25rem  | 20 |
| `--font-size-2xl`  | 1.5rem   | 24 |
| `--font-size-3xl`  | 2rem     | 32 |

全站實際 font-size 約 **600 處 / 26 種尺寸**，且最小 token 是 12px，但**最常用的是 11px、10px（比 xs 還小）**。

---

## Snapping Map（四捨五入到最近 token，平手進位到較大階）

| 原始 px（出現次數） | → token | px 變化 |
|---|---|---|
| 8(3), 9(15), 9.5(11), 10(103), 10.5(27), 11(127), 11.5(19), 12(79), 12.5(23) | `--font-size-xs` | **→12** |
| 13(61), 13.5(11), 14(23) | `--font-size-sm` | →14 |
| 15(1), 16(15), 17(3) | `--font-size-base` | →16 |
| 18(10), 19(1) | `--font-size-lg` | →18 |
| 20(4), 22(10) | `--font-size-xl` | →20 / 22→20 |
| 24(1), 25(2), 26(3), 28(5) | `--font-size-2xl` | →24 / 28→24 |
| 32(1), 36(1), 44(1) | `--font-size-3xl` | →32 |

---

## ⚠️ 必須先確認的硬後果

**最大衝擊：10px / 11px → 12px，共約 230 處變大。**

這些 10–11px 文字集中在**最密集的元件**：
- `.pill`（10px）、`.kw-tag`（10px）、`.ss-log-key`（10px）、`.ss-step-sub`（11px）、`.ss-stat-label`（11px）
- graph / narrative / timeline 的 badge、chip、label、caption
- 各種 mono key、density strip、mini-chip

把它們從 10–11px 拉到 12px 會：
1. **整體變大、留白被吃掉**，密集面板（pill 群、chip bar、log）可能換行或溢出
2. 部分 1–2px 的精緻層級差（10 vs 11 vs 12）會被**壓平成同一級**，失去原本的視覺階層
3. 無法用 diff review 驗證 → 需你在 4 個主題 × 主要頁面**目測**

> 根因：這個 7 階 scale 的最小階是 12px，但本 app 是高密度分析工具，原生語彙就是 10–11px。strict 7 階與現況不相容，必上即下。

---

## 兩條路（請擇一）

- **A. 嚴格 7 階**（你已選的方向）：照上表全 snap，接受 230 處變大與密度重設計。token 最乾淨。
- **B. 7 階 + 1 個底階**（折衷，保密度）：新增 `--font-size-2xs = 0.6875rem (11px)`，把 8–11.x → 11px、12/12.5 → 12px(xs)，其餘同上表。**幾乎不改密度**（10→11 僅 +1px、11 不變），token 仍精簡（多 1 個）。這是「收斂到 scale」但不犧牲現有密度的版本。

---

## 實作方式（map 確認後）

- 分批掃描，避免單一巨型 diff：
  1. **批 1**：`tokens.css` 補階（若選 B）+ `global.css` 共用元件（`.pill`/`.kw-tag`/`.ss-*`）
  2. **批 2**：inline `fontSize:` 的 tsx（~147 處，集中 narrative/graph）
  3. **批 3**：各頁 CSS（character/event/symbols/tension/timeline/...）
- 每批：subagent 實作 → diff review → commit。
- CSS 改 token → 同步 `DESIGN_TOKENS.md`（若選 B 需新增 `--font-size-2xs` 列；本 doc 的字級表目前未在 DESIGN_TOKENS，順帶補一節 §3.x 字級對照）。
- 每批後請你目測對應頁面（4 主題）。

---

## 建議

我**推薦 B（7 階 + 1 底階 11px）**：它同樣達成「收斂到 scale、單一來源」的目標，但避免把 app 兩個最常用尺寸強拉變大、避免壓平精緻層級、回歸風險低得多。若你仍要 strict 7 階（A），我照辦，但請預期密集頁面需要事後微調。
