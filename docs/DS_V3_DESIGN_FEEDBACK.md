# DS v3 落地回饋 —— 待同步回設計端的清單

**用途**：DS v3（B-126）實作時發現的設計遺漏、稿與稿之間的矛盾、以及工程端代為裁決的地方。
定期整理後 sync 回 Claude Design，讓設計端**認可現行做法就寫進稿，不認可就給定案**，我們再拉回對齊。

**與 `docs/plans/` 的分工**：plans 是規劃當下的凍結快照；這份是**持續更新**的活清單，每條同步後改狀態，不刪。

**每條必填**：出處（handoff 批次＋檔案路徑＋稿上哪一區）、問題、目前的處置、要設計端做什麼。

**狀態**：`待同步` → `已同步`（記日期）→ `設計已回覆`（記結論與是否需要回頭改實作）

---

## 第 0 批 · 基礎外框＋共通控制項

| # | 類型 | 狀態 |
|---|------|------|
| 0-A | 遺漏 · 角色頁批次失敗清單沒有位置 | 待同步 |
| 0-B | 矛盾 · Toast 左邊框 | 待同步 |
| 0-C | 矛盾 · Toast error 圖示 | 待同步 |
| 0-D | 矛盾 · Toast 行動鈕「→」 | 待同步 |
| 0-E | 遺漏 · 批次有失敗時 toast 的類型 | 待同步 |
| 0-F | 易誤讀 · 對話框規格卡的成本提示是註解 | 待同步 |
| 0-G | 矛盾 · Splash 濃度兩組值 | 待同步 |
| 0-H | 缺陷 · kit 的 transition 寫法無效 | 待同步 |
| 0-I | 遺漏 · 浮動軌 R2 對「多則 toast 堆疊」沒定義 | 待同步 |
| 0-J | 遺漏 · 「泡泡在軌」沒有判準 | 待同步 |
| 0-K | 矛盾 · 側欄浮層「hover 展開」與「tooltip 是收合態唯一標籤」互斥 | 待同步 |
| 0-L | 缺陷 · 書籍群格子的 hover／active 底色與群底同色 | 待同步 |
| 0-M | 遺漏 · 矮視窗溢出選單沒畫 | 待同步 |
| 0-N | 矛盾 · 任務中心的幾個尺寸與 Ink 陰影 | 待同步 |
| 0-O | 矛盾 · 聊天新對話確認的遮罩值 | 待同步 |
| 0-P | 矛盾 · 聊天輸入框與共用輸入框規格不同 | 待同步 |

### 0-A 角色頁批次失敗清單沒有位置

- **出處**：`design/決議紀錄/17 全域外框 Chrome 決議紀錄.dc.html` D 區規則 T4；`specs/04-global-chrome/spec-function.md` §4.8 T4
- **問題**：T4 規定「失敗清單一律進常駐面板，角色頁的 BatchFailureList 從 toast 內移出，收斂到事件頁的做法」。
  但事件頁的常駐面板是左欄頂端的批次面板（`BatchEepPanel`），**角色頁沒有這個面板**，稿上也沒畫角色頁要放哪。
  角色頁本身的 09 稿在 T4 定案之前，畫的還是「清單在 toast 裡」。
- **目前處置**（2026-10-01 使用者裁決）：放在角色頁**左欄最上方**、「分析框架」之上；只在批次跑完且有失敗時出現，
  內容為既有字串「批次角色分析完成」＋失敗清單＋「關閉」，手動關閉。沿用事件頁面板的樣式（`.ea-batch`）。
- **請設計端**：在 09 稿（第 3 批）畫出這個面板；確認位置與內容，或給定案。

### 0-B Toast 左邊框：決議紀錄與規格卡衝突

- **出處**：
  - `ds-cards/preview/components-toast.html`：「status carried by a 26px icon disc — **never a left-border accent**」
  - `README.md` §1.5：「以顏色＋圖示形狀雙重編碼，**不用左邊框**」
  - 但 `design/決議紀錄/17 …決議紀錄.dc.html` **D 區畫的 toast 仍有左緣 3px 色條**；同檔 **H 區（Ink 差異表）**「Toast · 左緣 3px + 圖示徽章」也還這樣寫
  - `specs/04-global-chrome/spec-function.md` §4.4 也寫「左緣 3px 實色」
- **目前處置**：依規格卡與 README，**不做左邊框**。
- **請設計端**：把 17 決議紀錄 D 區的圖、H 區表格、spec-function §4.4 改成與規格卡一致。

### 0-C Toast error 圖示：三處三種

- **出處**：規格卡 `components-toast.html` 的 error 用**三角驚嘆號**（與 warning 同形）；README §1.5 列「check／triangle-alert／info」三形；
  17 決議紀錄 H 區與 spec-function §4.4 寫 error = **XCircle**。
- **目前處置**：依規格卡，error 用 `TriangleAlert`。
- **請設計端**：確認 error 與 warning 共用三角形是刻意的（Ink 下兩者同色，只剩標題文字區分）；或改回 XCircle 並更新規格卡。

### 0-D Toast 行動鈕的「→」

- **出處**：規格卡 `components-toast.html` 的行動鈕**沒有箭頭**（「前往書籍頁」）；README §1.5 與 spec-function §4.5 寫「標籤後固定補 →」。
- **目前處置**：依 README，**保留「→」**（既有行為，由元件補，不在字串裡）。
- **請設計端**：二選一並統一規格卡與 README。

### 0-E 批次有失敗時 toast 的類型

- **出處**：17 決議紀錄 D 區 T4 表格「批次完成 · 有失敗 → toast＋面板，persist」——只定了生命週期，**沒定類型**。
- **目前處置**：有失敗用 **warning**，無失敗用 success。依據是 spec-function §4.6 第 1 條「partial 是 warning 不是 success」的類推。
  舊頁內 toast 不論有無失敗都是綠色勾勾。
- **請設計端**：確認。

### 0-F 對話框規格卡的成本提示是註解，容易被讀成產品元素

- **出處**：`ds-cards/preview/components-dialog.html`，Warm／Ink 兩欄對話框按鈕列最左側的灰字「會呼叫 LLM，消耗 token」；
  README §2.5「成本提示放在按鈕列左側，2xs muted」。
- **問題**：使用者裁決那是**卡片註解，不是產品元素**（2026-10-01）。但稿上它畫在對話框裡、README 也當成規格寫，工程端會照做。
- **目前處置**：不做。
- **請設計端**：把註解移出對話框本體（或明確標示為註解），並修正 README §2.5 的寫法。

### 0-G Splash 濃度兩組值

- **出處**：17 決議紀錄 A 區寫 Warm 0.22 + `sepia(0.15) contrast(0.95)`、Ink 0.10 + `grayscale(1) contrast(1.2)`，並稱「與產品 `global.css` 同值」（不實）；
  design system `colors_and_type.css` 是 Warm 0.42 + `sepia(0.15) contrast(1.05)`、Ink 0.28 + `grayscale(1) contrast(1.3)`。README §1.1 已標⚠️待確認。
- **目前處置**（使用者裁決）：採 design system 那組（兩組中較濃者）。
- **請設計端**：把 17 決議紀錄 A 區的數值與說明改成 design system 那組。

### 0-H kit 的 transition 寫法無效

- **出處**：`tokens/ss-kit.css` 多處 `transition: background-color var(--transition-fast) ease`。
- **問題**：`--transition-fast` 本身就是 `150ms ease`，展開後變成 `150ms ease ease`，整條宣告無效，過渡實際不會發生。
- **目前處置**：產品端的 `styles/ss-kit.css` 改成 `var(--transition-fast)` 不再接 `ease`。
- **請設計端**：修正 design system 的 kit 原檔。

### 0-I 浮動軌 R2 對「多則 toast 堆疊」沒定義

- **出處**：`specs/04-global-chrome/spec-function.md` §6.2 R2「toast 在 push 的那一刻取最低的空格，然後在整個生命週期內不再移動」
- **問題**：規則是以「一則 toast」寫的，但 toast 是堆疊。第二則 push 時軌況可能已不同（例如泡泡被拖走、視窗打開），
  若每則各自取格，同一個堆疊會被拆成高低兩截；而堆疊本身由下往上長，新的一則進來時舊的本來就會上移。
- **目前處置**：落點以**堆疊**為單位——堆疊從空變成有的那一刻決定 `bottom`，到堆疊清空前都不變；堆疊內照舊由下往上排。
- **請設計端**：確認，或給多則堆疊時的規則。

### 0-J 「泡泡在軌」沒有判準

- **出處**：spec-function §6.2 R2、§6.3 狀態表的「泡泡在軌／泡泡拖離軌」
- **問題**：泡泡可自由拖曳到任意座標，稿上沒定義拖多遠才算「離軌」。
- **目前處置**：泡泡與 toast 欄（右側 340 寬）**水平相交**、且位於**格 2（bottom 88）以下**才算在軌；其餘都算離軌、釋放格 1。
- **請設計端**：確認判準。

### 0-K 側欄浮層「hover 展開」與「tooltip 是收合態唯一標籤」互斥

- **出處**：`README.md` §1.2「浮層 180px：hover／點擊展開」；`ds-cards/preview/components-tooltip.html` 與 README §1.2「Tooltip：收合態的唯一標籤來源」
- **問題**：若 hover 整條側欄就展開成浮層，收合態的 tooltip 永遠出不來；兩條無法同時成立。
- **目前處置**：只有游標停在頂部「展開側欄」鈕上 200ms 才進浮層；離開側欄、按 Esc、點任一項即收回。
  點該鈕：收合 → 釘選；浮層／釘選 → 收合。浮層沒有獨立的「點擊展開」入口。
- **請設計端**：確認觸發方式，或給定案。

### 0-L 書籍群格子的 hover／active 底色與群底同色

- **出處**：README §1.2 格子「hover 底 `--bg-tertiary`、active 底 `--bg-tertiary`」；同節書籍群九格底色也是 `--bg-tertiary`；`design/LibraryRail.dc.html` 同。
- **問題**：書籍群裡的格子 hover／active 疊在同色底上看不出來；Ink 下 active 只剩字色，違反 C1（狀態不得只靠色相）。
- **目前處置**：只在書籍群內，格子 hover／active 改用 `--bg-secondary`（比群底淺一階）。
- **請設計端**：確認，或給書籍群內的定案值。

### 0-M 矮視窗溢出選單沒畫

- **出處**：README §1.2「高度 < 632px 時，系統群收進底部溢出選單」——只有這一句。
- **問題**：選單外觀、觸發鈕、徽章去向、是否只在書籍層生效，稿上都沒有。
- **目前處置**：
  - 只在書籍層生效（應用層七格不會超高）。
  - 底部 `…` 鈕，點開往右上長出選單：`--bg-secondary` 底、卡片邊框、`--shadow-lg`，各列顯示標籤（同展開態列形）。
  - 任務徽章只在選單內的任務中心列顯示；`…` 鈕本身沒有徽章，所以選單未開時看不到任務數。
  - `…` 鈕目前**沒有可存取名稱**（需新字串，見產品端待裁決）。
- **請設計端**：畫出溢出選單，並決定徽章是否要冒到 `…` 鈕上。

### 0-N 任務中心的幾個尺寸與 Ink 陰影

- **出處**：README §1.4、§1.7、§2.4；`ds-cards/preview/components-rows.html`；17 決議紀錄 C 區
- **問題與目前處置**：
  - 收尾 chevron：§1.4 寫 14px「永遠佔位」，§2.4／規格卡寫 12px 收尾槽 → 槽 12px、chevron 14px 置中。
  - TaskRow 標題：§1.4 寫 sm 500，規格卡動作列是 xs 500 → 依 §2.4「TaskRow 照 17 稿」用 sm。
  - 面板外框：§1.4 寫 `--card-*` 形狀，但面板是貼右緣的整高側板，加圓角會在視窗邊切角 → 只套邊框寬度、不加圓角。
  - 陰影：§1.4 寫 `--shadow-md`，§1.7 寫 Ink「無陰影」，但 Ink 的 `--shadow-md` 不是 none → 兩主題都 `--shadow-md`。
  - 已完成列 `opacity .92`：只在舊線框出現，README 與規格卡都沒寫 → 保留現況。
  - `awaiting_review` 狀態點是否脈動：稿上沒說 → 維持現況（所有未終態都脈動）。
- **請設計端**：逐項確認；特別是 Ink 下面板要不要陰影。

### 0-O 聊天新對話確認的遮罩值

- **出處**：README §1.6 與 17 決議紀錄 F 區 G13 寫 `rgba(0,0,0,0.3)`；`ds-cards/preview/components-dialog.html` 與 README §2.5 寫「遮罩單一種」Warm `rgba(42,38,32,.40)`／Ink `rgba(0,0,0,.40)`。
- **目前處置**：用共用 `--scrim`（規格卡權威較高，且 §2.5 明說只有一種）。Warm 下略深、偏暖。
- **請設計端**：確認視窗內覆蓋也適用「單一遮罩」，並改 G13。

### 0-P 聊天輸入框與共用輸入框規格不同

- **出處**：`ds-cards/preview/components-inputs.html`（README §2.7）字 xs、底 `--input-bg`（＝`--bg-primary`）；17 決議紀錄 F 區 G12 畫的是 sm、底 `--bg-secondary`。
- **目前處置**：字級與底色照 G12（sm＋`--bg-secondary`，否則輸入框與視窗同色、失去層次）；邊框、圓角、內距、placeholder、焦點環照規格卡。
- **請設計端**：二選一，或把聊天輸入列定為具名例外。
